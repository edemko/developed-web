// Opt-in real GoTrue/Postgres only in the labeled disposable qualification pair.
// Two independent cookies and two actual OAuth grants; no mail or live settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createPrivateKey, sign } from 'node:crypto';
import pg from 'pg';
import { Accounts } from '../dist/accounts.js';
import { Database } from '../dist/db.js';
import { Provider } from '../dist/provider.js';
import { createAccountServer } from '../dist/http.js';
import { claims, hash, token } from '../dist/security.js';

const container = process.env.ACCOUNTS_TEST_CONTAINER;
test('isolated portal-local and explicit global logout preserve correct independent session boundaries', { skip: !container, timeout: 90000 }, async t => {
  const { createOidcClient } = await import('../../../packages/ecosystem-auth/index.mjs');
  assert.match(container, /^developed-identity-test-\d+-db$/);
  const inspect = name => JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }))[0];
  const database = inspect(container), authContainer = inspect(container.replace(/-db$/, '-auth'));
  for (const item of [database, authContainer]) assert.equal(item.Config.Labels['developed.identity.qualification'], 'true');
  const env = Object.fromEntries(authContainer.Config.Env.map(value => [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)]));
  assert.equal(new URL(env.GOTRUE_JWT_ISSUER).hostname, '127.0.0.1');
  const suffix = randomBytes(6).toString('hex'), password = randomBytes(32).toString('hex');
  const adminRole = `logout_admin_${suffix}`, centralRole = `logout_central_${suffix}`;
  execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: `create role ${adminRole} login superuser password '${password}'; create role ${centralRole} login password '${password}'; grant developed_accounts to ${centralRole};`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const ip = Object.values(database.NetworkSettings.Networks)[0].IPAddress;
  const admin = new pg.Pool({ connectionString: `postgres://${adminRole}:${password}@${ip}:5432/postgres`, max: 2 });
  const db = new Database(`postgres://${centralRole}:${password}@${ip}:5432/postgres`);
  const key = JSON.parse(env.GOTRUE_JWT_KEYS)[0], b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = b64({ alg: 'ES256', kid: key.kid, typ: 'JWT' }), body = b64({ role: 'service_role', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 });
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), { key: createPrivateKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const provider = new Provider(`http://127.0.0.1:${authContainer.NetworkSettings.Ports['9999/tcp'][0].HostPort}`, `${head}.${body}.${signature}`);
  const config = { origin: 'http://127.0.0.1', encryptionKey: randomBytes(32), insecureLocal: true, supportEmail: 'info@developed.sk', mailEnabled: false, dailyEmailLimit: 1000, hourlyRegistrationLimit: 1000 };
  const accounts = new Accounts(db, provider, config), server = createAccountServer(accounts);
  let user, client, appId;
  try {
    const address = `logout-${suffix}@example.invalid`, secret = `Logout fixture ${randomBytes(24).toString('base64url')}`;
    user = await provider.call('/admin/users', 'POST', { email: address, password: secret, email_confirm: true });
    await admin.query("update core.profiles set role='USER' where id=$1", [user.id]);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    config.origin = `http://127.0.0.1:${server.address().port}`;
    const browser = () => ({ cookie: '', csrf: '' });
    const a = browser(), b = browser();
    async function request(browser, path, method = 'GET', data, headers = {}) {
      const response = await fetch(`${config.origin}/api/account${path}`, { method,
        headers: { Cookie: browser.cookie, Origin: config.origin, 'X-CSRF-Token': browser.csrf, 'Content-Type': 'application/json', ...headers },
        ...(data ? { body: JSON.stringify(data) } : {}), redirect: 'manual' });
      const set = response.headers.get('set-cookie'); if (set) browser.cookie = set.split(';')[0];
      const body = await response.json(); if (body.csrfToken) browser.csrf = body.csrfToken;
      return { status: response.status, body };
    }
    for (const browser of [a, b]) {
      await request(browser, '/session');
      assert.equal((await request(browser, '/login', 'POST', { email: address, password: secret })).status, 200);
      assert.equal((await request(browser, '/session')).body.user.id, user.id);
    }
    const ctxA = await accounts.bootstrap(a.cookie.split('=')[1]), ctxB = await accounts.bootstrap(b.cookie.split('=')[1]);
    assert.notEqual(ctxA.session.provider_session_id, ctxB.session.provider_session_id);
    const callback = `https://logout.example.invalid/callback/${suffix}`;
    client = await provider.call('/admin/oauth/clients', 'POST', { client_name: 'Logout fixture', client_type: 'confidential', token_endpoint_auth_method: 'client_secret_post', redirect_uris: [callback] });
    appId = `app_logout_${suffix}`;
    const serverKey = token();
    await admin.query("insert into core.apps(id,name,base_path,status) values($1,'Logout fixture',$2,'ACTIVE')", [appId, `/${appId}`]);
    await admin.query(`insert into accounts.app_settings(app_id,slug,oauth_client_id,server_key_hash,launch_url,callback_url,join_policy,published,enforce_oidc)
      values($1,$2,$3,$4,'https://logout.example.invalid/login',$5,'free',true,true)`, [appId, `logout-${suffix}`, client.client_id, hash(serverKey), callback]);
    await admin.query("insert into accounts.oauth_clients(client_id,app_id,client_kind,callback_url) values($1,$2,'web',$3)", [client.client_id, appId, callback]);
    async function delegate(browser) {
      const store = new Map(), issuer = env.GOTRUE_JWT_ISSUER;
      const rp = createOidcClient({ issuer, clientId: client.client_id, clientSecret: client.client_secret, redirectUri: callback,
        allowLoopbackHttp: true, fetch: (url, options) => fetch(String(url).replace(issuer, provider.url), options),
        store: { create: async (key, value) => store.set(key, value), consume: async key => { const value = store.get(key); store.delete(key); return value; } } });
      const flow = await rp.begin();
      const response = await fetch(flow.url.replace(issuer, provider.url), { redirect: 'manual' });
      assert.equal(response.status, 302);
      const authorizationId = new URL(response.headers.get('location')).searchParams.get('authorization_id');
      const approved = await request(browser, '/authorize', 'POST', { authorizationId, approve: true });
      assert.equal(approved.status, 200);
      const delegated = await rp.complete(approved.body.redirectUrl, flow.flowCookie);
      assert.equal((await accounts.internalCheck(serverKey, delegated.tokens.access_token)).user.id, user.id);
      return delegated;
    }
    const delegatedA = await delegate(a), delegatedB = await delegate(b);
    assert.notEqual(delegatedA.accessClaims.session_id, delegatedB.accessClaims.session_id);
    async function rls(access) {
      const connection = await admin.connect();
      try {
        await connection.query('begin'); await connection.query('set local role authenticated');
        await connection.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims(access))]);
        const allowed = (await connection.query('select accounts.app_request_allowed($1) as allowed', [appId])).rows[0].allowed;
        await connection.query('rollback'); return allowed;
      } finally { connection.release(); }
    }
    const initialSecurity = (await admin.query('select security_version,revoked_before from accounts.security_state where user_id=$1', [user.id])).rows[0];
    const oldCookieA = a.cookie;
    await t.test('local logout denies its stale portal cookie, preserves another browser and both independent product sessions', async () => {
      assert.equal((await request(a, '/logout', 'POST', {}, { 'X-CSRF-Token': 'wrong' })).status, 403);
      assert.equal((await request(a, '/logout', 'POST', {})).status, 200);
      assert.equal((await accounts.bootstrap(oldCookieA.split('=')[1])).user, null);
      assert.equal((await request(a, '/session')).body.user, null);
      assert.equal((await request(b, '/session')).body.user.id, user.id);
      assert.equal((await admin.query('select count(*)::int as n from auth.sessions where id=$1', [ctxA.session.provider_session_id])).rows[0].n, 0);
      assert.equal((await admin.query('select count(*)::int as n from auth.sessions where id=$1', [ctxB.session.provider_session_id])).rows[0].n, 1);
      assert.deepEqual((await admin.query('select security_version,revoked_before from accounts.security_state where user_id=$1', [user.id])).rows[0], initialSecurity);
      for (const delegated of [delegatedA, delegatedB]) {
        assert.equal((await accounts.internalCheck(serverKey, delegated.tokens.access_token)).user.id, user.id);
        assert.equal(await rls(delegated.tokens.access_token), true);
      }
    });
    await t.test('explicit global logout denies both delegated sessions and RLS; independent device credential access remains', async () => {
      assert.equal((await request(b, '/logout-all', 'POST', {}, { 'X-CSRF-Token': 'wrong' })).status, 403);
      assert.equal((await request(b, '/logout-all', 'POST', {})).status, 200);
      assert.equal((await request(b, '/session')).body.user, null);
      for (const delegated of [delegatedA, delegatedB]) {
        await assert.rejects(accounts.internalCheck(serverKey, delegated.tokens.access_token));
        assert.equal(await rls(delegated.tokens.access_token), false);
      }
      assert.equal((await accounts.internalUserCheck(serverKey, user.id)).user.id, user.id);
      assert.equal((await request(a, '/logout-all', 'POST', {})).status, 401);
    });
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    if (client) {
      await admin.query('delete from accounts.oauth_clients where client_id=$1', [client.client_id]);
      await provider.call(`/admin/oauth/clients/${client.client_id}`, 'DELETE').catch(() => {});
    }
    if (appId) {
      for (const table of ['accounts.entitlements', 'core.app_access', 'accounts.app_settings']) await admin.query(`delete from ${table} where app_id=$1`, [appId]);
      await admin.query('delete from core.apps where id=$1', [appId]);
    }
    await Promise.all([admin.end(), db.pool.end()]);
    // Unique fake identities/audit and fixture roles remain only in the disposable pair.
  }
});
