// Separate, closed staging operator. Source hashes are immutable review inputs.
// No final-cutover SQL, credentials, arbitrary SQL paths or role memberships
// beyond the exact source's PostgREST impersonation grants are accepted.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { appMigrations, readAppSource, verifyAppSource } from './review-app-migrations.mjs';
import { migrations as centralMigrations } from './apply-central-migration.mjs';

export const seedName = 'closed-seven-app-prerequisites-v1';
export const reviewedImage = 'sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00';
export const stagedMigrations = appMigrations.slice(0, 9);
const reject = () => new Error('App staging operation rejected');
const q = value => `'${value.replaceAll("'", "''")}'`;
const apps = [
  ['app_mega_music','mega-music','https://megamusic.developed.sk/api/music/auth/start'],
  ['app_kestrek','kestrek','https://kestrek.sk/api/auth/ecosystem/start'],
  ['app_screentime','screentime','https://screentime.developed.sk/api/auth/login'],
  ['app_airsoft','airsoft','https://amp.developed.sk/api/auth/ecosystem/login'],
  ['app_voc_builder','vocabulum','https://vocabulum.developed.sk/auth/login'],
  ['app_odonto','odonto','https://frontend-jet-rho-66.vercel.app/api/account/login'],
  ['app_otazkomat','otazkomat','https://educatio.sk/api/auth/ecosystem/start'],
];
const values = apps.map(row => `(${row.map(q).join(',')})`).join(',\n');
const newRoles = ['kestrek_identity_web','screentime_web','airsoft_identity','vocabulum_backend',
  'odonto_identity_web','otazkomat_identity_web','otazkomat_backend','kestrek_backend','screentime_backend','odonto_backend'];
const seedBody = `
DO $seed$ BEGIN
 IF EXISTS(SELECT 1 FROM accounts.app_settings) OR EXISTS(SELECT 1 FROM accounts.oauth_clients)
 OR (SELECT count(*) FROM core.apps WHERE id IN (${apps.map(a=>q(a[0])).join(',')}))<>7
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN (${newRoles.map(q).join(',')}))
 THEN RAISE EXCEPTION 'Seed requires exact existing registry and pristine staging state'; END IF;
END $seed$;
CREATE ROLE kestrek_identity_web NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
INSERT INTO accounts.app_settings(app_id,slug,launch_url,published,reportable,enforce_oidc,join_policy)
SELECT app_id,slug,launch_url,false,false,false,'closed' FROM (VALUES ${values}) AS seed(app_id,slug,launch_url);
`;
export const seedSha256 = createHash('sha256').update(seedBody).digest('hex');

function replace(source, expected, replacement) {
  const index = source.indexOf(expected);
  if (index < 0 || source.indexOf(expected,index+expected.length)>=0) throw reject();
  return source.slice(0,index)+replacement+source.slice(index+expected.length);
}
function owned(source, start, end, role) {
  source = replace(source,start,`SET LOCAL ROLE ${role};\n${start}`);
  return replace(source,end,`${end}\nSET LOCAL ROLE postgres;`);
}

function sourceBody(entry, bytes) {
  verifyAppSource(entry.file,bytes);
  const source=bytes.toString();
  const boundaries=[...source.matchAll(/^\s*(begin|commit|rollback|start transaction|abort)\s*;\s*$/gim)];
  if(boundaries.length!==2 || boundaries[0][1].toLowerCase()!=='begin' || boundaries[1][1].toLowerCase()!=='commit'
    || source.slice(boundaries[1].index+boundaries[1][0].length).trim() || /^\s*\\/m.test(source)) throw reject();
  let body=source.slice(boundaries[0].index+boundaries[0][0].length,boundaries[1].index);
  // Complete-file hash fixes these source settings. Strip only those settings;
  // enforce stricter operator limits before any DDL, without a generic parser.
  body=body.replace(/^set local (lock_timeout|statement_timeout)\s*=\s*'[^']+';\s*$/gim,'');
  if(/\b(?:lock_timeout|statement_timeout|set_config|reset\s+all)\b/i.test(body)) throw reject();
  const index=stagedMigrations.indexOf(entry);
  if(index===3) {
    const policy=body.match(/create policy airsoft_ecosystem_storage[\s\S]*?;\n/)[0];
    body=replace(body,policy,`SET LOCAL ROLE supabase_admin;\n${policy}SET LOCAL ROLE postgres;\n`);
    body=owned(body,'create or replace function airsoft.provision_user_on_access()',
      'revoke all on function airsoft.provision_user_on_access() from public,anon,authenticated,service_role;', 'supabase_admin');
  }
  if(index===7) {
    // The DO block is invoker SQL. Each app retains its observed schema owner;
    // existing routines may have either reviewed trusted owner. No ownership
    // transfer or grant of app privileges to a Storage/Auth runtime is needed.
    body=replace(body,"    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I',app.schema_name,role_name);",
      "    PERFORM set_config('role',CASE WHEN app.schema_name='odonto' THEN 'supabase_admin' ELSE 'postgres' END,true);\n    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I',app.schema_name,role_name);\n    PERFORM set_config('role','postgres',true);");
    body=replace(body,"    IF app.schema_name='odonto' THEN", "    PERFORM set_config('role',CASE WHEN app.schema_name='odonto' THEN 'supabase_admin' ELSE 'postgres' END,true);\n    IF app.schema_name='odonto' THEN");
    body=replace(body,'SELECT p.oid,p.proname,p.prosecdef,p.prorettype FROM pg_proc',
      'SELECT p.oid,p.proname,p.prosecdef,p.prorettype,pg_get_userbyid(p.proowner) AS owner_name FROM pg_proc');
    body=replace(body,"      IF left(routine.proname,19)='ecosystem_identity_' THEN CONTINUE; END IF;",
      "      IF left(routine.proname,19)='ecosystem_identity_' THEN CONTINUE; END IF;\n      IF routine.owner_name NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Unexpected routine owner'; END IF;\n      PERFORM set_config('role',routine.owner_name,true);");
    body=replace(body,"    EXECUTE format('CREATE VIEW %I.identity_directory WITH (security_barrier=true) AS",
      "    PERFORM set_config('role',CASE WHEN app.schema_name='odonto' THEN 'supabase_admin' ELSE 'postgres' END,true);\n    EXECUTE format('CREATE VIEW %I.identity_directory WITH (security_barrier=true) AS");
    body=replace(body,"    EXECUTE format('GRANT SELECT ON %I.identity_directory TO %I',app.schema_name,role_name);",
      "    EXECUTE format('GRANT SELECT ON %I.identity_directory TO %I',app.schema_name,role_name);\n    PERFORM set_config('role','postgres',true);");
    body=owned(body,'DO $$ DECLARE mapping record; BEGIN',"NOTIFY pgrst,'reload schema';",'supabase_admin');
  }
  if(index===8) {
    body=owned(body,'grant odonto_identity_web to authenticator;',
      'grant usage on schema odonto to odonto_identity_web;','supabase_admin');
    body=owned(body,'create function odonto.ecosystem_identity_config()',"notify pgrst,'reload schema';",'supabase_admin');
  }
  return body;
}

const centralGuard=centralMigrations.map(m=>`IF NOT EXISTS(SELECT 1 FROM accounts.deployment_migrations WHERE version='${m.version}' AND source_sha256='${m.sha256}') THEN RAISE EXCEPTION 'Central checksum mismatch'; END IF;`).join('\n');
const closedGuard=`
 IF (SELECT count(*) FROM accounts.settings WHERE singleton AND registration_mode='closed')<>1
 THEN RAISE EXCEPTION 'Registration must remain closed'; END IF;
`;
const rolesGuard=`
 IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname='mega_music_web' AND r.rolcanlogin
   AND NOT(r.rolsuper OR r.rolbypassrls OR r.rolinherit OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)
   AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid))
 THEN RAISE EXCEPTION 'Unsafe existing Mega runtime role'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN (${newRoles.map(q).join(',')}) AND
   (r.rolsuper OR r.rolbypassrls OR r.rolinherit OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication
    OR (r.rolcanlogin AND r.rolname NOT IN ('screentime_web','airsoft_identity'))
    OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)))
 THEN RAISE EXCEPTION 'Unsafe staging role'; END IF;
`;
const settingsGuard=`
 IF (SELECT count(*) FROM accounts.app_settings)<>7 OR EXISTS(
 SELECT 1 FROM (VALUES ${values}) expected(app_id,slug,launch_url)
 LEFT JOIN accounts.app_settings a USING(app_id)
 WHERE a.app_id IS NULL OR a.slug<>expected.slug OR a.launch_url<>expected.launch_url
 OR a.published OR a.reportable OR a.enforce_oidc OR a.join_policy<>'closed'
 OR a.oauth_client_id IS NOT NULL OR a.server_key_hash IS NOT NULL OR a.callback_url IS NOT NULL)
 OR EXISTS(SELECT 1 FROM accounts.oauth_clients)
 THEN RAISE EXCEPTION 'Closed app prerequisites changed'; END IF;
`;

export function prepareAppMigration(file,bytes) {
  const entry=stagedMigrations.find(m=>m.file===file), isSeed=file===seedName;
  if(!entry&&!isSeed) throw reject();
  const index=isSeed ? 0 : stagedMigrations.indexOf(entry)+1;
  const hash=isSeed?seedSha256:entry.sha256;
  const body=isSeed?seedBody:sourceBody(entry,bytes);
  const predecessors=[{file:seedName,sha256:seedSha256},...stagedMigrations].slice(0,index);
  const ledgerGuard=isSeed ? `IF to_regclass('accounts.app_deployment_migrations') IS NOT NULL THEN RAISE EXCEPTION 'App seed already recorded'; END IF;` : `
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='accounts.app_deployment_migrations'::regclass AND relkind='r'
   AND pg_get_userbyid(relowner)='postgres' AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'Unsafe app ledger'; END IF;
 IF (SELECT count(*) FROM accounts.app_deployment_migrations)<>${index} THEN RAISE EXCEPTION 'Unexpected app history'; END IF;
 ${predecessors.map(p=>`IF NOT EXISTS(SELECT 1 FROM accounts.app_deployment_migrations WHERE source_file=${q(p.file)} AND source_sha256='${p.sha256}') THEN RAISE EXCEPTION 'App checksum mismatch'; END IF;`).join('\n')}
 ${settingsGuard}
 `;
  const ledger=isSeed?`CREATE TABLE accounts.app_deployment_migrations(
 source_file text PRIMARY KEY, source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
 applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
 ALTER TABLE accounts.app_deployment_migrations ENABLE ROW LEVEL SECURITY;
 ALTER TABLE accounts.app_deployment_migrations FORCE ROW LEVEL SECURITY;
 REVOKE ALL ON accounts.app_deployment_migrations FROM PUBLIC,anon,authenticated,service_role,developed_accounts;`:'';
  return {file,sha256:hash,sql:`BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='30s';
SET LOCAL idle_in_transaction_session_timeout='30s';
LOCK TABLE accounts.settings,accounts.app_settings,accounts.oauth_clients IN SHARE MODE;
DO $guard$ BEGIN
 IF session_user<>'supabase_admin' OR current_database()<>'postgres' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper)
 THEN RAISE EXCEPTION 'Trusted Supabase operator required'; END IF;
 IF NOT pg_try_advisory_xact_lock(194812,20260920) THEN RAISE EXCEPTION 'Another deployment is active'; END IF;
 IF (SELECT count(*) FROM accounts.deployment_migrations)<>3 THEN RAISE EXCEPTION 'Unexpected central history'; END IF;
 ${centralGuard} ${closedGuard} ${rolesGuard} ${ledgerGuard}
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='accounts.deployment_migrations'::regclass
 AND pg_get_userbyid(relowner)='postgres' AND relrowsecurity AND relforcerowsecurity)
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='accounts.deployment_migrations'::regclass)
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='storage' AND c.relname IN ('buckets','objects') AND pg_get_userbyid(c.relowner)<>'supabase_storage_admin')
 THEN RAISE EXCEPTION 'Unexpected protected ownership'; END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('core','accounts','mega_music','kestrek','screentime','airsoft','voc_builder','otazkomat','extensions') AND pg_get_userbyid(nspowner)<>'postgres')
 OR (SELECT count(*) FROM pg_namespace WHERE nspname IN ('odonto','storage','auth') AND pg_get_userbyid(nspowner)='supabase_admin')<>3
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN ('mega_music','kestrek','screentime','airsoft','voc_builder','odonto','otazkomat')
   AND c.relkind IN ('r','p','v','m','S') AND c.relname<>'schema_migrations'
   AND pg_get_userbyid(c.relowner)<>CASE WHEN n.nspname='odonto' THEN 'supabase_admin' ELSE 'postgres' END)
 THEN RAISE EXCEPTION 'Unexpected app ownership'; END IF;
END $guard$;
${body}
SET LOCAL ROLE postgres;
${ledger}
DO $post$ BEGIN ${closedGuard} ${settingsGuard} ${rolesGuard} END $post$;
INSERT INTO accounts.app_deployment_migrations(source_file,source_sha256) VALUES(${q(file)},'${hash}');
`};
}

// Keep COMMIT out of the first psql input. A warning aborts the transaction
// before it can commit (psql ON_ERROR_STOP alone ignores ineffective GRANTs).
export async function runAppMigration(args) {
  let file,container,apply=false;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--apply'&&!apply) { apply=true; continue; }
    if(args[i]==='--migration'&&!file) {file=args[++i];continue;}
    if(args[i]==='--container'&&!container) {container=args[++i];continue;}
    throw reject();
  }
  if(container && container!=='supabase-db' && !/^developed-app-migration-test-\d+-db$/.test(container)) throw reject();
  if(apply&&!container) throw reject();
  const entry=stagedMigrations.find(m=>m.file===file);
  const prepared=prepareAppMigration(file,entry?await readAppSource(entry):undefined);
  if(!apply) return `Validated ${file} SHA256 ${prepared.sha256}; no connection or mutation.`;
  const docker=(a,input)=>execFileSync('docker',a,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:120000,maxBuffer:1024*1024});
  if(docker(['inspect','--format','{{.Image}} {{.State.Running}}',container]).trim()!==`${reviewedImage} true`) throw reject();
  if(container!=='supabase-db' && docker(['inspect','--format','{{index .Config.Labels "developed.app.migration.test"}} {{.HostConfig.NetworkMode}}',container]).trim()!=='true none') throw reject();
  // Merge psql diagnostics/output inside the container, before Docker reads
  // them: the marker then follows all statement diagnostics in one pipe.
  const { spawn }=await import('node:child_process');
  await new Promise((resolve,rejectPromise)=>{
    const child=spawn('docker',['exec','-i',container,'sh','-c','exec psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -Atq 2>&1'],{stdio:['pipe','pipe','pipe']});
    let out='',diagnostics='',committed=false;
    const timer=setTimeout(()=>{child.kill();rejectPromise(reject());},120000);
    child.stderr.on('data',b=>{diagnostics+=b;});
    child.stdout.on('data',b=>{
      out+=b;
      if(!committed&&out.includes('APP_STAGING_READY\n')) {
        if(/WARNING|ERROR|FATAL/.test(out+diagnostics)){child.stdin.end('ROLLBACK;\n\\q\n');return;}
        committed=true;child.stdin.end('COMMIT;\n\\q\n');
      }
    });
    child.on('error',()=>{clearTimeout(timer);rejectPromise(reject());});
    child.on('exit',code=>{clearTimeout(timer);if(code!==0||!committed||/WARNING|ERROR|FATAL/.test(out+diagnostics)) rejectPromise(reject());else resolve();});
    child.stdin.write(`${prepared.sql}\n\\echo APP_STAGING_READY\n`);
  });
  if(docker(['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],
    `SELECT count(*) FROM accounts.app_deployment_migrations WHERE source_file=${q(file)} AND source_sha256='${prepared.sha256}';`).trim()!=='1') throw reject();
  return `Applied ${file} with atomic checksum ledger in ${container==='supabase-db'?'reviewed production staging':'disconnected rehearsal'}; activation remains off.`;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 runAppMigration(process.argv.slice(2)).then(message=>process.stdout.write(`${message}\n`)).catch(()=>{
 process.stderr.write('App staging failed; diagnostics withheld. Reconcile exact committed checksum before retry.\n');process.exitCode=1;});
}
