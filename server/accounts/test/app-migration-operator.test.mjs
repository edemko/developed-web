import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { appMigrations,readAppSource } from '../operators/review-app-migrations.mjs';
import { seedName,seedSha256,stagedMigrations,prepareAppMigration,runAppMigration } from '../operators/apply-app-migration.mjs';

test('closed seed contains seven exact catalog tuples and no credentials or membership writes',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../launch-catalog.json',import.meta.url)));
 const seed=prepareAppMigration(seedName);
 assert.match(seed.sha256,/^[a-f0-9]{64}$/);
 for(const app of catalog.apps) for(const v of [app.appId,app.slug,app.launchUrl]) assert.ok(seed.sql.includes(`'${v}'`));
 assert.match(seed.sql,/CREATE ROLE kestrek_identity_web NOLOGIN NOINHERIT/);
 assert.doesNotMatch(seed.sql,/INSERT INTO core\.|UPDATE core\.|PASSWORD |CREATE ROLE.*\bLOGIN /);
 assert.doesNotMatch(seed.sql,/COMMIT;/);
});

test('staged restore: first-use provisioning, owner isolation and bucket fences', {
 skip:!process.env.APP_OPERATOR_POST_CONTAINER,timeout:45000,
},()=>{
 const container=process.env.APP_OPERATOR_POST_CONTAINER;
 assert.match(container,/^developed-app-migration-test-\d+-db$/);
 const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:40000}).trim();
 assert.equal(docker(['inspect','--format','{{index .Config.Labels "developed.app.migration.test"}} {{.HostConfig.NetworkMode}}',container]),'true none');
 const sql=value=>docker(['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],value);
 assert.equal(sql('SELECT count(*) FROM accounts.app_deployment_migrations'),'10');
 const fixture=`BEGIN;
 DO $$ DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); BEGIN
 PERFORM set_config('test.owner_a',a::text,true); PERFORM set_config('test.owner_b',b::text,true);
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 VALUES(a,'restore-'||a||'@example.invalid',now(),'{"name":"Fixture A","display_name":"Fixture A"}'),(b,'restore-'||b||'@example.invalid',now(),'{"name":"Fixture B","display_name":"Fixture B"}');
 INSERT INTO core.app_access(id,user_id,app_id)
 SELECT gen_random_uuid()::text,u,app FROM unnest(ARRAY[a,b]) u CROSS JOIN unnest(ARRAY['app_kestrek','app_airsoft','app_odonto','app_voc_builder','app_otazkomat','app_screentime']) app;
 IF (SELECT count(*) FROM kestrek.users WHERE id IN (a,b) AND role='user')<>2
 OR (SELECT count(*) FROM airsoft.profiles WHERE id IN (a,b) AND role='user' AND NOT suspended)<>2
 OR (SELECT count(*) FROM odonto.user_profiles WHERE id IN (a,b) AND role='user' AND NOT is_blocked)<>2
 THEN RAISE EXCEPTION 'Existing provisioning triggers failed'; END IF;
 INSERT INTO screentime.children(owner_id,display_name) VALUES(a,'Fixture A'),(b,'Fixture B');
 END $$;
 SET LOCAL ROLE vocabulum_backend;
 SELECT voc_builder.ensure_oidc_membership(current_setting('test.owner_a')::uuid);
 SELECT voc_builder.ensure_oidc_membership(current_setting('test.owner_b')::uuid);
 DO $$ BEGIN
 IF (SELECT count(*) FROM voc_builder.memberships WHERE user_id IN(current_setting('test.owner_a')::uuid,current_setting('test.owner_b')::uuid)
 AND role='STUDENT' AND organisation_id IS NULL AND NOT must_change_password)<>2 THEN RAISE EXCEPTION 'Student defaults changed'; END IF;
 END $$;
 SET LOCAL ROLE otazkomat_backend;
 SELECT otazkomat.provision_ecosystem_profile(current_setting('test.owner_a')::uuid,'restore-'||current_setting('test.owner_a')||'@example.invalid','Fixture A');
 SELECT otazkomat.provision_ecosystem_profile(current_setting('test.owner_a')::uuid,'restore-'||current_setting('test.owner_a')||'@example.invalid','Fixture A');
 DO $$ BEGIN
 IF (SELECT count(*) FROM otazkomat.users WHERE id=current_setting('test.owner_a')::uuid AND role='member' AND status='active')<>1
 OR (SELECT count(*) FROM otazkomat.user_organization_memberships WHERE user_id=current_setting('test.owner_a')::uuid AND role='member' AND is_active)<>1
 THEN RAISE EXCEPTION 'First-use membership not idempotent'; END IF;
 END $$;
 SET LOCAL ROLE supabase_admin;
 DO $$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('test.owner_a'),true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.owner_a'),'role','authenticated')::text,true);
 END $$;
 SET LOCAL ROLE authenticated;
 DO $$ BEGIN
 IF NOT accounts.app_request_allowed('app_screentime') OR NOT accounts.app_request_allowed('app_airsoft') THEN RAISE EXCEPTION 'Legacy gate blocked'; END IF;
 IF (SELECT count(*) FROM screentime.children WHERE owner_id=current_setting('test.owner_a')::uuid)<>1
 OR EXISTS(SELECT 1 FROM screentime.children WHERE owner_id=current_setting('test.owner_b')::uuid)
 THEN RAISE EXCEPTION 'Legacy owner isolation failed'; END IF;
 UPDATE airsoft.profiles SET display_name='Own edit' WHERE id=current_setting('test.owner_a')::uuid;
 UPDATE airsoft.profiles SET display_name='Foreign edit' WHERE id=current_setting('test.owner_b')::uuid;
 END $$;
 SET LOCAL ROLE supabase_admin;
 DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM airsoft.profiles WHERE id=current_setting('test.owner_a')::uuid AND display_name='Own edit')
 OR NOT EXISTS(SELECT 1 FROM airsoft.profiles WHERE id=current_setting('test.owner_b')::uuid AND display_name='Fixture B')
 THEN RAISE EXCEPTION 'Legacy Airsoft write ownership failed'; END IF;
 END $$;
 ROLLBACK;`;
 try{sql(fixture);}catch(error){throw new Error(error.stderr?.split('\n').filter(s=>/ERROR|WARNING|CONTEXT/.test(s)).join('\n')||'Fixture failed');}
 for(const [role,buckets] of [['kestrek_backend',['avatars']],['vocabulum_backend',['tts-audio']],['odonto_backend',['study-materials']],['otazkomat_backend',['question-images','content-icons','report-images']]]) {
   const predicate=`id=ANY(ARRAY[${buckets.map(b=>`'${b}'`).join(',')}])`;
   assert.equal(sql(`SET ROLE ${role}; SELECT count(*) FROM storage.buckets WHERE ${predicate}`),sql(`SELECT count(*) FROM storage.buckets WHERE ${predicate}`));
   assert.equal(sql(`SET ROLE ${role}; SELECT count(*) FROM storage.buckets WHERE NOT(id=ANY(ARRAY[${buckets.map(b=>`'${b}'`).join(',')}]))`),'0');
   assert.equal(sql(`SET ROLE ${role}; SELECT count(*) FROM storage.objects WHERE NOT(bucket_id=ANY(ARRAY[${buckets.map(b=>`'${b}'`).join(',')}]))`),'0');
 }
});

test('operator refuses final cutover, unsafe targets and changed source',{
 skip:process.env.APP_OPERATOR_SOURCE_TEST!=='1'&&!process.env.APP_OPERATOR_RESTORE_CONTAINER,
},async()=>{
 for(const entry of stagedMigrations){
   const source=await readAppSource(entry), prepared=prepareAppMigration(entry.file,source);
   assert.equal(prepared.sha256,entry.sha256);
   assert.match(prepared.sql,/lock_timeout='500ms'/);
   assert.doesNotMatch(prepared.sql,/lock_timeout\s*=\s*'3s'/i);
   assert.throws(()=>prepareAppMigration(entry.file,Buffer.concat([source,Buffer.from('\n')])));
 }
 assert.throws(()=>prepareAppMigration(appMigrations.at(-1).file,Buffer.from('BEGIN;COMMIT;')));
 for(const args of [['--migration',seedName,'--apply'],['--migration',seedName,'--container','other-db','--apply'],['--migration',seedName,'--file','/tmp/arbitrary']]) await assert.rejects(runAppMigration(args));
 assert.match(await runAppMigration(['--migration',seedName,'--container','supabase-db']),/no connection or mutation/);
 await assert.rejects(runAppMigration(['--migration',appMigrations.at(-1).file,'--container','supabase-db','--apply']));
});

test('restored production catalog: ordered atomic app staging and preserved rows',{
 skip:!process.env.APP_OPERATOR_RESTORE_CONTAINER,timeout:180000,
},async()=>{
 const container=process.env.APP_OPERATOR_RESTORE_CONTAINER;
 assert.match(container,/^developed-app-migration-test-\d+-db$/);
 const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:45000,maxBuffer:8*1024*1024}).trim();
 assert.equal(docker(['inspect','--format','{{index .Config.Labels "developed.app.migration.test"}} {{.HostConfig.NetworkMode}}',container]),'true none');
 const sql=value=>docker(['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],value);
 const tables=sql(`SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('auth','core','mega_music','kestrek','screentime','airsoft','voc_builder','odonto','otazkomat')
 AND c.relkind='r' AND c.relname<>'schema_migrations' ORDER BY 1`).split('\n');
 const snapshot=()=>tables.map(table=>sql(`SELECT count(*)||':'||md5(coalesce(string_agg(j,'|' ORDER BY j),'')) FROM
 (SELECT (to_jsonb(t)-'encrypted_provider_tokens')::text j FROM ${table} t) rows`));
 const before=snapshot();
 assert.equal(sql('SELECT count(*) FROM accounts.app_deployment_migrations'),'1');
 assert.equal(sql(`SELECT source_sha256 FROM accounts.app_deployment_migrations WHERE source_file='${seedName}'`),seedSha256);
 await assert.rejects(runAppMigration(['--migration',seedName,'--container',container,'--apply']));
 // Check atomic rollback even after all source DDL succeeded.
 const first=prepareAppMigration(stagedMigrations[0].file,await readAppSource(stagedMigrations[0]));
 assert.throws(()=>sql(first.sql.replace('INSERT INTO accounts.app_deployment_migrations','INSERT INTO accounts.missing_ledger')+'COMMIT;'));
 assert.equal(sql("SELECT to_regclass('mega_music.oauth_transactions') IS NULL"),'t');
 sql(`CREATE FUNCTION accounts.app_operator_test_warning() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE WARNING 'fixture warning'; RETURN NEW; END $$;
 CREATE TRIGGER app_operator_test_warning BEFORE INSERT ON accounts.app_deployment_migrations FOR EACH ROW EXECUTE FUNCTION accounts.app_operator_test_warning();`);
 await assert.rejects(runAppMigration(['--migration',stagedMigrations[0].file,'--container',container,'--apply']));
 assert.equal(sql("SELECT to_regclass('mega_music.oauth_transactions') IS NULL"),'t');
 assert.equal(sql('SELECT count(*) FROM accounts.app_deployment_migrations'),'1');
 sql('DROP TRIGGER app_operator_test_warning ON accounts.app_deployment_migrations; DROP FUNCTION accounts.app_operator_test_warning();');
 for(const entry of stagedMigrations){
   try{await runAppMigration(['--migration',entry.file,'--container',container,'--apply']);}
   catch(error){
     // Diagnostic retry stays in the same disconnected clone and rolls back.
     // Return only SQL error lines; no rows, UUIDs or credentials are printed.
     try{sql(prepareAppMigration(entry.file,await readAppSource(entry)).sql+'ROLLBACK;');}
     catch(detail){throw new Error(detail.stderr?.split('\n').filter(s=>/ERROR|WARNING|CONTEXT/.test(s)).join('\n')||'Staging failed');}
     throw error;
   }
   await assert.rejects(runAppMigration(['--migration',entry.file,'--container',container,'--apply']));
 }
 assert.deepEqual(snapshot(),before,'Existing rows must remain identical');
 assert.equal(sql('SELECT count(*) FROM accounts.app_deployment_migrations'),'10');
 assert.equal(sql("SELECT count(*) FROM accounts.app_settings WHERE NOT published AND NOT reportable AND NOT enforce_oidc AND join_policy='closed' AND oauth_client_id IS NULL AND server_key_hash IS NULL AND callback_url IS NULL"),'7');
 assert.equal(sql("SET ROLE authenticated; SELECT bool_and(accounts.app_request_allowed(app)) FROM unnest(ARRAY['app_mega_music','app_kestrek','app_screentime','app_airsoft','app_voc_builder','app_odonto','app_otazkomat']) app;"),'t');
 for(const role of ['anon','authenticated','service_role','developed_accounts']) assert.throws(()=>sql(`SET ROLE ${role}; SELECT * FROM accounts.app_deployment_migrations;`));
 for(const role of ['anon','authenticated','service_role','odonto_backend']) assert.throws(()=>sql(`SET ROLE ${role}; SELECT odonto.ecosystem_identity_config();`));
 assert.equal(sql("SET ROLE odonto_identity_web; SELECT odonto.ecosystem_identity_config()->>'safe'"),'true');
 for(const role of ['anon','authenticated','service_role']) for(const table of ['kestrek_identity.sessions','screentime_web.sessions','airsoft_identity.sessions','voc_builder.oidc_sessions','odonto_identity.sessions','otazkomat_identity.sessions']) {
   assert.throws(()=>sql(`SET ROLE ${role}; SELECT * FROM ${table} LIMIT 0;`));
 }
 for(const [role,foreign] of [['kestrek_backend','screentime.children'],['screentime_backend','kestrek.users'],['vocabulum_backend','odonto.user_profiles'],['odonto_backend','otazkomat.users'],['otazkomat_backend','kestrek.users']]) {
   assert.throws(()=>sql(`SET ROLE ${role}; SELECT * FROM ${foreign} LIMIT 0;`));
   assert.throws(()=>sql(`SET ROLE ${role}; SELECT encrypted_password FROM auth.users LIMIT 0;`));
 }
});
