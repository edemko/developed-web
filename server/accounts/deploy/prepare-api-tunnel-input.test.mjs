import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble, execute, expectedConfigSha256 } from './prepare-api-tunnel-input.mjs';
test('private input binds actual connector account/tunnel and fixed reviewed config', () => {
  const connector = { a: 'a'.repeat(32), t: '11111111-2222-3333-4444-555555555555', s: 'fixture-connector-secret' };
  const start = 'cloudflared tunnel run --token ' + Buffer.from(JSON.stringify(connector)).toString('base64');
  const env = { CLOUDFLARE_ACCOUNT_ID: connector.a, CLOUDFLARE_API_TOKEN: 'fixture-management-token-not-live' };
  const input = assemble(start, env, 'b'.repeat(64));
  assert.equal(input.tunnelId, connector.t); assert.equal(input.expectedVersion, 1);
  assert.equal(input.expectedConfigSha256, expectedConfigSha256); assert.equal(input.apiToken, env.CLOUDFLARE_API_TOKEN);
  assert.ok(!Object.values(input).includes(connector.s));
  assert.throws(() => assemble(start, { ...env, CLOUDFLARE_ACCOUNT_ID: 'c'.repeat(32) }, 'b'.repeat(64)));
  assert.throws(() => assemble(start, env, 'not-a-reviewed-sha'));
});
test('non-root preparation cannot write credentials', { skip: process.getuid() === 0 }, () => assert.throws(execute, /Root required/));
