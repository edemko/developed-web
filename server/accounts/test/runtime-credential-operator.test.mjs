import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes,webcrypto} from 'node:crypto';
import {credentials,expectedClients,credentialPlan,preflightGuard,scramVerifier,passwordTransaction,
 stageCredential,executePasswordTransaction,run} from '../operators/stage-runtime-credentials.mjs';
import {issuer,audience,signScopedKey,signIdentityStoreKey} from '../operators/issue-scoped-data-key.mjs';
import {exclusiveWrite} from '../operators/register-private-clients.mjs';
import {seedName,seedSha256,stagedMigrations} from '../operators/apply-app-migration.mjs';
import {migrations} from '../operators/apply-central-migration.mjs';
const expiry=()=>new Date(Date.now()+30*24*3600_000).toISOString().replace(/\.\d{3}Z$/,'Z');
const config={version:1,algorithm:'HS256',issuer,audience,jwtSecret:'synthetic-operator-signing-material-at-least-32-bytes'};

async function files(t){
 const directory=await mkdtemp(join(tmpdir(),'runtime-credential-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const primary=join(directory,'primary'),backup=join(directory,'backup');
 await mkdir(primary,{mode:0o700});await mkdir(backup,{mode:0o700});
 return {directory,primary,backup};
}

test('bounded offline plans preserve Mega and reject arbitrary or secret-bearing input',async()=>{
 assert.equal(credentials.length,17);
 assert.deepEqual(credentials.filter(x=>x.kind==='database-password').map(x=>x.role),['kestrek_identity_web','screentime_web','airsoft_identity','otazkomat_identity_web']);
 assert.equal(credentials.filter(x=>x.kind==='data-jwt').length,5);
 for(const entry of credentials){
  const args=['--credential',entry.key,...(entry.kind.endsWith('-jwt')?['--expires-at',expiry()]:[])];
  assert.equal((await run(args)).status,'source-plan-no-connection-no-files');
 }
 for(const key of ['mega-db','mega-session','service_role','postgres','authenticated','unknown'])assert.throws(()=>credentialPlan(key));
 for(const args of [['--credential','kestrek-db','--password','do-not-echo'],['--credential','odonto-identity'],['--credential','kestrek-db','--expires-at',expiry()],['--credential','kestrek-db','--container','supabase-db'],['--credential','kestrek-db','--apply','--apply']])await assert.rejects(run(args));
});

test('identity store signer is explicitly separate from data allowlist and has verifiable signature',async()=>{
 const request={role:'odonto_identity_web',expiresAt:expiry()};
 assert.throws(()=>signScopedKey(config,request));
 for(const role of ['odonto_backend','service_role','authenticated','postgres'])assert.throws(()=>signIdentityStoreKey(config,{...request,role}));
 const result=signIdentityStoreKey(config,request),[h,p,s]=result.token.split('.');
 const key=await webcrypto.subtle.importKey('raw',Buffer.from(config.jwtSecret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 assert.equal(await webcrypto.subtle.verify('HMAC',key,Buffer.from(s,'base64url'),Buffer.from(`${h}.${p}`)),true);
 assert.equal(JSON.parse(Buffer.from(p,'base64url')).role,'odonto_identity_web');
 assert.equal(result.purpose,'identity-store');
});

test('every credential has durable identical primary/backup before any password change',async t=>{
 const f=await files(t);
 for(const entry of credentials){
  let applied=false;
  const result=await stageCredential(entry,entry.kind.endsWith('-jwt')?expiry():undefined,{
   check:async()=>{},write:exclusiveWrite,directory:f.primary,backup:f.backup,signingConfig:config,
   applyPassword:async(target,verifier)=>{
    const a=await readFile(join(f.primary,`${entry.key}.credentials.json`),'utf8'),b=await readFile(join(f.backup,`${entry.key}.credentials.json`),'utf8');
    assert.equal(a,b);assert.equal(target,entry);assert.match(verifier,/^SCRAM-SHA-256\$/);applied=true;
   },
  });
  assert.equal(applied,entry.kind==='database-password');assert.equal(result.activated,false);
  for(const suffix of ['started','credentials','verified']){
   const path=join(f.primary,`${entry.key}.${suffix}.json`);
   assert.equal(await readFile(path,'utf8'),await readFile(join(f.backup,`${entry.key}.${suffix}.json`),'utf8'));
   assert.equal((await lstat(path)).mode&0o777,0o600);
  }
  const artifact=JSON.parse(await readFile(join(f.primary,`${entry.key}.credentials.json`),'utf8'));
  if(entry.encoding)assert.equal(Buffer.from(artifact.value,entry.encoding).length,32);
  if(artifact.expiresAt)assert.ok(Date.parse(result.rotationDueAt)<Date.parse(artifact.expiresAt));
  await assert.rejects(stageCredential(entry,entry.kind.endsWith('-jwt')?expiry():undefined,{
   check:async()=>{},write:exclusiveWrite,directory:f.primary,backup:f.backup,signingConfig:config,
   applyPassword:async()=>{throw Error('Must not overwrite');},
  }));
 }
});

test('backup failure prevents database mutation and ambiguous DB error preserves both recovery copies',async t=>{
 const f=await files(t),entry=credentials[0];let applied=false;
 await assert.rejects(stageCredential(entry,undefined,{check:async()=>{},directory:f.primary,backup:f.backup,
 write:async(path,value)=>{if(path===join(f.backup,`${entry.key}.credentials.json`))throw Error('Disk full');await exclusiveWrite(path,value);},
 applyPassword:async()=>{applied=true;}}));
 assert.equal(applied,false);
 assert.ok(await lstat(join(f.primary,`${entry.key}.credentials.json`)));
 const other=credentials[1];
 await assert.rejects(stageCredential(other,undefined,{check:async()=>{},directory:f.primary,backup:f.backup,write:exclusiveWrite,
 applyPassword:async()=>{throw Error('Ambiguous connection');}}));
 assert.equal(await readFile(join(f.primary,`${other.key}.credentials.json`),'utf8'),await readFile(join(f.backup,`${other.key}.credentials.json`),'utf8'));
 await assert.rejects(lstat(join(f.primary,`${other.key}.verified.json`)),{code:'ENOENT'});
});

test('password SQL contains only SCRAM verifier, bounded owner checks and no grants or cleartext',()=>{
 const password=randomBytes(32).toString('base64url'),verifier=scramVerifier(password),sql=passwordTransaction(credentials[0],verifier);
 assert.equal(sql.includes(password),false);assert.match(sql,/lock_timeout='500ms'/);assert.match(sql,/SET log_statement='none'/);
 assert.doesNotMatch(sql,/GRANT |CREATE ROLE |COMMIT;/i);
 assert.throws(()=>passwordTransaction(credentials.find(x=>x.key==='odonto-identity'),verifier));
 assert.throws(()=>passwordTransaction(credentials[0],"bad'; ALTER ROLE postgres SUPERUSER;"));
 assert.throws(()=>scramVerifier('user-supplied-password'));
});

test('isolated PostgreSQL accepts SCRAM login, preserves attributes, blocks reapply and logs no credential',{
 skip:process.env.RUNTIME_CREDENTIAL_SQL_TEST!=='1',timeout:120000,
},async t=>{
 const f=await files(t),container=`developed-runtime-credential-test-${process.pid}-db`;
 const hba=join(f.directory,'pg_hba.conf');await writeFile(hba,'local all all trust\nhost all all 127.0.0.1/32 scram-sha-256\n',{mode:0o644});
 const docker=(a,input)=>execFileSync('docker',a,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000,maxBuffer:8*1024*1024}).trim();
 let created=false;t.after(()=>{if(created){assert.equal(docker(['inspect','--format','{{index .Config.Labels "developed.runtime.credential.test"}}',container]),'true');docker(['rm','-f','-v',container]);}});
 docker(['run','--pull=never','-d','--name',container,'--network','none','--memory','192m','--memory-swap','192m','--cpus','0.5','--pids-limit','100','--label','developed.runtime.credential.test=true',
 '-e','POSTGRES_USER=supabase_admin','-e','POSTGRES_DB=postgres','-e','POSTGRES_HOST_AUTH_METHOD=trust','--mount',`type=bind,src=${hba},dst=/fixture-hba.conf,readonly`,'postgres:17-alpine',
 '-c','hba_file=/fixture-hba.conf','-c','log_statement=all','-c','log_min_duration_statement=0']);created=true;
 const sql=input=>docker(['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],input);
 // The image first starts a temporary socket-only initialization server. Wait
 // for final TCP readiness so that its shutdown cannot race fixture setup.
 for(let i=0;;i++){try{docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','supabase_admin','-d','postgres']);break;}catch{if(i>100)throw Error('Fixture unavailable');await new Promise(r=>setTimeout(r,100));}}
 const value=s=>`'${s.replaceAll("'","''")}'`;
 sql(`CREATE ROLE postgres; CREATE ROLE authenticator NOINHERIT; CREATE SCHEMA accounts; CREATE SCHEMA auth;
 CREATE SCHEMA core; CREATE TABLE core.profiles(id uuid);
 CREATE TABLE auth.users(id uuid,encrypted_password text); CREATE TABLE accounts.sessions(id uuid);
 CREATE TABLE accounts.deployment_migrations(version text,source_sha256 text);
 INSERT INTO accounts.deployment_migrations VALUES ${migrations.map(x=>`('${x.version}','${x.sha256}')`).join(',')};
 CREATE TABLE accounts.app_deployment_migrations(source_file text,source_sha256 text);
 INSERT INTO accounts.app_deployment_migrations VALUES ${[{file:seedName,sha256:seedSha256},...stagedMigrations].map(x=>`(${value(x.file)},'${x.sha256}')`).join(',')};
 ${['deployment_migrations','app_deployment_migrations'].map(n=>`ALTER TABLE accounts.${n} OWNER TO postgres; ALTER TABLE accounts.${n} ENABLE ROW LEVEL SECURITY; ALTER TABLE accounts.${n} FORCE ROW LEVEL SECURITY;`).join('\n')}
 CREATE TABLE accounts.settings(singleton boolean,registration_mode text); INSERT INTO accounts.settings VALUES(true,'closed');
 CREATE TABLE accounts.app_settings(app_id text,slug text,launch_url text,callback_url text,oauth_client_id uuid,server_key_hash text,published boolean,reportable boolean,enforce_oidc boolean,join_policy text);
 INSERT INTO accounts.app_settings VALUES ${expectedClients.filter(x=>x.kind==='web').map(x=>`(${[x.appId,x.slug,x.launchUrl,x.callbackUrl].map(value).join(',')},gen_random_uuid(),repeat('a',64),false,false,false,'closed')`).join(',')};
 CREATE TABLE accounts.oauth_clients(client_id uuid,app_id text,client_kind text,callback_url text,enabled boolean);
 INSERT INTO accounts.oauth_clients SELECT oauth_client_id,app_id,'web',callback_url,true FROM accounts.app_settings;
 INSERT INTO accounts.oauth_clients VALUES(gen_random_uuid(),'app_kestrek','native','sk.kestrek://oauth/callback',true);
 CREATE TABLE auth.oauth_clients(id uuid,deleted_at timestamptz); INSERT INTO auth.oauth_clients SELECT client_id,NULL FROM accounts.oauth_clients;
 ${credentials.filter(x=>x.kind==='database-password').map(x=>`CREATE ROLE ${x.role} ${x.initialLogin?'LOGIN':'NOLOGIN'} NOINHERIT; CREATE SCHEMA ${x.schema}; CREATE TABLE ${x.schema}.sessions(id text); GRANT USAGE ON SCHEMA ${x.schema} TO ${x.role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ${x.schema}.sessions TO ${x.role};`).join('\n')}
 ${credentials.filter(x=>x.kind.endsWith('-jwt')).map(x=>`CREATE ROLE ${x.role} NOLOGIN NOINHERIT; CREATE SCHEMA ${x.schema}; GRANT USAGE ON SCHEMA ${x.schema} TO ${x.role}; GRANT ${x.role} TO authenticator;`).join('\n')}
 CREATE FUNCTION odonto.ecosystem_identity_config() RETURNS jsonb LANGUAGE sql AS 'SELECT jsonb_build_object(''safe'',true)';
 REVOKE ALL ON FUNCTION odonto.ecosystem_identity_config() FROM PUBLIC,odonto_backend;
 GRANT USAGE ON SCHEMA odonto TO odonto_identity_web;
 GRANT EXECUTE ON FUNCTION odonto.ecosystem_identity_config() TO odonto_identity_web;`);
 for(const target of credentials)sql(`BEGIN READ ONLY; ${preflightGuard(target)} ROLLBACK;`);
 const entry=credentials[0],password=randomBytes(32).toString('base64url'),verifier=scramVerifier(password);
 assert.throws(()=>sql(`BEGIN; UPDATE accounts.settings SET registration_mode='open'; ${preflightGuard(entry)} ROLLBACK;`));
 assert.throws(()=>sql(`BEGIN; DELETE FROM accounts.oauth_clients WHERE client_kind='native'; ${preflightGuard(entry)} ROLLBACK;`));
 assert.throws(()=>sql(`BEGIN; REVOKE UPDATE ON kestrek_identity.sessions FROM kestrek_identity_web; ${preflightGuard(entry)} ROLLBACK;`));
 assert.throws(()=>sql(`BEGIN; ALTER ROLE kestrek_identity_web CREATEDB; ${preflightGuard(entry)} ROLLBACK;`));
 assert.throws(()=>sql(`BEGIN; GRANT USAGE ON SCHEMA core TO kestrek_identity_web; GRANT SELECT ON core.profiles TO kestrek_identity_web; ${preflightGuard(entry)} ROLLBACK;`));
 const identity=credentials.find(x=>x.key==='odonto-identity');
 assert.throws(()=>sql(`BEGIN; REVOKE EXECUTE ON FUNCTION odonto.ecosystem_identity_config() FROM odonto_identity_web; ${preflightGuard(identity)} ROLLBACK;`));
 assert.equal(sql("SELECT NOT rolcanlogin AND rolpassword IS NULL FROM pg_authid WHERE rolname='kestrek_identity_web'"),'t');
 const prepared=passwordTransaction(entry,verifier);
 await assert.rejects(executePasswordTransaction(container,prepared.replace('ALTER ROLE kestrek_identity_web',"DO $$ BEGIN RAISE WARNING 'fixture warning'; END $$; ALTER ROLE kestrek_identity_web")));
 assert.equal(sql("SELECT NOT rolcanlogin AND rolpassword IS NULL FROM pg_authid WHERE rolname='kestrek_identity_web'"),'t');
 await executePasswordTransaction(container,prepared);
 assert.equal(sql("SELECT rolcanlogin AND NOT(rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname='kestrek_identity_web'"),'t');
 const authenticate=secret=>docker(['exec','-i',container,'sh','-c',
  'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -X -h 127.0.0.1 -U kestrek_identity_web -d postgres -v ON_ERROR_STOP=1 -Atq -c "SELECT current_user"'],secret+'\n');
 assert.equal(authenticate(password),'kestrek_identity_web');
 assert.throws(()=>authenticate(randomBytes(32).toString('base64url')));
 await assert.rejects(executePasswordTransaction(container,prepared));
 const logResult=spawnSync('docker',['logs',container],{encoding:'utf8'});
 assert.equal(logResult.status,0);
 const logs=logResult.stdout+logResult.stderr;
 assert.ok(logs.includes('statement:'));
 assert.equal(logs.includes(password),false);assert.equal(logs.includes(verifier),false);
});
