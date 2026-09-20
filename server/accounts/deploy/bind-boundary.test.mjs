import test from 'node:test';
import assert from 'node:assert/strict';
import { endianness } from 'node:os';
import { encodePolicy,assertTrusted } from './bind-boundary.mjs';

const policy=()=>({version:1,protectedPorts:[3140,3141,3161,18088],apps:[
  {name:'central',uid:61041,tcpLoopbackPorts:[3140],udpEphemeral:false},
  {name:'product',uid:61042,tcpLoopbackPorts:[3161],udpEphemeral:true},
]});
const encode=value=>encodePolicy(value,'32768\t60999\n');
test('bounded native wire policy preserves exact UID/port/UDP permissions',()=>{
  const output=encode(policy());
  const get=offset=>endianness()==='LE'?output.readUInt32LE(offset):output.readUInt32BE(offset);
  assert.equal(output.length,152); assert.equal(get(0),1);assert.equal(get(4),2);
  assert.equal(get(8),61041);assert.equal(get(12),0);assert.equal(get(16),3140);
  assert.equal(get(80),61042);assert.equal(get(84),1);assert.equal(get(88),3161);
  assert.equal(get(148),0);
});
test('rejects malformed fields and unsafe identities',()=>{
  for(const uid of [0,1000,65534,-1,1.5,2147483648,'61041']) {
    const p=policy();p.apps[0].uid=uid;assert.throws(()=>encode(p));
  }
  const p=policy();p.apps[1].uid=p.apps[0].uid;assert.throws(()=>encode(p));
  p.apps[1].uid=61042;p.extra=true;assert.throws(()=>encode(p));
});
test('fixed impersonation targets and allowed listener ports stay below autobind range',()=>{
  for(const port of [0,80,32768,65535,'3140']) {
    const p=policy();p.protectedPorts.push(port);assert.throws(()=>encode(p));
  }
  assert.throws(()=>encodePolicy(policy(),'3000 60999'));
  assert.throws(()=>encodePolicy(policy(),'32768 32767'));
  const p=policy();p.apps[0].tcpLoopbackPorts=[3142];assert.throws(()=>encode(p));
});
test('rejects shared fixed ports and permits explicit no-listener workers',()=>{
  const p=policy();p.apps[1].tcpLoopbackPorts=[3140];assert.throws(()=>encode(p));
  p.apps[1].tcpLoopbackPorts=[];assert.doesNotThrow(()=>encode(p));
});
test('never trusts writable, symlinked or non-root operator paths',()=>{
  const stat=(overrides={})=>({uid:0,mode:0o755,isSymbolicLink:()=>false,
    isFile:()=>true,isDirectory:()=>true,...overrides});
  assert.doesNotThrow(()=>assertTrusted('/opt/control/file',()=>stat()));
  for(const bad of [{uid:1000},{mode:0o777},{isSymbolicLink:()=>true}]) {
    assert.throws(()=>assertTrusted('/opt/control/file',path=>stat(path==='/opt'?bad:{})));
  }
});
