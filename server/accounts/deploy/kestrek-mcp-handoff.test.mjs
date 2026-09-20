import test from 'node:test';
import assert from 'node:assert/strict';
import { storeInfo, tcpStates, verifyIdentity, verifyLegacyGroup, safePathStat, OLD, TARGET, execute } from './kestrek-mcp-handoff.mjs';
import { RULES, verifyFenceJson } from './kestrek-handoff-fence.mjs';

const envs = () => {
  const shared = { CHATGPT_API_KEY_SHA256: 'a'.repeat(64), CHATGPT_USER_ID: 'fixture-user', ENCRYPTION_KEY: 'fixture-encryption' };
  return [{ ...shared, PORT: '3124', MCP_OAUTH_STORE_PATH: OLD }, { ...shared, PORT: '3164', MCP_OAUTH_STORE_PATH: TARGET, ECOSYSTEM_AUTH_ENABLED: 'true', NOTIFICATIONS_CRON_ENABLED: 'false' }];
};
test('legacy writable group is only the trusted operator, never private/root paths or files', () => {
  const passwd = 'root:x:0:0::/:/bin/sh\nopenclaw:x:1000:1000::/home/openclaw:/bin/sh\n';
  verifyLegacyGroup(passwd, 'root:x:0:\nopenclaw:x:1000:\n');
  assert.throws(() => verifyLegacyGroup(passwd + 'app:x:982:1000::/:/bin/false\n', 'openclaw:x:1000:'));
  assert.throws(() => verifyLegacyGroup(passwd, 'openclaw:x:1000:app'));
  const stat = { uid: 1000, gid: 1000, mode: 0o775, isDirectory: () => true, isSymbolicLink: () => false };
  assert.ok(safePathStat(stat, 1000, true));
  for (const changed of [{ mode: 0o777 }, { gid: 975 }, { uid: 982 }, { isDirectory: () => false }, { isSymbolicLink: () => true }]) assert.ok(!safePathStat({ ...stat, ...changed }, 1000, true));
  assert.ok(!safePathStat(stat, 1000, false)); assert.ok(!safePathStat(stat, 0, true));
});
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
