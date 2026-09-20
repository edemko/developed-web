// Root-only, fixed-target bootstrap. No runtime configuration or activation.
import {createHash,createHmac,pbkdf2Sync,randomBytes} from 'node:crypto';
import {constants,readFileSync} from 'node:fs';
import {lstat,open} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {protectedPath,validateSigningConfig,validateRequest,validateIdentityStoreRequest,
  signScopedKey,signIdentityStoreKey} from './issue-scoped-data-key.mjs';
import {exclusiveWrite,registrations} from './register-private-clients.mjs';
import {seedName,seedSha256,stagedMigrations,reviewedImage} from './apply-app-migration.mjs';
import {migrations as centralMigrations} from './apply-central-migration.mjs';

export const primaryDirectory='/etc/developed-accounts/runtime-staging';
export const backupDirectory='/var/backups/developed-accounts/runtime-staging';
export const signingPath='/etc/developed-accounts/operator-signing.json';
export const expectedClients=Object.freeze(registrations(readFileSync(new URL('../launch-catalog.json',import.meta.url),'utf8')));
export const credentials=Object.freeze([
 ['kestrek-db','database-password','kestrek_identity_web','kestrek_identity',false,'ECOSYSTEM_DATABASE_URL'],
 ['screentime-db','database-password','screentime_web','screentime_web',true,'ECOSYSTEM_DATABASE_URL'],
 ['airsoft-db','database-password','airsoft_identity','airsoft_identity',true,'ECOSYSTEM_DATABASE_URL'],
 ['otazkomat-db','database-password','otazkomat_identity_web','otazkomat_identity',false,'ECOSYSTEM_SESSION_DATABASE_URL'],
 ['kestrek-data','data-jwt','kestrek_backend','kestrek',false,'SUPABASE_DATA_API_KEY'],
 ['screentime-data','data-jwt','screentime_backend','screentime',false,'SUPABASE_DATA_API_KEY'],
 ['vocabulum-data','data-jwt','vocabulum_backend','voc_builder',false,'SUPABASE_DATA_API_KEY'],
 ['odonto-data','data-jwt','odonto_backend','odonto',false,'SUPABASE_DATA_API_KEY'],
 ['otazkomat-data','data-jwt','otazkomat_backend','otazkomat',false,'SUPABASE_DATA_API_KEY'],
 ['odonto-identity','identity-jwt','odonto_identity_web','odonto_identity',false,'ECOSYSTEM_SESSION_API_KEY'],
 ['kestrek-session','session-key','kestrek_identity_web','kestrek_identity',false,'ECOSYSTEM_ENCRYPTION_KEY','hex'],
 ['screentime-session','session-key','screentime_web','screentime_web',true,'ECOSYSTEM_SESSION_KEY','base64'],
 ['airsoft-session','session-key','airsoft_identity','airsoft_identity',true,'ECOSYSTEM_ENCRYPTION_KEY','hex'],
 ['vocabulum-session','session-key','vocabulum_backend','voc_builder',false,'ECOSYSTEM_SESSION_ENCRYPTION_KEY','base64url'],
 ['odonto-session','session-key','odonto_identity_web','odonto_identity',false,'ECOSYSTEM_ENCRYPTION_KEY','hex'],
 ['otazkomat-session','session-key','otazkomat_identity_web','otazkomat_identity',false,'ECOSYSTEM_ENCRYPTION_KEY','base64'],
 ['odonto-bff','bff-key','odonto_identity_web','odonto_identity',false,'ECOSYSTEM_BFF_KEY','base64url'],
].map(([key,kind,role,schema,initialLogin,environment,encoding])=>Object.freeze({key,kind,role,schema,initialLogin,environment,...(encoding?{encoding}: {})})));
const invalid=()=>new Error('Runtime credential operation rejected; reconcile protected state before retrying');
const requireTrue=x=>{if(!x)throw invalid();};
const literal=s=>`'${s.replaceAll("'","''")}'`;
const known=entry=>requireTrue(credentials.includes(entry));
const expectedHistory=[{file:seedName,sha256:seedSha256},...stagedMigrations];

export function credentialPlan(key,expiresAt,now=Date.now()) {
 const entry=credentials.find(x=>x.key===key);known(entry);
 if(!entry.kind.endsWith('-jwt'))requireTrue(expiresAt===undefined);
 else(entry.kind==='identity-jwt'?validateIdentityStoreRequest:validateRequest)({role:entry.role,expiresAt},now);
 return {...entry,...(expiresAt?{expiresAt}:{}),status:'source-plan-no-connection-no-files'};
}

export function preflightGuard(entry,{passwordUnset=true}={}) {
 known(entry);
 const isKey=entry.kind==='session-key'||entry.kind==='bff-key';
 const isPrivateDb=credentials.some(x=>x.kind==='database-password'&&x.role===entry.role);
 const roleLoginCheck=isKey&&isPrivateDb?'true':`rolcanlogin=${passwordUnset?entry.initialLogin:entry.kind==='database-password'}`;
 const webValues=expectedClients.filter(x=>x.kind==='web').map(x=>`(${[x.appId,x.slug,x.launchUrl,x.callbackUrl].map(literal).join(',')})`).join(',');
 const clientValues=expectedClients.map(x=>`(${[x.appId,x.kind,x.callbackUrl].map(literal).join(',')})`).join(',');
 return `DO $credential_guard$ BEGIN
 IF session_user<>'supabase_admin' OR current_database()<>'postgres'
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper)
 THEN RAISE EXCEPTION 'Trusted operator required'; END IF;
 IF (SELECT count(*) FROM accounts.deployment_migrations)<>3
 OR (SELECT count(*) FROM accounts.app_deployment_migrations)<>10
 THEN RAISE EXCEPTION 'Unexpected deployment history'; END IF;
 IF (SELECT count(*) FROM pg_class WHERE oid IN ('accounts.deployment_migrations'::regclass,'accounts.app_deployment_migrations'::regclass)
 AND pg_get_userbyid(relowner)='postgres' AND relrowsecurity AND relforcerowsecurity)<>2
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid IN ('accounts.deployment_migrations'::regclass,'accounts.app_deployment_migrations'::regclass))
 THEN RAISE EXCEPTION 'Unsafe deployment ledger'; END IF;
 ${centralMigrations.map(x=>`IF NOT EXISTS(SELECT 1 FROM accounts.deployment_migrations WHERE version='${x.version}' AND source_sha256='${x.sha256}') THEN RAISE EXCEPTION 'Central checksum mismatch'; END IF;`).join('\n')}
 ${expectedHistory.map(x=>`IF NOT EXISTS(SELECT 1 FROM accounts.app_deployment_migrations WHERE source_file=${literal(x.file)} AND source_sha256='${x.sha256}') THEN RAISE EXCEPTION 'App checksum mismatch'; END IF;`).join('\n')}
 IF (SELECT count(*) FROM accounts.settings WHERE singleton AND registration_mode='closed')<>1
 OR (SELECT count(*) FROM accounts.app_settings)<>7
 OR EXISTS(SELECT 1 FROM accounts.app_settings WHERE published OR reportable OR enforce_oidc OR join_policy<>'closed')
 THEN RAISE EXCEPTION 'Staging controls changed'; END IF;
 IF (SELECT count(*) FROM accounts.oauth_clients)<>8 OR (SELECT count(*) FROM auth.oauth_clients)<>8
 OR EXISTS(SELECT 1 FROM accounts.oauth_clients c LEFT JOIN auth.oauth_clients p ON p.id=c.client_id WHERE p.id IS NULL OR p.deleted_at IS NOT NULL)
 OR EXISTS(
 SELECT 1 FROM (VALUES ${webValues}) e(app_id,slug,launch_url,callback_url)
 LEFT JOIN accounts.app_settings a USING(app_id) WHERE a.app_id IS NULL OR a.slug<>e.slug OR a.launch_url<>e.launch_url
 OR a.callback_url IS DISTINCT FROM e.callback_url OR a.oauth_client_id IS NULL OR a.server_key_hash IS NULL
 OR length(a.server_key_hash)<>64 OR NOT EXISTS(SELECT 1 FROM accounts.oauth_clients c WHERE c.client_id=a.oauth_client_id
 AND c.app_id=a.app_id AND c.client_kind='web' AND c.enabled AND c.callback_url=a.callback_url))
 OR EXISTS(SELECT 1 FROM (VALUES ${clientValues}) e(app_id,client_kind,callback_url)
 WHERE (SELECT count(*) FROM accounts.oauth_clients c WHERE c.app_id=e.app_id AND c.client_kind=e.client_kind
 AND c.callback_url=e.callback_url AND c.enabled)<>1)
 THEN RAISE EXCEPTION 'Exact seven-app eight-client configuration required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_authid r WHERE rolname='${entry.role}'
 AND ${roleLoginCheck}
 AND NOT(rolsuper OR rolinherit OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)
 ${passwordUnset&&!(isKey&&isPrivateDb)?'AND rolpassword IS NULL':''}
 AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid))
 THEN RAISE EXCEPTION 'Role is unsafe or already provisioned'; END IF;
 IF NOT has_schema_privilege('${entry.role}','${entry.schema}','USAGE')
 OR has_schema_privilege('${entry.role}','${entry.schema}','CREATE')
 OR has_table_privilege('${entry.role}','auth.users','SELECT')
 OR has_column_privilege('${entry.role}','auth.users','encrypted_password','SELECT')
 OR has_table_privilege('${entry.role}','accounts.sessions','SELECT')
 THEN RAISE EXCEPTION 'Unexpected role boundary'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('core','mega_music','kestrek','screentime','airsoft','voc_builder','odonto','otazkomat')
 AND n.nspname<>'${entry.schema}' AND c.relkind IN ('r','p','v','m')
 AND has_schema_privilege('${entry.role}',n.oid,'USAGE')
 AND has_table_privilege('${entry.role}',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
 OR has_function_privilege('${entry.role}',to_regprocedure('net.http_get(text,jsonb,jsonb,integer)'),'EXECUTE')
 THEN RAISE EXCEPTION 'Foreign data or outbound HTTP privilege'; END IF;
 ${entry.kind==='database-password'||(isKey&&isPrivateDb)?`IF EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p WHERE NOT has_table_privilege('${entry.role}','${entry.schema}.sessions',p)) THEN RAISE EXCEPTION 'Session grants missing'; END IF;`:
 `IF NOT EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles a ON a.oid=m.member
 WHERE r.rolname='${entry.role}' AND a.rolname='authenticator' AND NOT m.admin_option)
 THEN RAISE EXCEPTION 'Impersonation grant missing'; END IF;`}
 ${entry.kind==='identity-jwt'?`IF NOT has_function_privilege('${entry.role}','odonto.ecosystem_identity_config()','EXECUTE')
 OR has_function_privilege('odonto_backend','odonto.ecosystem_identity_config()','EXECUTE')
 THEN RAISE EXCEPTION 'Identity RPC boundary changed'; END IF;`:''}
 END $credential_guard$;`;
}

// Input is always an internally generated ASCII base64url password. That avoids
// Unicode normalization ambiguity and keeps cleartext out of PostgreSQL SQL.
export function scramVerifier(password) {
 requireTrue(typeof password==='string'&&/^[A-Za-z0-9_-]{43}$/.test(password));
 const salt=randomBytes(16),salted=pbkdf2Sync(password,salt,4096,32,'sha256');
 const client=createHmac('sha256',salted).update('Client Key').digest();
 const stored=createHash('sha256').update(client).digest('base64');
 const server=createHmac('sha256',salted).update('Server Key').digest('base64');
 return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`;
}

export function passwordTransaction(entry,verifier) {
 known(entry);requireTrue(entry.kind==='database-password');
 requireTrue(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/.test(verifier));
 // Session-local diagnostic controls: the stored verifier is also sensitive.
 // No ALTER SYSTEM/global logging changes; all settings disappear on disconnect.
 return `SET log_statement='none';
 SET log_min_duration_statement=-1; SET log_min_duration_sample=-1;
 SET log_duration=off; SET log_min_error_statement='panic';
 SET pgaudit.log='none';
 BEGIN;
 SET LOCAL lock_timeout='500ms'; SET LOCAL statement_timeout='5s';
 SET LOCAL idle_in_transaction_session_timeout='10s';
 LOCK TABLE accounts.settings,accounts.app_settings IN SHARE MODE;
 DO $$ BEGIN IF NOT pg_try_advisory_xact_lock(194812,20260920) THEN RAISE EXCEPTION 'Deployment in progress'; END IF; END $$;
 ${preflightGuard(entry)}
 ALTER ROLE ${entry.role} LOGIN PASSWORD ${literal(verifier)};
 ${preflightGuard(entry,{passwordUnset:false})}
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_authid WHERE rolname='${entry.role}' AND md5(rolpassword)='${createHash('md5').update(verifier).digest('hex')}') THEN RAISE EXCEPTION 'Credential persistence mismatch'; END IF; END $$;
 `;
}

export async function stageCredential(entry,expiresAt,{check,write,applyPassword,directory,backup,signingConfig}) {
 known(entry);credentialPlan(entry.key,expiresAt);
 await check(entry);
 const marker={version:1,credential:entry.key,role:entry.role,kind:entry.kind,startedAt:new Date().toISOString(),
 instruction:'No automatic retry or rotation. Reconcile both protected credential copies and database state.'};
 await write(`${directory}/${entry.key}.started.json`,marker);
 await write(`${backup}/${entry.key}.started.json`,marker);
 const secret=entry.kind==='database-password'
 ? {version:1,credential:entry.key,kind:entry.kind,role:entry.role,database:'postgres',password:randomBytes(32).toString('base64url'),createdAt:new Date().toISOString()}
 : entry.encoding?{version:1,credential:entry.key,kind:entry.kind,environment:entry.environment,encoding:entry.encoding,value:randomBytes(32).toString(entry.encoding),createdAt:new Date().toISOString()}
 : {...(entry.kind==='identity-jwt'?signIdentityStoreKey:signScopedKey)(signingConfig,{role:entry.role,expiresAt}),credential:entry.key,kind:entry.kind};
 await write(`${directory}/${entry.key}.credentials.json`,secret);
 await write(`${backup}/${entry.key}.credentials.json`,secret);
 if(entry.kind==='database-password')await applyPassword(entry,scramVerifier(secret.password));
 else await check(entry); // Recheck safety before reporting an issued key ready.
 const verified={version:1,credential:entry.key,role:entry.role,kind:entry.kind,verifiedAt:new Date().toISOString(),
 ...(secret.expiresAt?{expiresAt:secret.expiresAt,rotationDueAt:new Date(Math.max(Date.now(),Date.parse(secret.expiresAt)-14*24*3600_000)).toISOString()}:{}),runtimeConfigured:false,activated:false};
 await write(`${directory}/${entry.key}.verified.json`,verified);
 await write(`${backup}/${entry.key}.verified.json`,verified);
 return verified;
}

const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:20000,maxBuffer:1024*1024}).trim();
const query=sql=>docker(['exec','-i','supabase-db','psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],sql);
export async function executePasswordTransaction(container,sql) {
 requireTrue(container==='supabase-db'||/^developed-runtime-credential-test-\d+-db$/.test(container));
 await new Promise((resolve,reject)=>{
  const child=spawn('docker',['exec','-i',container,'sh','-c','exec psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -Atq 2>&1'],{stdio:['pipe','pipe','pipe']});
  let output='',errors='',committing=false;
  const timer=setTimeout(()=>{child.kill();reject(invalid());},20000);
  child.stderr.on('data',b=>{errors+=b;});
  child.stdout.on('data',b=>{
   output+=b;
   if(!committing&&output.includes('RUNTIME_CREDENTIAL_READY\n')) {
    if(/WARNING|ERROR|FATAL/.test(output+errors)){child.stdin.end('ROLLBACK;\n\\q\n');return;}
    committing=true;child.stdin.end('COMMIT;\n\\q\n');
   }
  });
  child.on('error',()=>{clearTimeout(timer);reject(invalid());});
  child.on('exit',code=>{clearTimeout(timer);if(code||!committing||/WARNING|ERROR|FATAL/.test(output+errors))reject(invalid());else resolve();});
  child.stdin.write(`${sql}\n\\echo RUNTIME_CREDENTIAL_READY\n`);
 });
}

async function signingConfig() {
 const expected=await protectedPath(signingPath,{mustExist:true});
 requireTrue(expected.uid===0&&expected.size<=16384);
 const handle=await open(signingPath,constants.O_RDONLY|constants.O_NOFOLLOW);
 try {
  const actual=await handle.stat();
  requireTrue(actual.uid===0&&actual.ino===expected.ino&&actual.dev===expected.dev&&actual.nlink===1&&(actual.mode&0o777)===0o600&&actual.size<=16384);
  return validateSigningConfig(JSON.parse(await handle.readFile('utf8')));
 }finally{await handle.close();}
}

export async function run(args) {
 let key,expiresAt,mode;
 for(let i=0;i<args.length;i++) {
  if(args[i]==='--credential'&&!key){key=args[++i];continue;}
  if(args[i]==='--expires-at'&&!expiresAt){expiresAt=args[++i];continue;}
  if(['--check','--apply'].includes(args[i])&&!mode){mode=args[i];continue;}
  throw invalid();
 }
 const plan=credentialPlan(key,expiresAt),entry=credentials.find(x=>x.key===key);
 if(!mode)return plan;
 requireTrue(process.getuid()===0);
 for(const directory of [primaryDirectory,backupDirectory]) {
  const info=await lstat(directory);
  requireTrue(info.isDirectory()&&!info.isSymbolicLink()&&info.uid===0&&(info.mode&0o777)===0o700);
  for(const suffix of ['started','credentials','verified'])requireTrue(!await protectedPath(`${directory}/${key}.${suffix}.json`));
 }
 requireTrue(docker(['inspect','--format','{{.Image}} {{.State.Running}}','supabase-db'])===`${reviewedImage} true`);
 const check=async target=>{query(`BEGIN READ ONLY;\n${preflightGuard(target)}\nROLLBACK;`);};
 await check(entry);
 const config=entry.kind.endsWith('-jwt')?await signingConfig():undefined;
 if(mode==='--check')return {credential:key,status:'preflight-passed-no-issuance-no-writes'};
 return stageCredential(entry,expiresAt,{check,write:exclusiveWrite,directory:primaryDirectory,backup:backupDirectory,signingConfig:config,
  applyPassword:async(target,verifier)=>{
   await executePasswordTransaction('supabase-db',passwordTransaction(target,verifier));
   requireTrue(query(`BEGIN READ ONLY; SELECT rolcanlogin AND md5(rolpassword)='${createHash('md5').update(verifier).digest('hex')}' FROM pg_authid WHERE rolname='${target.role}'; ROLLBACK;`)==='t');
  }});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 run(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(()=>{
  console.error('Runtime credential staging failed; no credential or database diagnostics printed. Reconcile durable files and DB state before retrying.');process.exitCode=1;
 });
}
