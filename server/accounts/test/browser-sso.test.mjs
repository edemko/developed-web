// Opt-in, disposable-pair acceptance; never accepts a live database URL/key.
// Build accounts first, then set ACCOUNTS_TEST_CONTAINER and PLAYWRIGHT_MODULE
// (optionally CHROME_BIN). Run this file serially, not beside database.test.mjs.
// Real central UI/backend + GoTrue + Mega adapter/PG. The tiny product page is
// intentionally a fixture, not a claim of full Flutter/player UI qualification.
// HTTPS origins use an ephemeral loopback forwarder and browser-only DNS map;
// no host DNS/proxy/TLS configuration changes, and no mocked HTTP redirects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrivateKey, randomBytes, randomUUID, sign } from 'node:crypto';
import pg from 'pg';
import { Accounts } from '../dist/accounts.js';
import { Database } from '../dist/db.js';
import { Provider } from '../dist/provider.js';
import { createAccountServer } from '../dist/http.js';
import { hash, unseal } from '../dist/security.js';

const container = process.env.ACCOUNTS_TEST_CONTAINER;
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = server => new Promise(resolve => server.close(resolve));
const localOrigin = server => `http://127.0.0.1:${server.address().port}`;

test('isolated browser cross-site SSO, host-only cookies and central logout', {
  skip: !container || !playwrightModule, timeout: 120000,
}, async t => {
  const { createOidcClient } = await import('../../../packages/ecosystem-auth/index.mjs');
  assert.match(container, /^developed-identity-test-\d+-db$/);
  const inspect = name => JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }))[0];
  const metadata = inspect(container), authMetadata = inspect(container.replace(/-db$/, '-auth'));
  for (const entry of [metadata, authMetadata]) assert.equal(entry.Config.Labels['developed.identity.qualification'], 'true');
  const env = Object.fromEntries(authMetadata.Config.Env.map(entry => [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)]));
  const ip = Object.values(metadata.NetworkSettings.Networks)[0].IPAddress;
  const authOrigin = `http://127.0.0.1:${authMetadata.NetworkSettings.Ports['9999/tcp'][0].HostPort}`;
  const issuer = env.GOTRUE_JWT_ISSUER;
  assert.equal(new URL(issuer).hostname, '127.0.0.1');
  let centralOrigin = 'https://developed.example.test', appOrigin = 'https://music.other.test';
  let browserProviderOrigin = 'https://provider.identity.test';
  const suffix = randomBytes(6).toString('hex'), rolePassword = randomBytes(32).toString('hex');
  const adminRole = `browser_admin_${suffix}`, centralRole = `browser_accounts_${suffix}`, musicRole = `browser_music_${suffix}`;
  // Generated roles do not alter passwords used by another qualification test.
  execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: `create role ${adminRole} login superuser password '${rolePassword}';
      create role ${centralRole} login password '${rolePassword}'; grant developed_accounts to ${centralRole};
      do $$ begin if not exists(select 1 from pg_roles where rolname='mega_music_web') then create role mega_music_web nologin; end if; end $$;
      create role ${musicRole} login password '${rolePassword}'; grant mega_music_web to ${musicRole};
      do $$ begin if not exists(select 1 from pg_trigger where tgname='developed_fixture_profile') then
        create trigger developed_fixture_profile after insert on auth.users for each row execute function core.handle_new_user(); end if; end $$;`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const connection = role => `postgres://${role}:${rolePassword}@${ip}:5432/postgres`;
  const admin = new pg.Pool({ connectionString: connection(adminRole), max: 2 });
  const db = new Database(connection(centralRole));
  const musicPool = new pg.Pool({ connectionString: connection(musicRole), max: 3 });
  const fixtureKey = JSON.parse(env.GOTRUE_JWT_KEYS)[0];
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = b64({ alg: 'ES256', kid: fixtureKey.kid, typ: 'JWT' });
  const payload = b64({ role: 'service_role', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 });
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey({ key: fixtureKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  const providerFailures = [];
  const provider = new Provider(authOrigin, `${header}.${payload}.${signature}`, async (url, options) => {
    const response = await fetch(url, options);
    if (new URL(url).pathname === '/user' && !response.ok) {
      const result = await response.clone().json().catch(() => ({}));
      const code = typeof result.error_code === 'string' && /^[a-z_]{1,60}$/.test(result.error_code) ? result.error_code : 'unknown';
      providerFailures.push(`/user HTTP ${response.status} ${code}`);
    }
    return response;
  });
  const config = { origin: centralOrigin, providerUrl: provider.url, providerKey: '', databaseUrl: '',
    encryptionKey: randomBytes(32), port: 0, insecureLocal: false, mailjetKey: '', mailjetSecret: '',
    supportEmail: 'info@developed.sk', mailEnabled: false, dailyEmailLimit: 10000, hourlyRegistrationLimit: 1000 };
  const centralServer = createAccountServer(new Accounts(db, provider, config));
  let browser, appServer, secureServer, userId, clientId, registryConfigured = false;
  let originalApp, originalRegistrationMode;
  const pageErrors = [], unexpectedRequests = [], adapterErrors = [], transportTrace = [];
  try {
    // Disposable TLS key is generated in a private temp directory, loaded, then
    // immediately unlinked. It is unrelated to every runtime/provider key.
    const tlsDir = mkdtempSync(join(tmpdir(), 'developed-browser-tls-'));
    const keyPath = join(tlsDir, 'fixture-key.pem');
    let key, cert;
    try {
      cert = execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
        '-subj', '/CN=developed.example.test', '-addext', 'subjectAltName=DNS:developed.example.test,DNS:music.other.test,DNS:provider.identity.test',
        '-keyout', keyPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      key = readFileSync(keyPath);
    } finally { try { unlinkSync(keyPath); } catch {} rmdirSync(tlsDir); }
    let forward = (_req, res) => { res.writeHead(503); res.end(); };
    secureServer = createHttpsServer({ key, cert }, (req, res) => void forward(req, res));
    await listen(secureServer);
    const tlsPort = secureServer.address().port;
    centralOrigin += `:${tlsPort}`; appOrigin += `:${tlsPort}`; browserProviderOrigin += `:${tlsPort}`;
    config.origin = centralOrigin;
    const existing = await admin.query("select * from accounts.app_settings where app_id='app_mega_music'");
    originalApp = existing.rows[0];
    const app = await admin.query("select id from core.apps where id='app_mega_music'");
    if (!app.rows.length) {
      await admin.query("insert into core.apps(id,name,base_path,status) values('app_mega_music','Mega Music','/music','ACTIVE')");
    } else {
      assert.equal((await admin.query("select status from core.apps where id='app_mega_music'")).rows[0].status, 'ACTIVE');
    }
    // Minimal isolated product schema: the exact adapter SQL runs with the
    // product backend role, not with the fixture admin or a mocked pool.
    await admin.query(`create schema if not exists mega_music;
      create table if not exists mega_music.sessions(token_hash text primary key,user_id uuid not null references auth.users(id) on delete cascade,
        purpose text not null,expires_at timestamptz not null,encrypted_provider_tokens text);
      create table if not exists mega_music.oauth_transactions(token_hash text primary key,encrypted_transaction text not null,expires_at timestamptz not null);
      alter table mega_music.sessions enable row level security;
      alter table mega_music.oauth_transactions enable row level security;
      grant usage on schema mega_music to mega_music_web;
      grant select,insert,update,delete on mega_music.sessions,mega_music.oauth_transactions to mega_music_web;
      do $$ begin if not exists(select 1 from pg_policies where schemaname='mega_music' and tablename='sessions' and policyname='browser_fixture_sessions') then
        create policy browser_fixture_sessions on mega_music.sessions to mega_music_web using(true) with check(true); end if;
      if not exists(select 1 from pg_policies where schemaname='mega_music' and tablename='oauth_transactions' and policyname='browser_fixture_oauth') then
        create policy browser_fixture_oauth on mega_music.oauth_transactions to mega_music_web using(true) with check(true); end if; end $$;`);
    const email = `browser-${randomUUID()}@example.invalid`, password = `Fixture ${randomBytes(18).toString('base64url')}!`;
    originalRegistrationMode = (await admin.query('select registration_mode from accounts.settings')).rows[0].registration_mode;
    await admin.query("update accounts.settings set registration_mode='open'");
    const callbackUri = `${appOrigin}/api/music/auth/callback`;
    const client = await provider.call('/admin/oauth/clients', 'POST', { client_name: `Browser qualification ${suffix}`, client_type: 'confidential',
      token_endpoint_auth_method: 'client_secret_post', redirect_uris: [callbackUri] });
    clientId = client.client_id;
    const appSecret = randomBytes(32).toString('base64url');
    await admin.query(`insert into accounts.app_settings(app_id,slug,oauth_client_id,server_key_hash,launch_url,callback_url,published,join_policy,enforce_oidc)
      values('app_mega_music','mega-music',$1,$2,$3,$4,true,'free',true) on conflict(app_id) do update set
      oauth_client_id=excluded.oauth_client_id,server_key_hash=excluded.server_key_hash,launch_url=excluded.launch_url,
      callback_url=excluded.callback_url,published=true,join_policy='free',enforce_oidc=true`,
    [clientId, hash(appSecret), `${appOrigin}/api/music/auth/start`, callbackUri]);
    registryConfigured = true;
    await admin.query(`insert into accounts.oauth_clients(client_id,app_id,client_kind,callback_url,enabled)
      values($1,'app_mega_music','web',$2,true)`, [clientId, callbackUri]);
    await listen(centralServer);
    const { createEcosystemAuth } = await import('../../../../mega-media-player/server/accounts/ecosystem-auth.mjs');
    const adapter = createEcosystemAuth({ enabled: true, appOrigin, centralOrigin, issuer, clientId,
      clientSecret: client.client_secret, appSecret }, {
      pool: musicPool, key: randomBytes(32),
      provision: async identity => { assert.equal(identity.id, userId); },
      fetch: (url, options) => {
        assert.equal(new URL(url).origin, centralOrigin);
        return fetch(new URL(new URL(url).pathname, localOrigin(centralServer)), options);
      },
      oidcFactory: options => createOidcClient({ ...options, allowLoopbackHttp: true, fetch: (url, init) => {
        const target = new URL(url); assert.equal(target.origin, new URL(issuer).origin);
        return fetch(`${['/oauth/token', '/oauth/userinfo'].includes(target.pathname) ? localOrigin(centralServer) : authOrigin}${target.pathname}${target.search}`, init);
      } }),
    });
    appServer = createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
      try {
        const path = new URL(req.url, appOrigin).pathname;
        if (await adapter.route(req, res, path)) return;
        if (path === '/api/music/me') {
          const cookies = (req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith('__Host-mm_session='));
          const session = await adapter.session(cookies.length === 1 ? cookies[0].slice('__Host-mm_session='.length) : '');
          res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ userId: session.user_id })); return;
        }
        if (path === '/app/') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(`<!doctype html><html lang="en"><title>Product fixture</title><h1>Mega adapter fixture</h1><a href="${centralOrigin}/">DevelopED</a></html>`); return;
        }
        res.writeHead(404); res.end();
      } catch (error) {
        const status = error.status || 500;
        if (status >= 500) adapterErrors.push(status);
        res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'session_unavailable' }));
      }
    });
    await listen(appServer);
    forward = async (req, res) => {
      const target = new URL(req.url, `https://${req.headers.host}`);
      let destination;
      if (target.origin === centralOrigin) destination = localOrigin(centralServer);
      else if (target.origin === appOrigin) destination = localOrigin(appServer);
      else if (target.origin === browserProviderOrigin) destination = authOrigin;
      else { unexpectedRequests.push(`${target.origin}${target.pathname}`); res.writeHead(403); res.end(); return; }
      // Transport only: actual response bodies, status and Set-Cookie flow to
      // the browser unchanged. The isolated provider's fixed issuer/browser
      // consent transport URLs are aliased; JWT issuer validation is unchanged.
      try {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const response = await fetch(`${destination}${target.pathname}${target.search}`, {
          method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: 'manual',
        });
        transportTrace.push(`${target.origin}${target.pathname} ${response.status}`);
        const headers = Object.fromEntries(response.headers);
        const setCookies = response.headers.getSetCookie();
        if (setCookies.length) headers['set-cookie'] = setCookies;
        for (const name of ['connection', 'keep-alive', 'transfer-encoding', 'content-length']) delete headers[name];
        if (headers.location) {
          const redirect = new URL(headers.location, destination);
          if (redirect.origin === new URL(env.GOTRUE_SITE_URL).origin) {
            const path = redirect.pathname === env.GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH ? '/account/authorize' : redirect.pathname;
            headers.location = `${centralOrigin}${path}${redirect.search}`;
          } else if (redirect.origin === new URL(issuer).origin) headers.location = `${browserProviderOrigin}${redirect.pathname}${redirect.search}`;
          const next = new URL(headers.location, destination);
          transportTrace.push(`REDIRECT ${next.origin}${next.pathname}`);
        }
        res.writeHead(response.status, headers); res.end(Buffer.from(await response.arrayBuffer()));
      } catch { adapterErrors.push(502); res.writeHead(502); res.end(); }
    };
    const { chromium } = await import(playwrightModule);
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
      args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*',
        '--host-resolver-rules=MAP developed.example.test 127.0.0.1,MAP music.other.test 127.0.0.1,MAP provider.identity.test 127.0.0.1,MAP * ~NOTFOUND'] });
    const context = await browser.newContext({ locale: 'en-US', ignoreHTTPSErrors: true });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if ([centralOrigin, appOrigin, browserProviderOrigin].includes(url.origin)) return route.continue();
      unexpectedRequests.push(`${url.origin}${url.pathname}`); return route.abort();
    });
    const page = await context.newPage();
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      transportTrace.push(`FAILED ${url.origin}${url.pathname} ${request.failure()?.errorText}`);
    });
    page.on('pageerror', error => pageErrors.push(error.name));
    page.setDefaultTimeout(15000);
    const appIdentity = () => page.evaluate(async () => {
      const response = await fetch('/api/music/me');
      return { status: response.status, body: await response.json() };
    });
    let registrationPassed = false, firstLoginPassed = false, directLoginPassed = false;
    await t.test('browser registration requires explicit single-use email confirmation before login', async () => {
      await page.goto(`${centralOrigin}/register?lang=en`);
      await page.getByLabel('Name', { exact: true }).fill('Browser Fixture');
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      const registered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/account/register' && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      assert.equal((await registered).status(), 200);
      await page.getByRole('status').filter({ hasText: /email|inbox/i }).first().waitFor();
      const user = (await admin.query('select id,email_confirmed_at from auth.users where email=$1', [email])).rows[0];
      assert.ok(user); userId = user.id; assert.equal(user.email_confirmed_at, null);

      await page.goto(`${centralOrigin}/login?lang=en`);
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      const rejected = page.waitForResponse(response => new URL(response.url()).pathname === '/api/account/login' && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      assert.equal((await rejected).status(), 401);

      // The fixture has mail disabled. Read only its encrypted outbox to simulate
      // opening the inbox link; never print a recipient, credential or token.
      const queued = (await admin.query('select id,payload from accounts.outbox order by created_at desc limit 1')).rows[0];
      assert.ok(queued);
      const mail = unseal(queued.payload, config.encryptionKey, `mail:${queued.id}`);
      assert.ok(mail.to === email, 'outbox recipient must match the fixture'); assert.ok(!mail.text.includes(password));
      const match = mail.text.match(/#token=([A-Za-z0-9_-]+)/); assert.ok(match);
      const verificationToken = match[1];
      const openConfirmation = () => page.goto(`${centralOrigin}/verify-email?lang=en#token=${verificationToken}`)
        .catch(() => { throw new Error('Isolated confirmation navigation failed (credential URL withheld)'); });
      await openConfirmation();
      await page.getByRole('button', { name: 'Confirm email', exact: true }).waitFor();
      assert.ok(new URL(page.url()).hash === '', 'UI must remove the fragment before further interaction');
      assert.equal((await admin.query('select email_confirmed_at from auth.users where id=$1', [userId])).rows[0].email_confirmed_at, null);
      const confirmed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/account/verify-email' && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Confirm email', exact: true }).click();
      assert.equal((await confirmed).status(), 200);
      await page.getByText('Email confirmed. You can now sign in.', { exact: true }).waitFor();
      const verifiedUser = (await admin.query('select id,email_confirmed_at from auth.users where email=$1', [email])).rows[0];
      assert.equal(verifiedUser.id, userId); assert.ok(verifiedUser.email_confirmed_at);

      await openConfirmation();
      const replay = page.waitForResponse(response => new URL(response.url()).pathname === '/api/account/verify-email' && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Confirm email', exact: true }).click();
      assert.equal((await replay).status(), 400);
      registrationPassed = true;
    });
    if (!registrationPassed) return;
    await t.test('central login, tile redirect and exact Mega adapter create an authenticated app cookie', async () => {
      await page.goto(`${centralOrigin}/login?lang=en`);
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('heading', { name: 'Your apps', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.cookie), '');
      assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
      await page.getByRole('button', { name: /Mega Music/ }).click();
      try { await page.waitForURL(`${appOrigin}/app/`); }
      catch (error) { t.diagnostic(transportTrace.join('\n')); throw error; }
      const identity = await appIdentity(); assert.equal(identity.status, 200); assert.equal(identity.body.userId, userId);
      const cookies = await context.cookies();
      for (const [name, host] of [['__Host-developed_session', new URL(centralOrigin).hostname], ['__Host-mm_session', new URL(appOrigin).hostname]]) {
        const found = cookies.find(cookie => cookie.name === name);
        assert.ok(found, `${name} missing`); assert.equal(found.domain, host); assert.equal(found.path, '/');
        assert.equal(found.secure, true); assert.equal(found.httpOnly, true); assert.equal(found.sameSite, 'Lax');
      }
      assert.ok(!cookies.some(cookie => cookie.name === '__Host-mm_oauth'));
      assert.equal(await page.evaluate(() => document.cookie), '');
      assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
      assert.equal((await admin.query('select count(*)::int as n from core.app_access where user_id=$1 and app_id=$2', [userId, 'app_mega_music'])).rows[0].n, 1);
      firstLoginPassed = true;
    });
    if (!firstLoginPassed) return;
    await t.test('DevelopED home returns to picker; direct app login reuses central identity without another password', async () => {
      await page.getByRole('link', { name: 'DevelopED', exact: true }).click();
      await page.getByRole('heading', { name: 'Your apps', exact: true }).waitFor();
      await context.clearCookies({ name: '__Host-mm_session' });
      await page.goto(`${appOrigin}/api/music/auth/start`);
      await page.waitForURL(`${appOrigin}/app/`);
      assert.equal((await appIdentity()).status, 200);
      directLoginPassed = true;
    });
    if (!directLoginPassed) return;
    await t.test('browser logout denies its Mega cookie while another real browser stays signed in', async () => {
      const other = await browser.newContext({ locale: 'en-US', ignoreHTTPSErrors: true });
      try {
        await other.route('**/*', route => {
          const url = new URL(route.request().url());
          if ([centralOrigin, appOrigin, browserProviderOrigin].includes(url.origin)) return route.continue();
          unexpectedRequests.push(`${url.origin}${url.pathname}`); return route.abort();
        });
        const otherPage = await other.newPage(); otherPage.setDefaultTimeout(15000);
        otherPage.on('pageerror', error => pageErrors.push(error.name));
        await otherPage.goto(`${centralOrigin}/login?lang=en`);
        await otherPage.getByLabel('Email', { exact: true }).fill(email);
        await otherPage.getByLabel('Password', { exact: true }).fill(password);
        await otherPage.getByRole('button', { name: 'Sign in', exact: true }).click();
        await otherPage.getByRole('heading', { name: 'Your apps', exact: true }).waitFor();
        await otherPage.getByRole('button', { name: /Mega Music/ }).click();
        await otherPage.waitForURL(`${appOrigin}/app/`);
        await page.goto(`${centralOrigin}/security`);
        await page.getByRole('button', { name: 'Log out of this browser', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
        await page.waitForURL(`${centralOrigin}/login`);
        assert.ok((await context.cookies(appOrigin)).some(cookie => cookie.name === '__Host-mm_session'));
        await page.goto(`${appOrigin}/app/`); assert.equal((await appIdentity()).status, 401);
        assert.equal(await otherPage.evaluate(async () => (await fetch('/api/music/me')).status), 200);
        await otherPage.goto(`${centralOrigin}/apps`);
        await otherPage.getByRole('heading', { name: 'Your apps', exact: true }).waitFor();
      } finally { await other.close(); }
      // Fresh ordinary sign-in for the following independent global-logout test.
      await page.goto(`${centralOrigin}/login?lang=en`);
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('heading', { name: 'Your apps', exact: true }).waitFor();
      await page.getByRole('button', { name: /Mega Music/ }).click();
      await page.waitForURL(`${appOrigin}/app/`); assert.equal((await appIdentity()).status, 200);
    });
    await t.test('explicit all-device central logout denies the still-present separate app cookie on its next API request', async () => {
      await page.getByRole('link', { name: 'DevelopED', exact: true }).click();
      await page.getByRole('heading', { name: 'Your apps', exact: true }).waitFor();
      await page.goto(`${centralOrigin}/security`);
      await page.getByRole('button', { name: 'Log out of all apps and devices', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
      await page.waitForURL(`${centralOrigin}/login`);
      assert.ok((await context.cookies(appOrigin)).some(cookie => cookie.name === '__Host-mm_session'));
      await page.goto(`${appOrigin}/app/`);
      assert.equal((await appIdentity()).status, 401);
    });
    assert.deepEqual(pageErrors, []); assert.deepEqual(unexpectedRequests, []); assert.deepEqual(adapterErrors, []);
  } finally {
    if (providerFailures.length) t.diagnostic(providerFailures.join('; '));
    await browser?.close();
    if (secureServer?.listening) await close(secureServer);
    if (appServer?.listening) await close(appServer);
    if (centralServer.listening) await close(centralServer);
    if (clientId) await provider.call(`/admin/oauth/clients/${clientId}`, 'DELETE').catch(() => {});
    if (clientId) {
      await admin.query('delete from accounts.browser_delegations where client_id=$1', [clientId]);
      await admin.query('delete from accounts.oauth_code_bindings where client_id=$1', [clientId]);
      await admin.query('delete from accounts.oauth_clients where client_id=$1', [clientId]);
    }
    if (originalRegistrationMode !== undefined) await admin.query('update accounts.settings set registration_mode=$1', [originalRegistrationMode]);
    if (registryConfigured && originalApp) {
      await admin.query(`update accounts.app_settings set oauth_client_id=$1,server_key_hash=$2,launch_url=$3,callback_url=$4,
        published=$5,join_policy=$6,enforce_oidc=$7,updated_at=$8 where app_id='app_mega_music'`,
      [originalApp.oauth_client_id, originalApp.server_key_hash, originalApp.launch_url, originalApp.callback_url,
        originalApp.published, originalApp.join_policy, originalApp.enforce_oidc, originalApp.updated_at]);
    } else if (registryConfigured) await admin.query("delete from accounts.app_settings where app_id='app_mega_music' and oauth_client_id=$1", [clientId]);
    await Promise.all([admin.end(), db.pool.end(), musicPool.end()]);
    // Generated roles, minimal product tables and fixture users/core app remain
    // only in this labeled pair. Audit/security FKs intentionally prohibit
    // generic user deletion; the owner destroys the pair after all tests.
  }
});
