import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { merge, pauseMcp, mcpPause, mcpPauseEnd, verifyPauseAdapted, verifyAdapted, verifyMcpSwitchProof, adapt, execute } from './install-product-routes.mjs';
test('unreviewed source and non-root execution fail closed', () => {
  assert.throws(() => merge('unreviewed'), /Serving source drift/);
  if (process.getuid() !== 0) assert.throws(() => execute('--stage'), /Only reviewed root/);
});
test('final route switch requires the exact completed MCP copy proof', () => {
  const hash = 'a'.repeat(64), pausedHash = 'b'.repeat(64);
  const proof = { completed: true, pausedCaddySha256: pausedHash, oldPid: 1282853, candidateUid: 982, candidateUnit: 'developed-kestrek@1c102674a293.service', candidatePid: 12345, oldSha256: hash, newSha256: hash };
  verifyMcpSwitchProof(proof, pausedHash);
  for (const change of [{ completed: false }, { pausedCaddySha256: hash }, { oldPid: 1 }, { candidateUid: 1000 }, { candidatePid: 0 }, { candidateUnit: 'other.service' }, { newSha256: pausedHash }]) assert.throws(() => verifyMcpSwitchProof({ ...proof, ...change }, pausedHash));
});
test('read-only current candidate changes exact app routes and nothing else', { skip: process.env.PRODUCT_ROUTES_CURRENT_TEST !== '1' }, () => {
  const original = readFileSync('/etc/caddy/Caddyfile', 'utf8'), paused = pauseMcp(original), candidate = merge(original);
  const directory = mkdtempSync(join(tmpdir(), 'developed-product-routes-test-'));
  try {
    writeFileSync(join(directory, 'original.Caddyfile'), original, { mode: 0o600 });
    writeFileSync(join(directory, 'paused.Caddyfile'), paused, { mode: 0o600 });
    writeFileSync(join(directory, 'candidate.Caddyfile'), candidate, { mode: 0o600 });
    const before = adapt(join(directory, 'original.Caddyfile')), after = adapt(join(directory, 'candidate.Caddyfile'));
    verifyAdapted(before, after);
    verifyPauseAdapted(before, adapt(join(directory, 'paused.Caddyfile')));
    assert.equal(paused.replace(mcpPause, '').replace(mcpPauseEnd, ''), original);
    assert.ok(!candidate.includes('DEVELOPED MCP OAUTH PAUSE'));
    const tampered = structuredClone(after); Object.values(tampered.apps.http.servers)[0].listen = [':18888'];
    assert.throws(() => verifyAdapted(before, tampered), /Unrelated adapted configuration changed/);
    assert.throws(() => merge(candidate), /Serving source drift/);
    assert.equal(readFileSync('/etc/caddy/Caddyfile', 'utf8'), original);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('real Caddy pauses all OAuth methods/case/escaped forms; finance and MCP data survive', {
  skip: process.env.PRODUCT_ROUTES_CADDY_TEST !== '1', timeout: 20000,
}, async () => {
  const seen = [];
  const backend = createServer((req, res) => { seen.push(req.url); res.writeHead(200).end('fixture'); });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const directory = mkdtempSync(join(tmpdir(), 'developed-mcp-pause-test-'));
  let caddy;
  try {
    const file = join(directory, 'fixture.Caddyfile');
    writeFileSync(file, `{\n admin off\n persist_config off\n auto_https off\n}\nhttp://kestrek.sk:${port}, http://test.kestrek.sk:${port} {\n bind 127.0.0.1\n${mcpPause}\n handle /api/* {\n reverse_proxy 127.0.0.1:${backend.address().port}\n }\n handle {\n respond "static" 200\n }\n${mcpPauseEnd}\n}\nhttp://other.fixture:${port} {\n bind 127.0.0.1\n respond "other" 201\n}\n`, { mode: 0o600 });
    adapt(file);
    caddy = spawn('/usr/bin/caddy', ['run', '--adapter', 'caddyfile', '--config', file], { stdio: 'ignore' });
    const probe = (path, method = 'GET', host = 'kestrek.sk') => new Promise((resolve, reject) => {
      const q = request({ hostname: '127.0.0.1', port, path, method, headers: { host } }, r => { r.resume(); r.on('end', () => resolve({ status: r.statusCode, retry: r.headers['retry-after'], cache: r.headers['cache-control'] })); });
      q.on('error', reject); q.end();
    });
    for (let i = 0; i < 100; i++) { try { await probe('/'); break; } catch { await new Promise(resolve => setTimeout(resolve, 20)); } }
    for (const host of ['kestrek.sk', 'test.kestrek.sk']) for (const path of [
      '/api/integrations/mcp/oauth', '/api/integrations/mcp/oauth/token',
      '/API/INTEGRATIONS/MCP/OAUTH/register', '/api/integrations/mcp/OaUtH/revoke',
      '/api/integrations/mcp/%6f%61uth/token', '/api/integrations/mcp/oauth%2ftoken',
      '/api%2fintegrations%2fmcp%2foauth/token',
    ]) for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
      assert.deepEqual(await probe(path, method, host), { status: 503, retry: '60', cache: 'no-store' });
    }
    assert.equal(seen.length, 0, 'Paused routes must not reach any upstream');
    for (const host of ['kestrek.sk', 'test.kestrek.sk']) for (const path of ['/api/transactions', '/api/integrations/mcp', '/api/integrations/mcp/oauth-suffix']) {
      assert.equal((await probe(path, 'POST', host)).status, 200);
    }
    assert.equal(seen.length, 6);
    assert.equal((await probe('/api/integrations/mcp/oauth/token', 'POST', 'other.fixture')).status, 201);
  } finally {
    if (caddy && caddy.exitCode === null) { caddy.kill('SIGTERM'); await once(caddy, 'exit'); }
    backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve));
    rmSync(directory, { recursive: true, force: true }); // Exact disposable fixture only.
  }
});
