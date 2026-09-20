// Only run through the opt-in test's fresh mount/net/PID namespaces.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { maskInside, SOURCE, SOCKET, DIRECTORY } from './seal-tailscale-runtime-sockets.mjs';
assert.equal(process.getuid(), 0); assert.equal(process.pid, 1);
assert.deepEqual(fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2).filter(x => x.includes(':')).map(x => x.split(':')[0].trim()), ['lo']);
// Outer unshare made every inherited mount private before any fixture mount.
assert.ok(!fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').some(x => / shared:| master:/.test(x)));
const mount = args => execFileSync('/usr/bin/mount', args, { stdio: ['ignore', 'pipe', 'pipe'] });
// Remove only this fresh namespace's inherited /run mounts, never the host's.
execFileSync('/usr/bin/umount', ['--recursive', '/run'], { stdio: ['ignore', 'pipe', 'pipe'] });
mount(['-t', 'tmpfs', '-o', 'mode=755', 'tmpfs', '/run']);
fs.mkdirSync(DIRECTORY, { mode: 0o755 }); fs.mkdirSync(SOURCE, { recursive: true, mode: 0o755 });
let host = net.createServer(s => s.destroy());
const fileSource = net.createServer(s => s.destroy());
await new Promise(resolve => host.listen(SOCKET, resolve));
await new Promise(resolve => fileSource.listen('/run/systemd/inaccessible/sock', resolve)); fs.chmodSync('/run/systemd/inaccessible/sock', 0);
fs.chmodSync(SOCKET, 0o666); fs.chmodSync(SOURCE, 0);
fs.writeFileSync('/run/ordinary-file', 'before');
mount(['--make-shared', '/run']);
const childCode = `const fs=require('node:fs');process.stdout.write('ready\\n');process.stdin.once('data',b=>{const c=JSON.parse(b);try{if(c.fileMask){const cp=require('node:child_process');cp.execFileSync('/usr/bin/mount',['--make-private','/run']);cp.execFileSync('/usr/bin/mount',['--bind','/run/systemd/inaccessible/sock','/run/tailscale/tailscaled.sock']);if(c.mask)(${maskInside.toString()})(c);process.stdout.write('done\\n')}else if(c.mask){(${maskInside.toString()})(c);process.stdout.write('done\\n')}else process.stdout.write('done\\n')}catch{process.stdout.write('failed\\n')}});setInterval(()=>{},10000);`;
const children = [];
function nextLine(child) { return new Promise((resolve, reject) => { let text=''; const onData=b=>{text+=b;if(text.includes('\n')){child.stdout.off('data',onData);resolve(text.trim())}}; child.stdout.on('data',onData); child.once('error',reject); }); }
async function launch() { const child = spawn('/usr/bin/unshare', ['--mount', '--propagation', 'unchanged', process.execPath, '-e', childCode], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(child); assert.equal(await nextLine(child), 'ready'); return child; }
const identity = p => { const s=fs.lstatSync(p);return {dev:s.dev,ino:s.ino,mode:s.mode&0o7777}; };
try {
  const target = await launch(), peer = await launch(), oldFileMask = await launch(), overlay = await launch();
  const parentMounts = fs.readFileSync('/proc/self/mountinfo', 'utf8'), peerMounts = fs.readFileSync(`/proc/${peer.pid}/mountinfo`, 'utf8');
  const parentSocket = identity(SOCKET), peerSocket = identity(`/proc/${peer.pid}/root${SOCKET}`);
  const group = text => text.split('\n').find(x => x.split(' ')[4] === '/run').match(/shared:(\d+)/)[1];
  assert.equal(group(parentMounts), group(peerMounts)); assert.equal(group(parentMounts), group(fs.readFileSync(`/proc/${target.pid}/mountinfo`, 'utf8')));
  const done = nextLine(target); target.stdin.write(JSON.stringify({ mask: true, ns: fs.readlinkSync(`/proc/${target.pid}/ns/mnt`), source: SOURCE, target: DIRECTORY, sourceIdentity: identity(SOURCE), targetIdentity: identity(DIRECTORY) }));
  assert.equal(await done, 'done');
  const oldDone = nextLine(oldFileMask);oldFileMask.stdin.write(JSON.stringify({fileMask:true}));assert.equal(await oldDone,'done');
  const overlayDone=nextLine(overlay);overlay.stdin.write(JSON.stringify({fileMask:true,mask:true,ns:fs.readlinkSync(`/proc/${overlay.pid}/ns/mnt`),source:SOURCE,target:DIRECTORY,sourceIdentity:identity(SOURCE),targetIdentity:identity(DIRECTORY)}));assert.equal(await overlayDone,'done');
  assert.equal(fs.readFileSync('/proc/self/mountinfo', 'utf8'), parentMounts);
  assert.equal(fs.readFileSync(`/proc/${peer.pid}/mountinfo`, 'utf8'), peerMounts);
  assert.deepEqual(identity(SOCKET), parentSocket); assert.deepEqual(identity(`/proc/${peer.pid}/root${SOCKET}`), peerSocket);
  fs.writeFileSync('/run/ordinary-file', 'after'); assert.equal(fs.readFileSync(`/proc/${target.pid}/root/run/ordinary-file`, 'utf8'), 'after');
  const probe = `process.setgroups([]);process.setgid(61002);process.setuid(61002);const s=require('node:net').createConnection({path:${JSON.stringify(SOCKET)}});s.once('connect',()=>{s.destroy();process.exit(1)});s.once('error',e=>process.exit(e.code==='EACCES'?0:2));s.setTimeout(1000,()=>process.exit(3));`;
  execFileSync('/usr/bin/nsenter', ['--target', String(target.pid), '--mount', '--', process.execPath, '-e', probe], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 3000 });
  execFileSync('/usr/bin/nsenter', ['--target', String(oldFileMask.pid), '--mount', '--', process.execPath, '-e', probe], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 3000 });
  // Replacing the daemon socket must not reveal a fresh inode in the target.
  await new Promise(r=>host.close(r)); host=net.createServer(s=>s.destroy()); await new Promise(r=>host.listen(SOCKET,r));fs.chmodSync(SOCKET,0o666);
  execFileSync('/usr/bin/nsenter', ['--target', String(target.pid), '--mount', '--', process.execPath, '-e', probe], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 3000 });
  let fileMaskRecreationDenied=true;try{execFileSync('/usr/bin/nsenter',['--target',String(oldFileMask.pid),'--mount','--',process.execPath,'-e',probe],{stdio:['ignore','pipe','pipe'],timeout:3000})}catch(error){assert.equal(error.status,1,'Original file-mask failure must be a successful connect, not timeout/error');fileMaskRecreationDenied=false;}
  assert.equal(fileMaskRecreationDenied,false);
  execFileSync('/usr/bin/nsenter',['--target',String(overlay.pid),'--mount','--',process.execPath,'-e',probe],{stdio:['ignore','pipe','pipe'],timeout:3000});
  assert.deepEqual(identity(`/proc/${peer.pid}/root${SOCKET}`),identity(SOCKET));
  assert.equal(fs.readFileSync(`/proc/${peer.pid}/mountinfo`, 'utf8'),peerMounts);
  console.log(JSON.stringify({sharedPeersInitially:true,targetDenied:true,parentSocketUnchanged:true,peerSocketUnchanged:true,ordinaryFileUpdatesVisible:true,parentMountsUnchanged:true,peerMountsUnchanged:true,socketRecreationStillDenied:true,fileMaskRecreationDenied,fileMaskRecreationConnectExit:1,overlayRecreationStillDenied:true}));
} finally { for (const child of children) { child.kill('SIGKILL'); await once(child,'exit').catch(()=>{}); } await new Promise(r=>host.close(r));await new Promise(r=>fileSource.close(r)); }
