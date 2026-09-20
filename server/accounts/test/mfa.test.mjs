import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Accounts } from '../dist/accounts.js';
import { Mfa } from '../dist/mfa.js';
import { Provider } from '../dist/provider.js';
import { HttpError, seal } from '../dist/security.js';

function fixture({ enrolled = false, role = 'SUPERADMIN' } = {}) {
  const id = randomUUID(), providerId = randomUUID(), factorId = randomUUID(), key = randomBytes(32), queries = [], calls = [];
  const user = { id, email: 'mfa-fixture@example.invalid', emailVerified: true, role, hasMfa: enrolled, language: 'en' };
  const auth = (aal = 'aal1') => ({ access_token: `fixture.${Buffer.from(JSON.stringify({ sub: id, session_id: providerId, exp: Date.now() / 1000 + 300, aal })).toString('base64url')}.signature`, refresh_token: 'server-only-refresh', user: { id, email: user.email, email_confirmed_at: 'confirmed', factors: user.hasMfa ? [{ id: factorId, factor_type: 'totp', status: 'verified' }] : [] } });
  const session = { id: randomUUID(), user_id: id, provider_session_id: providerId, created_at: new Date(), expires_at: new Date(Date.now() + 600000), mfa_pending: enrolled ? 'challenge' : 'enroll', mfa_enrollment_id: enrolled ? null : factorId, aal: 'aal1' };
  session.provider_tokens = seal(auth(), key, `session:${session.id}`);
  const sessions = new Map([[session.id, session]]);
  let failure, failSave = false, failCleanup = false;
  const db = {
    limit: async () => {}, audit: async () => {}, tx: fn => fn(db.query),
    query: async (sql, args = []) => {
      queries.push(sql);
      if (sql.includes('from auth.mfa_factors')) return args[0] === id || args[0] === factorId ? [{ id: factorId, status: user.hasMfa ? 'verified' : 'unverified', factor_type: 'totp', type: 'totp' }] : [];
      if (sql.startsWith('insert into accounts.security_state')) return [];
      if (sql.startsWith('select * from accounts.security_state')) return [{ security_version: 1 }];
      if (sql.startsWith('select id from auth.sessions')) return [{ id: providerId }];
      if (sql.startsWith('select id from accounts.sessions')) { const row = sessions.get(args[0]); return row && !row.revoked_at && row.refresh_id === args[1] ? [{ id: row.id }] : []; }
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
        const row = { id: args[0], user_id: args[3], provider_session_id: args[4], provider_tokens: args[5], security_version: args[6], mfa_pending: args[7], expires_in: args[8], created_at: new Date(), authenticated_at: args[7] ? null : new Date() };
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
  return { accounts, mfa: new Mfa(accounts), user, session, sessions, ctx, factorId, calls, queries, auth,
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
