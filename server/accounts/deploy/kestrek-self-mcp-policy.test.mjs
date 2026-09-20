import test from 'node:test';
import assert from 'node:assert/strict';
import { amend, execute } from './kestrek-self-mcp-policy.mjs';
import { generateRules } from './uid-network-boundary.mjs';
const fixture = () => ({ version: 1, centralUid: 988, caddyUid: 999, blockedNetworks: [], apps: Array.from({ length: 10 }, (_, n) => ({ name: n === 8 ? 'kestrek' : `fixture-${n}`, uid: n === 8 ? 982 : 700 + n, database: [], dns: [{ address: '127.0.0.53', port: 53 }] })) });
test('preserves every existing field/app and adds exactly Ke UID982 selfIPv4:3164', () => {
  const old = fixture(), next = amend(old), restored = structuredClone(next);
  delete restored.apps[8].selfMcpApi; assert.deepEqual(restored, old); assert.ok(!Object.hasOwn(old.apps[8], 'selfMcpApi'));
  const rules = generateRules(next), allowance = '    ip daddr 127.0.0.1 tcp dport 3164 counter accept\n';
  assert.equal(rules.replace(allowance, ''), generateRules(old));
  assert.match(rules, /# kestrek: UID 982\n[^]*?tcp dport 3164 counter accept\n    fib daddr type local/);
});
test('refuses inventory/UID drift, preexisting option, or additional exception', () => {
  for (const mutate of [c => c.apps.pop(), c => c.apps[8].uid = 700, c => c.apps[8].name = 'other', c => c.apps[0].selfMcpApi = false, c => c.apps[8].selfMcpApi = true]) {
    const config = fixture(); mutate(config); assert.throws(() => amend(config));
  }
});
test('unprivileged policy modes cannot stage/install/reload', { skip: process.getuid() === 0 }, async () => {
  for (const mode of ['--stage', '--apply', '--verify']) await assert.rejects(execute(mode), /Reviewed root policy mode required/);
});
