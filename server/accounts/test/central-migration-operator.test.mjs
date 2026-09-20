import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { migrations, prepareMigration, run } from '../operators/apply-central-migration.mjs';

const script = fileURLToPath(new URL('../operators/apply-central-migration.mjs', import.meta.url));
const source = item => readFile(new URL(`../../../supabase/migrations/${item.file}`, import.meta.url));

test('only exact pinned central files are accepted and ledger writes precede the only COMMIT', async () => {
  for (const [index, migration] of migrations.entries()) {
    const bytes = await source(migration), prepared = prepareMigration(migration.file, bytes);
    assert.equal(prepared.sha256, migration.sha256);
    assert.equal([...prepared.sql.matchAll(/^COMMIT;$/gm)].length, 1);
    assert.match(prepared.sql, /pg_try_advisory_xact_lock/);
    assert.match(prepared.sql, /INSERT INTO accounts.deployment_migrations[\s\S]*COMMIT;\s*$/);
    if (!index) assert.match(prepared.sql, /FORCE ROW LEVEL SECURITY/);
    else assert.match(prepared.sql, /Central predecessor checksum mismatch/);
    assert.throws(() => prepareMigration(migration.file, Buffer.concat([bytes, Buffer.from('\n')])));
    assert.throws(() => prepareMigration(migration.file, Buffer.from(bytes.toString().replace(/commit;/i, 'COMMIT;\nBEGIN;'))));
  }
  assert.throws(() => prepareMigration('20260920124145_ecosystem_scoped_data_roles.sql', Buffer.from('BEGIN; COMMIT;')));
  assert.throws(() => prepareMigration('../../anything.sql', Buffer.from('BEGIN; COMMIT;')));
});

test('dry-run does not invoke Docker and ambiguous or unapproved target arguments fail', async () => {
  // PATH cannot resolve Docker: the local-only promise is exercised, not mocked.
  const result = execFileSync(process.execPath, [script, '--migration', migrations[0].file], {
    env: { ...process.env, PATH: '/nonexistent-central-migration-test' }, encoding: 'utf8',
  });
  assert.match(result, /dry run, no connection or mutation/);
  for (const args of [[], ['--migration', migrations[0].file, '--apply'],
    ['--migration', migrations[0].file, '--container', 'other-production'],
    ['--migration', migrations[0].file, '--apply', '--apply'],
    ['--migration', migrations[0].file, '--unknown'],
    ['--migration', migrations[0].file, '--migration', migrations[1].file]]) await assert.rejects(run(args));
});

test('operator lock bound wins after known source settings and before any database operation', async () => {
  for (const [index, migration] of migrations.entries()) {
    const bytes = await source(migration);
    const { sql } = prepareMigration(migration.file, bytes);
    const guard = sql.indexOf('DO $central_operator_guard$');
    const lockSettings = [...sql.matchAll(/set local lock_timeout\s*=\s*'([^']+)'/gi)];
    assert.equal(lockSettings.at(-1)[1], '500ms');
    assert.ok(lockSettings.every(match => match.index < guard));
    assert.match(sql.slice(0, guard), new RegExp(`SET LOCAL statement_timeout='${index === 1 ? '5s' : '30s'}';`));
    assert.doesNotMatch(sql.slice(guard), /\b(?:lock_timeout|statement_timeout|set_config|reset\s+all)\b/i);
    assert.throws(() => prepareMigration(migration.file,
      Buffer.from(bytes.toString().replace(/commit;/i, "set local lock_timeout='30s';\ncommit;"))));
  }
});

test('CLI sanitizes failure output without SQL or operator inputs', () => {
  assert.throws(() => execFileSync(process.execPath,
    [script, '--migration', 'untrusted-secret-input', '--apply'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }), error => {
    assert.equal(error.status, 1); assert.equal(error.stdout, '');
    assert.equal(error.stderr.includes('untrusted-secret-input'), false);
    assert.match(error.stderr, /database diagnostics withheld/); return true;
  });
});

test('isolated PostgreSQL proves atomic schema/ledger commit, rollback and ordering', {
  skip: process.env.CENTRAL_MIGRATION_RUNNER_SQL_TEST !== '1', timeout: 120000,
}, async t => {
  const container = `developed-central-migration-test-${process.pid}-db`;
  const docker = (args, input) => execFileSync('docker', args, {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000,
  }).trim();
  const sql = value => docker(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], value);
  let created = false;
  t.after(() => {
    if (!created) return;
    assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "developed.central.migration.test"}}', container]), 'true');
    docker(['rm', '-f', '-v', container]);
  });
  docker(['run', '--pull=never', '-d', '--name', container, '--network', 'none',
    '--memory', '192m', '--cpus', '0.5', '--pids-limit', '100',
    '--label', 'developed.central.migration.test=true', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
  created = true;
  for (let attempt = 0;; attempt++) {
    try {
      // The image briefly starts a socket-only initialization server, which
      // shuts down again. Wait for the final TCP listener before using sockets.
      docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres']);
      sql('SELECT 1'); break;
    }
    catch { if (attempt > 50) throw new Error('Disposable database unavailable'); await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  // Minimal credential-free shape, not a provider or production restore fixture.
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA core;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,created_at timestamptz);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,created_at timestamptz,not_after timestamptz,oauth_client_id uuid,aal text);
    CREATE TABLE auth.oauth_authorizations(authorization_id text,client_id uuid,user_id uuid,redirect_uri text,scope text,code_challenge_method text,nonce text,status text,expires_at timestamptz);
    CREATE TABLE auth.mfa_factors(id uuid,user_id uuid,status text,factor_type text,secret text);
    CREATE TABLE core.profiles(id uuid PRIMARY KEY,display_name text,photo_url text,updated_at timestamptz);
    CREATE TABLE core.apps(id text PRIMARY KEY,status text,deleted_at timestamptz);
    CREATE TABLE core.app_access(id text PRIMARY KEY,user_id uuid,app_id text,role text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS 'SELECT ''{}''::jsonb';`);
  const apply = item => run(['--migration', item.file, '--container', container, '--apply']);
  await assert.rejects(apply(migrations[1]));
  assert.equal(sql("SELECT to_regnamespace('accounts') IS NULL"), 't');
  await apply(migrations[0]);
  assert.equal(sql('SELECT count(*) FROM accounts.deployment_migrations'), '1');
  assert.equal(sql("SELECT has_table_privilege('developed_accounts','accounts.deployment_migrations','SELECT,INSERT,UPDATE,DELETE')"), 'f');
  await assert.rejects(apply(migrations[0]));
  // Force the history insertion to fail AFTER the real second migration's DDL.
  sql(`CREATE FUNCTION accounts.test_ledger_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture ledger failure'; END $$;
    CREATE TRIGGER test_ledger_reject BEFORE INSERT ON accounts.deployment_migrations FOR EACH ROW EXECUTE FUNCTION accounts.test_ledger_reject();`);
  await assert.rejects(apply(migrations[1]));
  assert.equal(sql("SELECT to_regclass('accounts.oauth_clients') IS NULL"), 't');
  assert.equal(sql('SELECT count(*) FROM accounts.deployment_migrations'), '1');
  sql('DROP TRIGGER test_ledger_reject ON accounts.deployment_migrations; DROP FUNCTION accounts.test_ledger_reject();');
  await apply(migrations[1]); await apply(migrations[2]);
  assert.equal(sql('SELECT count(*) FROM accounts.deployment_migrations'), '3');
  assert.equal(sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='accounts' AND table_name='sessions' AND column_name IN ('mfa_pending','mfa_enrollment_id')"), '2');
  assert.equal(sql("SELECT registration_mode FROM accounts.settings"), 'closed');
  assert.equal(sql("SELECT has_column_privilege('developed_accounts','auth.mfa_factors','secret','SELECT')"), 'f');
  await assert.rejects(apply(migrations[2]));
  sql(`DELETE FROM accounts.deployment_migrations WHERE version='${migrations[2].version}';
    UPDATE accounts.deployment_migrations SET source_sha256=repeat('0',64) WHERE version='${migrations[0].version}';`);
  await assert.rejects(apply(migrations[2]));
  assert.equal(sql('SELECT count(*) FROM accounts.deployment_migrations'), '2');
});
