// Binds only inside a newly disconnected network namespace; cgroup BPF still applies.
import assert from 'node:assert/strict';
import { readFileSync,readlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { apps,directory,extendBindPolicy } from './prepare-footer-candidates.mjs';
export function bindMatrix(before,uid,phase){assert.ok(['before','after'].includes(phase));const expected=phase==='after'?extendBindPolicy(before):before;
 const owner=expected.apps.find(a=>a.uid===uid);assert.ok(owner);
 return [...before.apps.find(a=>a.uid===uid).tcpLoopbackPorts.map(port=>({host:'127.0.0.1',port,allowed:true})),
  ...apps.flatMap(a=>[{host:'127.0.0.1',port:a.port,allowed:owner.tcpLoopbackPorts.includes(a.port)},{host:'::1',port:a.port,allowed:false}])];
}
async function checkBind(item){await new Promise((resolve,reject)=>{const server=createServer();server.once('error',e=>!item.allowed&&['EPERM','EACCES'].includes(e.code)?resolve():reject(new Error('Bind result differs from exact policy')));
 server.listen({host:item.host,port:item.port},()=>server.close(()=>item.allowed?resolve():reject(new Error('Unauthorized listener succeeded'))));
});}
export function assertNamespaceProof(actual,proof){assert.match(proof.host,/^net:\[\d+\]$/);assert.match(proof.isolated,/^net:\[\d+\]$/);assert.notEqual(proof.isolated,proof.host,'Fresh disconnected network namespace required');assert.equal(actual,proof.isolated,'Child namespace differs from pinned parent');}
async function main(){const mode=process.argv[2];
 if(mode==='--probe'){assert.equal(process.argv.length,3);const input=JSON.parse(readFileSync(0,'utf8'));assertNamespaceProof(readlinkSync('/proc/self/ns/net'),input.namespace);assert.equal(process.getuid(),input.uid);assert.equal(process.getgid(),input.gid);assert.ok(process.getgroups().every(gid=>gid===input.gid));for(const item of input.matrix)await checkBind(item);return;}
 assert.equal(process.getuid(),0);assert.equal(mode,'--namespace');assert.equal(process.argv.length,4);const phase=process.argv[3];assert.ok(['before','after'].includes(phase));
 const namespace={host:readlinkSync('/proc/1/ns/net'),isolated:readlinkSync('/proc/self/ns/net')};assertNamespaceProof(namespace.isolated,namespace);
 assert.equal(spawnSync('/usr/sbin/ip',['link','set','lo','up'],{stdio:'ignore'}).status,0);
 const before=JSON.parse(readFileSync(`${directory}/bind-before.json`));
 const passwd=readFileSync('/etc/passwd','utf8').split('\n').filter(Boolean).map(line=>line.split(':'));
 for(const owner of before.apps){const entry=passwd.find(row=>Number(row[2])===owner.uid);assert.ok(entry);const gid=Number(entry[3]);
  const result=spawnSync('/usr/bin/setpriv',[`--reuid=${owner.uid}`,`--regid=${gid}`,'--clear-groups',process.execPath,new URL(import.meta.url).pathname,'--probe'],
   {input:JSON.stringify({uid:owner.uid,gid,namespace,matrix:bindMatrix(before,owner.uid,phase)}),encoding:'utf8',timeout:15000,env:{PATH:'/usr/bin:/bin'}});
  assert.ok(!result.error&&!result.signal&&result.status===0,'Actual-UID bind matrix failed; details withheld');
 }
 console.log(`Disconnected ${phase} bind matrix passed for every retained protected UID.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Disconnected footer bind check refused; no host listener or packet policy changed.');process.exitCode=1;});
