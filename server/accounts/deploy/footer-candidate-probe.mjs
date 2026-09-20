// Actual-UID smoke in the candidate's mount namespace. No credentials printed.
import assert from 'node:assert/strict';
import { accessSync,constants,writeFileSync,unlinkSync,lstatSync } from 'node:fs';
import { createServer,connect } from 'node:net';
import { pathToFileURL } from 'node:url';
import { apps } from './prepare-footer-candidates.mjs';
const identities={vocabulum:[985,979],airsoft:[986,980]};
export function assertProbeIdentity(slug,uid,gid){assert.ok(Object.hasOwn(identities,slug));assert.deepEqual([uid,gid],identities[slug]);}
async function deniedConnection(port){await new Promise((resolve,reject)=>{const socket=connect({host:'127.0.0.1',port});socket.setTimeout(2000);socket.once('connect',()=>{socket.destroy();reject(new Error('Private peer reachable'));});socket.once('timeout',()=>{socket.destroy();reject(new Error('Private peer denial ambiguous'));});socket.once('error',e=>['EHOSTUNREACH','ENETUNREACH','EACCES','EPERM'].includes(e.code)?resolve():reject(new Error('Private denial not established')));});}
async function deniedBind(){await new Promise((resolve,reject)=>{const server=createServer();server.once('error',e=>e.code==='EPERM'||e.code==='EACCES'?resolve():reject(new Error('Bind denial not established')));server.listen(3199,'127.0.0.1',()=>server.close(()=>reject(new Error('Unauthorized bind succeeded'))));});}
export function assertSocketDirectory(stat){assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===0&&stat.gid===0&&(stat.mode&0o777)===0,'Tailscale directory not deterministically masked');}
async function deniedTailscaleSocket(){assertSocketDirectory(lstatSync('/run/tailscale'));
 await new Promise((resolve,reject)=>{const socket=connect({path:'/run/tailscale/tailscaled.sock'});socket.setTimeout(2000);
  socket.once('connect',()=>{socket.destroy();reject(new Error('Tailscale socket reachable'));});socket.once('timeout',()=>{socket.destroy();reject(new Error('Socket denial ambiguous'));});
  socket.once('error',e=>['EACCES','EPERM'].includes(e.code)?resolve():reject(new Error('Required directory socket denial not established')));
 });
}
async function main(){assert.equal(process.argv.length,3);const slug=process.argv[2];assertProbeIdentity(slug,process.getuid(),process.getgid());assert.ok(process.getgroups().every(g=>g===process.getgid()));
 for(const path of [`/etc/developed-accounts/host-env-staging/${slug}.central.env`,'/etc/developed-accounts/accounts.env','/home/openclaw/.ssh','/run/docker.sock']){
  let refused=false;try{accessSync(path,constants.R_OK);}catch(e){refused=['EACCES','EPERM','ENOENT'].includes(e.code);}assert.ok(refused,'Protected path accessible');
 }
 const marker=`/var/cache/developed-${slug}-footer/.footer-probe-${process.pid}`;writeFileSync(marker,'fixture-only',{mode:0o600,flag:'wx'});unlinkSync(marker);
 const app=apps.find(a=>a.slug===slug);let releaseDenied=false;
 try{accessSync(`/opt/developed-apps/${slug}/releases/${app.revision}/package.json`,constants.W_OK);}catch(e){releaseDenied=['EACCES','EPERM','EROFS'].includes(e.code);}assert.ok(releaseDenied,'Immutable release writable');
 await deniedTailscaleSocket();await deniedBind();for(const port of [8000,3141,5432,2019,9000])await deniedConnection(port);
 console.log('Candidate actual-UID cache/credential/control-peer/bind checks passed.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Candidate isolation probe failed; details withheld.');process.exitCode=1;});
