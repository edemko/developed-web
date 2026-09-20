// Fixed, separate cutover steps; importing/dry-running never connects to a DB.
// Publication is NOT enforcement and is NOT permission to expose human SSO.
import { createHash } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { lstatSync, readFileSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrations as central } from './apply-central-migration.mjs';
import { seedName, seedSha256, reviewedImage, stagedMigrations } from './apply-app-migration.mjs';
import { appMigrations } from './review-app-migrations.mjs';

export const PHASES = Object.freeze(['publish', 'enforce', 'kestrek-raw-token']);
export const APPS = Object.freeze(['app_mega_music','app_kestrek','app_screentime','app_airsoft','app_voc_builder','app_odonto','app_otazkomat']);
export const BACKUP_ROOT = '/var/backups/developed-final-policy-20260920';
const self = fileURLToPath(import.meta.url);
const q = text => `'${text.replaceAll("'", "''")}'`;
const ids = APPS.map(q).join(',');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reject = () => Error('Final policy operation rejected; diagnostics withheld');
const sqlPrelude = `SET log_statement='none'; SET log_min_duration_statement=-1; SET log_min_duration_sample=-1;
SET log_duration=off; SET log_min_error_statement='panic'; SET log_error_verbosity='terse';
SET log_parameter_max_length=0; SET log_parameter_max_length_on_error=0; SET pgaudit.log='none';
SET auto_explain.log_min_duration=-1; SET pg_stat_statements.track='none';`;
const bodies = {
  publish: `UPDATE accounts.app_settings SET published=true,reportable=true,join_policy='free' WHERE app_id IN (${ids});`,
  enforce: `UPDATE accounts.app_settings SET enforce_oidc=true WHERE app_id IN (${ids});`,
};
const raw = appMigrations.at(-1);
export function phaseEntry(phase) {
  if (!PHASES.includes(phase)) throw reject();
  return phase === 'kestrek-raw-token' ? { file:raw.file, sha256:raw.sha256 }
    : { file:`final-seven-app-${phase}-20260920-v1`, sha256:hash(bodies[phase]) };
}

// Only metadata and a digest of the complete seven app configuration rows.
// No user/session/mail payload or signing material is returned or backed up.
// Ke ACL arrays preserve exact grantors/options for separately reviewed recovery.
export const snapshotExpression = `jsonb_build_object(
 'policies',(SELECT jsonb_agg(jsonb_build_object('app_id',app_id,'published',published,'reportable',reportable,'enforce_oidc',enforce_oidc,'join_policy',join_policy) ORDER BY app_id) FROM accounts.app_settings),
 'configuration_digest',(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY app_id),'[]'::jsonb)::text) FROM accounts.app_settings a),
 'client_digest',(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY client_id),'[]'::jsonb)::text) FROM accounts.oauth_clients c),
 'ledger',(SELECT jsonb_agg(to_jsonb(l) ORDER BY source_file) FROM accounts.app_deployment_migrations l),
 'schema_acl',(SELECT jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl) FROM pg_namespace WHERE nspname='kestrek'),
 'relation_acls',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='kestrek'::regnamespace AND c.relkind IN ('r','p','v','m','S','f')),
 'column_acls',(SELECT coalesce(jsonb_agg(jsonb_build_object('relation',c.relname,'column',a.attname,'acl',a.attacl) ORDER BY c.relname,a.attnum),'[]'::jsonb) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='kestrek'::regnamespace AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL),
 'routine_acls',(SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='kestrek'::regnamespace),
 'default_acls',(SELECT coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'type',d.defaclobjtype,'acl',d.defaclacl) ORDER BY d.defaclrole,d.defaclobjtype),'[]'::jsonb) FROM pg_default_acl d WHERE d.defaclnamespace='kestrek'::regnamespace)
)`;

function guards(phase) {
  const index = PHASES.indexOf(phase);
  if (index < 0) throw reject();
  const previous = [{file:seedName,sha256:seedSha256},...stagedMigrations,...PHASES.slice(0,index).map(phaseEntry)];
  return `
 IF session_user<>'supabase_admin' OR current_database()<>'postgres' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper)
 THEN RAISE EXCEPTION 'Trusted Supabase operator required'; END IF;
 IF (SELECT count(*) FROM accounts.settings)<>1 OR (SELECT registration_mode FROM accounts.settings WHERE singleton) IS DISTINCT FROM 'closed'
 OR EXISTS(SELECT 1 FROM accounts.outbox) THEN RAISE EXCEPTION 'Registration/mail staging gate changed'; END IF;
 IF (SELECT count(*) FROM accounts.deployment_migrations)<>3 OR
 (SELECT count(*) FROM accounts.app_deployment_migrations)<>${previous.length} THEN RAISE EXCEPTION 'Unexpected migration count'; END IF;
 ${central.map(m=>`IF NOT EXISTS(SELECT 1 FROM accounts.deployment_migrations WHERE version='${m.version}' AND source_sha256='${m.sha256}') THEN RAISE EXCEPTION 'Central checksum mismatch'; END IF;`).join('\n')}
 ${previous.map(m=>`IF NOT EXISTS(SELECT 1 FROM accounts.app_deployment_migrations WHERE source_file=${q(m.file)} AND source_sha256='${m.sha256}') THEN RAISE EXCEPTION 'App checksum mismatch'; END IF;`).join('\n')}
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('accounts.deployment_migrations'::regclass,'accounts.app_deployment_migrations'::regclass)
 AND (pg_get_userbyid(relowner)<>'postgres' OR relkind<>'r' OR NOT relrowsecurity OR NOT relforcerowsecurity))
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid IN ('accounts.deployment_migrations'::regclass,'accounts.app_deployment_migrations'::regclass))
 THEN RAISE EXCEPTION 'Unsafe migration ledger'; END IF;
 IF (SELECT count(*) FROM accounts.app_settings)<>7 OR
 (SELECT count(*) FROM accounts.app_settings WHERE app_id IN (${ids}) AND published=${index>0} AND reportable=${index>0}
 AND enforce_oidc=${index>1} AND join_policy='${index>0?'free':'closed'}' AND free_plan='free'
 AND oauth_client_id IS NOT NULL AND server_key_hash IS NOT NULL AND callback_url IS NOT NULL)<>7
 OR (SELECT count(*) FROM core.apps WHERE id IN (${ids}) AND status='ACTIVE' AND deleted_at IS NULL)<>7
 THEN RAISE EXCEPTION 'Exact seven-app policy/configuration mismatch'; END IF;
 IF (SELECT count(*) FROM accounts.oauth_clients)<>8 OR (SELECT count(*) FROM accounts.oauth_clients WHERE enabled)<>8
 OR (SELECT count(*) FROM accounts.oauth_clients o JOIN accounts.app_settings a ON a.app_id=o.app_id AND a.oauth_client_id=o.client_id AND a.callback_url=o.callback_url WHERE o.client_kind='web')<>7
 OR (SELECT count(*) FROM accounts.oauth_clients WHERE client_kind='native' AND app_id='app_kestrek' AND callback_url='sk.kestrek://oauth/callback')<>1
 THEN RAISE EXCEPTION 'Web/native client registration mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid IN ('accounts.app_settings'::regclass,'accounts.app_deployment_migrations'::regclass) AND NOT tgisinternal AND tgenabled<>'D')
 THEN RAISE EXCEPTION 'Unexpected policy/ledger trigger'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='kestrek' AND pg_get_userbyid(nspowner)='postgres')
 OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='kestrek'::regnamespace AND relkind IN ('r','p','v','m','S','f')
 AND pg_get_userbyid(relowner)<>CASE WHEN relname='schema_migrations' AND relkind='r' THEN 'supabase_admin' ELSE 'postgres' END)
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='kestrek'::regnamespace AND pg_get_userbyid(proowner) NOT IN ('postgres','supabase_admin'))
 THEN RAISE EXCEPTION 'Unexpected Ke ownership'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE rolname='kestrek_backend' AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolcanlogin OR rolinherit)
 AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)) THEN RAISE EXCEPTION 'Unsafe Ke backend role'; END IF;
 `;
}

export function backupSql(phase) {
  return `${sqlPrelude}\nBEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='500ms'; SET LOCAL search_path=pg_catalog;
DO $guard$ BEGIN ${guards(phase)} END $guard$;
SELECT ${snapshotExpression}; COMMIT;`;
}

// ACL normalization excludes ONLY principals explicitly retired by pinned SQL.
// Comparing this before/after proves backend and all other grants stay identical.
export const retainedAclExpression = `(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.object,x.grantor,x.grantee,x.privilege_type,x.is_grantable),'[]'::jsonb) FROM (
 SELECT 'schema:kestrek' object,e.* FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) e WHERE n.nspname='kestrek'
 UNION ALL SELECT 'relation:'||c.relname,e.* FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) e WHERE c.relnamespace='kestrek'::regnamespace AND c.relkind IN ('r','p','v','m','S','f')
 UNION ALL SELECT 'routine:'||p.oid::regprocedure::text,e.* FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) e WHERE p.pronamespace='kestrek'::regnamespace
 UNION ALL SELECT 'default:'||d.defaclrole::text||':'||d.defaclobjtype::text,e.* FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) e WHERE d.defaclnamespace='kestrek'::regnamespace
 ) x WHERE x.grantee<>0 AND x.grantee NOT IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated')))`;

export function buildApplySql(phase, snapshot, rawBytes) {
  const entry=phaseEntry(phase);
  if (!snapshot || snapshot.policies?.length!==7 || typeof snapshot.configuration_digest!=='string') throw reject();
  let body=bodies[phase];
  if (phase==='kestrek-raw-token') {
    if (!Buffer.isBuffer(rawBytes) || hash(rawBytes)!==raw.sha256) throw reject();
    const source=rawBytes.toString();
    const boundaries=[...source.matchAll(/^(BEGIN|COMMIT);$/gm)];
    if(boundaries.length!==2 || boundaries[0][1]!=='BEGIN' || boundaries[1][1]!=='COMMIT' || source.slice(boundaries[1].index+7).trim()) throw reject();
    body=`SET LOCAL ROLE supabase_admin;\n${source.slice(boundaries[0].index+6,boundaries[1].index)}\nSET LOCAL ROLE postgres;`;
  }
  const expected=Buffer.from(JSON.stringify(snapshot)).toString('hex');
  const targetFields=phase==='publish' ? `ARRAY['published','reportable','join_policy']` : phase==='enforce' ? `ARRAY['enforce_oidc']` : `ARRAY[]::text[]`;
  return `${sqlPrelude}
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='500ms'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='30s'; SET LOCAL search_path=pg_catalog;
SET LOCAL ROLE postgres;
DO $lock$ BEGIN IF NOT pg_try_advisory_xact_lock(194812,20260920) THEN RAISE EXCEPTION 'Concurrent deployment'; END IF; END $lock$;
LOCK TABLE accounts.settings,accounts.app_settings,accounts.oauth_clients,accounts.app_deployment_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ BEGIN ${guards(phase)}
 IF ${snapshotExpression} IS DISTINCT FROM convert_from(decode('${expected}','hex'),'UTF8')::jsonb THEN RAISE EXCEPTION 'Reviewed snapshot changed'; END IF;
END $guard$;
DO $capture$ BEGIN
 PERFORM set_config('developed.final_policy_settings',(SELECT jsonb_agg(to_jsonb(a)-${targetFields} ORDER BY app_id)::text FROM accounts.app_settings a),true);
 PERFORM set_config('developed.final_policy_acls',${retainedAclExpression}::text,true);
 PERFORM set_config('developed.final_policy_clients',(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY client_id),'[]'::jsonb)::text) FROM accounts.oauth_clients c),true);
END $capture$;
${body}
DO $post$ BEGIN
 IF (SELECT count(*) FROM accounts.app_settings WHERE published AND reportable AND join_policy='free' AND enforce_oidc=${phase!=='publish'})<>7
 OR (SELECT jsonb_agg(to_jsonb(a)-${targetFields} ORDER BY app_id) FROM accounts.app_settings a) IS DISTINCT FROM current_setting('developed.final_policy_settings')::jsonb
 OR (SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY client_id),'[]'::jsonb)::text) FROM accounts.oauth_clients c) IS DISTINCT FROM current_setting('developed.final_policy_clients')
 OR ${retainedAclExpression} IS DISTINCT FROM current_setting('developed.final_policy_acls')::jsonb
 THEN RAISE EXCEPTION 'Selected-field or retained-grant preservation failed'; END IF;
 ${phase==='kestrek-raw-token' ? `
 IF EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) e WHERE n.nspname='kestrek' AND (e.grantee=0 OR e.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))))
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) e WHERE c.relnamespace='kestrek'::regnamespace AND c.relkind IN ('r','p','v','m','S','f') AND (e.grantee=0 OR e.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))))
 OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) e WHERE p.pronamespace='kestrek'::regnamespace AND (e.grantee=0 OR e.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))))
 OR EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) e WHERE d.defaclnamespace='kestrek'::regnamespace AND d.defaclrole='postgres'::regrole AND (e.grantee=0 OR e.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))))
 THEN RAISE EXCEPTION 'Legacy Ke ACL remains'; END IF;
 IF NOT has_schema_privilege('kestrek_backend','kestrek','USAGE') THEN RAISE EXCEPTION 'Backend schema access lost'; END IF;` : ''}
END $post$;
INSERT INTO accounts.app_deployment_migrations(source_file,source_sha256) VALUES(${q(entry.file)},'${entry.sha256}');
`;
}

export function safePath(path, {file=false,privateFile=false}={}) {
  let current='';
  for(const segment of path.split('/').filter(Boolean)) {
    current+=`/${segment}`;const s=lstatSync(current);
    if(s.isSymbolicLink() || s.uid!==0 || (s.mode&0o022)) throw reject();
    if(current!==path && !s.isDirectory()) throw reject();
  }
  const s=lstatSync(path);
  if(file && (!s.isFile() || s.nlink!==1 || (privateFile && (s.mode&0o777)!==0o600))) throw reject();
}
function save(path,bytes) {
  const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  safePath(path,{file:true,privateFile:true});
  const dirFd=openSync(dirname(path),'r');try{fsyncSync(dirFd);}finally{closeSync(dirFd);}
}
function docker(args,input) {
  const result=spawnSync('docker',args,{input,encoding:'utf8',timeout:40000,maxBuffer:8*1024*1024});
  if(result.status!==0 || /WARNING|ERROR|FATAL/.test(result.stderr??'')) throw reject();
  return result.stdout.trim();
}
const psql=['exec','-i','supabase-db','psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];

// Do not send COMMIT until all SQL and warnings have arrived on one ordered pipe.
export async function executeTransaction(sql) {
  return new Promise((resolve,rejectPromise)=>{
    const child=spawn('docker',['exec','-i','supabase-db','sh','-c','exec psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -Atq 2>&1'],{stdio:['pipe','pipe','pipe']});
    let output='',error='',commitSent=false,handled=false;
    const timer=setTimeout(()=>{child.kill();rejectPromise(reject());},40000);
    child.stderr.on('data',bytes=>{error+=bytes;});
    child.stdout.on('data',bytes=>{
      output+=bytes;
      if(!handled && output.includes('FINAL_POLICY_READY\n')) {
        handled=true;
        if(/WARNING|ERROR|FATAL/.test(output+error)) child.stdin.end('ROLLBACK;\n\\q\n');
        else {commitSent=true;child.stdin.end('COMMIT;\n\\q\n');}
      }
    });
    child.stdin.on('error',()=>{});
    child.on('error',()=>{clearTimeout(timer);rejectPromise(reject());});
    child.on('close',code=>{clearTimeout(timer);if(code!==0||!commitSent||/WARNING|ERROR|FATAL/.test(output+error)) rejectPromise(reject());else resolve();});
    child.stdin.write(`${sql}\n\\echo FINAL_POLICY_READY\n`);
  });
}

export async function run(args=[]) {
  if(args.length!==2 && args.length!==3) throw reject();
  if(args[0]!=='--phase' || !PHASES.includes(args[1]) || (args[2] && !['--stage','--apply'].includes(args[2]))) throw reject();
  const phase=args[1],entry=phaseEntry(phase),mode=args[2];
  const rawBytes=readFileSync(new URL('./final-policy-operator-kestrek.sql',import.meta.url));
  if(hash(rawBytes)!==raw.sha256) throw reject();
  if(!mode) return {phase,sourceSha256:entry.sha256,mode:'offline; no connection or mutation'};
  if(process.getuid()!==0) throw reject();
  for(const name of ['final-policy-operator.mjs','final-policy-operator-kestrek.sql','apply-central-migration.mjs','apply-app-migration.mjs','review-app-migrations.mjs']) safePath(join(dirname(self),name),{file:true});
  if(docker(['inspect','--format','{{.Image}} {{.State.Running}}','supabase-db'])!==`${reviewedImage} true`) throw reject();
  const directory=join(BACKUP_ROOT,phase);
  const payloadPath=join(directory,'snapshot.json'),proofPath=join(directory,'proof.json');
  if(mode==='--stage') {
    safePath('/var/backups');
    try{mkdirSync(BACKUP_ROOT,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
    safePath(BACKUP_ROOT);if((lstatSync(BACKUP_ROOT).mode&0o777)!==0o700)throw reject();
    mkdirSync(directory,{mode:0o700});safePath(directory);
    const snapshot=JSON.parse(docker(psql,backupSql(phase)));
    const bytes=Buffer.from(JSON.stringify(snapshot)+'\n');
    const sql=buildApplySql(phase,snapshot,rawBytes);
    save(payloadPath,bytes);
    save(proofPath,Buffer.from(JSON.stringify({phase,sourceSha256:entry.sha256,operatorSha256:hash(readFileSync(self)),snapshotSha256:hash(bytes),sqlSha256:hash(sql)})+'\n'));
    return {phase,staged:true,databaseMutated:false,snapshotSha256:hash(bytes)};
  }
  safePath(payloadPath,{file:true,privateFile:true});safePath(proofPath,{file:true,privateFile:true});
  const bytes=readFileSync(payloadPath),proof=JSON.parse(readFileSync(proofPath)),sql=buildApplySql(phase,JSON.parse(bytes),rawBytes);
  if(proof.phase!==phase || proof.sourceSha256!==entry.sha256 || proof.operatorSha256!==hash(readFileSync(self)) || proof.snapshotSha256!==hash(bytes) || proof.sqlSha256!==hash(sql)) throw reject();
  // Existing applied marker is never removed; repeated apply is also SQL-denied.
  try{lstatSync(join(directory,'applied.json'));throw reject();}catch(error){if(error.code!=='ENOENT')throw error;}
  await executeTransaction(sql);
  const count=docker(psql,`BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT count(*) FROM accounts.app_deployment_migrations WHERE source_file=${q(entry.file)} AND source_sha256='${entry.sha256}'; COMMIT;`);
  if(count!=='1') throw reject();
  save(join(directory,'applied.json'),Buffer.from(JSON.stringify({phase,sourceSha256:entry.sha256,verified:true})+'\n'));
  return {phase,committed:true,ledgerVerified:true,humanIngressUnchanged:true,registrationAndMailUnchanged:true};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(()=>{
    console.error('Final policy did not report success; diagnostics withheld. Reconcile the exact ledger before retrying, especially after transport loss. No automatic security rollback.');process.exitCode=1;
  });
}
