import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants, lstatSync, fstatSync, readFileSync, readlinkSync, mkdirSync, openSync, closeSync, writeFileSync, fsyncSync, fchmodSync, fchownSync, renameSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertFencePresent } from './kestrek-handoff-fence.mjs';

export const OLD_PID = 1282853;
export const UNIT = 'developed-kestrek@1c102674a293.service';
export const OLD = '/home/openclaw/.config/kestrek/chatgpt-personal/mcp-oauth.json';
export const TARGET = '/var/lib/developed-kestrek/mcp-oauth.json';
export const BACKUP = '/var/backups/developed-kestrek-mcp-handoff-20260920';
const NODE = '/opt/developed-runtimes/node-v22.23.2/bin/node';
const oldDirectory = '/home/openclaw/Dev/kestrek/backend';
const newDirectory = '/opt/developed-apps/kestrek/releases/1c102674a293/backend';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = (file, args, env) => { const r = spawnSync(file, args, { encoding: 'utf8', timeout: 20000, ...(env ? { env } : {}) }); assert.equal(r.status, 0, 'Scoped subprocess failed; details suppressed'); return r.stdout; };
const userCommand = args => run('/usr/sbin/runuser', ['-u', 'openclaw', '--', '/usr/bin/env', 'XDG_RUNTIME_DIR=/run/user/1000', 'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus', '/usr/bin/systemctl', '--user', ...args]);
function unit(user, name) {
  const args = ['show', name, '--property=MainPID,ActiveState,UnitFileState'];
  const text = user ? userCommand(args) : run('/usr/bin/systemctl', args);
  return Object.fromEntries(text.trim().split('\n').map(line => line.split('=')));
}
function trusted(path, owner = 0, privateFile = false) {
  let prefix = '';
  for (const part of path.split('/').filter(Boolean)) { prefix += '/' + part; const s = lstatSync(prefix); assert.ok(!s.isSymbolicLink() && [0, owner].includes(s.uid) && !(s.mode & 0o022), 'Unsafe handoff path'); }
  const s = lstatSync(path);
  if (privateFile) assert.ok(s.isFile() && s.uid === owner && s.nlink === 1 && (s.mode & 0o777) === 0o600, 'Unsafe private handoff file');
}
export function storeInfo(bytes) {
  const state = JSON.parse(bytes.toString('utf8'));
  assert.ok(state.version === 1 && Array.isArray(state.clients) && Array.isArray(state.tokens) && state.clients.every(x => Array.isArray(x) && x.length === 2) && state.tokens.every(x => Array.isArray(x) && x.length === 2), 'Unexpected MCP store format');
  return { sha256: sha(bytes), bytes: bytes.length };
}
function readStore(path, owner) {
  trusted(path, owner, true);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    assert.ok(before.uid === BigInt(owner) && before.nlink === 1n && (before.mode & 0o777n) === 0o600n, 'Store descriptor ownership changed');
    const bytes = readFileSync(fd); const after = fstatSync(fd, { bigint: true });
    assert.ok(before.ino === after.ino && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs, 'Store changed while reading');
    const pathStat = lstatSync(path, { bigint: true }); assert.ok(pathStat.ino === after.ino && pathStat.dev === after.dev, 'Store path replaced while reading');
    storeInfo(bytes); return bytes;
  } finally { closeSync(fd); }
}
export function tcpStates(text, port = 3124) {
  return text.trim().split('\n').slice(1).filter(Boolean).flatMap(line => {
    const fields = line.trim().split(/\s+/);
    assert.ok(fields.length >= 10 && /^[0-9A-Fa-f]{2}$/.test(fields[3]), 'Unexpected TCP table format');
    const local = parseInt(fields[1].split(':').at(-1), 16), remote = parseInt(fields[2].split(':').at(-1), 16);
    return local === port || remote === port ? [fields[3].toUpperCase()] : [];
  });
}
function socketsDrained() {
  const states = [...tcpStates(readFileSync('/proc/net/tcp', 'utf8')), ...tcpStates(readFileSync('/proc/net/tcp6', 'utf8'))];
  assert.ok(states.includes('0A'), 'Expected old3124 listener absent');
  return states.every(state => ['0A', '06'].includes(state));
}
function proc(pid, expectedUid, directory) {
  const status = readFileSync(`/proc/${pid}/status`, 'utf8');
  assert.ok(new RegExp(`^Uid:\\s+${expectedUid}\\s+${expectedUid}\\s+${expectedUid}\\s+${expectedUid}$`, 'm').test(status), 'Runtime UID changed');
  if (expectedUid === 982) assert.ok(/^Gid:\s+975\s+975\s+975\s+975$/m.test(status) && /^Groups:\s*975\s*$/m.test(status), 'Candidate group boundary changed');
  assert.ok(readlinkSync(`/proc/${pid}/cwd`) === directory && readlinkSync(`/proc/${pid}/ns/net`) === readlinkSync('/proc/self/ns/net'), 'Runtime cwd/network namespace changed');
  return Object.fromEntries(readFileSync(`/proc/${pid}/environ`).toString().split('\0').filter(Boolean).map(entry => { const at = entry.indexOf('='); return [entry.slice(0, at), entry.slice(at + 1)]; }));
}
export function verifyIdentity(oldEnv, nextEnv) {
  for (const name of ['CHATGPT_API_KEY_SHA256', 'CHATGPT_USER_ID', 'ENCRYPTION_KEY']) assert.ok(oldEnv[name] && oldEnv[name] === nextEnv[name], 'Runtime identity/encryption parity failed');
  assert.match(oldEnv.CHATGPT_API_KEY_SHA256, /^[a-f0-9]{64}$/i);
  assert.ok((oldEnv.CHATGPT_PUBLIC_API_URL || 'https://kestrek.sk/api').replace(/\/$/, '') === 'https://kestrek.sk/api' && (nextEnv.CHATGPT_PUBLIC_API_URL || 'https://kestrek.sk/api').replace(/\/$/, '') === 'https://kestrek.sk/api', 'MCP resource identity changed');
  assert.ok((oldEnv.CHATGPT_TIME_ZONE || 'Europe/Bratislava') === (nextEnv.CHATGPT_TIME_ZONE || 'Europe/Bratislava'), 'MCP timezone changed');
  assert.ok(oldEnv.MCP_OAUTH_STORE_PATH === OLD && nextEnv.MCP_OAUTH_STORE_PATH === TARGET, 'Unexpected OAuth store selection');
  assert.ok(nextEnv.ECOSYSTEM_AUTH_ENABLED === 'true' && nextEnv.NOTIFICATIONS_CRON_ENABLED === 'false', 'Candidate central/cron flags changed');
  for (const [env, port] of [[oldEnv, 3124], [nextEnv, 3164]]) {
    assert.equal(env.PORT, String(port), 'Runtime port changed');
    if (env.MCP_INTERNAL_API_URL) assert.ok(env.MCP_INTERNAL_API_URL.replace(/\/$/, '') === `http://127.0.0.1:${port}/api`, 'Unexpected MCP self API target');
  }
}
function runtimeCheck() {
  const old = unit(true, 'kestrek-prod.service'), next = unit(false, UNIT);
  assert.ok(old.ActiveState === 'active' && Number(old.MainPID) === OLD_PID && next.ActiveState === 'active' && Number(next.MainPID) > 0, 'Exact runtime state changed');
  for (const name of ['kestrek-backend.service', 'kestrek-frontend.service']) { const state = unit(true, name); assert.ok(state.ActiveState === 'inactive' && state.MainPID === '0' && state.UnitFileState === 'disabled', 'Development consumer is not suspended'); }
  const initial = proc(OLD_PID, 1000, oldDirectory), nextEnv = proc(Number(next.MainPID), 982, newDirectory);
  assert.ok(initial.NODE_ENV !== 'development', 'Unexpected legacy environment source');
  const envFile = oldDirectory + '/.env'; trusted(envFile, 1000);
  const oldEnvBytes = readFileSync(envFile); const oldEnv = { ...parseEnv(oldEnvBytes.toString()), ...initial };
  verifyIdentity(oldEnv, nextEnv);
  return { candidatePid: Number(next.MainPID), oldEnvSha256: sha(oldEnvBytes) };
}
async function publicPause() {
  const proofPath = '/var/backups/developed-product-routes-20260920/verified.json'; trusted(proofPath, 0, true);
  const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
  assert.match(proof.pausedSha256, /^[a-f0-9]{64}$/);
  trusted('/etc/caddy/Caddyfile'); assert.ok(sha(readFileSync('/etc/caddy/Caddyfile')) === proof.pausedSha256, 'Exact OAuth pause source required');
  for (const host of ['kestrek.sk', 'test.kestrek.sk']) {
    const r = await fetch(`https://${host}/api/integrations/mcp/OaUtH/token`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const valid = r.status === 503 && r.headers.get('retry-after') === '60' && r.headers.get('cache-control') === 'no-store'; await r.body?.cancel();
    assert.ok(valid, 'Public OAuth pause not effective');
  }
  assertFencePresent(); return proof.pausedSha256;
}
function selfApi() {
  const code = `require('node:http').get('http://127.0.0.1:3164/api',r=>{r.resume();r.on('end',()=>process.exit(r.statusCode===200?0:1));}).on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),5000).unref();`;
  run('/usr/sbin/runuser', ['-u', 'developed-kestrek', '--', NODE, '-e', code]);
}
function writeBackup(name, bytes) { const fd = openSync(BACKUP + '/' + name, 'wx', 0o600); try { fchmodSync(fd, 0o600); writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); } }
function sync(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
async function stableDrain() {
  let last, successes = 0;
  for (let n = 0; n < 30; n++) {
    const bytes = readStore(OLD, 1000), hash = sha(bytes);
    successes = socketsDrained() && last === hash ? successes + 1 : 0;
    if (successes >= 2) return bytes;
    last = hash; await delay(1000);
  }
  throw Error('Old OAuth store/TCP traffic did not drain; keep pause and retry only after review');
}
export async function execute(mode) {
  assert.ok(process.getuid() === 0 && ['--inspect', '--apply'].includes(mode), 'Reviewed root inspect/apply only');
  trusted(fileURLToPath(import.meta.url)); trusted(fileURLToPath(new URL('./kestrek-handoff-fence.mjs', import.meta.url)));
  if (mode === '--inspect') {
    const runtime = runtimeCheck(); let selfApiReady = true; try { selfApi(); } catch { selfApiReady = false; }
    return { inspected: true, mutated: false, oldPid: OLD_PID, candidatePid: runtime.candidatePid, identityParityVerified: true, selfApiReady, oldSha256: sha(readStore(OLD, 1000)), privateSha256: sha(readStore(TARGET, 982)), oldTcpDrained: socketsDrained() };
  }
  const pausedCaddySha256 = await publicPause(), runtime = runtimeCheck(); selfApi();
  const oldBytes = await stableDrain(); const privateBytes = readStore(TARGET, 982);
  trusted('/var/backups'); mkdirSync(BACKUP, { mode: 0o700 });
  writeBackup('old.json', oldBytes); writeBackup('private-before.json', privateBytes);
  writeBackup('attempt.json', JSON.stringify({ startedAt: new Date().toISOString(), pausedCaddySha256, oldPid: OLD_PID, ...runtime }) + '\n'); sync(BACKUP);
  // Old production continues serving finance/MCP data; only the unrouted copy stops.
  run('/usr/bin/systemctl', ['stop', UNIT]);
  const stopped = unit(false, UNIT); assert.ok(stopped.MainPID === '0' && ['inactive', 'failed'].includes(stopped.ActiveState), 'Candidate failed to stop');
  assert.ok([...tcpStates(readFileSync('/proc/net/tcp', 'utf8'), 3164), ...tcpStates(readFileSync('/proc/net/tcp6', 'utf8'), 3164)].every(state => state === '06'), 'Candidate3164 still active');
  assert.ok(socketsDrained() && sha(readStore(OLD, 1000)) === sha(oldBytes) && sha(readFileSync(oldDirectory + '/.env')) === runtime.oldEnvSha256, 'Old state/config changed before final copy');
  assert.ok(await publicPause() === pausedCaddySha256, 'Pause changed before copy');
  const temporary = '/var/lib/developed-kestrek/mcp-oauth.handoff-next'; trusted('/var/lib/developed-kestrek', 982);
  const fd = openSync(temporary, 'wx', 0o600);
  try { fchmodSync(fd, 0o600); fchownSync(fd, 982, 975); writeFileSync(fd, oldBytes); fsyncSync(fd); } finally { closeSync(fd); }
  assert.ok(socketsDrained() && sha(readStore(OLD, 1000)) === sha(oldBytes), 'Old OAuth state changed during copy');
  renameSync(temporary, TARGET); sync('/var/lib/developed-kestrek');
  assert.ok(sha(readStore(TARGET, 982)) === sha(oldBytes), 'Final private copy mismatch');
  run('/usr/bin/systemctl', ['start', UNIT]);
  let ready = false;
  for (let n = 0; n < 20; n++) { try { selfApi(); ready = true; break; } catch { await delay(500); } }
  assert.ok(ready, 'Private candidate readiness failed; keep OAuth pause');
  const restarted = runtimeCheck();
  assert.ok(sha(readStore(OLD, 1000)) === sha(oldBytes) && sha(readStore(TARGET, 982)) === sha(oldBytes), 'Post-restart OAuth store parity failed');
  assert.ok(await publicPause() === pausedCaddySha256, 'Pause changed after candidate restart');
  const result = { completed: true, pausedCaddySha256, oldPid: OLD_PID, candidateUnit: UNIT, candidateUid: 982, candidatePid: restarted.candidatePid, oldSha256: sha(oldBytes), newSha256: sha(readStore(TARGET, 982)) };
  writeBackup('verified.json', JSON.stringify({ ...result, completedAt: new Date().toISOString() }) + '\n'); sync(BACKUP);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assert.equal(process.argv.length, 3); console.log(JSON.stringify(await execute(process.argv[2]))); }
  catch { console.error('MCP handoff failed; keep OAuth pause and inspect protected state. Never replay or restart old services as cleanup.'); process.exitCode = 1; }
}
