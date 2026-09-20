import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRules,validateConfig,TABLE } from './uid-network-boundary.mjs';

export const fixtureConfig=()=>({version:1,centralUid:61001,caddyUid:61002,
  blockedNetworks:['11.77.0.0/16','2003:77::/48'],extraControlEndpoints:[{address:'172.30.40.2',port:9999}],
  apps:[{name:'mega-music',uid:61003,database:[{address:'127.0.0.1',port:5432},{address:'172.30.40.3',port:5432}],
    dns:[{address:'127.0.0.53',port:53},{address:'::1',port:53}],musicImport:{address:'127.0.0.1',port:18887}},
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
test('opt-in forwarded control denial has no UID trust exemption or unrelated forwarding changes',()=>{
  const config=fixtureConfig();config.protectForwardedControl=true;
  const output=generateRules(config);
  assert.match(output,/type filter hook forward priority -150; policy accept/);
  assert.match(output,/type filter hook prerouting priority -150; policy accept/);
  assert.match(output,/type filter hook forward priority 50; policy accept/);
  const forwarded=output.slice(output.indexOf('chain forward_control_before_dnat'));
  assert.match(forwarded,/ip daddr 172\.30\.40\.2 tcp dport 9999 counter reject/);
  assert(!forwarded.includes('skuid'));assert(!forwarded.includes('tcp dport 5432'));
  config.protectForwardedControl='yes';assert.throws(()=>validateConfig(config));
});
test('only reviewed JASOM direct-media worker gets public HTTP after private exclusions',()=>{
  const config=fixtureConfig();config.apps.push({name:'jasom-worker',uid:61008,database:[],
    dns:[{address:'127.0.0.53',port:53}],publicHttp:true});
  const output=generateRules(config), worker=output.slice(output.indexOf('# jasom-worker'));
  assert(worker.indexOf('ip daddr 127.0.0.0/8')<worker.indexOf('tcp dport 80 counter accept'));
  assert.match(worker,/ip6 daddr 2000::\/3 tcp dport 80 counter accept/);
  for(const bad of ['yes',80,null]) {config.apps[2].publicHttp=bad;assert.throws(()=>validateConfig(config));}
  config.apps[2].publicHttp=true;config.apps[2].name='jasom-web';assert.throws(()=>validateConfig(config));
});
test('only exact worker dependencies and the trusted download relay can reach raw proxy',()=>{
  const config=fixtureConfig();config.downloadRelayUid=61006;
  config.apps.push({name:'mega-youtube',uid:61007,database:[],dns:[{address:'127.0.0.53',port:53}],
    downloadRelay:{address:'127.0.0.1',port:1088},downloadStatus:{address:'127.0.0.1',port:18088},
    downloadProvider:{address:'127.0.0.1',port:4416}});
  const output=generateRules(config);
  for(const port of [1088,18088,4416]) assert(output.includes(`ip daddr 127.0.0.1 tcp dport ${port} counter accept`));
  assert(output.includes('ip daddr 127.0.0.1 tcp dport 1089 meta skuid != { 0, 61006 }'));
  assert(output.includes('ip6 daddr ::1 tcp dport 1089 meta skuid != { 0, 61006 }'));
  assert.match(output,/chain download_relay \{[\s\S]*?127\.0\.0\.1 tcp dport 1089 counter accept[\s\S]*?127\.0\.0\.53.*?53 counter accept[\s\S]*?counter reject/);
  assert.match(output,/meta skuid 61006 jump download_relay/);
  for(const mutate of [
    c=>delete c.downloadRelayUid,c=>c.downloadRelayUid=61001,c=>c.downloadRelayUid=61007,
    c=>c.apps[2].name='vocabulum-worker',c=>c.apps[2].name='jasom-worker',
    c=>c.apps[2].downloadRelay.port=1089,c=>c.apps[2].downloadStatus.address='172.30.40.2',
    c=>c.apps[0].musicImport.port=8787,
  ]) {const bad=structuredClone(config);mutate(bad);assert.throws(()=>validateConfig(bad));}
  const jasom=structuredClone(config);jasom.apps[2].name='jasom-worker';delete jasom.apps[2].downloadProvider;
  assert.doesNotThrow(()=>validateConfig(jasom));
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
    config=>config.apps[0].dns=[],config=>config.apps[1].musicImport={address:'127.0.0.1',port:18887},
    config=>config.apps[0].name='bad"; flush ruleset',
    config=>config.blockedNetworks=['0.0.0.0/0'],config=>config.apps[0].allowAll=true,
    config=>config.apps=[],config=>config.extraControlEndpoints=[{address:'127.0.0.1',port:5432}],
  ];
  for(const mutate of bad) {const config=fixtureConfig();mutate(config);assert.throws(()=>validateConfig(config));}
});
test('fixed front/status helpers get only their single private upstream and replies',()=>{
  const config=fixtureConfig();config.importFrontUid=61009;config.downloadStatusUid=61010;
  const output=generateRules(config);
  assert.match(output,/chain import_front \{[\s\S]*?127\.0\.0\.1 tcp dport 8787 counter accept\n    counter reject/);
  assert.match(output,/chain download_status \{[\s\S]*?127\.0\.0\.1 tcp dport 1088 counter accept\n    counter reject/);
  assert.match(output,/meta skuid 61009 jump import_front/);
  assert.match(output,/meta skuid 61010 jump download_status/);
  config.importFrontUid=61003;assert.throws(()=>validateConfig(config));
  config.importFrontUid=61010;assert.throws(()=>validateConfig(config));
});
