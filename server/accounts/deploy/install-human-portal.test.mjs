import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blocks, merge, adaptText, verifyAdapted, verifyApproval, sourceHash, sha } from './install-human-portal.mjs';

const snippets = {};
for (const [key, name] of [['internal', 'portal-internal-routes.Caddyfile'], ['canonical', 'portal-canonical-routes.Caddyfile'], ['public', 'portal-routes.Caddyfile']]) snippets[key] = await readFile(new URL(name, import.meta.url), 'utf8');
const { old, next } = blocks(snippets);
const fixture = block => `http://www.developed.sk, http://test.developed.sk {${block}
root * /fixture
encode gzip
reverse_proxy /hooks/* 127.0.0.1:9999
file_server
}
http://sam-api.developed.sk {
respond "gateway-fixture" 403
}
http://developed.sk {
redir https://www.developed.sk{uri} 308
}
`;
test('only pinned source and three reviewed snippets accepted', () => {
  assert.throws(() => merge(fixture(old), snippets), /source drift/);
  for (const key of Object.keys(snippets)) assert.throws(() => blocks({ ...snippets, [key]: snippets[key] + '\n' }), /snippet changed/);
  assert.ok(next.includes('host www.developed.sk') && !next.includes('import portal-routes'));
});
test('approval requires exact artifact and both coordinator attestations', () => {
  const value = { candidateSha256: 'a'.repeat(64), humanPortalApproved: true, securityCutoverComplete: true };
  verifyApproval(value, value.candidateSha256);
  for (const key of ['humanPortalApproved', 'securityCutoverComplete']) assert.throws(() => verifyApproval({ ...value, [key]: false }, value.candidateSha256));
  assert.throws(() => verifyApproval(value, 'b'.repeat(64)));
  assert.throws(() => verifyApproval({ ...value, registrationOpen: true }, value.candidateSha256));
});
test('adaptation proves complete unaffected configuration and exact central contract', () => {
  const before = adaptText(fixture(old)), after = adaptText(fixture(next));
  verifyAdapted(before, after, snippets);
  for (const [from, to] of [['gateway-fixture', 'changed'], ['127.0.0.1:9999', '127.0.0.1:9998'], ['/fixture', '/wrong-root'], ['https://www.developed.sk', 'https://test.developed.sk'], ['host www.developed.sk', 'host test.developed.sk'], ['127.0.0.1:3140', '127.0.0.1:3141']]) {
    assert.throws(() => verifyAdapted(before, adaptText(fixture(next).replace(from, to)), snippets));
  }
});
test('intended product final artifact passes exact merge and full adapted comparison', { skip: process.env.HUMAN_PORTAL_FULL_SOURCE_TEST !== '1' }, async () => {
  // Read-only composition; neither imported operator entrypoint is executed.
  const { merge: productMerge } = await import('./install-product-routes.mjs');
  const current = await readFile('/etc/caddy/Caddyfile', 'utf8');
  const source = sha(current) === sourceHash ? current : productMerge(current);
  const candidate = merge(source, snippets);
  assert.equal(candidate.replace(next, old), source);
  verifyAdapted(adaptText(source), adaptText(candidate), snippets);
  for (const drift of [source + '\n', source.replace('sam-api', 'wrong-api'), source.replace(old, old + old)]) assert.throws(() => merge(drift, snippets));
});
test('real isolated Caddy preserves host, marketing, root/session, legal and internal boundaries', { skip: process.env.HUMAN_PORTAL_CADDY_TEST !== '1', timeout: 20000 }, async () => {
  const seen = [];
  const backend = createServer((req, res) => {
    seen.push({ path: req.url, method: req.method, headers: req.headers });
    res.setHeader('Cache-Control', 'private, no-store');
    if (['/', '/en/'].includes(req.url)) {
      if (req.headers.cookie === '__Host-developed_session=valid-fixture') return res.writeHead(303, { Location: '/apps' }).end();
      return res.end(req.url === '/en/' ? 'marketing-en' : 'marketing-sk');
    }
    res.writeHead(req.url.startsWith('/api/account/internal/') ? 401 : 200).end('account-fixture');
  });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const directory = await mkdtemp(join(tmpdir(), 'human-portal-fixture-')); let caddy;
  try {
    const block = next.replaceAll('127.0.0.1:3140', `127.0.0.1:${backend.address().port}`);
    const config = `{\nadmin off\npersist_config off\nauto_https off\n}\nhttp://www.developed.sk:${port}, http://test.developed.sk:${port} {\nbind 127.0.0.1\n${block}\nrespond / "marketing-sk" 200\nrespond /en/ "marketing-en" 200\nrespond /privacy "legal-fixture" 200\nrespond /hooks/* "hooks-fixture" 200\nrespond "static-404" 404\n}\nhttp://developed.sk:${port} {\nbind 127.0.0.1\nredir https://www.developed.sk{uri} 308\n}\n`;
    assert.ok(!config.includes('127.0.0.1:3140'));
    const path = join(directory, 'Caddyfile'); await writeFile(path, config, { mode: 0o600 });
    caddy = spawn('/usr/bin/caddy', ['run', '--adapter', 'caddyfile', '--config', path], { stdio: 'ignore' });
    const probe = (path, host = 'www.developed.sk', headers = {}, method = 'GET') => new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, method, headers: { host, ...headers } }, res => {
        let body = ''; res.on('data', data => { body += data; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }); req.on('error', reject); req.end();
    });
    for (let n = 0; n < 100; n++) { try { await probe('/'); break; } catch { await new Promise(resolve => setTimeout(resolve, 20)); } }
    for (const path of ['/', '/en/']) {
      const expected = path === '/' ? 'marketing-sk' : 'marketing-en';
      const count = seen.length; assert.equal((await probe(path)).body, expected); assert.equal(seen.length, count);
      assert.equal((await probe(path, 'www.developed.sk', { cookie: 'other__Host-developed_session=valid-fixture' })).body, expected); assert.equal(seen.length, count);
      assert.equal((await probe(path, 'www.developed.sk', { cookie: '__Host-developed_session=invalid-fixture' })).body, expected);
      const signed = await probe(path, 'www.developed.sk', { cookie: '__Host-developed_session=valid-fixture' });
      assert.equal(signed.status, 303); assert.equal(signed.headers.location, '/apps'); assert.equal(signed.headers['cache-control'], 'private, no-store');
      assert.equal((await probe(path, 'www.developed.sk', { cookie: '__Host-developed_session=valid-fixture' }, 'HEAD')).status, 303);
      const before = seen.length; await probe(path, 'www.developed.sk', { cookie: '__Host-developed_session=valid-fixture' }, 'POST'); assert.equal(seen.length, before);
    }
    for (const path of ['/login', '/register', '/apps', '/security', '/account/authorize', '/api/account/session', '/account-assets/app.js', '/admin/users', '/report-bug/odonto']) {
      assert.equal((await probe(path)).status, 200);
      const count = seen.length; assert.equal((await probe(path, 'test.developed.sk', { cookie: '__Host-developed_session=valid-fixture' })).status, 404); assert.equal(seen.length, count);
    }
    for (const path of ['/api/account/internal/session/check', '/api/account/internal/user/check']) {
      assert.equal((await probe(path, 'www.developed.sk', { forwarded: 'spoof', 'x-real-ip': 'spoof', 'x-forwarded-for': 'spoof' }, 'POST')).status, 401);
      for (const key of ['forwarded', 'x-real-ip', 'x-forwarded-for']) assert.equal(seen.at(-1).headers[key], undefined);
    }
    const count = seen.length;
    assert.equal((await probe('/privacy', 'www.developed.sk', { cookie: '__Host-developed_session=valid-fixture' })).body, 'legal-fixture');
    assert.equal((await probe('/hooks/fixture')).body, 'hooks-fixture');
    for (const path of ['/login/extra', '/login/', '/auth/v1/admin/users', '/api/accounting/session']) assert.equal((await probe(path)).status, 404);
    assert.equal((await probe('/', 'test.developed.sk', { cookie: '__Host-developed_session=valid-fixture' })).body, 'marketing-sk');
    assert.equal((await probe('/login', 'developed.sk')).status, 308); assert.equal(seen.length, count);
  } finally {
    if (caddy && caddy.exitCode === null) { caddy.kill('SIGTERM'); await once(caddy, 'exit'); }
    backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve));
    await rm(directory, { recursive: true, force: true }); // Only exact disposable fixture directory.
  }
});
