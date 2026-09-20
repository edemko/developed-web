// Exact two-upstream handoff; independently gated stage and one-shot apply.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync,lstatSync,readlinkSync,mkdirSync,openSync,writeFileSync,fsyncSync,fchmodSync,closeSync,renameSync,existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';

export const sourceHash='3f49a9a881a51683a787d103d191911bb9bb842c058116fb2d846b04751b8a9c';
export const operatorPath='/opt/developed-control/footer-routes-v1/route-footer-candidates.mjs';
export const backup='/var/backups/developed-footer-routes-20260920';
const directory='/var/backups/developed-footer-candidates-20260920';
const live='/etc/caddy/Caddyfile',temporary='/etc/caddy/Caddyfile.developed-footer-next';
export const apps=[
 {slug:'vocabulum',uid:985,gid:979,oldPort:3161,port:3171,pid:4056033,revision:'5833953287ee51be6b35225e87b88dfef69d2d97',host:'vocabulum.developed.sk',login:'/login'},
 {slug:'airsoft',uid:986,gid:980,oldPort:3162,port:3172,pid:3542385,revision:'1fcb452cf8bcb11505ad5250ac4d1ab55e06b57f',host:'amp.developed.sk',login:'/sk/login'},
];
export const replacements=apps.map(a=>['127.0.0.1:'+a.oldPort,'127.0.0.1:'+a.port,[a.host]]);
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function replaceExact(source){
 let candidate=source;
 for(const[from,to]of replacements){assert.equal(candidate.split(from).length,2,'Exactly one old upstream required');assert.ok(!candidate.includes(to),'Candidate upstream already present');candidate=candidate.replace(from,to);}
 let restored=candidate;for(const[from,to]of replacements)restored=restored.replace(to,from);
 assert.equal(restored,source,'Unrelated source bytes changed');return candidate;
}
export function merge(source){assert.equal(sha(source),sourceHash,'Serving human portal source drift');return replaceExact(source);}
export function verifyAdapted(before,after){
 const expected=structuredClone(before),counts=new Map(replacements.map(([from])=>[from,0]));
 for(const server of Object.values(expected.apps.http.servers))for(const route of server.routes){
  const hosts=route.match?.[0]?.host??[];
  const walk=value=>{if(!value||typeof value!=='object')return;
   for(const[key,item]of Object.entries(value)){const found=replacements.find(([from])=>from===item);
    if(found){const[from,to,allowed]=found;assert.equal(key,'dial');assert.deepEqual([...hosts].sort(),[...allowed].sort());value[key]=to;counts.set(from,counts.get(from)+1);}else walk(item);
   }
  };walk(route);
 }
 for(const count of counts.values())assert.equal(count,1,'Expected exactly one dial per product');
 // Both inputs use stdin: no filename-dependent hide entries need normalization.
 assert.deepEqual(after,expected,'Unrelated adapted configuration changed');
}
function run(command,args,input){
 const r=spawnSync(command,args,{input,encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024});
 assert.ok(!r.error&&!r.signal&&r.status===0,'Route check failed; output suppressed');return r.stdout;
}
export const adaptText=input=>JSON.parse(run('/usr/bin/caddy',['adapt','--adapter','caddyfile','--config','-'],input));
function trusted(path,kind){
 let at='';for(const part of path.split('/').filter(Boolean)){at+='/'+part;const s=lstatSync(at);assert.ok(s.uid===0&&!(s.mode&0o022)&&!s.isSymbolicLink(),'Untrusted operator path');}
 const s=lstatSync(path);
 if(kind==='private')assert.ok(s.isFile()&&s.nlink===1&&(s.mode&0o777)===0o600,'Unsafe receipt');
 if(kind==='directory')assert.ok(s.isDirectory()&&(s.mode&0o777)===0o700,'Unsafe evidence directory');
 return s;
}
function sync(path){const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function write(path,bytes,mode=0o600){
 const fd=openSync(path,'wx',mode);try{fchmodSync(fd,mode);writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}sync(dirname(path));
}
function privateRead(path){trusted(path,'private');return readFileSync(path,'utf8');}
function jsonWrite(name,value){write(backup+'/'+name+'.json',JSON.stringify(value)+'\n');}
function state(name,pid){
 const values=Object.fromEntries(run('/usr/bin/systemctl',['show',name,'-p','MainPID,ActiveState,SubState,NRestarts']).trim().split('\n').map(line=>line.split('=')));
 assert.deepEqual(values,{MainPID:String(pid),ActiveState:'active',SubState:'running',NRestarts:'0'},'Serving process changed');
}
function stableServices(){
 for(const a of apps)state('developed-'+a.slug+'-green.service',a.pid);
 state('developed-accounts.service',3197193);state('developed-accounts-mail-worker.service',700440);state('caddy.service',862);
}
export function verifyStarted(app,started,installed,attempt,manifest){
 for(const key of ['uid','gid','port','revision'])assert.equal(started[key],app[key]);
 assert.ok(Number.isSafeInteger(started.pid)&&started.pid>1&&started.pid!==app.pid);assert.equal(started.publicRouteChanged,false);
 for(const value of [installed,attempt,manifest])assert.equal(value.revision,app.revision);
 assert.equal(installed.started,false);assert.equal(attempt.before.caddy,sourceHash);
}
function qualify(){
 trusted(directory,'directory');stableServices();
 const evidence={},listeners=run('/usr/bin/ss',['-H','-ltnp']).trim().split('\n');
 for(const app of apps){
  const receipts=Object.fromEntries(['started','installed','start-attempt'].map(name=>[name,privateRead(directory+'/'+app.slug+'-'+name+'.json')]));
  const started=JSON.parse(receipts.started),installed=JSON.parse(receipts.installed),attempt=JSON.parse(receipts['start-attempt']);
  const release='/opt/developed-apps/'+app.slug+'/releases/'+app.revision,manifestPath=release+'/release-manifest.json';trusted(manifestPath);
  const bytes=readFileSync(manifestPath);assert.equal(sha(bytes),installed.manifestSha256);verifyStarted(app,started,installed,attempt,JSON.parse(bytes));
  const unitPath='/etc/systemd/system/developed-'+app.slug+'-footer.service';trusted(unitPath);assert.equal(sha(readFileSync(unitPath)),installed.unitSha256);
  state('developed-'+app.slug+'-footer.service',started.pid);assert.equal(readlinkSync('/proc/'+started.pid+'/cwd'),release,'Candidate release mismatch');
  const status=readFileSync('/proc/'+started.pid+'/status','utf8');
  for(const[field,id]of[['Uid',app.uid],['Gid',app.gid]])assert.match(status,new RegExp('^'+field+':\\s+'+id+'\\s+'+id+'\\s+'+id+'\\s+'+id+'$','m'));
  const owned=listeners.filter(line=>line.includes('pid='+started.pid+','));assert.equal(owned.length,1);assert.ok(owned[0].includes('127.0.0.1:'+app.port+' '));
  evidence[app.slug]={pid:started.pid,revision:app.revision,receipts:Object.fromEntries(Object.entries(receipts).map(([name,value])=>[name,sha(value)]))};
 }
 return evidence;
}
async function probe(publicProducts=false){
 for(const app of apps)for(const origin of ['http://127.0.0.1:'+app.port,...(publicProducts?['https://'+app.host]:[])]){
  const r=await fetch(origin+app.login,{redirect:'manual',signal:AbortSignal.timeout(10000)}),text=await r.text();assert.equal(r.status,200);
  assert.ok(text.includes('/report-bug/'+app.slug+'?platform=web')&&text.includes('/developed-logo.png'),'Candidate footer readiness failed');
 }
}
export function verifyApproval(value,proof){
 assert.deepEqual(value,{sourceSha256:sourceHash,candidateSha256:proof.candidateSha256,operatorSha256:proof.operatorSha256,proofSha256:sha(JSON.stringify(proof)+'\n'),twoRouteSwitchApproved:true});
}
function verifyCandidate(source,candidate){
 assert.equal(candidate,merge(source));verifyAdapted(adaptText(source),adaptText(candidate));
 run('/usr/bin/caddy',['validate','--adapter','caddyfile','--config',backup+'/candidate.Caddyfile']);
}
export async function execute(mode){
 assert.equal(process.getuid(),0);assert.ok(['--stage','--apply'].includes(mode));
 assert.equal(fileURLToPath(import.meta.url),operatorPath,'Install reviewed operator at exact immutable root path');
 const operatorStat=trusted(operatorPath);assert.ok(operatorStat.isFile()&&operatorStat.nlink===1&&!(operatorStat.mode&0o222));
 const liveStat=trusted(live);assert.ok(liveStat.isFile()&&liveStat.nlink===1&&(liveStat.mode&0o777)===0o644);
 const operatorSha256=sha(readFileSync(operatorPath)),candidates=qualify();await probe();
 const original=readFileSync(live,'utf8'),candidate=merge(original);
 const proof={sourceSha256:sourceHash,candidateSha256:sha(candidate),operatorSha256,candidates,twoDialsOnly:true,humanPortalPreserved:true};
 if(mode==='--stage'){
  trusted('/var/backups');mkdirSync(backup,{mode:0o700});sync('/var/backups');trusted(backup,'directory');
  write(backup+'/before.Caddyfile',original);write(backup+'/candidate.Caddyfile',candidate);verifyCandidate(original,candidate);
  assert.equal(readFileSync(live,'utf8'),original);assert.deepEqual(qualify(),candidates);jsonWrite('prepared',proof);
  return {staged:true,applied:false,candidateSha256:proof.candidateSha256};
 }
 trusted(backup,'directory');
 assert.ok(!existsSync(backup+'/apply-attempt.json')&&!existsSync(backup+'/applied.json'),'Already attempted; read-only reconciliation required');
 assert.equal(privateRead(backup+'/before.Caddyfile'),original);assert.equal(privateRead(backup+'/candidate.Caddyfile'),candidate);
 assert.equal(privateRead(backup+'/prepared.json'),JSON.stringify(proof)+'\n');verifyApproval(JSON.parse(privateRead(backup+'/approval.json')),proof);
 verifyCandidate(original,candidate);assert.ok(!existsSync(temporary),'Unexpected pending candidate');
 await probe();assert.deepEqual(qualify(),candidates);assert.equal(readFileSync(live,'utf8'),original,'Source drift before attempt');
 // Exclusive durable receipt prevents concurrent apply and retry after any later failure.
 jsonWrite('apply-attempt',{...proof,attemptedAt:new Date().toISOString()});write(temporary,candidate,0o644);
 assert.equal(readFileSync(live,'utf8'),original,'Source drift before install');renameSync(temporary,live);sync('/etc/caddy');
 run('/usr/bin/systemctl',['reload','caddy.service']);assert.equal(sha(readFileSync(live)),proof.candidateSha256);
 assert.deepEqual(qualify(),candidates);await probe(true);jsonWrite('applied',{...proof,appliedAt:new Date().toISOString(),oldUnitsStillRunning:true});
 return {applied:true,candidateSha256:proof.candidateSha256};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{assert.equal(process.argv.length,3);console.log(JSON.stringify(await execute(process.argv[2])));}
 catch{console.error('Footer route phase stopped. Inspect protected evidence read-only; no automatic retry or rollback.');process.exitCode=1;}
}
