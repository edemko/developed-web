import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { boundaryServer } from './public-data-boundary.mjs';

const jwt = role => `fixture.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.fixture`;
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
const source = name => readFile(new URL(name, import.meta.url), 'utf8');

test('complete public gateway closes identity bypasses and canonical portal preserves other hosts', {
  skip: process.env.PUBLIC_SUPABASE_CADDY_TEST !== '1',
}, async () => {
  const seen = [], metadata = [];
  const mock = kind => createServer((req, res) => {
    seen.push({ kind, method: req.method, url: req.url });
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ kind, url: req.url }));
  });
  const provider = mock('provider'), data = mock('data'), portal = mock('portal');
  const anon = jwt('anon'), privileged = jwt('service_role'), guard = boundaryServer(anon);
  guard.on('request', req => metadata.push({ method: req.headers['x-forwarded-method'], uri: req.headers['x-forwarded-uri'] }));
  const providerPort = await listen(provider), dataPort = await listen(data);
  const portalPort = await listen(portal), guardPort = await listen(guard);
  const reserve = createServer(), proxyPort = await listen(reserve);
  await close(reserve);
  const directory = await mkdtemp(join(tmpdir(), 'developed-public-gateway-'));
  let caddy;
  try {
    let site = (await source('./public-supabase-site.Caddyfile'))
      .replace('http://sam-api.developed162.bid {', `http://sam-api.developed162.bid:${proxyPort} {\n bind 127.0.0.1`)
      .replaceAll('127.0.0.1:3141', `127.0.0.1:${providerPort}`);
    const routes = (await source('./public-data-routes.Caddyfile'))
      .replaceAll('127.0.0.1:3143', `127.0.0.1:${guardPort}`)
      .replaceAll('127.0.0.1:8000', `127.0.0.1:${dataPort}`);
    const portalRoutes = (await source('./portal-routes.Caddyfile'))
      .replaceAll('127.0.0.1:3140', `127.0.0.1:${portalPort}`);
    const canonical = await source('./portal-canonical-routes.Caddyfile');
    const file = join(directory, 'Caddyfile');
    const config = `{\n admin off\n persist_config off\n auto_https off\n}\n${site}\nhttp://www.developed.sk:${proxyPort}, http://test.developed.sk:${proxyPort} {\n bind 127.0.0.1\n import portal-canonical-routes.Caddyfile\n respond "marketing-fixture" 200\n}\n`;
    for (const text of [config, routes, portalRoutes]) assert.doesNotMatch(text, /127\.0\.0\.1:(3140|3141|3143|8000)\b/, 'fixture never contacts production listeners');
    await Promise.all([
      writeFile(file, config, { mode: 0o600 }),
      writeFile(join(directory, 'public-data-routes.Caddyfile'), routes, { mode: 0o600 }),
      writeFile(join(directory, 'portal-routes.Caddyfile'), portalRoutes, { mode: 0o600 }),
      writeFile(join(directory, 'portal-canonical-routes.Caddyfile'), canonical, { mode: 0o600 }),
    ]);
    const check = spawnSync('caddy', ['validate', '--adapter', 'caddyfile', '--config', file], { stdio: 'pipe' });
    assert.equal(check.status, 0, check.stderr?.toString());
    caddy = spawn('caddy', ['run', '--adapter', 'caddyfile', '--config', file], { stdio: 'ignore' });
    const base = `http://127.0.0.1:${proxyPort}`;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await fetch(base); break; } catch { await new Promise(resolve => setTimeout(resolve, 20)); }
    }
    const request = (path, options = {}, host = 'sam-api.developed162.bid') => new Promise((resolve, reject) => {
      const req = httpRequest(base + path, { method: options.method || 'GET', headers: { host, ...options.headers } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode, text: async () => body, json: async () => JSON.parse(body) });
        });
      });
      req.on('error', reject);
      req.end(options.body);
    });
    for (const path of ['/.well-known/openid-configuration', '/.well-known/jwks.json', '/.well-known/oauth-authorization-server', '/oauth/authorize', '/oauth/userinfo']) {
      for (const method of ['GET', 'HEAD']) {
        assert.equal((await request('/auth/v1' + path, { method })).status, 200);
        assert.deepEqual(seen.at(-1), { kind: 'provider', method, url: path });
      }
    }
    assert.equal((await request('/auth/v1/oauth/token', { method: 'POST', body: 'grant_type=authorization_code' })).status, 200);
    assert.deepEqual(seen.at(-1), { kind: 'provider', method: 'POST', url: '/oauth/token' });
    assert.equal((await request('/.well-known/oauth-authorization-server/auth/v1')).status, 200);
    assert.equal(seen.at(-1).url, '/.well-known/oauth-authorization-server');
    const protocolCount = seen.length;
    for (const [method, path] of [
      ['POST', '/auth/v1/token?grant_type=password'], ['POST', '/auth/v1/signup'],
      ['POST', '/auth/v1/recover'], ['PUT', '/auth/v1/user'], ['GET', '/auth/v1/user'],
      ['POST', '/auth/v1/oauth/authorizations/example/consent'], ['POST', '/auth/v1/admin/users'],
      ['GET', '/auth/v1/verify'], ['GET', '/auth/v1/callback'], ['GET', '/auth/v1/authorize'],
      ['GET', '/auth/v1/sso/saml/metadata'], ['POST', '/auth/v1/factors'],
      ['GET', '/auth/v1/oauth/token'], ['POST', '/auth/v1/oauth/authorize'],
      ['GET', '/auth/v1/oauth/authorize/extra'], ['GET', '/auth/v1/oauth/authorize%2fextra'],
      ['POST', '/graphql/v1'], ['GET', '/functions/v1/example'], ['GET', '/pg/'],
      ['GET', '/api/mcp'], ['GET', '/mcp'], ['GET', '/'],
    ]) {
      assert.equal((await request(path, { method, headers: { apikey: privileged, authorization: 'Bearer ' + privileged } })).status, 403, `${method} ${path}`);
    }
    assert.equal(seen.length, protocolCount, 'denied identity paths never reach either upstream');
    const valid = { apikey: anon, authorization: 'Bearer ' + jwt('authenticated') };
    for (const path of ['/rest/v1/topics', '/storage/v1/object/public/fixture/a', '/realtime/v1/api/broadcast']) {
      assert.equal((await request(path, { headers: valid })).status, 200);
      assert.equal(seen.at(-1).kind, 'data');
    }
    const dataCount = seen.length;
    for (const [path, headers] of [
      ['/rest/v1/topics', { apikey: privileged }],
      ['/rest/v1/topics', { ...valid, authorization: 'Bearer ' + privileged }],
      ['/rest/v1/topics', { ...valid, authorization: 'Bearer ' + privileged, 'x-forwarded-method': 'OPTIONS', 'x-forwarded-uri': '/storage/v1/object/public/fixture/a' }],
      ['/rest/v1/topics?apikey=' + privileged, {}],
      ['/realtime/v1/websocket?access_token=' + privileged, {}],
      ['/storage/v1/s3/bucket/key', valid], ['/storage/v1/vector/list', valid],
    ]) assert.equal((await request(path, { headers })).status, 403, path);
    assert.equal(seen.length, dataCount, 'privileged data requests never reach data upstream');
    assert.ok(metadata.some(x => x.method === 'GET' && x.uri === '/rest/v1/topics'));
    assert.ok(!metadata.some(x => x.method === 'OPTIONS'), 'spoofed method overwritten');
    assert.equal((await request('/storage/v1/object/sign/fixture/a?token=fixture-capability')).status, 200);
    for (const path of ['/login', '/api/account/internal/check', '/security', '/apps']) {
      assert.equal((await (await request(path, {}, 'www.developed.sk')).json()).kind, 'portal');
      assert.equal(await (await request(path, {}, 'test.developed.sk')).text(), 'marketing-fixture');
    }
    assert.equal(await (await request('/', {}, 'www.developed.sk')).text(), 'marketing-fixture');
    assert.equal((await (await request('/', { headers: { cookie: '__Host-developed_session=fixture' } }, 'www.developed.sk')).json()).kind, 'portal');
    assert.equal(await (await request('/', { headers: { cookie: '__Host-developed_session=fixture' } }, 'test.developed.sk')).text(), 'marketing-fixture');
    assert.equal(await (await request('/hooks/fixture-not-a-live-hook', {}, 'www.developed.sk')).text(), 'marketing-fixture');
  } finally {
    if (caddy && caddy.exitCode === null) { caddy.kill('SIGTERM'); await new Promise(resolve => caddy.once('exit', resolve)); }
    await Promise.all([provider, data, portal, guard].map(close));
    await rm(directory, { recursive: true, force: true }); // Exact fixture-created directory only.
  }
});
