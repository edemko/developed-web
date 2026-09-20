import test from 'node:test';
import assert from 'node:assert/strict';
import { storeInfo, tcpStates, verifyIdentity, OLD, TARGET, execute } from './kestrek-mcp-handoff.mjs';
import { RULES, verifyFenceJson } from './kestrek-handoff-fence.mjs';

const envs = () => {
  const shared = { CHATGPT_API_KEY_SHA256: 'a'.repeat(64), CHATGPT_USER_ID: 'fixture-user', ENCRYPTION_KEY: 'fixture-encryption' };
  return [{ ...shared, PORT: '3124', MCP_OAUTH_STORE_PATH: OLD }, { ...shared, PORT: '3164', MCP_OAUTH_STORE_PATH: TARGET, ECOSYSTEM_AUTH_ENABLED: 'true', NOTIFICATIONS_CRON_ENABLED: 'false' }];
};
test('MCP identity/resource/store and candidate flags must stay exact', () => {
  const [old, next] = envs(); verifyIdentity(old, next);
  for (const change of [
    { CHATGPT_API_KEY_SHA256: 'b'.repeat(64) }, { CHATGPT_USER_ID: 'other' },
    { ENCRYPTION_KEY: 'other' }, { CHATGPT_PUBLIC_API_URL: 'https://other.invalid/api' },
    { MCP_OAUTH_STORE_PATH: OLD }, { PORT: '3124' },
    { MCP_INTERNAL_API_URL: 'http://127.0.0.1:3124/api' },
    { ECOSYSTEM_AUTH_ENABLED: 'false' }, { NOTIFICATIONS_CRON_ENABLED: 'true' },
  ]) assert.throws(() => verifyIdentity(old, { ...next, ...change }));
});
test('OAuth bytes are fingerprinted without reserializing or exposing entries', () => {
  const bytes = Buffer.from('{"version":1,"clients":[],"tokens":[]}\n');
  const info = storeInfo(bytes); assert.equal(info.bytes, bytes.length); assert.match(info.sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(storeInfo(Buffer.from(bytes.toString().trim())).sha256, info.sha256);
  for (const value of [{ version: 2, clients: [], tokens: [] }, { version: 1, clients: [{}], tokens: [] }]) assert.throws(() => storeInfo(Buffer.from(JSON.stringify(value))));
});
test('TCP drain examines either endpoint and retains all nonterminal states', () => {
  const row = (local, remote, state) => ` 0: 0100007F:${local.toString(16).padStart(4, '0')} 0100007F:${remote.toString(16).padStart(4, '0')} ${state} 0:0 0:0 0 1000 0 123`;
  const text = 'header\n' + [row(3124, 0, '0A'), row(40000, 3124, '01'), row(3124, 40000, '06'), row(3164, 0, '0A'), row(3124, 40001, '08')].join('\n');
  assert.deepEqual(tcpStates(text), ['0A', '01', '06', '08']);
  assert.deepEqual(tcpStates(text, 3164), ['0A']);
});
test('temporary fence has INPUT-only exact port and no broad flush or OUTPUT policy', () => {
  assert.match(RULES, /create table inet developed_kestrek_handoff/);
  assert.match(RULES, /iifname != "lo" tcp dport 3124/);
  assert.doesNotMatch(RULES, /flush|hook output|3164|3123|4201/);
  assert.throws(() => verifyFenceJson({ nftables: [] }));
});
test('unprivileged execution cannot pause/copy/stop anything', { skip: process.getuid() === 0 }, async () => {
  for (const mode of ['--inspect', '--apply']) await assert.rejects(execute(mode), /Reviewed root inspect\/apply only/);
});
