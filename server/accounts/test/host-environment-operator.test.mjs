import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, lstat, symlink, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apps, compose, manifest, parseEnvironment, serializeEnvironment, stageOutputs, validateJwt, writePrivate, run } from '../operators/stage-host-environments.mjs';
import { signScopedKey } from '../operators/issue-scoped-data-key.mjs';
import { requestBody } from '../operators/register-private-clients.mjs';

const signing = { version: 1, algorithm: 'HS256', issuer: manifest.oidcIssuer, audience: 'authenticated', jwtSecret: 'fixture-signing-material-never-a-live-secret-12345' };
const expiry = () => new Date(Math.floor(Date.now() / 1000) * 1000 + 86400_000).toISOString().replace('.000Z', 'Z');
function fixture(app) {
  const registration = { ...app, name: { 'mega-music': 'Mega Music', kestrek: 'KešTrek', screentime: 'Screen Time', airsoft: 'Airsoft Marketplace', vocabulum: 'Vocabulum', otazkomat: 'Otázkomat' }[app.slug],
    kind: 'web', callbackUrl: app.origin + app.callbackPath, launchUrl: app.origin + app.launchPath };
  // Exact names are read from the pinned catalog without any protected input.
  return { registration };
}
const catalog = JSON.parse(await readFile(new URL('../launch-catalog.json', import.meta.url), 'utf8'));
function inputs(app) {
  const { registration } = fixture(app);
  registration.name = catalog.apps.find(entry => entry.slug === app.slug).name;
  const client = { version: 1, client: `${app.slug}-web`, appId: app.appId, kind: 'web', serverKey: randomBytes(32).toString('base64url'),
    provider: { ...requestBody(registration), client_id: randomUUID(), client_secret: randomBytes(32).toString('base64url'), registration_type: 'manual' } };
  const material = { client, attachment: { appId: app.appId, slug: app.slug, clientId: client.provider.client_id,
    serverKey: client.serverKey, launchUrl: registration.launchUrl, callbackUrl: registration.callbackUrl }, nativeClientId: randomUUID() };
  const original = { ECOSYSTEM_AUTH_ENABLED: 'false', SUPABASE_SERVICE_ROLE_KEY: 'fixture-obsolete',
    MAILJET_API_KEY: 'fixture-mail', MAILJET_SECRET_KEY: 'fixture-mail-secret' };
  for (const name of app.publicApiEnv || []) original[name] = name.endsWith('URL') ? 'https://sam-api.developed162.bid' : 'fixture-anon';
  if (app.slug === 'mega-music') Object.assign(original, { DATABASE_URL: 'postgres://mega_music_web.oc-prod:fixture%24password@127.0.0.1:5432/postgres', ENCRYPTION_KEY: randomBytes(32).toString('hex') });
  else {
    const encoding = { kestrek: 'hex', screentime: 'base64', airsoft: 'hex', vocabulum: 'base64url', otazkomat: 'base64' }[app.slug];
    material.session = { version: 1, credential: `${app.slug}-session`, kind: 'session-key', environment: app.sessionEncryptionEnv, encoding, value: randomBytes(32).toString(encoding) };
    if (app.sessionDatabaseEnv) material.database = { version: 1, credential: `${app.slug}-db`, kind: 'database-password', role: app.sessionDatabaseRole, database: 'postgres', password: randomBytes(32).toString('base64url') };
    if (app.dataJwtEnv) material.data = { ...signScopedKey(signing, { role: app.dataJwtRole, expiresAt: expiry() }), credential: `${app.slug}-data`, kind: 'data-jwt' };
  }
  if (app.slug === 'kestrek') Object.assign(original, { MCP_OAUTH_STORE_PATH: '/var/lib/developed-kestrek/mcp-oauth.json', CHATGPT_API_KEY_SHA256: 'fixture-hash', CHATGPT_USER_ID: randomUUID(), ENCRYPTION_KEY: randomBytes(32).toString('hex') });
  if (app.slug === 'screentime') Object.assign(original, { NEXT_PUBLIC_ECOSYSTEM_AUTH_ENABLED: 'false', S4_ACCESS_KEY_ID: 'fixture-s4', S4_SECRET_ACCESS_KEY: 'fixture-s4-secret' });
  if (app.slug === 'vocabulum') Object.assign(original, { NEXTAUTH_SECRET: randomBytes(32).toString('base64url'), OPENAI_ENCRYPTION_SECRET: 'existing-ai-key' });
  if (app.slug === 'otazkomat') original.ENCRYPTION_KEY = randomBytes(32).toString('hex');
  return { original, source: serializeEnvironment(original), material };
}

test('six exact contracts preserve data keys and remove obsolete keys, with server-only credentials', () => {
  assert.equal(apps.length, 6);
  for (const app of apps) {
    const input = inputs(app), result = compose(app, input.source, input.material, signing);
    const env = parseEnvironment(result.payload);
    assert.equal(env.ECOSYSTEM_AUTH_ENABLED, 'true');
    assert.equal(env[app.originEnv], app.origin);
    assert.equal(env[app.centralOriginEnv], manifest.centralOrigin);
    assert.equal(env[app.serverCheckKeyEnv], input.material.client.serverKey);
    assert.equal(result.metadata.runtimeConfigured, false);
    assert.equal(result.metadata.activated, false);
    assert.equal(Object.keys(env).some(name => /SERVICE_ROLE|MAILJET/.test(name)), false);
    for (const name of ['DATABASE_URL', 'ENCRYPTION_KEY', 'MCP_OAUTH_STORE_PATH', 'CHATGPT_API_KEY_SHA256', 'CHATGPT_USER_ID', 'S4_ACCESS_KEY_ID', 'S4_SECRET_ACCESS_KEY', 'NEXTAUTH_SECRET', 'OPENAI_ENCRYPTION_SECRET']) {
      if (name in input.original) assert.equal(env[name], input.original[name]);
    }
    if (app.slug !== 'mega-music' && app.sessionDatabaseEnv) {
      const db = new URL(env[app.sessionDatabaseEnv]);
      assert.equal(db.hostname, '172.18.0.12'); assert.equal(db.port, '5432');
      assert.equal(db.pathname, '/postgres'); assert.equal(db.username, app.sessionDatabaseRole);
    }
    if (app.slug === 'screentime') assert.equal(env.NEXT_PUBLIC_ECOSYSTEM_AUTH_ENABLED, 'true');
    if (app.slug === 'kestrek') assert.equal(env.ECOSYSTEM_NATIVE_OIDC_CLIENT_ID, input.material.nativeClientId);
    const meta = JSON.stringify(result.metadata);
    for (const value of [input.material.client.serverKey, input.material.client.provider.client_secret, input.material.session?.value, input.material.data?.token].filter(Boolean)) assert.equal(meta.includes(value), false);
  }
});

test('reject unknown variables, privileged aliases, wrong DB role and accidental key reuse', () => {
  const app = apps.find(app => app.slug === 'kestrek');
  for (const mutate of [
    input => { input.original.UNKNOWN_SECRET = 'unknown'; },
    input => { input.original.ENCRYPTION_KEY = 'sb_secret_privileged'; },
    input => { input.material.database.role = 'postgres'; },
    input => { input.material.session.environment = 'NEXT_PUBLIC_SESSION_SECRET'; },
    input => { input.material.client.provider.client_secret = input.material.client.serverKey; },
    input => { input.material.attachment.callbackUrl = 'https://evil.invalid/callback'; },
    input => { input.original.ECOSYSTEM_AUTH_ENABLED = 'true'; },
  ]) {
    const input = inputs(app); mutate(input);
    assert.throws(() => compose(app, serializeEnvironment(input.original), input.material, signing));
  }
});

test('Mega preserves its exact tenant-qualified pooler login and rejects replacement destinations', () => {
  const app = apps.find(app => app.slug === 'mega-music');
  for (const replacement of ['postgres.oc-prod', 'mega_music_web.wrong-tenant', 'mega_music_web']) {
    const input = inputs(app);
    input.original.DATABASE_URL = input.original.DATABASE_URL.replace('mega_music_web.oc-prod', replacement);
    assert.throws(() => compose(app, serializeEnvironment(input.original), input.material, signing));
  }
  const input = inputs(app);
  input.original.DATABASE_URL = input.original.DATABASE_URL.replace('127.0.0.1', '172.18.0.12');
  assert.throws(() => compose(app, serializeEnvironment(input.original), input.material, signing));
});

test('reject expired, future, wrong-role, malformed and tampered JWTs', () => {
  const app = apps.find(app => app.slug === 'screentime');
  const { material } = inputs(app);
  assert.equal(validateJwt(material.data, app, signing), material.data.token);
  assert.throws(() => validateJwt(material.data, app, signing, Date.now() + 86401_000));
  assert.throws(() => validateJwt(material.data, app, signing, Date.now() - 3600_000));
  assert.throws(() => validateJwt({ ...material.data, role: 'service_role' }, app, signing));
  assert.throws(() => validateJwt({ ...material.data, token: 'not.a.jwt' }, app, signing));
  const parts = material.data.token.split('.'); parts[2] = Buffer.alloc(32).toString('base64url');
  assert.throws(() => validateJwt({ ...material.data, token: parts.join('.') }, app, signing));
});

test('environment parser roundtrips literal quotes, dollar signs, backticks, Unicode and backslashes', () => {
  const env = { ALPHA: 'dollar$`cmd`\\path"quote apostrophe\' Unicode ľšč', EMPTY: '', URL: 'https://example.invalid/a#b?c=d' };
  assert.deepEqual({ ...parseEnvironment(serializeEnvironment(env)) }, env);
  for (const source of ['A=1\nA=2\n', 'export A=1', 'A="unterminated', 'A=one two', 'A=hello\u0000']) assert.throws(() => parseEnvironment(source));
});

test('exclusive durable files, backup ordering and failure recovery never touch live paths', async () => {
  const app = apps[0], input = inputs(app), result = compose(app, input.source, input.material, signing);
  const stored = new Map(), order = [];
  const write = async (path, value) => { assert.equal(stored.has(path), false); stored.set(path, value); order.push(path); };
  const read = async path => stored.get(path);
  await stageOutputs(app, input.source, result, { write, read, primary: '/fixture/primary', backup: '/fixture/backup' });
  assert.equal(order.length, 8);
  assert.deepEqual(order.map(path => path.split('/').at(-1)), ['mega-music.started.json', 'mega-music.started.json', 'mega-music.legacy.env', 'mega-music.legacy.env', 'mega-music.central.env', 'mega-music.central.env', 'mega-music.verified.json', 'mega-music.verified.json']);
  assert.equal(stored.get('/fixture/primary/mega-music.legacy.env'), input.source);
  const failed = [];
  await assert.rejects(stageOutputs(app, input.source, result, { primary: '/fixture/primary', backup: '/fixture/backup', read,
    write: async path => { failed.push(path); if (path.endsWith('legacy.env') && path.includes('/backup/')) throw new Error('fixture backup failure'); } }));
  assert.equal(failed.some(path => path.endsWith('central.env') || path.endsWith('verified.json')), false);
});

test('real private writes refuse duplicate and symlink destinations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'developed-host-env-test-'));
  try {
    const path = join(root, 'fixture.env');
    await writePrivate(path, 'ALPHA="fixture"\n');
    assert.equal((await lstat(path)).mode & 0o777, 0o600);
    assert.equal(await readFile(path, 'utf8'), 'ALPHA="fixture"\n');
    await assert.rejects(writePrivate(path, 'replacement'));
    await symlink(path, join(root, 'link.env'));
    await assert.rejects(writePrivate(join(root, 'link.env'), 'replacement'));
    await mkdir(join(root, '.git'));
    await assert.rejects(writePrivate(join(root, 'git.env'), 'fixture'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('default is offline plan, rejects arbitrary path, live-apply and unrecognized args', async () => {
  assert.equal((await run([])).status, 'source-plan-no-files-no-connections');
  for (const args of [['--apply'], ['--output', '/etc/developed-apps/kestrek.env'], ['--stage', '--check']]) await assert.rejects(run(args));
});
