// Retire only superseded serving processes, preserving containers/data/releases.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readlinkSync, lstatSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export const oldUnits = [
  [false, 'mega-music-accounts.service', 3228503],
  [false, 'mega-music-accounts-green.service', 1910545],
  [true, 'screentime-prod.service', 401984],
  [true, 'kestrek-prod.service', 1282853],
  [true, 'otazkomat-prod.service', 1126],
];
export const oldContainers = [
  ['airsoft-marketplace', '50465ad5f6b3f7a93a16cc238b963cc6f583fb730051ea3d9ae37731d2906a38', 2697486],
  ['voc-builder', 'b4a090ae4a9129109d0f819a2a9538e77e9ba1b0100f810eb86d0af2e8272581', 2391125],
];
export const newUnits = [
  ['mega-music-accounts-isolated@4ca877f89a3d.service', 984],
  ['developed-screentime@a3df8a458169-central.service', 983],
  ['developed-kestrek@1c102674a293.service', 982],
  ['developed-otazkomat@7393f6b095f0.service', 981],
  ['developed-airsoft-green.service', 986],
  ['developed-vocabulum-green.service', 985],
];
const backup = '/var/backups/developed-predecessor-retirement-20260920';
const routeHash = '501bbc47de35e94a45c24b9281b1e88ac918ae75d02750fd70c8f13bb1c63946';
const ports = new Set([3137, 3138, 3127, 3124, 3126, 3002, 3001]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function run(file, args) {
  const r = spawnSync(file, args, { encoding: 'utf8', timeout: 90000 });
  assert.equal(r.status, 0, 'Scoped retirement command failed; output suppressed'); return r.stdout;
}
function system(user, args) {
  return user ? run('/usr/sbin/runuser', ['-u', 'openclaw', '--', '/usr/bin/env',
    'XDG_RUNTIME_DIR=/run/user/1000', 'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus',
    '/usr/bin/systemctl', '--user', ...args]) : run('/usr/bin/systemctl', args);
}
function unit(user, name) {
  return Object.fromEntries(system(user, ['show', name, '-p', 'MainPID,ActiveState,UnitFileState'])
    .trim().split('\n').map(line => line.split('=')));
}
function container(name) {
  return JSON.parse(run('/usr/bin/docker', ['inspect', '--format',
    '{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"restart":{{json .HostConfig.RestartPolicy.Name}}}', name]));
}
function trusted(path) {
  let prefix = '';
  for (const part of path.split('/').filter(Boolean)) {
    prefix += '/' + part; const s = lstatSync(prefix);
    assert.ok(s.uid === 0 && !s.isSymbolicLink() && !(s.mode & 0o022), 'Untrusted retirement path');
  }
}
export function activeConnections(text, selectedPorts = ports) {
  return text.trim().split('\n').slice(1).filter(Boolean).filter(line => {
    const f = line.trim().split(/\s+/); assert.ok(f.length >= 10);
    return [f[1], f[2]].some(address => selectedPorts.has(parseInt(address.split(':').at(-1), 16)))
      && !['0A', '06'].includes(f[3].toUpperCase());
  }).length;
}
function draining() {
  let active = ['/proc/net/tcp', '/proc/net/tcp6'].reduce((sum, path) => sum + activeConnections(readFileSync(path, 'utf8')), 0);
  for (const [name, id, pid] of oldContainers) {
    const state = container(name); assert.equal(state.id, id);
    if (!state.running) { assert.equal(state.pid, 0); continue; }
    assert.equal(state.pid, pid, 'Container PID drift during drain');
    for (const family of ['tcp', 'tcp6']) active += activeConnections(readFileSync(`/proc/${pid}/net/${family}`, 'utf8'), new Set([3000]));
  }
  return active;
}
function write(name, value) {
  const fd = openSync(`${backup}/${name}`, 'wx', 0o600);
  try { writeFileSync(fd, typeof value === 'string' ? value : JSON.stringify(value)); fsyncSync(fd); }
  finally { closeSync(fd); }
  const dir = openSync(backup, 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
}
function routeCheck() {
  trusted('/etc/caddy/Caddyfile');
  assert.equal(sha(readFileSync('/etc/caddy/Caddyfile')), routeHash, 'Final product routes required');
  const path = '/var/backups/developed-product-routes-20260920/applied.json'; trusted(path);
  const proof = JSON.parse(readFileSync(path));
  assert.ok(proof.phase === '--apply' && proof.candidateSha256 === routeHash && proof.humanSsoEnabled === false);
}
export async function execute(mode) {
  assert.ok(process.getuid() === 0 && mode === '--apply', 'Reviewed root apply only');
  trusted(new URL(import.meta.url).pathname); routeCheck();
  const originals = oldUnits.map(([user, name, pid]) => {
    const state = unit(user, name);
    assert.ok(state.ActiveState === 'active' && Number(state.MainPID) === pid && state.UnitFileState === 'enabled', 'Old unit drift');
    return { user, name, ...state };
  });
  const containers = oldContainers.map(([name, id, pid]) => {
    const state = container(name);
    assert.ok(state.id === id && state.name === `/${name}` && state.pid === pid && state.running && state.restart === 'unless-stopped', 'Old container drift');
    return state;
  });
  const candidates = newUnits.map(([name, uid]) => {
    const state = unit(false, name); assert.ok(state.ActiveState === 'active' && Number(state.MainPID) > 0);
    assert.ok(new RegExp(`^Uid:\\s+${uid}\\s+${uid}\\s+${uid}\\s+${uid}$`, 'm').test(readFileSync(`/proc/${state.MainPID}/status`, 'utf8')));
    return { name, uid, ...state };
  });
  let quiet = 0;
  for (let n = 0; n < 30 && quiet < 3; n++) {
    quiet = draining() === 0 ? quiet + 1 : 0;
    if (quiet < 3) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(quiet, 3, 'Old API sockets have not drained; no process stopped'); routeCheck();
  trusted('/var/backups'); mkdirSync(backup, { mode: 0o700 });
  const parent = openSync('/var/backups', 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
  write('before.json', { originals, containers, candidates, routeHash, startedAt: new Date().toISOString() });
  for (const [user, name] of oldUnits) write(`${name}.original`, system(user, ['cat', name]));
  // Boot selection first; these already-running candidates are not restarted.
  for (const [name] of newUnits) {
    system(false, ['add-wants', 'multi-user.target', name]);
    const path = `/etc/systemd/system/multi-user.target.wants/${name}`, stat = lstatSync(path);
    assert.ok(stat.isSymbolicLink() && stat.uid === 0, 'Unexpected boot dependency');
    const fragment = '/etc/systemd/system/' + name.replace(/@[^.]+\.service$/, '@.service');
    assert.equal(readlinkSync(path), fragment, 'Unexpected boot dependency target'); trusted(fragment);
  }
  for (const [user, name, pid] of oldUnits) {
    assert.equal(Number(unit(user, name).MainPID), pid, 'Old PID changed before retirement');
    assert.equal(draining(), 0, 'New old-port traffic appeared; reconcile before continuing');
    system(user, ['disable', name]); system(user, ['stop', name]);
    const state = unit(user, name);
    assert.ok(state.MainPID === '0' && state.ActiveState === 'inactive' && state.UnitFileState === 'disabled');
    write(`${name}.retired.json`, { ...state, time: new Date().toISOString() });
  }
  for (const [name, id, pid] of oldContainers) {
    const state = container(name); assert.ok(state.id === id && state.pid === pid && state.running);
    assert.equal(draining(), 0, 'New old-port traffic appeared; reconcile before continuing');
    run('/usr/bin/docker', ['update', '--restart=no', id]);
    run('/usr/bin/docker', ['stop', '--timeout', '60', id]);
    const after = container(name); assert.ok(after.id === id && !after.running && after.pid === 0 && after.restart === 'no');
    write(`${name}.retired.json`, { ...after, time: new Date().toISOString() });
  }
  for (const candidate of candidates) {
    const state = unit(false, candidate.name);
    assert.ok(state.ActiveState === 'active' && state.MainPID === candidate.MainPID && state.UnitFileState === 'enabled', 'Candidate state changed');
  }
  const result = { completed: true, retiredUnits: oldUnits.length, stoppedContainers: oldContainers.length,
    containersDeleted: false, candidatesBootEnabled: 6, candidateRestarts: 0 };
  write('completed.json', result); return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assert.equal(process.argv.length, 3); console.log(JSON.stringify(await execute(process.argv[2]))); }
  catch { console.error('Predecessor retirement stopped; inspect protected per-target records. No automatic restart, rollback or retry.'); process.exitCode = 1; }
}
