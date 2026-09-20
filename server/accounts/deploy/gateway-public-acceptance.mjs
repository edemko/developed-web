// Post-tunnel read-only acceptance. NEVER run while public ingress is legacy.
// Credentials are existing values in root0600 JSON, never signed/minted here.
// Input: {version:1, expectedCaddySha256, anonKey, legacyServiceRoleKey,
// scopedTokens:{kestrek_backend,screentime_backend,vocabulum_backend,
// odonto_backend,otazkomat_backend}}. No report contains headers, tokens or rows.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const API = 'https://sam-api.developed162.bid';
export const STUDIO = 'https://sam-studio.developed162.bid';
// Relations/id columns are declared in the committed application baselines:
// Ke 20260806000000; Screen 20260911120000; Voc 20260807000000;
// Odonto 20260806120000; Ota 20260911000000. The central scoped-role migration
// 20260920124145 grants base-table access only inside the matching app schema.
export const SCOPES = Object.freeze([
  ['kestrek_backend', 'kestrek', 'transactions'], ['screentime_backend', 'screentime', 'devices'],
  ['vocabulum_backend', 'voc_builder', 'folders'], ['odonto_backend', 'odonto', 'questions'],
  ['otazkomat_backend', 'otazkomat', 'questions'],
]);
const TUNNEL = '/var/backups/developed-api-tunnel-20260920';
const DENIAL = 'Central identity endpoint required';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const canonical = v => JSON.stringify(v, (_, item) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
function check(ok, label) { assert.ok(ok, label); }
function exactKeys(value, keys) { check(object(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'), 'Unexpected protected input fields'); }
export function validateInput(input, now = Date.now()) {
  exactKeys(input, ['version', 'expectedCaddySha256', 'anonKey', 'legacyServiceRoleKey', 'scopedTokens']);
  check(input.version === 1 && /^[a-f0-9]{64}$/.test(input.expectedCaddySha256), 'Reviewed Caddy hash required');
  exactKeys(input.scopedTokens, SCOPES.map(([role]) => role));
  for (const [role, token] of [['anon', input.anonKey], ['service_role', input.legacyServiceRoleKey], ...Object.entries(input.scopedTokens)]) {
    check(typeof token === 'string' && token.length <= 16384 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token), 'Existing JWT credential required');
    let claims; try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); } catch { throw Error('Invalid credential shape'); }
    // Shape/role/expiry only. Public upstream positives establish actual validity;
    // no private signing key or signature-construction code belongs here.
    check(claims.role === role && Number.isFinite(claims.exp) && claims.exp > now / 1000, 'Wrong/expired credential class');
  }
}
export function validateHandoff(input, proof, desired, liveCaddy) {
  check(sha(liveCaddy) === input.expectedCaddySha256, 'Reviewed live Caddy changed');
  check(proof.updated === true && Number.isSafeInteger(proof.version) && proof.version > proof.previousVersion && proof.configSha256 === sha(canonical(desired)), 'Verified tunnel update required');
  const api = desired.ingress?.filter(row => row.hostname === new URL(API).hostname);
  const studio = desired.ingress?.filter(row => row.hostname === new URL(STUDIO).hostname);
  check(api?.length === 1 && api[0].service === 'http://127.0.0.1:80' && !api[0].path && !api[0].originRequest?.httpHostHeader && !desired.originRequest?.httpHostHeader, 'Tunnel must select canonical Caddy');
  check(studio?.length === 1 && studio[0].service === 'http://127.0.0.1:8000' && !studio[0].path, 'Studio tunnel route changed');
  check(desired.ingress.at(-1).service === 'http_status:404' && !desired.ingress.at(-1).hostname && !desired.ingress.at(-1).path, 'Final tunnel404 changed');
}
function trusted(path, privateFile = false) {
  check(typeof path === 'string' && path.startsWith('/') && !path.split('/').includes('..'), 'Absolute protected path required');
  let current = '';
  for (const part of path.split('/').filter(Boolean)) { current += '/' + part; const s = lstatSync(current); check(s.uid === 0 && !s.isSymbolicLink() && !(s.mode & 0o022), 'Unsafe acceptance file or ancestor'); }
  const s = lstatSync(path); check(s.isFile() && s.nlink === 1 && (!privateFile || (s.mode & 0o777) === 0o600), 'Unsafe acceptance file');
}
export async function acceptance(input, { request = fetch, emit = () => {}, preflight } = {}) {
  validateInput(input); check(typeof preflight === 'function', 'Handoff preflight required');
  await preflight();
  const results = [];
  async function probe(id, path, { method = 'GET', headers = {}, body, status = 403, kind = 'gateway-denial', origin = API } = {}) {
    check([API, STUDIO].includes(origin) && path.startsWith('/') && !path.startsWith('//') && !path.includes('://'), 'Fixed acceptance target required');
    let response;
    try { response = await request(origin + path, { method, headers, ...(body === undefined ? {} : { body }), redirect: 'manual', signal: AbortSignal.timeout(10000) }); }
    catch { throw Error(`Acceptance transport failed: ${id}`); }
    check(response.status === status || (Array.isArray(status) && status.includes(response.status)), `Acceptance status failed: ${id}`);
    if (kind === 'gateway-denial') check(await response.text() === DENIAL, `Gateway deny handler absent: ${id}`);
    else if (kind === 'filter-denial') check(response.headers.get('cache-control') === 'no-store' && await response.text() === '', `Data filter deny handler absent: ${id}`);
    else if (kind === 'metadata' || kind === 'jwks') {
      const data = await response.json();
      if (kind === 'jwks') check(Array.isArray(data.keys) && data.keys.length > 0 && data.keys.every(key => object(key) && typeof key.kty === 'string' && !['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'].some(name => Object.hasOwn(key, name))), 'Expected public-only JWKS');
      else check(data.issuer === API + '/auth/v1' && data.authorization_endpoint === API + '/auth/v1/oauth/authorize' && data.token_endpoint === API + '/auth/v1/oauth/token', `Protocol metadata identity changed: ${id}`);
    } else if (kind === 'studio') {
      let location; try { location = new URL(response.headers.get('location')); } catch { throw Error('Studio Access redirect absent'); }
      check(location.protocol === 'https:' && location.hostname.endsWith('.cloudflareaccess.com') && location.pathname.startsWith('/cdn-cgi/access/login/'), 'Studio is not behind its expected Access redirect');
      await response.body?.cancel(); // Never follow or print the signed redirect.
    } else await response.body?.cancel(); // HEAD data responses cannot expose rows.
    const result = { id, method, status: response.status, passed: true }; results.push(result); emit(result);
  }
  // Exact read-only sentinel must establish effective public gateway propagation
  // BEFORE empty-body negative mutation-method probes or privileged credentials.
  await probe('public-gateway-sentinel', '/auth/v1/health');
  await probe('openid', '/auth/v1/.well-known/openid-configuration', { status: 200, kind: 'metadata' });
  await probe('jwks', '/auth/v1/.well-known/jwks.json', { status: 200, kind: 'jwks' });
  await probe('oauth-metadata', '/auth/v1/.well-known/oauth-authorization-server', { status: 200, kind: 'metadata' });
  await probe('rfc8414-alias', '/.well-known/oauth-authorization-server/auth/v1', { status: 200, kind: 'metadata' });
  for (const [id, path] of [
    ['auth-settings', '/auth/v1/settings'], ['auth-user', '/auth/v1/user'], ['auth-admin', '/auth/v1/admin/users'],
    ['auth-factors', '/auth/v1/factors'], ['auth-consent', '/auth/v1/oauth/consent'],
    ['functions', '/functions/v1/'], ['graphql', '/graphql/v1'], ['gateway-root', '/'],
  ]) await probe(id, path);
  for (const [id, path, method] of [
    ['password-grant', '/auth/v1/token?grant_type=password', 'POST'], ['signup', '/auth/v1/signup', 'POST'],
    ['recovery', '/auth/v1/recover', 'POST'], ['user-write', '/auth/v1/user', 'PUT'],
    ['factor-create', '/auth/v1/factors', 'POST'], ['consent-write', '/auth/v1/oauth/consent', 'POST'],
  ]) await probe(id, path, { method, body: '{}', headers: { apikey: input.anonKey, 'Content-Type': 'application/json' } });
  for (const [id, headers] of [
    ['legacy-apikey', { apikey: input.legacyServiceRoleKey }],
    ['legacy-bearer', { apikey: input.anonKey, Authorization: `Bearer ${input.legacyServiceRoleKey}` }],
    ['legacy-apikey-with-anon-bearer', { apikey: input.legacyServiceRoleKey, Authorization: `Bearer ${input.anonKey}` }],
  ]) await probe(id, '/rest/v1/transactions?select=id&limit=0', { headers: { ...headers, 'Accept-Profile': 'kestrek' }, kind: 'filter-denial' });
  for (const [role, ownSchema] of SCOPES) for (const [, schema, relation] of SCOPES) {
    // HEAD+limit0 establishes application-specific base-table privileges without returning identities,
    // emails, finance contents, totals or even a row count.
    await probe(`${role}-to-${schema}`, `/rest/v1/${relation}?select=id&limit=0`, {
      method: 'HEAD', headers: { apikey: input.anonKey, Authorization: `Bearer ${input.scopedTokens[role]}`, 'Accept-Profile': schema },
      status: schema === ownSchema ? 200 : 403, kind: 'data-head',
    });
  }
  for (const path of ['/storage/v1/s3', '/storage/v1/vector']) await probe('closed-' + path.split('/').at(-1), path, { headers: { apikey: input.anonKey }, kind: 'filter-denial' });
  await probe('studio-access', '/', { origin: STUDIO, status: [302, 303], kind: 'studio' });
  await preflight(); // Detect source/proof drift without changing anything.
  return { passed: results.length, failed: 0, publicGatewayObserved: true, dataRowsRead: 0, productDataWritten: false, userLoginAttempted: false, tokensMinted: false };
}
export async function execute(mode, inputPath) {
  check(process.getuid() === 0 && mode === '--verify-after-tunnel', 'Reviewed root post-tunnel mode required');
  trusted(fileURLToPath(import.meta.url)); trusted(inputPath, true);
  const input = JSON.parse(readFileSync(inputPath));
  const preflight = () => {
    for (const path of [TUNNEL + '/verified.json', TUNNEL + '/desired.json']) trusted(path, true);
    trusted('/etc/caddy/Caddyfile');
    validateHandoff(input, JSON.parse(readFileSync(TUNNEL + '/verified.json')), JSON.parse(readFileSync(TUNNEL + '/desired.json')), readFileSync('/etc/caddy/Caddyfile'));
  };
  return acceptance(input, { preflight, emit: result => console.log(JSON.stringify(result)) });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { check(process.argv.length === 4, 'Usage: --verify-after-tunnel /protected/input.json'); console.log(JSON.stringify(await execute(process.argv[2], process.argv[3]))); }
  catch { console.error('Gateway acceptance stopped; no credentials, response bodies or signed redirects printed. Review the last completed probe; do not reopen legacy ingress.'); process.exitCode = 1; }
}
