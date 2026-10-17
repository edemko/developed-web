import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Accounts } from '../dist/accounts.js';
import { Provider } from '../dist/provider.js';
import { hash } from '../dist/security.js';

function fixture(options = {}) {
  const raw = 'a'.repeat(43), id = randomUUID();
  const credential = { token_hash: hash(raw), user_id: id, email: 'verify@example.invalid', current_email: 'verify@example.invalid', security_version: '1', purpose: 'verification', consumed_at: null, current_confirmed: null, return_app_id: 'app_voc_builder', ...options.credential };
  const state = { security_version: '1', locked: false, ...options.state };
  const user = { id, email: credential.email, emailVerified: false, security_version: '1', role: 'USER', hasMfa: false, ...options.user };
  const calls = [];
  const db = {
    query: async (sql, values = []) => {
      if (sql.includes('from accounts.credentials c')) return values[0] === credential.token_hash ? [{ ...credential }] : [];
      if (sql.startsWith('select * from accounts.security_state')) return [{ ...state }];
      if (sql.startsWith('update accounts.credentials set consumed_at')) { credential.consumed_at = new Date(); return []; }
      if (sql.startsWith('select slug')) return [{ slug: 'vocabulum' }];
      throw new Error(`Unexpected query: ${sql}`);
    },
    tx: fn => fn(db.query), audit: async (...args) => calls.push(['audit', args[3], args[4]])
  };
  const provider = {
    confirmedEmailSession: async () => { calls.push(['provider-session']); if (options.providerFailure) throw new Error('provider unavailable'); return { access_token: 'private-access', user: { id, email: user.email, email_confirmed_at: 'confirmed' } }; },
    logout: async () => calls.push(['logout'])
  };
  const accounts = new Accounts(db, provider, { encryptionKey: randomBytes(32) });
  accounts.mutateIdentity = async () => { calls.push(['confirm']); state.security_version = '2'; user.security_version = '2'; user.emailVerified = true; credential.current_confirmed = new Date(); };
  accounts.userById = async () => user;
  accounts.newSession = async (_ctx, auth, _user, options) => {
    calls.push(['session', options]);
    if (auth.user.id !== user.id || options.expectedVersion !== state.security_version) throw new Error('session rejected');
    if (options.newFamily !== true) throw new Error('new family required');
    return { session: { id: 'new-session' }, user, cookie: 'opaque-cookie' };
  };
  return { accounts, raw, state, user, credential, calls, ctx: { session: { id: 'anonymous' }, user: null } };
}

test('initial confirmation signs in once; reopening succeeds without minting another session', async () => {
  const f = fixture();
  const first = await f.accounts.consumeCredential(f.raw, undefined, f.ctx);
  assert.equal(first.context.user.id, f.user.id);
  assert.equal(first.loginUrl, '/login?app=vocabulum');
  assert.deepEqual(f.calls.map(c => c[0]), ['confirm', 'provider-session', 'session']);
  const replay = await f.accounts.consumeCredential(f.raw, undefined, f.ctx);
  assert.equal(replay.alreadyConfirmed, true);
  assert.equal(replay.context, undefined);
  assert.equal(f.calls.filter(c => c[0] === 'session').length, 1);
});

test('superseded, unknown, locked and security-invalidated tokens cannot sign in', async () => {
  const fixtures = [fixture({ credential: { consumed_at: new Date() } }), fixture({ state: { locked: true } }), fixture({ state: { operation_id: 'pending' } }), fixture({ state: { security_version: '3' } }), fixture({ credential: { current_email: 'changed@example.invalid' } })];
  for (const f of fixtures) {
    await assert.rejects(f.accounts.consumeCredential(f.raw, undefined, f.ctx));
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  await assert.rejects(f.accounts.consumeCredential('unknown', undefined, f.ctx));
  const used = fixture({ credential: { consumed_at: new Date(), current_confirmed: new Date() }, state: { security_version: '3' } });
  await assert.rejects(used.accounts.consumeCredential(used.raw, undefined, used.ctx));
});

test('MFA and administrator accounts confirm without bypassing password authentication', async () => {
  for (const user of [{ hasMfa: true }, { role: 'SUPERADMIN' }]) {
    const f = fixture({ user });
    const result = await f.accounts.consumeCredential(f.raw, undefined, f.ctx);
    assert.equal(result.ok, true); assert.equal(result.context, undefined);
    assert.deepEqual(f.calls.map(c => c[0]), ['confirm']);
  }
});

test('provider sign-in failure keeps confirmation successful and cannot retry login with spent proof', async () => {
  const f = fixture({ providerFailure: true });
  assert.equal((await f.accounts.consumeCredential(f.raw, undefined, f.ctx)).ok, true);
  assert.equal((await f.accounts.consumeCredential(f.raw, undefined, f.ctx)).alreadyConfirmed, true);
  assert.equal(f.calls.filter(c => c[0] === 'provider-session').length, 1);
});

test('email changes and password recovery do not create sessions or allow replay', async () => {
  for (const purpose of ['email_change', 'recovery']) {
    const f = fixture({ credential: { purpose } });
    const password = purpose === 'recovery' ? 'fixture-password' : undefined;
    const result = await f.accounts.consumeCredential(f.raw, password, f.ctx);
    assert.equal(result.context, undefined);
    assert.deepEqual(f.calls.map(c => c[0]), ['confirm']);
    await assert.rejects(f.accounts.consumeCredential(f.raw, password, f.ctx));
  }
});

test('provider exchanges an exact-user generated hash privately, without sending email', async () => {
  const calls = [], user = { id: randomUUID(), email: 'verify@example.invalid' };
  const provider = new Provider('https://provider.invalid', 'private-admin-key', async (url, init) => {
    calls.push([new URL(url).pathname, JSON.parse(init.body)]);
    return Response.json(calls.length === 1 ? { ...user, hashed_token: 'private-hash' } : { user, access_token: 'private-access' });
  });
  assert.equal((await provider.confirmedEmailSession(user.id, user.email)).user.id, user.id);
  assert.deepEqual(calls, [['/admin/generate_link', { type: 'magiclink', email: user.email }], ['/verify', { type: 'magiclink', token_hash: 'private-hash' }]]);
  calls.length = 0;
  await assert.rejects(provider.confirmedEmailSession('different-id', user.email));
  assert.equal(calls.length, 1);
});

test('a concurrent security change prevents saving the confirmation session', async () => {
  const id = randomUUID();
  const accounts = new Accounts({ tx: fn => fn(async sql => {
    if (sql.startsWith('insert into accounts.security_state')) return [];
    if (sql.startsWith('select * from accounts.security_state')) return [{ security_version: '3' }];
    throw Error('No session or family should be written');
  }) }, {}, { encryptionKey: randomBytes(32) });
  const access = `fixture.${Buffer.from(JSON.stringify({ sub: id, session_id: randomUUID(), aal: 'aal1' })).toString('base64url')}.signature`;
  await assert.rejects(accounts.newSession({ session: {} }, { access_token: access, user: { id } }, { id, role: 'USER' }, { expectedVersion: '2', newFamily: true }), error => error.code === 'invalid_session');
});
