import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { API, STUDIO, SCOPES, validateInput, validateHandoff, acceptance, execute } from './gateway-public-acceptance.mjs';
// Non-cryptographic fixture strings only. Never sent to a network or used as users.
const credential = role => `fixture.${Buffer.from(JSON.stringify({ role, exp: 9999999999 })).toString('base64url')}.fixture`;
const input = () => ({ version: 1, expectedCaddySha256: 'a'.repeat(64), anonKey: credential('anon'), legacyServiceRoleKey: credential('service_role'), scopedTokens: Object.fromEntries(SCOPES.map(([role]) => [role, credential(role)])) });
const DENIAL = 'Central identity endpoint required';
test('only reviewed existing role classes, complete inventory, unexpired values and exact input shape', () => {
  validateInput(input());
  for (const mutate of [x => x.privateSigningKey = 'forbidden', x => x.scopedTokens.kestrek_backend = credential('authenticated'), x => delete x.scopedTokens.odonto_backend, x => x.anonKey = credential('service_role'), x => x.expectedCaddySha256 = 'wrong']) {
    const value = input(); mutate(value); assert.throws(() => validateInput(value));
  }
});
test('no POST, credentials, or further traffic when read-only propagation sentinel fails', async () => {
  const calls = [];
  await assert.rejects(acceptance(input(), { preflight: () => {}, request: async (url, options) => { calls.push([url, options]); return new Response('{}', { status: 200 }); } }));
  assert.equal(calls.length, 1); assert.equal(calls[0][1].method, 'GET'); assert.deepEqual(calls[0][1].headers, {});
  await assert.rejects(acceptance(input(), { request: () => { throw Error('Network must not run'); } }), /preflight/);
  let requested = false;
  await assert.rejects(acceptance(input(), { preflight: () => { throw Error('Tunnel not applied'); }, request: () => { requested = true; } }), /Tunnel not applied/);
  assert.equal(requested, false);
});
test('full matrix uses fixed hosts, empty unauthenticated mutation bodies and zero-row data checks', async () => {
  const calls = [], output = []; let preflights = 0;
  const result = await acceptance(input(), { preflight: () => { preflights++; }, emit: row => output.push(row), request: async (url, options) => {
    calls.push([url, options]); const parsed = new URL(url);
    assert.ok([API, STUDIO].includes(parsed.origin)); assert.equal(options.redirect, 'manual');
    assert.ok(!url.includes('fixture')); // Credentials never go in URLs/logs.
    if (parsed.origin === STUDIO) return new Response(null, { status: 302, headers: { Location: 'https://example.cloudflareaccess.com/cdn-cgi/access/login/sam-studio.developed162.bid?token=not-printed' } });
    if (parsed.pathname.includes('.well-known')) return Response.json(parsed.pathname.endsWith('jwks.json') ? { keys: [{ kty: 'RSA', n: 'public', e: 'AQAB' }] } : { issuer: API + '/auth/v1', authorization_endpoint: API + '/auth/v1/oauth/authorize', token_endpoint: API + '/auth/v1/oauth/token' });
    if (parsed.pathname.startsWith('/rest/v1/') && options.method === 'HEAD') {
      assert.equal(options.method, 'HEAD'); assert.equal(parsed.searchParams.get('limit'), '0'); assert.equal(parsed.searchParams.get('select'), 'id');
      const role = JSON.parse(Buffer.from(options.headers.Authorization.split('.')[1], 'base64url')).role;
      const own = SCOPES.find(([candidate]) => role === candidate)[1] === options.headers['Accept-Profile'];
      assert.equal(parsed.pathname, '/rest/v1/' + SCOPES.find(([, schema]) => schema === options.headers['Accept-Profile'])[2]);
      return new Response(null, { status: own ? 200 : 403 });
    }
    if (parsed.pathname.startsWith('/rest/') || parsed.pathname.startsWith('/storage/')) return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    if (options.method !== 'GET') { assert.ok(['POST', 'PUT'].includes(options.method)); assert.equal(options.body, '{}'); assert.equal(options.headers.apikey, input().anonKey); assert.ok(!options.headers.Authorization); }
    return new Response(DENIAL, { status: 403 });
  } });
  assert.equal(preflights, 2); assert.equal(result.passed, calls.length); assert.equal(calls.length, 50);
  assert.equal(calls.filter(([, options]) => options.method === 'HEAD').length, 25);
  assert.ok(!JSON.stringify(output).includes('fixture') && !JSON.stringify(output).includes('not-printed'));
});
test('actual filter denial must be empty/no-store, not a coincidental upstream403', async () => {
  await assert.rejects(acceptance(input(), { preflight: () => {}, request: async url => {
    if (url.includes('.well-known')) return Response.json(url.endsWith('jwks.json') ? { keys: [{ kty: 'RSA' }] } : { issuer: API + '/auth/v1', authorization_endpoint: API + '/auth/v1/oauth/authorize', token_endpoint: API + '/auth/v1/oauth/token' });
    return new Response(url.includes('/rest/') ? '{"error":"not the filter"}' : DENIAL, { status: 403 });
  } }), /filter deny/);
});
test('metadata rejects private JWK material rather than reporting keys', async () => {
  await assert.rejects(acceptance(input(), { preflight: () => {}, request: async url => {
    if (url.endsWith('jwks.json')) return Response.json({ keys: [{ kty: 'RSA', d: 'must-never-be-public' }] });
    if (url.includes('.well-known')) return Response.json({ issuer: API + '/auth/v1', authorization_endpoint: API + '/auth/v1/oauth/authorize', token_endpoint: API + '/auth/v1/oauth/token' });
    return new Response(DENIAL, { status: 403 });
  } }), /public-only JWKS/);
});
test('tunnel update proof and exact canonical API/Studio/fallback topology are mandatory', () => {
  const value = input(), live = 'fixture Caddy'; value.expectedCaddySha256 = createHash('sha256').update(live).digest('hex');
  const desired = { ingress: [{ hostname: new URL(API).hostname, service: 'http://127.0.0.1:80' }, { hostname: new URL(STUDIO).hostname, service: 'http://127.0.0.1:8000' }, { service: 'http_status:404' }] };
  const hash = data => createHash('sha256').update(JSON.stringify(data, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)).digest('hex');
  const proof = { updated: true, previousVersion: 5, version: 6, configSha256: hash(desired) };
  validateHandoff(value, proof, desired, live);
  assert.throws(() => validateHandoff(value, { ...proof, updated: false }, desired, live));
  assert.throws(() => validateHandoff(value, proof, desired, live + 'changed'));
  const legacy = structuredClone(desired); legacy.ingress[0].service = 'http://127.0.0.1:8000';
  assert.throws(() => validateHandoff(value, { ...proof, configSha256: hash(legacy) }, legacy, live));
});
test('unprivileged CLI cannot open protected credentials or emit requests', { skip: process.getuid() === 0 }, async () => {
  await assert.rejects(execute('--verify-after-tunnel', '/not-opened'), /root post-tunnel/);
});
