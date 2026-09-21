// Run SERIAL with other opt-in DB suites, only on a labeled disposable pair.
// No existing/live URL, real recipient, production key or device is accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createPrivateKey, createHash, sign } from 'node:crypto';
import pg from 'pg';
import { Accounts } from '../dist/accounts.js';
import { Database } from '../dist/db.js';
import { Provider } from '../dist/provider.js';
import { createAccountServer } from '../dist/http.js';
import { hash } from '../dist/security.js';
import { validateNativeConfiguration, validateNativeProviderRegistration } from '../dist/native-operator.js';

const container = process.env.ACCOUNTS_TEST_CONTAINER;
test('isolated native central authorization, operator metadata, registry and RLS binding', { skip: !container, timeout: 60000 }, async t => {
  assert.match(container, /^developed-identity-test-\d+-db$/);
  const inspect = name => JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }))[0];
  const database = inspect(container), auth = inspect(container.replace(/-db$/, '-auth'));
  for (const entry of [database, auth]) assert.equal(entry.Config.Labels['developed.identity.qualification'], 'true');
  const env = Object.fromEntries(auth.Config.Env.map(entry => [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)]));
  assert.equal(new URL(env.GOTRUE_JWT_ISSUER).hostname, '127.0.0.1');
  const ip = Object.values(database.NetworkSettings.Networks)[0].IPAddress;
  const suffix = randomBytes(6).toString('hex'), password = randomBytes(32).toString('hex');
  const adminRole = `native_admin_${suffix}`, centralRole = `native_accounts_${suffix}`;
  execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: `create role ${adminRole} login superuser password '${password}';
      create role ${centralRole} login password '${password}'; grant developed_accounts to ${centralRole};
      do $$ begin if not exists(select 1 from pg_trigger where tgname='developed_fixture_profile') then
        create trigger developed_fixture_profile after insert on auth.users for each row execute function core.handle_new_user(); end if; end $$;`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const connection = role => `postgres://${role}:${password}@${ip}:5432/postgres`;
  const admin = new pg.Pool({ connectionString: connection(adminRole), max: 2 });
  const db = new Database(connection(centralRole));
  const key = JSON.parse(env.GOTRUE_JWT_KEYS)[0], b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = b64({ alg: 'ES256', kid: key.kid, typ: 'JWT' });
  const body = b64({ role: 'service_role', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 });
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), {
    key: createPrivateKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  const provider = new Provider(`http://127.0.0.1:${auth.NetworkSettings.Ports['9999/tcp'][0].HostPort}`, `${head}.${body}.${signature}`);
  const config = { origin: 'http://127.0.0.1', providerUrl: provider.url, providerKey: '', databaseUrl: '',
    encryptionKey: randomBytes(32), port: 0, insecureLocal: true, mailjetKey: '', mailjetSecret: '',
    supportEmail: 'info@developed.sk', mailEnabled: false, dailyEmailLimit: 10000, hourlyRegistrationLimit: 1000 };
  const accounts = new Accounts(db, provider, config), server = createAccountServer(accounts);
  const appId = 'app_kestrek', otherId = `app_native_other_${suffix}`, callback = 'sk.kestrek://oauth/callback';
  const appKey = randomBytes(32).toString('base64url'), otherKey = randomBytes(32).toString('base64url');
  const createdApps = [], createdClients = [];
  let cookie = '', csrf = '';
  try {
    assert.equal((await admin.query('select id from core.apps where id=$1', [appId])).rows.length, 0, 'native fixture requires no pre-existing KešTrek app in its disposable pair');
    for (const [id, serverKey] of [[appId, appKey], [otherId, otherKey]]) {
      await admin.query("insert into core.apps(id,name,base_path,status) values($1,'Native fixture',$2,'ACTIVE')", [id, `/${id}`]);
      createdApps.push(id);
      await admin.query(`insert into accounts.app_settings(app_id,slug,server_key_hash,launch_url,published,join_policy,enforce_oidc)
        values($1,$2,$3,'https://kestrek.example.invalid/login',true,'free',true)`, [id, `native-${id}-${suffix}`.replaceAll('_', '-'), hash(serverKey)]);
    }
    const client = await provider.call('/admin/oauth/clients', 'POST', { client_name: 'Native central fixture', client_type: 'public',
      token_endpoint_auth_method: 'none', redirect_uris: [callback] });
    createdClients.push(client.client_id);
    await t.test('operator validates actual provider GET metadata and rejects confidential/mismatched records', async () => {
      const requested = validateNativeConfiguration({ appId, clientId: client.client_id, callbackUrl: callback });
      const registered = await provider.call(`/admin/oauth/clients/${client.client_id}`);
      validateNativeProviderRegistration(requested, registered);
      assert.throws(() => validateNativeProviderRegistration(requested, { ...registered, client_type: 'confidential' }));
      assert.throws(() => validateNativeProviderRegistration(requested, { ...registered, token_endpoint_auth_method: 'client_secret_post' }));
      assert.throws(() => validateNativeProviderRegistration(requested, { ...registered, redirect_uris: [callback, 'sk.kestrek://oauth/other'] }));
      assert.throws(() => validateNativeProviderRegistration(requested, { ...registered, client_id: randomUUID() }));
    });
    await admin.query("insert into accounts.oauth_clients(client_id,app_id,client_kind,callback_url) values($1,$2,'native',$3)", [client.client_id, appId, callback]);
    const address = `native-${suffix}@example.invalid`, secret = `Native fixture ${randomBytes(20).toString('base64url')}`;
    const user = await provider.call('/admin/users', 'POST', { email: address, password: secret, email_confirm: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    config.origin = `http://127.0.0.1:${server.address().port}`;
    async function request(path, method = 'GET', data, headers = {}) {
      const response = await fetch(`${config.origin}/api/account${path}`, { method,
        headers: { Cookie: cookie, Origin: config.origin, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...headers },
        body: data === undefined ? undefined : JSON.stringify(data), redirect: 'manual' });
      const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
      const result = await response.json(); if (result.csrfToken) csrf = result.csrfToken;
      return { status: response.status, body: result };
    }
    assert.equal((await request('/session')).status, 200);
    assert.equal((await request('/login', 'POST', { email: address, password: secret })).status, 200);
    await request('/session');
    const verifier = randomBytes(32).toString('base64url'), state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url');
    const authorizeUrl = new URL(`${provider.url}/oauth/authorize`);
    authorizeUrl.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: callback, response_type: 'code',
      scope: 'openid email profile', state, nonce, code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
    const entry = await fetch(authorizeUrl, { redirect: 'manual' }); assert.equal(entry.status, 302);
    const authorizationId = new URL(entry.headers.get('location')).searchParams.get('authorization_id'); assert.ok(authorizationId);
    const details = await request(`/authorize?authorization_id=${authorizationId}`); assert.equal(details.status, 200);
    assert.equal(details.body.app.id, appId);
    const approved = await request('/authorize', 'POST', { authorizationId, approve: true }); assert.equal(approved.status, 200);
    const redirect = new URL(approved.body.redirectUrl);
    assert.equal(`${redirect.protocol}//${redirect.host}${redirect.pathname}`, callback); assert.equal(redirect.searchParams.get('state'), state);
    const exchange = await fetch(`${config.origin}/oauth/token`, { method: 'POST', body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: client.client_id, redirect_uri: callback,
      code: redirect.searchParams.get('code'), code_verifier: verifier,
    }) });
    assert.equal(exchange.status, 200); const issued = await exchange.json();
    const claims = JSON.parse(Buffer.from(issued.access_token.split('.')[1], 'base64url').toString());
    const gate = serverKey => request('/internal/session/check', 'POST', { accessToken: issued.access_token }, { Authorization: `Bearer ${serverKey}` });
    async function rls(expectedApp, tokenClaims = claims) {
      const connection = await admin.connect();
      try {
        await connection.query('begin'); await connection.query('set local role authenticated');
        await connection.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(tokenClaims)]);
        return (await connection.query('select accounts.app_request_allowed($1) as allowed', [expectedApp])).rows[0].allowed;
      } finally { await connection.query('rollback'); connection.release(); }
    }
    await t.test('native central HTTP gate returns exact client and app; same-app RLS allows it', async () => {
      const checked = await gate(appKey); assert.equal(checked.status, 200);
      assert.equal(checked.body.user.id, user.id); assert.equal(checked.body.app.id, appId);
      assert.deepEqual(checked.body.client, { id: client.client_id, kind: 'native' });
      assert.equal(await rls(appId), true);
    });
    await t.test('other app credentials, unbound tokens and mismatched client claims are denied', async () => {
      assert.equal((await gate(otherKey)).status, 401); assert.equal(await rls(otherId), false);
      assert.equal(await rls(appId, { ...claims, client_id: randomUUID() }), false);
      const unbound = await provider.login(address, secret);
      await assert.rejects(accounts.internalCheck(appKey, unbound.access_token), error => error.code === 'invalid_session');
      assert.equal(await rls(appId, JSON.parse(Buffer.from(unbound.access_token.split('.')[1], 'base64url').toString())), false);
      await provider.logout(unbound.access_token, 'local');
    });
    await t.test('disabling native registry row denies central gate and RLS without changing UUID', async () => {
      await admin.query('update accounts.oauth_clients set enabled=false where client_id=$1', [client.client_id]);
      assert.equal((await gate(appKey)).status, 401); assert.equal(await rls(appId), false);
      await admin.query('update accounts.oauth_clients set enabled=true where client_id=$1', [client.client_id]);
      assert.equal((await gate(appKey)).status, 200); assert.equal(await rls(appId), true);
    });
    await t.test('browser-family logout preserves native API, RLS, refresh and userinfo; global logout denies native too', async () => {
      const before = (await admin.query('select browser_binding_required from accounts.settings where singleton')).rows[0].browser_binding_required;
      try {
        await admin.query('update accounts.settings set browser_binding_required=true where singleton');
        assert.equal((await request('/logout', 'POST', {})).status, 200);
        assert.equal((await gate(appKey)).status, 200); assert.equal(await rls(appId), true);
        const refresh = await fetch(`${config.origin}/oauth/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id: client.client_id, refresh_token: issued.refresh_token }) });
        assert.equal(refresh.status, 200);
        const refreshed = await refresh.json();
        const userinfo = await fetch(`${config.origin}/oauth/userinfo`, { headers: { Authorization: `Bearer ${refreshed.access_token}` } });
        assert.equal(userinfo.status, 200);
        await request('/session');
        assert.equal((await request('/login', 'POST', { email: address, password: secret })).status, 200); await request('/session');
        assert.equal((await request('/logout-all', 'POST', {})).status, 200);
        assert.equal((await gate(appKey)).status, 401); assert.equal(await rls(appId), false);
      } finally { await admin.query('update accounts.settings set browser_binding_required=$1 where singleton', [before]); }
    });
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    for (const id of createdClients) {
      await admin.query('delete from accounts.browser_delegations where client_id=$1', [id]);
      await admin.query('delete from accounts.oauth_code_bindings where client_id=$1', [id]);
      await admin.query('delete from accounts.oauth_clients where client_id=$1', [id]);
      await provider.call(`/admin/oauth/clients/${id}`, 'DELETE').catch(() => {});
    }
    for (const id of createdApps.reverse()) {
      await admin.query('delete from accounts.entitlements where app_id=$1', [id]);
      await admin.query('delete from core.app_access where app_id=$1', [id]);
      await admin.query('delete from accounts.app_settings where app_id=$1', [id]);
      await admin.query('delete from core.apps where id=$1', [id]);
    }
    await Promise.all([admin.end(), db.pool.end()]);
    // Fixture roles/user/audit remain only until this disposable pair is removed.
  }
});
