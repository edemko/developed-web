// Fixed first-owner bootstrap; never changes provider credentials or MFA.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, lstatSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const OWNER = '4c3e497a-511d-49dc-85fe-60f3cc37c3ae';
export const EMAIL = 'erik.demko162@gmail.com';
export const BACKUP = '/var/backups/developed-central-superadmin-20260920';
export const ACTION = 'operator_initial_central_superadmin';
const audit = { actor_id: null, target_id: OWNER, action: ACTION, result: 'succeeded', context: { operator: 'user-approved-vps-operator', previous_role: 'USER', next_role: 'SUPERADMIN', mfa_bypass: false } };
const check = (ok, message) => assert.ok(ok, message);
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const prelude = `SET log_statement='none'; SET log_min_duration_statement=-1; SET log_min_duration_sample=-1;
SET log_duration=off; SET log_min_error_statement='panic'; SET log_error_verbosity='terse';
SET log_parameter_max_length=0; SET log_parameter_max_length_on_error=0; SET pgaudit.log='none';
SET auto_explain.log_min_duration=-1; SET pg_stat_statements.track='none';`;
const guard = `SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s';
DO $identity$ BEGIN IF session_user <> 'supabase_admin' OR current_database() <> 'postgres' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'Unexpected bootstrap identity'; END IF; END $identity$;`;
export const snapshotSql = `SELECT jsonb_build_object(
 'profile',(SELECT to_jsonb(p) FROM core.profiles p WHERE p.id='${OWNER}'),
 'identity',(SELECT jsonb_build_object('id',u.id,'email',u.email,'confirmed',u.email_confirmed_at IS NOT NULL) FROM auth.users u WHERE u.id='${OWNER}'),
 'superadmins',(SELECT count(*) FROM core.profiles WHERE role::text='SUPERADMIN'),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.oid::regclass::text,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'rls',c.relrowsecurity,'triggers',(SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'rules',(SELECT count(*) FROM pg_rewrite r WHERE r.ev_class=c.oid)) ORDER BY c.oid) FROM pg_class c WHERE c.oid IN ('core.profiles'::regclass,'accounts.audit'::regclass)),
 'audit',coalesce((SELECT jsonb_agg(jsonb_build_object('actor_id',actor_id,'target_id',target_id,'action',action,'result',result,'context',context) ORDER BY id) FROM accounts.audit WHERE action='${ACTION}'),'[]'::jsonb)
)`;
export function validateBefore(state) {
  check(state.profile?.id === OWNER && state.profile.role === 'USER', 'Expected exact existing owner USER profile');
  check(isDeepStrictEqual(state.identity, { id: OWNER, email: EMAIL, confirmed: true }), 'Expected exact confirmed owner identity');
  check(state.superadmins === 0 && state.audit.length === 0, 'Bootstrap is initial and one-shot only');
  check(state.tables.length === 2 && state.tables.every(t => ['core.profiles','accounts.audit'].includes(t.name) && t.kind === 'r' && t.triggers === 0 && t.rules === 0), 'Profile/audit side effects require review');
}
export function expectedAfter(state) { const after = structuredClone(state); after.profile.role = 'SUPERADMIN'; after.superadmins = 1; after.audit = [audit]; return after; }
export function applySql(before) {
  validateBefore(before);
  return `${prelude}\nBEGIN; ${guard}
LOCK TABLE core.profiles, accounts.audit IN SHARE ROW EXCLUSIVE MODE;
SELECT id FROM auth.users WHERE id='${OWNER}' FOR SHARE;
DO $bootstrap$ DECLARE changed integer; BEGIN
 IF NOT pg_try_advisory_xact_lock(20420920,3140) THEN RAISE EXCEPTION 'Bootstrap operator already active'; END IF;
 IF (${snapshotSql}) IS DISTINCT FROM ${literal(JSON.stringify(before))}::jsonb THEN RAISE EXCEPTION 'Bootstrap state drift'; END IF;
 UPDATE core.profiles SET role='SUPERADMIN' WHERE id='${OWNER}' AND role::text='USER';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 1 THEN RAISE EXCEPTION 'Bootstrap must change exactly one profile'; END IF;
 INSERT INTO accounts.audit(actor_id,target_id,action,result,context) VALUES(NULL,'${OWNER}','${ACTION}','succeeded',${literal(JSON.stringify(audit.context))}::jsonb);
 IF (${snapshotSql}) IS DISTINCT FROM ${literal(JSON.stringify(expectedAfter(before)))}::jsonb THEN RAISE EXCEPTION 'Unexpected bootstrap side effect'; END IF;
END $bootstrap$; COMMIT;`;
}
function query(sql) { const r = spawnSync('/usr/bin/docker', ['exec','-i','-u','postgres','supabase-db','psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'], { input: sql, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 }); check(r.status === 0, 'Scoped bootstrap SQL failed; output suppressed'); return r.stdout.trim(); }
function snapshot() { return JSON.parse(query(`${prelude}\nBEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; ${guard} ${snapshotSql}; COMMIT;`)); }
function trusted(path, privateFile = false) { let current = ''; for (const part of path.split('/').filter(Boolean)) { current += '/' + part; const s = lstatSync(current); check(s.uid === 0 && !s.isSymbolicLink() && !(s.mode & 0o022), 'Untrusted operator path'); } if (privateFile) { const s = lstatSync(path); check(s.isFile() && s.nlink === 1 && (s.mode & 0o777) === 0o600, 'Untrusted protected artifact'); } }
function absent(path) { try { lstatSync(path); throw Error('Existing bootstrap artifact: reconcile, never replay'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
function write(name, value) { const fd = openSync(BACKUP + '/' + name, 'wx', 0o600); try { writeFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); } const dir = openSync(BACKUP, 'r'); try { fsyncSync(dir); } finally { closeSync(dir); } }
export function execute(mode) {
  check(process.getuid() === 0 && ['--stage','--apply'].includes(mode), 'Reviewed root bootstrap mode required');
  const self = fileURLToPath(import.meta.url); trusted(self); const operatorSha256 = sha(readFileSync(self));
  if (mode === '--stage') {
    const before = snapshot(); validateBefore(before); trusted('/var/backups'); absent(BACKUP); mkdirSync(BACKUP, { mode: 0o700 });
    write('before.json', before); write('proof.json', { operatorSha256, beforeSha256: sha(JSON.stringify(before)), owner: OWNER, previousRole: 'USER', nextRole: 'SUPERADMIN' });
    return { staged: true, databaseWritten: false, confirmedOwner: true, existingSuperadmins: 0, profileTriggers: 0, auditTriggers: 0 };
  }
  for (const file of ['before.json','proof.json']) trusted(BACKUP + '/' + file, true);
  absent(BACKUP + '/attempt.json'); absent(BACKUP + '/verified.json');
  const before = JSON.parse(readFileSync(BACKUP + '/before.json')), proof = JSON.parse(readFileSync(BACKUP + '/proof.json'));
  check(proof.operatorSha256 === operatorSha256 && proof.beforeSha256 === sha(JSON.stringify(before)) && proof.owner === OWNER && proof.previousRole === 'USER' && proof.nextRole === 'SUPERADMIN', 'Bootstrap proof differs');
  validateBefore(before); check(isDeepStrictEqual(snapshot(), before), 'Bootstrap state drift before transaction');
  write('attempt.json', { startedAt: new Date().toISOString(), operatorSha256 }); query(applySql(before));
  check(isDeepStrictEqual(snapshot(), expectedAfter(before)), 'Committed bootstrap needs reconciliation; do not replay');
  const result = { applied: true, changedProfiles: 1, auditEntries: 1, passwordChanged: false, mfaChanged: false, sessionsChanged: false, productRolesChanged: false, mailQueued: false, humanIngressOpened: false, firstLoginRequiresMfa: true };
  write('verified.json', result); return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { check(process.argv.length === 3, 'Usage --stage|--apply'); console.log(JSON.stringify(execute(process.argv[2]))); } catch { console.error('Fixed owner bootstrap stopped. Inspect protected proof; do not replay an ambiguous attempt. No private state printed.'); process.exitCode = 1; } }
