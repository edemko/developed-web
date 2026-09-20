import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

const source = await readFile(new URL('./portal-internal-routes.Caddyfile', import.meta.url), 'utf8');
test('internal-only source has exact methods/paths and no human/provider ingress', () => {
  assert.match(source, /host www\.developed\.sk/);
  assert.match(source, /method POST/);
  assert.match(source, /path \/api\/account\/internal\/session\/check \/api\/account\/internal\/user\/check\n/);
  assert.doesNotMatch(source, /path[^\n]*\*|\/oauth|\/login|\/register|header_up Authorization/);
});

test('real Caddy forwards only the two canonical POSTs; app authentication stays upstream', {
  skip: process.env.PORTAL_INTERNAL_CADDY_TEST !== '1', timeout: 20000,
}, async () => {
  const seen = [];
  const backend = createServer((req, res) => {
    seen.push({ method: req.method, path: req.url, headers: req.headers });
    res.writeHead(req.headers.authorization === 'Bearer fixture-app-key' ? 200 : 401).end();
  });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const directory = await mkdtemp(join(tmpdir(), 'developed-internal-ingress-'));
  let caddy;
  try {
    const snippet = source.replace('127.0.0.1:3140', `127.0.0.1:${backend.address().port}`);
    const config = `{\n admin off\n persist_config off\n auto_https off\n}\nhttp://www.developed.sk:${port}, http://test.developed.sk:${port} {\n bind 127.0.0.1\n ${snippet}\n respond "marketing-fixture" 404\n}\n`;
    assert.doesNotMatch(config, /127\.0\.0\.1:3140\b/);
    const file = join(directory, 'Caddyfile'); await writeFile(file, config, { mode: 0o600 });
    const validation = spawnSync('caddy', ['validate', '--adapter', 'caddyfile', '--config', file], { stdio: 'pipe' });
    assert.equal(validation.status, 0, 'Fixture validation failed');
    caddy = spawn('caddy', ['run', '--adapter', 'caddyfile', '--config', file], { stdio: 'ignore' });
    const probe = (path, method = 'GET', host = 'www.developed.sk', extra = {}) => new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, method, headers: { host, ...extra } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      }); req.on('error', reject); req.end();
    });
    for (let n = 0; n < 100; n++) {
      try { await probe('/'); break; } catch { await new Promise(resolve => setTimeout(resolve, 20)); }
    }
    for (const path of ['/api/account/internal/session/check', '/api/account/internal/user/check']) {
      assert.equal(await probe(path, 'POST'), 401);
      assert.equal(await probe(path, 'POST', 'www.developed.sk', { authorization: 'Bearer fixture-app-key', forwarded: 'spoof', 'x-real-ip': 'spoof', 'x-forwarded-for': 'spoof' }), 200);
      assert.equal(seen.at(-1).headers.forwarded, undefined);
      assert.equal(seen.at(-1).headers['x-real-ip'], undefined);
      assert.equal(seen.at(-1).headers['x-forwarded-for'], undefined);
      assert.equal(await probe(path, 'GET'), 404);
      assert.equal(await probe(path, 'POST', 'test.developed.sk'), 404);
    }
    const count = seen.length;
    for (const path of ['/login', '/register', '/apps', '/security', '/account/authorize', '/api/account/login', '/api/account/mfa/enroll', '/api/account/internal/user/check/extra', '/api/account/internal/user/check%2fextra', '/auth/v1/oauth/authorize']) {
      for (const method of ['GET', 'POST']) assert.equal(await probe(path, method), 404);
    }
    assert.equal(seen.length, count);
  } finally {
    if (caddy && caddy.exitCode === null) { caddy.kill('SIGTERM'); await once(caddy, 'exit'); }
    backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve));
    await rm(directory, { recursive: true, force: true }); // Exact disposable fixture, no live configuration.
  }
});
