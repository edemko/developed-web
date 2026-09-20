// Source-reviewed one-shot API-tunnel handoff. Never changes Caddy or human admission.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, mkdirSync, openSync, closeSync, writeFileSync, fsyncSync, fchmodSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API_HOST = 'sam-api.developed162.bid';
const STUDIO_HOST = 'sam-studio.developed162.bid';
const OLD_PATH = '^/(auth|rest|realtime|storage|functions|graphql)/';
const BACKUP = '/var/backups/developed-api-tunnel-20260920';
const CADDY = '/etc/caddy/Caddyfile';
const check = (ok, message) => { if (!ok) throw Error(message); };
const sha = value => createHash('sha256').update(value).digest('hex');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(value, (_, item) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const configHash = value => sha(canonical(value));

export function transform(config) {
  check(object(config) && Array.isArray(config.ingress), 'Unexpected tunnel config');
  check(!config.originRequest?.httpHostHeader, 'Global Host override requires review');
  const entries = config.ingress;
  const indices = entries.flatMap((entry, index) => entry.hostname === API_HOST ? [index] : []);
  check(indices.length === 2, 'Expected exactly two legacy API entries');
  const [primaryIndex, fallbackIndex] = indices;
  // Existing snapshot places the API entries first. Do not guess wildcard priority.
  check(primaryIndex === 0 && fallbackIndex === 1, 'Unexpected API route priority');
  const primary = entries[primaryIndex], fallback = entries[fallbackIndex];
  check(primary.service === 'http://127.0.0.1:8000' && primary.path === OLD_PATH, 'Unexpected legacy API origin/path');
  check(fallback.service === 'http_status:404' && !fallback.path, 'Unexpected API fallback');
  check(!primary.originRequest?.httpHostHeader && !fallback.originRequest?.httpHostHeader, 'API Host override requires review');
  const studio = entries.filter(entry => entry.hostname === STUDIO_HOST);
  check(studio.length === 1 && studio[0].service === 'http://127.0.0.1:8000' && !studio[0].path, 'Unexpected Studio route');
  const last = entries.at(-1);
  check(last && !last.hostname && !last.path && last.service === 'http_status:404', 'Expected final tunnel404');
  const desired = structuredClone(config);
  const replacement = { ...desired.ingress[primaryIndex], service: 'http://127.0.0.1:80' };
  delete replacement.path;
  desired.ingress.splice(primaryIndex, 2, replacement);
  check(canonical(desired.ingress.slice(1)) === canonical(entries.slice(2)), 'Unrelated route changed');
  check(canonical({ ...desired, ingress: null }) === canonical({ ...config, ingress: null }), 'Origin options changed');
  return desired;
}

export function validateInput(input, inspect = false) {
  check(object(input) && /^[a-f0-9]{32}$/.test(input.accountId) && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.tunnelId), 'Invalid exact Cloudflare target');
  check(typeof input.apiToken === 'string' && input.apiToken.length >= 20 && input.apiToken.length <= 4096 && !/\s/.test(input.apiToken), 'Invalid private API credential');
  if (!inspect) {
    check(Number.isSafeInteger(input.expectedVersion) && input.expectedVersion >= 0 && /^[a-f0-9]{64}$/.test(input.expectedConfigSha256) && /^[a-f0-9]{64}$/.test(input.expectedCaddySha256), 'Reviewed version/config/Caddy pins required');
  }
}
function snapshot(result, input) {
  // The actual configurations GET omits account_id. Account binding comes from
  // the exact authenticated API URL and independently verified connector token.
  // If a response includes it, still reject a conflicting account.
  check(object(result) && (result.account_id === undefined || result.account_id === input.accountId) && result.tunnel_id === input.tunnelId && result.source === 'cloudflare' && Number.isSafeInteger(result.version) && result.version >= 0 && object(result.config), 'Unexpected Cloudflare configuration response');
  return result;
}
function expected(result, input) {
  snapshot(result, input);
  check(result.version === input.expectedVersion && configHash(result.config) === input.expectedConfigSha256, 'Remote configuration drift; review before continuing');
}

export async function checkedUpdate({ input, original, desired, api, verifyGateway, markAttempt }) {
  validateInput(input); expected(original, input);
  check(configHash(transform(original.config)) === configHash(desired), 'Staged transformation changed');
  await verifyGateway();
  // This narrows concurrent-writer races; Cloudflare does not document a CAS here.
  expected(await api('GET'), input);
  await markAttempt(); // Persisted BEFORE PUT: ambiguous delivery is never replayed.
  await api('PUT', { config: desired });
  const after = snapshot(await api('GET'), input);
  check(after.version > original.version && configHash(after.config) === configHash(desired), 'Post-write verification failed; reconcile, never auto-rollback');
  return { updated: true, previousVersion: original.version, version: after.version, configSha256: configHash(after.config), humanSsoChanged: false, effectivePropagationVerified: false };
}

function trusted(path, privateFile = false) {
  check(typeof path === 'string' && path.startsWith('/') && !path.split('/').includes('..'), 'Absolute trusted path required');
  let part = '';
  for (const item of path.split('/').filter(Boolean)) {
    part += '/' + item; const s = lstatSync(part);
    check(!s.isSymbolicLink() && s.uid === 0 && !(s.mode & 0o022), 'Unsafe operator path');
  }
  const s = lstatSync(path);
  if (privateFile) check(s.isFile() && (s.mode & 0o777) === 0o600 && s.nlink === 1, 'Unsafe private artifact');
}
function writeExclusive(path, value) {
  const fd = openSync(path, 'wx', 0o600);
  try { fchmodSync(fd, 0o600); writeFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}
function syncDirectory() { const fd = openSync(BACKUP, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function readPrivate(name) { const path = BACKUP + '/' + name; trusted(path, true); return JSON.parse(readFileSync(path, 'utf8')); }
function noAttempt() {
  try { lstatSync(BACKUP + '/attempt.json'); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  throw Error('Prior PUT attempt recorded; inspect and reconcile without replay');
}
function managementApi(input) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/cfd_tunnel/${input.tunnelId}/configurations`;
  return async (method, body) => {
    let response;
    try { response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${input.apiToken}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw Error('Cloudflare transport failed; a recorded PUT attempt requires reconciliation'); }
    if (!response.ok) { await response.body?.cancel(); throw Error(`Cloudflare HTTP ${response.status}; response suppressed`); }
    let payload;
    try { payload = await response.json(); } catch { throw Error('Invalid Cloudflare response; details suppressed'); }
    check(payload?.success === true && object(payload.result), 'Cloudflare operation failed; details suppressed');
    return payload.result;
  };
}
function localProbe(path, host, extra = {}) {
  return new Promise((resolve, reject) => {
    const q = httpRequest({ hostname: '127.0.0.1', port: 80, path, method: 'GET', headers: { host, ...extra }, timeout: 10000 }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    q.on('timeout', () => q.destroy()); q.on('error', () => reject(Error('Local gateway probe failed'))); q.end();
  });
}
async function verifyGateway(input) {
  trusted(CADDY);
  check(sha(readFileSync(CADDY)) === input.expectedCaddySha256, 'Reviewed Caddy source drift');
  for (const [path, host, headers, status] of [
    ['/auth/v1/.well-known/jwks.json', API_HOST, {}, 200],
    ['/.well-known/oauth-authorization-server/auth/v1', API_HOST, {}, 200],
    ['/auth/v1/user', API_HOST, {}, 403],
    ['/rest/v1/', API_HOST, { authorization: 'Bearer invalid' }, 403],
    ['/login', 'www.developed.sk', {}, 404],
  ]) check(await localProbe(path, host, headers) === status, 'Local gateway/human-admission precondition failed');
  check(sha(readFileSync(CADDY)) === input.expectedCaddySha256, 'Caddy drifted during preflight');
}

export async function execute(mode, inputPath) {
  check(process.getuid() === 0 && ['--inspect', '--stage', '--apply'].includes(mode), 'Only reviewed root inspect/stage/apply supported');
  trusted(fileURLToPath(import.meta.url)); trusted(inputPath, true);
  const input = JSON.parse(readFileSync(inputPath, 'utf8')); validateInput(input, mode === '--inspect');
  const api = managementApi(input);
  if (mode === '--inspect') {
    const current = snapshot(await api('GET'), input);
    return { version: current.version, configSha256: configHash(current.config), ingressEntries: current.config.ingress?.length, source: current.source, mutated: false };
  }
  const pins = { accountId: input.accountId, tunnelId: input.tunnelId, expectedVersion: input.expectedVersion, expectedConfigSha256: input.expectedConfigSha256, expectedCaddySha256: input.expectedCaddySha256 };
  if (mode === '--stage') {
    await verifyGateway(input);
    const original = await api('GET'); expected(original, input);
    const desired = transform(original.config);
    trusted('/var/backups'); mkdirSync(BACKUP, { mode: 0o700 }); trusted(BACKUP);
    writeExclusive(BACKUP + '/original.json', original);
    writeExclusive(BACKUP + '/desired.json', desired);
    writeExclusive(BACKUP + '/proof.json', { ...pins, desiredSha256: configHash(desired) }); syncDirectory();
    return { staged: true, updated: false, previousVersion: original.version, desiredSha256: configHash(desired) };
  }
  noAttempt();
  const original = readPrivate('original.json'), desired = readPrivate('desired.json'), proof = readPrivate('proof.json');
  check(canonical(proof) === canonical({ ...pins, desiredSha256: configHash(desired) }), 'Staged pins changed');
  const result = await checkedUpdate({ input, original, desired, api, verifyGateway: () => verifyGateway(input), markAttempt: () => { writeExclusive(BACKUP + '/attempt.json', { ...proof, attemptedAt: new Date().toISOString() }); syncDirectory(); } });
  writeExclusive(BACKUP + '/verified.json', { ...result, verifiedAt: new Date().toISOString() }); syncDirectory();
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { check(process.argv.length === 4, 'Usage: --inspect|--stage|--apply /protected/input.json'); console.log(JSON.stringify(await execute(process.argv[2], process.argv[3]))); }
  catch (error) { console.error(error instanceof SyntaxError ? 'Invalid protected JSON; details suppressed' : error.message); process.exitCode = 1; }
}
