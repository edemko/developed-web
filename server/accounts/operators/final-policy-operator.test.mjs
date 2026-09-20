import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { APPS, PHASES, phaseEntry, backupSql, buildApplySql, run } from './final-policy-operator.mjs';
import { migrations as central } from './apply-central-migration.mjs';
import { seedName, seedSha256, stagedMigrations } from './apply-app-migration.mjs';
const raw=readFileSync(new URL('./final-policy-operator-kestrek.sql',import.meta.url));
const dummy={policies:APPS.map(app_id=>({app_id})),configuration_digest:'fixture'};

test('default operation is offline and fixed phases reject arbitrary targets',async()=>{
  for(const phase of PHASES) assert.match((await run(['--phase',phase])).mode,/no connection or mutation/);
  for(const args of [[],['--phase','all'],['--phase','publish','--apply','--container','anything'],['--phase','publish','--delete'],['--sql','/tmp/arbitrary']]) await assert.rejects(run(args));
});
test('publish and enforce have different, minimal fields with no user/session/entitlement writes',()=>{
  const publish=buildApplySql('publish',dummy,raw),enforce=buildApplySql('enforce',dummy,raw);
  assert.match(publish,/UPDATE accounts\.app_settings SET published=true,reportable=true,join_policy='free'/);
  assert.doesNotMatch(publish,/SET enforce_oidc=true/);
  assert.match(enforce,/UPDATE accounts\.app_settings SET enforce_oidc=true/);
  for(const sql of [publish,enforce]) {
    assert.doesNotMatch(sql,/COMMIT;|DELETE FROM|TRUNCATE|UPDATE (?:auth|core)\.|INSERT INTO (?:auth|core)\.|UPDATE accounts\.(?:sessions|settings|security_state|entitlements)/i);
    assert.match(sql,/lock_timeout='500ms'/);assert.match(sql,/statement_timeout='30s'/);
    assert.match(sql,/pg_try_advisory_xact_lock/);assert.match(sql,/Reviewed snapshot changed/);
  }
});
test('Ke source is byte-pinned, transaction-stripped and owner-aware',()=>{
  const sql=buildApplySql('kestrek-raw-token',dummy,raw);
  assert.match(sql,/SET LOCAL ROLE supabase_admin;\s+REVOKE ALL ON SCHEMA kestrek/);
  assert.match(sql,/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA kestrek/);
  assert.match(sql,/Legacy Ke ACL remains/);assert.match(sql,/retained-grant preservation/);
  assert.doesNotMatch(sql,/COMMIT;|DELETE FROM|TRUNCATE|^\s*DROP |GRANT .* TO (?:anon|authenticated)/im);
  assert.throws(()=>buildApplySql('kestrek-raw-token',dummy,Buffer.concat([raw,Buffer.from('\n')])));
  assert.throws(()=>phaseEntry('all'));
});
test('backup captures only fixed metadata/ACLs and no account data',()=>{
  const sql=backupSql('publish');
  assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/'column_acls'/);
  assert.doesNotMatch(sql,/FROM auth\.(?:users|sessions)|provider_tokens|encrypted_password|UPDATE |INSERT INTO|DELETE FROM/);
});

test('isolated PG17 phase sequence, refusals, grants and unchanged data',{
 skip:process.env.FINAL_POLICY_SQL_TEST!=='1',timeout:90000,
},async t=>{
  const container=`developed-final-policy-test-${process.pid}-db`;
  const docker=(args,input)=>spawnSync('sudo',['-n','docker',...args],{input,encoding:'utf8',timeout:35000,maxBuffer:4*1024*1024});
  const query=sql=>docker(['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],sql);
  const execute=sql=>{const result=query(sql);assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stderr,/WARNING/);return result.stdout.trim();};
  const created=docker(['run','--pull=never','-d','--name',container,'--label','developed.final-policy-test=true','--network','none','--memory','256m','--cpus','0.5','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=supabase_admin','postgres:17-alpine']);
  assert.equal(created.status,0,created.stderr);
  try {
    let ready=false;for(let i=0;i<60;i++){if(docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','supabase_admin']).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
    const bootstrap=docker(['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],`CREATE ROLE postgres LOGIN NOSUPERUSER BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE developed_accounts; CREATE ROLE kestrek_backend NOLOGIN NOINHERIT;`);
    assert.equal(bootstrap.status,0,bootstrap.stderr);
    const reset=()=>execute(`DROP SCHEMA IF EXISTS accounts,core,kestrek CASCADE;
CREATE SCHEMA accounts AUTHORIZATION postgres; CREATE SCHEMA core AUTHORIZATION postgres; CREATE SCHEMA kestrek AUTHORIZATION postgres;
SET ROLE postgres;
CREATE TABLE core.apps(id text PRIMARY KEY,status text,deleted_at timestamptz);
CREATE TABLE accounts.settings(singleton bool,registration_mode text);
CREATE TABLE accounts.app_settings(app_id text PRIMARY KEY,published bool,reportable bool,enforce_oidc bool,join_policy text,free_plan text,oauth_client_id uuid,server_key_hash text,callback_url text,updated_at timestamptz DEFAULT now());
CREATE TABLE accounts.oauth_clients(client_id uuid,app_id text,callback_url text,client_kind text,enabled bool);
CREATE TABLE accounts.outbox(id int);
CREATE TABLE accounts.deployment_migrations(version text,source_sha256 text);
CREATE TABLE accounts.app_deployment_migrations(source_file text PRIMARY KEY,source_sha256 text,applied_at timestamptz DEFAULT clock_timestamp());
ALTER TABLE accounts.deployment_migrations ENABLE ROW LEVEL SECURITY; ALTER TABLE accounts.deployment_migrations FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts.app_deployment_migrations ENABLE ROW LEVEL SECURITY; ALTER TABLE accounts.app_deployment_migrations FORCE ROW LEVEL SECURITY;
INSERT INTO accounts.settings VALUES(true,'closed');
${central.map(m=>`INSERT INTO accounts.deployment_migrations VALUES('${m.version}','${m.sha256}');`).join('\n')}
${[{file:seedName,sha256:seedSha256},...stagedMigrations].map(m=>`INSERT INTO accounts.app_deployment_migrations(source_file,source_sha256) VALUES('${m.file}','${m.sha256}');`).join('\n')}
${APPS.map((id,i)=>`INSERT INTO core.apps VALUES('${id}','ACTIVE',NULL);
INSERT INTO accounts.app_settings VALUES('${id}',false,false,false,'closed','free','00000000-0000-0000-0000-00000000000${i+1}',repeat('${i}',64),'https://example.invalid/${i}',now());
INSERT INTO accounts.oauth_clients VALUES('00000000-0000-0000-0000-00000000000${i+1}','${id}','https://example.invalid/${i}','web',true);`).join('\n')}
INSERT INTO accounts.oauth_clients VALUES('00000000-0000-0000-0000-000000000008','app_kestrek','sk.kestrek://oauth/callback','native',true);
CREATE TABLE kestrek.preserved(id int,data text); INSERT INTO kestrek.preserved VALUES(1,'owner-device-MCP-data');
CREATE SEQUENCE kestrek.counter; CREATE FUNCTION kestrek.postgres_owned() RETURNS int LANGUAGE sql AS 'SELECT 1';
ALTER DEFAULT PRIVILEGES IN SCHEMA kestrek GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA kestrek GRANT SELECT ON TABLES TO kestrek_backend;
GRANT USAGE ON SCHEMA kestrek TO PUBLIC,anon,authenticated,kestrek_backend;
GRANT SELECT ON kestrek.preserved TO anon,authenticated,kestrek_backend;
GRANT USAGE ON kestrek.counter TO anon,authenticated,kestrek_backend;
GRANT EXECUTE ON FUNCTION kestrek.postgres_owned() TO authenticated,kestrek_backend;
RESET ROLE;
CREATE TABLE kestrek.schema_migrations(version text);
CREATE FUNCTION kestrek.admin_owned() RETURNS int LANGUAGE sql AS 'SELECT 2';
GRANT EXECUTE ON FUNCTION kestrek.admin_owned() TO authenticated,kestrek_backend;`);
    const snapshot=phase=>JSON.parse(execute(backupSql(phase)));
    const apply=phase=>execute(buildApplySql(phase,snapshot(phase),raw)+'COMMIT;');
    await t.test('three phases commit exactly; data/backend/admin-owned functions retained',()=>{
      reset();apply('publish');assert.equal(execute('SELECT count(*) FROM accounts.app_settings WHERE published AND reportable AND NOT enforce_oidc'), '7');
      apply('enforce');apply('kestrek-raw-token');
      assert.equal(execute('SELECT count(*) FROM accounts.app_deployment_migrations'),'13');
      assert.equal(execute('SELECT data FROM kestrek.preserved'),'owner-device-MCP-data');
      assert.equal(execute("SET ROLE kestrek_backend; SELECT data FROM kestrek.preserved; SELECT kestrek.admin_owned();"),'owner-device-MCP-data\n2');
      assert.notEqual(query('SET ROLE authenticated; SELECT data FROM kestrek.preserved;').status,0);
      assert.equal(execute("SELECT has_schema_privilege('authenticated','kestrek','USAGE')"),'f');
    });
    await t.test('refuses changed policy/client configuration and wrong sequence atomically',()=>{
      reset();const before=snapshot('publish');execute("UPDATE accounts.app_settings SET callback_url='https://changed.invalid' WHERE app_id='app_kestrek'");
      assert.notEqual(query(buildApplySql('publish',before,raw)+'COMMIT;').status,0);
      assert.equal(execute('SELECT count(*) FROM accounts.app_settings WHERE published'),'0');
      reset();assert.notEqual(query(backupSql('enforce')).status,0);
      apply('publish');assert.notEqual(query(buildApplySql('publish',before,raw)+'COMMIT;').status,0);
      assert.equal(execute('SELECT count(*) FROM accounts.app_deployment_migrations'),'11');
    });
    await t.test('open registration, outbox, extra app and trigger refuse',()=>{
      for(const changed of ["UPDATE accounts.settings SET registration_mode='open'",'INSERT INTO accounts.outbox VALUES(1)',"INSERT INTO accounts.app_settings(app_id) VALUES('other')",`CREATE FUNCTION accounts.side_effect() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$; CREATE TRIGGER unexpected BEFORE UPDATE ON accounts.app_settings FOR EACH ROW EXECUTE FUNCTION accounts.side_effect();`]) {
        reset();const before=snapshot('publish');execute(changed);
        assert.notEqual(query(buildApplySql('publish',before,raw)+'COMMIT;').status,0);
        assert.equal(execute('SELECT count(*) FROM accounts.app_settings WHERE published'),'0');
      }
    });
    await t.test('rollback rehearsal and late failure leave selected fields/ledger unchanged',()=>{
      reset();const before=snapshot('publish');execute(buildApplySql('publish',before,raw)+'ROLLBACK;');
      assert.deepEqual(snapshot('publish'),before);
      const failing=buildApplySql('publish',before,raw).replace('INSERT INTO accounts.app_deployment_migrations(source_file','INSERT INTO accounts.does_not_exist(source_file');
      assert.notEqual(query(failing+'COMMIT;').status,0);assert.deepEqual(snapshot('publish'),before);
    });
  } finally {
    const identity=docker(['inspect','--format','{{index .Config.Labels "developed.final-policy-test"}} {{.HostConfig.NetworkMode}}',container]);
    if(identity.status===0 && identity.stdout.trim()==='true none') {
      const removed=docker(['rm','-f','-v',container]);assert.equal(removed.status,0,'Exact disposable test cleanup failed');
    }
  }
});
