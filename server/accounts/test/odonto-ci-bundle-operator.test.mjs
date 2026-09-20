import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { composeBundle, verifyToken, stageBundle, run, keys } from '../operators/stage-odonto-ci-bundle.mjs';
import { signScopedKey, signIdentityStoreKey } from '../operators/issue-scoped-data-key.mjs';
import { registrations, requestBody, attachment } from '../operators/register-private-clients.mjs';

const signing = { version: 1, algorithm: 'HS256', issuer: 'https://sam-api.developed162.bid/auth/v1',
  audience: 'authenticated', jwtSecret: 'synthetic-odonto-signing-fixture-not-a-live-key' };
const registered = registrations(await readFile(new URL('../launch-catalog.json', import.meta.url), 'utf8')).find(entry => entry.key === 'odonto-web');
function fixtureAnon(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: 'supabase', role: 'anon', iat: now, exp: now + 86400, ...overrides })).toString('base64url');
  const input = `${head}.${body}`;
  return `${input}.${createHmac('sha256', signing.jwtSecret).update(input).digest('base64url')}`;
}
function material() {
  const client = { version: 1, client: 'odonto-web', appId: 'app_odonto', kind: 'web', serverKey: randomBytes(32).toString('base64url'),
    provider: { ...requestBody(registered), client_id: randomUUID(), client_secret: randomBytes(32).toString('base64url'), registration_type: 'manual' } };
  const expiresAt = new Date(Math.floor(Date.now() / 1000) * 1000 + 86400_000).toISOString().replace('.000Z', 'Z');
  return { client, attachment: attachment(registered, client.provider, client.serverKey), anon: fixtureAnon(),
    session: { version: 1, credential: 'odonto-session', kind: 'session-key', environment: 'ECOSYSTEM_ENCRYPTION_KEY', encoding: 'hex', value: randomBytes(32).toString('hex') },
    bff: { version: 1, credential: 'odonto-bff', kind: 'bff-key', environment: 'ECOSYSTEM_BFF_KEY', encoding: 'base64url', value: randomBytes(32).toString('base64url') },
    data: { ...signScopedKey(signing, { role: 'odonto_backend', expiresAt }), credential: 'odonto-data', kind: 'data-jwt' },
    identity: { ...signIdentityStoreKey(signing, { role: 'odonto_identity_web', expiresAt }), credential: 'odonto-identity', kind: 'identity-jwt' },
  };
}

test('Odonto exact 12/8 schema separates identity/data keys and only exposes anon', () => {
  const input = material(), { payload, metadata } = composeBundle(input, signing), value = JSON.parse(payload);
  assert.deepEqual(Object.keys(value).sort(), ['backend', 'frontend', 'version']);
  assert.equal(Object.keys(value.frontend).length, 12); assert.equal(Object.keys(value.backend).length, 8);
  for (const label of ['frontend', 'backend']) assert.deepEqual(Object.keys(value[label]).sort(), [...keys[label]].sort());
  assert.equal(value.frontend.ECOSYSTEM_BFF_KEY, value.backend.ECOSYSTEM_BFF_KEY);
  assert.equal(value.frontend.ECOSYSTEM_OIDC_CLIENT_ID, value.backend.ECOSYSTEM_OIDC_CLIENT_ID);
  assert.equal(value.frontend.NEXT_PUBLIC_SUPABASE_ANON_KEY, value.backend.SUPABASE_ANON_KEY);
  assert.equal(value.frontend.ECOSYSTEM_SESSION_API_KEY, input.identity.token);
  assert.equal(value.backend.SUPABASE_DATA_API_KEY, input.data.token);
  assert.equal(value.backend.ECOSYSTEM_APP_SECRET, input.client.serverKey);
  assert.equal('ECOSYSTEM_APP_SECRET' in value.frontend, false);
  assert.equal('ECOSYSTEM_OIDC_CLIENT_SECRET' in value.backend, false);
  assert.equal(metadata.uploaded, false); assert.equal(metadata.deployed, false); assert.equal(metadata.activated, false);
  for (const secret of [input.client.serverKey, input.client.provider.client_secret, input.session.value, input.bff.value, input.data.token, input.identity.token]) assert.equal(JSON.stringify(metadata).includes(secret), false);
});

test('reject wrong credential purpose/role, malformed key, callback substitution and reused keys', () => {
  for (const mutate of [
    value => { value.identity.purpose = 'data'; },
    value => { value.identity.role = 'service_role'; },
    value => { value.data.kind = 'identity-jwt'; },
    value => { value.session.environment = 'NEXT_PUBLIC_ENCRYPTION_KEY'; },
    value => { value.bff.value = value.client.serverKey; },
    value => { value.client.provider.client_secret = value.session.value; },
    value => { value.attachment.callbackUrl = 'https://evil.invalid/callback'; },
    value => { value.client.appId = 'app_kestrek'; },
    value => { value.session.value = 'short'; },
  ]) { const input = material(); mutate(input); assert.throws(() => composeBundle(input, signing)); }
});

test('all three JWT types require authentic signatures and more than one hour validity', () => {
  const input = material();
  for (const [token, role] of [[input.data.token, 'odonto_backend'], [input.identity.token, 'odonto_identity_web'], [input.anon, 'anon']]) {
    assert.equal(verifyToken(token, role, signing).role, role);
    const parts = token.split('.'); parts[2] = Buffer.alloc(32).toString('base64url');
    assert.throws(() => verifyToken(parts.join('.'), role, signing));
    assert.throws(() => verifyToken(token, role, signing, Date.now() + 86400_000));
    assert.throws(() => verifyToken(token, role, signing, Date.now() - 3600_000));
  }
  for (const anon of [fixtureAnon({ role: 'service_role' }), fixtureAnon({ exp: Math.floor(Date.now() / 1000) + 3599 }), fixtureAnon({ nbf: Math.floor(Date.now() / 1000) + 300 })]) assert.throws(() => composeBundle({ ...input, anon }, signing));
});

test('exclusive dual artifact ordering leaves no verified marker after backup failure', async () => {
  const result = composeBundle(material(), signing), files = new Map(), order = [];
  const options = { directory: '/fixture/primary', recovery: '/fixture/backup',
    write: async (path, value) => { assert.equal(files.has(path), false); files.set(path, value); order.push(path); },
    read: async path => files.get(path) };
  await stageBundle(result, options);
  assert.equal(order.length, 6);
  assert.deepEqual(order.map(path => path.split('/').at(-1)), ['odonto.started.json', 'odonto.started.json', 'odonto-identity-env.json', 'odonto-identity-env.json', 'odonto.verified.json', 'odonto.verified.json']);
  assert.equal(files.get('/fixture/primary/odonto-identity-env.json'), files.get('/fixture/backup/odonto-identity-env.json'));
  await assert.rejects(stageBundle(result, options));
  const failed = [];
  await assert.rejects(stageBundle(result, { ...options, write: async path => { failed.push(path); if (path === '/fixture/backup/odonto-identity-env.json') throw Error('fixture failure'); } }));
  assert.equal(failed.some(path => path.endsWith('verified.json')), false);
});

test('default plan cannot upload, deploy, take arbitrary paths or run an apply mode', async () => {
  assert.equal((await run([])).status, 'source-plan-no-files-no-connections');
  for (const args of [['--upload'], ['--apply'], ['--deploy'], ['--output', '/tmp/bundle.json'], ['--stage', '--verify']]) await assert.rejects(run(args));
});

test('exact bundle passes Odonto workflow authoritative validateBundle', { skip: process.env.ODONTO_CI_SCHEMA_TEST !== '1' }, async () => {
  const contract = await import(new URL('../../../../odonto-ai/scripts/identity-stage.mjs', import.meta.url));
  assert.deepEqual(keys, contract.keys);
  const { payload } = composeBundle(material(), signing);
  assert.deepEqual(contract.validateBundle(payload), JSON.parse(payload));
});
