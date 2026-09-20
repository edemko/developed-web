// Fixed schema-exposure metadata correction. No grants, app rows, provider
// flags, restarts or environment-file writes. Main owns the one-line .env patch.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, lstatSync, realpathSync, mkdirSync, openSync, closeSync, writeFileSync, fchmodSync, fsyncSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const BEFORE = 'public,storage,graphql_public,core,kestrek,odonto,voc_builder,screentime,airsoft';
export const AFTER = BEFORE + ',otazkomat';
export const BACKUP = '/var/backups/developed-postgrest-exposure-20260920';
export const SOURCE = '/home/openclaw/Dev/supabase/docker/.env';
export const MIGRATION = '20260920202204_otazkomat_schema_migrations_rls.sql';
export const MIGRATION_SHA = '937caca1a7d79c55a2fa84054dc73c45075e19176992fd8e14c7010ae7f57226';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, message) => assert.ok(ok, message);
const roles = ['anon', 'authenticated', 'kestrek_backend', 'screentime_backend', 'vocabulum_backend', 'odonto_backend', 'otazkomat_backend', 'odonto_identity_web'];
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const sqlPrelude = `SET log_statement='none'; SET log_min_duration_statement=-1; SET log_min_duration_sample=-1;
SET log_duration=off; SET log_min_error_statement='panic'; SET log_error_verbosity='terse';
SET log_parameter_max_length=0; SET log_parameter_max_length_on_error=0; SET pgaudit.log='none';
SET auto_explain.log_min_duration=-1; SET pg_stat_statements.track='none';`;
const transactionGuard = `SET LOCAL search_path=pg_catalog;
DO $identity$ BEGIN IF session_user <> 'supabase_admin' OR current_database() <> 'postgres' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'Unexpected metadata operator identity'; END IF; END $identity$;`;
export const snapshotSql = `SELECT jsonb_build_object(
 'settings',coalesce((SELECT jsonb_agg(jsonb_build_object('role',coalesce(r.rolname,'ALL'),'database',coalesce(d.datname,'ALL'),'values',s.setconfig) ORDER BY s.setrole,s.setdatabase) FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid=s.setrole LEFT JOIN pg_database d ON d.oid=s.setdatabase WHERE (s.setrole=0 OR r.rolname='authenticator') AND (s.setdatabase=0 OR d.datname='postgres')),'[]'::jsonb),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'usage',has_schema_privilege(r.rolname,'otazkomat','USAGE')) ORDER BY r.rolname) FROM pg_roles r WHERE r.rolname IN (${roles.map(literal).join(',')})),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'acl',c.relacl,'anon',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'),'authenticated',has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'),'backend_select',has_table_privilege('otazkomat_backend',c.oid,'SELECT'),'triggers',(SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'roles',p.polroles,'command',p.polcmd,'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid)) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='otazkomat' AND c.relkind IN ('r','p','v','m')),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'acl',p.proacl) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='otazkomat')
)`;
export function validateBefore(state) {
  check(Array.isArray(state.settings) && state.settings.every(row => row.values.every(value => !value.startsWith('pgrst.'))), 'Existing PostgREST role/database override requires review');
  check(state.roles.length === roles.length && state.roles.every(row => roles.includes(row.name) && row.usage === (row.name === 'otazkomat_backend')), 'Ota schema isolation differs');
  check(state.tables.filter(row => row.kind === 'r').length === 33 && state.tables.filter(row => row.kind === 'v').length === 1 && state.tables.length === 34, 'Ota relation inventory differs');
  check(state.tables.every(row => !row.anon && !row.authenticated && (row.kind !== 'r' || row.rls === (row.name !== 'schema_migrations'))), 'Ota grants/RLS differ');
  const ledger = state.tables.find(row => row.name === 'schema_migrations');
  check(ledger?.owner === 'postgres' && ledger.kind === 'r' && !ledger.rls && !ledger.forced && !ledger.backend_select && ledger.triggers === 0 && ledger.policies.length === 0, 'Administrative ledger differs');
}
export function expectedAfter(before) {
  const next = structuredClone(before); next.tables.find(row => row.name === 'schema_migrations').rls = true;
  let setting = next.settings.find(row => row.role === 'authenticator' && row.database === 'postgres');
  if (!setting) { setting = { role: 'authenticator', database: 'postgres', values: [] }; next.settings.push(setting); }
  setting.values.push('pgrst.db_schemas=' + AFTER); return next;
}
const normalized = value => JSON.stringify({ ...value, settings: [...value.settings].map(row => ({ ...row, values: [...row.values].sort() })).sort((a, b) => (a.role + '/' + a.database).localeCompare(b.role + '/' + b.database)) });
export function sourceAfter(bytes) {
  const text = bytes.toString(); const line = 'PGRST_DB_SCHEMAS=' + BEFORE;
  check(Buffer.from(text).equals(bytes) && text.split('\n').filter(row => row.startsWith('PGRST_DB_SCHEMAS=')).length === 1 && text.split('\n').includes(line), 'Exact nine-schema source line required');
  return Buffer.from(text.split('\n').map(row => row === line ? 'PGRST_DB_SCHEMAS=' + AFTER : row).join('\n'));
}
export function applySql(before, migration) {
  validateBefore(before);
  check(sha(migration) === MIGRATION_SHA, 'Reviewed migration bytes changed');
  check(migration.replace(/^--.*$/gm, '').trim() === 'ALTER TABLE otazkomat.schema_migrations ENABLE ROW LEVEL SECURITY;', 'Only reviewed ledger RLS SQL allowed');
  return `${sqlPrelude}\nBEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s';
${transactionGuard}
DO $guard$ BEGIN
 IF NOT pg_try_advisory_xact_lock(20420920,3143) THEN RAISE EXCEPTION 'Exposure operator already active'; END IF;
 IF (${snapshotSql}) IS DISTINCT FROM ${literal(JSON.stringify(before))}::jsonb THEN RAISE EXCEPTION 'Exposure metadata drift'; END IF;
END $guard$;
${migration}
ALTER ROLE authenticator IN DATABASE postgres SET pgrst.db_schemas = ${literal(AFTER)};
DO $preserve$ BEGIN IF (${snapshotSql}) IS DISTINCT FROM ${literal(JSON.stringify(expectedAfter(before)))}::jsonb THEN RAISE EXCEPTION 'Unexpected metadata change; rollback required'; END IF; END $preserve$;
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
COMMIT;`;
}
function run(args, input) { const r = spawnSync('/usr/bin/docker', args, { input, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 }); check(r.status === 0, 'Scoped PostgREST metadata operation failed; output suppressed'); return r.stdout; }
function query(sql) { return run(['exec', '-i', '-u', 'postgres', 'supabase-db', 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], sql).trim(); }
function snapshot() { return JSON.parse(query(`${sqlPrelude}\nBEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s'; ${transactionGuard} ${snapshotSql}; COMMIT;`)); }
function container() {
  const c = JSON.parse(run(['inspect', 'supabase-rest']))[0], env = Object.fromEntries(c.Config.Env.map(value => { const at = value.indexOf('='); return [value.slice(0, at), value.slice(at + 1)]; }));
  check(c.Config.Image === 'postgrest/postgrest:v14.12' && c.State.Running && c.Mounts.length === 0 && env.PGRST_DB_SCHEMAS === BEFORE && (!env.PGRST_DB_CONFIG || env.PGRST_DB_CONFIG === 'true') && !env.PGRST_DB_PRE_CONFIG && (!env.PGRST_DB_CHANNEL || env.PGRST_DB_CHANNEL === 'pgrst') && (!env.PGRST_DB_CHANNEL_ENABLED || env.PGRST_DB_CHANNEL_ENABLED === 'true'), 'Running PostgREST configuration differs');
  return { id: c.Id, image: c.Config.Image, pid: c.State.Pid, startedAt: c.State.StartedAt, environmentSchemas: BEFORE };
}
function trusted(path, privateFile = false) {
  let current = '';
  for (const part of path.split('/').filter(Boolean)) { current += '/' + part; const s = lstatSync(current); check(s.uid === 0 && !s.isSymbolicLink() && !(s.mode & 0o022), 'Untrusted operator artifact'); }
  if (privateFile) { const s = lstatSync(path); check(s.isFile() && s.nlink === 1 && (s.mode & 0o777) === 0o600, 'Untrusted private proof'); }
}
function source() { const s = lstatSync(SOURCE); check(realpathSync(SOURCE) === SOURCE && s.uid === 1000 && s.gid === 1000 && s.nlink === 1 && (s.mode & 0o777) === 0o600 && s.isFile(), 'Unexpected developer-owned data source'); return readFileSync(SOURCE); }
function write(name, bytes) { const fd = openSync(BACKUP + '/' + name, 'wx', 0o600); try { fchmodSync(fd, 0o600); writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); } }
function sync() { const fd = openSync(BACKUP, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function absent(path) { try { lstatSync(path); throw Error('Existing exposure attempt/artifact; reconcile before retry'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
export function execute(mode) {
  check(process.getuid() === 0 && ['--stage', '--apply'].includes(mode), 'Reviewed root exposure mode required');
  trusted(fileURLToPath(import.meta.url)); const migrationPath = fileURLToPath(new URL('./' + MIGRATION, import.meta.url)); trusted(migrationPath);
  const migration = readFileSync(migrationPath, 'utf8'); check(sha(migration) === MIGRATION_SHA, 'Reviewed migration bytes changed'); const runtime = container();
  if (mode === '--stage') {
    const original = source(), desired = sourceAfter(original), state = snapshot(); validateBefore(state);
    trusted('/var/backups'); absent(BACKUP); mkdirSync(BACKUP, { mode: 0o700 });
    const proof = { runtime, sourceSha256: sha(original), nextSourceSha256: sha(desired), beforeSha256: sha(JSON.stringify(state)), migration: MIGRATION, migrationSha256: sha(migration), previousSchemas: BEFORE, nextSchemas: AFTER };
    write('before.json', JSON.stringify(state) + '\n'); write('proof.json', JSON.stringify(proof) + '\n'); sync();
    return { staged: true, mutatedDatabase: false, sourcePatched: false, migration: MIGRATION, runtime, sourceSha256: proof.sourceSha256, nextSourceSha256: proof.nextSourceSha256 };
  }
  for (const file of ['before.json', 'proof.json', 'source.env']) trusted(BACKUP + '/' + file, true);
  absent(BACKUP + '/attempt.json');
  const state = JSON.parse(readFileSync(BACKUP + '/before.json')), proof = JSON.parse(readFileSync(BACKUP + '/proof.json'));
  check(JSON.stringify(runtime) === JSON.stringify(proof.runtime) && sha(JSON.stringify(state)) === proof.beforeSha256 && proof.migration === MIGRATION && sha(migration) === proof.migrationSha256 && proof.previousSchemas === BEFORE && proof.nextSchemas === AFTER, 'Staged metadata/runtime/migration changed');
  const original = readFileSync(BACKUP + '/source.env'), patched = source();
  check(sha(original) === proof.sourceSha256 && sha(patched) === proof.nextSourceSha256 && patched.equals(sourceAfter(original)), 'Main must first preserve source.env and patch ONLY the schema line');
  check(normalized(snapshot()) === normalized(state), 'Database metadata drifted before apply');
  const sql = applySql(state, migration);
  write('attempt.json', JSON.stringify({ startedAt: new Date().toISOString(), migration: MIGRATION, migrationSha256: proof.migrationSha256 }) + '\n'); sync();
  query(sql);
  check(normalized(snapshot()) === normalized(expectedAfter(state)), 'Post-commit metadata verification failed; no blind replay/rollback');
  check(JSON.stringify(container()) === JSON.stringify(runtime), 'PostgREST restarted during configuration reload');
  const result = { applied: true, role: 'authenticator', database: 'postgres', schemas: AFTER, schemaLedgerRlsEnabled: true, migration: MIGRATION, migrationSha256: proof.migrationSha256, restPid: runtime.pid, restRestarted: false, grantsChanged: false, appRowsChanged: false, propagationVerified: false };
  write('verified.json', JSON.stringify(result) + '\n'); sync(); return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { check(process.argv.length === 3, 'Usage --stage|--apply'); console.log(JSON.stringify(execute(process.argv[2]))); }
  catch { console.error('Fixed PostgREST exposure operation stopped; inspect private metadata/attempt before retry. No credential or source contents printed.'); process.exitCode = 1; }
}
