import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {TARGETS,OWNER,TABLES,backupSql} from '../operators/vocabulum-cleanup-backup.mjs';
import {buildApplySql} from '../operators/vocabulum-cleanup-apply.mjs';
import {buildRestoreSql} from '../operators/vocabulum-cleanup-restore.mjs';

test('isolated PostgreSQL cleanup and refusal cases',{skip:process.env.VOCABULUM_CLEANUP_SQL_TEST!=='1',timeout:60000},async t=>{
 const container=`developed-vocabulum-cleanup-test-${process.pid}-db`;
 const docker=(args,input)=>spawnSync('sudo',['-n','docker',...args],{input,encoding:'utf8',timeout:35000,maxBuffer:2*1024*1024});
 const query=(sql)=>docker(['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],sql);
 const run=sql=>{const result=query(sql);assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
 const create=docker(['run','-d','--name',container,'--label','developed.vocabulum-cleanup-test=true','--network','none','--memory','256m','--cpus','0.5','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine',
   '-c','log_statement=all','-c','log_min_error_statement=error','-c','log_min_duration_statement=0','-c','log_min_duration_sample=0','-c','log_duration=on','-c','log_error_verbosity=verbose','-c','pgaudit.log=all']);
 assert.equal(create.status,0,create.stderr);
 try {
   let ready=false;for(let i=0;i<60;i++){if(docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']).status===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,200));}assert.ok(ready);
   const setup=()=>{
     run(`DROP SCHEMA IF EXISTS auth,core,voc_builder,accounts,reference_fixture CASCADE;
CREATE SCHEMA auth; CREATE SCHEMA core; CREATE SCHEMA voc_builder; CREATE SCHEMA accounts; CREATE SCHEMA reference_fixture;
CREATE TABLE auth.users(id uuid PRIMARY KEY, role text,last_sign_in_at timestamptz DEFAULT '2026-01-01');
CREATE TABLE auth.identities(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users ON DELETE CASCADE);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users ON DELETE CASCADE);
CREATE TABLE auth.refresh_tokens(id uuid PRIMARY KEY,user_id uuid,session_id uuid REFERENCES auth.sessions ON DELETE CASCADE);
CREATE TABLE auth.mfa_amr_claims(id uuid PRIMARY KEY,session_id uuid REFERENCES auth.sessions ON DELETE CASCADE);
CREATE TABLE core.profiles(id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,role text);
CREATE TABLE core.apps(id uuid PRIMARY KEY,schema_name text);
CREATE TABLE core.app_access(id uuid PRIMARY KEY,user_id uuid REFERENCES core.profiles ON DELETE CASCADE,app_id uuid REFERENCES core.apps);
CREATE TABLE voc_builder.memberships(user_id uuid PRIMARY KEY REFERENCES core.profiles ON DELETE CASCADE,role text);
CREATE TABLE voc_builder.folders(id uuid PRIMARY KEY,"teacherId" uuid REFERENCES core.profiles ON DELETE CASCADE);
CREATE TABLE voc_builder.words(id uuid PRIMARY KEY,"folderId" uuid REFERENCES voc_builder.folders ON DELETE CASCADE,content text);
CREATE TABLE accounts.settings(singleton bool,registration_mode text);
CREATE TABLE accounts.app_settings(published bool,reportable bool,enforce_oidc bool,join_policy text);
CREATE TABLE accounts.outbox(id uuid);
CREATE TABLE reference_fixture.columns(${Array.from({length:503},(_,i)=>`col${i} uuid`).join(',')});
INSERT INTO accounts.settings VALUES(true,'closed');
INSERT INTO accounts.app_settings SELECT false,false,false,'closed' FROM generate_series(1,7);
INSERT INTO core.apps VALUES('00000000-0000-0000-0000-000000000111','voc_builder');
INSERT INTO auth.users(id,role) VALUES('${OWNER}','authenticated'); INSERT INTO core.profiles VALUES('${OWNER}','USER');
INSERT INTO voc_builder.memberships VALUES('${OWNER}','SUPERADMIN');
INSERT INTO voc_builder.folders VALUES('00000000-0000-0000-0000-000000000222','${OWNER}');
INSERT INTO voc_builder.words VALUES('00000000-0000-0000-0000-000000000333','00000000-0000-0000-0000-000000000222','preserve owner content');
${TARGETS.map((id,index)=>{
 const sid=`00000000-0000-0000-0000-00000000000${index+1}`;
 return `INSERT INTO auth.users(id,role) VALUES('${id}','authenticated');
INSERT INTO auth.identities VALUES('${id}','${id}'); INSERT INTO auth.sessions VALUES('${sid}','${id}');
INSERT INTO auth.refresh_tokens VALUES('${id}','${id}','${sid}'); INSERT INTO auth.mfa_amr_claims VALUES('${id}','${sid}');
INSERT INTO core.profiles VALUES('${id}','USER'); INSERT INTO core.app_access VALUES('${id}','${id}','00000000-0000-0000-0000-000000000111');
INSERT INTO voc_builder.memberships VALUES('${id}','${['ADMIN','TEACHER','STUDENT'][index]}');`;
}).join('\n')}`);
     return JSON.parse(run(backupSql()));
   };
   await t.test('successful deletion preserves owner, removes exact targets and sessions',()=>{
     const backup=setup();run(buildApplySql(backup,{commit:true}));
     assert.equal(run('SELECT count(*) FROM auth.users'), '1');
     assert.equal(run('SELECT count(*) FROM auth.sessions'), '0');
     assert.equal(run('SELECT content FROM voc_builder.words'), 'preserve owner content');
     assert.equal(run('SELECT role FROM voc_builder.memberships'), 'SUPERADMIN');
   });
   await t.test('new product data causes atomic refusal',()=>{
     const backup=setup();run(`INSERT INTO voc_builder.folders VALUES('00000000-0000-0000-0000-000000000444','${TARGETS[0]}')`);
     const result=query(buildApplySql(backup,{commit:true}));assert.notEqual(result.status,0);assert.match(result.stderr,/Unexpected target reference/);
     assert.equal(run('SELECT count(*) FROM auth.users'),'4');assert.equal(run('SELECT count(*) FROM auth.sessions'),'3');
   });
   await t.test('new indirect FK child causes atomic refusal',()=>{
     const backup=setup();run(`CREATE TABLE auth.extra_child(id int,session_id uuid REFERENCES auth.sessions ON DELETE CASCADE); INSERT INTO auth.extra_child SELECT 1,id FROM auth.sessions LIMIT 1;`);
     const result=query(buildApplySql(backup,{commit:true}));assert.notEqual(result.status,0);assert.match(result.stderr,/Unbacked FK child/);
     assert.equal(run('SELECT count(*) FROM auth.users'),'4');assert.equal(run('SELECT count(*) FROM auth.sessions'),'3');
   });
   await t.test('changed snapshot and unexpected DELETE triggers refuse',()=>{
     const backup=setup();run(`UPDATE voc_builder.memberships SET role='SUPERADMIN' WHERE user_id='${TARGETS[0]}'`);
     const changed=query(buildApplySql(backup,{commit:true}));assert.notEqual(changed.status,0);assert.match(changed.stderr,/Target snapshot changed/);
     const fresh=setup();run(`CREATE FUNCTION auth.side_effect() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN OLD; END$$; CREATE TRIGGER unsafe BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION auth.side_effect();`);
     const triggered=query(buildApplySql(fresh,{commit:true}));assert.notEqual(triggered.status,0);assert.match(triggered.stderr,/Unexpected DELETE trigger/);
     assert.equal(run('SELECT count(*) FROM auth.users'),'4');
   });
   await t.test('default rollback rehearsal leaves all 24 rows present',()=>{
     const backup=setup();run(buildApplySql(backup));const after=JSON.parse(run(backupSql()));
     for(const [table] of TABLES)assert.deepEqual(after.rows[table],backup.rows[table]);
   });
   await t.test('narrow recovery restores identity and access but never sessions',()=>{
     const backup=setup();run(buildApplySql(backup,{commit:true}));
     run(`CREATE FUNCTION core.profile_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN INSERT INTO core.profiles VALUES(NEW.id,'USER'); RETURN NEW; END$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION core.profile_on_insert();`);
     run(buildRestoreSql(backup,{commit:true}));
     const restored=JSON.parse(run(backupSql()));
     for(const table of ['auth.users','auth.identities','core.profiles','core.app_access','voc_builder.memberships'])assert.deepEqual(restored.rows[table],backup.rows[table]);
     for(const table of ['auth.sessions','auth.refresh_tokens','auth.mfa_amr_claims'])assert.equal(restored.rows[table].length,0);
     assert.equal(run('SELECT content FROM voc_builder.words'),'preserve owner content');
     const repeat=query(buildRestoreSql(backup,{commit:true}));assert.notEqual(repeat.status,0);assert.match(repeat.stderr,/Restore target is not empty/);
   });
   await t.test('recent provider token issuance stops deletion even with matching backup',()=>{
     setup();run(`UPDATE auth.users SET last_sign_in_at=clock_timestamp() WHERE id='${TARGETS[0]}'`);
     const backup=JSON.parse(run(backupSql()));const result=query(buildApplySql(backup,{commit:true}));
     assert.notEqual(result.status,0);assert.match(result.stderr,/Recent provider token issuance/);
     assert.equal(run('SELECT count(*) FROM auth.users'),'4');
   });
   await t.test('reportable or extra app configuration causes refusal',()=>{
     const backup=setup();run('UPDATE accounts.app_settings SET reportable=true');
     const reportable=query(buildApplySql(backup,{commit:true}));assert.notEqual(reportable.status,0);assert.match(reportable.stderr,/Closed SSO gates changed/);
     const fresh=setup();run("INSERT INTO accounts.app_settings VALUES(true,true,true,'open')");
     const extra=query(buildApplySql(fresh,{commit:true}));assert.notEqual(extra.status,0);assert.match(extra.stderr,/Closed SSO gates changed/);
     assert.equal(run('SELECT count(*) FROM auth.users'),'4');
   });
   await t.test('payload stays out of enabled statement/error/duration logs on guard failures',()=>{
     const backup=setup();
     const passwordMarker=`password-fixture-${randomBytes(24).toString('hex')}`;
     const tokenMarker=`token-fixture-${randomBytes(24).toString('hex')}`;
     backup.rows['auth.users'][0].encrypted_password=passwordMarker;
     backup.rows['auth.refresh_tokens'][0].token=tokenMarker;
     run("SELECT 'cleanup-logging-positive-control'");
     const rejected=query(buildApplySql(backup,{commit:true}));assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/Target snapshot changed/);
     const restoreRejected=query(buildRestoreSql(backup,{commit:true}));assert.notEqual(restoreRejected.status,0);assert.match(restoreRejected.stderr,/Restore target is not empty/);
     const logResult=docker(['logs',container]);assert.equal(logResult.status,0);
     const logs=logResult.stdout+logResult.stderr;
     assert.ok(logs.includes('statement:'));assert.ok(logs.includes('cleanup-logging-positive-control'));
     assert.ok(logs.includes('Target snapshot changed'));assert.ok(logs.includes('Restore target is not empty'));
     for(const marker of [passwordMarker,tokenMarker]) {
       assert.equal(logs.includes(marker),false,'Plaintext fixture secret must not appear in database logs');
       assert.equal(logs.includes(Buffer.from(marker).toString('hex')),false,'Hex fixture secret must not appear in database logs');
     }
     assert.equal(logs.includes(Buffer.from(JSON.stringify(backup)).toString('hex')),false,'Encoded backup must not appear in database logs');
     // A separate connection retains the enabled defaults: no global changes.
     assert.equal(run("SELECT current_setting('log_statement')||','||current_setting('log_min_error_statement')||','||current_setting('pgaudit.log')"),'all,error,all');
   });
 } finally {
   const label=docker(['inspect','--format','{{index .Config.Labels "developed.vocabulum-cleanup-test"}}',container]);
   assert.equal(label.stdout.trim(),'true');assert.match(container,/^developed-vocabulum-cleanup-test-\d+-db$/);
   assert.equal(docker(['rm','-f','-v',container]).status,0);
 }
});
