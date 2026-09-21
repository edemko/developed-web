import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Accounts } from '../dist/accounts.js';
import { Mfa } from '../dist/mfa.js';
import { Provider } from '../dist/provider.js';
import { HttpError, seal, hash } from '../dist/security.js';

function fixture({ enrolled = false, role = 'SUPERADMIN' } = {}) {
  const id = randomUUID(), providerId = randomUUID(), factorId = randomUUID(), key = randomBytes(32), queries = [], calls = [];
  const user = { id, email: 'mfa-fixture@example.invalid', emailVerified: true, role, hasMfa: enrolled, language: 'en' };
  const auth = (aal = 'aal1') => ({ access_token: `fixture.${Buffer.from(JSON.stringify({ sub: id, session_id: providerId, exp: Date.now() / 1000 + 300, aal })).toString('base64url')}.signature`, refresh_token: 'server-only-refresh', user: { id, email: user.email, email_confirmed_at: 'confirmed', factors: user.hasMfa ? [{ id: factorId, factor_type: 'totp', status: 'verified' }] : [] } });
  const session = { id: randomUUID(), user_id: id, provider_session_id: providerId, browser_family_id: randomUUID(), created_at: new Date(), expires_at: new Date(Date.now() + 600000), mfa_pending: enrolled ? 'challenge' : 'enroll', mfa_enrollment_id: enrolled ? null : factorId, aal: 'aal1' };
  session.provider_tokens = seal(auth(), key, `session:${session.id}`);
  const sessions = new Map([[session.id, session]]);
  const trusts = new Map();
  let failure, failSave = false, failCleanup = false;
  const db = {
    limit: async () => {}, audit: async () => {}, tx: fn => fn(db.query),
    query: async (sql, args = []) => {
      queries.push(sql);
      if (sql.includes('from auth.mfa_factors')) return args[0] === id || args[0] === factorId ? [{ id: factorId, status: user.hasMfa ? 'verified' : 'unverified', factor_type: 'totp', type: 'totp' }] : [];
      if (sql.startsWith('insert into accounts.security_state')) return [];
      if (sql.startsWith('select * from accounts.security_state')) return [{ security_version: 1 }];
      if (sql.startsWith('select id from accounts.browser_families')) return [{ id: session.browser_family_id }];
      if (sql.startsWith('insert into accounts.browser_families')) return [];
      if (sql.startsWith('insert into accounts.browser_trust')) {
        trusts.set(args[0], { id: args[0], token_hash: args[1], user_id: args[2], remaining: 1209600 }); return [];
      }
      if (sql.startsWith('select t.id,floor')) return [...trusts.values()].filter(t => t.token_hash === args[0] && t.user_id === args[1]);
      if (sql.startsWith('select id from accounts.browser_trust')) return trusts.has(args[0]) ? [trusts.get(args[0])] : [];
      if (sql.startsWith('update accounts.browser_trust')) { trusts.get(args[0]).token_hash = args[1]; return []; }
      if (sql.startsWith('select id from auth.sessions')) return [{ id: providerId }];
      if (sql.startsWith('select id from accounts.sessions')) { const row = sessions.get(args[0]); return row && !row.revoked_at && (!args[1] || row.refresh_id === args[1]) ? [{ id: row.id }] : []; }
      if (sql.startsWith('update accounts.sessions set refresh_id=$2')) {
        const row = sessions.get(args[0]); if (!row || row.revoked_at || row.refresh_id) return [];
        row.refresh_id = args[1]; return [{ id: row.id }];
      }
      if (sql.startsWith('update accounts.sessions set refresh_id=null')) { sessions.get(args[0]).refresh_id = null; return []; }
      if (sql.startsWith('update accounts.sessions set revoked_at')) {
        if (failCleanup) throw new Error('cleanup unavailable');
        const row = sessions.get(args[0]); if (row) row.revoked_at = new Date(); return [];
      }
      if (sql.startsWith('insert into accounts.sessions')) {
        if (failSave) throw new Error('save unavailable');
        const row = { id: args[0], user_id: args[3], provider_session_id: args[4], provider_tokens: args[5], security_version: args[6], mfa_pending: args[7], expires_in: args[8], browser_family_id: args[9], mfa_remember_until: args[10] ? new Date(Date.now() + args[8] * 1000) : null, mfa_trust_id: args[11], created_at: new Date(), authenticated_at: args[7] || args[12] ? null : new Date() };
        sessions.set(row.id, row); return [row];
      }
      if (sql.startsWith('insert into accounts.outbox')) return [];
      throw new Error(`Unhandled fixture query: ${sql}`);
    },
  };
  const provider = {
    login: async () => { calls.push('login'); return auth(); }, logout: async () => { calls.push('logout'); },
    verifyTotp: async () => { calls.push('verify'); assert.ok(session.refresh_id || calls.includes('login')); if (failure) throw failure; user.hasMfa = true; return auth('aal2'); },
  };
  const accounts = new Accounts(db, provider, { encryptionKey: key, insecureLocal: true, origin: 'https://www.developed.sk', supportEmail: 'info@developed.sk' });
  accounts.userById = async () => user;
  const ctx = () => accounts.context(session, user);
  return { accounts, mfa: new Mfa(accounts), user, session, sessions, trusts, ctx, factorId, calls, queries, auth,
    fail: error => { failure = error; }, failSave: () => { failSave = true; }, failCleanup: () => { failCleanup = true; } };
}

test('superadmin without MFA and enrolled password-only users are restricted to the MFA flow', () => {
  for (const enrolled of [false, true]) {
    const f = fixture({ enrolled });
    assert.equal(f.ctx().user, null); assert.equal(f.ctx().candidate.id, f.user.id);
    assert.equal(f.ctx().mfa.mode, enrolled ? 'challenge' : 'enroll');
    assert.throws(() => f.accounts.requireUser(f.ctx()), error => error.status === 401);
    assert.throws(() => f.accounts.requireAdmin({ user: f.user, session: { aal: 'aal1' } }), error => error.code === 'mfa_required');
  }
});

test('verified enrollment rotates the cookie, creates AAL2 access, and keeps provider credentials private', async () => {
  const f = fixture();
  const next = await f.mfa.verify(f.ctx(), f.factorId, '123456');
  assert.equal(next.user.id, f.user.id); assert.equal(next.mfa, undefined);
  assert.equal(next.session.aal, 'aal2'); assert.notEqual(next.session.id, f.session.id);
  assert.equal(next.session.browser_family_id, f.session.browser_family_id);
  assert.equal(next.session.expires_in, 604800);
  assert.ok(f.session.revoked_at); assert.ok(next.cookie.includes('HttpOnly'));
  assert.equal(f.accounts.requireAdmin(next, true).id, f.user.id);
  assert.ok(!JSON.stringify(f.accounts.publicUser(next.user)).includes('server-only'));
});

test('password-only pending cookies expire in ten minutes and do not inherit authentication freshness', async () => {
  const f = fixture({ enrolled: true });
  const next = await f.accounts.newSession(f.ctx(), f.auth(), f.user);
  assert.equal(next.session.expires_in, 600); assert.equal(next.session.authenticated_at, null);
  assert.equal(next.user, null); assert.equal(next.mfa.mode, 'challenge');
  assert.match(next.cookie, /Max-Age=600(?:;|$)/);
});

test('remembered MFA is explicit, bounded to 14 days, and keeps real AAL2', async () => {
  for (const remember of [false, true]) {
    const f = fixture({ enrolled: true });
    const next = await f.mfa.verify(f.ctx(), f.factorId, '123456', remember);
    assert.equal(next.session.expires_in, remember ? 1209600 : 604800);
    assert.equal(Boolean(next.session.mfa_remember_until), remember);
    assert.equal(next.session.aal, 'aal2');
    assert.match(next.cookie, new RegExp(`Max-Age=${remember ? 1209600 : 604800}(?:;|$)`));
    next.session.authenticated_at = new Date(Date.now() - 301000);
    assert.throws(() => f.accounts.requireAdmin(next, true), error => error.code === 'reauthentication_required');
  }
});

test('remembering never bypasses verification or promotes a password-only session', async () => {
  const f = fixture({ enrolled: true });
  for (const value of ['true', 1, null, {}, []]) {
    await assert.rejects(f.mfa.verify(f.ctx(), f.factorId, '123456', value), error => error.code === 'invalid_request');
  }
  assert.deepEqual(f.calls, []);
  const pending = await f.accounts.newSession(f.ctx(), f.auth(), f.user, { rememberMfa: true });
  assert.equal(pending.session.expires_in, 600);
  assert.equal(pending.session.mfa_remember_until, null);
  assert.equal(pending.user, null);
  const wrong = fixture({ enrolled: true });
  wrong.fail(new HttpError(400, 'provider_rejected'));
  await assert.rejects(wrong.mfa.verify(wrong.ctx(), wrong.factorId, '123456', true));
  assert.equal(wrong.sessions.size, 1);
});

test('fresh step-up preserves the original remembered deadline, never a sliding 14 days', async () => {
  const f = fixture({ enrolled: true });
  const next = await f.mfa.verify(f.ctx(), f.factorId, '123456', true);
  next.session.mfa_remember_until = new Date(Date.now() + 3 * 86400000);
  const again = await f.accounts.newSession(next, f.auth('aal2'), f.user);
  assert.ok(again.session.expires_in <= 3 * 86400 && again.session.expires_in > 3 * 86400 - 5);
  assert.ok(again.session.mfa_remember_until <= next.session.mfa_remember_until);
  const other = fixture({ enrolled: true });
  other.session.mfa_remember_until = new Date(Date.now() + 86400000);
  other.session.aal = 'aal2';
  const fresh = await other.accounts.newSession(other.ctx(), other.auth('aal2'), other.user, { newFamily: true });
  assert.equal(fresh.session.mfa_remember_until, null);
});

test('correct password and separate rotating trust cookie skip OTP without claiming provider AAL2 or freshness', async () => {
  const f = fixture({ enrolled: true });
  const verified = await f.mfa.verify(f.ctx(), f.factorId, '123456', true);
  const rawTrust = verified.trustCookie.split(';')[0].split('=')[1];
  assert.equal(f.trusts.get(verified.session.mfa_trust_id).token_hash, hash(rawTrust));
  const anonymous = { session: { id: randomUUID() }, user: null };
  const login = await f.accounts.login(anonymous, { email: f.user.email, password: 'fixture password' }, rawTrust);
  assert.equal(login.user.id, f.user.id); assert.equal(login.session.aal, 'aal1');
  assert.equal(login.session.authenticated_at, null);
  assert.notEqual(login.session.browser_family_id, verified.session.browser_family_id);
  assert.notEqual(login.trustCookie, verified.trustCookie);
  assert.equal(f.accounts.requireAdmin(login).id, f.user.id);
  assert.throws(() => f.accounts.requireAdmin(login, true), error => error.code === 'reauthentication_required');
  const replay = await f.accounts.login(anonymous, { email: f.user.email, password: 'fixture password' }, rawTrust);
  assert.equal(replay.user, null); assert.equal(replay.mfa.mode, 'challenge');
  const forged = await f.accounts.login(anonymous, { email: f.user.email, password: 'fixture password', trustCookie: rawTrust, rememberBrowser: true });
  assert.equal(forged.user, null);
  f.accounts.provider.login = async () => { throw new HttpError(400, 'provider_rejected'); };
  await assert.rejects(f.accounts.login(anonymous, { email: f.user.email, password: 'wrong' }, login.trustCookie.split(';')[0].split('=')[1]), error => error.code === 'invalid_credentials');
});

test('remembered-browser cookie is host-only, HttpOnly, Secure and never an authentication cookie', () => {
  const f = fixture(); f.accounts.config.insecureLocal = false;
  const cookie = f.accounts.trustCookie('fixture');
  assert.match(cookie, /^__Host-developed_mfa_trust=/);
  for (const value of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=1209600']) assert.ok(cookie.includes(value));
  assert.ok(!cookie.includes('Domain='));
});

test('provider verification cannot claim success without actual AAL2 on the same session', async () => {
  for (const differentSession of [false, true]) {
    const f = fixture({ enrolled: true });
    f.accounts.provider.verifyTotp = async () => {
      const bundle = f.auth(differentSession ? 'aal2' : 'aal1');
      if (differentSession) {
        const parts = bundle.access_token.split('.');
        parts[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url')), session_id: randomUUID() })).toString('base64url');
        bundle.access_token = parts.join('.');
      }
      return bundle;
    };
    await assert.rejects(f.mfa.verify(f.ctx(), f.factorId, '123456'), error => error.code === 'invalid_session');
    assert.ok(f.session.revoked_at); assert.equal(f.sessions.size, 1);
  }
});

test('foreign, unverified challenge, malformed and unsupported factors never reach provider verification', async () => {
  const f = fixture({ enrolled: true });
  await assert.rejects(f.mfa.verify(f.ctx(), randomUUID(), '123456'), error => error.code === 'invalid_mfa_factor');
  await assert.rejects(f.mfa.verify(f.ctx(), f.factorId, '12x456'), error => error.code === 'invalid_mfa_code');
  assert.deepEqual(f.calls, []);
});

test('a definite wrong code releases the fence for a bounded retry', async () => {
  const f = fixture({ enrolled: true }); f.fail(new HttpError(400, 'provider_rejected'));
  await assert.rejects(f.mfa.verify(f.ctx(), f.factorId, '123456'), error => error.code === 'invalid_mfa_code');
  assert.equal(f.session.refresh_id, null); assert.equal(f.session.revoked_at, undefined);
});

test('ambiguous verification/save failure cannot replay an old bundle even when cleanup fails', async () => {
  for (const mode of ['network', 'save']) {
    const f = fixture({ enrolled: true });
    if (mode === 'network') f.fail(new Error('timeout')); else f.failSave();
    f.failCleanup();
    await assert.rejects(f.mfa.verify(f.ctx(), f.factorId, '123456'));
    await assert.rejects(f.mfa.verify(f.ctx(), f.factorId, '123456'));
    assert.equal(f.calls.filter(call => call === 'verify').length, 1);
    assert.ok(f.session.refresh_id);
  }
});

test('fresh step-up never accepts password alone or an incorrect MFA code', async () => {
  const f = fixture({ enrolled: true });
  await assert.rejects(f.accounts.checkPassword(f.user, 'fixture password'), error => error.code === 'mfa_required');
  assert.ok(f.calls.includes('logout'));
  f.fail(new HttpError(400, 'provider_rejected'));
  await assert.rejects(f.accounts.checkPassword(f.user, 'fixture password', '123456'), error => error.code === 'invalid_mfa_code');
  f.fail(null);
  assert.ok((await f.accounts.checkPassword(f.user, 'fixture password', '123456')).access_token);
});

test('MFA provider calls use private bearer and never return remote error details', async () => {
  const calls = [];
  const provider = new Provider('https://provider.example.invalid', 'fixture-admin', async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.endsWith('/challenge') ? { id: 'challenge-fixture' } : { message: 'secret-upstream' }, { status: url.endsWith('/challenge') ? 200 : 400 });
  });
  await assert.rejects(provider.verifyTotp('server-user-token', 'factor-fixture', '123456'), error => !error.message.includes('secret-upstream'));
  assert.equal(calls[1].options.headers.Authorization, 'Bearer server-user-token');
  assert.deepEqual(JSON.parse(calls[1].options.body), { challenge_id: 'challenge-fixture', code: '123456' });
  assert.equal(calls[1].options.redirect, 'error');
});
