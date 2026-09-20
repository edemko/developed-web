// Offline operator only. Never import into an application runtime. Does not
// inspect Docker, read an application's env, rotate keys, or contact a service.
import { createHmac, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const issuer = 'https://sam-api.developed162.bid/auth/v1';
export const audience = 'authenticated';
export const roles = Object.freeze(['kestrek_backend', 'screentime_backend',
  'vocabulum_backend', 'odonto_backend', 'otazkomat_backend']);
const maxConfigBytes = 16384;
const maxLifetime = 90 * 24 * 60 * 60;
const invalid = () => new Error('Scoped-key configuration or destination rejected');
const own = info => info.uid === process.getuid() || info.uid === 0;

async function maybeStat(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw invalid(); }
}

// Refuse Git worktrees and symlinks, including symlinked ancestor directories.
// A sticky /tmp ancestor is safe with a separately owned private child directory;
// the immediate containing directory must still be private and operator-owned.
export async function protectedPath(path, { mustExist = false } = {}) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) throw invalid();
  const parent = dirname(path);
  for (let directory = parent;; directory = dirname(directory)) {
    const info = await maybeStat(directory);
    if (!info?.isDirectory() || info.isSymbolicLink() || !own(info)) throw invalid();
    if ((info.mode & 0o022) && !(directory !== parent && (info.mode & 0o1000))) throw invalid();
    if (directory === parent && (info.mode & 0o077)) throw invalid();
    if (await maybeStat(`${directory}/.git`)) throw invalid();
    if (directory === dirname(directory)) break;
  }
  const info = await maybeStat(path);
  if (mustExist && !info) throw invalid();
  if (info && (!info.isFile() || info.isSymbolicLink() || !own(info)
    || info.nlink !== 1 || (info.mode & 0o777) !== 0o600)) throw invalid();
  return info;
}

export function validateSigningConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || Object.keys(config).sort().join(',') !== 'algorithm,audience,issuer,jwtSecret,version'
    || config.version !== 1 || config.algorithm !== 'HS256'
    || config.issuer !== issuer || config.audience !== audience
    || typeof config.jwtSecret !== 'string' || Buffer.byteLength(config.jwtSecret) < 32
    || Buffer.byteLength(config.jwtSecret) > 4096 || /[\x00-\x1f\x7f]/.test(config.jwtSecret)) throw invalid();
  return config;
}

export function validateRequest({ role, expiresAt }, now = Date.now()) {
  return boundedRequest({ role, expiresAt }, roles, now);
}

// Separate operator API: this role must never enter the five-data-role CLI.
export function validateIdentityStoreRequest(request, now = Date.now()) {
  return boundedRequest(request, ['odonto_identity_web'], now);
}

function boundedRequest({ role, expiresAt }, allowed, now) {
  if (!allowed.includes(role) || typeof expiresAt !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(expiresAt)) throw invalid();
  const expiryMs = Date.parse(expiresAt), issuedAt = Math.floor(now / 1000);
  if (!Number.isFinite(expiryMs) || new Date(expiryMs).toISOString() !== expiresAt.replace('Z', '.000Z')) throw invalid();
  const exp = Math.floor(expiryMs / 1000);
  if (exp - issuedAt < 300 || exp - issuedAt > maxLifetime) throw invalid();
  return { role, exp, issuedAt };
}

export function signScopedKey(config, request, now = Date.now()) {
  return signBoundedKey(config, validateRequest(request, now));
}

export function signIdentityStoreKey(config, request, now = Date.now()) {
  return { ...signBoundedKey(config, validateIdentityStoreRequest(request, now)), purpose: 'identity-store' };
}

function signBoundedKey(config, { role, exp, issuedAt }) {
  validateSigningConfig(config);
  const claims = { iss: issuer, aud: audience, role, iat: issuedAt, nbf: issuedAt - 30, exp, jti: randomUUID() };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  const token = `${input}.${createHmac('sha256', config.jwtSecret).update(input).digest('base64url')}`;
  return { version: 1, algorithm: 'HS256', issuer, audience, role,
    issuedAt: new Date(issuedAt * 1000).toISOString(), expiresAt: new Date(exp * 1000).toISOString(), token };
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === '--write') { if (values.write) throw invalid(); values.write = true; continue; }
    if (!['--config', '--role', '--expires-at', '--output'].includes(name)
      || Object.hasOwn(values, name) || !args[index + 1] || args[index + 1].startsWith('--')) throw invalid();
    values[name] = args[++index];
  }
  if (!values['--config'] || !values['--output'] || values['--config'] === values['--output']) throw invalid();
  return { configPath: values['--config'], outputPath: values['--output'],
    role: values['--role'], expiresAt: values['--expires-at'], write: Boolean(values.write) };
}

export async function run(args) {
  const request = parseArgs(args);
  validateRequest(request);
  const expected = await protectedPath(request.configPath, { mustExist: true });
  if (expected.size > maxConfigBytes || await protectedPath(request.outputPath)) throw invalid();
  const handle = await open(request.configPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  let config;
  try {
    const actual = await handle.stat();
    if (actual.dev !== expected.dev || actual.ino !== expected.ino || actual.size > maxConfigBytes
      || actual.nlink !== 1 || (actual.mode & 0o777) !== 0o600 || !own(actual)) throw invalid();
    config = validateSigningConfig(JSON.parse(await handle.readFile({ encoding: 'utf8' })));
  } finally { await handle.close(); }
  if (!request.write) return `Validated ${request.role}; dry run, no credential issued or file created.`;
  // Recheck immediately before exclusive creation. Existing credentials are
  // never overwritten; rotation always writes a distinct protected destination.
  if (await protectedPath(request.outputPath)) throw invalid();
  const artifact = signScopedKey(config, request);
  const output = await open(request.outputPath,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
  try {
    await output.chmod(0o600);
    await output.writeFile(`${JSON.stringify(artifact)}\n`, { encoding: 'utf8' });
    await output.sync();
  } finally { await output.close(); }
  return `Issued ${request.role}; protected file written, expires ${artifact.expiresAt}.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(message => process.stdout.write(`${message}\n`))
    .catch(() => { process.stderr.write('Scoped-key operation failed; no credentials printed. Review protected inputs and destination.\n'); process.exitCode = 1; });
}
