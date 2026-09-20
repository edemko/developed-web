// Preparation only: root-private proposed bind map and units, never live apply/start.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export const apps = [
  { slug:'vocabulum', uid:985, gid:979, oldPort:3161, port:3171, pid:4056033, revision:'5833953287ee51be6b35225e87b88dfef69d2d97' },
  { slug:'airsoft', uid:986, gid:980, oldPort:3162, port:3172, pid:3542385, revision:'1fcb452cf8bcb11505ad5250ac4d1ab55e06b57f' },
];
export const bindPath='/etc/developed-accounts/bind-boundary.json';
export const networkPath='/etc/developed-accounts/uid-network-boundary.json';
export const directory='/var/backups/developed-footer-candidates-20260920';
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function extendBindPolicy(before) {
  const after=structuredClone(before);
  for(const app of apps) {
    const entries=after.apps.filter(entry=>entry.uid===app.uid && entry.name===app.slug);
    assert.equal(entries.length,1);assert.deepEqual(entries[0].tcpLoopbackPorts,[app.oldPort]);
    assert.ok(!after.protectedPorts.includes(app.port));
    assert.ok(!after.apps.some(entry=>entry.tcpLoopbackPorts.includes(app.port)));
    entries[0].tcpLoopbackPorts.push(app.port);after.protectedPorts.push(app.port);
  }
  // Removing exactly the four additions must reproduce all original settings.
  const restored=structuredClone(after);
  for(const app of apps) {
    restored.apps.find(entry=>entry.uid===app.uid).tcpLoopbackPorts.pop();
    restored.protectedPorts=restored.protectedPorts.filter(port=>port!==app.port);
  }
  assert.deepEqual(restored,before);return after;
}
export function candidateUnit(existing, app) {
  assert.ok(apps.includes(app));
  assert.ok(existing.includes(`User=developed-${app.slug}`) && existing.includes(`Group=developed-${app.slug}`));
  assert.ok(existing.includes('Requires=bind-boundary.service') && existing.includes('ProtectSystem=strict'));
  assert.ok(existing.includes(`/opt/developed-control/central-runtime-v1/assert-central-runtime.mjs ${app.slug}`));
  assert.ok(existing.includes(`/etc/developed-accounts/host-env-staging/${app.slug}.central.env`));
  // Existing fragments remain byte-for-byte. Only these final overrides differ;
  // the original EnvironmentFile reset, startup guard and sandbox still apply.
  return existing+`\n[Unit]\nDescription=DevelopED ${app.slug} footer candidate\n[Service]\nWorkingDirectory=/opt/developed-apps/${app.slug}/releases/${app.revision}\nExecStart=\nExecStart=/opt/developed-runtimes/node-v22.23.2/bin/node /opt/developed-apps/${app.slug}/releases/${app.revision}/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${app.port}\nEnvironment=PORT=${app.port}\nCacheDirectory=\nCacheDirectory=developed-${app.slug}-footer\nCacheDirectoryMode=0700\nSocketBindAllow=\nSocketBindAllow=ipv4:tcp:${app.port}\n`;
}
function command(args) {
  const result=spawnSync('/usr/bin/systemctl',args,{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,'Unit metadata unavailable');return result.stdout;
}
function trusted(path) {
  let at='';for(const part of path.split('/').filter(Boolean)){at+='/'+part;const stat=lstatSync(at);assert.ok(stat.uid===0 && !(stat.mode&0o022) && !stat.isSymbolicLink());}
}
function privateWrite(path,value) {
  const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,value);fsyncSync(fd);}finally{closeSync(fd);}
  const stat=lstatSync(path);assert.ok(stat.uid===0 && stat.nlink===1 && (stat.mode&0o777)===0o600);
}
function sync(path){const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
export function stage() {
  assert.equal(process.getuid(),0);trusted(new URL(import.meta.url).pathname);
  for(const path of [bindPath,networkPath,'/etc/caddy/Caddyfile'])trusted(path);
  const original=readFileSync(bindPath), network=readFileSync(networkPath), caddy=readFileSync('/etc/caddy/Caddyfile');
  assert.equal(sha(original),'dce4e0c60a83eb26d17ccd2710f97c96120572f654044715792371679b6ac6b0','Bind policy drift; review before restaging');
  const proposed=extendBindPolicy(JSON.parse(original)), units=[];
  const sockets=spawnSync('/usr/bin/ss',['-H','-ltn','sport = :3171 or sport = :3172'],{encoding:'utf8',timeout:10000});
  assert.equal(sockets.status,0);assert.equal(sockets.stdout.trim(),'','Candidate port occupied');
  for(const app of apps) {
    const name=`developed-${app.slug}-green.service`;
    const state=Object.fromEntries(command(['show',name,'-p','MainPID,ActiveState,NRestarts']).trim().split('\n').map(line=>line.split('=')));
    assert.deepEqual(state,{MainPID:String(app.pid),NRestarts:'0',ActiveState:'active'});
    // Capture effective fragment contents privately; do not emit unit/env values.
    const paths=command(['show',name,'-p','FragmentPath,DropInPaths']).trim().split('\n').flatMap(line=>line.slice(line.indexOf('=')+1).split(' ')).filter(Boolean);
    paths.forEach(trusted);
    const existing=command(['cat','--no-pager',name]);
    units.push({name:`developed-${app.slug}-footer.service`,text:candidateUnit(existing,app),sourceSha256:sha(existing)});
  }
  trusted('/var/backups');mkdirSync(directory,{mode:0o700});sync('/var/backups');
  privateWrite(`${directory}/bind-before.json`,original);
  privateWrite(`${directory}/bind-proposed.json`,JSON.stringify(proposed,null,2)+'\n');
  for(const unit of units)privateWrite(`${directory}/${unit.name}`,unit.text);
  privateWrite(`${directory}/proof.json`,JSON.stringify({version:1,preparedOnly:true,apps,bindBeforeSha256:sha(original),
    bindProposedSha256:sha(JSON.stringify(proposed,null,2)+'\n'),networkSha256:sha(network),caddySha256:sha(caddy),
    units:units.map(({name,text,sourceSha256})=>({name,sha256:sha(text),sourceSha256})),envCopied:false}));sync(directory);
  assert.deepEqual(readFileSync(bindPath),original);assert.deepEqual(readFileSync(networkPath),network);assert.deepEqual(readFileSync('/etc/caddy/Caddyfile'),caddy);
  for(const app of apps) {
    assert.equal(command(['show',`developed-${app.slug}-green.service`,'-p','MainPID','--value']).trim(),String(app.pid));
    assert.equal(command(['is-active',`developed-${app.slug}-green.service`]).trim(),'active');
  }
  console.log('Root-private footer candidate plan prepared; no boundary, unit, environment or route installed/started.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{assert.deepEqual(process.argv.slice(2),['--stage']);stage();}
  catch{console.error('Footer preparation refused; inspect exact private partial state. No retry or live apply.');process.exitCode=1;}
}
