// Read-only private verification. Does not create users, clients, tokens or mail.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { image, overrides } from './green-provider-stage.mjs';
const run = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 }).trim();
const inspect = (name, field) => JSON.parse(run('inspect', name, '--format', `{{json .${field}}}`));
const environment = name => Object.fromEntries(inspect(name, 'Config.Env').map(entry => {
  const split = entry.indexOf('='); return [entry.slice(0, split), entry.slice(split + 1)];
}));
try {
  assert.equal(process.getuid(), 0);
  const blue = environment('supabase-auth'), green = environment('developed-auth-green');
  for (const [key, value] of Object.entries(blue)) assert.equal(green[key], overrides[key] ?? value);
  for (const [key, value] of Object.entries(overrides)) assert.equal(green[key], value);
  assert.deepEqual(Object.keys(green).sort(), [...new Set([...Object.keys(blue), ...Object.keys(overrides)])].sort());
  assert.equal(inspect('supabase-auth', 'State.Running'), true);
  assert.equal(inspect('developed-auth-green', 'State.Running'), true);
  assert.equal(inspect('developed-auth-green', 'Image'), image);
  assert.deepEqual(Object.keys(inspect('developed-auth-green', 'NetworkSettings.Networks')), ['developed-auth-green']);
  const healthResponse = await fetch('http://127.0.0.1:3141/health', { signal: AbortSignal.timeout(5000) });
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json(); assert.match(health.version, /2\.189\.0/);
  const discovery = await fetch('http://127.0.0.1:3141/.well-known/openid-configuration', { signal: AbortSignal.timeout(5000) });
  assert.equal(discovery.status, 200);
  assert.equal((await discovery.json()).issuer, blue.GOTRUE_JWT_ISSUER);
  const oldAddress = inspect('supabase-auth', 'NetworkSettings.Networks').supabase_default.IPAddress;
  const keys = await Promise.all([`http://${oldAddress}:9999`, 'http://127.0.0.1:3141'].map(async url => {
    const result = await fetch(url + '/.well-known/jwks.json', { signal: AbortSignal.timeout(5000) });
    assert.equal(result.status, 200); return result.json();
  }));
  assert.deepEqual(keys[1], keys[0]);
  // Existing private platform key stays in memory; this is one bounded read.
  const adminKey = environment('supabase-kong').SUPABASE_SERVICE_KEY;
  assert.ok(adminKey);
  const adminRead = await fetch('http://127.0.0.1:3141/admin/users?page=1&per_page=1', {
    headers: { Authorization: `Bearer ${adminKey}`, apikey: adminKey }, signal: AbortSignal.timeout(5000),
  });
  assert.equal(adminRead.status, 200);
  const adminBody = await adminRead.json(); assert.ok(Array.isArray(adminBody.users));
  assert.ok(adminBody.users.length <= 1);
  const metadata = run('exec', 'supabase-db', 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-Atc',
    `select json_build_object('latest',(select max(version) from auth.schema_migrations),
      'connections',(select count(*) from pg_stat_activity where client_addr='172.30.241.2'),
      'unexpectedRoles',(select count(*) from pg_stat_activity where client_addr='172.30.241.2' and usename <> 'supabase_auth_admin'),
      'waitingLocks',(select count(*) from pg_stat_activity where client_addr='172.30.241.2' and wait_event_type='Lock'),
      'roleNonprivileged',(select not rolsuper and not rolbypassrls from pg_roles where rolname='supabase_auth_admin'),
      'registration',(select registration_mode from accounts.settings where singleton=true));`);
  const status = JSON.parse(metadata);
  assert.equal(status.latest, '20260302000000');
  assert.equal(status.unexpectedRoles, 0); assert.equal(status.waitingLocks, 0); assert.equal(status.registration, 'closed');
  assert.equal(status.roleNonprivileged, true);
  console.log(JSON.stringify({ status: 'private-green-verified', imagePreserved: true, issuerPreserved: true,
    signingKeysPreserved: true, envDiffNames: Object.keys(overrides), health: health.version,
    adminReadStatus: adminRead.status, returnedUserCount: adminBody.users.length, database: status, blueRunning: true }));
} catch {
  console.error('Private green verification failed; no credential, response body, database error or provider log was printed.'); process.exitCode = 1;
}
