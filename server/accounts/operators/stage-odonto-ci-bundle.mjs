// Offline credential assembly only. No GitHub/Vercel/network/database calls.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { manifest, directories as hostDirectories, parseEnvironment, readPrivate, writePrivate } from './stage-host-environments.mjs';
import { protectedPath, validateSigningConfig } from './issue-scoped-data-key.mjs';
import { registrations, validateRegistration, attachment } from './register-private-clients.mjs';

export const primary = '/etc/developed-accounts/odonto-ci-staging';
export const backup = '/var/backups/developed-accounts/odonto-ci-staging';
export const bundleName = 'odonto-identity-env.json';
export const secretName = 'ODONTO_IDENTITY_ENV_JSON';
export const keys = Object.freeze({
  frontend: ['ECOSYSTEM_AUTH_ENABLED', 'ECOSYSTEM_ORIGIN', 'ECOSYSTEM_OIDC_CLIENT_ID', 'ECOSYSTEM_BFF_KEY',
    'ECOSYSTEM_APP_ORIGIN', 'ECOSYSTEM_BACKEND_ORIGIN', 'ECOSYSTEM_OIDC_ISSUER', 'ECOSYSTEM_OIDC_CLIENT_SECRET',
    'ECOSYSTEM_SESSION_API_ORIGIN', 'ECOSYSTEM_SESSION_API_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ECOSYSTEM_ENCRYPTION_KEY'],
  backend: ['ECOSYSTEM_AUTH_ENABLED', 'ECOSYSTEM_ORIGIN', 'ECOSYSTEM_OIDC_CLIENT_ID', 'ECOSYSTEM_BFF_KEY',
    'ECOSYSTEM_APP_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_DATA_API_KEY'],
});
const app = manifest.apps.find(app => app.slug === 'odonto');
const registered = registrations(await readFile(new URL('../launch-catalog.json', import.meta.url), 'utf8')).find(client => client.key === 'odonto-web');
const invalid = () => new Error('Odonto private bundle rejected; inspect protected state before retrying');
const check = value => { if (!value) throw invalid(); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hash = value => createHash('sha256').update(value).digest('hex');
const encoded = (value, encoding) => typeof value === 'string' && Buffer.from(value, encoding).length === 32
  && Buffer.from(value, encoding).toString(encoding) === value;
const exactKeys = (value, names) => check(value && equal(Object.keys(value).sort(), [...names].sort()));

export function verifyToken(token, role, signing, now = Date.now()) {
  validateSigningConfig(signing);
  check(typeof token === 'string');
  const parts = token.split('.');
  check(parts.length === 3 && parts.every(part => /^[A-Za-z0-9_-]+$/.test(part)));
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  const actual = Buffer.from(parts[2], 'base64url');
  const expected = createHmac('sha256', signing.jwtSecret).update(parts.slice(0, 2).join('.')).digest();
  const current = Math.floor(now / 1000);
  check(header.alg === 'HS256' && actual.length === expected.length && timingSafeEqual(actual, expected)
    && claims.role === role && Number.isSafeInteger(claims.exp) && claims.exp > current + 3600
    && Number.isSafeInteger(claims.iat) && claims.iat <= current
    && (claims.nbf === undefined || (Number.isSafeInteger(claims.nbf) && claims.nbf <= current)));
  if (role !== 'anon') check(claims.iss === manifest.oidcIssuer && claims.aud === 'authenticated'
    && claims.exp - claims.iat <= 90 * 86400 && header.typ === 'JWT'
    && equal(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'iss', 'jti', 'nbf', 'role'])
    && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(claims.jti));
  return claims;
}

function credentialJwt(credential, name, role, kind, signing, now) {
  check(credential.version === 1 && credential.credential === name && credential.role === role
    && credential.kind === kind && credential.algorithm === 'HS256'
    && credential.issuer === manifest.oidcIssuer && credential.audience === 'authenticated');
  if (kind === 'identity-jwt') check(credential.purpose === 'identity-store');
  const claims = verifyToken(credential.token, role, signing, now);
  check(credential.expiresAt === new Date(claims.exp * 1000).toISOString()
    && credential.issuedAt === new Date(claims.iat * 1000).toISOString());
  return credential.token;
}

function key(credential, name, kind, environment, encoding) {
  check(credential.version === 1 && credential.credential === name && credential.kind === kind
    && credential.environment === environment && credential.encoding === encoding && encoded(credential.value, encoding));
  return credential.value;
}

export function composeBundle(material, signing, now = Date.now()) {
  const client = material.client;
  check(client.version === 1 && client.client === 'odonto-web' && client.appId === 'app_odonto' && client.kind === 'web'
    && encoded(client.serverKey, 'base64url'));
  validateRegistration(registered, client.provider, { created: true });
  check(equal(material.attachment, attachment(registered, client.provider, client.serverKey)));
  check(registered.callbackUrl === app.origin + app.callbackPath && registered.launchUrl === app.origin + app.launchPath);
  const bff = key(material.bff, 'odonto-bff', 'bff-key', 'ECOSYSTEM_BFF_KEY', 'base64url');
  const session = key(material.session, 'odonto-session', 'session-key', 'ECOSYSTEM_ENCRYPTION_KEY', 'hex');
  const data = credentialJwt(material.data, 'odonto-data', 'odonto_backend', 'data-jwt', signing, now);
  const identity = credentialJwt(material.identity, 'odonto-identity', 'odonto_identity_web', 'identity-jwt', signing, now);
  verifyToken(material.anon, 'anon', signing, now);
  const common = { ECOSYSTEM_AUTH_ENABLED: 'true', ECOSYSTEM_ORIGIN: manifest.centralOrigin,
    ECOSYSTEM_OIDC_CLIENT_ID: client.provider.client_id, ECOSYSTEM_BFF_KEY: bff };
  const bundle = { version: 1,
    frontend: { ...common, ECOSYSTEM_APP_ORIGIN: app.origin, ECOSYSTEM_BACKEND_ORIGIN: app.backendOrigin,
      ECOSYSTEM_OIDC_ISSUER: manifest.oidcIssuer, ECOSYSTEM_OIDC_CLIENT_SECRET: client.provider.client_secret,
      ECOSYSTEM_SESSION_API_ORIGIN: 'https://sam-api.developed162.bid', ECOSYSTEM_SESSION_API_KEY: identity,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: material.anon, ECOSYSTEM_ENCRYPTION_KEY: session },
    backend: { ...common, ECOSYSTEM_APP_SECRET: client.serverKey, SUPABASE_URL: 'https://sam-api.developed162.bid',
      SUPABASE_ANON_KEY: material.anon, SUPABASE_DATA_API_KEY: data },
  };
  exactKeys(bundle, ['version', 'frontend', 'backend']);
  for (const [label, allowed] of Object.entries(keys)) {
    exactKeys(bundle[label], allowed);
    for (const value of Object.values(bundle[label])) check(typeof value === 'string' && value.length > 0
      && value.length <= 8192 && !/[\x00-\x1f\x7f]/.test(value));
  }
  const privateValues = [bff, session, identity, data, client.serverKey, client.provider.client_secret];
  check(new Set(privateValues).size === privateValues.length && privateValues.every(value => !material.anon.includes(value)));
  const payload = JSON.stringify(bundle) + '\n';
  check(payload.length < 40000);
  return { payload, metadata: { version: 1, app: 'odonto', secretName, scope: 'private-local-artifact-only',
    envNames: keys, stagedSha256: hash(payload),
    dataExpiresAt: material.data.expiresAt, identityExpiresAt: material.identity.expiresAt,
    frontendOrigin: app.origin, backendOrigin: app.backendOrigin, callback: registered.callbackUrl,
    uploaded: false, deployed: false, activated: false } };
}

async function matched(a, b, name) {
  const first = await readPrivate(`${a}/${name}`), second = await readPrivate(`${b}/${name}`);
  check(first === second); return first;
}

async function material() {
  const json = async (a, b, name) => JSON.parse(await matched(a, b, name));
  const client = await json(hostDirectories.clients, hostDirectories.clientBackup, 'odonto-web.credentials.json');
  const attach = await json(hostDirectories.clients, hostDirectories.clientBackup, 'odonto-web.attach.json');
  const verifiedClient = JSON.parse(await readPrivate(`${hostDirectories.clients}/odonto-web.verified.json`));
  check(verifiedClient.client === 'odonto-web' && verifiedClient.clientId === client.provider.client_id);
  const result = { client, attachment: attach };
  for (const suffix of ['session', 'bff', 'data', 'identity']) {
    const name = `odonto-${suffix}`;
    const artifact = await json(hostDirectories.credentials, hostDirectories.credentialBackup, `${name}.credentials.json`);
    const verified = await json(hostDirectories.credentials, hostDirectories.credentialBackup, `${name}.verified.json`);
    check(verified.version === 1 && verified.credential === name && verified.kind === artifact.kind
      && verified.role === (suffix === 'data' ? 'odonto_backend' : 'odonto_identity_web')
      && verified.runtimeConfigured === false && verified.activated === false && Number.isFinite(Date.parse(verified.verifiedAt)));
    if (suffix === 'data' || suffix === 'identity') check(verified.expiresAt === artifact.expiresAt && Number.isFinite(Date.parse(verified.rotationDueAt)));
    result[suffix] = artifact;
  }
  const old = await matched(hostDirectories.primary, hostDirectories.backup, 'mega-music.legacy.env');
  const hostMarker = await json(hostDirectories.primary, hostDirectories.backup, 'mega-music.verified.json');
  check(hostMarker.app === 'mega-music' && hostMarker.preservedSourceSha256 === hash(old));
  result.anon = parseEnvironment(old).SUPABASE_ANON_KEY;
  return result;
}

export async function stageBundle(result, { write = writePrivate, read = readPrivate, directory = primary, recovery = backup } = {}) {
  const started = JSON.stringify({ version: 1, app: 'odonto', startedAt: new Date().toISOString(),
    instruction: 'Local staging only; no automatic upload, deployment or overwrite.' }) + '\n';
  for (const dir of [directory, recovery]) await write(`${dir}/odonto.started.json`, started);
  for (const dir of [directory, recovery]) await write(`${dir}/${bundleName}`, result.payload);
  for (const dir of [directory, recovery]) check(await read(`${dir}/${bundleName}`) === result.payload);
  const verified = JSON.stringify({ ...result.metadata, verifiedAt: new Date().toISOString() }) + '\n';
  for (const dir of [directory, recovery]) await write(`${dir}/odonto.verified.json`, verified);
}

export async function run(args) {
  check(args.length === 0 || (args.length === 1 && ['--check', '--stage', '--verify'].includes(args[0])));
  if (!args.length) return { status: 'source-plan-no-files-no-connections', primary, backup, bundleName, secretName, envNames: keys };
  check(process.getuid() === 0);
  for (const dir of [primary, backup]) {
    const stat = await lstat(dir);
    check(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0 && (stat.mode & 0o777) === 0o700);
    for (const name of ['odonto.started.json', bundleName, 'odonto.verified.json']) {
      const found = await protectedPath(`${dir}/${name}`);
      check(args[0] === '--verify' ? Boolean(found) : !found);
    }
  }
  const signing = validateSigningConfig(JSON.parse(await readPrivate('/etc/developed-accounts/operator-signing.json')));
  const result = composeBundle(await material(), signing);
  if (args[0] === '--stage') await stageBundle(result);
  if (args[0] === '--verify') {
    check(await matched(primary, backup, bundleName) === result.payload);
    const verified = JSON.parse(await matched(primary, backup, 'odonto.verified.json'));
    for (const [name, value] of Object.entries(result.metadata)) check(equal(verified[name], value));
  }
  return { status: args[0] === '--check' ? 'validated-no-files' : args[0] === '--stage' ? 'staged-not-uploaded' : 'verified-not-uploaded', ...result.metadata };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await run(process.argv.slice(2)))); }
  catch { console.error(invalid().message); process.exitCode = 1; }
}
