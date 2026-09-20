// Opt-in ONLY against the labeled disposable GoTrue qualification pair. Never
// accepts a database URL, live container name, production key, or real recipient.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createPrivateKey, sign } from 'node:crypto';
import pg from 'pg';
import { Accounts } from '../dist/accounts.js';
import { Database } from '../dist/db.js';
import { Provider } from '../dist/provider.js';
import { createAccountServer } from '../dist/http.js';
import { hash, token, unseal, seal } from '../dist/security.js';

const container = process.env.ACCOUNTS_TEST_CONTAINER;
test('isolated real-provider account lifecycle, report privacy, DB grants and policy gates', { skip: !container, timeout: 120000 }, async t => {
  const { createOidcClient } = await import('../../../packages/ecosystem-auth/index.mjs');
  assert.match(container, /^developed-identity-test-\d+-db$/);
  const inspect = name => JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }))[0];
  const metadata = inspect(container);
  assert.equal(metadata.Config.Labels['developed.identity.qualification'], 'true');
  const authName = container.replace(/-db$/, '-auth'), authMetadata = inspect(authName);
  assert.equal(authMetadata.Config.Labels['developed.identity.qualification'], 'true');
  const env = Object.fromEntries(authMetadata.Config.Env.map(entry => [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)]));
  const ip = Object.values(metadata.NetworkSettings.Networks)[0].IPAddress;
  const authPort = authMetadata.NetworkSettings.Ports['9999/tcp'][0].HostPort;
  const randomPassword = randomBytes(32).toString('hex');
  const setup = `alter role developed_accounts login password '${randomPassword}';
    do $$ begin if not exists(select 1 from pg_roles where rolname='developed_fixture_admin') then create role developed_fixture_admin login superuser; end if; end $$;
    alter role developed_fixture_admin password '${randomPassword}';
    do $$ begin if not exists(select 1 from pg_trigger where tgname='developed_fixture_profile') then
      create trigger developed_fixture_profile after insert on auth.users for each row execute function core.handle_new_user(); end if; end $$;`;
  execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: setup, stdio: ['pipe', 'pipe', 'pipe'] });
  const admin = new pg.Pool({ connectionString: `postgres://developed_fixture_admin:${randomPassword}@${ip}:5432/postgres`, max: 2 });
  const db = new Database(`postgres://developed_accounts:${randomPassword}@${ip}:5432/postgres`);
  const base64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const fixtureKey = JSON.parse(env.GOTRUE_JWT_KEYS)[0];
  const header = base64({ alg: 'ES256', kid: fixtureKey.kid, typ: 'JWT' }), payload = base64({ role: 'service_role', aud: 'authenticated', exp: Math.floor(Date.now()/1000)+600 });
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key: createPrivateKey({ key: fixtureKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const adminToken = `${header}.${payload}.${signature}`;
  let providerFailure = '', refreshCount = 0;
  const provider = new Provider(`http://127.0.0.1:${authPort}`, adminToken, async (url, options) => {
    if (String(url).includes('/token?grant_type=refresh_token')) refreshCount++;
    const response = await fetch(url, options);
    if (!response.ok) {
      const error = await response.clone().json().catch(() => ({}));
      providerFailure = `HTTP ${response.status} ${error.error_code || error.code || 'unknown'}`;
    }
    return response;
  });
  const config = { origin: 'http://127.0.0.1:31499', providerUrl: provider.url, providerKey: adminToken,
    databaseUrl: '', encryptionKey: randomBytes(32), port: 31499, insecureLocal: true,
    mailjetKey: '', mailjetSecret: '', supportEmail: 'info@developed.sk', mailEnabled: false, dailyEmailLimit: 10000, hourlyRegistrationLimit: 1000 };
  const accounts = new Accounts(db, provider, config), server = createAccountServer(accounts);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; config.origin = origin;
  let cookie = '', csrf = '';
  const request = async (path, method = 'GET', data, overrides = {}) => {
    const response = await fetch(`${origin}/api/account${path}`, { method, headers: {
      Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...overrides,
    }, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
    const result = await response.json();
    if (result.csrfToken) csrf = result.csrfToken;
    return { status: response.status, data: result, headers: response.headers };
  };
  const address = `central-${randomUUID()}@example.invalid`, secret = '  cafe\u0301 account password  ';
  let userId;
  let delegatedAccess, delegatedApp;
  let activeEmail = address;
  try {
    await t.test('private role cannot read password hashes, app data or mutate platform roles', async () => {
      await assert.rejects(db.query('select encrypted_password from auth.users'));
      await assert.rejects(db.query("update core.profiles set role='SUPERADMIN'"));
      await assert.rejects(db.query('delete from accounts.audit'));
      const rows = await db.query('select registration_mode from accounts.settings'); assert.equal(rows.length, 1);
    });
    await t.test('CSRF, secure headers, JSON and mutation origin are enforced', async () => {
      const session = await request('/session'); assert.equal(session.status, 200); assert.equal(session.data.user, null);
      assert.match(session.headers.get('cache-control'), /no-store/);
      assert.equal((await request('/register', 'POST', {}, { Origin: 'https://evil.invalid' })).status, 403);
      assert.equal((await request('/register', 'POST', {}, { 'X-CSRF-Token': 'é'.repeat(csrf.length) })).status, 403);
      assert.equal((await request('/register', 'POST', {}, { 'Content-Type': 'text/plain' })).status, 415);
    });
    await t.test('closed registration denies and open signup requires confirmation', async () => {
      await admin.query("update accounts.settings set registration_mode='closed'");
      assert.equal((await request('/register', 'POST', { email: address, password: secret, displayName: 'Test' })).status, 403);
      await admin.query("update accounts.settings set registration_mode='open'");
      const response = await request('/register', 'POST', { email: address, password: secret, displayName: 'Test', language: 'sk' });
      assert.equal(response.status, 200); assert.equal(response.data.accepted, true);
      const rows = await admin.query('select id,email_confirmed_at from auth.users where email=$1', [address]);
      assert.equal(rows.rows.length, 1, `Provider create failed: ${providerFailure}`);
      userId = rows.rows[0].id; assert.equal(rows.rows[0].email_confirmed_at, null);
      assert.equal((await request('/login', 'POST', { email: address, password: secret })).status, 401);
    });
    await t.test('mail uses fragment token; explicit confirmation is single use and preserves UUID', async () => {
      const row = (await admin.query('select id,payload from accounts.outbox order by created_at desc limit 1')).rows[0];
      const mail = unseal(row.payload, config.encryptionKey, `mail:${row.id}`);
      assert.equal(mail.to, address); assert.ok(!mail.text.includes(secret));
      const raw = mail.text.match(/#token=([A-Za-z0-9_-]+)/)[1];
      const before = await fetch(`${origin}/verify-email#token=${raw}`); assert.equal(before.status, 200);
      assert.equal((await admin.query('select email_confirmed_at from auth.users where id=$1', [userId])).rows[0].email_confirmed_at, null);
      const response = await request('/verify-email', 'POST', { token: raw }); assert.equal(response.status, 200, JSON.stringify(response.data));
      assert.equal((await request('/verify-email', 'POST', { token: raw })).status, 400);
      assert.ok((await admin.query('select email_confirmed_at from auth.users where id=$1', [userId])).rows[0].email_confirmed_at);
    });
    await t.test('raw Unicode password logs in; login rotates session and CSRF', async () => {
      const prior = cookie, priorCsrf = csrf;
      const result = await request('/login', 'POST', { email: address, password: secret });
      assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(result.data.user.id, userId); assert.notEqual(cookie, prior);
      await request('/session'); assert.notEqual(csrf, priorCsrf);
      assert.equal((await request('/admin/users')).status, 403);
      assert.equal((await request('/profile', 'PATCH', { displayName: 'New name', language: 'uk', role: 'SUPERADMIN' })).status, 200);
      assert.equal((await request('/session')).data.user.role, 'USER');
      const home = await fetch(`${origin}/`, { headers: { Cookie: cookie }, redirect: 'manual' });
      assert.equal(home.status, 303); assert.equal(home.headers.get('location'), '/apps');
      assert.match(home.headers.get('cache-control'), /no-store/);
    });
    await t.test('report identity cannot be forged; unknown source denied; retry is idempotent', async () => {
      assert.equal((await request('/reports/source/unknown')).status, 404);
      const data = { appSlug: 'developed', description: '<script>bad()</script>', idempotencyKey: randomUUID(), userId: randomUUID(), contactEmail: 'forged@example.invalid', diagnostics: { screen: 'login', token: 'hidden' } };
      const first = await request('/reports', 'POST', data), second = await request('/reports', 'POST', data);
      assert.equal(first.status, 201); assert.equal(second.status, 201); assert.equal(first.data.reference, second.data.reference);
      const row = (await admin.query('select reporter_id,contact_email,diagnostics from accounts.reports where ticket=$1', [first.data.reference.slice(4)])).rows[0];
      assert.equal(row.reporter_id, userId); assert.equal(row.contact_email, address); assert.deepEqual(row.diagnostics, { screen: 'login' });
      assert.equal((await request('/reports', 'POST', { ...data, description: 'changed' })).status, 409);
    });
    await t.test('verified superadmin actions require recent reauth, report notes stay private', async () => {
      await admin.query("update core.profiles set role='SUPERADMIN' where id=$1", [userId]);
      assert.equal((await request('/admin/users')).status, 200);
      await admin.query("update accounts.sessions set authenticated_at=now()-interval '10 minutes' where user_id=$1", [userId]);
      assert.equal((await request('/admin/registration', 'PATCH', { mode: 'invitation' })).status, 428);
      assert.equal((await request('/reauthenticate', 'POST', { password: secret })).status, 200); await request('/session');
      assert.equal((await request('/admin/registration', 'PATCH', { mode: 'invitation' })).status, 200);
      const reports = await request('/admin/reports'); const report = reports.data.reports.find(r => r.reporterId === userId);
      assert.equal((await request(`/admin/reports/${report.id}`, 'PATCH', { status: 'in_progress', note: 'Private note' })).status, 200);
      assert.equal((await request('/admin/reports')).data.reports.find(r => r.id === report.id).notes[0].note, 'Private note');
    });
    await t.test('central authorization gates real OIDC, provisions free access and enforces client/RLS binding', async () => {
      const callback = `https://music.example.invalid/auth/callback/${randomUUID()}`;
      const client = await provider.call('/admin/oauth/clients', 'POST', { client_name: 'Central integration fixture', client_type: 'confidential', token_endpoint_auth_method: 'client_secret_post', redirect_uris: [callback] });
      const id = `app_test_${randomUUID().replaceAll('-', '')}`, slug = `test-${randomUUID()}`, serverKey = token();
      delegatedApp = { id, serverKey };
      await admin.query("insert into core.apps(id,name,base_path,status) values($1,'Fixture app',$2,'ACTIVE')", [id, `/${id}`]);
      await admin.query(`insert into accounts.app_settings(app_id,slug,oauth_client_id,server_key_hash,launch_url,callback_url,join_policy,reportable,enforce_oidc)
        values($1,$2,$3,$4,'https://music.example.invalid/auth/login',$5,'free',true,true)`, [id, slug, client.client_id, hash(serverKey), callback]);
      await admin.query("insert into accounts.oauth_clients(client_id,app_id,client_kind,callback_url) values($1,$2,'web',$3)", [client.client_id,id,callback]);
      const store = new Map(), externalIssuer = 'http://127.0.0.1:9999';
      const rp = createOidcClient({ issuer: externalIssuer, clientId: client.client_id, clientSecret: client.client_secret, redirectUri: callback,
        allowLoopbackHttp: true, fetch: (url, options) => fetch(String(url).replace(externalIssuer, provider.url), options),
        store: { create: async (key, value) => store.set(key, value), consume: async key => { const value = store.get(key); store.delete(key); return value; } } });
      const begin = async () => {
        const flow = await rp.begin('/library');
        const response = await fetch(flow.url.replace(externalIssuer, provider.url), { redirect: 'manual' });
        assert.equal(response.status, 302);
        return { flow, authorizationId: new URL(response.headers.get('location')).searchParams.get('authorization_id') };
      };
      let flow = await begin();
      assert.equal((await request(`/authorize?authorization_id=${flow.authorizationId}`)).status, 403);
      await admin.query('update accounts.app_settings set published=true where app_id=$1', [id]);
      const details = await request(`/authorize?authorization_id=${flow.authorizationId}`); assert.equal(details.status, 200, JSON.stringify(details.data));
      assert.equal(details.data.app.id, id);
      assert.equal(await accounts.registrationContinuation(`/account/authorize?authorization_id=${flow.authorizationId}`), id);
      assert.equal(await accounts.registrationContinuation('https://evil.invalid/account/authorize'), null);
      assert.equal(await accounts.launchAfterLogin(await accounts.bootstrap(cookie.split('=')[1]), slug), 'https://music.example.invalid/auth/login');
      const approval = await request('/authorize', 'POST', { authorizationId: flow.authorizationId, approve: true });
      assert.equal(approval.status, 200, JSON.stringify(approval.data));
      const result = await rp.complete(approval.data.redirectUrl, flow.flow.flowCookie);
      delegatedAccess = result.tokens.access_token;
      const checked = await accounts.internalCheck(serverKey, delegatedAccess);
      assert.equal(checked.user.id, userId); assert.equal(checked.app.id, id);
      assert.deepEqual(checked.client, { id: client.client_id, kind: 'web' });
      await admin.query('update accounts.oauth_clients set enabled=false where client_id=$1', [client.client_id]);
      await assert.rejects(accounts.internalCheck(serverKey, delegatedAccess), error => error.code === 'invalid_session');
      await admin.query('update accounts.oauth_clients set enabled=true where client_id=$1', [client.client_id]);
      await assert.rejects(accounts.internalCheck(token(), delegatedAccess));
      const [central] = await db.query('select provider_tokens,id from accounts.sessions where user_id=$1 and revoked_at is null order by created_at desc limit 1', [userId]);
      const raw = unseal(central.provider_tokens, config.encryptionKey, `session:${central.id}`);
      await assert.rejects(accounts.internalCheck(serverKey, raw.access_token));
      const claims = JSON.parse(Buffer.from(delegatedAccess.split('.')[1], 'base64url').toString());
      const connection = await admin.connect();
      try {
        await connection.query('begin'); await connection.query('set local role authenticated');
        await connection.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
        assert.equal((await connection.query('select accounts.app_request_allowed($1) as allowed', [id])).rows[0].allowed, true);
        await connection.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ ...claims, client_id: randomUUID() })]);
        assert.equal((await connection.query('select accounts.app_request_allowed($1) as allowed', [id])).rows[0].allowed, false);
        await assert.rejects(connection.query('select * from accounts.reports')); await connection.query('rollback');
      } finally { connection.release(); }
      // Remembered consent must still pass central publishing policy FIRST.
      flow = await begin(); await admin.query('update accounts.app_settings set published=false where app_id=$1', [id]);
      assert.equal((await request('/authorize', 'POST', { authorizationId: flow.authorizationId, approve: true })).status, 403);
      assert.equal((await admin.query('select status from auth.oauth_authorizations where authorization_id=$1', [flow.authorizationId])).rows[0].status, 'pending');
      await admin.query('update accounts.app_settings set published=true where app_id=$1', [id]);
      const approved = await request('/authorize', 'POST', { authorizationId: flow.authorizationId, approve: true }); assert.equal(approved.status, 200);
      assert.equal((await rp.complete(approved.data.redirectUrl, flow.flow.flowCookie)).identity.sub, userId);
    });
    await t.test('refresh fence serializes rotation and abandoned rotation never reuses stale credentials', async () => {
      let context = await accounts.bootstrap(cookie.split('=')[1]);
      const saved = unseal(context.session.provider_tokens, config.encryptionKey, `session:${context.session.id}`);
      const segments = saved.access_token.split('.'), payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString());
      payload.exp = 1; segments[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
      saved.access_token = segments.join('.'); // Deliberately expired cache fixture, never sent as bearer.
      await admin.query('update accounts.sessions set provider_tokens=$2 where id=$1', [context.session.id, seal(saved, config.encryptionKey, `session:${context.session.id}`)]);
      const countBefore = refreshCount;
      const results = await Promise.allSettled([accounts.providerToken(context), accounts.providerToken(context), accounts.providerToken(context)]);
      assert.ok(results.some(result => result.status === 'fulfilled'));
      assert.equal(refreshCount - countBefore, 1);
      for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.code, 'refresh_pending');
      await admin.query("update accounts.sessions set refresh_id=$2,refresh_started_at=now()-interval '2 minutes' where id=$1", [context.session.id, randomUUID()]);
      await assert.rejects(accounts.providerToken(context), error => error.code === 'invalid_session');
      assert.ok((await admin.query('select revoked_at from accounts.sessions where id=$1', [context.session.id])).rows[0].revoked_at);
      await request('/session');
      assert.equal((await request('/login', 'POST', { email: address, password: secret })).status, 200); await request('/session');
    });
    await t.test('password change revokes central sessions; old password fails; signed-out report stays anonymous', async () => {
      const next = 'a different secure password';
      const change = await request('/profile/password', 'POST', { currentPassword: secret, password: next }); assert.equal(change.status, 200, JSON.stringify(change.data));
      await assert.rejects(accounts.internalCheck(delegatedApp.serverKey, delegatedAccess));
      assert.equal((await accounts.internalUserCheck(delegatedApp.serverKey, userId)).user.id, userId, 'independent credentials survive interactive revocation');
      assert.equal((await request('/session')).data.user, null);
      assert.equal((await request('/login', 'POST', { email: address, password: secret })).status, 401);
      const report = await request('/reports', 'POST', { appSlug: 'developed', description: 'Signed out', contactEmail: address, idempotencyKey: randomUUID() });
      const saved = (await admin.query('select reporter_id,contact_verified from accounts.reports where ticket=$1', [report.data.reference.slice(4)])).rows[0];
      assert.equal(saved.reporter_id, null); assert.equal(saved.contact_verified, false);
      assert.equal((await request('/login', 'POST', { email: address, password: next })).status, 200); await request('/session');
      assert.equal((await request('/logout', 'POST', {})).status, 200); assert.equal((await request('/session')).data.user, null);
    });
    await t.test('email confirmation preserves UUID, invalidates stale recovery and changes login only after confirmation', async () => {
      const currentPassword = 'a different secure password', nextEmail = `changed-${randomUUID()}@example.invalid`;
      await request('/login', 'POST', { email: activeEmail, password: currentPassword }); await request('/session');
      await accounts.sendCredential(activeEmail, true);
      const recoveryJob = (await admin.query('select id,payload from accounts.outbox order by created_at desc limit 1')).rows[0];
      const recoveryRaw = unseal(recoveryJob.payload, config.encryptionKey, `mail:${recoveryJob.id}`).text.match(/#token=([A-Za-z0-9_-]+)/)[1];
      const change = await request('/profile/email', 'POST', { email: nextEmail, currentPassword }); assert.equal(change.status, 200, JSON.stringify(change.data));
      assert.equal((await accounts.userById(userId)).email, activeEmail);
      const job = (await admin.query('select id,payload from accounts.outbox order by created_at desc limit 1')).rows[0];
      const mail = unseal(job.payload, config.encryptionKey, `mail:${job.id}`); assert.equal(mail.to, nextEmail);
      const raw = mail.text.match(/#token=([A-Za-z0-9_-]+)/)[1];
      assert.equal((await request('/verify-email', 'POST', { token: raw })).status, 200);
      assert.equal((await accounts.userById(userId)).id, userId); assert.equal((await accounts.userById(userId)).email, nextEmail);
      await request('/session');
      assert.equal((await request('/reset-password', 'POST', { token: recoveryRaw, password: 'stale credential must fail' })).status, 400);
      assert.equal((await request('/login', 'POST', { email: activeEmail, password: currentPassword })).status, 401);
      activeEmail = nextEmail;
      assert.equal((await request('/login', 'POST', { email: activeEmail, password: currentPassword })).status, 200); await request('/session');
    });
    await t.test('recovery is single use and unlock does not resurrect sessions or independent account locks', async () => {
      await accounts.sendCredential(activeEmail, true);
      const job = (await admin.query('select id,payload from accounts.outbox order by created_at desc limit 1')).rows[0];
      const raw = unseal(job.payload, config.encryptionKey, `mail:${job.id}`).text.match(/#token=([A-Za-z0-9_-]+)/)[1];
      assert.equal((await request('/reset-password', 'POST', { token: raw, password: 'recovered secure password' })).status, 200);
      await request('/session');
      assert.equal((await request('/reset-password', 'POST', { token: raw, password: 'another secure password' })).status, 400);
      assert.equal((await request('/login', 'POST', { email: activeEmail, password: 'recovered secure password' })).status, 200); await request('/session');
      const before = cookie;
      await accounts.mutateIdentity(userId, userId, 'fixture_lock', { ban_duration: '876000h' }, q => q('update accounts.security_state set locked=true where user_id=$1', [userId]).then(() => {}));
      await assert.rejects(accounts.internalUserCheck(delegatedApp.serverKey, userId));
      assert.equal((await request('/session')).data.user, null);
      await accounts.mutateIdentity(userId, userId, 'fixture_unlock', { ban_duration: 'none' }, q => q('update accounts.security_state set locked=false where user_id=$1', [userId]).then(() => {}));
      cookie = before; assert.equal((await request('/session')).data.user, null);
      assert.equal((await request('/login', 'POST', { email: activeEmail, password: 'recovered secure password' })).status, 200);
    });
    await t.test('stale credential version cannot start a later identity mutation', async () => {
      await assert.rejects(accounts.mutateIdentity(userId, userId, 'stale_fixture', { password: 'must not get applied' }, undefined, { version: '0' }), error => error.code === 'invalid_or_expired_token');
      assert.equal((await accounts.userById(userId)).operation_id, null);
    });
  } finally {
    await new Promise(resolve => server.close(resolve)); await db.pool.end(); await admin.end();
  }
});
