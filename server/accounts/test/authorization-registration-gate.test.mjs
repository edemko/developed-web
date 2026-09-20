import test from 'node:test';
import assert from 'node:assert/strict';
import { Accounts } from '../dist/accounts.js';

const clientId = '17064340-5563-4ca0-b7f3-cf44c6af7001';
const userId = '27064340-5563-4ca0-b7f3-cf44c6af7001';
const callback = 'https://kestrek.sk/api/auth/ecosystem/callback';
const authorizationId = 'a'.repeat(32);
function fixture(patch = {}, registered = true) {
  const calls = [];
  const authorization = { client_id: clientId, user_id: userId, redirect_uri: callback,
    scope: 'openid email profile', code_challenge_method: 's256', nonce: 'fixture-nonce',
    status: 'pending', expires_at: new Date(Date.now() + 60000), ...patch };
  const db = { query: async (sql, args) => {
    if (sql.includes('from auth.oauth_authorizations')) return [authorization];
    assert.ok(sql.includes('where oc.client_id=$1 and oc.enabled'));
    assert.deepEqual(args, [authorization.client_id]);
    return registered ? [{ app_id: 'app_kestrek', name: 'KešTrek', registered_callback: callback, client_kind: 'web' }] : [];
  } };
  const accounts = new Accounts(db, { call: async () => { calls.push('provider'); throw new Error('unexpected provider call'); } }, {});
  accounts.ensureAccess = async () => { calls.push('eligibility'); };
  accounts.providerToken = async () => { calls.push('token'); throw new Error('unexpected token access'); };
  return { accounts, calls, ctx: { user: { id: userId }, session: {} } };
}

test('S256 authorization metadata accepted without provider side effect', async () => {
  const f = fixture();
  assert.equal((await f.accounts.authorize(f.ctx, authorizationId)).app.id, 'app_kestrek');
  assert.deepEqual(f.calls, ['eligibility']);
});

test('plain PKCE and wrong identity/callback/client bindings fail before provider consent', async () => {
  for (const [patch, registered] of [[{ code_challenge_method: 'plain' }, true],
    [{ code_challenge_method: '' }, true], [{ redirect_uri: 'https://attacker.invalid/callback' }, true],
    [{ user_id: 'another-user' }, true], [{ nonce: '' }, true], [{ scope: 'email profile' }, true],
    [{ scope: 'openid administrator' }, true], [{}, false]]) {
    const f = fixture(patch, registered);
    await assert.rejects(f.accounts.authorize(f.ctx, authorizationId, true), error => [400, 403].includes(error.status));
    assert.deepEqual(f.calls, []);
  }
});
