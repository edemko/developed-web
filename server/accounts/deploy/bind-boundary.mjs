// Root-controlled JSON -> bounded native syscall helper. No service edits.
import { lstatSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { endianness } from 'node:os';

export const CONFIG='/etc/developed-accounts/bind-boundary.json';
export const BACKEND='/opt/developed-control/network/bind-boundary-operator';
const PIN='/sys/fs/bpf/developed_bind_boundary';

function keys(value,expected) {
  if(!value || typeof value!=='object' || Array.isArray(value)
    || Object.keys(value).sort().join(',')!==expected.sort().join(',')) throw new Error('Unexpected bind-policy fields');
}
export function encodePolicy(config,range) {
  keys(config,['version','protectedPorts','apps']);
  if(config.version!==1 || !Array.isArray(config.apps) || config.apps.length<1 || config.apps.length>64) throw new Error('Invalid policy version or app count');
  const match=/^(\d+)\s+(\d+)\s*$/.exec(range.trim());
  if(!match || +match[1]<=1024 || +match[2]>65535 || +match[1]>+match[2]) throw new Error('Invalid kernel ephemeral range');
  const low=+match[1];
  const port=value=>Number.isInteger(value)&&value>=1024&&value<low;
  if(!Array.isArray(config.protectedPorts) || !config.protectedPorts.length
    || config.protectedPorts.some(value=>!port(value))
    || new Set(config.protectedPorts).size!==config.protectedPorts.length) throw new Error('Protected ports must be unique and below kernel ephemeral range');
  const uids=new Set(),names=new Set(),owners=new Set();
  const output=Buffer.alloc(8+config.apps.length*72);
  const put=(offset,value)=>endianness()==='LE'?output.writeUInt32LE(value,offset):output.writeUInt32BE(value,offset);
  put(0,1);put(4,config.apps.length);
  config.apps.forEach((app,index)=>{
    keys(app,['name','uid','tcpLoopbackPorts','udpEphemeral']);
    if(typeof app.name!=='string'||!/^[a-z][a-z0-9-]{0,47}$/.test(app.name)||names.has(app.name)) throw new Error('Invalid or duplicate app name');
    if(!Number.isInteger(app.uid)||app.uid<=0||app.uid>2147483647||[1000,65534].includes(app.uid)||uids.has(app.uid)) throw new Error('Invalid or duplicate dedicated UID');
    if(typeof app.udpEphemeral!=='boolean'||!Array.isArray(app.tcpLoopbackPorts)||app.tcpLoopbackPorts.length>16) throw new Error('Invalid bind permissions');
    if(app.tcpLoopbackPorts.some(value=>!port(value)||!config.protectedPorts.includes(value))
      ||new Set(app.tcpLoopbackPorts).size!==app.tcpLoopbackPorts.length) throw new Error('App ports must be distinct protected ports');
    for(const p of app.tcpLoopbackPorts) {
      if(owners.has(p)) throw new Error('A fixed listener port cannot belong to sibling UIDs');
      owners.add(p);
    }
    uids.add(app.uid);names.add(app.name);
    const offset=8+index*72;put(offset,app.uid);put(offset+4,Number(app.udpEphemeral));
    app.tcpLoopbackPorts.forEach((value,p)=>put(offset+8+p*4,value));
  });
  return output;
}
export function assertTrusted(path,stat=lstatSync) {
  let current=resolve(path),first=true;
  for(;;) {
    const info=stat(current);
    if(info.uid!==0 || (info.mode&0o022)!==0 || info.isSymbolicLink()
      ||(first?!info.isFile():!info.isDirectory())) throw new Error('Untrusted bind-boundary file or ancestor');
    if(current==='/') return;
    current=dirname(current); first=false;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.getuid()!==0||process.argv.length!==3||!['--check','--apply'].includes(process.argv[2])) throw new Error('Usage: root bind-boundary.mjs --check|--apply');
    for(const path of [CONFIG,BACKEND,process.execPath,fileURLToPath(import.meta.url)]) assertTrusted(path);
    const input=encodePolicy(JSON.parse(readFileSync(CONFIG,'utf8')),readFileSync('/proc/sys/net/ipv4/ip_local_port_range','utf8'));
    const mode=process.argv[2]==='--check'?'--check':existsSync(PIN)?'--replace':'--install';
    const result=spawnSync(BACKEND,[mode],{input,encoding:'utf8',timeout:10000,maxBuffer:65536,
      env:{PATH:'/usr/sbin:/usr/bin',LC_ALL:'C'}});
    if(result.error||result.signal||result.status!==0) throw new Error(`Bind boundary ${mode} failed; inspect scoped operator diagnostics: ${(result.stderr||'').slice(0,2000)}`);
    console.log(result.stdout.trim());
  } catch(error) {
    console.error(error instanceof SyntaxError?'Invalid bind-boundary JSON':error.message);process.exitCode=1;
  }
}
