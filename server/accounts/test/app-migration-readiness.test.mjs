import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appMigrations, readAppSource, verifyAppSource, review } from '../operators/review-app-migrations.mjs';
import { prepareMigration } from '../operators/apply-central-migration.mjs';

const sourceOptions = { skip: process.env.APP_MIGRATION_READINESS_SOURCE_TEST !== '1'
  && process.env.APP_MIGRATION_READINESS_SQL_TEST !== '1' };

test('all ten exact sources are pinned and remain outside the central apply allowlist', sourceOptions, async () => {
  for (const entry of appMigrations) {
    const bytes = await readAppSource(entry);
    assert.equal(verifyAppSource(entry.file, bytes), entry);
    assert.throws(() => verifyAppSource(entry.file, Buffer.concat([bytes, Buffer.from('\n')])));
    assert.throws(() => prepareMigration(entry.file, bytes));
  }
  assert.throws(() => verifyAppSource('../unreviewed.sql', Buffer.from('BEGIN; COMMIT;')));
  assert.equal((await review()).productionApplySupported, false);
  assert.equal(appMigrations.at(-1).phase, 'final-closure-only');
});

test('offline review cannot connect, apply, take arbitrary paths or issue credentials', sourceOptions, async () => {
  const script = fileURLToPath(new URL('../operators/review-app-migrations.mjs', import.meta.url));
  const result = JSON.parse(execFileSync(process.execPath, [script], {
    env: { ...process.env, PATH: '/nonexistent-app-migration-review' }, encoding: 'utf8',
  }));
  assert.equal(result.migrations.length, 10);
  for (const args of [['--apply'], ['--container', 'supabase-db'], ['--write'], ['--file', '/anything']]) {
    await assert.rejects(review(args));
  }
});

test('disconnected ownership fixture exposes remaining app apply prerequisites', {
  skip: process.env.APP_MIGRATION_READINESS_SQL_TEST !== '1', timeout: 120000,
}, async t => {
  const container = `developed-app-readiness-test-${process.pid}-db`;
  const docker = (args, input) => execFileSync('docker', args, {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000,
  }).trim();
  const sql = value => docker(['exec', '-i', container, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], value);
  let created = false;
  t.after(() => {
    if (!created) return;
    assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "developed.app.readiness.test"}}', container]), 'true');
    docker(['rm', '-f', '-v', container]);
  });
  docker(['run', '--pull=never', '-d', '--name', container, '--network', 'none',
    '--memory', '192m', '--memory-swap', '192m', '--cpus', '0.5', '--pids-limit', '100',
    '--label', 'developed.app.readiness.test=true', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
    '-e', 'POSTGRES_USER=supabase_admin', '-e', 'POSTGRES_DB=postgres', 'postgres:17-alpine']);
  created = true;
  for (let attempt = 0;; attempt++) {
    try {
      docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres']);
      sql('SELECT 1'); break;
    } catch {
      if (attempt > 60) throw new Error('Disposable database unavailable');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  // Synthetic catalog, not a production baseline or restored-data rehearsal.
  // Match observed owner/CREATE/REFERENCES boundaries, without live credentials.
  sql(`CREATE ROLE postgres LOGIN CREATEROLE CREATEDB BYPASSRLS;
    GRANT CREATE ON DATABASE postgres TO postgres;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE ROLE authenticator NOINHERIT; CREATE ROLE supabase_auth_admin;
    CREATE ROLE supabase_storage_admin; CREATE ROLE mega_music_web NOINHERIT;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
    ALTER SCHEMA extensions OWNER TO postgres;
    CREATE SCHEMA core AUTHORIZATION postgres;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    ALTER TABLE auth.users OWNER TO supabase_auth_admin;
    GRANT USAGE ON SCHEMA auth TO postgres,authenticated;
    GRANT SELECT,REFERENCES ON auth.users TO postgres;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE TABLE storage.buckets(id text PRIMARY KEY);
    CREATE TABLE storage.objects(id uuid,bucket_id text);
    ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;
    ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
    GRANT USAGE ON SCHEMA storage TO postgres,supabase_storage_admin;
    CREATE SCHEMA odonto;
    GRANT USAGE ON SCHEMA odonto TO postgres;
    CREATE TABLE odonto.user_profiles(id uuid);
    CREATE TABLE odonto.schema_migrations(version text PRIMARY KEY);
    SET ROLE postgres;
    CREATE TABLE core.profiles(id uuid PRIMARY KEY,username text,display_name text);
    CREATE TABLE core.app_access(user_id uuid,app_id text);
    CREATE SCHEMA accounts;
    CREATE TABLE accounts.app_settings(app_id text PRIMARY KEY,enforce_oidc boolean DEFAULT false);
    CREATE FUNCTION accounts.app_request_allowed(text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS
      'SELECT EXISTS(SELECT 1 FROM accounts.app_settings WHERE app_id=$1 AND NOT enforce_oidc)';
    GRANT USAGE ON SCHEMA accounts TO authenticated;
    CREATE SCHEMA mega_music;
    CREATE TABLE mega_music.sessions(id text);
    CREATE SCHEMA kestrek;
    CREATE TABLE kestrek.users(id uuid);
    CREATE SCHEMA screentime;
    ${['children','devices','enrollment_codes','apps','sessions','screen_periods','daily_app_totals','daily_totals','sync_log','device_presence','app_groups','app_group_assignments','session_preferences'].map(name => `CREATE TABLE screentime.${name}(id uuid);`).join('\n')}
    CREATE TABLE screentime.schema_migrations(version text PRIMARY KEY);
    CREATE SCHEMA airsoft;
    CREATE TABLE airsoft.profiles(id uuid PRIMARY KEY,display_name text,suspended boolean DEFAULT false);
    CREATE TABLE airsoft.listings(id uuid PRIMARY KEY,status text);
    CREATE TABLE airsoft.listing_photos(id uuid,listing_id uuid);
    ${['conversations','messages','exchange_proposals','listing_reports'].map(name => `CREATE TABLE airsoft.${name}(id uuid);`).join('\n')}
    CREATE TABLE airsoft.schema_migrations(version text PRIMARY KEY);
    CREATE SCHEMA voc_builder;
    CREATE TABLE voc_builder.memberships(user_id uuid PRIMARY KEY,role text,organisation_id uuid,must_change_password boolean,created_at timestamptz);
    CREATE VIEW voc_builder.app_users AS SELECT id FROM core.profiles;
    CREATE SCHEMA otazkomat;
    CREATE TABLE otazkomat.users(id uuid PRIMARY KEY,email text,first_name text,last_name text,role text,status text);
    CREATE TABLE otazkomat.organizations(id uuid,system_key text,is_system boolean,status text);
    CREATE TABLE otazkomat.user_organization_memberships(user_id uuid,organization_id uuid,role text,is_active boolean);
    RESET ROLE;`);
  const sources = await Promise.all(appMigrations.map(async entry => (await readAppSource(entry)).toString()));
  const applyAs = (index, role = 'postgres', source = sources[index]) => sql(`SET ROLE ${role};\n${source}`);
  const expectFailure = (operation, pattern) => assert.throws(operation, error => pattern.test(error.stderr?.toString() || ''));
  applyAs(0);
  expectFailure(() => applyAs(1), /role "kestrek_identity_web" does not exist/);
  assert.equal(sql("SELECT to_regnamespace('kestrek_identity') IS NULL"), 't');
  sql('CREATE ROLE kestrek_identity_web NOLOGIN NOINHERIT;');
  applyAs(1); applyAs(2);
  assert.equal(sql("SELECT accounts.app_request_allowed('app_screentime')"), 'f');
  sql("INSERT INTO accounts.app_settings VALUES('app_screentime',false),('app_airsoft',false);");
  assert.equal(sql("SELECT accounts.app_request_allowed('app_screentime') AND accounts.app_request_allowed('app_airsoft')"), 't');
  expectFailure(() => applyAs(3), /must be owner of table objects/);
  assert.equal(sql("SELECT to_regnamespace('airsoft_identity') IS NULL"), 't');
  // Fixture proof only: narrow exact storage policy uses the trusted operator.
  // The table owner lacks access to the referenced app schemas on production;
  // do not grant it unrelated app privileges merely to install this policy.
  const storagePolicy = sources[3].match(/create policy airsoft_ecosystem_storage[\s\S]*?;\n/)[0];
  applyAs(3, 'supabase_admin', sources[3].replace('begin;', 'begin;\nSET LOCAL ROLE postgres;')
    .replace(storagePolicy, `SET LOCAL ROLE supabase_admin;\n${storagePolicy}SET LOCAL ROLE postgres;\n`));
  applyAs(4); applyAs(5); applyAs(6);
  expectFailure(() => applyAs(7), /must be owner of table user_profiles|permission denied for table user_profiles/);
  assert.equal(sql("SELECT NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kestrek_backend')"), 't');
  // The source has a mixed-owner DO loop: a narrowly reviewed production runner
  // still needs explicit owner dispatch. Superuser execution here proves only
  // the source's intended final ACLs and is NOT an operator recommendation.
  applyAs(7, 'supabase_admin');
  expectFailure(() => applyAs(8), /permission denied to grant role|permission denied for schema odonto/);
  assert.equal(sql("SELECT to_regprocedure('odonto_identity.assert_store(text,text)') IS NULL"), 't');
  applyAs(8, 'supabase_admin');
  assert.equal(sql("SELECT rolsuper FROM pg_roles WHERE rolname='postgres'"), 'f');
  assert.equal(sql("SELECT NOT rolcanlogin AND NOT rolinherit AND NOT rolbypassrls FROM pg_roles WHERE rolname='odonto_identity_web'"), 't');
  assert.equal(sql("SET ROLE odonto_identity_web; SELECT odonto.ecosystem_identity_config()->>'safe'; RESET ROLE;"), 'true');
  assert.equal(sql("SELECT NOT has_function_privilege('odonto_backend','odonto.ecosystem_identity_config()','EXECUTE') AND NOT has_table_privilege('odonto_backend','odonto_identity.sessions','SELECT')"), 't');
  assert.equal(sql("SELECT count(*) FROM pg_roles WHERE rolname IN('kestrek_backend','screentime_backend','vocabulum_backend','odonto_backend','otazkomat_backend') AND NOT (rolcanlogin OR rolsuper OR rolbypassrls OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication)"), '5');
});
