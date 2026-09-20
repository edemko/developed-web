import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

const directory = new URL('./vocabulum-vercel-retirement/', import.meta.url);
const artifact = JSON.parse(await readFile(new URL('config.json', directory), 'utf8'));
const canonical = 'https://vocabulum.developed.sk/auth/login#';

// A local interpreter for only the documented route features used here.
// This is not a Vercel router emulator or remote deployment acceptance.
function resolveRoute(method, path, host) {
  const pathname = new URL(path, 'http://fixture.invalid').pathname;
  return artifact.routes.find((route) =>
    new RegExp(route.src, route.caseSensitive ? '' : 'i').test(pathname)
    && (!route.methods || route.methods.includes(method))
    && (!route.has || route.has.every((condition) =>
      condition.type === 'host' && host === condition.value)));
}

test('artifact contains only static routing and no execution or environment surface', async () => {
  assert.deepEqual(Object.keys(artifact).sort(), ['routes', 'version']);
  assert.equal(artifact.version, 3);
  assert.deepEqual((await readdir(directory)).sort(), ['README.md', 'config.json']);
  for (const route of artifact.routes) {
    assert.ok(Object.keys(route).every((key) =>
      ['src', 'has', 'methods', 'status', 'headers'].includes(key)));
    assert.ok([303, 410].includes(route.status));
    assert.equal(route.headers['Cache-Control'], 'no-store');
    assert.equal(route.headers['Referrer-Policy'], 'no-referrer');
    assert.equal(route.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(route.headers['Content-Security-Policy'],
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    assert.ok(!Object.hasOwn(route.headers, 'Set-Cookie'));
    if (route.status === 303) {
      assert.deepEqual(route.methods, ['GET', 'HEAD']);
      assert.equal(route.headers.Location, canonical);
      assert.ok(route.headers.Location.endsWith('#'), 'clear inherited token fragments');
    } else {
      assert.ok(!Object.hasOwn(route.headers, 'Location'));
    }
  }
});

test('all methods on old protocol routes and canonical Vercel Host terminate', () => {
  const paths = [
    '/api', '/api/auth/providers', '/api/auth/session',
    '/api/auth/callback/developed?code=fixture-code&state=fixture-state',
    '/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/users',
    '/auth/callback?access_token=fixture-token', '/auth/logout',
    '/oauth/token', '/.well-known/openid-configuration',
    '/API/auth/providers', '/api/auth/callback/credentials',
  ];
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'PROPFIND']) {
    for (const path of paths) {
      assert.equal(resolveRoute(method, path, 'legacy.vercel.app').status, 410, `${method} ${path}`);
    }
    for (const path of ['/', '/auth/login', '/folders/example', ...paths]) {
      assert.equal(resolveRoute(method, path, 'vocabulum.developed.sk').status, 410);
    }
  }
});

test('all non-navigation methods fail closed on ordinary pages too', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE', 'PROPFIND']) {
    for (const path of ['/', '/login', '/register', '/auth/login', '/folders/example']) {
      const route = resolveRoute(method, path, 'legacy.vercel.app');
      assert.equal(route.status, 410);
      assert.ok(!route.headers.Location);
    }
  }
});

test('HTTP responses preserve fixed Location, no credential queries, and no cookies', async (t) => {
  const server = createServer((req, res) => {
    const route = resolveRoute(req.method, req.url, req.headers.host);
    res.writeHead(route?.status ?? 500, route?.headers ?? {});
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  async function probe(method, path, host = 'legacy.vercel.app') {
    return new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, method, path,
        headers: { Host: host, Cookie: 'old-session=fixture', Authorization: 'Bearer fixture' } }, (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
      });
      req.on('error', reject);
      req.end(method === 'POST' ? 'password=fixture-password' : undefined);
    });
  }
  for (const method of ['GET', 'HEAD']) {
    for (const path of ['/', '/auth/login', '/folders/example', '/reset-password']) {
      const res = await probe(method, `${path}?code=fixture-code&token=fixture-token&next=https://untrusted.invalid`);
      assert.equal(res.status, 303);
      assert.equal(res.headers.location, canonical);
      assert.equal(res.headers['referrer-policy'], 'no-referrer');
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.equal(res.headers['set-cookie'], undefined);
    }
  }
  for (const [method, path, host] of [
    ['POST', '/login', 'legacy.vercel.app'],
    ['GET', '/api/auth/session', 'legacy.vercel.app'],
    ['GET', '/auth/login', 'vocabulum.developed.sk'],
  ]) {
    const res = await probe(method, path, host);
    assert.equal(res.status, 410);
    assert.equal(res.headers.location, undefined);
    assert.equal(res.headers['set-cookie'], undefined);
  }
});
