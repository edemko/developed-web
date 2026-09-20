// Exact gateway-only addition. Human portal admission and tunnel changes are separate.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, mkdirSync, openSync, closeSync, writeFileSync, fsyncSync, fchmodSync, renameSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const sourceHash = '29a1541baed510647a17a49b3c6a3f685211d5b1179bbf3b35be6a4ba61c53d8';
const gatewayHash = '65577c3b77cd40e10f2e5af3633ca084c9d1707a935b91e6edc2c0a6f922d2dd';
const dataHash = 'c19cad192300c8b2010b999b81b69a1c4aa81951ac3ab474cfe14d91b3c13433';
const sourcePath = '/etc/caddy/Caddyfile';
const directory = '/var/backups/developed-gateway-ingress-20260920';
const marker = '\n# BEGIN DEVELOPED PUBLIC GATEWAY\n';
const sha = value => createHash('sha256').update(value).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };

export function merge(current, gateway, data) {
  check(sha(current) === sourceHash, 'Live source drift; review before continuing');
  check(sha(gateway) === gatewayHash && sha(data) === dataHash, 'Reviewed gateway source changed');
  check(!current.includes('sam-api.developed162.bid') && !/^\s*import\s/m.test(current), 'Gateway/import already present; review source');
  check(current.includes('# BEGIN DEVELOPED INTERNAL CHECKS'), 'Expected internal-only ingress is absent');
  const target = '    import public-data-routes.Caddyfile';
  check(gateway.split(target).length === 2, 'Unexpected data import');
  const addition = gateway.replace(target, data.trimEnd().split('\n').map(line => `    ${line}`).join('\n'));
  check(!/^\s*import\s/m.test(addition), 'Unresolved gateway import');
  check(!addition.includes('127.0.0.1:3140') && !addition.includes('portal-routes') && !addition.includes('www.developed.sk'), 'Human portal is outside this operation');
  return current + marker + addition + '\n# END DEVELOPED PUBLIC GATEWAY\n';
}

function trusted(path, privateFile = false) {
  let part = '';
  for (const item of path.split('/').filter(Boolean)) {
    part += '/' + item; const s = lstatSync(part);
    check(!s.isSymbolicLink() && s.uid === 0 && !(s.mode & 0o022), 'Unsafe operator path');
  }
  const stat = lstatSync(path);
  if (privateFile) check(stat.isFile() && (stat.mode & 0o777) === 0o600 && stat.nlink === 1, 'Unsafe private artifact');
}
function writeExclusive(path, bytes, mode = 0o600) {
  const fd = openSync(path, 'wx', mode);
  try { fchmodSync(fd, mode); writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
function syncDirectory(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function requireAbsent(path) {
  try { lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw Error('One-time operation already applied; operator reconciliation required');
}
function validate(path) {
  const r = spawnSync('/usr/bin/caddy', ['validate', '--adapter', 'caddyfile', '--config', path], { encoding: 'utf8', timeout: 15000 });
  check(r.status === 0, 'Caddy validation failed; output suppressed');
}
function reload() {
  return spawnSync('/usr/bin/systemctl', ['reload', 'caddy.service'], { encoding: 'utf8', timeout: 20000 }).status === 0;
}

export function execute(mode) {
  check(process.getuid() === 0 && ['--stage', '--apply'].includes(mode), 'Only reviewed root stage/apply supported');
  trusted(sourcePath);
  trusted(fileURLToPath(import.meta.url));
  const gatewayPath = fileURLToPath(new URL('./public-supabase-site.Caddyfile', import.meta.url));
  const dataPath = fileURLToPath(new URL('./public-data-routes.Caddyfile', import.meta.url));
  trusted(gatewayPath); trusted(dataPath);
  const old = readFileSync(sourcePath, 'utf8');
  const candidate = merge(old, readFileSync(gatewayPath, 'utf8'), readFileSync(dataPath, 'utf8'));
  const proof = { originalSha256: sha(old), candidateSha256: sha(candidate), gatewaySha256: gatewayHash, dataSha256: dataHash, humanSsoEnabled: false, tunnelChanged: false };
  if (mode === '--stage') {
    trusted('/var/backups'); mkdirSync(directory, { mode: 0o700 }); trusted(directory);
    writeExclusive(directory + '/original.Caddyfile', old);
    writeExclusive(directory + '/candidate.Caddyfile', candidate);
    validate(directory + '/candidate.Caddyfile');
    writeExclusive(directory + '/verified.json', JSON.stringify(proof) + '\n');
    syncDirectory(directory);
    return { staged: true, applied: false, ...proof };
  }
  for (const file of ['original.Caddyfile', 'candidate.Caddyfile', 'verified.json']) trusted(directory + '/' + file, true);
  check(readFileSync(directory + '/verified.json', 'utf8') === JSON.stringify(proof) + '\n', 'Staged proof mismatch');
  check(readFileSync(directory + '/original.Caddyfile', 'utf8') === old && readFileSync(directory + '/candidate.Caddyfile', 'utf8') === candidate, 'Staged bytes changed');
  requireAbsent(directory + '/applied.json');
  validate(directory + '/candidate.Caddyfile');
  const installPath = '/etc/caddy/Caddyfile.developed-gateway-next';
  writeExclusive(installPath, candidate, 0o644);
  check(readFileSync(sourcePath, 'utf8') === old, 'Live config changed during staging');
  renameSync(installPath, sourcePath); syncDirectory('/etc/caddy');
  if (!reload()) {
    check(readFileSync(sourcePath, 'utf8') === candidate, 'Reload failed with source drift; operator reconciliation required');
    writeExclusive(installPath, old, 0o644); renameSync(installPath, sourcePath); syncDirectory('/etc/caddy');
    check(reload(), 'Restored source but reload failed; operator reconciliation required');
    throw Error('Candidate reload failed; original restored and reloaded');
  }
  writeExclusive(directory + '/applied.json', JSON.stringify({ appliedAt: new Date().toISOString(), ...proof }) + '\n');
  syncDirectory(directory);
  return { applied: true, ...proof };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { check(process.argv.length === 3, 'Usage: --stage or --apply'); console.log(JSON.stringify(execute(process.argv[2]))); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
