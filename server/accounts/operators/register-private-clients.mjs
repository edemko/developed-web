// Private, one-client-at-a-time operator. Never imported by an app runtime.
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { protectedPath } from './issue-scoped-data-key.mjs';

export const catalogHash = '7fb70bc4b9b4d25b30e58e744225abc7de3efc8c295630b9ee40a81248a9a378';
export const providerUrl = 'http://127.0.0.1:3141';
const configPath = '/etc/developed-accounts/accounts.env';
export const stagingDirectory = '/etc/developed-accounts/client-staging';
export const backupDirectory = '/var/backups/developed-accounts/client-staging';
const invalid = () => new Error('Private client operation rejected; inspect protected state before any retry');
const requireTrue = value => { if (!value) throw invalid(); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function registrations(source) {
  requireTrue(createHash('sha256').update(source).digest('hex') === catalogHash);
  const catalog = JSON.parse(source);
  return [...catalog.apps.map(app => ({ ...app, key: `${app.slug}-web`, kind: 'web' })),
    { appId: 'app_kestrek', slug: 'kestrek', name: 'KešTrek Android', key: 'kestrek-android',
      kind: 'native', callbackUrl: 'sk.kestrek://oauth/callback' }];
}

export function requestBody(client) {
  return { client_name: `DevelopED ${client.name} ${client.kind === 'web' ? 'web' : 'native'}`,
    client_type: client.kind === 'web' ? 'confidential' : 'public',
    token_endpoint_auth_method: client.kind === 'web' ? 'client_secret_post' : 'none',
    redirect_uris: [client.callbackUrl], grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'] };
}

export function validateRegistration(client, response, { created = false } = {}) {
  const expected = requestBody(client);
  requireTrue(response && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(response.client_id));
  for (const key of Object.keys(expected)) requireTrue(same(response[key], expected[key]));
  requireTrue(response.registration_type === 'manual');
  if (client.kind === 'native') requireTrue(!response.client_secret);
  if (created && client.kind === 'web') requireTrue(typeof response.client_secret === 'string' && response.client_secret.length >= 32);
  return response;
}

export function attachment(client, response, serverKey) {
  return client.kind === 'web' ? { appId: client.appId, slug: client.slug, clientId: response.client_id,
    serverKey, launchUrl: client.launchUrl, callbackUrl: client.callbackUrl }
    : { appId: client.appId, clientId: response.client_id, callbackUrl: client.callbackUrl };
}

// fsync both the file and its directory before the next network side effect.
export async function exclusiveWrite(path, value) {
  requireTrue(!await protectedPath(path));
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(JSON.stringify(value) + '\n'); await file.sync(); }
  finally { await file.close(); }
  const directory = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await directory.sync(); } finally { await directory.close(); }
}

async function privateConfig() {
  const expected = await protectedPath(configPath, { mustExist: true });
  requireTrue(expected.uid === 0 && expected.size < 65536);
  const file = await open(configPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const actual = await file.stat();
    requireTrue(actual.ino === expected.ino && actual.dev === expected.dev && actual.uid === 0 && actual.nlink === 1);
    const env = parseEnv(await file.readFile('utf8'));
    requireTrue(env.ACCOUNTS_PROVIDER_URL === providerUrl && env.ACCOUNTS_MAIL_ENABLED === 'false'
      && env.ACCOUNTS_ORIGIN === 'https://www.developed.sk' && env.ACCOUNTS_PROVIDER_ADMIN_KEY?.length > 32);
    return env.ACCOUNTS_PROVIDER_ADMIN_KEY;
  } finally { await file.close(); }
}

export function transport(key, fetcher = fetch) {
  return async (path, body) => {
    requireTrue(path === '/admin/oauth/clients' || /^\/admin\/oauth\/clients\/[0-9a-f-]{36}$/.test(path));
    const result = await fetcher(providerUrl + path, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(10000) });
    // A single request, no retry. Raw provider errors may contain credentials.
    requireTrue(result.ok);
    return result.json();
  };
}

export async function stageClient(client, { call, write, directory, backup, existing }) {
  requireTrue(!existing.some(entry => entry.client_name === requestBody(client).client_name
    || entry.redirect_uris?.includes(client.callbackUrl)));
  const marker = { version: 1, client: client.key, startedAt: new Date().toISOString(), request: requestBody(client),
    instruction: 'Never retry POST automatically. Reconcile provider and protected response files if interrupted.' };
  // Durable markers survive errors/crashes, refusing ambiguous repeat creation.
  await write(`${directory}/${client.key}.started.json`, marker);
  await write(`${backup}/${client.key}.started.json`, marker);
  const response = await call('/admin/oauth/clients', requestBody(client));
  // Preserve the one-time secret even when response validation/read-back fails.
  const secret = { version: 1, client: client.key, appId: client.appId, kind: client.kind,
    provider: response, ...(client.kind === 'web' ? { serverKey: randomBytes(32).toString('base64url') } : {}) };
  await write(`${directory}/${client.key}.credentials.json`, secret);
  await write(`${backup}/${client.key}.credentials.json`, secret);
  validateRegistration(client, response, { created: true });
  const observed = validateRegistration(client, await call(`/admin/oauth/clients/${response.client_id}`));
  requireTrue(observed.client_id === response.client_id);
  const input = attachment(client, response, secret.serverKey);
  await write(`${directory}/${client.key}.attach.json`, input);
  await write(`${backup}/${client.key}.attach.json`, input);
  await write(`${directory}/${client.key}.verified.json`, { client: client.key, clientId: response.client_id,
    checkedAt: new Date().toISOString(), centralAttached: false, pkcePolicy: 'central S256 gate; provider also accepts plain' });
  return { client: client.key, kind: client.kind, callback: client.callbackUrl, launch: client.launchUrl,
    status: 'provider-registered-not-attached' };
}

export async function run(args) {
  requireTrue(args.length >= 2 && args[0] === '--client' && args.length <= 3
    && (!args[2] || ['--check', '--apply'].includes(args[2])));
  const clients = registrations(await readFile(new URL('../launch-catalog.json', import.meta.url), 'utf8'));
  const client = clients.find(entry => entry.key === args[1]);
  requireTrue(client);
  if (!args[2]) return { client: client.key, request: requestBody(client), status: 'dry-run-no-connection-no-writes' };
  requireTrue(process.getuid() === 0);
  for (const directory of [stagingDirectory, backupDirectory]) {
    const info = await lstat(directory);
    requireTrue(info.isDirectory() && !info.isSymbolicLink() && info.uid === 0 && (info.mode & 0o777) === 0o700);
    for (const suffix of ['started', 'credentials', 'attach', 'verified']) {
      requireTrue(!await protectedPath(`${directory}/${client.key}.${suffix}.json`));
    }
  }
  const call = transport(await privateConfig());
  const result = await call('/admin/oauth/clients');
  const existing = result.clients ?? [];
  requireTrue(Array.isArray(existing));
  requireTrue(!existing.some(entry => entry.client_name === requestBody(client).client_name
    || entry.redirect_uris?.includes(client.callbackUrl)));
  if (args[2] === '--check') return { client: client.key, status: 'private-preflight-passed-no-writes', providerClientCount: existing.length };
  return stageClient(client, { call, write: exclusiveWrite, directory: stagingDirectory, backup: backupDirectory, existing });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error('Private client operation failed; no credentials printed. Reconcile protected markers and provider before retrying; no automatic retry or rollback.');
    process.exitCode = 1;
  });
}
