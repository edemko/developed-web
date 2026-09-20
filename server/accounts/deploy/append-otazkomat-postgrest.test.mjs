import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { request } from 'node:http';
import { BEFORE, AFTER, MIGRATION, snapshotSql, sourceAfter, validateBefore, expectedAfter, applySql, execute } from './append-otazkomat-postgrest.mjs';
const migration = readFileSync(new URL('../../../supabase/migrations/' + MIGRATION, import.meta.url), 'utf8');
const names = ['app_settings','group_module_assignments','group_test_access','invitations','modules','organization_activities','organization_settings','organizations','payments','question_options','questions','report_messages','reports','schema_migrations','submodules','subscription_plans','test_submissions','tests','user_answers','user_email_verifications','user_groups','user_incorrect_questions','user_marked_questions','user_module_assignments','user_organization_memberships','user_password_resets','user_sessions','user_statistics','user_subgroups','user_subscriptions','user_test_access','user_test_attempts','users'];
const roleNames = ['anon','authenticated','kestrek_backend','screentime_backend','vocabulum_backend','odonto_backend','otazkomat_backend','odonto_identity_web'];
const fixture = () => ({ settings: [{ role: 'authenticator', database: 'postgres', values: ['work_mem=4MB'] }],
  roles: roleNames.map(name => ({ name, usage: name === 'otazkomat_backend' })),
  tables: [...names.map(name => ({ name, kind: 'r', owner: 'postgres', rls: name !== 'schema_migrations', forced: false, backend_select: name !== 'schema_migrations', anon: false, authenticated: false, triggers: 0, policies: [] })), { name: 'identity_directory', kind: 'v', anon: false, authenticated: false }], functions: [] });
test('source durability patch preserves every byte except the exact schema-list value', () => {
  for (const ending of ['', '\n']) {
    const before = Buffer.from('SECRET=fixture-only\nPGRST_DB_SCHEMAS=' + BEFORE + ending);
    const after = sourceAfter(before); assert.equal(after.toString(), before.toString().replace(BEFORE, AFTER));
    assert.throws(() => sourceAfter(after));
  }
  assert.throws(() => sourceAfter(Buffer.from(`PGRST_DB_SCHEMAS=${BEFORE}\nPGRST_DB_SCHEMAS=${BEFORE}\n`)));
  const commented = Buffer.from(`# PGRST_DB_SCHEMAS=${BEFORE}\nPGRST_DB_SCHEMAS=${BEFORE}\n`);
  assert.equal(sourceAfter(commented).toString(), `# PGRST_DB_SCHEMAS=${BEFORE}\nPGRST_DB_SCHEMAS=${AFTER}\n`);
  assert.throws(() => sourceAfter(Buffer.concat([Buffer.from([255]), commented])));
  assert.throws(() => sourceAfter(Buffer.from(`# PGRST_DB_SCHEMAS=${BEFORE}\n`)));
});
test('fixed metadata transaction preserves unrelated settings, grants and app rows', () => {
  const before = fixture(); validateBefore(before); const after = expectedAfter(before);
  assert.deepEqual(after.settings[0].values, ['work_mem=4MB', 'pgrst.db_schemas=' + AFTER]);
  assert.equal(before.tables.find(t => t.name === 'schema_migrations').rls, false);
  assert.equal(after.tables.find(t => t.name === 'schema_migrations').rls, true);
  const sql = applySql(before, migration);
  assert.match(sql, /SET LOCAL lock_timeout='2s'/); assert.match(sql, /pg_try_advisory_xact_lock/);
  assert.match(sql, /ALTER ROLE authenticator IN DATABASE postgres SET pgrst\.db_schemas/);
  assert.match(sql, /NOTIFY pgrst, 'reload config'/);
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
  assert.ok(sql.indexOf('DO $preserve$') < sql.indexOf('NOTIFY pgrst'));
  assert.match(sql, /SET LOCAL search_path=pg_catalog/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /\b(?:GRANT|REVOKE|INSERT INTO|UPDATE |DELETE FROM|TRUNCATE|CREATE FUNCTION)\b/);
  assert.throws(() => applySql(before, migration + '\n'));
});
test('refuses existing override, public schema access, table drift or ledger trigger', () => {
  for (const mutate of [s => s.settings[0].values.push('pgrst.db_pre_config=other'), s => s.roles[0].usage = true, s => s.tables.pop(), s => s.tables[0].anon = true, s => s.tables.find(t => t.name === 'schema_migrations').triggers = 1]) {
    const state = fixture(); mutate(state); assert.throws(() => validateBefore(state));
  }
});
test('unprivileged operation cannot inspect/apply shared database state', { skip: process.getuid() === 0 }, () => {
  for (const mode of ['--stage', '--apply']) assert.throws(() => execute(mode), /root exposure/);
});
test('isolated PG17 atomic apply, schema isolation, unchanged rows/settings, replay rejection and advisors', { skip: process.env.POSTGREST_EXPOSURE_SQL_TEST !== '1', timeout: 120000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'developed-pgrst-exposure-fixture-')), socket = join(directory, 'socket'); mkdirSync(socket); chmodSync(socket, 0o777);
  const container = `developed-pgrst-exposure-test-${process.pid}`;
  const restContainer = container + '-rest'; let restCreated = false;
  const docker = (args, input) => spawnSync('sudo', ['-n', 'docker', ...args], { input, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  const created = docker(['run', '--pull=never', '-d', '--name', container, '--label', 'developed.pgrst-exposure-test=true', '--network', 'none', '--memory', '256m', '--cpus', '0.5', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=supabase_admin', '--mount', `type=bind,src=${socket},dst=/fixture`, 'postgres:17-alpine', 'postgres', '-c', 'listen_addresses=', '-c', 'unix_socket_directories=/fixture,/var/run/postgresql']);
  assert.equal(created.status, 0, created.stderr);
  try {
    let ready = false; for (let i = 0; i < 90; i++) { const logs = docker(['logs', container]); if ((logs.stdout + logs.stderr).includes('PostgreSQL init process complete') && docker(['exec', container, 'pg_isready', '-h', '/fixture', '-U', 'supabase_admin']).status === 0) { ready = true; break; } await new Promise(resolve => setTimeout(resolve, 200)); } assert.ok(ready, 'Synthetic PostgreSQL fixture did not become ready: ' + JSON.stringify(docker(['logs', container])));
    // All SQL clients explicitly use the fixture socket, never host/shared DB.
    const boot = docker(['exec', '-i', container, 'psql', '-h', '/fixture', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], `CREATE ROLE postgres LOGIN NOSUPERUSER BYPASSRLS; CREATE ROLE authenticator LOGIN; CREATE ROLE service_role BYPASSRLS;
${roleNames.map(name => `CREATE ROLE ${name};`).join('\n')}
GRANT ${roleNames.join(',')} TO authenticator;
${BEFORE.split(',').filter(name => name !== 'public').map(name => `CREATE SCHEMA ${name};`).join('\n')}
CREATE SCHEMA otazkomat AUTHORIZATION postgres; SET ROLE postgres;
${names.map(name => `CREATE TABLE otazkomat.${name}(id int,marker text); ${name === 'schema_migrations' ? '' : `ALTER TABLE otazkomat.${name} ENABLE ROW LEVEL SECURITY;`}`).join('\n')}
CREATE VIEW otazkomat.identity_directory AS SELECT id FROM otazkomat.questions;
INSERT INTO otazkomat.questions VALUES(1,'preserved-fictional-data'); INSERT INTO otazkomat.schema_migrations VALUES(1,'preserved-ledger');
GRANT USAGE ON SCHEMA otazkomat TO otazkomat_backend,service_role;
${names.filter(name => name !== 'schema_migrations').map(name => `GRANT SELECT ON otazkomat.${name} TO otazkomat_backend; CREATE POLICY ecosystem_backend ON otazkomat.${name} TO otazkomat_backend USING(true);`).join('\n')}
GRANT SELECT ON otazkomat.identity_directory TO otazkomat_backend; GRANT ALL ON otazkomat.schema_migrations TO service_role;
RESET ROLE; ALTER ROLE authenticator IN DATABASE postgres SET work_mem='4MB';`);
    assert.equal(boot.status, 0, boot.stderr);
    // psql defaults can be supplied via per-command PGHOST, not server settings.
    const sql = text => docker(['exec', '-i', '-e', 'PGHOST=/fixture', container, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], text);
    const exec = text => { const r = sql(text); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
    const syntheticSecret = 'fixture-only-secret-not-used-by-any-real-application';
    const rest = docker(['run', '--pull=never', '-d', '--name', restContainer, '--label', 'developed.pgrst-exposure-test=true', '--network', 'none', '--memory', '256m', '--cpus', '0.5', '--mount', `type=bind,src=${socket},dst=/fixture`, '-e', 'PGRST_DB_URI=postgresql://authenticator@/postgres?host=/fixture', '-e', `PGRST_DB_SCHEMAS=${BEFORE}`, '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', `PGRST_JWT_SECRET=${syntheticSecret}`, '-e', 'PGRST_SERVER_UNIX_SOCKET=/fixture/rest.sock', '-e', 'PGRST_SERVER_UNIX_SOCKET_MODE=777', 'postgrest/postgrest:v14.12']);
    assert.equal(rest.status, 0, rest.stderr); restCreated = true;
    // Synthetic backend-role credentials only, signed with the isolated fixture
    // secret above. No user JWT, signing file, or live credential is ever used.
    const token = role => { const unsigned = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url'); return unsigned + '.' + createHmac('sha256', syntheticSecret).update(unsigned).digest('base64url'); };
    const probe = role => new Promise((resolve, reject) => {
      const req = request({ socketPath: join(socket, 'rest.sock'), path: '/questions?select=id&limit=0', method: 'HEAD', headers: { Authorization: 'Bearer ' + token(role), 'Accept-Profile': 'otazkomat' }, timeout: 3000 }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
      req.on('error', reject); req.on('timeout', () => req.destroy()); req.end();
    });
    let initial; for (let i = 0; i < 80; i++) { try { initial = await probe('otazkomat_backend'); if (initial === 406) break; } catch {} await new Promise(resolve => setTimeout(resolve, 150)); } assert.equal(initial, 406, 'Synthetic REST startup: ' + docker(['logs', restContainer]).stderr.slice(0, 3000));
    const restBefore = docker(['inspect', '--format', '{{.Id}} {{.State.Pid}} {{.State.StartedAt}} {{.RestartCount}}', restContainer]).stdout.trim();
    const before = JSON.parse(exec(snapshotSql)); validateBefore(before);
    exec(applySql(before, migration)); const after = JSON.parse(exec(snapshotSql));
    assert.deepEqual(after, expectedAfter(before));
    let own; for (let i = 0; i < 60; i++) { own = await probe('otazkomat_backend'); if (own === 200) break; await new Promise(resolve => setTimeout(resolve, 150)); }
    assert.equal(own, 200); assert.equal(await probe('kestrek_backend'), 403);
    assert.equal(docker(['inspect', '--format', '{{.Id}} {{.State.Pid}} {{.State.StartedAt}} {{.RestartCount}}', restContainer]).stdout.trim(), restBefore);
    assert.equal(exec('SELECT marker FROM otazkomat.questions; SELECT marker FROM otazkomat.schema_migrations;'), 'preserved-fictional-data\npreserved-ledger');
    assert.equal(exec("SELECT has_schema_privilege('kestrek_backend','otazkomat','USAGE'),has_table_privilege('otazkomat_backend','otazkomat.questions','SELECT');"), 'f|t');
    assert.notEqual(sql(applySql(before, migration)).status, 0); assert.deepEqual(JSON.parse(exec(snapshotSql)), after);
    const advisor = spawnSync('supabase', ['db', 'advisors', '--db-url', `postgresql://supabase_admin:fixture@localhost/postgres?host=${encodeURIComponent(socket)}&sslmode=disable`, '--type', 'security', '--level', 'error', '--fail-on', 'none'], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(advisor.status, 0, 'Disposable security advisors failed: ' + advisor.stderr.slice(0, 500));
  } finally {
    if (restCreated) { const identity = docker(['inspect', '--format', '{{index .Config.Labels "developed.pgrst-exposure-test"}} {{.HostConfig.NetworkMode}}', restContainer]); if (identity.status === 0 && identity.stdout.trim() === 'true none') assert.equal(docker(['rm', '-f', '-v', restContainer]).status, 0); }
    const identity = docker(['inspect', '--format', '{{index .Config.Labels "developed.pgrst-exposure-test"}} {{.HostConfig.NetworkMode}}', container]);
    if (identity.status === 0 && identity.stdout.trim() === 'true none') assert.equal(docker(['rm', '-f', '-v', container]).status, 0);
    assert.ok(directory.startsWith(join(tmpdir(), 'developed-pgrst-exposure-fixture-'))); rmSync(directory, { recursive: true });
  }
});
