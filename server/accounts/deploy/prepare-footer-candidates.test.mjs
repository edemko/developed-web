import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { apps, extendBindPolicy, candidateUnit } from './prepare-footer-candidates.mjs';
const policy=()=>({version:1,protectedPorts:[3161,3162,3140],apps:[
  {name:'vocabulum',uid:985,tcpLoopbackPorts:[3161],udpEphemeral:true},
  {name:'airsoft',uid:986,tcpLoopbackPorts:[3162],udpEphemeral:true},
  {name:'central',uid:988,tcpLoopbackPorts:[3140],udpEphemeral:true},
]});
test('adds only own-UID3171/3172 and global reservation, preserves every other byte-equivalent field',()=>{
 const before=policy(),after=extendBindPolicy(before);assert.deepEqual(before,policy());
 assert.deepEqual(after.apps[0].tcpLoopbackPorts,[3161,3171]);assert.deepEqual(after.apps[1].tcpLoopbackPorts,[3162,3172]);
 assert.deepEqual(after.apps[2],before.apps[2]);assert.deepEqual(after.protectedPorts,[3161,3162,3140,3171,3172]);
 for(const mutate of [p=>p.apps[0].uid=986,p=>p.apps[1].tcpLoopbackPorts.push(3172),p=>p.protectedPorts.push(3171),p=>p.apps.shift()]){
  const bad=policy();mutate(bad);assert.throws(()=>extendBindPolicy(bad));
 }
});
test('candidate unit preserves effective original sandbox and central guard; only final release/cache/listener overrides',()=>{
 for(const app of apps){const old=`[Unit]\nRequires=bind-boundary.service\n[Service]\nUser=developed-${app.slug}\nGroup=developed-${app.slug}\nProtectSystem=strict\nExecStartPre=/opt/developed-runtimes/node-v22.23.2/bin/node /opt/developed-control/central-runtime-v1/assert-central-runtime.mjs ${app.slug}\nEnvironmentFile=/etc/developed-accounts/host-env-staging/${app.slug}.central.env\n`;
 const unit=candidateUnit(old,app);assert.ok(unit.startsWith(old));assert.match(unit,new RegExp(`--hostname 127.0.0.1 --port ${app.port}`));
 assert.ok(unit.includes(`CacheDirectory=developed-${app.slug}-footer`));assert.equal(unit.split('EnvironmentFile=').length,2);
 assert.ok(!unit.includes('EnvironmentFile=-'));assert.throws(()=>candidateUnit(old.replace('ProtectSystem=strict','ProtectSystem=no'),app));
 const dir=mkdtempSync(join(tmpdir(),'footer-unit-test-'));try{const path=join(dir,`developed-${app.slug}-footer.service`);
  writeFileSync(path,unit.replace(/^ExecStartPre=.*$/gm,'ExecStartPre=/usr/bin/true').replace(/^ExecStart=.+$/gm,'ExecStart=/usr/bin/true'));
  const verified=spawnSync('/usr/bin/systemd-analyze',['verify',path],{encoding:'utf8'});assert.equal(verified.status,0,verified.stderr);
 }finally{rmSync(dir,{recursive:true});}
 }
});
test('preparation operator has no live apply, reload, start or credential copying phase',()=>{
 const source=readFileSync(new URL('./prepare-footer-candidates.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("['--stage']"));assert.doesNotMatch(source,/\['(?:start|restart|reload|enable|daemon-reload)'|--apply|nft|copyFileSync/);
 assert.ok(source.includes("privateWrite(`${directory}/bind-before.json`,original)"));
});
