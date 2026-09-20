// Recovery SQL generator only: intentionally no CLI or database execution path.
// Never print generated SQL; it contains protected identity backup rows.
import {TARGETS,TABLES,validateBackup,PRIVATE_SQL_LOGGING} from './vocabulum-cleanup-backup.mjs';
export function buildRestoreSql(backup,{commit=false}={}) {
 validateBackup(backup);
 const encoded=Buffer.from(JSON.stringify(backup)).toString('hex');
 const emptyChecks=TABLES.map(([table,predicate])=>`IF EXISTS(SELECT 1 FROM ${table} WHERE ${predicate}) THEN RAISE EXCEPTION 'Restore target is not empty; reconciliation required'; END IF;`).join('\n');
 return `${PRIVATE_SQL_LOGGING}
BEGIN; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='500ms'; SET LOCAL search_path=pg_catalog;
DO $restore$
DECLARE expected jsonb:=convert_from(decode('${encoded}','hex'),'UTF8')::jsonb;
 name text; schema_name text; table_name text; columns_sql text; updates_sql text; conflict_sql text; actual jsonb; affected integer;
BEGIN
 IF NOT pg_try_advisory_xact_lock(20660920,170141) THEN RAISE EXCEPTION 'Concurrent cleanup/recovery'; END IF;
 ${emptyChecks}
 FOREACH name IN ARRAY ARRAY['auth.users','auth.identities','core.profiles','core.app_access','voc_builder.memberships']
 LOOP
   schema_name:=split_part(name,'.',1);table_name:=split_part(name,'.',2);
   SELECT string_agg(format('%I',attname),',' ORDER BY attnum),
     string_agg(format('%I=EXCLUDED.%I',attname,attname),',' ORDER BY attnum) FILTER(WHERE attname<>'id')
   INTO columns_sql,updates_sql FROM pg_attribute WHERE attrelid=to_regclass(name) AND attnum>0 AND NOT attisdropped AND attgenerated='';
   -- Auth's existing insert trigger creates core.profiles; replace only that
   -- newly generated exact target row with its backed-up profile fields.
   conflict_sql:=CASE WHEN name='core.profiles' THEN ' ON CONFLICT(id) DO UPDATE SET '||updates_sql ELSE '' END;
   EXECUTE format('INSERT INTO %I.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::%I.%I,$1) %s',schema_name,table_name,columns_sql,columns_sql,schema_name,table_name,conflict_sql) USING expected->'rows'->name;
   GET DIAGNOSTICS affected=ROW_COUNT;IF affected<>3 THEN RAISE EXCEPTION 'Restore count mismatch'; END IF;
   EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(restored) ORDER BY to_jsonb(restored)::text),''[]''::jsonb) FROM %I.%I restored WHERE %I::text=ANY($1)',schema_name,table_name,CASE WHEN name IN ('auth.users','core.profiles') THEN 'id' ELSE 'user_id' END)
   INTO actual USING ARRAY[${TARGETS.map(id=>`'${id}'`).join(',')}];
   IF actual IS DISTINCT FROM expected->'rows'->name THEN RAISE EXCEPTION 'Restored rows differ from backup'; END IF;
 END LOOP;
 -- Sessions, refresh tokens and MFA session claims stay revoked. Fresh login
 -- is required after identity recovery; never replay old bearer credentials.
 RAISE NOTICE 'Restored 3 exact identities and app access; all prior sessions remain revoked';
END $restore$;
${commit?'COMMIT':'ROLLBACK'};`;
}
