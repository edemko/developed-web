// Serving-route handoff only. Run apply only after the coordinated prerequisites.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, mkdirSync, openSync, closeSync, writeFileSync, fsyncSync, fchmodSync, renameSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { assertFencePresent } from './kestrek-handoff-fence.mjs';

export const sourceHash = '9b25d5d170f901c8be78cecab23fcf64a672b4a41c52f0cce15df8af69dca33c';
export const replacements = [
  ['127.0.0.1:3138', '127.0.0.1:3168', 1, ['megamusic.developed.sk']],
  ['127.0.0.1:3127', '127.0.0.1:3167', 1, ['screentime.developed.sk']],
  ['127.0.0.1:3124', '127.0.0.1:3164', 2, ['kestrek.sk', 'test.kestrek.sk']],
  ['127.0.0.1:3126', '127.0.0.1:3166', 2, ['educatio.sk', 'test.educatio.sk']],
  ['127.0.0.1:3002', '127.0.0.1:3162', 1, ['amp.developed.sk']],
  ['127.0.0.1:3001', '127.0.0.1:3161', 1, ['vocabulum.developed.sk']],
  ['/var/www/kestrek.sk', '/opt/developed-static/releases/kestrek-central-09236ab', 1, ['kestrek.sk', 'test.kestrek.sk']],
  ['/var/www/educatio.sk', '/opt/developed-static/releases/otazkomat-central-7393f6b', 1, ['educatio.sk', 'test.educatio.sk']],
];
const sourcePath = '/etc/caddy/Caddyfile';
const directory = '/var/backups/developed-product-routes-20260920';
const sha = value => createHash('sha256').update(value).digest('hex');
export const mcpPause = `
# BEGIN DEVELOPED MCP OAUTH PAUSE
route {
  @developed_mcp_oauth_pause path_regexp developed_mcp_oauth_pause (?i)^/api/integrations/mcp/oauth(?:/|$)
  header @developed_mcp_oauth_pause {
    Retry-After "60"
    Cache-Control "no-store"
  }
  respond @developed_mcp_oauth_pause "MCP authorization temporarily unavailable" 503
`;
export const mcpPauseEnd = `
}
# END DEVELOPED MCP OAUTH PAUSE
`;
export function pauseMcp(current) {
  assert.equal(sha(current), sourceHash, 'Serving source drift');
  const host = 'http://kestrek.sk, http://test.kestrek.sk {';
  assert.equal(current.split(host).length, 2, 'Unexpected KešTrek site');
  assert.ok(!current.includes('DEVELOPED MCP OAUTH PAUSE'), 'Pause already present');
  const bodyStart = current.indexOf(host) + host.length;
  const bodyEnd = current.indexOf('\n}\n\nhttp://www.kestrek.sk {', bodyStart);
  assert.ok(bodyEnd > bodyStart, 'Unexpected KešTrek site boundary');
  return current.slice(0, bodyStart) + mcpPause + current.slice(bodyStart, bodyEnd) + mcpPauseEnd + current.slice(bodyEnd);
}
export function merge(current) {
  assert.equal(sha(current), sourceHash, 'Serving source drift');
  let candidate = current;
  for (const [from, to, count] of replacements) {
    assert.ok(!candidate.includes(to), 'Candidate target already present');
    let changed = 0;
    candidate = candidate.split('\n').map(line => {
      if (line.trimStart().startsWith('#')) return line;
      changed += line.split(from).length - 1;
      return line.replaceAll(from, to);
    }).join('\n');
    assert.equal(changed, count, 'Unexpected replacement count');
  }
  return candidate;
}
export function verifyAdapted(before, after) {
  const expected = structuredClone(before);
  const seen = new Map(replacements.map(([from]) => [from, 0]));
  for (const server of Object.values(expected.apps.http.servers)) for (const route of server.routes) {
    const hosts = route.match?.[0]?.host ?? [];
    const walk = value => {
      if (!value || typeof value !== 'object') return;
      for (const [key, entry] of Object.entries(value)) {
        const replacement = replacements.find(([from]) => from === entry);
        if (replacement) {
          const [from, to, , allowedHosts] = replacement;
          assert.ok(['dial', 'root'].includes(key), 'Unexpected replacement field');
          assert.deepEqual([...hosts].sort(), [...allowedHosts].sort(), 'Unexpected replacement site');
          value[key] = to; seen.set(from, seen.get(from) + 1);
        } else if (entry && typeof entry === 'object') walk(entry);
      }
    }; walk(route);
  }
  for (const [from, , count] of replacements) assert.equal(seen.get(from), count, 'Adapted replacement count');
  const normalize = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'hide' && Array.isArray(item)
    ? item.filter(path => !String(path).endsWith('.Caddyfile')) : item));
  // Only automatic source-file hiding differs between these two private files.
  assert.ok(JSON.stringify(normalize(expected)) === JSON.stringify(normalize(after)), 'Unrelated adapted configuration changed');
}
export function verifyPauseAdapted(before, paused) {
  const original = structuredClone(before), updated = structuredClone(paused);
  let changed = 0;
  for (const [name, server] of Object.entries(updated.apps.http.servers)) for (const route of server.routes) {
    const hosts = route.match?.[0]?.host ?? [];
    if (JSON.stringify([...hosts].sort()) !== JSON.stringify(['kestrek.sk', 'test.kestrek.sk'])) continue;
    const prior = original.apps.http.servers[name].routes.find(item => JSON.stringify(item.match?.[0]?.host ?? []) === JSON.stringify(hosts));
    assert.ok(prior, 'Original KešTrek site absent');
    const routes = route.handle?.[0]?.routes;
    assert.ok(Array.isArray(routes), 'Unexpected KešTrek handler topology');
    assert.equal(routes.length, 1, 'Pause must wrap the exact KešTrek handler sequence');
    const added = routes[0];
    assert.ok(added && JSON.stringify(added).includes('developed_mcp_oauth_pause'), 'Ordered MCP pause absent');
    // Validate the exact generated handler in an isolated adaptation too; merely
    // recognizing the matcher name would not establish its response/headers.
    const encoded = JSON.stringify(added);
    assert.ok(encoded.includes('(?i)^/api/integrations/mcp/oauth(?:/|$)') && encoded.includes('Retry-After') && encoded.includes('no-store') && encoded.includes('503'), 'MCP pause contract changed');
    const wrapped = added.handle?.[0]?.routes;
    assert.ok(Array.isArray(wrapped) && wrapped.length >= 3, 'Unexpected ordered pause topology');
    const first = wrapped.shift();
    assert.deepEqual(first, {
      handle: [{ handler: 'headers', response: { set: { 'Cache-Control': ['no-store'], 'Retry-After': ['60'] } } },
        { body: 'MCP authorization temporarily unavailable', handler: 'static_response', status_code: 503 }],
      match: [{ path_regexp: { name: 'developed_mcp_oauth_pause', pattern: '(?i)^/api/integrations/mcp/oauth(?:/|$)' } }],
    }, 'Pause must precede existing handlers with exact status/headers/matcher');
    route.handle[0].routes = wrapped;
    changed++;
  }
  assert.equal(changed, 1, 'Exactly one KešTrek site must gain a pause');
  const normalize = value => {
    const groups = new Map();
    return JSON.parse(JSON.stringify(value, (key, item) => {
      if (key === 'hide' && Array.isArray(item)) return item.filter(path => !String(path).endsWith('.Caddyfile'));
      if (key === 'group' && typeof item === 'string' && /^group\d+$/.test(item)) {
        if (!groups.has(item)) groups.set(item, `group${groups.size}`);
        return groups.get(item);
      }
      return item;
    }));
  };
  assert.ok(JSON.stringify(normalize(original)) === JSON.stringify(normalize(updated)), 'Pause changed unrelated adapted configuration');
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
export function adapt(path) {
  const result = spawnSync('/usr/bin/caddy', ['adapt', '--adapter', 'caddyfile', '--config', path], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, 'Caddy adaptation failed; configuration suppressed');
  return JSON.parse(result.stdout);
}
function validate(path) {
  assert.equal(spawnSync('/usr/bin/caddy', ['validate', '--adapter', 'caddyfile', '--config', path], { encoding: 'utf8', timeout: 15000 }).status, 0, 'Caddy validation failed');
}
function reload() { return spawnSync('/usr/bin/systemctl', ['reload', 'caddy.service'], { encoding: 'utf8', timeout: 20000 }).status === 0; }
export function verifyMcpSwitchProof(state, pausedHash) {
  assert.ok(state.completed === true && state.pausedCaddySha256 === pausedHash && state.oldPid === 1282853 && state.candidateUid === 982 && state.candidateUnit === 'developed-kestrek@1c102674a293.service' && Number.isSafeInteger(state.candidatePid) && state.candidatePid > 0 && /^[a-f0-9]{64}$/.test(state.oldSha256) && state.oldSha256 === state.newSha256, 'Verified MCP state handoff required');
}
export function execute(mode) {
  assert.ok(process.getuid() === 0 && ['--stage', '--pause-mcp', '--apply'].includes(mode), 'Only reviewed root stage/pause/apply');
  trusted(sourcePath); trusted(new URL(import.meta.url).pathname); trusted(new URL('./kestrek-handoff-fence.mjs', import.meta.url).pathname);
  for (const [, destination] of replacements.filter(([from]) => from.startsWith('/var/www/'))) trusted(destination);
  const live = readFileSync(sourcePath, 'utf8');
  if (mode === '--stage') {
    const old = live, paused = pauseMcp(old), candidate = merge(old);
    const proof = { originalSha256: sha(old), pausedSha256: sha(paused), candidateSha256: sha(candidate), humanSsoEnabled: false };
    trusted('/var/backups'); mkdirSync(directory, { mode: 0o700 });
    writeExclusive(directory + '/original.Caddyfile', old);
    writeExclusive(directory + '/paused.Caddyfile', paused);
    writeExclusive(directory + '/candidate.Caddyfile', candidate);
    verifyPauseAdapted(adapt(directory + '/original.Caddyfile'), adapt(directory + '/paused.Caddyfile'));
    verifyAdapted(adapt(directory + '/original.Caddyfile'), adapt(directory + '/candidate.Caddyfile'));
    validate(directory + '/paused.Caddyfile');
    validate(directory + '/candidate.Caddyfile');
    writeExclusive(directory + '/verified.json', JSON.stringify(proof) + '\n'); syncDirectory(directory);
    return { staged: true, ...proof };
  }
  try { lstatSync(directory + '/applied.json'); throw Error('Already applied'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const file of ['original.Caddyfile', 'paused.Caddyfile', 'candidate.Caddyfile', 'verified.json']) trusted(directory + '/' + file, true);
  const old = readFileSync(directory + '/original.Caddyfile', 'utf8');
  const paused = pauseMcp(old), candidate = merge(old);
  const proof = { originalSha256: sha(old), pausedSha256: sha(paused), candidateSha256: sha(candidate), humanSsoEnabled: false };
  assert.ok(readFileSync(directory + '/paused.Caddyfile', 'utf8') === paused && readFileSync(directory + '/candidate.Caddyfile', 'utf8') === candidate, 'Staged source changed');
  assert.ok(readFileSync(directory + '/verified.json', 'utf8') === JSON.stringify(proof) + '\n', 'Staged proof changed');
  verifyPauseAdapted(adapt(directory + '/original.Caddyfile'), adapt(directory + '/paused.Caddyfile'));
  verifyAdapted(adapt(directory + '/original.Caddyfile'), adapt(directory + '/candidate.Caddyfile'));
  const target = mode === '--pause-mcp' ? paused : candidate;
  const expected = mode === '--pause-mcp' ? old : paused;
  assert.ok(live === expected, 'Live source does not match required handoff phase');
  if (mode === '--pause-mcp') {
    try { lstatSync(directory + '/paused.json'); throw Error('Pause already applied'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  } else {
    trusted(directory + '/paused.json', true);
    const stateProofPath = '/var/backups/developed-kestrek-mcp-handoff-20260920/verified.json';
    trusted(stateProofPath, true);
    const state = JSON.parse(readFileSync(stateProofPath, 'utf8'));
    verifyMcpSwitchProof(state, proof.pausedSha256); assertFencePresent();
    const pid = spawnSync('/usr/bin/systemctl', ['show', state.candidateUnit, '--property=MainPID', '--value'], { encoding: 'utf8', timeout: 10000 });
    assert.ok(pid.status === 0 && Number(pid.stdout.trim()) === state.candidatePid, 'MCP candidate restarted after verified copy');
    assert.ok(sha(readFileSync('/home/openclaw/.config/kestrek/chatgpt-personal/mcp-oauth.json')) === state.oldSha256 && sha(readFileSync('/var/lib/developed-kestrek/mcp-oauth.json')) === state.newSha256, 'MCP state changed before route switch');
  }
  validate(directory + (mode === '--pause-mcp' ? '/paused.Caddyfile' : '/candidate.Caddyfile'));
  const next = '/etc/caddy/Caddyfile.developed-products-next';
  writeExclusive(next, target, 0o644);
  assert.ok(readFileSync(sourcePath, 'utf8') === expected, 'Source changed before switch');
  renameSync(next, sourcePath); syncDirectory('/etc/caddy');
  if (!reload()) {
    assert.ok(readFileSync(sourcePath, 'utf8') === target, 'Reload failed with source drift');
    writeExclusive(next, expected, 0o644); renameSync(next, sourcePath); syncDirectory('/etc/caddy');
    assert.ok(reload(), 'Previous phase restored but reload failed'); throw Error('Candidate reload failed; previous phase restored (final apply retains OAuth pause)');
  }
  writeExclusive(directory + (mode === '--pause-mcp' ? '/paused.json' : '/applied.json'), JSON.stringify({ ...proof, appliedAt: new Date().toISOString(), phase: mode }) + '\n'); syncDirectory(directory);
  return { applied: mode === '--apply', mcpPaused: mode === '--pause-mcp', ...proof };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assert.equal(process.argv.length, 3); console.log(JSON.stringify(execute(process.argv[2]))); }
  catch { console.error('Product route operation failed; inspect exact protected state before retry.'); process.exitCode = 1; }
}
