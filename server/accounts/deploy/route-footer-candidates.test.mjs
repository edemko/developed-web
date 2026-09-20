import test from'node:test';import assert from'node:assert/strict';import{verifyAdapted,merge,replacements,replaceExact,adaptText,verifyApproval,verifyStarted,apps,sourceHash,sha}from'./route-footer-candidates.mjs';
import {spawnSync} from 'node:child_process';
function fixture(){return{apps:{http:{servers:{srv0:{listen:[':80'],routes:[...replacements.map(([dial,,host])=>({match:[{host}],handle:[{handler:'reverse_proxy',upstreams:[{dial}]}]})),{match:[{host:['www.developed.sk','test.developed.sk']}],handle:[{handler:'static_response',body:'unchanged portal'}]}]}}}}};}
test('AST proof permits exactly two declared upstreams and no portal/listener/host changes',()=>{const before=fixture(),after=structuredClone(before);after.apps.http.servers.srv0.routes[0].handle[0].upstreams[0].dial='127.0.0.1:3171';after.apps.http.servers.srv0.routes[1].handle[0].upstreams[0].dial='127.0.0.1:3172';assert.doesNotThrow(()=>verifyAdapted(before,after));for(const mutate of[x=>x.apps.http.servers.srv0.listen.push(':81'),x=>x.apps.http.servers.srv0.routes[2].handle[0].body='changed',x=>x.apps.http.servers.srv0.routes[0].match[0].host=['other.example']]){const wrong=structuredClone(after);mutate(wrong);assert.throws(()=>verifyAdapted(before,wrong));}});
test('source merge rejects any unreviewed starting configuration',()=>assert.throws(()=>merge('unreviewed Caddyfile')));
test('opt-in current live source has exact two-dial full adaptation proof without writes',{skip:process.env.FOOTER_ROUTE_LIVE_READONLY!=='1'},()=>{
 const moduleUrl=new URL('./route-footer-candidates.mjs',import.meta.url).href;
 const script='import {readFileSync} from "node:fs";import {merge,verifyAdapted,adaptText,sha} from '+JSON.stringify(moduleUrl)+';const before=readFileSync("/etc/caddy/Caddyfile","utf8"),after=merge(before);verifyAdapted(adaptText(before),adaptText(after));console.log(JSON.stringify({sourceSha256:sha(before),candidateSha256:sha(after),fullAdaptedProof:true,liveWrites:false}));';
 const result=spawnSync('/usr/bin/sudo',['-n','/opt/developed-runtimes/node-v22.23.2/bin/node','--input-type=module','-e',script],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,'Private read-only proof failed; output suppressed');const report=JSON.parse(result.stdout);assert.equal(report.sourceSha256,sourceHash);assert.equal(report.fullAdaptedProof,true);assert.equal(report.liveWrites,false);assert.match(report.candidateSha256,/^[a-f0-9]{64}$/);
});
test('replacement preserves every byte outside the two declared strings',()=>{
 const original='# Unicode ž 雪\r\nreverse_proxy 127.0.0.1:3161\nreverse_proxy 127.0.0.1:3162\n# central portal already enabled\n';
 assert.equal(replaceExact(original),original.replace(':3161',':3171').replace(':3162',':3172'));
 for(const source of[original+'127.0.0.1:3161',original+'127.0.0.1:3172',original.replace(':3162',':3999')])assert.throws(()=>replaceExact(source));
});
test('full AST proof rejects hide-list changes and duplicate or misplaced dials',()=>{
 const before=fixture(),after=structuredClone(before);for(let i=0;i<2;i++)after.apps.http.servers.srv0.routes[i].handle[0].upstreams[0].dial=replacements[i][1];
 for(const mutate of[x=>x.apps.http.servers.srv0.routes[2].handle.push({handler:'file_server',hide:['/etc/caddy/Caddyfile']}),x=>x.apps.http.servers.srv0.routes.push(structuredClone(x.apps.http.servers.srv0.routes[0])),x=>x.apps.http.servers.srv0.routes[0].handle[0].upstreams.push({dial:'127.0.0.1:3171'})]){const changed=structuredClone(after);mutate(changed);assert.throws(()=>verifyAdapted(before,changed));}
 const wrong=structuredClone(before);wrong.apps.http.servers.srv0.routes[0].handle[0].upstreams[0]={address:'127.0.0.1:3161'};assert.throws(()=>verifyAdapted(wrong,after));
});
test('real Caddy stdin adaptation proves complete unchanged config including file hide paths',()=>{
 const source='http://vocabulum.developed.sk {\nreverse_proxy 127.0.0.1:3161\n}\nhttp://amp.developed.sk {\nreverse_proxy 127.0.0.1:3162\n}\nhttp://www.developed.sk {\nroot * /fixture\nfile_server\n}\n';
 assert.doesNotThrow(()=>verifyAdapted(adaptText(source),adaptText(replaceExact(source))));
});
test('apply approval binds exact source, candidate, operator and prepared evidence',()=>{
 const proof={candidateSha256:'a'.repeat(64),operatorSha256:'b'.repeat(64),candidates:{vocabulum:{pid:723605}}};
 const approval={sourceSha256:sourceHash,candidateSha256:proof.candidateSha256,operatorSha256:proof.operatorSha256,proofSha256:sha(JSON.stringify(proof)+'\n'),twoRouteSwitchApproved:true};
 assert.doesNotThrow(()=>verifyApproval(approval,proof));
 for(const key of Object.keys(approval)){const bad={...approval};delete bad[key];assert.throws(()=>verifyApproval(bad,proof));}
 assert.throws(()=>verifyApproval({...approval,twoRouteSwitchApproved:false},proof));assert.throws(()=>verifyApproval({...approval,extra:true},proof));
 assert.throws(()=>verifyApproval(approval,{...proof,candidates:{vocabulum:{pid:1}}}));
});
test('completion receipt requires revision, identities, separate PID, and protected install chain',()=>{
 const app=apps[0],started={uid:app.uid,gid:app.gid,port:app.port,revision:app.revision,pid:723605,publicRouteChanged:false},installed={revision:app.revision,started:false},attempt={revision:app.revision,before:{caddy:sourceHash}},manifest={revision:app.revision};
 assert.doesNotThrow(()=>verifyStarted(app,started,installed,attempt,manifest));
 for(const changes of[{revision:undefined},{uid:0},{gid:0},{port:3161},{pid:app.pid},{pid:0},{publicRouteChanged:true}])assert.throws(()=>verifyStarted(app,{...started,...changes},installed,attempt,manifest));
 assert.throws(()=>verifyStarted(app,started,installed,{...attempt,before:{caddy:'501'}},manifest));
 assert.throws(()=>verifyStarted(app,started,installed,attempt,{revision:'old'}));
});
