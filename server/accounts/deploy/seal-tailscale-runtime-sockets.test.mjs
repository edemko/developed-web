import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { TARGETS, DROPIN, SOCKET, parseMounts, coveringMount, assertMountPlan, parseUnix, assertNoControlFds, maskInside } from './seal-tailscale-runtime-sockets.mjs';
const root = '1 0 8:1 / / rw shared:1 - ext4 /dev/root rw\n';
const shared = root + '2 1 0:1 / /run rw shared:200 master:5 - tmpfs tmpfs rw\n';
test('exact reviewed targets and additive future-start drop-in', () => {
  assert.equal(TARGETS.length, 12); assert.equal(new Set(TARGETS.map(x => x.unit)).size, 12);
  assert.equal(TARGETS.filter(x=>['mask','overlay'].includes(x.mode)).length,8);
  assert.deepEqual(TARGETS.filter(x=>x.mode==='overlay').map(x=>x.name),['central']);
  assert.deepEqual(TARGETS.filter(x=>x.mode==='sealed').map(x=>x.name),['airsoft','vocabulum']);
  assert.deepEqual(TARGETS.filter(x=>x.mode==='inactive').map(x=>x.name),['mega-cleanup','central-mail']);
  assert.ok(TARGETS.some(x => x.name === 'mega-cleanup')); assert.ok(TARGETS.some(x => x.name === 'mega-front'));
  assert.ok(!TARGETS.some(x => /status|egress|tailscaled/.test(x.unit)));
  assert.equal(DROPIN, '[Unit]\nAfter=tailscaled.service\n[Service]\nInaccessiblePaths=/run/tailscale\n');
  assert.doesNotMatch(DROPIN, /Environment|Exec|Restart|InaccessiblePaths=\n/);
});
test('central overlay permits only its pinned existing file mask; sealed directories are preserved', () => {
  const fileMask=shared+'3 2 0:1 /systemd/inaccessible/sock /run/tailscale/tailscaled.sock ro shared:201 master:5 - tmpfs tmpfs rw\n';
  assert.throws(()=>assertMountPlan(fileMask));
  assert.doesNotThrow(()=>assertMountPlan(fileMask,false,'overlay'));
  assert.throws(()=>assertMountPlan(shared,false,'overlay'));
  assert.throws(()=>assertMountPlan(fileMask+fileMask.split('\n')[2]+'\n',false,'overlay'));
  const dirMask=shared+'3 2 0:1 /systemd/inaccessible/dir /run/tailscale ro shared:201 master:5 - tmpfs tmpfs rw\n';
  assert.doesNotThrow(()=>assertMountPlan(dirMask,false,'sealed'));
  assert.throws(()=>assertMountPlan(dirMask,false,'overlay'));
  assert.throws(()=>assertMountPlan(fileMask,false,'sealed'));
});
test('longest covering mount and private pre-bind phase are strict', () => {
  assert.equal(coveringMount(parseMounts(shared), SOCKET).point, '/run');
  assert.equal(assertMountPlan(shared).point, '/run');
  assert.throws(() => assertMountPlan(shared, true));
  assert.doesNotThrow(() => assertMountPlan(shared.replace(' shared:200 master:5', ''), true));
  for (const extra of ['3 2 0:2 / /run/tailscale rw - tmpfs tmpfs rw\n', '3 2 0:2 / /run/tailscale/tailscaled.sock rw - tmpfs tmpfs rw\n', '3 2 0:2 / /run rw - tmpfs tmpfs rw\n']) assert.throws(() => assertMountPlan(shared + extra));
  assert.throws(() => assertMountPlan(shared.replace('shared:200 master:5', 'unbindable')));
  assert.throws(() => parseMounts('not mount metadata'));
});
const journal = 'u_str ESTAB 0 0 * 101 * 102\nu_str ESTAB 0 0 /run/systemd/journal/stdout 102 * 101\n';
test('only journal and same-cgroup anonymous socketpairs qualify', () => {
  assert.doesNotThrow(() => assertNoControlFds(['101'], parseUnix(journal)));
  const pair = 'u_str ESTAB 0 0 * 103 * 104\nu_str ESTAB 0 0 * 104 * 103\n';
  assert.doesNotThrow(() => assertNoControlFds(['101', '103', '104'], parseUnix(journal + pair)));
  assert.throws(() => assertNoControlFds(['103'], parseUnix(pair)));
  for (const name of ['/run/tailscale/tailscaled.sock', '/run/developed-youtube/tailscaled.sock', '*']) assert.throws(() => assertNoControlFds(['101'], parseUnix(journal.replace('/run/systemd/journal/stdout', name))));
  assert.throws(() => assertNoControlFds(['101'], parseUnix(journal.replaceAll('ESTAB', 'SYN-SENT'))));
  assert.throws(() => parseUnix(journal + journal));
});
test('only approved Mega front gets its own existing control listener', () => {
  const rows = parseUnix('u_str LISTEN 0 511 /run/mega-youtube-front/control.sock 111 * 0\n');
  assert.throws(() => assertNoControlFds(['111'], rows));
  assert.doesNotThrow(() => assertNoControlFds(['111'], rows, true));
  assert.throws(() => assertNoControlFds(['111'], parseUnix('u_str LISTEN 0 511 /run/tailscale/tailscaled.sock 111 * 0\n'), true));
});
test('live primitive detaches propagation before bind and has no rollback/restart', () => {
  const source = maskInside.toString(); assert.ok(source.indexOf("run(['--make-private', '/run'])") < source.indexOf("run(['--bind', c.source, c.target])"));
  assert.doesNotMatch(source, /--rbind|--make-rprivate|umount|restart|systemctl/);
  const operator = fs.readFileSync(new URL('./seal-tailscale-runtime-sockets.mjs', import.meta.url), 'utf8');
  assert.ok(operator.includes("['daemon-reload']")); assert.ok(operator.includes("'--mount=/proc/self/fd/3'"));
  assert.ok(operator.includes("socketIdentity(SOCKET), before.hostSocket"));
  assert.ok(operator.includes("Runtime network namespace differs from UNIX inventory"));
});
test('real disposable shared-peer namespaces: only target socket masked, no host mutation', { skip: process.env.TAILSCALE_SOCKET_NAMESPACE_TEST !== '1', timeout: 30000 }, () => {
  const before = fs.readFileSync('/proc/self/mountinfo', 'utf8');
  const fixture = new URL('./seal-tailscale-runtime-sockets.fixture.mjs', import.meta.url).pathname;
  let result;
  try { result = execFileSync('sudo', ['-n', '/usr/bin/unshare', '--mount', '--net', '--pid', '--fork', '--mount-proc', process.execPath, fixture], { encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { assert.fail('Disconnected socket namespace fixture failed (captured diagnostics withheld)'); }
  assert.deepEqual(JSON.parse(result), { sharedPeersInitially: true, targetDenied: true, parentSocketUnchanged: true, peerSocketUnchanged: true, ordinaryFileUpdatesVisible: true, parentMountsUnchanged: true, peerMountsUnchanged: true, socketRecreationStillDenied: true, fileMaskRecreationDenied: false, fileMaskRecreationConnectExit:1, overlayRecreationStillDenied:true });
  assert.equal(fs.readFileSync('/proc/self/mountinfo', 'utf8'), before);
});
