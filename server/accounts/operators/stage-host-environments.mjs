// Offline, fixed-target operator. Never installs an env or contacts a service.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { constants, readFileSync } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { protectedPath, validateSigningConfig } from './issue-scoped-data-key.mjs';
import { registrations, validateRegistration, attachment } from './register-private-clients.mjs';

export const directories = Object.freeze({
  primary: '/etc/developed-accounts/host-env-staging',
  backup: '/var/backups/developed-accounts/host-env-staging',
  clients: '/etc/developed-accounts/client-staging',
  clientBackup: '/var/backups/developed-accounts/client-staging',
  credentials: '/etc/developed-accounts/runtime-staging',
  credentialBackup: '/var/backups/developed-accounts/runtime-staging',
});
export const contractHash = '25382bd9ba67ae0ce4eadd7ace302e53f265a5b73c11c85f1786c65266f04480';
const digest = value => createHash('sha256').update(value).digest('hex');
const reject = () => new Error('Host environment staging rejected; inspect protected state before retrying');
const check = value => { if (!value) throw reject(); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const encoded = (value, encoding) => typeof value === 'string' && Buffer.from(value, encoding).length === 32
  && Buffer.from(value, encoding).toString(encoding) === value;
const manifestSource = readFileSync(new URL('../../../docs/ecosystem-app-config-contracts.json', import.meta.url), 'utf8');
check(digest(manifestSource) === contractHash);
export const manifest = JSON.parse(manifestSource);
export const apps = manifest.apps.filter(app => app.runtimeEnv);
const clients = registrations(readFileSync(new URL('../launch-catalog.json', import.meta.url), 'utf8'));
const keep = Object.freeze({
  'mega-music': 'APP_ORIGIN AUTH_URL DATABASE_URL ENCRYPTION_KEY PORT SESSION_CLEANUP_ENABLED SUPABASE_ANON_KEY MANAGED_S4_ENDPOINT MANAGED_S4_BUCKET MANAGED_S4_ACCESS_KEY MANAGED_S4_SECRET_KEY MANAGED_S4_PREFIX MANAGED_S4_REGION MEGA_YOUTUBE_TOKEN MEGA_YOUTUBE_BRIDGE_TOKEN MEGA_YOUTUBE_API_ORIGIN YOUTUBE_S4_BUCKET MAX_UPLOAD_BYTES NODE_ENV',
  kestrek: 'CHATGPT_API_KEY_SHA256 CHATGPT_USER_ID EMAIL_SENDER_ADDRESS EMAIL_SENDER_NAME EMAIL_TOKEN_SECRET ENCRYPTION_KEY FRONTEND_URL MCP_OAUTH_STORE_PATH NOTIFICATIONS_CRON_ENABLED PORT SUPABASE_ANON_KEY SUPABASE_URL NODE_ENV',
  screentime: 'NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_SUPABASE_URL NEXT_TELEMETRY_DISABLED S4_ACCESS_KEY_ID S4_BUCKET S4_ENDPOINT S4_REGION S4_SECRET_ACCESS_KEY NODE_ENV',
  airsoft: 'NEXT_PUBLIC_APP_URL NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_TURNSTILE_SITE_KEY NEXT_TELEMETRY_DISABLED NODE_ENV SUPABASE_URL TURNSTILE_SECRET_KEY',
  vocabulum: 'AUTH_SECRET NEXTAUTH_SECRET NEXTAUTH_URL NEXT_TELEMETRY_DISABLED NODE_ENV OPENAI_API_KEY OPENAI_ENCRYPTION_SECRET SUPABASE_ANON_KEY SUPABASE_URL',
  otazkomat: 'CONTENT_ICON_BUCKET CORS_ORIGIN CRON_SECRET EMAIL_ADMIN_RECIPIENTS EMAIL_BASE_URL EMAIL_SENDER_ADDRESS EMAIL_SENDER_NAME ENCRYPTION_KEY FRONTEND_URL HOST PORT QUESTION_IMAGE_BUCKET REPORT_IMAGE_BUCKET SUPABASE_ANON_KEY SUPABASE_DB_SCHEMA SUPABASE_PUBLIC_URL SUPABASE_URL UNVERIFIED_CLEANUP_ENABLED NODE_ENV',
});
const obsolete = name => /SERVICE_ROLE|SUPABASE_SERVICE_KEY|PROVIDER.*(ADMIN|SECRET|KEY)|SUPABASE_SECRET_KEY|JWT_SECRET|JWT_SIGNING|MAILJET_/.test(name);

// Deliberately supports only single-line systemd EnvironmentFile assignments.
// Unknown/ambiguous syntax fails instead of silently changing a stored key.
export function parseEnvironment(source) {
  const env = Object.create(null);
  for (const line of source.split('\n')) {
    if (!line.trim() || /^[ \t]*[#;]/.test(line)) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    check(match && !Object.hasOwn(env, match[1]));
    let value = match[2];
    if (value.startsWith("'")) {
      check(value.endsWith("'") && !value.slice(1, -1).includes("'"));
      value = value.slice(1, -1);
    } else if (value.startsWith('"')) {
      check(value.endsWith('"'));
      const raw = value.slice(1, -1);
      value = '';
      for (let index = 0; index < raw.length; index++) {
        const char = raw[index];
        check(char !== '"');
        if (char === '\\') {
          check(index + 1 < raw.length);
          if ('\\"$`'.includes(raw[index + 1])) { value += raw[++index]; continue; }
        }
        value += char;
      }
    } else check(!/[\s\\'"]/.test(value));
    check(!/[\x00-\x1f\x7f]/.test(value));
    env[match[1]] = value;
  }
  return env;
}

export function serializeEnvironment(env) {
  return Object.keys(env).sort().map(name => {
    const value = env[name];
    check(/^[A-Z][A-Z0-9_]*$/.test(name) && typeof value === 'string' && !/[\x00-\x1f\x7f]/.test(value));
    return `${name}="${value.replace(/[\\"$`]/g, '\\$&')}"`;
  }).join('\n') + '\n';
}

export function validateJwt(artifact, app, signing, now = Date.now()) {
  validateSigningConfig(signing);
  check(artifact.version === 1 && artifact.credential === `${app.slug}-data` && artifact.kind === 'data-jwt'
    && artifact.algorithm === 'HS256' && artifact.issuer === manifest.oidcIssuer
    && artifact.audience === 'authenticated' && artifact.role === app.dataJwtRole);
  const parts = artifact.token?.split('.');
  check(parts?.length === 3 && parts.every(part => /^[A-Za-z0-9_-]+$/.test(part)));
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url'));
  const signature = Buffer.from(parts[2], 'base64url');
  const expected = createHmac('sha256', signing.jwtSecret).update(`${parts[0]}.${parts[1]}`).digest();
  check(signature.length === expected.length && timingSafeEqual(signature, expected));
  const current = Math.floor(now / 1000);
  check(header.alg === 'HS256' && header.typ === 'JWT' && payload.iss === manifest.oidcIssuer
    && payload.aud === 'authenticated' && payload.role === app.dataJwtRole
    && equal(Object.keys(payload).sort(), ['aud', 'exp', 'iat', 'iss', 'jti', 'nbf', 'role'])
    && uuid(payload.jti) && Number.isSafeInteger(payload.exp) && Number.isSafeInteger(payload.iat)
    && Number.isSafeInteger(payload.nbf) && payload.iat <= current && payload.nbf <= current
    && payload.exp > current + 300 && payload.exp - payload.iat <= 90 * 86400
    && artifact.expiresAt === new Date(payload.exp * 1000).toISOString()
    && artifact.issuedAt === new Date(payload.iat * 1000).toISOString());
  return artifact.token;
}

export function compose(app, original, material, signing, now = Date.now()) {
  check(apps.includes(app));
  const previous = parseEnvironment(original);
  check(previous.ECOSYSTEM_AUTH_ENABLED === 'false');
  const allowed = new Set(keep[app.slug].split(' '));
  const env = Object.create(null);
  const removed = [];
  for (const [name, value] of Object.entries(previous)) {
    if (obsolete(name)) { removed.push(name); continue; }
    if (name === 'ECOSYSTEM_AUTH_ENABLED' || name === 'NEXT_PUBLIC_ECOSYSTEM_AUTH_ENABLED') continue;
    check(allowed.has(name));
    env[name] = value;
  }
  const client = clients.find(entry => entry.key === `${app.slug}-web`);
  const registration = material.client;
  check(registration.version === 1 && registration.client === client.key && registration.appId === app.appId
    && registration.kind === 'web' && encoded(registration.serverKey, 'base64url'));
  validateRegistration(client, registration.provider, { created: true });
  check(equal(material.attachment, attachment(client, registration.provider, registration.serverKey)));
  check(client.callbackUrl === app.origin + app.callbackPath && client.launchUrl === app.origin + app.launchPath);
  Object.assign(env, {
    [app.originEnv]: app.origin, [app.centralOriginEnv]: manifest.centralOrigin,
    ECOSYSTEM_AUTH_ENABLED: 'true', ECOSYSTEM_OIDC_ISSUER: manifest.oidcIssuer,
    ECOSYSTEM_OIDC_CLIENT_ID: registration.provider.client_id,
    ECOSYSTEM_OIDC_CLIENT_SECRET: registration.provider.client_secret,
    [app.serverCheckKeyEnv]: registration.serverKey, ...app.extraEnv,
  });
  if (app.slug === 'mega-music') {
    check(encoded(previous.ENCRYPTION_KEY, 'hex'));
    const url = new URL(previous.DATABASE_URL);
    check(url.protocol === 'postgresql:' || url.protocol === 'postgres:');
    // Existing Supavisor login encodes the reviewed tenant in the username;
    // the underlying database role is mega_music_web. Preserve the full DSN.
    check(decodeURIComponent(url.username) === 'mega_music_web.oc-prod' && url.hostname === '127.0.0.1'
      && url.port === '5432' && url.password && url.pathname === '/postgres');
    check(env.DATABASE_URL === previous.DATABASE_URL && env.ENCRYPTION_KEY === previous.ENCRYPTION_KEY);
    env.SESSION_CLEANUP_ENABLED = 'false';
  } else {
    const session = material.session;
    const encoding = { kestrek: 'hex', screentime: 'base64', airsoft: 'hex', vocabulum: 'base64url', otazkomat: 'base64' }[app.slug];
    check(session.version === 1 && session.credential === `${app.slug}-session` && session.kind === 'session-key'
      && session.environment === app.sessionEncryptionEnv && session.encoding === encoding && encoded(session.value, encoding));
    for (const name of ['ENCRYPTION_KEY', 'OPENAI_ENCRYPTION_SECRET', 'AUTH_SECRET', 'NEXTAUTH_SECRET', 'EMAIL_TOKEN_SECRET']) {
      check(!previous[name] || previous[name] !== session.value);
    }
    env[app.sessionEncryptionEnv] = session.value;
    if (app.sessionDatabaseEnv) {
      const db = material.database;
      check(db.version === 1 && db.credential === `${app.slug}-db` && db.kind === 'database-password'
        && db.role === app.sessionDatabaseRole && db.database === 'postgres' && encoded(db.password, 'base64url'));
      env[app.sessionDatabaseEnv] = `postgresql://${db.role}:${encodeURIComponent(db.password)}@172.18.0.12:5432/postgres`;
    }
    if (app.dataJwtEnv) env[app.dataJwtEnv] = validateJwt(material.data, app, signing, now);
  }
  if (app.slug === 'screentime') env.NEXT_PUBLIC_ECOSYSTEM_AUTH_ENABLED = 'true';
  if (app.slug === 'kestrek') {
    check(uuid(material.nativeClientId) && material.nativeClientId !== env.ECOSYSTEM_OIDC_CLIENT_ID);
    env.ECOSYSTEM_NATIVE_OIDC_CLIENT_ID = material.nativeClientId;
    env.NOTIFICATIONS_CRON_ENABLED = 'false';
  }
  if (app.slug === 'otazkomat') env.UNVERIFIED_CLEANUP_ENABLED = 'false';
  if (app.slug === 'vocabulum') check((env.AUTH_SECRET || env.NEXTAUTH_SECRET)?.length >= 32);
  for (const name of app.publicApiEnv || []) check(env[name]);
  const secrets = [registration.provider.client_secret, registration.serverKey, material.session?.value,
    material.database?.password, material.data?.token].filter(Boolean);
  check(new Set(secrets).size === secrets.length);
  for (const [name, value] of Object.entries(env)) {
    check(!obsolete(name));
    if (/^(NEXT_PUBLIC_|VITE_|REACT_APP_)/.test(name)) check(!secrets.some(secret => value.includes(secret)));
    if (value.startsWith('eyJ') && value.split('.').length === 3) {
      const claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url'));
      check(claims.role === 'anon' || (name === app.dataJwtEnv && claims.role === app.dataJwtRole));
      check(Number.isSafeInteger(claims.exp) && claims.exp > Math.floor(now / 1000) + 300
        && (claims.nbf === undefined || (Number.isSafeInteger(claims.nbf) && claims.nbf <= Math.floor(now / 1000))));
    }
    check(!value.startsWith('sb_secret_'));
  }
  const payload = serializeEnvironment(env);
  check(equal(parseEnvironment(payload), JSON.parse(JSON.stringify(env, Object.keys(env).sort()))));
  return { payload, metadata: { app: app.slug, runtimePath: app.runtimeEnv, callback: client.callbackUrl,
    envNames: Object.keys(env).sort(), removedNames: removed.sort(), runtimeConfigured: false, activated: false,
    preservedSourceSha256: digest(original), stagedSha256: digest(payload),
    ...(material.data ? { dataRole: app.dataJwtRole, expiresAt: material.data.expiresAt } : {}) } };
}

export async function readPrivate(path) {
  // Existing systemd sources are root0600 inside root0755 /etc/developed-apps.
  // This exact read allowlist does not relax private staging output rules.
  let expected;
  if (apps.some(app => app.runtimeEnv === path)) {
    for (const directory of ['/', '/etc', '/etc/developed-apps']) {
      const info = await lstat(directory);
      check(info.isDirectory() && !info.isSymbolicLink() && info.uid === 0 && !(info.mode & 0o022));
    }
    expected = await lstat(path);
    check(expected.isFile() && !expected.isSymbolicLink() && expected.nlink === 1 && (expected.mode & 0o777) === 0o600);
  } else expected = await protectedPath(path, { mustExist: true });
  check(expected.uid === 0 && expected.size <= 131072);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const actual = await handle.stat();
    check(actual.uid === 0 && actual.nlink === 1 && actual.ino === expected.ino && actual.dev === expected.dev
      && (actual.mode & 0o777) === 0o600 && actual.size <= 131072);
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}

export async function writePrivate(path, value) {
  check(!await protectedPath(path));
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
  const parent = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await parent.sync(); } finally { await parent.close(); }
}

async function matched(primary, backup, file) {
  const a = await readPrivate(`${primary}/${file}`), b = await readPrivate(`${backup}/${file}`);
  check(a === b); return JSON.parse(a);
}

async function readMaterial(app) {
  const client = await matched(directories.clients, directories.clientBackup, `${app.slug}-web.credentials.json`);
  const attach = await matched(directories.clients, directories.clientBackup, `${app.slug}-web.attach.json`);
  const marker = JSON.parse(await readPrivate(`${directories.clients}/${app.slug}-web.verified.json`));
  check(marker.client === `${app.slug}-web` && marker.clientId === client.provider.client_id);
  const material = { client, attachment: attach };
  for (const [type, suffix] of [['database', 'db'], ['session', 'session'], ['data', 'data']]) {
    if (app.slug === 'mega-music' || (type === 'database' && !app.sessionDatabaseEnv) || (type === 'data' && !app.dataJwtEnv)) continue;
    const name = `${app.slug}-${suffix}`;
    const credential = await matched(directories.credentials, directories.credentialBackup, `${name}.credentials.json`);
    const verified = await matched(directories.credentials, directories.credentialBackup, `${name}.verified.json`);
    check(verified.version === 1 && verified.credential === name && verified.kind === credential.kind
      && verified.role === (type === 'data' || app.slug === 'vocabulum' ? app.dataJwtRole : app.sessionDatabaseRole)
      && verified.runtimeConfigured === false && verified.activated === false && Number.isFinite(Date.parse(verified.verifiedAt)));
    if (type === 'data') check(verified.expiresAt === credential.expiresAt && Number.isFinite(Date.parse(verified.rotationDueAt)));
    material[type] = credential;
  }
  if (app.slug === 'kestrek') {
    const native = await matched(directories.clients, directories.clientBackup, 'kestrek-android.credentials.json');
    check(native.appId === app.appId && native.kind === 'native' && !native.serverKey);
    validateRegistration(clients.find(entry => entry.key === 'kestrek-android'), native.provider);
    material.nativeClientId = native.provider.client_id;
  }
  return material;
}

export async function stageOutputs(app, original, result, { write = writePrivate, read = readPrivate,
  primary = directories.primary, backup = directories.backup } = {}) {
  const marker = JSON.stringify({ version: 1, app: app.slug, startedAt: new Date().toISOString(),
    instruction: 'Staged only. Do not automatically retry, install, restart or activate.' }) + '\n';
  for (const directory of [primary, backup]) await write(`${directory}/${app.slug}.started.json`, marker);
  for (const directory of [primary, backup]) await write(`${directory}/${app.slug}.legacy.env`, original);
  for (const directory of [primary, backup]) await write(`${directory}/${app.slug}.central.env`, result.payload);
  for (const directory of [primary, backup]) {
    check(await read(`${directory}/${app.slug}.legacy.env`) === original);
    check(await read(`${directory}/${app.slug}.central.env`) === result.payload);
  }
  const verified = JSON.stringify({ version: 1, ...result.metadata, verifiedAt: new Date().toISOString() }) + '\n';
  for (const directory of [primary, backup]) await write(`${directory}/${app.slug}.verified.json`, verified);
}

export async function run(args) {
  check(args.length === 0 || (args.length === 1 && ['--check', '--stage', '--verify'].includes(args[0])));
  if (!args.length) return { status: 'source-plan-no-files-no-connections', apps: apps.map(app => app.slug), directories };
  check(process.getuid() === 0);
  for (const directory of [directories.primary, directories.backup]) {
    const info = await lstat(directory);
    check(info.isDirectory() && !info.isSymbolicLink() && info.uid === 0 && (info.mode & 0o777) === 0o700);
    await protectedPath(`${directory}/reserved`);
  }
  const signing = validateSigningConfig(JSON.parse(await readPrivate('/etc/developed-accounts/operator-signing.json')));
  const prepared = [];
  const privateValues = new Set(), clientIds = new Set();
  for (const app of apps) {
    const original = await readPrivate(app.runtimeEnv);
    const material = await readMaterial(app);
    const result = compose(app, original, material, signing);
    check(!clientIds.has(material.client.provider.client_id));
    clientIds.add(material.client.provider.client_id);
    for (const value of [material.client.serverKey, material.client.provider.client_secret, material.session?.value,
      material.database?.password, material.data?.token].filter(Boolean)) {
      check(!privateValues.has(value)); privateValues.add(value);
    }
    for (const directory of [directories.primary, directories.backup]) {
      for (const suffix of ['started.json', 'legacy.env', 'central.env', 'verified.json']) {
        const info = await protectedPath(`${directory}/${app.slug}.${suffix}`);
        check(args[0] === '--verify' ? Boolean(info) : !info);
      }
    }
    prepared.push({ app, original, result });
  }
  for (const { app, original, result } of prepared) {
    check(await readPrivate(app.runtimeEnv) === original);
    if (args[0] === '--stage') await stageOutputs(app, original, result);
    if (args[0] === '--verify') {
      for (const directory of [directories.primary, directories.backup]) {
        check(await readPrivate(`${directory}/${app.slug}.legacy.env`) === original);
        check(await readPrivate(`${directory}/${app.slug}.central.env`) === result.payload);
      }
      const verified = await matched(directories.primary, directories.backup, `${app.slug}.verified.json`);
      for (const [key, value] of Object.entries(result.metadata)) check(equal(verified[key], value));
    }
  }
  return { status: args[0] === '--check' ? 'validated-no-files' : args[0] === '--stage' ? 'staged-not-installed' : 'verified-not-installed',
    apps: prepared.map(({ result }) => result.metadata) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await run(process.argv.slice(2)))); }
  catch { console.error(reject().message); process.exitCode = 1; }
}
