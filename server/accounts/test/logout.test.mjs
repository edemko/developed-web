import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Accounts } from '../dist/accounts.js';
import { seal } from '../dist/security.js';

function fixture({ pending = false, anonymous = false, providerFailure = false } = {}) {
  const user = { id: randomUUID() }, key = randomBytes(32);
  const session = { id: randomUUID(), provider_session_id: randomUUID(), browser_family_id: randomUUID() };
  const access = `fixture.${Buffer.from(JSON.stringify({ sub: user.id, session_id: session.provider_session_id, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')}.signature`;
  session.provider_tokens = seal({ access_token: access }, key, `session:${session.id}`);
  const queries = [], audit = [], calls = [];
  const db = { query: async (sql, args) => { queries.push({ sql, args }); return []; },
    tx: fn => fn(db.query), audit: async (_q, actor, target, action) => audit.push({ actor, target, action }) };
  const accounts = new Accounts(db, { logout: async (token, scope) => {
    calls.push({ token, scope }); if (providerFailure) throw new Error('fixture provider unavailable');
  } }, { encryptionKey: key });
  accounts.providerToken = async () => access;
  const ctx = { session, user: anonymous || pending ? null : user, ...(pending ? { candidate: user } : {}) };
  return { accounts, ctx, user, session, access, queries, audit, calls };
}

test('browser logout tombstones exactly its family and its opaque sessions, never account-wide state or credentials', async () => {
  const f = fixture(); await f.accounts.logout(f.ctx);
  assert.equal(f.queries.length, 2);
  assert.match(f.queries[0].sql, /accounts.browser_families/);
  assert.deepEqual(f.queries[0].args, [f.session.browser_family_id, f.user.id]);
  assert.match(f.queries[1].sql, /where browser_family_id=\$1 and user_id=\$2/);
  assert.deepEqual(f.calls, [{ token: f.access, scope: 'local' }]);
  assert.equal(f.audit[0].action, 'logout_local');
});

test('local denial succeeds during provider outage without falling back to global revocation', async () => {
  const f = fixture({ providerFailure: true }); await f.accounts.logout(f.ctx);
  assert.equal(f.queries.length, 2); assert.equal(f.calls[0].scope, 'local');
});

test('pending MFA may exit this login but cannot log out other devices', async () => {
  const f = fixture({ pending: true }); await f.accounts.logout(f.ctx);
  assert.equal(f.calls[0].scope, 'local'); assert.equal(f.queries.length, 2);
  await assert.rejects(f.accounts.logoutAll(f.ctx), error => error.code === 'authentication_required');
  assert.equal(f.queries.length, 2);
});

test('anonymous logout never calls the provider or performs account-wide revocation', async () => {
  const f = fixture({ anonymous: true }); await f.accounts.logout(f.ctx);
  assert.equal(f.queries.length, 1); assert.deepEqual(f.calls, []); assert.deepEqual(f.audit, []);
});

test('explicit global logout retains all-session cutoff and invalidates outstanding recovery credentials', async () => {
  const f = fixture(); await f.accounts.logoutAll(f.ctx);
  assert.equal(f.queries.length, 3);
  assert.match(f.queries[0].sql, /security_version=accounts.security_state.security_version\+1/);
  assert.match(f.queries[1].sql, /where user_id=\$1/);
  assert.match(f.queries[2].sql, /accounts.credentials/);
  assert.deepEqual(f.calls, [{ token: f.access, scope: 'global' }]);
  assert.equal(f.audit[0].action, 'logout_all');
});
