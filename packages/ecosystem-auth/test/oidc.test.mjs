import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createOidcClient, safeReturnPath } from '../index.mjs';

const issuer = 'https://identity.example/auth/v1';
const redirectUri = 'https://music.example/auth/callback';
const clientId = randomUUID(), subject = randomUUID(), session = randomUUID();
async function fixture(overrides = {}) {
  const keys = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'test-signing-key', alg: 'ES256', use: 'sig' };
  const transactions = new Map();
  let transaction, hits = 0, issued;
  const store = {
    async create(id, value) { transactions.set(id, value); transaction = value; },
    async consume(id) { const value = transactions.get(id); transactions.delete(id); return value; },
  };
  const sign = (payload, aud) => new SignJWT(payload).setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
    .setIssuer(issuer).setAudience(aud).setSubject(subject).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
  const fetcher = async (url, options = {}) => {
    if (String(url).endsWith('/.well-known/jwks.json')) return Response.json({ keys: [jwk] });
    assert.equal(String(url), `${issuer}/oauth/token`);
    hits++;
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('client_id'), clientId);
    assert.equal(body.get('client_secret'), 'test-secret');
    if (body.get('grant_type') === 'authorization_code') {
      assert.equal(body.get('code_verifier'), transaction.verifier);
      assert.equal(body.get('redirect_uri'), redirectUri);
    }
    const access_token = await sign({ client_id: overrides.accessClient ?? clientId, session_id: session }, 'authenticated');
    const id_token = await sign({ nonce: overrides.nonce ?? transaction.nonce }, overrides.audience ?? clientId);
    issued = { access_token, token_type: 'bearer', expires_in: 300, refresh_token: 'server-only-refresh',
      ...(body.get('grant_type') === 'authorization_code' ? { id_token: overrides.idToken ?? id_token } : {}) };
    return Response.json(issued);
  };
  const client = createOidcClient({ issuer, clientId, clientSecret: 'test-secret', redirectUri, store, fetch: fetcher, ...overrides.config });
  return { client, transactions, hits: () => hits, issued: () => issued };
}
function callback(flow, state = new URL(flow.url).searchParams.get('state')) {
  return `${redirectUri}?code=single-use-code&state=${state}`;
}

test('local return paths reject external/encoded/protocol-relative targets', () => {
  for (const value of ['//evil.example', '/\\evil.example', '/%2fevil.example', '/%252fevil.example', 'https://evil.example', '/%0aLocation:evil', '/bad%zz', '/%255cevil']) assert.equal(safeReturnPath(value), '/');
  assert.equal(safeReturnPath('/library?query=%C4%8Daj#track'), '/library?query=%C4%8Daj#track');
});
test('starts standard code/S256 flow with private verifier and distinct random cookie', async () => {
  const f = await fixture();
  const first = await f.client.begin('/library');
  const second = await f.client.begin('/search');
  const url = new URL(first.url);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.ok(url.searchParams.get('nonce'));
  assert.ok(url.searchParams.get('state'));
  assert.equal(url.searchParams.has('code_verifier'), false);
  assert.notEqual(first.flowCookie, second.flowCookie);
  assert.equal(first.url.includes(first.flowCookie), false);
});
test('validates signed ID/access tokens and callback is single use', async () => {
  const f = await fixture();
  const flow = await f.client.begin('/library');
  const result = await f.client.complete(callback(flow), flow.flowCookie);
  assert.equal(result.identity.sub, subject);
  assert.equal(result.accessClaims.client_id, clientId);
  assert.equal(result.returnTo, '/library');
  await assert.rejects(f.client.complete(callback(flow), flow.flowCookie), /reused/);
  assert.equal(f.hits(), 1);
  const refreshed = await f.client.refresh(result.tokens.refresh_token, subject);
  assert.equal(refreshed.accessClaims.session_id, session);
});
test('callback concurrent replay has only one winner', async () => {
  const f = await fixture(), flow = await f.client.begin();
  const result = await Promise.allSettled([f.client.complete(callback(flow), flow.flowCookie), f.client.complete(callback(flow), flow.flowCookie)]);
  assert.equal(result.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(f.hits(), 1);
});
test('wrong/missing state, forged cookie, expiry and wrong callback fail closed', async () => {
  const f = await fixture();
  let flow = await f.client.begin();
  await assert.rejects(f.client.complete(callback(flow, 'wrong'), flow.flowCookie));
  assert.equal(f.hits(), 0);
  flow = await f.client.begin();
  await assert.rejects(f.client.complete(`${redirectUri}?code=x`, flow.flowCookie));
  flow = await f.client.begin();
  await assert.rejects(f.client.complete(callback(flow), 'X'.repeat(43)));
  await assert.rejects(f.client.complete(callback(flow).replace('music.example', 'evil.example'), flow.flowCookie));
  const old = await fixture({ config: { now: () => 1000 } });
  flow = await old.client.begin();
  for (const transaction of old.transactions.values()) transaction.expiresAt = 1000;
  await assert.rejects(old.client.complete(callback(flow), flow.flowCookie), /Expired/);
});
for (const [name, overrides] of [
  ['nonce', { nonce: 'wrong-nonce' }], ['audience', { audience: randomUUID() }],
  ['access client', { accessClient: randomUUID() }], ['signature', { idToken: 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJmb3JnZWQifQ.Zm9yZ2Vk' }],
]) test(`rejects wrong ${name}`, async () => {
  const f = await fixture(overrides), flow = await f.client.begin();
  await assert.rejects(f.client.complete(callback(flow), flow.flowCookie));
});
test('configuration rejects HTTP production and untrusted metadata endpoints', () => {
  const store = { create() {}, consume() {} };
  assert.throws(() => createOidcClient({ issuer: 'http://identity.example', redirectUri, clientId, clientSecret: 'x', store }));
  assert.throws(() => createOidcClient({ issuer, redirectUri, clientId, clientSecret: 'x', store, metadata: { issuer, authorization_endpoint: 'https://evil.example' } }));
});
