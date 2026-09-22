import test from 'node:test';
import assert from 'node:assert/strict';
import { Accounts } from '../dist/accounts.js';
import { Provider } from '../dist/provider.js';
import { hash, HttpError } from '../dist/security.js';

const invitation = 'a'.repeat(43), address = 'invited@example.invalid';
const input = { invitation, email: address, password: 'a genuinely long test password', displayName: 'Invited', language: 'en' };
function fixture({ mode = 'invitation', expired = false, consumed = false, existing = false, providerError = false } = {}) {
  const calls = [], state = { consumed, userId: null };
  const query = async (sql, args = []) => {
    if (sql.startsWith('select email from accounts.credentials')) {
      assert.match(sql, /consumed_at is null and user_id is null and expires_at>now\(\)/);
      return !expired && !state.consumed && !state.userId && args[0] === hash(invitation) ? [{ email: address }] : [];
    }
    if (sql.includes('select registration_mode')) return [{ registration_mode: mode }];
    if (sql.startsWith('update accounts.credentials set consumed_at=now() where token_hash')) {
      assert.match(sql, /consumed_at is null and user_id is null/);
      if (expired || state.consumed || args[0] !== hash(invitation) || args[1] !== address) return [];
      state.consumed = true; return [{ token_hash: args[0] }];
    }
    if (sql.startsWith('select id from auth.users')) return existing ? [{ id: 'existing-user' }] : [];
    if (sql.startsWith('update accounts.credentials set user_id')) { state.userId = args[1]; return []; }
    if (sql.startsWith('insert into accounts.security_state') || sql.startsWith('update core.profiles')) return [];
    throw new Error(`Unexpected fixture query: ${sql}`);
  };
  const db = { query, tx: async run => run(query), limit: async () => {}, audit: async () => {} };
  const provider = { create: async (...args) => {
    calls.push(args);
    if (providerError) throw new HttpError(503, 'provider_unavailable');
    return { id: 'new-user', email: args[0] };
  } };
  const accounts = new Accounts(db, provider, { hourlyRegistrationLimit: 20 });
  accounts.registrationContinuation = async () => null;
  accounts.credential = async (...args) => calls.push({ mailPurpose: args[3] });
  accounts.notifySuperadmins = async (_query, registered, appId) => calls.push({ notification: registered, appId });
  return { accounts, calls, state };
}

test('invitation preview is non-consuming and reveals only the bound address', async () => {
  const f = fixture();
  assert.deepEqual(await f.accounts.invitationPreview(invitation), { email: address });
  assert.deepEqual(await f.accounts.invitationPreview(invitation), { email: address });
  assert.equal(f.state.consumed, false); assert.deepEqual(f.calls, []);
  for (const value of ['', null, 'x'.repeat(42), 'b'.repeat(43)]) {
    await assert.rejects(f.accounts.invitationPreview(value), error => error.code === 'invalid_invitation');
  }
});

test('invited signup verifies the invite address and queues no second verification', async () => {
  const f = fixture();
  assert.deepEqual(await f.accounts.register(input), { accepted: true, emailVerified: true });
  assert.deepEqual(f.calls, [
    [address, input.password, input.displayName, true],
    { notification: { email: address, displayName: input.displayName }, appId: null },
  ]);
  assert.equal(f.state.consumed, true); assert.equal(f.state.userId, 'new-user');
  await assert.rejects(f.accounts.register(input), error => error.code === 'invalid_invitation');
});

test('forged request email is rejected before consume or provider call', async () => {
  const f = fixture();
  await assert.rejects(f.accounts.register({ ...input, email: 'attacker@example.invalid', emailVerified: true }),
    error => error.code === 'invitation_email_mismatch');
  assert.equal(f.state.consumed, false); assert.deepEqual(f.calls, []);
  assert.deepEqual(await f.accounts.register({ ...input, email: undefined }), { accepted: true, emailVerified: true });
  assert.equal(f.calls[0][0], address);
});

test('expired, consumed, absent and replayed invitation credentials never create a user', async () => {
  for (const options of [{ expired: true }, { consumed: true }]) {
    const f = fixture(options);
    await assert.rejects(f.accounts.register(input), error => error.code === 'invalid_invitation');
    assert.deepEqual(f.calls, []);
  }
  const f = fixture();
  await assert.rejects(f.accounts.register({ ...input, invitation: undefined }), error => error.code === 'invalid_invitation');
  assert.deepEqual(f.calls, []);
});

test('one invitation admits at most one concurrent provider create', async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.accounts.register(input), f.accounts.register(input)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.calls.filter(Array.isArray).length, 1);
  assert.equal(f.calls.filter(call => call.notification).length, 1);
});

test('closed admission denies valid invites; open admission still validates supplied invites', async () => {
  const closed = fixture({ mode: 'closed' });
  await assert.rejects(closed.accounts.register(input), error => error.code === 'registration_closed');
  assert.equal(closed.state.consumed, false); assert.deepEqual(closed.calls, []);
  const open = fixture({ mode: 'open' });
  assert.equal((await open.accounts.register(input)).emailVerified, true);
  const invalid = fixture({ mode: 'open', consumed: true });
  await assert.rejects(invalid.accounts.register(input), error => error.code === 'invalid_invitation');
});

test('ordinary signup cannot self-assert email verification', async () => {
  const f = fixture({ mode: 'open' });
  f.accounts.registrationContinuation = async value => {
    assert.equal(value, '/account/authorize?authorization_id=fixture');
    return 'app_fixture';
  };
  assert.deepEqual(await f.accounts.register({ ...input, invitation: undefined, emailVerified: true, email_confirm: true,
    continuation: '/account/authorize?authorization_id=fixture' }),
    { accepted: true, emailVerified: false });
  assert.equal(f.calls[0][3], false);
  assert.deepEqual(f.calls[1], { mailPurpose: 'verification' });
  assert.deepEqual(f.calls[2], { notification: { email: address, displayName: input.displayName }, appId: 'app_fixture' });
});

test('existing identity is not confirmed or modified through invitation signup', async () => {
  const f = fixture({ existing: true });
  await assert.rejects(f.accounts.register(input), error => error.code === 'account_exists');
  assert.deepEqual(f.calls, []); assert.equal(f.state.userId, 'existing-user');
});

test('ambiguous provider creation leaves invitation consumed, never retryable', async () => {
  const f = fixture({ providerError: true });
  await assert.rejects(f.accounts.register(input), error => error.code === 'provider_unavailable');
  await assert.rejects(f.accounts.register(input), error => error.code === 'invalid_invitation');
  assert.equal(f.calls.length, 1); assert.equal(f.state.consumed, true);
});

test('provider creation defaults unconfirmed and sends explicit invite-only confirmation', async () => {
  const requests = [];
  const provider = new Provider('https://fixture.invalid', 'fixture-key', async (_url, init) => {
    requests.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: 'new-user' }), { status: 200 });
  });
  await provider.create(address, input.password, input.displayName);
  await provider.create(address, input.password, input.displayName, true);
  assert.equal(requests[0].email_confirm, false); assert.equal(requests[1].email_confirm, true);
});
