// Reviewed phases must be explicitly invoked one at a time. Never changes Caddy.
import assert from 'node:assert/strict';
import { readFileSync,lstatSync,existsSync,mkdirSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,symlinkSync,linkSync,readdirSync,readlinkSync,chownSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { apps,bindPath,networkPath,directory,sha,extendBindPolicy } from './prepare-footer-candidates.mjs';
const node='/opt/developed-runtimes/node-v22.23.2/bin/node';
const build='/home/openclaw/ecosystem-footer-build-iZcGAh';
export const pins={
 vocabulum:{old:'305dd90d192a994aa0567af03ef8dbc15923946e',payload:'d37f24c6013f7aa7739b1e2b72e309781396d5244979783907ba84dc4b09c463',dependencies:'093b1105788080d95eb864dffa30036b0aab53f038fae3a6fa2d38fb2bf3f487'},
 airsoft:{old:'9f6737af7a2f618514cb80a1bda1bdd33ddb8346',payload:'f100ad5c076f9695605b1ea2d17ca696c18736c2f5151ddc54b2de6423345abb',dependencies:'2a038e466c99903732e9d4cdbd0a84ecd811dec3bbf12da434b9c96ff2dc9330'},
};
export function safeRelative(path){assert.ok(typeof path==='string'&&path.length>0&&!path.startsWith('/')&&!path.split('/').some(p=>!p||p==='.'||p==='..')&&!/[\0\r\n]/.test(path));}
export function validateManifest(value,app){
 const pin=pins[app.slug];assert.equal(value.app,app.slug);assert.equal(sha(JSON.stringify(value.files)),pin.payload);assert.equal(sha(JSON.stringify(value.dependencies)),pin.dependencies);
 for(const [kind,entries]of[['payload',value.files],['dependencies',value.dependencies]]){
  const seen=new Set();for(const [path,type,hash]of entries){safeRelative(path);assert.ok(!seen.has(path));seen.add(path);
   assert.ok(type==='file'||kind==='dependencies'&&type==='link');if(type==='file')assert.match(hash,/^[a-f0-9]{64}$/);else assert.ok(!hash.startsWith('/')&&!hash.includes('\0'));
  }
 }return value;
}
export function hardenCandidateUnit(original){
 assert.ok(original.includes('InaccessiblePaths=') && !original.includes('# FOOTER DETERMINISTIC TAILSCALE MASK'));
 return original+'\n# FOOTER DETERMINISTIC TAILSCALE MASK\n[Unit]\nAfter=tailscaled.service\n[Service]\nInaccessiblePaths=/run/tailscale\n';
}
function trusted(path){let at='';for(const part of path.split('/').filter(Boolean)){at+='/'+part;const s=lstatSync(at);assert.ok(s.uid===0&&!(s.mode&0o022)&&!s.isSymbolicLink(),'Untrusted operator/recovery path');}}
function run(path,args,input){const r=spawnSync(path,args,{input,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});assert.ok(!r.error&&!r.signal&&r.status===0,'Operation failed; output withheld; inspect exact phase privately');return r.stdout;}
function system(args){return run('/usr/bin/systemctl',args);}
function sync(path){const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function write(path,bytes,mode=0o600){const fd=openSync(path,'wx',mode);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}const s=lstatSync(path);assert.ok(s.uid===0&&s.nlink===1&&(s.mode&0o777)===mode);sync(dirname(path));}
function receipt(name,value){write(`${directory}/${name}.json`,JSON.stringify(value));}
function proof(){trusted(directory);const value=JSON.parse(readFileSync(`${directory}/proof.json`));assert.equal(value.preparedOnly,true);assert.deepEqual(value.apps,apps);return value;}
function unchangedServing(){for(const a of apps){assert.equal(system(['show',`developed-${a.slug}-green.service`,'-p','MainPID','--value']).trim(),String(a.pid));assert.equal(system(['is-active',`developed-${a.slug}-green.service`]).trim(),'active');}}
function checkpoint(){unchangedServing();return {caddy:sha(readFileSync('/etc/caddy/Caddyfile')),network:sha(readFileSync(networkPath)),environments:Object.fromEntries(apps.map(a=>[a.slug,sha(readFileSync(`/etc/developed-accounts/host-env-staging/${a.slug}.central.env`))]))};}
function verifyCheckpoint(before){unchangedServing();assert.deepEqual(checkpoint(),before,'Unrelated route/packet policy changed');}
function noListener(port){assert.equal(run('/usr/bin/ss',['-H','-ltn',`sport = :${port}`]).trim(),'','Candidate listener occupied');}
export function assertInactiveUnenabled(state){assert.equal(state.MainPID,'0');assert.equal(state.ActiveState,'inactive');assert.ok(['static','disabled'].includes(state.UnitFileState));for(const key of ['WantedBy','RequiredBy','TriggeredBy','PartOf'])assert.equal(state[key],'');}
function inactiveUnenabled(name){const state=Object.fromEntries(system(['show',name,'-p','MainPID,ActiveState,UnitFileState,WantedBy,RequiredBy,TriggeredBy,PartOf']).trim().split('\n').map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));assertInactiveUnenabled(state);return state;}
function prepare(app){const value=proof();const original=value.units.find(x=>x.name===`developed-${app.slug}-footer.service`);assert.ok(original);const staged=readFileSync(`${directory}/${original.name}`);assert.equal(sha(staged),original.sha256);
 const bytes=Buffer.from(hardenCandidateUnit(staged.toString('utf8'))),unit={...original,originalSha256:original.sha256,sha256:sha(bytes)};return {value,unit,bytes};}
export function inventory(root,relative='',skipCache=false){const entries=[];for(const name of readdirSync(root+'/'+relative).sort()){
 const path=relative?relative+'/'+name:name;if(skipCache&&path==='.next/cache')continue;const full=root+'/'+path,s=lstatSync(full);assert.ok(s.uid===0&&!(s.mode&0o022)||s.isSymbolicLink()&&s.uid===0,'Installed file owner/mode');
 if(s.isDirectory())entries.push(...inventory(root,path,skipCache));else if(s.isSymbolicLink())entries.push([path,'link',readlinkSync(full)]);else{assert.ok(s.isFile());entries.push([path,'file',sha(readFileSync(full))]);}}
 return entries.sort(([a],[b])=>a.localeCompare(b,'en'));
}
function install(app){
 const before=checkpoint(),{unit,bytes}=prepare(app),pin=pins[app.slug];
 const release=`/opt/developed-apps/${app.slug}/releases/${app.revision}`,old=`/opt/developed-apps/${app.slug}/releases/${pin.old}`,cache=`/var/cache/developed-${app.slug}-footer`,destination=`/etc/systemd/system/${unit.name}`;
 for(const path of [release,cache,destination])assert.ok(!existsSync(path),'Target already exists; reconcile partial install');
 assert.equal(system(['show',unit.name,'-p','LoadState','--value']).trim(),'not-found','Candidate unit already exists');
 noListener(app.port);trusted(old);trusted(dirname(release));trusted('/etc/systemd/system');
 const manifest=validateManifest(JSON.parse(readFileSync(`${build}/${app.slug}-full-manifest.json`)),app);
 assert.deepEqual(inventory(old+'/node_modules'),manifest.dependencies,'Immutable source dependencies changed');
 const guard='/opt/developed-control/central-runtime-v1/assert-central-runtime.mjs';trusted(guard);
 const guardSource=readFileSync(guard,'utf8');assert.ok(!/3161|3162|green\.service|releases\//.test(guardSource),'Unexpected old runtime pin');
 write(`${directory}/${app.slug}-hardened.service`,bytes);
 receipt(`${app.slug}-hardened-unit`,{originalStagedSha256:unit.originalSha256,derivedSha256:unit.sha256,originalProofPreserved:true,tailscaleMask:'required-directory',orderingOnly:true});
 receipt(`${app.slug}-install-attempt`,{before,revision:app.revision,unitSha256:unit.sha256,guardSha256:sha(guardSource)});
 mkdirSync(release,{mode:0o555});sync(dirname(release));
 for(const [path,type,hash]of manifest.files){assert.equal(type,'file');const data=readFileSync(`${build}/${app.slug}/${path}`);assert.equal(sha(data),hash,'Build bytes changed');
  mkdirSync(dirname(release+'/'+path),{recursive:true,mode:0o555});write(release+'/'+path,data,0o444);
 }
 mkdirSync(release+'/node_modules',{mode:0o555});
 for(const [path,type,expected]of manifest.dependencies){const from=old+'/node_modules/'+path,to=release+'/node_modules/'+path;mkdirSync(dirname(to),{recursive:true,mode:0o555});
  if(type==='file'){const stat=lstatSync(from);assert.ok(stat.isFile()&&!stat.isSymbolicLink());assert.equal(sha(readFileSync(from)),expected);linkSync(from,to);}
  else{assert.equal(readlinkSync(from),expected);assert.ok(resolve(dirname(from),expected).startsWith(old+'/node_modules/'),'Dependency link escapes root');symlinkSync(expected,to);}
 }
 assert.deepEqual(inventory(release+'/node_modules'),manifest.dependencies);
 const payload=inventory(release).filter(([p])=>!p.startsWith('node_modules/'));assert.deepEqual(payload,manifest.files);
 mkdirSync(cache,{mode:0o700});chownSync(cache,app.uid,app.gid);symlinkSync(cache,release+'/.next/cache');
 const installed={revision:app.revision,payload:manifest.files,dependencies:manifest.dependencies,cache:{path:'.next/cache',target:cache,uid:app.uid,gid:app.gid,mode:'0700'},unitSha256:unit.sha256,guardSha256:sha(guardSource)};
 write(release+'/release-manifest.json',JSON.stringify(installed),0o444);sync(release);
 write(destination,bytes,0o644);run('/usr/bin/systemd-analyze',['verify',destination]);system(['daemon-reload']);
 inactiveUnenabled(unit.name);verifyCheckpoint(before);
 receipt(`${app.slug}-installed`,{revision:app.revision,manifestSha256:sha(readFileSync(release+'/release-manifest.json')),unitSha256:unit.sha256,started:false});
}
function reconcileVocStatic(){
 const app=apps.find(a=>a.slug==='vocabulum'),{value,unit,bytes}=prepare(app),release=`/opt/developed-apps/vocabulum/releases/${app.revision}`;
 assert.ok(!existsSync(`${directory}/vocabulum-installed.json`));assert.ok(!existsSync(`${directory}/bind-attempt.json`));assert.ok(!existsSync(`${directory}/vocabulum-start-attempt.json`));
 const attempt=JSON.parse(readFileSync(`${directory}/vocabulum-install-attempt.json`)),hardened=JSON.parse(readFileSync(`${directory}/vocabulum-hardened-unit.json`));
 assert.equal(attempt.revision,app.revision);assert.equal(attempt.unitSha256,unit.sha256);assert.equal(hardened.originalStagedSha256,unit.originalSha256);assert.equal(hardened.derivedSha256,unit.sha256);
 verifyCheckpoint(attempt.before);assert.equal(sha(readFileSync(bindPath)),value.bindBeforeSha256);noListener(app.port);assert.equal(inactiveUnenabled(unit.name).UnitFileState,'static');
 trusted(release);trusted('/etc/systemd/system/'+unit.name);const text=readFileSync(release+'/release-manifest.json'),manifest=JSON.parse(text);
 assert.equal(manifest.revision,app.revision);validateManifest({app:app.slug,files:manifest.payload,dependencies:manifest.dependencies},app);
 assert.deepEqual(inventory(release+'/node_modules'),manifest.dependencies);assert.deepEqual(inventory(release,'',true).filter(([p])=>!p.startsWith('node_modules/')&&p!=='release-manifest.json'),manifest.payload);
 assert.deepEqual(manifest.cache,{path:'.next/cache',target:'/var/cache/developed-vocabulum-footer',uid:985,gid:979,mode:'0700'});assert.equal(readlinkSync(release+'/.next/cache'),manifest.cache.target);
 const cache=lstatSync(manifest.cache.target);assert.ok(cache.isDirectory()&&!cache.isSymbolicLink()&&cache.uid===985&&cache.gid===979&&(cache.mode&0o777)===0o700);
 assert.equal(manifest.unitSha256,unit.sha256);assert.deepEqual(readFileSync('/etc/systemd/system/'+unit.name),bytes);assert.equal(manifest.guardSha256,attempt.guardSha256);assert.equal(sha(readFileSync('/opt/developed-control/central-runtime-v1/assert-central-runtime.mjs')),attempt.guardSha256);
 run('/usr/bin/systemd-analyze',['verify','/etc/systemd/system/'+unit.name]);verifyCheckpoint(attempt.before);inactiveUnenabled(unit.name);
 receipt('vocabulum-installed',{revision:app.revision,manifestSha256:sha(text),unitSha256:unit.sha256,started:false,reconciledStatic:true});
}
function bind(){const before=checkpoint(),p=proof();for(const a of apps){assert.ok(existsSync(`${directory}/${a.slug}-installed.json`));noListener(a.port);}
 const old=readFileSync(bindPath),proposed=readFileSync(`${directory}/bind-proposed.json`);assert.equal(sha(old),p.bindBeforeSha256);assert.equal(sha(proposed),p.bindProposedSha256);assert.deepEqual(JSON.parse(proposed),extendBindPolicy(JSON.parse(old)));
 const wrapper='/opt/developed-control/network/bind-boundary.mjs';trusted(wrapper);trusted(bindPath);
 const checker=new URL('./footer-bind-check.mjs',import.meta.url).pathname;trusted(checker);
 run('/usr/bin/unshare',['--net',node,checker,'--namespace','before']);
 receipt('bind-attempt',{before,old:p.bindBeforeSha256,proposed:p.bindProposedSha256});
 const temporary='/etc/developed-accounts/footer-bind-proposed.json';assert.ok(!existsSync(temporary));write(temporary,proposed);renameSync(temporary,bindPath);sync(dirname(bindPath));
 // Existing wrapper performs one atomic inner-map replacement, preserving both attachments.
 run(node,[wrapper,'--apply']);assert.equal(sha(readFileSync(bindPath)),p.bindProposedSha256);
 run('/usr/bin/unshare',['--net',node,checker,'--namespace','after']);verifyCheckpoint(before);receipt('bind-installed',{sha256:p.bindProposedSha256,oldOwnerBindsPreserved:true,newOwnerBindsPassed:true,unrelatedUidNewPortDenials:true,probeNetwork:'disconnected'});
}
async function start(app){const before=checkpoint(),{value,unit}=prepare(app);assert.ok(existsSync(`${directory}/bind-installed.json`));assert.equal(sha(readFileSync(bindPath)),value.bindProposedSha256);noListener(app.port);
 assert.equal(system(['show',unit.name,'-p','MainPID','--value']).trim(),'0');assert.equal(system(['show',unit.name,'-p','ActiveState','--value']).trim(),'inactive');
 const release=`/opt/developed-apps/${app.slug}/releases/${app.revision}`,record=JSON.parse(readFileSync(`${directory}/${app.slug}-installed.json`)),text=readFileSync(release+'/release-manifest.json');assert.equal(sha(text),record.manifestSha256);const installed=JSON.parse(text);
 assert.deepEqual(inventory(release+'/node_modules'),installed.dependencies);assert.deepEqual(inventory(release,'',true).filter(([p])=>!p.startsWith('node_modules/')&&p!=='release-manifest.json'),installed.payload);
 assert.equal(readlinkSync(release+'/.next/cache'),installed.cache.target);assert.equal(sha(readFileSync('/etc/systemd/system/'+unit.name)),unit.sha256);
 assert.equal(sha(readFileSync('/opt/developed-control/central-runtime-v1/assert-central-runtime.mjs')),installed.guardSha256);
 receipt(`${app.slug}-start-attempt`,{before,revision:app.revision});system(['start',unit.name]);const pid=Number(system(['show',unit.name,'-p','MainPID','--value']).trim());assert.ok(pid>0);
 const status=readFileSync(`/proc/${pid}/status`,'utf8');assert.match(status,new RegExp(`^Uid:\\s+${app.uid}\\s+${app.uid}\\s+${app.uid}\\s+${app.uid}$`,'m'));assert.match(status,new RegExp(`^Gid:\\s+${app.gid}\\s+${app.gid}\\s+${app.gid}\\s+${app.gid}$`,'m'));
 const probe=new URL('./footer-candidate-probe.mjs',import.meta.url).pathname;trusted(probe);
 run('/usr/bin/nsenter',['--target',String(pid),'--mount','--','/usr/bin/setpriv',`--reuid=${app.uid}`,`--regid=${app.gid}`,'--clear-groups',node,probe,app.slug]);
 let ready=false;for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${app.port}/${app.slug==='airsoft'?'sk/login':'login'}`,{redirect:'manual',signal:AbortSignal.timeout(2000)});const body=await r.text();if(r.status===200&&body.includes(`/report-bug/${app.slug}?platform=web`)){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'Unrouted candidate readiness failed');
 const listeners=run('/usr/bin/ss',['-H','-ltnp']).split('\n').filter(line=>line.includes(`pid=${pid},`));
 assert.equal(listeners.length,1,'Candidate must own exactly one TCP listener');assert.ok(listeners[0].includes(`127.0.0.1:${app.port} `),'Candidate listener identity mismatch');
 verifyCheckpoint(before);assert.equal(system(['show',unit.name,'-p','NRestarts','--value']).trim(),'0');receipt(`${app.slug}-started`,{pid,uid:app.uid,gid:app.gid,port:app.port,publicRouteChanged:false});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{assert.equal(process.getuid(),0);trusted(new URL(import.meta.url).pathname);const [mode,slug]=process.argv.slice(2),app=apps.find(a=>a.slug===slug);
 assert.ok(['--bind','--reconcile-voc-static'].includes(mode)&&process.argv.length===3||['--install','--start'].includes(mode)&&app&&process.argv.length===4);
 if(mode==='--reconcile-voc-static')reconcileVocStatic();else if(mode==='--bind')bind();else if(mode==='--install')install(app);else await start(app);console.log('Exact footer candidate phase completed; public routes unchanged.');
}catch{console.error('Footer phase stopped; inspect exact protected attempt/partial state, reconcile read-only, do not retry automatically.');process.exitCode=1;}}
