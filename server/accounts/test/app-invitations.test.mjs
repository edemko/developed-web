import test from 'node:test';
import assert from 'node:assert/strict';
import { appInvitation } from '../dist/app-invitations.js';

function fixture({ existing = false, kind = 'web' } = {}) {
  const calls = [];
  const db = {
    query: async (sql, args) => { assert.match(sql, /^select id from auth\.users where lower\(email\)=\$1/); calls.push(['lookup', args[0]]); return existing ? [{ id: 'existing-user' }] : []; },
    tx: async run => run(async () => []),
    limit: async (key, count, seconds) => calls.push(['limit', key, count, seconds]),
    audit: async (_q, actor, target, action, result, context) => calls.push(['audit', actor, target, action, result, context]),
  };
  const accounts = {
    db,
    internalCheck: async (key, token) => { calls.push(['check', key, token]); return { app: { id: 'app_vocabulum' }, user: { id: 'teacher' }, client: { kind } }; },
    registrationApp: async (id, byId) => { calls.push(['app', id, byId]); return { app_id: id }; },
    grantAppAccess: async (_q, userId, appId) => calls.push(['grant', userId, appId]),
    credential: async (_q, user, address, purpose, lang, appId) => calls.push(['invite', user, address, purpose, lang, appId]),
  };
  return { accounts, calls };
}

test('a new address gets a central invitation for the calling app', async () => {
  const f = fixture();
  assert.deepEqual(await appInvitation(f.accounts, 'k'.repeat(43), { accessToken: 'token', email: 'Student@Example.com', language: 'sk' }), { accepted: true });
  assert.deepEqual(f.calls.find(c => c[0] === 'invite'), ['invite', null, 'student@example.com', 'invitation', 'sk', 'app_vocabulum']);
  assert.equal(f.calls.some(c => c[0] === 'grant'), false);
  assert.deepEqual(f.calls.find(c => c[0] === 'audit'), ['audit', 'teacher', null, 'app_invitation', 'succeeded', { appId: 'app_vocabulum' }]);
  assert.deepEqual(f.calls.filter(c => c[0] === 'limit').map(c => c[1]), ['app-invitations:app_vocabulum:teacher', 'app-invitations:app_vocabulum']);
});

test('an existing account is granted the app and the answer is identical', async () => {
  const f = fixture({ existing: true });
  assert.deepEqual(await appInvitation(f.accounts, 'k'.repeat(43), { accessToken: 'token', email: 'student@example.com' }), { accepted: true });
  assert.deepEqual(f.calls.find(c => c[0] === 'grant'), ['grant', 'existing-user', 'app_vocabulum']);
  assert.equal(f.calls.some(c => c[0] === 'invite'), false);
});

test('only web app clients may invite, and the address is validated', async () => {
  await assert.rejects(appInvitation(fixture({ kind: 'native' }).accounts, 'k'.repeat(43), { accessToken: 't', email: 'a@example.com' }), e => e.code === 'forbidden');
  await assert.rejects(appInvitation(fixture().accounts, 'k'.repeat(43), { accessToken: 't', email: 'not-an-address' }), e => e.status === 400);
});
