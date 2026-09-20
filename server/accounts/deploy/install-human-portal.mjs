// Final human ingress only. No policy, mail, registration, deployment or DB writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, mkdirSync, openSync, closeSync, writeFileSync, fsyncSync, fchmodSync, renameSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const sourceHash = '501bbc47de35e94a45c24b9281b1e88ac918ae75d02750fd70c8f13bb1c63946';
export const snippetHashes = Object.freeze({
  internal: '944ddb10d578da55f0a14f86103ae1d3b9f201e754da7565d1adea268df9a457',
  canonical: 'e493398c76fd53bfeb0deaed00780ee5c0acc03a7bb0abff5c2f9d3fe7dafe30',
  public: '6ea7d82b3bf6d2b6a1873224eafd66e6b864d0b821a7ef192d0290d37aea3c3a',
});
export const sha = value => createHash('sha256').update(value).digest('hex');
const host = 'http://www.developed.sk, http://test.developed.sk {';
const productDirectory = '/var/backups/developed-product-routes-20260920';
const directory = '/var/backups/developed-human-portal-20260920';
const livePath = '/etc/caddy/Caddyfile';
export function blocks(snippets) {
  for (const [name, hash] of Object.entries(snippetHashes)) assert.equal(sha(snippets[name]), hash, 'Reviewed snippet changed');
  assert.equal(snippets.canonical.split('import portal-routes.Caddyfile').length, 2);
  return {
    old: `\n# BEGIN DEVELOPED INTERNAL CHECKS\n${snippets.internal}\n# END DEVELOPED INTERNAL CHECKS\n`,
    next: `\n# BEGIN DEVELOPED HUMAN PORTAL\n${snippets.canonical.replace('import portal-routes.Caddyfile', snippets.public)}\n# END DEVELOPED HUMAN PORTAL\n`,
  };
}
export function merge(current, snippets) {
  assert.equal(sha(current), sourceHash, 'Intended final product-route source drift');
  const { old, next } = blocks(snippets);
  assert.equal(current.split(host + old).length, 2, 'Expected internal block location changed');
  assert.equal(current.split(old).length, 2, 'Duplicate internal block');
  assert.ok(!current.includes('DEVELOPED HUMAN PORTAL'), 'Human block already exists');
  const candidate = current.replace(old, next);
  assert.equal(candidate.replace(next, old), current, 'Unrelated source changed');
  return candidate;
}
export function adaptText(input) {
  const r = spawnSync('/usr/bin/caddy', ['adapt', '--adapter', 'caddyfile', '--config', '-'], { input, encoding: 'utf8', timeout: 15000 });
  assert.equal(r.status, 0, 'Caddy adaptation failed; output suppressed');
  return JSON.parse(r.stdout);
}
function site(config) {
  const sites = Object.values(config.apps.http.servers).flatMap(s => s.routes)
    .filter(r => r.match?.[0]?.host?.includes('www.developed.sk'));
  assert.equal(sites.length, 1, 'Canonical site count');
  assert.deepEqual([...sites[0].match[0].host].sort(), ['test.developed.sk', 'www.developed.sk']);
  return sites[0].handle[0].routes;
}
export function verifyAdapted(before, after, snippets) {
  blocks(snippets);
  const original = structuredClone(before), updated = structuredClone(after);
  const fixture = body => adaptText(`${host}\nroot * /fixture\nencode gzip\n${body}\nrespond "fixture" 404\n}\n`);
  const expectedOld = site(fixture(snippets.internal))[0].handle.find(h => h.handler === 'subroute');
  const expectedNew = site(fixture(snippets.canonical.replace('import portal-routes.Caddyfile', snippets.public)))
    .find(r => r.match?.[0]?.host?.includes('www.developed.sk'));
  assert.ok(expectedOld && expectedNew, 'Unexpected fixture topology');
  const prior = site(original), next = site(updated);
  const oldHandlers = prior[0].handle;
  const index = oldHandlers.findIndex(h => h.handler === 'subroute');
  assert.ok(index >= 0, 'Internal handler absent');
  assert.deepEqual(oldHandlers[index], expectedOld, 'Internal contract mismatch');
  oldHandlers.splice(index, 1);
  const addition = next.findIndex(r => r.match?.[0]?.host?.includes('www.developed.sk'));
  assert.ok(addition >= 0, 'Canonical human route absent');
  assert.deepEqual(next[addition], expectedNew, 'Human route contract mismatch');
  next.splice(addition, 1);
  // Generated group numbering can shift; preserve equality relationships, not IDs.
  const normalize = value => {
    const groups = new Map();
    return JSON.stringify(value, (key, item) => {
      if (key === 'group' && /^group\d+$/.test(item)) {
        if (!groups.has(item)) groups.set(item, `group${groups.size}`);
        return groups.get(item);
      }
      return item;
    });
  };
  assert.ok(normalize(original) === normalize(updated), 'Unaffected adapted configuration changed');
}
function trusted(path, privateFile = false) {
  let prefix = '';
  for (const part of path.split('/').filter(Boolean)) {
    prefix += '/' + part; const stat = lstatSync(prefix);
    assert.ok(!stat.isSymbolicLink() && stat.uid === 0 && !(stat.mode & 0o022), 'Unsafe operator path');
  }
  const stat = lstatSync(path);
  if (privateFile) assert.ok(stat.isFile() && (stat.mode & 0o777) === 0o600 && stat.nlink === 1, 'Unsafe private artifact');
}
function writeExclusive(path, bytes, mode = 0o600) {
  const fd = openSync(path, 'wx', mode);
  try { fchmodSync(fd, mode); writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
function syncDirectory(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function validate(path) {
  assert.equal(spawnSync('/usr/bin/caddy', ['validate', '--adapter', 'caddyfile', '--config', path], { encoding: 'utf8', timeout: 15000 }).status, 0, 'Caddy validation failed; output suppressed');
}
export function verifyApproval(proof, candidateHash) {
  assert.deepEqual(Object.keys(proof).sort(), ['candidateSha256', 'humanPortalApproved', 'securityCutoverComplete'].sort(), 'Unexpected approval fields');
  assert.ok(proof.humanPortalApproved === true && proof.securityCutoverComplete === true && proof.candidateSha256 === candidateHash, 'Final coordinator approval required');
}
export function execute(mode) {
  assert.ok(process.getuid() === 0 && ['--stage', '--apply'].includes(mode), 'Only reviewed root stage/apply');
  trusted(fileURLToPath(import.meta.url)); trusted(livePath);
  const snippets = {};
  for (const [key, name] of [['internal', 'portal-internal-routes.Caddyfile'], ['canonical', 'portal-canonical-routes.Caddyfile'], ['public', 'portal-routes.Caddyfile']]) {
    const path = fileURLToPath(new URL(name, import.meta.url)); trusted(path); snippets[key] = readFileSync(path, 'utf8');
  }
  trusted(productDirectory + '/candidate.Caddyfile', true);
  const original = readFileSync(productDirectory + '/candidate.Caddyfile', 'utf8');
  const candidate = merge(original, snippets);
  const proof = { originalSha256: sha(original), candidateSha256: sha(candidate), candidateHasHumanPortal: true };
  verifyAdapted(adaptText(original), adaptText(candidate), snippets);
  if (mode === '--stage') {
    trusted('/var/backups'); mkdirSync(directory, { mode: 0o700 }); trusted(directory);
    writeExclusive(directory + '/original.Caddyfile', original);
    writeExclusive(directory + '/candidate.Caddyfile', candidate);
    validate(directory + '/candidate.Caddyfile');
    writeExclusive(directory + '/verified.json', JSON.stringify(proof) + '\n'); syncDirectory(directory);
    return { staged: true, applied: false, humanPortalEnabled: false, ...proof };
  }
  for (const file of ['original.Caddyfile', 'candidate.Caddyfile', 'verified.json', 'approval.json']) trusted(directory + '/' + file, true);
  try { lstatSync(directory + '/apply-started.json'); throw Error('Already attempted; inspect before recovery'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert.equal(readFileSync(directory + '/original.Caddyfile', 'utf8'), original, 'Original artifact changed');
  assert.equal(readFileSync(directory + '/candidate.Caddyfile', 'utf8'), candidate, 'Candidate artifact changed');
  assert.equal(readFileSync(directory + '/verified.json', 'utf8'), JSON.stringify(proof) + '\n', 'Verified proof changed');
  verifyApproval(JSON.parse(readFileSync(directory + '/approval.json', 'utf8')), proof.candidateSha256);
  trusted(productDirectory + '/applied.json', true);
  const products = JSON.parse(readFileSync(productDirectory + '/applied.json', 'utf8'));
  assert.ok(products.phase === '--apply' && products.candidateSha256 === sourceHash && products.humanSsoEnabled === false, 'Product routes must already be applied');
  assert.equal(readFileSync(livePath, 'utf8'), original, 'Live config is not intended final product configuration');
  validate(directory + '/candidate.Caddyfile');
  const next = '/etc/caddy/Caddyfile.developed-human-next';
  writeExclusive(next, candidate, 0o644);
  assert.equal(readFileSync(livePath, 'utf8'), original, 'Source drift before switch');
  writeExclusive(directory + '/apply-started.json', JSON.stringify(proof) + '\n'); syncDirectory(directory);
  renameSync(next, livePath); syncDirectory('/etc/caddy');
  const result = spawnSync('/usr/bin/systemctl', ['reload', 'caddy.service'], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, 'Reload failed; inspect actual active configuration. No automatic rollback or retry');
  writeExclusive(directory + '/applied.json', JSON.stringify({ ...proof, appliedAt: new Date().toISOString() }) + '\n'); syncDirectory(directory);
  return { applied: true, humanPortalEnabled: true, ...proof };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assert.equal(process.argv.length, 3); console.log(JSON.stringify(execute(process.argv[2]))); }
  catch { console.error('Human portal operation stopped. Inspect protected phase state; no automatic rollback.'); process.exitCode = 1; }
}
