import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateRules,validateConfig } from './uid-network-boundary.mjs';
import { encodePolicy } from './bind-boundary.mjs';
import { domainProviderRules } from './domain-provider-boundary.mjs';
import { overrides,image,network,address,databaseAddress } from './domain-provider-stage.mjs';
const read = name => JSON.parse(readFileSync(new URL(name,import.meta.url)));
test('UID policy is additive, preserves every existing app permission, and protects only new exact tuples',()=>{
 const before=read('uid-network-boundary.baseline.json'), after=read('uid-network-boundary.candidate.json');
 const expected=structuredClone(before);
 expected.extraControlEndpoints.push({address:'127.0.0.1',port:3142},{address:'::1',port:3142},{address:'172.30.242.2',port:9999});
 expected.blockedNetworks.push('172.30.242.0/28');
 assert.deepEqual(after,expected);validateConfig(after);
 const rules=generateRules(after);
 for(const tuple of ['ip daddr 127.0.0.1 tcp dport 3142','ip6 daddr ::1 tcp dport 3142','ip daddr 172.30.242.2 tcp dport 9999']) {
  assert(rules.includes(tuple+' meta skuid != { 0, 988, 999 }'));
  assert(rules.includes(tuple+' counter reject'));
 }
});
test('bind policy grants no new app listeners; root Docker publication retains same mechanism',()=>{
 const before=read('bind-boundary.baseline.json'), after=read('bind-boundary.candidate.json');
 const expected=structuredClone(before);expected.protectedPorts.push(3142);
 assert.deepEqual(after,expected);
 assert.deepEqual(encodePolicy(after,'32768 60999'),encodePolicy(before,'32768 60999'));
 assert(after.apps.every(a=>!a.tcpLoopbackPorts.includes(3142)));
});
test('provider image and identity overrides are exactly scoped',()=>{
 assert.equal(image,'sha256:385184459f57569c54c25209f51f3b2be99ddd7c4ce9e3555b5d3eea8447b7cf');
 assert.deepEqual(overrides,{GOTRUE_JWT_ISSUER:'https://auth.developed.sk/auth/v1',API_EXTERNAL_URL:'https://auth.developed.sk/auth/v1'});
 assert.equal(network,'developed-auth-domain');assert.equal(address,'172.30.242.2');assert.equal(databaseAddress,'172.30.242.3');
});
test('dedicated egress tables do not alter old provider and permit only exact DB5432',()=>{
 const rules=domainProviderRules('br-fixture');
 assert(!rules.includes('172.30.241.'));assert(!rules.includes('developed_green_provider'));
 assert(rules.includes('ip saddr 172.30.242.2 ip daddr 172.30.242.3 tcp dport 5432 accept'));
 assert(rules.includes('ip daddr 172.30.242.2 tcp dport 9999 counter drop'));
 assert.throws(()=>domainProviderRules('br-test; flush ruleset'));
});
