// Fixed host-socket masks only. No restart, RPC, environment read, or unmask path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const NODE = '/opt/developed-runtimes/node-v22.23.2/bin/node';
export const SOURCE = '/run/systemd/inaccessible/dir';
export const DIRECTORY = '/run/tailscale';
export const SOCKET = '/run/tailscale/tailscaled.sock';
export const BACKUP = '/var/backups/developed-tailscale-socket-seal-20260920';
export const DROPIN = '[Unit]\nAfter=tailscaled.service\n[Service]\nInaccessiblePaths=/run/tailscale\n';
export const TARGETS = Object.freeze([
  ['mega', 'mega-music-accounts-isolated@4ca877f89a3d.service', 'mega-music-accounts-isolated@.service', 984, 978],
  ['screen', 'developed-screentime@a3df8a458169-central.service', 'developed-screentime@.service', 983, 977],
  ['ke', 'developed-kestrek@1c102674a293.service', 'developed-kestrek@.service', 982, 975],
  ['ota', 'developed-otazkomat@7393f6b095f0.service', 'developed-otazkomat@.service', 981, 976],
  ['ke-notifications', 'developed-kestrek-notifications.service', 'developed-kestrek-notifications.service', 982, 975],
  ['myclinic', 'developed-myclinic@release-37c2650.service', 'developed-myclinic@.service', 996, 986],
  ['mega-front', 'mega-youtube-front.service', 'mega-youtube-front.service', 980, 974],
  ['mega-cleanup', 'mega-music-session-cleanup.service', 'mega-music-session-cleanup.service', 984, 978, 'inactive'],
  ['central', 'developed-accounts.service', 'developed-accounts.service', 988, 982, 'overlay'],
  ['central-mail', 'developed-accounts-mail-worker.service', 'developed-accounts-mail-worker.service', 988, 982, 'inactive'],
  ['airsoft', 'developed-airsoft-green.service', 'developed-airsoft-green.service', 986, 980, 'sealed'],
  ['vocabulum', 'developed-vocabulum-green.service', 'developed-vocabulum-green.service', 985, 979, 'sealed'],
].map(([name, unit, template, uid, gid, mode = 'mask']) => Object.freeze({ name, unit, template, uid, gid, mode })));
const SELF = fileURLToPath(import.meta.url);
const digest = value => createHash('sha256').update(value).digest('hex');
const read = name => fs.readFileSync(name, 'utf8');
const run = (command, args, extra = {}) => execFileSync(command, args, {
  env: { PATH: '/usr/bin:/bin', LANG: 'C' }, encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 8 * 1024 * 1024, ...extra,
});
export function parseMounts(text) {
  return text.trim().split('\n').map(line => {
    const fields = line.split(' '), split = fields.indexOf('-');
    assert.ok(split >= 6 && /^\d+$/.test(fields[0]), 'Malformed mount metadata');
    const decode = value => value.replace(/\\(040|011|012|134)/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
    return { id: fields[0], parent: fields[1], root: decode(fields[3]), point: decode(fields[4]), options: fields[5], optional: fields.slice(6, split), type: fields[split + 1] };
  });
}
export function coveringMount(mounts, target) {
  const found = mounts.filter(m => target === m.point || target.startsWith(m.point === '/' ? '/' : m.point + '/'));
  assert.ok(found.length, 'No covering mount');
  return found.sort((a, b) => b.point.length - a.point.length)[0];
}
export function assertMountPlan(text, privatePhase = false, mode = 'mask') {
  assert.ok(['mask', 'overlay', 'sealed'].includes(mode));
  const mounts = parseMounts(text), cover = coveringMount(mounts, DIRECTORY);
  assert.equal(cover.point, mode === 'sealed' ? DIRECTORY : '/run', 'Unexpected socket parent mount');
  const parent = coveringMount(mounts, '/run');
  assert.equal(coveringMount(mounts, SOURCE).id, parent.id, 'Inaccessible source has a separate propagation domain');
  assert.equal(mounts.filter(m => m.point === '/run').length, 1, 'Stacked runtime parent');
  const children = mounts.filter(m => m.point.startsWith('/run/tailscale/'));
  if (mode === 'overlay') assert.deepEqual(children.map(m => m.point), [SOCKET], 'Unreviewed overlay subtree');
  else assert.equal(children.length, 0, 'Socket subtree already mounted');
  assert.equal(mounts.filter(m => m.point === DIRECTORY).length, mode === 'sealed' ? 1 : 0, 'Stacked directory mask');
  assert.ok(!cover.optional.includes('unbindable'), 'Unbindable runtime parent');
  if (privatePhase) assert.equal(cover.optional.length, 0, 'Runtime parent is not private');
  return cover;
}
export function parseUnix(text) {
  const result = new Map();
  for (const line of text.trim().split('\n').filter(Boolean)) {
    const f = line.trim().split(/\s+/);
    assert.ok(f.length === 8 && /^u_/.test(f[0]) && /^\d+$/.test(f[5]) && /^\d+$/.test(f[7]), 'Unexpected UNIX socket metadata');
    assert.ok(!result.has(f[5]), 'Duplicate UNIX inode');
    result.set(f[5], { kind: f[0], state: f[1], path: f[4], peer: f[7] });
  }
  return result;
}
export function assertNoControlFds(inodes, unix, allowFrontListener = false) {
  const owned = new Set(inodes);
  for (const inode of owned) {
    const row = unix.get(inode);
    // TCP sockets are absent from this UNIX-only inventory.
    if (!row) continue;
    if (allowFrontListener && row.kind === 'u_str' && row.state === 'LISTEN' && row.path === '/run/mega-youtube-front/control.sock' && row.peer === '0') continue;
    assert.equal(row.kind, 'u_str', 'Unqualified UNIX socket type');
    assert.equal(row.state, 'ESTAB', 'Unqualified UNIX socket state');
    assert.equal(row.path, '*', 'Unexpected named client socket');
    const peer = unix.get(row.peer);
    assert.ok(peer && peer.peer === inode, 'Unknown UNIX peer');
    assert.ok(peer.path === '/run/systemd/journal/stdout' ||
      (peer.path === '*' && owned.has(row.peer)), 'Existing external/control socket');
  }
}
function trusted(name) {
  for (let current = name; current !== '/'; current = path.dirname(current)) {
    const st = fs.lstatSync(current);
    assert.ok(!st.isSymbolicLink() && st.uid === 0 && !(st.mode & 0o022), 'Untrusted operator path');
  }
}
function socketIdentity(name) {
  const st = fs.lstatSync(name);
  assert.ok(st.isSocket() && !st.isSymbolicLink() && st.uid === 0 && st.gid === 0, 'Unexpected socket identity');
  return { dev: st.dev, ino: st.ino, mode: st.mode & 0o7777 };
}
function directoryIdentity(name) {
  const st = fs.lstatSync(name);
  assert.ok(st.isDirectory() && !st.isSymbolicLink() && st.uid === 0 && st.gid === 0, 'Unexpected directory identity');
  return { dev: st.dev, ino: st.ino, mode: st.mode & 0o7777 };
}
function fixedSource() {
  trusted(SOURCE); const identity = directoryIdentity(SOURCE);
  assert.equal(identity.mode, 0, 'Inaccessible source is not mode 000');
  return identity;
}
function service(target) {
  const raw = run('/usr/bin/systemctl', ['show', target.unit, ...['MainPID', 'ActiveState', 'SubState', 'ControlGroup', 'FragmentPath', 'NRestarts'].flatMap(x => ['-p', x])]);
  const values = Object.fromEntries(raw.trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  assert.equal(values.FragmentPath, '/etc/systemd/system/' + target.template, 'Unit source changed');
  trusted(values.FragmentPath);
  if (target.mode === 'inactive') {
    assert.equal(values.MainPID, '0'); assert.equal(values.ActiveState, 'inactive'); assert.equal(values.SubState, 'dead');
  } else {
    assert.ok(Number(values.MainPID) > 1); assert.equal(values.ActiveState, 'active'); assert.equal(values.SubState, 'running');
    assert.ok(values.ControlGroup.startsWith('/system.slice/') && values.ControlGroup.endsWith('/' + target.unit), 'Unexpected service cgroup');
  }
  return values;
}
function processIdentity(pid, target, group) {
  const status = read(`/proc/${pid}/status`), field = name => status.match(new RegExp('^' + name + ':\\s*(.*)$', 'm'))?.[1].trim();
  assert.deepEqual(field('Uid').split(/\s+/).map(Number), Array(4).fill(target.uid));
  assert.deepEqual(field('Gid').split(/\s+/).map(Number), Array(4).fill(target.gid));
  assert.equal(field('Groups'), String(target.gid)); assert.equal(field('CapEff'), '0000000000000000'); assert.equal(field('NoNewPrivs'), '1');
  assert.equal(read(`/proc/${pid}/cgroup`).trim(), '0::' + group);
  assert.equal(fs.readlinkSync(`/proc/${pid}/ns/net`), fs.readlinkSync('/proc/1/ns/net'), 'Runtime network namespace differs from UNIX inventory');
  assert.equal(fs.readlinkSync('/proc/self/ns/net'), fs.readlinkSync('/proc/1/ns/net'), 'Operator network namespace differs from host');
  const stat = read(`/proc/${pid}/stat`); return { pid, start: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19], ns: fs.readlinkSync(`/proc/${pid}/ns/mnt`) };
}
function members(group) {
  const base = '/sys/fs/cgroup' + group;
  assert.ok(!fs.readdirSync(base, { withFileTypes: true }).some(x => x.isDirectory()), 'Nested runtime cgroup requires review');
  return read(base + '/cgroup.procs').trim().split('\n').filter(Boolean).map(Number).sort((a, b) => a - b);
}
function noFds(pids, target) {
  const inodes = [];
  for (const pid of pids) for (const fd of fs.readdirSync(`/proc/${pid}/fd`)) {
    try { const match = fs.readlinkSync(`/proc/${pid}/fd/${fd}`).match(/^socket:\[(\d+)\]$/); if (match) inodes.push(match[1]); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const unix = parseUnix(run('/usr/bin/ss', ['-xanH']));
  assertNoControlFds(inodes, unix, target.name === 'mega-front');
  // Resolve every currently open UNIX FD independently so missing ss rows fail,
  // rather than confusing an unreported Unix socket with an ordinary TCP socket.
  const kernel = new Set(read('/proc/net/unix').trim().split('\n').slice(1).map(x => x.trim().split(/\s+/)[6]));
  for (const inode of inodes) if (kernel.has(inode)) assert.ok(unix.has(inode), 'Incomplete UNIX inventory');
}
function live(target, state = service(target)) {
  if (target.mode === 'inactive') return { target: target.name, service: state, processes: [] };
  const pids = members(state.ControlGroup); assert.ok(pids.includes(Number(state.MainPID)), 'Main process absent');
  const processes = pids.map(pid => processIdentity(pid, target, state.ControlGroup));
  assert.equal(new Set(processes.map(x => x.ns)).size, 1, 'Split service mount namespaces');
  const ns = processes[0].ns;
  assert.notEqual(ns, fs.readlinkSync('/proc/1/ns/mnt')); assert.notEqual(ns, fs.readlinkSync('/proc/self/ns/mnt'));
  for (const entry of fs.readdirSync('/proc').filter(x => /^\d+$/.test(x))) {
    try { if (fs.readlinkSync(`/proc/${entry}/ns/mnt`) === ns) assert.ok(pids.includes(Number(entry)), 'Namespace shared by unrelated process'); }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
  }
  noFds(pids, target);
  const mountinfo = read(`/proc/${state.MainPID}/mountinfo`);
  assertMountPlan(mountinfo, false, target.mode);
  const root = `/proc/${state.MainPID}/root`;
  for (const suffix of ['/run', '/run/tailscale']) assert.ok(fs.lstatSync(root + suffix).isDirectory(), 'Symlink socket parent');
  let identity = null;
  if (target.mode !== 'sealed') {
    identity = socketIdentity(root + SOCKET);
    const expected = socketIdentity(target.mode === 'overlay' ? '/run/systemd/inaccessible/sock' : SOCKET);
    if (target.mode === 'overlay') assert.equal(expected.mode, 0);
    assert.deepEqual(identity, expected, 'Target socket differs from reviewed source');
  }
  assert.deepEqual(directoryIdentity(root + SOURCE), fixedSource(), 'Namespace inaccessible source differs');
  const directory = directoryIdentity(root + DIRECTORY); assert.deepEqual(directory, target.mode === 'sealed' ? fixedSource() : directoryIdentity(DIRECTORY));
  return { target: target.name, service: state, processes, mountHash: digest(mountinfo), source: fixedSource(), socket: identity, directory };
}
function snapshot() {
  assert.equal(process.getuid(), 0); trusted(SELF); trusted(NODE); trusted('/etc/systemd/system');
  fixedSource();
  return { version: 1, operatorHash: digest(fs.readFileSync(SELF)), hostNs: fs.readlinkSync('/proc/1/ns/mnt'), hostMountHash: digest(read('/proc/1/mountinfo')), hostSocket: socketIdentity(SOCKET), hostDirectory: directoryIdentity(DIRECTORY), targets: TARGETS.map(target => live(target)) };
}
function absent(name) { try { fs.lstatSync(name); throw new Error('Existing one-shot target'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
function syncDir(name) { const fd = fs.openSync(name, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function exclusive(name, value, mode = 0o600) { const fd = fs.openSync(name, 'wx', mode); try { fs.fchmodSync(fd, mode); fs.writeFileSync(fd, value); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } syncDir(path.dirname(name)); }
function dropin(target) { return '/etc/systemd/system/' + target.template + '.d/tailscale-control-deny.conf'; }
export function inspect() { const state = snapshot(); return { ready: true, targets: state.targets.map(x => ({ name: x.target, pid: Number(x.service.MainPID), processCount: x.processes.length })), noControlFds: true, liveWrites: false }; }
export function stage() {
  const before = snapshot(); absent(BACKUP);
  for (const target of TARGETS) { absent(dropin(target)); const directory = path.dirname(dropin(target)); if (fs.existsSync(directory)) trusted(directory); }
  fs.mkdirSync(BACKUP, { mode: 0o700 }); syncDir(path.dirname(BACKUP)); trusted(BACKUP);
  exclusive(BACKUP + '/before.json', JSON.stringify(before) + '\n');
  return { staged: true, liveMountsChanged: false, unitDefinitionsChanged: false };
}
// Executed only inside a pinned target namespace. Nonrecursive make-private
// changes this namespace's /run propagation flag before creating any new mount.
export function maskInside(c) {
  const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
  const read = p => fs.readFileSync(p, 'utf8');
  const parse = text => text.trim().split('\n').map(x => { const f = x.split(' '); return { point: f[4], flags: f.slice(6, f.indexOf('-')) }; });
  const cover = () => parse(read('/proc/self/mountinfo')).filter(x => c.target === x.point || c.target.startsWith(x.point === '/' ? '/' : x.point + '/')).sort((a, b) => b.point.length - a.point.length)[0];
  const identity = p => { const s = fs.lstatSync(p); assert.ok(s.isDirectory() && s.uid === 0 && s.gid === 0); return { dev: s.dev, ino: s.ino, mode: s.mode & 0o7777 }; };
  assert.equal(process.getuid(), 0); assert.equal(fs.readlinkSync('/proc/self/ns/mnt'), c.ns); assert.notEqual(c.ns, fs.readlinkSync('/proc/1/ns/mnt'));
  assert.equal(parse(read('/proc/self/mountinfo')).filter(x => c.source === x.point || c.source.startsWith(x.point === '/' ? '/' : x.point + '/')).sort((a,b) => b.point.length-a.point.length)[0].point, '/run');
  assert.equal(cover().point, '/run'); assert.deepEqual(identity(c.source), c.sourceIdentity); assert.equal(c.sourceIdentity.mode, 0); assert.deepEqual(identity(c.target), c.targetIdentity);
  const run = args => cp.execFileSync('/usr/bin/mount', args, { env: { PATH: '/usr/bin:/bin', LANG: 'C' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
  run(['--make-private', '/run']);
  assert.equal(cover().point, '/run'); assert.deepEqual(cover().flags, []);
  run(['--bind', c.source, c.target]);
  assert.equal(cover().point, c.target); assert.deepEqual(cover().flags, []); assert.deepEqual(identity(c.target), c.sourceIdentity);
}
function assertHost(before) {
  assert.equal(fs.readlinkSync('/proc/1/ns/mnt'), before.hostNs);
  assert.equal(digest(read('/proc/1/mountinfo')), before.hostMountHash, 'Host mount state changed');
  assert.deepEqual(socketIdentity(SOCKET), before.hostSocket, 'Host socket changed');
  assert.deepEqual(directoryIdentity(DIRECTORY), before.hostDirectory, 'Host directory changed');
}
function post(target, before) {
  const current = service(target); assert.deepEqual(current, before.service, 'Service state changed');
  const pids = members(current.ControlGroup); assert.deepEqual(pids, before.processes.map(x => x.pid));
  assert.deepEqual(pids.map(pid => processIdentity(pid, target, current.ControlGroup)), before.processes);
  noFds(pids, target);
  const text = read(`/proc/${current.MainPID}/mountinfo`), mounts = parseMounts(text), directoryMount = coveringMount(mounts, DIRECTORY);
  assert.equal(directoryMount.point, DIRECTORY);
  if (target.mode === 'sealed') assert.equal(digest(text), before.mountHash, 'Already-sealed namespace changed');
  else assert.deepEqual(directoryMount.optional, []);
  assert.deepEqual(directoryIdentity(`/proc/${current.MainPID}/root` + DIRECTORY), before.source);
  const code = `const net=require('node:net');const s=net.createConnection({path:${JSON.stringify(SOCKET)}});s.once('connect',()=>{s.destroy();process.exit(1)});s.once('error',e=>process.exit(e.code==='EACCES'?0:2));s.setTimeout(1500,()=>{s.destroy();process.exit(3)});`;
  run('/usr/bin/nsenter', ['--target', current.MainPID, '--mount', '--net', '--', '/usr/bin/setpriv', '--reuid', String(target.uid), '--regid', String(target.gid), '--groups', String(target.gid), '--no-new-privs', NODE, '-e', code]);
}
export function apply() {
  trusted(BACKUP); assert.equal(fs.statSync(BACKUP).mode & 0o777, 0o700); trusted(BACKUP + '/before.json');
  const before = JSON.parse(read(BACKUP + '/before.json'));
  assert.deepEqual(snapshot(), before, 'Staged runtime changed'); absent(BACKUP + '/attempt.json');
  for (const target of TARGETS) absent(dropin(target));
  exclusive(BACKUP + '/attempt.json', JSON.stringify({ started: new Date().toISOString(), operatorHash: before.operatorHash }) + '\n');
  for (const target of TARGETS) {
    const directory = path.dirname(dropin(target)); if (!fs.existsSync(directory)) { fs.mkdirSync(directory, { mode: 0o755 }); syncDir(path.dirname(directory)); }
    trusted(directory); exclusive(dropin(target), DROPIN, 0o644);
  }
  run('/usr/bin/systemctl', ['daemon-reload']); // No service start/restart/enable.
  for (let i = 0; i < TARGETS.length; i++) {
    const target = TARGETS[i], expected = before.targets[i];
    if (target.mode === 'inactive') { assert.deepEqual(service(target), expected.service); continue; }
    if (target.mode === 'sealed') { assert.deepEqual(live(target), expected); post(target, expected); continue; }
    assert.deepEqual(live(target), expected, 'Runtime changed before mask'); assertHost(before);
    // Pin the mount namespace fd across nsenter, not just a reusable numeric PID.
    const fd = fs.openSync(`/proc/${expected.service.MainPID}/ns/mnt`, 'r');
    try {
      const config = { ns: expected.processes[0].ns, source: SOURCE, target: DIRECTORY, sourceIdentity: expected.source, targetIdentity: expected.directory };
      const code = `(${maskInside.toString()})(JSON.parse(process.argv[1]));`;
      run('/usr/bin/nsenter', ['--mount=/proc/self/fd/3', '--', NODE, '-e', code, JSON.stringify(config)], { stdio: ['ignore', 'pipe', 'pipe', fd] });
    } finally { fs.closeSync(fd); }
    post(target, expected); assertHost(before);
    // Every not-yet-changed runtime retains its exact original mount table.
    for (let j = i + 1; j < TARGETS.length; j++) if (before.targets[j].processes.length) assert.equal(digest(read(`/proc/${before.targets[j].service.MainPID}/mountinfo`)), before.targets[j].mountHash, 'Other runtime mount changed');
    exclusive(BACKUP + '/' + target.name + '.json', JSON.stringify({ denied: true, pidUnchanged: true, hostUnchanged: true }) + '\n');
  }
  for (let i = 0; i < TARGETS.length; i++) if (before.targets[i].processes.length) post(TARGETS[i], before.targets[i]);
  assertHost(before);
  for (let i = 0; i < TARGETS.length; i++) if (TARGETS[i].mode === 'inactive') assert.deepEqual(service(TARGETS[i]), before.targets[i].service);
  exclusive(BACKUP + '/verified.json', JSON.stringify({ verified: true, servicesRestarted: false, environmentChanged: false }) + '\n');
  return { verified: true, liveMasks: TARGETS.filter(x => ['mask', 'overlay'].includes(x.mode)).length, preservedDirectoryMasks: TARGETS.filter(x => x.mode === 'sealed').length, futureDropins: TARGETS.length, servicesRestarted: false, hostMountsChanged: false, environmentChanged: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(process.argv.length, 3); const action = { '--inspect': inspect, '--stage': stage, '--apply': apply }[process.argv[2]];
    assert.ok(action, 'Explicit mode required'); console.log(JSON.stringify(action()));
  } catch { console.error('Socket closure refused or incomplete; reconcile root-private proof before any retry. No automatic unmask/restart.'); process.exitCode = 1; }
}
