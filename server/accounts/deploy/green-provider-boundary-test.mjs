// This opt-in test changes networking ONLY in disconnected child namespaces.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { greenProviderRules } from './green-provider-boundary.mjs';
const self = fileURLToPath(import.meta.url), mode = process.argv[2], children = [];
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function isolated(host) {
  assert.equal(process.getuid(), 0);
  assert.match(host || '', /^net:\[\d+\]$/);
  assert.notEqual(readlinkSync('/proc/self/ns/net'), host);
  assert.notEqual(readlinkSync('/proc/self/ns/net'), readlinkSync('/proc/1/ns/net'));
}
async function child(cmd, args) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(p);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fixture timeout')), 5000);
    p.stdout.on('data', () => { clearTimeout(timer); resolve(); });
    p.once('exit', () => { clearTimeout(timer); reject(new Error('fixture exited')); });
  }); return p;
}
const server = `const n=require('node:net');Promise.all(JSON.parse(process.argv[1]).map(([host,port])=>new Promise(r=>n.createServer(c=>c.on('data',d=>c.write(d))).listen(port,host,r)))).then(()=>console.log('READY'));`;
const probe = `const n=require('node:net');setTimeout(()=>process.exit(1),500);const s=n.connect({host:process.argv[1],port:Number(process.argv[2])},()=>s.write('ok'));s.on('error',()=>process.exit(1));s.on('data',()=>process.exit(0));`;
if (mode === '--run') {
  const p = spawn('sudo', ['-n', 'unshare', '--net', '--', process.execPath, self, '--inside', readlinkSync('/proc/self/ns/net')], { stdio: 'inherit' });
  p.once('exit', code => { process.exitCode = code ?? 1; });
} else if (mode === '--peer') {
  isolated(process.argv[3]); run('ip', ['link', 'set', 'lo', 'up']); console.log('READY'); setInterval(() => {}, 1000);
} else if (mode === '--inside') {
  isolated(process.argv[3]);
  try {
    run('ip', ['link', 'set', 'lo', 'up']); run('ip', ['link', 'add', 'br-green-test', 'type', 'bridge']);
    run('ip', ['addr', 'add', '172.30.241.1/28', 'dev', 'br-green-test']); run('ip', ['link', 'set', 'br-green-test', 'up']);
    const green = await child('unshare', ['--net', '--', process.execPath, self, '--peer', process.argv[3]]);
    const db = await child('unshare', ['--net', '--', process.execPath, self, '--peer', process.argv[3]]);
    const remote = await child('unshare', ['--net', '--', process.execPath, self, '--peer', process.argv[3]]);
    const inside = (p, args) => run('nsenter', [`--net=/proc/${p.pid}/ns/net`, '--', ...args]);
    for (const [p, name, ip] of [[green, 'green', '172.30.241.2'], [db, 'db', '172.30.241.3'], [remote, 'remote', '8.8.8.8']]) {
      run('ip', ['link', 'add', name + '0', 'type', 'veth', 'peer', 'name', name + '1']);
      run('ip', ['link', 'set', name + '1', 'netns', String(p.pid)]);
      if (p !== remote) run('ip', ['link', 'set', name + '0', 'master', 'br-green-test']);
      else run('ip', ['addr', 'add', '8.8.8.1/24', 'dev', name + '0']);
      run('ip', ['link', 'set', name + '0', 'up']);
      inside(p, ['ip', 'addr', 'add', ip + (p === remote ? '/24' : '/28'), 'dev', name + '1']);
      inside(p, ['ip', 'link', 'set', name + '1', 'up']);
      inside(p, ['ip', 'route', 'add', 'default', 'via', p === remote ? '8.8.8.1' : '172.30.241.1']);
    }
    run('sysctl', ['-qw', 'net.ipv4.ip_forward=1']);
    inside(remote, ['ip', 'addr', 'add', '169.254.169.254/32', 'dev', 'lo']);
    inside(db, ['ip', 'addr', 'add', 'fd00:241::3/64', 'dev', 'db1', 'nodad']);
    inside(green, ['ip', 'addr', 'add', 'fd00:241::2/64', 'dev', 'green1', 'nodad']);
    for (const [p, endpoints] of [[green, [['172.30.241.2', 9999]]], [db, [['172.30.241.3', 5432], ['172.30.241.3', 443], ['fd00:241::3', 443]]], [remote, [['8.8.8.8', 443], ['8.8.8.8', 5432], ['169.254.169.254', 80]]]]) {
      await child('nsenter', [`--net=/proc/${p.pid}/ns/net`, '--', process.execPath, '-e', server, JSON.stringify(endpoints)]);
    }
    await child(process.execPath, ['-e', server, JSON.stringify([['172.30.241.1', 443]])]);
    const check = (p, host, port, allowed) => {
      let ok = true; try { inside(p, [process.execPath, '-e', probe, host, String(port)]); } catch { ok = false; }
      assert.equal(ok, allowed, `${host}:${port}`);
    };
    check(green, '172.30.241.3', 5432, true); check(green, '172.30.241.3', 443, true);
    check(green, '8.8.8.8', 443, true); check(green, '172.30.241.1', 443, true); check(green, 'fd00:241::3', 443, true);
    run('nft', ['--check', greenProviderRules('br-green-test')]); run('nft', [greenProviderRules('br-green-test')]);
    check(green, '172.30.241.3', 5432, true); check(green, '172.30.241.3', 443, false);
    check(green, '8.8.8.8', 443, false); check(green, '169.254.169.254', 80, false);
    check(green, '172.30.241.1', 443, false); check(green, 'fd00:241::3', 443, false);
    check(db, '8.8.8.8', 443, true); // unrelated DB traffic survives
    // Host-originated control traffic remains usable; main UID policy owns authorization.
    run(process.execPath, ['-e', probe, '172.30.241.2', '9999']);
    // A translated DB-looking destination cannot escape the post-DNAT rule.
    run('nft', ['add table ip fixture_nat; add chain ip fixture_nat pre { type nat hook prerouting priority -100; }; add rule ip fixture_nat pre ip daddr 172.30.241.3 tcp dport 5432 dnat to 8.8.8.8:5432']);
    inside(green, ['ip', 'route', 'add', '172.30.241.3/32', 'via', '172.30.241.1']);
    check(green, '172.30.241.3', 5432, false);
    run('nft', [greenProviderRules('br-green-test', { replace: true })]);
    assert.match(run('nft', ['list', 'table', 'ip', 'fixture_nat']), /fixture_nat/);
    console.log('PASS: green DB-only bridge/forward/input, IPv6 denial, post-DNAT denial, control replies, unrelated traffic and atomic replacement');
  } finally { for (const p of children.reverse()) p.kill('SIGKILL'); }
} else throw new Error('Use --run for the isolated fixture');
