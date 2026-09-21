// Opt-in only: real central HTTP + real GoTrue in a labeled disposable pair.
// Unique fake identities, no mail, no production URLs/configuration accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createPrivateKey, sign, createHash } from 'node:crypto';
import pg from 'pg';
import { Accounts } from '../dist/accounts.js';
import { Database } from '../dist/db.js';
import { Provider } from '../dist/provider.js';
import { createAccountServer } from '../dist/http.js';
import { claims, hash, seal, unseal } from '../dist/security.js';
import { fixtureTotp as totp } from './mfa-fixture.mjs';

const container = process.env.ACCOUNTS_TEST_CONTAINER;
test('isolated central TOTP enrollment, restricted sessions, AAL2, fresh step-up and OAuth delegation', { skip: !container, timeout: 90000 }, async t => {
  assert.match(container, /^developed-identity-test-\d+-db$/);
  const inspect = name => JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }))[0];
  const database = inspect(container), authContainer = inspect(container.replace(/-db$/, '-auth'));
  for (const item of [database, authContainer]) assert.equal(item.Config.Labels['developed.identity.qualification'], 'true');
  const env = Object.fromEntries(authContainer.Config.Env.map(value => [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)]));
  assert.equal(new URL(env.GOTRUE_JWT_ISSUER).hostname, '127.0.0.1');
  const suffix = randomBytes(6).toString('hex'), password = randomBytes(32).toString('hex');
  const adminRole = `mfa_admin_${suffix}`, centralRole = `mfa_central_${suffix}`;
  const sql = input => execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (sql("select count(*) from information_schema.columns where table_schema='accounts' and table_name='sessions' and column_name='mfa_pending'").trim() === '0') {
    sql(await readFile(new URL('../../../supabase/migrations/20260920125511_developed_totp_sessions.sql', import.meta.url), 'utf8'));
  }
  sql(`create role ${adminRole} login superuser password '${password}'; create role ${centralRole} login password '${password}'; grant developed_accounts to ${centralRole};
    do $$ begin if not exists(select 1 from pg_trigger where tgname='developed_fixture_profile') then create trigger developed_fixture_profile after insert on auth.users for each row execute function core.handle_new_user(); end if; end $$;`);
  const ip = Object.values(database.NetworkSettings.Networks)[0].IPAddress;
  const admin = new pg.Pool({ connectionString: `postgres://${adminRole}:${password}@${ip}:5432/postgres`, max: 2 });
  const db = new Database(`postgres://${centralRole}:${password}@${ip}:5432/postgres`);
  const key = JSON.parse(env.GOTRUE_JWT_KEYS)[0], b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = b64({ alg: 'ES256', kid: key.kid, typ: 'JWT' }), body = b64({ role: 'service_role', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 });
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), { key: createPrivateKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const provider = new Provider(`http://127.0.0.1:${authContainer.NetworkSettings.Ports['9999/tcp'][0].HostPort}`, `${head}.${body}.${signature}`);
  const enrollProvider = provider.enrollTotp.bind(provider);
  provider.enrollTotp = async (...args) => {
    const result = await enrollProvider(...args);
    t.diagnostic(`Enrollment response shape: type=${result.type}, secretLength=${result.totp?.secret?.length}, qrBytes=${result.totp?.qr_code?.length}`);
    return result;
  };
  const config = { origin: 'http://127.0.0.1', encryptionKey: randomBytes(32), insecureLocal: true, supportEmail: 'info@developed.sk', mailEnabled: false, dailyEmailLimit: 1000, hourlyRegistrationLimit: 1000 };
  const accounts = new Accounts(db, provider, config), server = createAccountServer(accounts);
  let cookie = '', csrf = '', enrollment, user, client, appId;
  const address = `mfa-${suffix}@example.invalid`, secret = `MFA fixture ${randomBytes(24).toString('base64url')}`;
  try {
    await assert.rejects(db.query('select secret from auth.mfa_factors'));
    user = await provider.call('/admin/users', 'POST', { email: address, password: secret, email_confirm: true });
    await admin.query("update core.profiles set role='SUPERADMIN' where id=$1", [user.id]);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    config.origin = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, method = 'GET', data, overrides = {}) => {
      const response = await fetch(config.origin + '/api/account' + path, { method, headers: { Cookie: cookie, Origin: config.origin, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', ...overrides }, ...(data ? { body: JSON.stringify(data) } : {}), redirect: 'manual' });
      const set = response.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
      const result = await response.json(); if (result.csrfToken) csrf = result.csrfToken;
      return { status: response.status, body: result };
    };
    await request('/session');
    await t.test('password-only superadmin session is restricted and never grants profile/consent/admin access', async () => {
      const result = await request('/login', 'POST', { email: address, password: secret });
      assert.equal(result.status, 200); assert.equal(result.body.user, null); assert.deepEqual(result.body.mfa, { mode: 'enroll' });
      const session = await request('/session'); assert.equal(session.body.user, null);
      for (const path of ['/apps', '/security', '/admin/users', '/authorize?authorization_id=invalid']) assert.equal((await request(path)).status, 401);
      assert.equal((await request('/profile', 'PATCH', { displayName: 'Denied' })).status, 401);
      assert.equal((await request('/mfa/enroll', 'POST', {}, { 'X-CSRF-Token': 'wrong' })).status, 403);
    });
    await t.test('enrollment reveals setup only once; bad code does not authenticate; valid code rotates cookie', async () => {
      const response = await request('/mfa/enroll', 'POST', {});
      assert.equal(response.status, 200, response.body.error?.code); enrollment = response.body;
      assert.match(enrollment.secret, /^[A-Z2-7]+$/); assert.match(enrollment.qrCode, /^data:image\/svg\+xml;base64,/);
      const state = await request('/mfa'); assert.equal(state.body.enrollmentId, enrollment.factorId); assert.equal(state.body.secret, undefined);
      const valid = totp(enrollment.secret), wrong = valid.slice(0, 5) + ((Number(valid[5]) + 1) % 10);
      assert.equal((await request('/mfa/verify', 'POST', { factorId: enrollment.factorId, code: wrong })).status, 400);
      assert.equal((await request('/mfa/verify', 'POST', { factorId: randomUUID(), code: valid })).status, 400);
      const old = cookie;
      const verified = await request('/mfa/verify', 'POST', { factorId: enrollment.factorId, code: totp(enrollment.secret) });
      assert.equal(verified.status, 200, verified.body.error?.code); assert.equal(verified.body.user.id, user.id); assert.notEqual(cookie, old);
      assert.equal(verified.body.access_token, undefined); assert.equal(verified.body.refresh_token, undefined);
      await request('/session');
      assert.equal((await request('/admin/users')).status, 200);
      const ctx = await accounts.bootstrap(cookie.split('=')[1]); assert.equal(ctx.session.aal, 'aal2');
    });
    await t.test('provider refresh preserves AAL2 and the provider session ID', async () => {
      const ctx = await accounts.bootstrap(cookie.split('=')[1]);
      const old = unseal(ctx.session.provider_tokens, config.encryptionKey, `session:${ctx.session.id}`);
      const refreshed = await provider.refresh(old.refresh_token);
      assert.equal(claims(refreshed.access_token).aal, 'aal2');
      assert.equal(claims(refreshed.access_token).session_id, ctx.session.provider_session_id);
      await db.query('update accounts.sessions set provider_tokens=$2 where id=$1', [ctx.session.id, seal(refreshed, config.encryptionKey, `session:${ctx.session.id}`)]);
    });
    await t.test('sensitive superadmin step-up needs both fresh password and TOTP', async () => {
      const ctx = await accounts.bootstrap(cookie.split('=')[1]);
      await admin.query("update accounts.sessions set authenticated_at=now()-interval '10 minutes' where id=$1", [ctx.session.id]);
      assert.equal((await request('/admin/registration', 'PATCH', { mode: 'closed' })).status, 428);
      assert.equal((await request('/reauthenticate', 'POST', { password: secret })).status, 403);
      const result = await request('/reauthenticate', 'POST', { password: secret, factorId: enrollment.factorId, code: totp(enrollment.secret) });
      assert.equal(result.status, 200, result.body.error?.code); await request('/session');
      accounts.requireAdmin(await accounts.bootstrap(cookie.split('=')[1]), true);
    });
    await t.test('new sign-in for an enrolled user stays restricted until a fresh factor challenge', async () => {
      const result = await request('/login', 'POST', { email: address, password: secret });
      assert.equal(result.body.user, null); assert.deepEqual(result.body.mfa, { mode: 'challenge' }); await request('/session');
      assert.equal((await request('/apps')).status, 401);
      assert.equal((await request('/mfa/enroll', 'POST', {})).status, 409);
      const done = await request('/mfa/verify', 'POST', { factorId: enrollment.factorId, code: totp(enrollment.secret) });
      assert.equal(done.status, 200, done.body.error?.code); await request('/session');
    });
    await t.test('real OAuth delegation after central AAL2 consent is measured explicitly', async () => {
      const callback = `https://mfa-app.example.invalid/callback/${suffix}`;
      client = await provider.call('/admin/oauth/clients', 'POST', { client_name: `MFA fixture ${suffix}`, client_type: 'confidential', token_endpoint_auth_method: 'client_secret_post', redirect_uris: [callback] });
      appId = `app_mfa_${suffix}`;
      await admin.query("insert into core.apps(id,name,base_path,status) values($1,'MFA fixture',$2,'ACTIVE')", [appId, `/${appId}`]);
      await admin.query("insert into accounts.app_settings(app_id,slug,server_key_hash,launch_url,published,join_policy) values($1,$2,$3,'https://mfa-app.example.invalid/login',true,'free')", [appId, `mfa-${suffix}`, hash(randomBytes(32).toString('base64url'))]);
      await admin.query("insert into accounts.oauth_clients(client_id,app_id,client_kind,callback_url) values($1,$2,'web',$3)", [client.client_id, appId, callback]);
      const verifier = randomBytes(32).toString('base64url'), params = new URLSearchParams({ client_id: client.client_id, redirect_uri: callback, response_type: 'code', scope: 'openid email profile', state: randomBytes(16).toString('hex'), nonce: randomBytes(16).toString('hex'), code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
      const begin = await fetch(provider.url + '/oauth/authorize?' + params, { redirect: 'manual' });
      assert.equal(begin.status, 302);
      const authorizationId = new URL(begin.headers.get('location')).searchParams.get('authorization_id');
      const consent = await request('/authorize', 'POST', { authorizationId, approve: true });
      assert.equal(consent.status, 200, consent.body.error?.code);
      const code = new URL(consent.body.redirectUrl).searchParams.get('code');
      const response = await fetch(config.origin + '/oauth/token', { method: 'POST', body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, grant_type: 'authorization_code', code, redirect_uri: callback, code_verifier: verifier }) });
      assert.equal(response.status, 200);
      const bundle = await response.json(), delegated = claims(bundle.access_token);
      assert.equal(delegated.sub, user.id); assert.equal(delegated.client_id, client.client_id);
      t.diagnostic(`Verified provider OAuth delegation assurance: ${delegated.aal}`);
      assert.equal(delegated.aal, 'aal1', 'v2.189 delegates AAL1 after MFA-checked consent; do not claim downstream AAL2');
    });
    await t.test('ordinary users opt into setup with a fresh password and are restricted until verified', async () => {
      const normalEmail = `mfa-normal-${suffix}@example.invalid`;
      const normal = await provider.call('/admin/users', 'POST', { email: normalEmail, password: secret, email_confirm: true });
      await admin.query("update core.profiles set role='USER' where id=$1", [normal.id]);
      const login = await request('/login', 'POST', { email: normalEmail, password: secret });
      assert.equal(login.status, 200); assert.equal(login.body.user.id, normal.id); assert.equal(login.body.mfa, null);
      await request('/session');
      assert.equal((await request('/mfa')).body.required, false);
      assert.equal((await request('/mfa/enroll', 'POST', {})).status, 400);
      const setup = await request('/mfa/enroll', 'POST', { password: secret });
      assert.equal(setup.status, 200, setup.body.error?.code);
      const pending = await request('/session'); assert.equal(pending.body.user, null); assert.equal(pending.body.mfa.mode, 'enroll');
      assert.equal((await request('/apps')).status, 401);
      const verified = await request('/mfa/verify', 'POST', { factorId: setup.body.factorId, code: totp(setup.body.secret) });
      assert.equal(verified.status, 200, verified.body.error?.code); assert.equal(verified.body.user.id, normal.id);
      await request('/session');
      assert.equal((await request('/mfa')).body.enabled, true);
      assert.equal((await request('/admin/users')).status, 403);
    });
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    if (client) {
      await admin.query('delete from accounts.browser_delegations where client_id=$1', [client.client_id]);
      await admin.query('delete from accounts.oauth_code_bindings where client_id=$1', [client.client_id]);
      await admin.query('delete from accounts.oauth_clients where client_id=$1', [client.client_id]); await provider.call(`/admin/oauth/clients/${client.client_id}`, 'DELETE').catch(() => {});
    }
    if (appId) {
      for (const table of ['accounts.entitlements', 'core.app_access', 'accounts.app_settings']) await admin.query(`delete from ${table} where app_id=$1`, [appId]);
      await admin.query('delete from core.apps where id=$1', [appId]);
    }
    await Promise.all([admin.end(), db.pool.end()]);
    // Fake identity/audit and unique fixture roles live only in the disposable pair.
  }
});
