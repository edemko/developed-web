import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTrusted,loadBoundary } from './load-uid-boundary.mjs';

const config=()=>({version:1,centralUid:61001,caddyUid:61002,blockedNetworks:[],
  apps:[{name:'myclinic',uid:61003,database:[],dns:[{address:'127.0.0.53',port:53}]}]});
const file=(directory=false,patch={})=>({uid:0,mode:directory?0o755:0o644,
  isSymbolicLink:()=>false,isFile:()=>!directory,isDirectory:()=>directory,...patch});

test('every path component must be root-owned and non-writable to other identities',()=>{
  const trusted=path=>file(path!=='/opt/boundary/load.mjs');
  assert.doesNotThrow(()=>assertTrusted('/opt/boundary/load.mjs',trusted));
  for(const bad of [{uid:1000},{mode:0o775},{mode:0o666},{isSymbolicLink:()=>true}]) {
    assert.throws(()=>assertTrusted('/opt/boundary/load.mjs',path=>path==='/opt'?file(true,bad):trusted(path)));
    assert.throws(()=>assertTrusted('/opt/boundary/load.mjs',path=>path.endsWith('.mjs')?file(false,bad):trusted(path)));
  }
});
test('check-only never changes tables, first installation and replacement are atomic',()=>{
  for(const exists of [false,true]) for(const apply of [false,true]) {
    const calls=[];
    const result=loadBoundary(config(),{apply,run:(args,input)=>{
      calls.push({args,input});
      return args[0]==='list'&&!exists?{status:1,stderr:'No such file or directory'}:{status:0};
    }});
    assert.equal(result.applied,apply);assert.equal(result.replaced,exists);
    assert.equal(calls.length,apply?3:2);
    const rules=calls[1].input;
    assert(rules.includes(`${exists?'delete':'create'} table inet developed_uid_boundary`));
    assert(!rules.includes('flush '));
    if(apply) assert.equal(calls[2].input,rules);
  }
});
test('permission, inspection, validation or apply failure never silently succeeds',()=>{
  for(const failPhase of [0,1,2]) {
    let phase=0;
    assert.throws(()=>loadBoundary(config(),{apply:true,run:()=>phase++===failPhase?
      {status:1,stderr:'Operation not permitted'}:{status:0}}));
    assert.equal(phase,failPhase+1);
  }
});
