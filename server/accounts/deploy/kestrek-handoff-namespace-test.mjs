// All interface/nft operations are confined to disconnected new namespaces.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readlinkSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RULES, TABLE, verifyFenceJson } from './kestrek-handoff-fence.mjs';
import { generateRules } from './uid-network-boundary.mjs';
const NODE = '/opt/developed-runtimes/node-v22.23.2/bin/node';
const self = fileURLToPath(import.meta.url), mode = process.argv[2], children = [];
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
function isolated(host) { assert.equal(process.getuid(), 0); assert.match(host || '', /^net:\[\d+\]$/); assert.notEqual(readlinkSync('/proc/self/ns/net'), host); assert.notEqual(readlinkSync('/proc/self/ns/net'), readlinkSync('/proc/1/ns/net')); }
async function ready(command, args) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Fixture readiness failed')), 5000); child.stdout.on('data', d => { if (d.toString().includes('READY')) { clearTimeout(timer); resolve(); } }); child.once('error', reject); child.once('exit', () => { clearTimeout(timer); reject(Error('Fixture exited')); }); }); return child;
}
const probeCode = `const n=require('node:net');const uid=Number(process.argv[1]);if(uid){process.setgroups([]);process.setgid(uid);process.setuid(uid);}const s=n.connect({host:process.argv[2],port:Number(process.argv[3])},()=>s.write('ok'));s.on('data',()=>process.exit(0));s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),900);`;
function probe(uid, address, port, expected, peer) {
  const args = [NODE, '-e', probeCode, String(uid), address, String(port)];
  let ok = true; try { peer ? run('nsenter', [`--net=/proc/${peer.pid}/ns/net`, '--', ...args]) : run(args[0], args.slice(1)); } catch { ok = false; }
  assert.equal(ok, expected, `Fixture ${uid} ${address}:${port}`);
}
if (mode === '--run') {
  const child = spawn('sudo', ['-n', 'unshare', '--net', '--', NODE, self, '--inside', readlinkSync('/proc/self/ns/net')], { stdio: 'inherit' }); child.once('exit', code => { process.exitCode = code ?? 1; });
} else if (mode === '--peer') {
  isolated(process.argv[3]); run('ip', ['link', 'set', 'lo', 'up']); console.log('READY'); setInterval(() => {}, 1000);
} else if (mode === '--inside') {
  isolated(process.argv[3]); const directory = mkdtempSync(join(tmpdir(), 'kestrek-handoff-net-test-'));
  try {
    run('ip', ['link', 'set', 'lo', 'up']);
    const peer = await ready('unshare', ['--net', '--', NODE, self, '--peer', process.argv[3]]);
    run('ip', ['link', 'add', 'fixture0', 'type', 'veth', 'peer', 'name', 'fixture1']); run('ip', ['link', 'set', 'fixture1', 'netns', String(peer.pid)]);
    run('ip', ['addr', 'add', '192.0.2.1/24', 'dev', 'fixture0']); run('ip', ['-6', 'addr', 'add', 'fd00:612::1/64', 'dev', 'fixture0', 'nodad']); run('ip', ['link', 'set', 'fixture0', 'up']);
    const inPeer = args => run('nsenter', [`--net=/proc/${peer.pid}/ns/net`, '--', 'ip', ...args]);
    inPeer(['addr', 'add', '192.0.2.2/24', 'dev', 'fixture1']); inPeer(['-6', 'addr', 'add', 'fd00:612::2/64', 'dev', 'fixture1', 'nodad']); inPeer(['link', 'set', 'fixture1', 'up']);
    await ready(NODE, ['-e', `const net=require('node:net');Promise.all([3124,3164,3199].flatMap(port=>['0.0.0.0','::'].map(host=>new Promise((resolve,reject)=>{const s=net.createServer(c=>c.on('data',d=>c.write(d)));s.on('error',reject);s.listen({port,host,ipv6Only:true},resolve);})))) .then(()=>console.log('READY')).catch(()=>process.exit(2));`]);
    for (const address of ['192.0.2.1', 'fd00:612::1']) probe(0, address, 3124, true, peer);
    const fence = join(directory, 'fence.nft'); writeFileSync(fence, RULES, { mode: 0o600 });
    run('nft', ['--check', '--file', fence]); run('nft', ['--file', fence]);
    verifyFenceJson(JSON.parse(run('nft', ['-j', 'list', 'table', 'inet', TABLE])));
    for (const address of ['192.0.2.1', 'fd00:612::1']) { probe(0, address, 3124, false, peer); probe(0, address, 3199, true, peer); }
    for (const uid of [0, 999, 1000]) probe(uid, '127.0.0.1', 3124, true);
    const config = { version: 1, centralUid: 61001, caddyUid: 61002, blockedNetworks: [], apps: [
      { name: 'kestrek', uid: 61012, database: [], dns: [{ address: '127.0.0.53', port: 53 }], selfMcpApi: true },
      { name: 'other', uid: 61013, database: [], dns: [{ address: '127.0.0.53', port: 53 }] },
    ] };
    const policy = join(directory, 'uid.nft'); writeFileSync(policy, generateRules(config), { mode: 0o600 }); run('nft', ['--check', '--file', policy]); run('nft', ['--file', policy]);
    probe(61012, '127.0.0.1', 3164, true); probe(61012, '::1', 3164, false); probe(61012, '127.0.0.1', 3124, false); probe(61012, '127.0.0.1', 3199, false); probe(61013, '127.0.0.1', 3164, false);
    verifyFenceJson(JSON.parse(run('nft', ['-j', 'list', 'table', 'inet', TABLE])));
    console.log('PASS: disconnected IPv4/IPv6 INPUT fence and exact KešTrek self3164 allowance');
  } finally { for (const child of children.reverse()) child.kill('SIGTERM'); rmSync(directory, { recursive: true, force: true }); }
} else { console.error('Usage: --run (disconnected namespace fixture only)'); process.exitCode = 2; }
