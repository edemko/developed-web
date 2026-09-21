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
test('isolated browser-family and explicit global logout preserve correct independent session boundaries', { skip: !container, timeout: 90000 }, async t => {
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
  let user, client, appId, originalBindingRequired;
  try {
    originalBindingRequired = (await admin.query('select browser_binding_required from accounts.settings where singleton')).rows[0].browser_binding_required;
    await admin.query('update accounts.settings set browser_binding_required=true where singleton');
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
    assert.notEqual(ctxA.session.browser_family_id, ctxB.session.browser_family_id);
    const callback = `https://logout.example.invalid/callback/${suffix}`;
    client = await provider.call('/admin/oauth/clients', 'POST', { client_name: 'Logout fixture', client_type: 'confidential', token_endpoint_auth_method: 'client_secret_post', redirect_uris: [callback] });
    appId = `app_logout_${suffix}`;
    const serverKey = token();
    await admin.query("insert into core.apps(id,name,base_path,status) values($1,'Logout fixture',$2,'ACTIVE')", [appId, `/${appId}`]);
    await admin.query(`insert into accounts.app_settings(app_id,slug,oauth_client_id,server_key_hash,launch_url,callback_url,join_policy,published,enforce_oidc)
      values($1,$2,$3,$4,'https://logout.example.invalid/login',$5,'free',true,true)`, [appId, `logout-${suffix}`, client.client_id, hash(serverKey), callback]);
    await admin.query("insert into accounts.oauth_clients(client_id,app_id,client_kind,callback_url) values($1,$2,'web',$3)", [client.client_id, appId, callback]);
    async function delegate(browser, { exchange = true, broker = true } = {}) {
      const store = new Map(), issuer = env.GOTRUE_JWT_ISSUER;
      const rp = createOidcClient({ issuer, clientId: client.client_id, clientSecret: client.client_secret, redirectUri: callback,
        allowLoopbackHttp: true, fetch: (url, options) => fetch(String(url).replace(issuer,
          broker && ['/oauth/token', '/oauth/userinfo'].includes(new URL(url).pathname) ? config.origin : provider.url), options),
        store: { create: async (key, value) => store.set(key, value), consume: async key => { const value = store.get(key); store.delete(key); return value; } } });
      const flow = await rp.begin();
      const response = await fetch(flow.url.replace(issuer, provider.url), { redirect: 'manual' });
      assert.equal(response.status, 302);
      const authorizationId = new URL(response.headers.get('location')).searchParams.get('authorization_id');
      const approved = await request(browser, '/authorize', 'POST', { authorizationId, approve: true });
      assert.equal(approved.status, 200);
      if (!exchange) return { complete: () => rp.complete(approved.body.redirectUrl, flow.flowCookie) };
      const delegated = await rp.complete(approved.body.redirectUrl, flow.flowCookie);
      if (broker) assert.equal((await accounts.internalCheck(serverKey, delegated.tokens.access_token)).user.id, user.id);
      return { ...delegated, rp, code: new URL(approved.body.redirectUrl).searchParams.get('code') };
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
    await t.test('exact code binding is single-use and cannot be replayed, invented or assigned to another client', async () => {
      await assert.rejects(accounts.finalizeOAuthCode(delegatedA.code, delegatedA.tokens.access_token, client.client_id));
      await assert.rejects(accounts.finalizeOAuthCode('invented-code', delegatedA.tokens.access_token, client.client_id));
      await assert.rejects(accounts.finalizeOAuthCode(delegatedA.code, delegatedA.tokens.access_token, '00000000-0000-0000-0000-000000000000'));
      assert.equal((await admin.query('select count(*)::int as n from accounts.browser_delegations where provider_session_id=$1', [delegatedA.accessClaims.session_id])).rows[0].n, 1);
    });
    await t.test('strict activation rejects pre-existing unbound web sessions; compatibility is explicit and does not bypass tombstones', async () => {
      const legacy = await delegate(b, { broker: false });
      await assert.rejects(accounts.internalCheck(serverKey, legacy.tokens.access_token));
      assert.equal(await rls(legacy.tokens.access_token), false);
      await admin.query('update accounts.settings set browser_binding_required=false where singleton');
      try {
        assert.equal((await accounts.internalCheck(serverKey, legacy.tokens.access_token)).user.id, user.id);
        assert.equal(await rls(legacy.tokens.access_token), true);
      } finally { await admin.query('update accounts.settings set browser_binding_required=true where singleton'); }
    });
    await t.test('expired portal families lose delegated access; a fresh login cannot revive the abandoned family', async () => {
      const c = browser(); await request(c, '/session');
      assert.equal((await request(c, '/login', 'POST', { email: address, password: secret })).status, 200); await request(c, '/session');
      const old = await accounts.bootstrap(c.cookie.split('=')[1]), delegatedC = await delegate(c);
      await admin.query("update accounts.sessions set expires_at=now()-interval '1 second' where id=$1", [old.session.id]);
      await assert.rejects(accounts.internalCheck(serverKey, delegatedC.tokens.access_token));
      assert.equal(await rls(delegatedC.tokens.access_token), false);
      await request(c, '/session');
      assert.equal((await request(c, '/login', 'POST', { email: address, password: secret })).status, 200); await request(c, '/session');
      assert.notEqual((await accounts.bootstrap(c.cookie.split('=')[1])).session.browser_family_id, old.session.browser_family_id);
      assert.equal((await request(c, '/logout', 'POST', {})).status, 200);
      await assert.rejects(accounts.internalCheck(serverKey, delegatedC.tokens.access_token));
    });
    await t.test('reauthentication and password re-login rotate cookies but preserve browser family and delegated access', async () => {
      const prior = a.cookie;
      assert.equal((await request(a, '/reauthenticate', 'POST', { password: secret })).status, 200);
      await request(a, '/session');
      assert.notEqual(a.cookie, prior);
      assert.equal((await accounts.bootstrap(a.cookie.split('=')[1])).session.browser_family_id, ctxA.session.browser_family_id);
      assert.equal((await request(a, '/login', 'POST', { email: address, password: secret })).status, 200);
      await request(a, '/session');
      assert.equal((await accounts.bootstrap(a.cookie.split('=')[1])).session.browser_family_id, ctxA.session.browser_family_id);
      assert.equal((await accounts.internalCheck(serverKey, delegatedA.tokens.access_token)).user.id, user.id);
    });
    const pendingA = await delegate(a, { exchange: false });
    await t.test('browser logout denies its stale portal and app sessions, preserves the other browser and app session', async () => {
      const currentA = await accounts.bootstrap(a.cookie.split('=')[1]);
      assert.equal((await request(a, '/logout', 'POST', {}, { 'X-CSRF-Token': 'wrong' })).status, 403);
      assert.equal((await request(a, '/logout', 'POST', {})).status, 200);
      assert.equal((await accounts.bootstrap(oldCookieA.split('=')[1])).user, null);
      assert.equal((await request(a, '/session')).body.user, null);
      assert.equal((await request(b, '/session')).body.user.id, user.id);
      assert.equal((await admin.query('select count(*)::int as n from auth.sessions where id=$1', [currentA.session.provider_session_id])).rows[0].n, 0);
      assert.equal((await admin.query('select count(*)::int as n from auth.sessions where id=$1', [ctxB.session.provider_session_id])).rows[0].n, 1);
      assert.deepEqual((await admin.query('select security_version,revoked_before from accounts.security_state where user_id=$1', [user.id])).rows[0], initialSecurity);
      await assert.rejects(accounts.internalCheck(serverKey, delegatedA.tokens.access_token));
      assert.equal(await rls(delegatedA.tokens.access_token), false);
      assert.equal((await accounts.internalCheck(serverKey, delegatedB.tokens.access_token)).user.id, user.id);
      assert.equal(await rls(delegatedB.tokens.access_token), true);
      const userinfo = await fetch(`${config.origin}/oauth/userinfo`, { headers: { Authorization: `Bearer ${delegatedA.tokens.access_token}` } });
      assert.equal(userinfo.status, 401);
      await assert.rejects(delegatedA.rp.refresh(delegatedA.tokens.refresh_token, user.id));
      await assert.rejects(pendingA.complete(), 'code consented before logout must not create a usable post-logout app session');
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
      await admin.query('delete from accounts.browser_delegations where client_id=$1', [client.client_id]);
      await admin.query('delete from accounts.oauth_code_bindings where client_id=$1', [client.client_id]);
      await admin.query('delete from accounts.oauth_clients where client_id=$1', [client.client_id]);
      await provider.call(`/admin/oauth/clients/${client.client_id}`, 'DELETE').catch(() => {});
    }
    if (appId) {
      for (const table of ['accounts.entitlements', 'core.app_access', 'accounts.app_settings']) await admin.query(`delete from ${table} where app_id=$1`, [appId]);
      await admin.query('delete from core.apps where id=$1', [appId]);
    }
    if (originalBindingRequired !== undefined) await admin.query('update accounts.settings set browser_binding_required=$1 where singleton', [originalBindingRequired]);
    await Promise.all([admin.end(), db.pool.end()]);
    // Unique fake identities/audit and fixture roles remain only in the disposable pair.
  }
});
