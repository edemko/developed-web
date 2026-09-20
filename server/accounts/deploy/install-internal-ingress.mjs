// One exact, transitional ingress change. No app policy or human login activation.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, mkdirSync, openSync, closeSync, writeFileSync, fsyncSync, renameSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const sourceHash = '70f2334404e5bf29b1b5f3810f8cc32da3ee73178051cd055c4b1ecf3df43851';
const snippetHash = '944ddb10d578da55f0a14f86103ae1d3b9f201e754da7565d1adea268df9a457';
const sourcePath = '/etc/caddy/Caddyfile';
const directory = '/var/backups/developed-internal-ingress-20260920';
const sha = value => createHash('sha256').update(value).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };

export function merge(current, snippet) {
  check(sha(current) === sourceHash, 'Live source drift; review before continuing');
  check(sha(snippet) === snippetHash, 'Reviewed internal snippet changed');
  const host = 'http://www.developed.sk, http://test.developed.sk {';
  check(current.split(host).length === 2 && !current.includes('DEVELOPED INTERNAL CHECKS'), 'Unexpected canonical site');
  const insertion = `\n# BEGIN DEVELOPED INTERNAL CHECKS\n${snippet}\n# END DEVELOPED INTERNAL CHECKS\n`;
  const candidate = current.replace(host, host + insertion);
  check(candidate.replace(insertion, '') === current, 'Unrelated source changed');
  return candidate;
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
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
function syncDirectory(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
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
  const snippetPath = new URL('./portal-internal-routes.Caddyfile', import.meta.url);
  trusted(snippetPath.pathname);
  const old = readFileSync(sourcePath, 'utf8');
  const candidate = merge(old, readFileSync(snippetPath, 'utf8'));
  if (mode === '--stage') {
    trusted('/var/backups'); mkdirSync(directory, { mode: 0o700 }); trusted(directory);
    writeExclusive(directory + '/original.Caddyfile', old);
    writeExclusive(directory + '/candidate.Caddyfile', candidate);
    validate(directory + '/candidate.Caddyfile');
    writeExclusive(directory + '/verified.json', JSON.stringify({ originalSha256: sha(old), candidateSha256: sha(candidate), snippetSha256: snippetHash, humanSsoEnabled: false }) + '\n');
    syncDirectory(directory);
    return { staged: true, applied: false, candidateSha256: sha(candidate) };
  }
  for (const file of ['original.Caddyfile', 'candidate.Caddyfile', 'verified.json']) trusted(directory + '/' + file, true);
  const proof = JSON.parse(readFileSync(directory + '/verified.json'));
  check(proof.originalSha256 === sha(old) && proof.candidateSha256 === sha(candidate) && proof.snippetSha256 === snippetHash && proof.humanSsoEnabled === false, 'Staged proof mismatch');
  check(readFileSync(directory + '/original.Caddyfile', 'utf8') === old && readFileSync(directory + '/candidate.Caddyfile', 'utf8') === candidate, 'Staged bytes changed');
  validate(directory + '/candidate.Caddyfile');
  const installPath = '/etc/caddy/Caddyfile.developed-internal-next';
  writeExclusive(installPath, candidate, 0o644);
  check(readFileSync(sourcePath, 'utf8') === old, 'Live config changed during staging');
  renameSync(installPath, sourcePath); syncDirectory('/etc/caddy');
  if (!reload()) {
    check(readFileSync(sourcePath, 'utf8') === candidate, 'Reload failed with source drift; operator reconciliation required');
    writeExclusive(installPath, old, 0o644); renameSync(installPath, sourcePath); syncDirectory('/etc/caddy');
    check(reload(), 'Restored source but reload failed; operator reconciliation required');
    throw Error('Candidate reload failed; original restored and reloaded');
  }
  writeExclusive(directory + '/applied.json', JSON.stringify({ appliedAt: new Date().toISOString(), candidateSha256: sha(candidate), humanSsoEnabled: false }) + '\n');
  syncDirectory(directory);
  return { applied: true, candidateSha256: sha(candidate), humanSsoEnabled: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { check(process.argv.length === 3, 'Usage: --stage or --apply'); console.log(JSON.stringify(execute(process.argv[2]))); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
