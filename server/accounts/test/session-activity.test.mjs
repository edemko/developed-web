import test from 'node:test';
import assert from 'node:assert/strict';
import { Accounts } from '../dist/accounts.js';

function fixture(due = false) {
  const queries = [];
  const session = { id: 'fixture-session', user_id: 'fixture-user', security_version: 1,
    provider_session_id: 'fixture-provider', activity_due: due };
  const user = { id: session.user_id, emailVerified: true, security_version: 1, role: 'USER', hasMfa: false };
  const state = { validSession: true, providerValid: true };
  const db = { async query(sql, args) {
    queries.push({ sql, args });
    if (sql.includes('from accounts.sessions s where token_hash=')) return state.validSession ? [{ ...session }] : [];
    if (sql.includes('from core.profiles p join auth.users')) return [{ ...user }];
    if (sql.startsWith('select id,aal from auth.sessions')) return state.providerValid ? [{ id: session.provider_session_id, aal: 'aal1' }] : [];
    if (sql.startsWith('update accounts.sessions')) return [];
    if (sql.startsWith('insert into accounts.sessions')) return [{ id: 'anonymous', user_id: null }];
    throw Error('Unexpected fixture query');
  } };
  const accounts = new Accounts(db, {}, { encryptionKey: Buffer.alloc(32, 1), insecureLocal: true });
  const bootstrap = () => accounts.bootstrap('a'.repeat(43));
  const stamps = () => queries.filter(({ sql }) => sql.startsWith('update accounts.sessions set last_seen_at='));
  return { accounts, bootstrap, queries, stamps, user, state, session };
}

test('fresh session activity skips the no-op UPDATE and still checks authorization on every request', async () => {
  const f = fixture();
  for (let i = 0; i < 20; i++) {
    const result = await f.bootstrap();
    assert.equal(result.user.id, f.user.id);
    assert.equal('activity_due' in result.session, false);
  }
  assert.equal(f.stamps().length, 0);
  assert.equal(f.queries.length, 60); // session, current user, live provider session
});

test('due activity retains the conditional database UPDATE across independent instances', async () => {
  const first = fixture(true), second = fixture(true);
  await Promise.all([first.bootstrap(), second.bootstrap()]);
  for (const f of [first, second]) {
    assert.equal(f.stamps().length, 1);
    assert.match(f.stamps()[0].sql, /where id=\$1 and last_seen_at<now\(\)-interval '5 minutes'/);
    assert.deepEqual(f.stamps()[0].args, ['fixture-session']);
    assert.match(f.queries[0].sql, /s\.last_seen_at<now\(\)-interval '5 minutes' as activity_due/);
  }
});

test('missing activity hint conservatively keeps the conditional write', async () => {
  const f = fixture(null);
  await f.bootstrap();
  assert.equal(f.stamps().length, 1);
});

for (const change of [{ locked: true }, { operation_id: 'pending' }, { emailVerified: false }, { security_version: 2 }]) {
  test(`fresh activity never bypasses a changed user security state: ${Object.keys(change)[0]}`, async () => {
    const f = fixture();
    assert.ok((await f.bootstrap()).user);
    Object.assign(f.user, change);
    assert.equal((await f.bootstrap()).user, null);
    assert.equal(f.stamps().length, 0);
    assert.ok(f.queries.some(({ sql }) => sql.startsWith('update accounts.sessions set revoked_at=')));
  });
}

test('provider session revocation is enforced even for recently active sessions', async () => {
  const f = fixture();
  assert.ok((await f.bootstrap()).user);
  f.state.providerValid = false;
  assert.equal((await f.bootstrap()).user, null);
  assert.equal(f.stamps().length, 0);
});

test('expired or revoked session cannot be extended by the activity optimization', async () => {
  const f = fixture(true);
  f.state.validSession = false;
  assert.equal((await f.bootstrap()).user, null);
  assert.equal(f.stamps().length, 0);
});

test('MFA gates remain in force when the activity UPDATE is skipped', async () => {
  const f = fixture();
  f.user.hasMfa = true;
  const context = await f.bootstrap();
  assert.equal(context.user, null);
  assert.equal(context.mfa.mode, 'challenge');
  assert.throws(() => f.accounts.requireUser(context), error => error.status === 401);
});
