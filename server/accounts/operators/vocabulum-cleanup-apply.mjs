// Fixed-target operator. No execution occurs on import or without --apply.
// Never print generated SQL: it contains protected backup rows.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TARGETS, OWNER, TABLES, validateBackup, PRIVATE_SQL_LOGGING } from './vocabulum-cleanup-backup.mjs';

export const BACKUPS = Object.freeze([
 '/var/backups/developed-vocabulum-cleanup/2026-09-20T17-01-41-710Z.json',
 '/root/developed-vocabulum-cleanup-recovery/2026-09-20T17-01-41-710Z.json',
]);
export const BACKUP_SHA256 = '97890ec0f0965e1ae769b6fbd830944d8093d1ae98b1a8d0dea65835cc4074f6';
const ids=TARGETS.map(id=>`'${id}'`).join(',');
const removalOrder=['auth.mfa_amr_claims','auth.refresh_tokens','auth.sessions','voc_builder.memberships','core.app_access','core.profiles','auth.identities','auth.users'];

export function buildApplySql(backup,{commit=false}={}) {
 validateBackup(backup);
 const encoded=Buffer.from(JSON.stringify(backup)).toString('hex');
 const lockRows=TABLES.map(([table,predicate])=>`PERFORM 1 FROM ${table} WHERE ${predicate} ORDER BY to_jsonb(${table.split('.')[1]})::text FOR UPDATE;`).join('\n');
 const equalRows=TABLES.map(([table,predicate])=>`SELECT coalesce(jsonb_agg(to_jsonb(actual_row) ORDER BY to_jsonb(actual_row)::text),'[]'::jsonb) INTO actual FROM ${table} actual_row WHERE ${predicate};
IF actual IS DISTINCT FROM expected->'rows'->'${table}' THEN RAISE EXCEPTION 'Target snapshot changed; capture and review again'; END IF;`).join('\n');
 const removals=removalOrder.map(table=>{
  const predicate=TABLES.find(([name])=>name===table)[1];
  return `DELETE FROM ${table} WHERE ${predicate}; GET DIAGNOSTICS affected=ROW_COUNT;
IF affected<>3 THEN RAISE EXCEPTION 'Unexpected deletion count'; END IF;`;
 }).join('\n');
 return `${PRIVATE_SQL_LOGGING}
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='500ms';
SET LOCAL idle_in_transaction_session_timeout='30s'; SET LOCAL search_path=pg_catalog;
DO $cleanup$
DECLARE
 expected jsonb := convert_from(decode('${encoded}','hex'),'UTF8')::jsonb;
 actual jsonb; before_hashes jsonb := '{}'::jsonb; digest text; r record; unexpected bigint; affected integer; latest_issuance timestamptz;
 parent_name text; child_name text; join_sql text; scanned integer:=0;
 target_ids constant text[]:=ARRAY[${ids}];
BEGIN
 IF NOT pg_try_advisory_xact_lock(20660920,170141) THEN RAISE EXCEPTION 'Concurrent cleanup operator'; END IF;
 ${lockRows}
 ${equalRows}
 SELECT max(stamp.value::timestamptz) INTO latest_issuance
 FROM jsonb_each(expected->'rows') tab CROSS JOIN LATERAL jsonb_array_elements(tab.value) entry
 CROSS JOIN LATERAL jsonb_each_text(entry.value) stamp
 WHERE tab.key IN ('auth.users','auth.sessions','auth.refresh_tokens')
 AND stamp.key IN ('last_sign_in_at','created_at','updated_at','refreshed_at');
 IF latest_issuance IS NULL OR latest_issuance > clock_timestamp()-interval '3660 seconds' THEN
   RAISE EXCEPTION 'Recent provider token issuance; reassess JWT expiry before deleting'; END IF;
 IF (SELECT count(*) FROM core.profiles WHERE id='${OWNER}')<>1 OR
    (SELECT role::text FROM voc_builder.memberships WHERE user_id='${OWNER}') IS DISTINCT FROM 'SUPERADMIN' THEN
   RAISE EXCEPTION 'Owner protection failed'; END IF;
 IF (SELECT registration_mode FROM accounts.settings WHERE singleton) IS DISTINCT FROM 'closed' OR
    (SELECT count(*) FROM accounts.app_settings)<>7 OR
    (SELECT count(*) FROM accounts.app_settings WHERE NOT published AND NOT reportable AND NOT enforce_oidc AND join_policy='closed')<>7 OR
    EXISTS(SELECT 1 FROM accounts.outbox) THEN RAISE EXCEPTION 'Closed SSO gates changed'; END IF;
 IF EXISTS(SELECT 1 FROM core.app_access aa JOIN core.apps a ON a.id=aa.app_id WHERE aa.user_id::text=ANY(target_ids) AND a.schema_name<>'voc_builder') THEN
   RAISE EXCEPTION 'Other app membership detected'; END IF;
 -- Recheck every UUID and ID-like text column, including references without FKs.
 FOR r IN SELECT n.nspname,c.relname,a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
   AND (a.atttypid='uuid'::regtype OR (a.atttypid IN ('text'::regtype,'varchar'::regtype) AND a.attname ~* '(id$|^owner$|^user$|^actor$|^subject$)'))
 LOOP
   scanned:=scanned+1;
   EXECUTE format('SELECT count(*) FROM %I.%I r WHERE %I::text=ANY($1) AND NOT coalesce($2,''[]''::jsonb) @> jsonb_build_array(to_jsonb(r))',r.nspname,r.relname,r.attname)
   INTO unexpected USING target_ids,expected->'rows'->(r.nspname||'.'||r.relname);
   IF unexpected<>0 THEN RAISE EXCEPTION 'Unexpected target reference; transfer/data review required'; END IF;
 END LOOP;
 IF scanned<503 THEN RAISE EXCEPTION 'Reference scan coverage decreased'; END IF;
 -- Every child of every removed row must itself be present in the exact backup.
 FOR r IN SELECT con.*,pn.nspname parent_schema,p.relname parent_table,cn.nspname child_schema,c.relname child_table
   FROM pg_constraint con JOIN pg_class p ON p.oid=con.confrelid JOIN pg_namespace pn ON pn.oid=p.relnamespace JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
   WHERE con.contype='f' AND expected->'rows' ? (pn.nspname||'.'||p.relname)
 LOOP
   parent_name:=r.parent_schema||'.'||r.parent_table; child_name:=r.child_schema||'.'||r.child_table;
   SELECT string_agg(format('ch.%I=p.%I',ca.attname,pa.attname),' AND ' ORDER BY k.ord) INTO join_sql
   FROM unnest(r.conkey,r.confkey) WITH ORDINALITY k(child_att,parent_att,ord)
   JOIN pg_attribute ca ON ca.attrelid=r.conrelid AND ca.attnum=k.child_att
   JOIN pg_attribute pa ON pa.attrelid=r.confrelid AND pa.attnum=k.parent_att;
   EXECUTE format('SELECT count(*) FROM %I.%I ch JOIN %I.%I p ON %s WHERE $1 @> jsonb_build_array(to_jsonb(p)) AND NOT coalesce($2,''[]''::jsonb) @> jsonb_build_array(to_jsonb(ch))',r.child_schema,r.child_table,r.parent_schema,r.parent_table,join_sql)
   INTO unexpected USING expected->'rows'->parent_name,expected->'rows'->child_name;
   IF unexpected<>0 THEN RAISE EXCEPTION 'Unbacked FK child; cascading deletion refused'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled<>'D' AND (t.tgtype & 8)<>0 AND expected->'rows' ? (n.nspname||'.'||c.relname)) THEN
   RAISE EXCEPTION 'Unexpected DELETE trigger'; END IF;
 -- Hash all Voc relational content plus every non-target row in affected tables.
 -- The audio cache is not referenced by these accounts or FK deletion paths.
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r'
   AND ((n.nspname='voc_builder' AND c.relname<>'tts_audio_cache') OR expected->'rows' ? (n.nspname||'.'||c.relname))
 LOOP
   EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)::text) FROM %I.%I t WHERE NOT coalesce($1,''[]''::jsonb) @> jsonb_build_array(to_jsonb(t))',r.nspname,r.relname)
   INTO digest USING expected->'rows'->(r.nspname||'.'||r.relname);
   before_hashes:=before_hashes||jsonb_build_object(r.nspname||'.'||r.relname,digest);
 END LOOP;
 -- Revoke provider session material first, then remove empty app/identity rows.
 ${removals}
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r'
   AND before_hashes ? (n.nspname||'.'||c.relname)
 LOOP
   EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb)::text) FROM %I.%I t',r.nspname,r.relname) INTO digest;
   IF digest IS DISTINCT FROM before_hashes->>(r.nspname||'.'||r.relname) THEN RAISE EXCEPTION 'Preserved data fingerprint changed'; END IF;
 END LOOP;
 RAISE NOTICE 'Fixed-target cleanup verified: 3 empty identities, 24 exact rows; owner and remaining relational data preserved';
END $cleanup$;
${commit?'COMMIT':'ROLLBACK'};`;
}

export function readVerifiedBackup() {
 const copies=BACKUPS.map(file=>{
   let current=''; for(const component of file.split('/').filter(Boolean)) {
     current+=`/${component}`;const stat=lstatSync(current);
     if(stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o022))throw Error('Unsafe backup path');
   }
   const stat=lstatSync(file);if(!stat.isFile()||(stat.mode&0o777)!==0o600||stat.nlink!==1)throw Error('Unsafe backup file');
   return readFileSync(file);
 });
 if(!copies[0].equals(copies[1]) || createHash('sha256').update(copies[0]).digest('hex')!==BACKUP_SHA256)throw Error('Backup checksum mismatch');
 const backup=JSON.parse(copies[0]);validateBackup(backup);return backup;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {
   if(process.argv.length===2){console.log('Validation only: fixed-target cleanup source loaded; no database connection. --apply requires coordinator review and root.');}
   else {
     if(process.argv.length!==3||process.argv[2]!=='--apply'||process.getuid()!==0)throw Error('Unsupported execution');
     for(const provider of ['supabase-auth','developed-auth-green']) {
       const expiry=spawnSync('docker',['exec',provider,'printenv','GOTRUE_JWT_EXP'],{encoding:'utf8',timeout:5000});
       if(expiry.status!==0||expiry.stdout.trim()!=='3600')throw Error('Provider JWT lifetime changed');
     }
     const sql=buildApplySql(readVerifiedBackup(),{commit:true});
     const result=spawnSync('docker',['exec','-i','supabase-db','psql','-U','supabase_admin','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:40000,maxBuffer:1024*1024});
     if(result.status!==0)throw Error('Apply failed; inspect exact state before retrying');
     console.log('Cleanup committed: 3 fixed empty accounts and 24 exact rows removed; preservation fingerprints passed.');
   }
 } catch { console.error('Cleanup did not report success. Database output is suppressed. Inspect exact target state before any retry; do not infer rollback after a lost connection.');process.exitCode=1; }
}
