import test from 'node:test';
import assert from 'node:assert/strict';
import { boundaryServer, publicDataAllowed } from './public-data-boundary.mjs';
const jwt = role => `fixture.${Buffer.from(JSON.stringify({ role, exp: 9999999999 })).toString('base64url')}.fixture`;
const anon = jwt('anon');
const request = (headers = {}, uri = '/rest/v1/topics', method = 'GET') => ({ method, uri, headers });

test('permits public/scoped credential classes only, upstream still verifies JWT and RLS', () => {
  for (const role of ['anon', 'authenticated', 'kestrek_backend', 'screentime_backend', 'vocabulum_backend', 'odonto_backend', 'otazkomat_backend', 'odonto_identity_web']) {
    assert.equal(publicDataAllowed(request({ apikey: anon, authorization: `Bearer ${jwt(role)}` }), anon), true);
  }
  for (const role of ['service_role', 'postgres', 'supabase_admin', 'authenticator', 'developed_accounts', 'unknown']) {
    assert.equal(publicDataAllowed(request({ apikey: anon, authorization: `Bearer ${jwt(role)}` }), anon), false);
  }
});
test('privileged apikey cannot bypass denial when bearer is absent or ordinary', () => {
  for (const headers of [{ apikey: jwt('service_role') }, { apikey: jwt('service_role'), authorization: `Bearer ${jwt('authenticated')}` },
    { apikey: [anon, jwt('service_role')] }, { apikey: `${anon}, ${jwt('service_role')}` }]) {
    assert.equal(publicDataAllowed(request(headers), anon), false);
  }
  assert.equal(publicDataAllowed(request({}, `/realtime/v1/websocket?apikey=${jwt('service_role')}`), anon), false);
  assert.equal(publicDataAllowed(request({}, `/realtime/v1/websocket?apikey=${anon}&apikey=${anon}`), anon), false);
  assert.equal(publicDataAllowed(request({}, `/realtime/v1/websocket?apikey=${anon}&access_token=${jwt('service_role')}`), anon), false);
});
test('rejects ambiguous, non-JWT and oversized bearer headers', () => {
  for (const value of ['', 'Basic secret', 'Bearer not-a-jwt', ['Bearer ' + anon], `Bearer ${anon}, Bearer ${anon}`, 'Bearer ' + 'a'.repeat(20000)]) {
    assert.equal(publicDataAllowed(request({ authorization: value }), anon), false);
  }
});
test('filter never approves auth, arbitrary URL, traversal or unknown service paths', () => {
  for (const uri of ['/auth/v1/user', '/functions/v1/privileged-function', '//elsewhere.invalid/rest/v1/x',
    'https://elsewhere.invalid/rest/v1/x', '/rest/v1/../../auth/v1/user', '/rest/v1/%2e%2e/%2e%2e/auth/v1/user',
    '/rest/v1/..%2f..%2fauth/v1/admin/users', '/rest/v1/%252e%252e%252fauth/v1/user', '/rest\\v1/x']) {
    assert.equal(publicDataAllowed(request({}, uri), anon), false);
  }
  assert.equal(publicDataAllowed(request({}, '/rest/v1/x', 'TRACE'), anon), false);
});
test('public objects/signed data capabilities retain their independent Storage verification', () => {
  assert.equal(publicDataAllowed(request({}, '/storage/v1/object/public/airsoft-photos/picture.png'), anon), true);
  assert.equal(publicDataAllowed(request({}, '/storage/v1/object/sign/study-materials/doc.pdf?token=storage-capability'), anon), true);
});
test('alternate Storage S3/vector and SigV4 credential paths are denied', () => {
  for (const uri of ['/storage/v1/s3', '/storage/v1/s3/study-materials/a', '/storage/v1/%73%33/bucket',
    '/storage/v1/vector/index', '/storage/v1/vector', '/storage/v1/object/bucket/a?X-Amz-Security-Token=fixture']) {
    assert.equal(publicDataAllowed(request({}, uri), anon), false);
  }
  assert.equal(publicDataAllowed(request({ 'x-amz-security-token': jwt('service_role') }, '/storage/v1/object/a'), anon), false);
});
test('startup refuses a platform administrator key instead of anon', () => {
  assert.throws(() => boundaryServer(jwt('service_role')));
  assert.throws(() => boundaryServer('invalid'));
});
test('real listener fails closed on missing proxy metadata and never reflects credentials', async () => {
  const server = boundaryServer(anon);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + '/check')).status, 403);
    const headers = { 'x-forwarded-method': 'GET', 'x-forwarded-uri': '/rest/v1/topics', apikey: anon };
    assert.equal((await fetch(base + '/check', { headers })).status, 204);
    const denied = await fetch(base + '/check', { headers: { ...headers, authorization: 'Bearer ' + jwt('service_role') } });
    assert.equal(denied.status, 403); assert.equal(await denied.text(), '');
    assert.equal((await fetch(base + '/healthz')).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
