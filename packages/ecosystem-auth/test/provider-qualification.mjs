// Opt-in integration against brand-new capped containers only. Never accepts a
// remote provider/database URL or existing container. No production credentials.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { SignJWT, importJWK } from 'jose';
import assert from 'node:assert/strict';
import { createOidcClient } from '../index.mjs';

if (!process.argv.includes('--isolated-docker')) throw new Error('Explicit --isolated-docker required');
const prefix = `developed-identity-test-${process.pid}`;
const network = `${prefix}-network`, database = `${prefix}-db`, auth = `${prefix}-auth`;
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const secret = randomBytes(32).toString('hex'), password = randomBytes(32).toString('hex');
const privateJwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
Object.assign(privateJwk, { alg: 'ES256', kid: 'qualification-only', use: 'sig', key_ops: ['sign'] });
const privateKey = await importJWK(privateJwk, 'ES256');
let issuer;
let gateway;
const env = values => Object.entries(values).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
async function request(path, { token, body, method = 'GET', headers = {} } = {}) {
  const response = await fetch(`${issuer}${path}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
  });
  let json; try { json = await response.json(); } catch { json = {}; }
  return { status: response.status, location: response.headers.get('location'), json };
}
const report = (name, detail) => process.stdout.write(`${name}: ${detail}\n`);
try {
  docker(['network', 'create', '--label', 'developed.identity.qualification=true', network]);
  docker(['run', '--pull=never', '-d', '--name', database, '--network', network, '--memory', '192m', '--cpus', '0.5', '--pids-limit', '100',
    '--label', 'developed.identity.qualification=true', ...env({ POSTGRES_PASSWORD: password }), 'postgres:17-alpine', '-c', 'shared_buffers=32MB', '-c', 'max_connections=30']);
  for (let i = 0; i < 100; i++) {
    try { docker(['exec', database, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  docker(['exec', database, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE SCHEMA auth;']);
  // Reserve the ephemeral loopback mapping first, then discover the mapped port
  // from Docker; API_EXTERNAL_URL only controls links/discovery, not listening.
  docker(['run', '--pull=never', '-d', '--name', auth, '--network', network, '-p', '127.0.0.1::9999', '--memory', '128m', '--cpus', '0.5', '--pids-limit', '100',
    '--label', 'developed.identity.qualification=true', ...env({
      GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999', API_EXTERNAL_URL: 'http://127.0.0.1:9999',
      GOTRUE_SITE_URL: 'http://127.0.0.1:39999', GOTRUE_URI_ALLOW_LIST: 'http://127.0.0.1:39999/**',
      GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: `postgres://postgres:${password}@${database}:5432/postgres?search_path=auth`,
      GOTRUE_JWT_SECRET: secret, GOTRUE_JWT_KEYS: JSON.stringify([privateJwk]), GOTRUE_JWT_AUD: 'authenticated',
      GOTRUE_JWT_ADMIN_ROLES: 'service_role', GOTRUE_JWT_EXP: '300', GOTRUE_JWT_ISSUER: 'http://127.0.0.1:9999',
      GOTRUE_DISABLE_SIGNUP: 'true', GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_MAILER_AUTOCONFIRM: 'true',
      GOTRUE_OAUTH_SERVER_ENABLED: 'true', GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH: '/account/oauth/consent',
      GOTRUE_OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION: 'false', GOTRUE_LOG_LEVEL: 'panic',
    }), 'supabase/gotrue:v2.189.0']);
  const port = docker(['port', auth, '9999/tcp']).split(':').at(-1);
  issuer = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${issuer}/health`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Isolated GoTrue failed startup (inspect only this container; redact env)');
  report('isolated_database', database);
  report('isolated_auth', auth);
  report('isolated_network', network);
  report('health', 'PASS');
  const admin = await new SignJWT({ role: 'service_role' }).setProtectedHeader({ alg: 'ES256', kid: privateJwk.kid }).setIssuedAt().setExpirationTime('10m').setAudience('authenticated').sign(privateKey);
  const discovery = await request('/.well-known/openid-configuration');
  assert.equal(discovery.status, 200);
  report('discovery', 'PASS (direct provider only; production gateway NOT tested)');
  const email = `qualification-${process.pid}@example.invalid`;
  const user = await request('/admin/users', { method: 'POST', token: admin, body: { email, password, email_confirm: true } });
  assert.equal(user.status, 200);
  const login = await request('/token?grant_type=password', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200);
  const client = await request('/admin/oauth/clients', { method: 'POST', token: admin, body: {
    client_name: 'isolated qualification', client_type: 'confidential', token_endpoint_auth_method: 'client_secret_post', redirect_uris: ['http://127.0.0.1:39999/callback'],
  } });
  assert.ok(client.status >= 200 && client.status < 300, `register client HTTP ${client.status}`);
  // Direct provider advertises its configured external origin; transport maps
  // that isolated loopback origin to Docker's ephemeral loopback port.
  const externalIssuer = 'http://127.0.0.1:9999';
  const transport = async (url, options) => {
    const response = await fetch(String(url).replace(externalIssuer, issuer), options);
    if (!response.ok && response.status !== 302) {
      const failure = await response.clone().json().catch(() => ({}));
      report('provider_transport_status', `${new URL(url).pathname} HTTP ${response.status} ${failure.error ?? failure.error_code ?? 'unknown'}`);
      // Only standard OAuth error text from this disposable provider, never a
      // token endpoint success body, client credentials or an exception dump.
      if (typeof failure.error_description === 'string') report('provider_error_description', failure.error_description.slice(0, 180));
      if (typeof failure.msg === 'string') report('provider_error_message', failure.msg.slice(0, 180));
    }
    return response;
  };
  const memory = new Map();
  const rp = createOidcClient({ issuer: externalIssuer, clientId: client.json.client_id, clientSecret: client.json.client_secret,
    redirectUri: 'http://127.0.0.1:39999/callback', allowLoopbackHttp: true, fetch: transport,
    store: { create: async (id, tx) => memory.set(id, tx), consume: async id => { const tx = memory.get(id); memory.delete(id); return tx; } },
  });
  async function authorize() {
    const flow = await rp.begin('/library');
    const transaction = [...memory.values()].at(-1);
    const entry = await transport(flow.url, { redirect: 'manual' });
    assert.equal(entry.status, 302);
    const authorizationId = new URL(entry.headers.get('location')).searchParams.get('authorization_id');
    const details = await request(`/oauth/authorizations/${authorizationId}`, { token: login.json.access_token });
    assert.equal(details.status, 200);
    let redirect = details.json.redirect_url;
    if (!redirect) {
      assert.equal(details.json.client.id, client.json.client_id);
      const consent = await request(`/oauth/authorizations/${authorizationId}/consent`, { method: 'POST', token: login.json.access_token, body: { action: 'approve' } });
      assert.equal(consent.status, 200);
      redirect = consent.json.redirect_url;
    }
    return { flow, redirect, transaction, remembered: Boolean(details.json.redirect_url) };
  }
  async function tokenExchange(code, verifier, exchangeClient = client.json) {
    const response = await fetch(`${issuer}/oauth/token`, { method: 'POST', body: new URLSearchParams({
      grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: 'http://127.0.0.1:39999/callback',
      client_id: exchangeClient.client_id, client_secret: exchangeClient.client_secret,
    }) });
    return response.status;
  }
  const first = await authorize();
  assert.equal(first.remembered, false);
  assert.equal(await tokenExchange(new URL(first.redirect).searchParams.get('code'), 'X'.repeat(43)), 400);
  report('incorrect_PKCE', 'REJECTED by provider');
  const otherClient = await request('/admin/oauth/clients', { method: 'POST', token: admin, body: {
    client_name: 'isolated other app', client_type: 'confidential', token_endpoint_auth_method: 'client_secret_post', redirect_uris: ['http://127.0.0.1:39999/other-callback'],
  } });
  assert.equal(await tokenExchange(new URL(first.redirect).searchParams.get('code'), first.transaction.verifier, otherClient.json), 400);
  report('incorrect_client', 'REJECTED by provider');
  const result = await rp.complete(first.redirect, first.flow.flowCookie);
  assert.equal(result.identity.sub, user.json.id);
  report('S256_nonce_ID_signature_issuer_audience_access_client_subject_session', 'PASS');
  await assert.rejects(rp.complete(first.redirect, first.flow.flowCookie));
  report('callback_replay', 'REJECTED');
  assert.equal(await tokenExchange(new URL(first.redirect).searchParams.get('code'), first.transaction.verifier), 400);
  report('authorization_code_replay', 'REJECTED by provider');
  const remembered = await authorize();
  assert.equal(remembered.remembered, true);
  report('remembered_consent', 'PASS: GET returns redirect_url only, already approved');
  const rememberedTokens = await rp.complete(remembered.redirect, remembered.flow.flowCookie);
  const refresh = await rp.refresh(rememberedTokens.tokens.refresh_token, result.identity.sub);
  assert.ok(refresh.tokens.refresh_token);
  report('refresh_rotation', refresh.tokens.refresh_token !== rememberedTokens.tokens.refresh_token ? 'PASS (rotated)' : 'NOT ROTATED');
  const genericRefresh = await request('/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refresh.tokens.refresh_token } });
  report('delegated_refresh_at_generic_token_endpoint', `HTTP ${genericRefresh.status}`);
  assert.equal(genericRefresh.status, 400);
  const crossApp = new URL(`${issuer}/oauth/authorize`);
  for (const [key, value] of Object.entries({ client_id: otherClient.json.client_id, redirect_uri: 'http://127.0.0.1:39999/other-callback', response_type: 'code', scope: 'openid email', state: 'qualification-cross-app', code_challenge: new URL(first.flow.url).searchParams.get('code_challenge'), code_challenge_method: 'S256' })) crossApp.searchParams.set(key, value);
  const crossEntry = await fetch(crossApp, { redirect: 'manual' });
  const crossId = new URL(crossEntry.headers.get('location')).searchParams.get('authorization_id');
  assert.ok(crossId, 'cross-app authorize must create actual authorization');
  const crossDetails = await request(`/oauth/authorizations/${crossId}`, { token: result.tokens.access_token });
  report('delegated_token_cross_app_authorization_details', `HTTP ${crossDetails.status}`);
  const crossApprove = await request(`/oauth/authorizations/${crossId}/consent`, { method: 'POST', token: result.tokens.access_token, body: { action: 'approve' } });
  report('delegated_token_cross_app_consent', `HTTP ${crossApprove.status} (must block at central boundary if 2xx)`);
  const factor = await request('/factors', { method: 'POST', token: result.tokens.access_token, body: { factor_type: 'totp', friendly_name: 'isolated qualification' } });
  report('delegated_token_factor_enrollment', `HTTP ${factor.status} (must block at central boundary if 2xx)`);
  if (process.argv.includes('--gateway')) {
    const reserve = createServer();
    await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
    const gatewayPort = reserve.address().port;
    await new Promise(resolve => reserve.close(resolve));
    const configuration = readFileSync(new URL('../qualification.Caddyfile', import.meta.url), 'utf8')
      .replaceAll('GATEWAY_PORT', String(gatewayPort)).replaceAll('PROVIDER_PORT', String(port));
    gateway = spawn('caddy', ['run', '--config', '-', '--adapter', 'caddyfile'], { stdio: ['pipe', 'ignore', 'ignore'] });
    gateway.stdin.end(configuration);
    const gatewayOrigin = `http://127.0.0.1:${gatewayPort}`;
    let gatewayReady = false;
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`${gatewayOrigin}/auth/v1/.well-known/openid-configuration`)).ok) { gatewayReady = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(gatewayReady, 'isolated Caddy gateway started');
    for (const [method, path] of [
      ['PUT', '/user'], ['GET', '/user'], ['POST', '/factors'], ['GET', '/reauthenticate'],
      ['POST', '/token?grant_type=password'], ['POST', '/token?grant_type=refresh_token'], ['POST', '/signup'], ['POST', '/recover'],
      ['GET', `/oauth/authorizations/${crossId}`], ['POST', `/oauth/authorizations/${crossId}/consent`], ['POST', '/admin/users'],
      ['POST', '/oauth/clients/register'], ['POST', '/logout'], ['PUT', '/%75ser'], ['PUT', '/user/'],
    ]) {
      const response = await fetch(`${gatewayOrigin}/auth/v1${path}`, { method, headers: { Authorization: `Bearer ${result.tokens.access_token}`, apikey: admin }, redirect: 'manual' });
      assert.equal(response.status, 403, `gateway must reject ${method} ${path}`);
    }
    for (const path of ['/auth/v1/.well-known/openid-configuration', '/auth/v1/.well-known/jwks.json', '/.well-known/oauth-authorization-server/auth/v1', '/auth/v1/oauth/userinfo']) {
      const response = await fetch(`${gatewayOrigin}${path}`, { headers: { Authorization: `Bearer ${result.tokens.access_token}` } });
      assert.equal(response.status, 200, `gateway must allow ${path}`);
    }
    const gatewayAuthorize = await fetch(`${gatewayOrigin}/auth/v1/oauth/authorize${crossApp.search}`, { redirect: 'manual' });
    assert.equal(gatewayAuthorize.status, 302);
    const gatewayRefresh = await fetch(`${gatewayOrigin}/auth/v1/oauth/token`, { method: 'POST', body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: refresh.tokens.refresh_token, client_id: client.json.client_id, client_secret: client.json.client_secret,
    }) });
    assert.equal(gatewayRefresh.status, 200);
    report('isolated_gateway', 'PASS: denies identity writes, generic grants, consent/admin APIs; allows discovery, JWKS, OAuth authorize/token/userinfo');
  }
  const mutation = await request('/user', { method: 'PUT', token: result.tokens.access_token, body: { data: { qualification_probe: true } } });
  report('delegated_token_user_metadata_write', `HTTP ${mutation.status} (must block at central boundary if 2xx)`);
  const passwordMutation = await request('/user', { method: 'PUT', token: result.tokens.access_token, body: { password: randomBytes(32).toString('hex') } });
  report('delegated_token_password_write', `HTTP ${passwordMutation.status} (must block at central boundary if 2xx)`);
  report('complete', 'Isolated protocol probes complete. No mail or production calls.');
} catch (error) {
  // Do not print API response objects, exec arguments, tokens or generated keys.
  report('qualification_failure', error instanceof assert.AssertionError ? error.message : error.status !== undefined ? 'Isolated subprocess failed (arguments withheld)' : error.name + ': ' + error.message);
  process.exitCode = 1;
} finally {
  if (gateway && gateway.exitCode === null) { gateway.kill('SIGTERM'); await new Promise(resolve => gateway.once('exit', resolve)); }
  if (process.argv.includes('--keep')) report('cleanup', `Kept isolated resources for parent SQL checks: ${database}, ${auth}, ${network}`);
  else {
    for (const name of [auth, database]) { try { docker(['rm', '-f', '-v', name]); } catch {} }
    try { docker(['network', 'rm', network]); } catch {}
  }
}
