import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { merge, replaceReviewedBlocks, verifyAdapted, adaptText, verifyCaddyState, sourceHash, caddyPid } from './browser-session-broker-routes.mjs';

const source = (await readFile(new URL('./public-supabase-site.Caddyfile', import.meta.url), 'utf8'))
  .replace('    import public-data-routes.Caddyfile', `    @data {\n      path /rest/*\n    }\n    handle @data {\n      reverse_proxy 127.0.0.1:3143\n    }`)
  + '\nhttp://www.developed.sk {\n root * /fixture\n handle /api/account/* {\n reverse_proxy 127.0.0.1:3140\n }\n file_server\n}\n';

test('pure transform modifies only token upstream and split userinfo, preserving all other source bytes', () => {
  const after = replaceReviewedBlocks(source);
  assert.equal(after.split('path /auth/v1/oauth/userinfo\n').length, 2);
  assert.match(after, /@oauth_token \{\n      method POST\n      path \/auth\/v1\/oauth\/token/);
  assert.match(after, /@oauth_userinfo \{\n      method GET HEAD\n      path \/auth\/v1\/oauth\/userinfo/);
  assert.equal(after.includes('127.0.0.1:3143'), true);
  assert.equal(after.endsWith(source.slice(source.indexOf('\nhttp://www.developed.sk'))), true);
  for (const value of [after, source.replace('method POST', 'method GET POST'), source.replace('path /auth/v1/oauth/token', 'path /auth/v1/oauth/*'), source + source]) assert.throws(() => replaceReviewedBlocks(value));
  assert.throws(() => merge(source));
});

test('actual Caddy full-AST proof permits exactly token/userinfo broker split and nothing else', () => {
  const before = adaptText(source), after = adaptText(replaceReviewedBlocks(source));
  assert.doesNotThrow(() => verifyAdapted(before, after));
  for (const mutate of [
    value => { value.apps.http.servers.srv0.listen.push(':81'); },
    value => { value.apps.http.servers.srv0.routes.at(-1).terminal = false; },
  ]) { const wrong = structuredClone(after); mutate(wrong); assert.throws(() => verifyAdapted(before, wrong)); }
  const wrongGroup = structuredClone(after);
  const findGroup = value => {
    if (!value || typeof value !== 'object') return false;
    if (value.group) { value.group = 'group999999'; return true; }
    return Object.values(value).some(item => Array.isArray(item) ? item.some(findGroup) : findGroup(item));
  };
  assert.equal(findGroup(wrongGroup), true);
  assert.throws(() => verifyAdapted(before, wrongGroup), 'Changed exclusivity grouping must be rejected');
  for (const [from, to] of [
    ['path /auth/v1/oauth/userinfo', 'path /auth/v1/oauth/userinfo*'],
    ['path /auth/v1/oauth/token', 'path /auth/v1/oauth/token /auth/v1/token'],
    ['method POST', 'method POST GET'],
    ['uri strip_prefix /auth/v1', 'uri strip_prefix /auth'],
    ['respond "Central identity endpoint required" 403', 'respond "Central identity endpoint required" 200'],
    ['127.0.0.1:3143', '127.0.0.1:8000'],
    ['www.developed.sk', 'test.developed.sk'],
  ]) assert.throws(() => verifyAdapted(before, adaptText(replaceReviewedBlocks(source).replace(from, to))), `${from} mutation rejected`);
});

test('AST proof rejects wrong issuer scope, duplicate issuer and protocol list drift', () => {
  for (const changed of [source.replace('sam-api.developed162.bid', 'other.invalid'), source.replace('method GET HEAD', 'method GET'), source.replace('/auth/v1/oauth/authorize ', '/auth/v1/user ')]) {
    assert.throws(() => verifyAdapted(adaptText(changed), adaptText(changed)));
  }
  const before = adaptText(source), after = adaptText(replaceReviewedBlocks(source));
  const issuer = before.apps.http.servers.srv0.routes.find(route => route.match?.[0]?.host?.includes('sam-api.developed162.bid'));
  before.apps.http.servers.srv0.routes.push(structuredClone(issuer));
  assert.throws(() => verifyAdapted(before, after));
});

test('read-only Caddy process baseline pins PID and healthy no-restart state', () => {
  const state = { MainPID: String(caddyPid), ActiveState: 'active', SubState: 'running', NRestarts: '0' };
  verifyCaddyState(state);
  for (const patch of [{ MainPID: '863' }, { NRestarts: '1' }, { ActiveState: 'inactive' }, { SubState: 'failed' }, { extra: true }]) assert.throws(() => verifyCaddyState({ ...state, ...patch }));
});

test('disposable Caddy routes only token/userinfo to broker; protocol reads, data and human routes stay isolated', { timeout: 20000 }, async () => {
  const seen = [];
  const make = kind => createServer((req, res) => {
    seen.push({ kind, method: req.method, path: req.url }); res.writeHead(200).end(kind);
  });
  const provider = make('provider'), broker = make('broker'), data = make('data'), reserve = createServer();
  const servers = [provider, broker, data, reserve];
  for (const server of servers) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); }
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const directory = await mkdtemp(join(tmpdir(), 'developed-broker-routes-'));
  let caddy;
  try {
    const candidate = replaceReviewedBlocks(source)
      .replace('http://sam-api.developed162.bid {', `http://sam-api.developed162.bid:${port} {\n bind 127.0.0.1`)
      .replace('http://www.developed.sk {', `http://www.developed.sk:${port} {\n bind 127.0.0.1`)
      .replaceAll('127.0.0.1:3141', `127.0.0.1:${provider.address().port}`)
      .replaceAll('127.0.0.1:3140', `127.0.0.1:${broker.address().port}`)
      .replaceAll('127.0.0.1:3143', `127.0.0.1:${data.address().port}`);
    assert.doesNotMatch(candidate, /127\.0\.0\.1:(3140|3141|3143)\b/, 'Fixture must never contact live listeners');
    const path = join(directory, 'Caddyfile');
    await writeFile(path, `{\n admin off\n persist_config off\n auto_https off\n}\n${candidate}`, { mode: 0o600 });
    caddy = spawn('/usr/bin/caddy', ['run', '--adapter', 'caddyfile', '--config', path], { stdio: 'ignore' });
    const probe = (path, method = 'GET', host = 'sam-api.developed162.bid') => new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, method, headers: { host } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      }); req.on('error', reject); req.end();
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await probe('/'); break; } catch { await new Promise(resolve => setTimeout(resolve, 20)); }
    }
    for (const [path, method] of [['/auth/v1/oauth/token', 'POST'], ['/auth/v1/oauth/userinfo', 'GET'], ['/auth/v1/oauth/userinfo', 'HEAD']]) {
      assert.equal(await probe(path, method), 200);
      assert.deepEqual(seen.at(-1), { kind: 'broker', method, path: path.slice('/auth/v1'.length) });
    }
    for (const path of ['/auth/v1/oauth/authorize', '/auth/v1/.well-known/openid-configuration', '/auth/v1/.well-known/jwks.json', '/auth/v1/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/auth/v1']) {
      for (const method of ['GET', 'HEAD']) { assert.equal(await probe(path, method), 200); assert.equal(seen.at(-1).kind, 'provider'); }
    }
    assert.equal(await probe('/rest/v1/fixture'), 200); assert.equal(seen.at(-1).kind, 'data');
    assert.equal(await probe('/api/account/session', 'GET', 'www.developed.sk'), 200);
    assert.deepEqual(seen.at(-1), { kind: 'broker', method: 'GET', path: '/api/account/session' });
    const count = seen.length;
    for (const [path, method] of [
      ['/auth/v1/oauth/token', 'GET'], ['/auth/v1/oauth/token', 'HEAD'], ['/auth/v1/oauth/userinfo', 'POST'],
      ['/auth/v1/oauth/token/extra', 'POST'], ['/auth/v1/oauth/userinfo/extra', 'GET'],
      ['/auth/v1/oauth/token%2fextra', 'POST'], ['/auth/v1/oauth/userinfo%2fextra', 'GET'],
      ['/auth/v1/token?grant_type=password', 'POST'], ['/auth/v1/user', 'PUT'], ['/auth/v1/admin/users', 'POST'],
      ['/auth/v1/oauth/authorizations/example/consent', 'POST'], ['/auth/v1/signup', 'POST'], ['/login', 'GET'],
    ]) assert.equal(await probe(path, method), 403, `${method} ${path}`);
    assert.equal(await probe('/auth/v1/oauth/token', 'POST', 'www.developed.sk'), 404);
    assert.equal(seen.length, count, 'Rejected paths must never reach provider or broker');
  } finally {
    if (caddy && caddy.exitCode === null) { caddy.kill('SIGTERM'); await once(caddy, 'exit'); }
    for (const server of [provider, broker, data]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await rm(directory, { recursive: true, force: true }); // Exact disposable test-owned directory only.
  }
});

test('opt-in live read-only proof checks pinned config, complete adapted equality, candidate validation and unchanged PID', { skip: process.env.BROWSER_BROKER_LIVE_READONLY !== '1' }, () => {
  const result = spawnSync('/usr/bin/sudo', ['-n', '/opt/developed-runtimes/node-v22.23.2/bin/node', new URL('./browser-session-broker-routes.mjs', import.meta.url).pathname, '--inspect'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, 'Live read-only proof failed; diagnostics withheld');
  const report = JSON.parse(result.stdout);
  assert.equal(report.sourceSha256, sourceHash); assert.equal(report.caddyPid, caddyPid);
  assert.equal(report.fullAdaptedProof, true); assert.equal(report.tokenAndUserinfoOnly, true); assert.equal(report.liveWrites, false);
  assert.match(report.candidateSha256, /^[a-f0-9]{64}$/);
});
