// One reviewed policy amendment. No service restart, global firewall flush, or
// other application configuration changes. Install as root-owned source first.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, lstatSync, mkdirSync, openSync, closeSync, writeFileSync, fchmodSync, fsyncSync, renameSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateRules } from './uid-network-boundary.mjs';

export const CONFIG = '/etc/developed-accounts/uid-network-boundary.json';
export const GENERATOR = '/opt/developed-control/network/uid-network-boundary.mjs';
export const LOADER = '/opt/developed-control/network/load-uid-boundary.mjs';
export const BACKUP = '/var/backups/developed-kestrek-self-mcp-20260920';
const NODE = '/opt/developed-runtimes/node-v22.23.2/bin/node';
export const pins = {
  config: '57b336f01432091ba11644d19d1317c2c6461c7c39efa3c82b470b949075694b',
  generator: '8547887fa5aa0ebccfa9c96dceb57283ebf12a81daef225717a120f08b164289',
  loader: '53d3ff2de81143475dd5f08b0bdeab2f1c43bc5cafdd9b649a79fd8fc1c8b7a0',
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (file, args) => { const r = spawnSync(file, args, { encoding: 'utf8', timeout: 20000, env: { PATH: '/usr/sbin:/usr/bin:/bin', LC_ALL: 'C' } }); assert.equal(r.status, 0, 'Scoped policy operation failed; output suppressed'); return r.stdout; };
function trusted(path, privateFile = false) {
  let current = '';
  for (const part of path.split('/').filter(Boolean)) { current += '/' + part; const s = lstatSync(current); assert.ok(s.uid === 0 && !s.isSymbolicLink() && !(s.mode & 0o022), 'Untrusted policy path'); }
  const s = lstatSync(path); assert.ok(s.isFile() && s.nlink === 1 && (!privateFile || (s.mode & 0o777) === 0o600), 'Untrusted policy file');
}
function write(path, bytes, mode = 0o600) { const fd = openSync(path, 'wx', mode); try { fchmodSync(fd, mode); writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); } }
function sync(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function replace(path, bytes, mode) { const temp = path + '.self-mcp-next'; write(temp, bytes, mode); renameSync(temp, path); sync(path.slice(0, path.lastIndexOf('/'))); }
function requireAbsent(path) { try { lstatSync(path); throw Error('Previous policy attempt exists; reconcile before retry'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
export function amend(config) {
  assert.equal(config.apps.length, 10, 'Installed application inventory changed');
  assert.ok(config.apps.every(app => !Object.hasOwn(app, 'selfMcpApi')), 'Self policy already configured');
  const next = structuredClone(config), matches = next.apps.filter(app => app.name === 'kestrek' && app.uid === 982);
  assert.equal(matches.length, 1, 'Exact KešTrek UID required'); matches[0].selfMcpApi = true;
  const oldRules = generateRules(config), newRules = generateRules(next);
  const allowance = '    ip daddr 127.0.0.1 tcp dport 3164 counter accept\n';
  assert.equal(newRules.split(allowance).length, 2, 'Exactly one narrow allowance required');
  assert.equal(newRules.replace(allowance, ''), oldRules, 'Unrelated boundary rules changed');
  return next;
}
function probe(uid, address, port, allowed) {
  const script = `const s=require('node:net').connect({host:${JSON.stringify(address)},port:${port}});s.setTimeout(3000);s.on('connect',()=>{s.destroy();process.exit(${allowed ? 0 : 1});});s.on('error',e=>process.exit(${allowed ? '1' : "['EHOSTUNREACH','EACCES','EPERM'].includes(e.code)?0:1"}));s.on('timeout',()=>{s.destroy();process.exit(1);});`;
  run('/usr/sbin/runuser', ['-u', uid === 982 ? 'developed-kestrek' : 'developed-vocabulum', '--', NODE, '-e', script]);
}
export function verifyLive() {
  probe(982, '127.0.0.1', 3164, true);
  for (const port of [3124, 3167, 3141, 3143]) probe(982, '127.0.0.1', port, false);
  probe(982, '::1', 3164, false); probe(985, '127.0.0.1', 3164, false);
  return { self3164: true, old3124Denied: true, siblingAndControlDenied: true, ipv6Denied: true, otherAppDenied: true };
}
export async function execute(mode) {
  assert.ok(process.getuid() === 0 && ['--stage', '--apply', '--verify'].includes(mode), 'Reviewed root policy mode required');
  const source = fileURLToPath(new URL('./uid-network-boundary.mjs', import.meta.url));
  for (const path of [fileURLToPath(import.meta.url), source, GENERATOR, LOADER, NODE]) trusted(path);
  trusted(CONFIG, true);
  assert.equal(sha(readFileSync(LOADER)), pins.loader, 'Installed loader drift');
  assert.equal(run('/usr/bin/systemctl', ['is-active', 'developed-uid-boundary.service']).trim(), 'active');
  if (mode === '--stage') {
    const old = readFileSync(CONFIG), oldGenerator = readFileSync(GENERATOR), newGenerator = readFileSync(source), loader = readFileSync(LOADER);
    assert.equal(sha(old), pins.config, 'Installed policy drift'); assert.equal(sha(oldGenerator), pins.generator, 'Installed generator drift');
    const prior = await import(pathToFileURL(GENERATOR).href);
    const config = JSON.parse(old); assert.equal(prior.generateRules(config), generateRules(config), 'Generator changes old policy behavior');
    const next = Buffer.from(JSON.stringify(amend(config), null, 2) + '\n');
    const backupParent = lstatSync('/var/backups');
    assert.ok(backupParent.isDirectory() && !backupParent.isSymbolicLink() && backupParent.uid === 0 && !(backupParent.mode & 0o022), 'Unsafe backup parent');
    requireAbsent(BACKUP); mkdirSync(BACKUP, { mode: 0o700 });
    write(BACKUP + '/config-before.json', old); write(BACKUP + '/config-next.json', next);
    write(BACKUP + '/generator-before.mjs', oldGenerator); write(BACKUP + '/uid-network-boundary.mjs', newGenerator);
    // The existing loader implementation is preserved byte-for-byte. Its
    // exported --check path runs against staged config/generator before install.
    write(BACKUP + '/load-uid-boundary.mjs', loader);
    const staged = await import(pathToFileURL(BACKUP + '/load-uid-boundary.mjs').href);
    const checked = staged.loadBoundary(JSON.parse(next)); assert.equal(checked.applied, false); assert.equal(checked.replaced, true);
    write(BACKUP + '/nft-before.json', run('/usr/sbin/nft', ['-j', 'list', 'table', 'inet', 'developed_uid_boundary']));
    const proof = { ...pins, nextConfig: sha(next), nextGenerator: sha(newGenerator), apps: config.apps.length };
    write(BACKUP + '/verified.json', JSON.stringify(proof) + '\n'); sync(BACKUP);
    return { staged: true, mutatedPolicy: false, ...proof };
  }
  for (const name of ['config-before.json', 'config-next.json', 'generator-before.mjs', 'uid-network-boundary.mjs', 'load-uid-boundary.mjs', 'verified.json']) trusted(BACKUP + '/' + name, true);
  const proof = JSON.parse(readFileSync(BACKUP + '/verified.json'));
  for (const key of Object.keys(pins)) assert.equal(proof[key], pins[key]);
  const before = readFileSync(BACKUP + '/config-before.json'), next = readFileSync(BACKUP + '/config-next.json'), oldGenerator = readFileSync(BACKUP + '/generator-before.mjs'), newGenerator = readFileSync(BACKUP + '/uid-network-boundary.mjs');
  assert.equal(sha(before), pins.config); assert.equal(sha(oldGenerator), pins.generator);
  assert.equal(sha(next), proof.nextConfig); assert.equal(sha(newGenerator), proof.nextGenerator);
  assert.equal(sha(readFileSync(source)), proof.nextGenerator); assert.equal(sha(readFileSync(BACKUP + '/load-uid-boundary.mjs')), pins.loader);
  assert.deepEqual(JSON.parse(next), amend(JSON.parse(before)), 'Staged policy differs from exact amendment');
  if (mode === '--verify') {
    assert.equal(sha(readFileSync(CONFIG)), proof.nextConfig); assert.equal(sha(readFileSync(GENERATOR)), proof.nextGenerator);
    return { verified: true, ...verifyLive() };
  }
  requireAbsent(BACKUP + '/attempt.json');
  assert.equal(sha(readFileSync(CONFIG)), pins.config); assert.equal(sha(readFileSync(GENERATOR)), pins.generator);
  write(BACKUP + '/attempt.json', JSON.stringify({ startedAt: new Date().toISOString(), ...proof }) + '\n'); sync(BACKUP);
  try {
    replace(GENERATOR, newGenerator, 0o644); replace(CONFIG, next, 0o600);
    run(NODE, [LOADER, '--check']); run('/usr/bin/systemctl', ['reload', 'developed-uid-boundary.service']);
    const result = verifyLive();
    write(BACKUP + '/applied.json', JSON.stringify({ completed: true, ...proof, ...result }) + '\n'); sync(BACKUP);
    return { applied: true, ...result };
  } catch {
    // Restore only if current bytes are precisely one of this transaction's
    // own versions. Never overwrite another operator's intervention.
    assert.ok([pins.config, proof.nextConfig].includes(sha(readFileSync(CONFIG))) && [pins.generator, proof.nextGenerator].includes(sha(readFileSync(GENERATOR))), 'Policy drift during failed amendment; manual reconciliation required');
    replace(GENERATOR, oldGenerator, 0o644); replace(CONFIG, before, 0o600);
    run(NODE, [LOADER, '--check']); run('/usr/bin/systemctl', ['reload', 'developed-uid-boundary.service']);
    throw Error('Self MCP amendment failed; original policy restored; do not replay attempt');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assert.equal(process.argv.length, 3); console.log(JSON.stringify(await execute(process.argv[2]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
