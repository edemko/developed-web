import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { oauthBroker, tokenRequest } from '../dist/oauth-broker.js';
import { Provider } from '../dist/provider.js';
import { HttpError } from '../dist/security.js';

const client = '17064340-5563-4ca0-b7f3-cf44c6af7001';
const input = { grant_type: 'authorization_code', client_id: client, client_secret: 'fixture-secret',
  code: 'fixture-code', code_verifier: 'v'.repeat(43), redirect_uri: 'https://fixture.invalid/callback' };
const formType = 'application/x-www-form-urlencoded';
test('broker parses bounded standard form/JSON grants and rejects ambiguous credentials', () => {
  for (const [type, raw] of [[formType, new URLSearchParams(input).toString()], ['application/json', JSON.stringify(input)]]) {
    const parsed = tokenRequest(type, raw); assert.equal(parsed.clientId, client); assert.equal(parsed.grant, 'authorization_code');
  }
  const basic = `Basic ${Buffer.from(`${client}:fixture-secret`).toString('base64')}`;
  const basicInput = { ...input }; delete basicInput.client_secret;
  assert.equal(tokenRequest(formType, new URLSearchParams(basicInput).toString(), basic).authorization, basic);
  for (const [type, raw, auth] of [
    [formType, new URLSearchParams(input) + '&client_id=' + client],
    [formType, new URLSearchParams({ ...input, redirect_to: 'https://evil.invalid' }).toString()],
    ['text/plain', JSON.stringify(input)], ['application/json', '[]'],
    ['application/json', JSON.stringify({ ...input, client_id: [client] })],
    [formType, new URLSearchParams({ ...input, grant_type: 'password' }).toString()],
    [formType, new URLSearchParams({ ...input, code_verifier: 'short' }).toString()],
    [formType, new URLSearchParams({ ...input, refresh_token: 'wrong-grant' }).toString()],
    [formType, new URLSearchParams(input).toString(), basic],
    [formType, new URLSearchParams(input).toString(), 'Bearer fixture-token'],
  ]) assert.throws(() => tokenRequest(type, raw, auth));
  assert.equal(tokenRequest(formType, new URLSearchParams({ grant_type: 'refresh_token', client_id: client, refresh_token: 'opaque' }).toString()).grant, 'refresh_token');
});

test('OAuth provider transport never forwards central administrator key or browser cookies', async () => {
  let captured;
  const provider = new Provider('https://provider.invalid', 'central-administrator-key', async (_url, init) => {
    captured = init; return Response.json({});
  });
  await provider.exchangeOAuth(new URLSearchParams(input));
  assert.deepEqual(captured.headers, { 'Content-Type': formType });
  assert.equal(captured.redirect, 'error');
  assert.ok(!JSON.stringify(captured).includes('central-administrator-key'));
});

test('broker returns tokens only after binding commit and denies revoked refresh/userinfo without cookies', async t => {
  const calls = []; let denied = false, upstreamFailure = false;
  const tokens = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600 };
  const accounts = {
    db: { limit: async () => {} },
    appForClient: async id => { assert.equal(id, client); return {}; },
    provider: {
      exchangeOAuth: async () => { calls.push('exchange'); return upstreamFailure
        ? Response.json({ private: 'must-not-escape' }, { status: 400 }) : Response.json(tokens); },
      call: async (path, method, body, bearer) => {
        assert.equal(path, '/oauth/userinfo'); assert.equal(bearer, tokens.access_token);
        calls.push('userinfo'); return { sub: 'fixture-user' };
      },
    },
    finalizeOAuthCode: async (code, access, clientId) => {
      assert.equal(code, input.code); assert.equal(access, tokens.access_token); assert.equal(clientId, client);
      calls.push('finalize'); if (denied) throw new HttpError(401, 'invalid_session');
    },
    validateOAuthAccess: async access => {
      assert.equal(access, tokens.access_token); calls.push('validate');
      if (denied) throw new HttpError(401, 'invalid_session');
    },
  };
  const server = createServer((req, res) => { res.setHeader('Cache-Control', 'private, no-store'); void oauthBroker(accounts, req, res, req.url); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const exchange = data => fetch(origin + '/oauth/token', { method: 'POST', headers: { 'Content-Type': formType, Cookie: 'ignored=not-authority' }, body: new URLSearchParams(data) });
    const success = await exchange(input);
    assert.equal(success.status, 200); assert.deepEqual(await success.json(), tokens);
    assert.deepEqual(calls, ['exchange', 'finalize']); assert.equal(success.headers.get('set-cookie'), null);
    assert.equal(success.headers.get('access-control-allow-origin'), null);
    denied = true; calls.length = 0;
    const badCode = await exchange(input); assert.equal(badCode.status, 400); assert.deepEqual(await badCode.json(), { error: 'invalid_grant' });
    calls.length = 0;
    const refresh = await exchange({ grant_type: 'refresh_token', client_id: client, client_secret: 'fixture-secret', refresh_token: 'fixture-refresh' });
    assert.equal(refresh.status, 400); assert.deepEqual(calls, ['exchange', 'validate']);
    const info = await fetch(origin + '/oauth/userinfo', { headers: { Authorization: 'Bearer fixture-access' } });
    assert.equal(info.status, 401); assert.ok(!calls.includes('userinfo'));
    denied = false; upstreamFailure = true;
    const upstream = await exchange(input); assert.equal(upstream.status, 400);
    assert.deepEqual(await upstream.json(), { error: 'invalid_grant' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
