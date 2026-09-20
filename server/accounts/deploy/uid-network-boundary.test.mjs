import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRules,validateConfig,TABLE } from './uid-network-boundary.mjs';

export const fixtureConfig=()=>({version:1,centralUid:61001,caddyUid:61002,
  blockedNetworks:['11.77.0.0/16','2003:77::/48'],extraControlEndpoints:[{address:'172.30.40.2',port:9999}],
  apps:[{name:'mega-music',uid:61003,database:[{address:'127.0.0.1',port:5432},{address:'172.30.40.3',port:5432}],
    dns:[{address:'127.0.0.53',port:53},{address:'::1',port:53}],musicImport:{address:'127.0.0.1',port:8787}},
  {name:'vocabulum',uid:61004,database:[],dns:[{address:'127.0.0.53',port:53}]}]});

test('dedicated table, both NAT sides, exact endpoints and reply-direction only',()=>{
  const output=generateRules(fixtureConfig());
  assert(output.includes(`table inet ${TABLE}`));assert(!/^\s*flush /m.test(output));
  assert.match(output,/hook output priority -150/);assert.match(output,/hook output priority 50/);
  assert.match(output,/ct direction reply ct state established accept/);
  assert(!/^\s*ct state established.*accept/m.test(output));
  assert.match(output,/ip daddr 127\.0\.0\.1 tcp dport 5432/);
  assert.match(output,/ip daddr 172\.30\.40\.3 tcp dport 5432/);
  assert.match(output,/fib daddr type local/);assert.match(output,/ip6 daddr 2000::\/3 tcp dport 443/);
  assert(!output.includes('tcp dport 80 '));assert(!output.includes('hook forward'));
  assert.match(output,/meta skuid != \{ 0, 61001, 61002 \}/);
});
test('atomic replacement affects only the dedicated table and requires it to exist',()=>{
  const output=generateRules(fixtureConfig(),{replace:true});
  assert(output.includes(`delete table inet ${TABLE}\ntable inet ${TABLE}`));
  assert(!output.includes('flush ruleset'));
});
test('reject ambiguous identities, broad exceptions, malformed input and unknown keys',()=>{
  const bad=[
    config=>config.apps[0].uid=0,config=>config.apps[0].uid=1000,
    config=>config.apps[0].uid=65534,config=>config.apps[0].uid='61003',
    config=>config.apps[0].uid=61001,config=>config.apps[1].uid=61003,
    config=>config.centralUid=config.caddyUid,
    config=>config.apps[0].database[0].port=6543,
    config=>config.apps[0].database[0].address='127.0.0.0/8',
    config=>config.apps[0].database[0].address='localhost',
    config=>config.apps[0].dns[0].address='fe80::1%eth0',
    config=>config.apps[0].dns=[],config=>config.apps[1].musicImport={address:'127.0.0.1',port:8787},
    config=>config.apps[0].name='bad"; flush ruleset',
    config=>config.blockedNetworks=['0.0.0.0/0'],config=>config.apps[0].allowAll=true,
    config=>config.apps=[],config=>config.extraControlEndpoints=[{address:'127.0.0.1',port:5432}],
  ];
  for(const mutate of bad) {const config=fixtureConfig();mutate(config);assert.throws(()=>validateConfig(config));}
});
