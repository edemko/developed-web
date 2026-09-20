// Offline selected-key copier only; no signing material, network, JWT minting,
// app environment updates, or provider/database operations.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, openSync, closeSync, writeFileSync, fchmodSync, fsyncSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateInput } from './gateway-public-acceptance.mjs';

export const DESTINATION = '/etc/developed-accounts/gateway-acceptance-input.json';
export const HOSTS = ['mega-music', 'screentime', 'kestrek', 'otazkomat', 'airsoft', 'vocabulum'];
const HOST_PRIMARY = '/etc/developed-accounts/host-env-staging';
const HOST_BACKUP = '/var/backups/developed-accounts/host-env-staging';
const ODONTO_PRIMARY = '/etc/developed-accounts/odonto-ci-staging/odonto-identity-env.json';
const ODONTO_BACKUP = '/var/backups/developed-accounts/odonto-ci-staging/odonto-identity-env.json';
const ORIGINAL_KE = '/etc/developed-apps/kestrek.env';
const ROUTE_PROOF = '/var/backups/developed-product-routes-20260920/verified.json';
const CADDY = '/etc/caddy/Caddyfile';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, label) => assert.ok(ok, label);
function trusted(path, privateFile = true) {
  let current = '';
  for (const part of path.split('/').filter(Boolean)) { current += '/' + part; const s = lstatSync(current); check(s.uid === 0 && !s.isSymbolicLink() && !(s.mode & 0o022), 'Unsafe input source or ancestor'); }
  const s = lstatSync(path); check(s.isFile() && s.nlink === 1 && (!privateFile || (s.mode & 0o777) === 0o600) && s.size < 1024 * 1024, 'Unsafe input source file');
}
function read(path, privateFile = true) { trusted(path, privateFile); return readFileSync(path); }
function matched(primary, backup) {
  const value = read(primary), recovery = read(backup);
  check(value.equals(recovery), 'Reviewed staging and backup differ'); return value;
}
export function assemble({ hosts, legacyKe, originalKe, odonto }, expectedCaddySha256) {
  check(HOSTS.every(name => hosts[name]?.ECOSYSTEM_AUTH_ENABLED === 'true'), 'All six central host environments required');
  const anonKey = hosts['mega-music'].SUPABASE_ANON_KEY;
  for (const name of HOSTS) {
    const keyName = ['screentime', 'airsoft'].includes(name) ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY' : 'SUPABASE_ANON_KEY';
    check(hosts[name][keyName] === anonKey, 'Host public anon keys differ');
  }
  check(odonto.version === 1 && odonto.backend?.ECOSYSTEM_AUTH_ENABLED === 'true' && odonto.frontend?.ECOSYSTEM_AUTH_ENABLED === 'true', 'Reviewed Odonto central bundle required');
  check(odonto.backend.SUPABASE_ANON_KEY === anonKey && odonto.frontend.NEXT_PUBLIC_SUPABASE_ANON_KEY === anonKey, 'Odonto public anon key differs');
  check(legacyKe.SUPABASE_ANON_KEY === anonKey && originalKe.SUPABASE_ANON_KEY === anonKey && legacyKe.SUPABASE_SERVICE_KEY === originalKe.SUPABASE_SERVICE_KEY, 'Actual preserved legacy credential differs');
  const value = { version: 1, expectedCaddySha256, anonKey, legacyServiceRoleKey: legacyKe.SUPABASE_SERVICE_KEY,
    scopedTokens: {
      kestrek_backend: hosts.kestrek.SUPABASE_DATA_API_KEY,
      screentime_backend: hosts.screentime.SUPABASE_DATA_API_KEY,
      vocabulum_backend: hosts.vocabulum.SUPABASE_DATA_API_KEY,
      odonto_backend: odonto.backend.SUPABASE_DATA_API_KEY,
      otazkomat_backend: hosts.otazkomat.SUPABASE_DATA_API_KEY,
    } };
  validateInput(value); return value;
}
function absent() { try { lstatSync(DESTINATION); throw Error('Acceptance input already exists; never overwrite credentials'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
export function execute(mode) {
  check(process.getuid() === 0 && ['--check', '--stage'].includes(mode), 'Reviewed root offline assembler required');
  trusted(fileURLToPath(import.meta.url), false); trusted(fileURLToPath(new URL('./gateway-public-acceptance.mjs', import.meta.url)), false);
  absent();
  const hosts = Object.fromEntries(HOSTS.map(name => [name, parseEnv(matched(`${HOST_PRIMARY}/${name}.central.env`, `${HOST_BACKUP}/${name}.central.env`).toString())]));
  const legacyKe = parseEnv(matched(HOST_PRIMARY + '/kestrek.legacy.env', HOST_BACKUP + '/kestrek.legacy.env').toString());
  const originalKe = parseEnv(read(ORIGINAL_KE).toString());
  const odonto = JSON.parse(matched(ODONTO_PRIMARY, ODONTO_BACKUP));
  const proof = JSON.parse(read(ROUTE_PROOF)), current = read(CADDY, false);
  check(proof.humanSsoEnabled === false && sha(current) === proof.candidateSha256, 'Exact applied product-route source required');
  const value = assemble({ hosts, legacyKe, originalKe, odonto }, proof.candidateSha256);
  const summary = { checked: true, staged: mode === '--stage', destination: DESTINATION, sourceHostEnvironments: 6, scopedRoles: 5, credentialsCopied: 7, expectedCaddySha256: value.expectedCaddySha256, signingMaterialRead: false, tokensMinted: false, networkRequests: false };
  if (mode === '--stage') {
    check(sha(read(CADDY, false)) === value.expectedCaddySha256, 'Caddy changed before private input write');
    const fd = openSync(DESTINATION, 'wx', 0o600);
    try { fchmodSync(fd, 0o600); writeFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
    trusted(DESTINATION); check(readFileSync(DESTINATION).equals(Buffer.from(JSON.stringify(value) + '\n')), 'Protected input verification failed');
    const directory = openSync('/etc/developed-accounts', 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
  }
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { check(process.argv.length === 3, 'Usage: --check|--stage'); console.log(JSON.stringify(execute(process.argv[2]))); }
  catch { console.error('Offline gateway input preparation stopped; no credential or source contents printed. Inspect protected state before retrying.'); process.exitCode = 1; }
}
