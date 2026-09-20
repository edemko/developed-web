// Root operator/boot loader. Only this application's named nft table is touched.
import { readFileSync, lstatSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { generateRules, TABLE } from './uid-network-boundary.mjs';

export const CONFIG='/etc/developed-accounts/uid-network-boundary.json';

export function assertTrusted(path,stat=lstatSync) {
  let current=resolve(path),first=true;
  for(;;) {
    const info=stat(current);
    if(info.uid!==0 || (info.mode & 0o022)!==0 || info.isSymbolicLink()
      || (first?!info.isFile():!info.isDirectory())) throw new Error('Untrusted boundary file or ancestor');
    if(current==='/') return;
    current=dirname(current);first=false;
  }
}

function execute(args,input) {
  let temporary;
  try {
    if(input!==undefined) {
      // Node's spawned stdin is a socket on this host; nft -f rejects it as
      // non-regular. Use a private regular file, never a shell or shared /tmp.
      const base='/run/developed-uid-boundary', info=lstatSync(base);
      if(info.uid!==0 || !info.isDirectory() || info.isSymbolicLink() || (info.mode&0o077)!==0) throw new Error('Private boundary runtime directory required');
      temporary=mkdtempSync(base+'/transaction-');
      writeFileSync(temporary+'/rules.nft',input,{mode:0o600,flag:'wx'});
      args=args.map(arg=>arg==='-'?temporary+'/rules.nft':arg);
    }
    const result=spawnSync('/usr/sbin/nft',args,{encoding:'utf8',timeout:10000,
      maxBuffer:1024*1024,env:{PATH:'/usr/sbin:/usr/bin',LC_ALL:'C'}});
    if(result.error || result.signal) throw new Error('Boundary nft operation did not complete');
    return result;
  } finally {
    if(temporary) {unlinkSync(temporary+'/rules.nft');rmdirSync(temporary);}
  }
}

export function loadBoundary(config,{apply=false,run=execute}={}) {
  // Inspect only the exact owned table; never interpret a permissions error as
  // an absent table and never flush the host ruleset.
  const listed=run(['list','table','inet',TABLE]);
  let replace;
  if(listed.status===0) replace=true;
  else if(listed.status===1 && /No such file or directory/.test(listed.stderr||'')) replace=false;
  else throw new Error('Cannot establish existing boundary table state');
  const rules=generateRules(config,{replace});
  if(run(['--check','--file','-'],rules).status!==0) throw new Error('Boundary syntax/transaction check failed');
  if(apply && run(['--file','-'],rules).status!==0) throw new Error('Atomic boundary installation failed');
  return {applied:apply,replaced:replace,apps:config.apps.length,table:TABLE};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.getuid()!==0 || process.argv.slice(2).some(arg=>!['--check','--apply'].includes(arg))
      || process.argv.length!==3) throw new Error('Usage: root load-uid-boundary.mjs --check|--apply');
    for(const path of [CONFIG,fileURLToPath(import.meta.url),fileURLToPath(new URL('./uid-network-boundary.mjs',import.meta.url)),process.execPath]) assertTrusted(path);
    const config=JSON.parse(readFileSync(CONFIG,'utf8'));
    console.log(JSON.stringify(loadBoundary(config,{apply:process.argv[2]==='--apply'})));
  } catch(error) {
    // Do not emit nft's full output, environment, file contents or stack traces.
    console.error(error instanceof SyntaxError?'Invalid boundary JSON':error.message);
    process.exitCode=1;
  }
}
