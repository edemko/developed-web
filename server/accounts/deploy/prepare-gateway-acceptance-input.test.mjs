import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble, execute, HOSTS } from './prepare-gateway-acceptance-input.mjs';
const credential = role => `fixture.${Buffer.from(JSON.stringify({ role, exp: 9999999999 })).toString('base64url')}.fixture`;
function fixture() {
  const anon = credential('anon');
  const hosts = Object.fromEntries(HOSTS.map(name => [name, { ECOSYSTEM_AUTH_ENABLED: 'true', SUPABASE_ANON_KEY: anon, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_DATA_API_KEY: credential(name + '_backend'), IRRELEVANT_SECRET: 'never-copy' }]));
  const legacyKe = { SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_KEY: credential('service_role') };
  return { hosts, legacyKe, originalKe: { ...legacyKe }, odonto: { version: 1,
    frontend: { ECOSYSTEM_AUTH_ENABLED: 'true', NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, ECOSYSTEM_SESSION_API_KEY: 'never-copy' },
    backend: { ECOSYSTEM_AUTH_ENABLED: 'true', SUPABASE_ANON_KEY: anon, SUPABASE_DATA_API_KEY: credential('odonto_backend'), ECOSYSTEM_APP_SECRET: 'never-copy' },
  } };
}
test('selects only seven already-existing credentials and the reviewed Caddy hash', () => {
  const value = assemble(fixture(), 'a'.repeat(64));
  assert.deepEqual(Object.keys(value).sort(), ['version', 'expectedCaddySha256', 'anonKey', 'legacyServiceRoleKey', 'scopedTokens'].sort());
  assert.equal(Object.keys(value.scopedTokens).length, 5); assert.ok(!JSON.stringify(value).includes('never-copy'));
  assert.equal(value.legacyServiceRoleKey, credential('service_role'));
});
test('rejects mismatched anon/legacy sources, flags, wrong-purpose keys and missing Odonto data', () => {
  for (const mutate of [
    x => x.hosts.airsoft.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'different',
    x => x.hosts.kestrek.ECOSYSTEM_AUTH_ENABLED = 'false',
    x => x.originalKe.SUPABASE_SERVICE_KEY = 'different',
    x => x.odonto.frontend.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'different',
    x => x.odonto.backend.SUPABASE_DATA_API_KEY = credential('odonto_identity_web'),
    x => delete x.odonto.backend.SUPABASE_DATA_API_KEY,
    x => x.hosts.screentime.SUPABASE_DATA_API_KEY = credential('service_role'),
  ]) { const value = fixture(); mutate(value); assert.throws(() => assemble(value, 'a'.repeat(64))); }
});
test('unprivileged assembler cannot read or write protected input', { skip: process.getuid() === 0 }, () => {
  for (const mode of ['--check', '--stage']) assert.throws(() => execute(mode), /root offline assembler/);
});
