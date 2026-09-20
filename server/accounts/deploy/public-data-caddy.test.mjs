import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { boundaryServer } from './public-data-boundary.mjs';
const jwt = role => `fixture.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.fixture`;
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

test('real Caddy overwrites spoofed metadata and denies privileged data keys before upstream', { skip: process.env.DATA_BOUNDARY_CADDY_TEST !== '1' }, async () => {
  const anon = jwt('anon'), guard = boundaryServer(anon);
  const metadata = [];
  guard.on('request', req => metadata.push({ method: req.headers['x-forwarded-method'], uri: req.headers['x-forwarded-uri'] }));
  const seen = [];
  const upstream = createServer((req, res) => { seen.push(req.url); res.writeHead(200).end('fixture-data'); });
  const guardPort = await listen(guard), upstreamPort = await listen(upstream);
  const reserve = createServer(); const proxyPort = await listen(reserve);
  await new Promise(resolve => reserve.close(resolve));
  const directory = await mkdtemp(join(tmpdir(), 'developed-data-boundary-'));
  let caddy;
  try {
    const template = await readFile(new URL('./public-data-routes.Caddyfile', import.meta.url), 'utf8');
    const routes = template.replaceAll('127.0.0.1:3143', `127.0.0.1:${guardPort}`).replaceAll('127.0.0.1:8000', `127.0.0.1:${upstreamPort}`);
    assert.ok(!routes.includes(':8000') && !routes.includes(':3143'), 'never contact production listeners');
    const file = join(directory, 'Caddyfile');
    await writeFile(file, `{\n admin off\n persist_config off\n auto_https off\n}\nhttp://127.0.0.1:${proxyPort} {\n bind 127.0.0.1\n route {\n${routes}\n respond 403\n}\n}\n`, { mode: 0o600 });
    const checked = spawnSync('caddy', ['validate', '--adapter', 'caddyfile', '--config', file], { stdio: 'pipe' });
    assert.equal(checked.status, 0, checked.stderr?.toString());
    caddy = spawn('caddy', ['run', '--adapter', 'caddyfile', '--config', file], { stdio: 'ignore' });
    const base = `http://127.0.0.1:${proxyPort}`;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await fetch(base); break; } catch { await new Promise(resolve => setTimeout(resolve, 20)); }
    }
    const valid = { apikey: anon, authorization: 'Bearer ' + jwt('authenticated') };
    assert.equal((await fetch(base + '/rest/v1/topics', { headers: valid })).status, 200, JSON.stringify(metadata));
    assert.equal(seen.length, 1);
    for (const headers of [{ apikey: jwt('service_role') }, { ...valid, authorization: 'Bearer ' + jwt('service_role') },
      { ...valid, authorization: 'Bearer ' + jwt('service_role'), 'x-forwarded-uri': '/storage/v1/object/public/fixtures/a', 'x-forwarded-method': 'OPTIONS' }]) {
      assert.equal((await fetch(base + '/rest/v1/topics', { headers })).status, 403);
    }
    assert.equal((await fetch(base + '/auth/v1/admin/users', { headers: { ...valid, 'x-forwarded-uri': '/rest/v1/topics' } })).status, 403);
    assert.equal(seen.length, 1);
    assert.equal((await fetch(base + '/storage/v1/object/sign/fixture/a?token=signed-fixture-capability')).status, 200);
  } finally {
    if (caddy && caddy.exitCode === null) { caddy.kill('SIGTERM'); await new Promise(resolve => caddy.once('exit', resolve)); }
    await Promise.all([new Promise(resolve => guard.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
    await rm(directory, { recursive: true, force: true }); // Exact test-created temp directory only.
  }
});
