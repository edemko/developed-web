import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes, generateKeyPairSync, createHash } from 'node:crypto';
import { SignJWT, importJWK, jwtVerify, createRemoteJWKSet } from '../../../packages/ecosystem-auth/node_modules/jose/dist/webapi/index.js';
import pg from '../node_modules/pg/esm/index.mjs';
import { Accounts } from '../dist/accounts.js';
import { Database } from '../dist/db.js';
import { Provider } from '../dist/provider.js';
import { createAccountServer } from '../dist/http.js';
import { oauthBroker } from '../dist/oauth-broker.js';
import { hash } from '../dist/security.js';
import { createOidcClient } from '../../../packages/ecosystem-auth/index.mjs';

const prefix = 'developed-issuer-test-' + process.pid;
const network = prefix + '-network', database = prefix + '-db';
const providers = [prefix+'-old',prefix+'-new'];
const issuers = ['http://127.0.0.1:19991','http://127.0.0.1:19992'];
const password=randomBytes(24).toString('hex'), secret=randomBytes(32).toString('hex');
const privateJwk=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'jwk'});
Object.assign(privateJwk,{alg:'ES256',kid:'issuer-fixture-only',use:'sig',key_ops:['sign']});
const privateKey=await importJWK(privateJwk,'ES256');
const env=values=>Object.entries(values).flatMap(([k,v])=>['-e',k+'='+v]);
const docker=args=>execFileSync('sudo',['docker',...args],{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000}).trim();
const sql=text=>dockerInput(['exec','-i',database,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],text);
const dockerInput=(args,input)=>execFileSync('sudo',['docker',...args],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000}).trim();
const pause=()=>new Promise(r=>setTimeout(r,100));
const report=s=>console.log('PASS '+s);
const origins=[], servers=[]; let admin,db,stage='create isolated fixtures';
async function listen(server) {servers.push(server); await new Promise(r=>server.listen(0,'127.0.0.1',r)); return 'http://127.0.0.1:'+server.address().port;}
try {
 docker(['network','create','--label','developed.identity.qualification=true',network]);
 docker(['run','--pull=never','-d','--name',database,'--network',network,'--memory','192m','--cpus','0.5','--pids-limit','100','--label','developed.identity.qualification=true',...env({POSTGRES_PASSWORD:password}),'postgres:17-alpine','-c','shared_buffers=32MB','-c','max_connections=40']);
 for(let i=0;i<120;i++){try{docker(['exec',database,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{await pause();}}
 sql('CREATE SCHEMA auth;');
 for(let n=0;n<2;n++){
  docker(['run','--pull=never','-d','--name',providers[n],'--network',network,'-p','127.0.0.1::9999','--memory','128m','--cpus','0.5','--pids-limit','100','--label','developed.identity.qualification=true',...env({
   GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:issuers[n],GOTRUE_SITE_URL:'http://127.0.0.1:39999',GOTRUE_URI_ALLOW_LIST:'https://fixture.example.invalid/**',
   GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgres://postgres:'+password+'@'+database+':5432/postgres?search_path=auth',
   GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_KEYS:JSON.stringify([privateJwk]),GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_EXP:'300',GOTRUE_JWT_ISSUER:issuers[n],
   GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_OAUTH_SERVER_ENABLED:'true',GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH:'/account/authorize',GOTRUE_OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION:'false',GOTRUE_LOG_LEVEL:'panic'
  }),'supabase/gotrue:v2.189.0']);
  const port=docker(['port',providers[n],'9999/tcp']).split(':').at(-1); origins.push('http://127.0.0.1:'+port);
  let ready=false;for(let i=0;i<180;i++){try{if((await fetch(origins[n]+'/health')).ok){ready=true;break;}}catch{}await pause();}assert.ok(ready,'isolated provider startup');
 }
 report('two isolated providers with separate issuers and shared disposable Auth DB/signing keys');
 stage='bootstrap scoped central schema';
 sql(readFileSync(new URL('./isolated-bootstrap.sql',import.meta.url),'utf8'));
 // Minimal core contract fixture, not a production baseline or migration.
 sql("CREATE SCHEMA core; CREATE TABLE core.profiles(id uuid primary key references auth.users(id),display_name text,photo_url text,role text not null default 'USER',created_at timestamptz not null default now(),updated_at timestamptz not null default now()); CREATE TABLE core.apps(id text primary key,name text,base_path text,status text,deleted_at timestamptz,icon text); CREATE TABLE core.app_access(id text primary key,user_id uuid references core.profiles(id),app_id text references core.apps(id),role text,unique(user_id,app_id)); ALTER TABLE core.profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE core.apps ENABLE ROW LEVEL SECURITY; ALTER TABLE core.app_access ENABLE ROW LEVEL SECURITY; CREATE FUNCTION core.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN INSERT INTO core.profiles(id,display_name) VALUES(NEW.id,coalesce(NEW.raw_user_meta_data->>'name','Fixture')); RETURN NEW; END $$; CREATE TRIGGER fixture_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION core.handle_new_user();");
 const migrations=new URL('../../../supabase/migrations/',import.meta.url);
 for(const name of readdirSync(migrations).sort()){
  if(!name.endsWith('.sql')||name.includes('ecosystem_scoped_data_roles')||name.includes('otazkomat_schema'))continue;
  stage='isolated migration '+name; sql(readFileSync(new URL(name,migrations),'utf8'));
 }
 sql("ALTER ROLE developed_accounts LOGIN PASSWORD '"+password+"'; UPDATE accounts.settings SET browser_binding_required=true;");
 const ip=JSON.parse(docker(['inspect',database,'--format','{{json .NetworkSettings.Networks}}']))[network].IPAddress;
 admin=new pg.Pool({connectionString:'postgres://postgres:'+password+'@'+ip+':5432/postgres',max:2});
 db=new Database('postgres://developed_accounts:'+password+'@'+ip+':5432/postgres');
 const adminToken=await new SignJWT({role:'service_role'}).setProtectedHeader({alg:'ES256',kid:privateJwk.kid}).setIssuedAt().setExpirationTime('15m').setAudience('authenticated').sign(privateKey);
 const oldProvider=new Provider(origins[0],adminToken),newProvider=new Provider(origins[1],adminToken);
 const config={origin:'http://127.0.0.1:31499',providerUrl:origins[0],oauthProviderUrl:origins[1],providerKey:adminToken,databaseUrl:'',encryptionKey:randomBytes(32),port:31499,insecureLocal:true,mailjetKey:'',mailjetSecret:'',supportEmail:'test@example.invalid',mailEnabled:false,dailyEmailLimit:10,hourlyRegistrationLimit:10};
 const accounts=new Accounts(db,oldProvider,config),central=createAccountServer(accounts);
 const centralOrigin=await listen(central);config.origin=centralOrigin;
 const email='issuer-fixture@example.invalid',userPassword='Synthetic fixture password';
 const user=await oldProvider.create(email,userPassword,'Issuer fixture',true);
 let cookie='',csrf='';
 const request=async(path,method='GET',body)=>{
  const response=await fetch(centralOrigin+'/api/account'+path,{method,headers:{Cookie:cookie,Origin:centralOrigin,'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined});
  const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
  const data=await response.json();if(data.csrfToken)csrf=data.csrfToken;
  assert.equal(response.status,200,'central HTTP '+path);return data;
 };
 stage='real primary login';
 await request('/session');await request('/login','POST',{email,password:userPassword});await request('/session');
 report('primary portal login and scoped central account session');
 const callback='https://fixture.example.invalid/callback';
 const client=await oldProvider.call('/admin/oauth/clients','POST',{client_name:'Issuer migration fixture',client_type:'confidential',token_endpoint_auth_method:'client_secret_post',redirect_uris:[callback]});
 const appSecret=randomBytes(32).toString('base64url'),app='app_issuer_fixture';
 await admin.query("INSERT INTO core.apps(id,name,base_path,status) VALUES($1,'Issuer fixture','/fixture','ACTIVE')",[app]);
 await admin.query("INSERT INTO accounts.app_settings(app_id,slug,oauth_client_id,server_key_hash,launch_url,callback_url,published,join_policy,enforce_oidc) VALUES($1,'issuer-fixture',$2,$3,'https://fixture.example.invalid/start',$4,true,'free',true)",[app,client.client_id,hash(appSecret),callback]);
 await admin.query("INSERT INTO accounts.oauth_clients(client_id,app_id,client_kind,callback_url) VALUES($1,$2,'web',$3)",[client.client_id,app,callback]);
 const results=[];
 for(let n=0;n<2;n++){
  stage='issuer '+n+' code grant';
  const memory=new Map(),transport=(url,options)=>{
   const u=new URL(url);assert.equal(u.origin,issuers[n]);
   return fetch((['/oauth/token','/oauth/userinfo'].includes(u.pathname)?centralOrigin:origins[n])+(n&&['/oauth/token','/oauth/userinfo'].includes(u.pathname)?u.pathname.replace('/oauth/','/oauth-migration/'):u.pathname)+u.search,options);
  };
  const rp=createOidcClient({issuer:issuers[n],clientId:client.client_id,clientSecret:client.client_secret,redirectUri:callback,allowLoopbackHttp:true,fetch:transport,store:{create:async(k,v)=>memory.set(k,v),consume:async k=>{const v=memory.get(k);memory.delete(k);return v;}}});
  const flow=await rp.begin('/');
  const entry=process.env.BRANDED_AUTHORIZE === '1' ? await fetch(flow.url.replace(issuers[n],origins[0]),{redirect:'manual'}) : await transport(flow.url,{redirect:'manual'});assert.equal(entry.status,302);
  const authorizationId=new URL(entry.headers.get('location')).searchParams.get('authorization_id');
  const consent=await request('/authorize','POST',{authorizationId,approve:true});
  const result=await rp.complete(consent.redirectUrl,flow.flowCookie);
  assert.equal(result.identity.iss,issuers[n]);assert.equal(result.accessClaims.iss,issuers[n]);assert.equal(result.identity.sub,user.id);
  assert.equal((await accounts.internalCheck(appSecret,result.tokens.access_token)).user.id,user.id);
  const bindings=await admin.query('SELECT * FROM accounts.browser_delegations WHERE provider_session_id=$1',[result.accessClaims.session_id]);assert.equal(bindings.rows.length,1);
  assert.equal((await rp.userInfo(result.tokens.access_token,user.id)).sub,user.id);
  const refresh=await rp.refresh(result.tokens.refresh_token,user.id);assert.equal(refresh.accessClaims.iss,issuers[n]);assert.equal((await accounts.internalCheck(appSecret,refresh.tokens.access_token)).user.id,user.id);
  results.push({rp,tokens:refresh.tokens,session:result.accessClaims.session_id});
  report((n?'new':'old')+' issuer authorize -> PRIMARY consent -> issuer-specific broker -> strict ID/access issuer validation -> primary internalCheck -> userinfo -> refresh');
 }
 stage='native public clients';
 const nativeCallback='sk.developed.vocabulum://oauth/callback';
 const nativeClient=await oldProvider.call('/admin/oauth/clients','POST',{client_name:'Native issuer migration fixture',client_type:'public',token_endpoint_auth_method:'none',redirect_uris:[nativeCallback]});
 const nativeApp='app_voc_builder',nativeSecret=randomBytes(32).toString('base64url');
 await admin.query("INSERT INTO core.apps(id,name,base_path,status) VALUES($1,'Native fixture','/native-fixture','ACTIVE')",[nativeApp]);
 await admin.query("INSERT INTO accounts.app_settings(app_id,slug,server_key_hash,launch_url,published,join_policy,enforce_oidc) VALUES($1,'vocabulum-fixture',$2,'https://fixture.example.invalid/native',true,'free',true)",[nativeApp,hash(nativeSecret)]);
 await admin.query("INSERT INTO accounts.oauth_clients(client_id,app_id,client_kind,callback_url,platform) VALUES($1,$2,'native',$3,'ios')",[nativeClient.client_id,nativeApp,nativeCallback]);
 const nativeResults=[];
 for(let n=0;n<2;n++){
  const verifier=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url');
  const params=new URLSearchParams({client_id:nativeClient.client_id,redirect_uri:nativeCallback,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
  const start=await fetch(origins[n]+'/oauth/authorize?'+params,{redirect:'manual'});assert.equal(start.status,302);
  const authorizationId=new URL(start.headers.get('location')).searchParams.get('authorization_id');
  const consent=await request('/authorize','POST',{authorizationId,approve:true});
  const callbackUrl=new URL(consent.redirectUrl);assert.equal(callbackUrl.searchParams.get('state'),state);
  const path=n?'/oauth-migration/token':'/oauth/token';
  const exchange=async form=>{
   const response=await fetch(centralOrigin+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form)});
   assert.equal(response.status,200,'native token response');return response.json();
  };
  const tokens=await exchange({grant_type:'authorization_code',client_id:nativeClient.client_id,redirect_uri:nativeCallback,code:callbackUrl.searchParams.get('code'),code_verifier:verifier});
  const publicJwk={...privateJwk};delete publicJwk.d;delete publicJwk.key_ops;const key=await importJWK(publicJwk,'ES256');
  const access=(await jwtVerify(tokens.access_token,key,{issuer:issuers[n],audience:'authenticated',algorithms:['ES256']})).payload;
  const identity=(await jwtVerify(tokens.id_token,key,{issuer:issuers[n],audience:nativeClient.client_id,algorithms:['ES256']})).payload;
  assert.equal(identity.nonce,nonce);assert.equal(identity.sub,user.id);assert.equal(access.sub,user.id);
  assert.equal((await accounts.internalCheck(nativeSecret,tokens.access_token)).user.id,user.id);
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM accounts.browser_delegations WHERE provider_session_id=$1',[access.session_id])).rows[0].n,0);
  const refreshed=await exchange({grant_type:'refresh_token',client_id:nativeClient.client_id,refresh_token:tokens.refresh_token});
  assert.equal((await jwtVerify(refreshed.access_token,key,{issuer:issuers[n],audience:'authenticated',algorithms:['ES256']})).payload.sub,user.id);
  nativeResults.push({tokens:refreshed,exchange});
  report((n?'new':'old')+' native public client S256/code/nonce/strict issuer, primary access and refresh passed without browser binding');
 }
 stage='binding denial';
 const saved=(await admin.query('DELETE FROM accounts.browser_delegations WHERE provider_session_id=$1 RETURNING *',[results[1].session])).rows[0];
 await assert.rejects(accounts.internalCheck(appSecret,results[1].tokens.access_token),e=>e.code==='invalid_session');
 await admin.query('INSERT INTO accounts.browser_delegations(provider_session_id,user_id,client_id,browser_family_id) VALUES($1,$2,$3,$4)',[saved.provider_session_id,saved.user_id,saved.client_id,saved.browser_family_id]);
 report('new issuer token without exact browser delegation denied; binding restored only in disposable DB');
 stage='primary logout and dual revocation';
 await request('/logout','POST',{});
 for(const r of results){
  await assert.rejects(accounts.internalCheck(appSecret,r.tokens.access_token));
  await assert.rejects(r.rp.userInfo(r.tokens.access_token,user.id));
  await assert.rejects(r.rp.refresh(r.tokens.refresh_token,user.id));
 }
 report('primary browser logout revokes old/new app access, userinfo and refresh');
 for(const r of nativeResults){
  assert.equal((await accounts.internalCheck(nativeSecret,r.tokens.access_token)).user.id,user.id);
  r.tokens=await r.exchange({grant_type:'refresh_token',client_id:nativeClient.client_id,refresh_token:r.tokens.refresh_token});
 }
 report('browser logout preserves both old/new native sessions and refresh');
 await request('/session');await request('/login','POST',{email,password:userPassword});await request('/session');await request('/logout-all','POST',{});
 for(const r of nativeResults)await assert.rejects(accounts.internalCheck(nativeSecret,r.tokens.access_token));
 report('explicit all-device logout denies old/new native access');
 stage='tamper validation';
 const segments=results[1].tokens.access_token.split('.');const payload=JSON.parse(Buffer.from(segments[1],'base64url'));payload.sub='00000000-0000-4000-8000-000000000000';segments[1]=Buffer.from(JSON.stringify(payload)).toString('base64url');
 await assert.rejects(oldProvider.user(segments.join('.')));
 report('primary provider rejects forged token signature');
 console.log('RESULT all dual-issuer protocol/session checks passed; no production data, users, mail or configuration used');
} catch(error) {
 console.error('FAIL stage='+stage+' code='+(error.code||error.name)+' message='+String(error.message).slice(0,180));
 if(error.stderr && stage.startsWith('isolated migration'))console.error(String(error.stderr).slice(-500));
 process.exitCode=1;
} finally {
 for(const server of servers)await new Promise(r=>server.close(r));
 await db?.pool.end();await admin?.end();
 for(const name of [...providers,database]){try{docker(['rm','-f',name]);}catch{}}
 try{docker(['network','rm',network]);}catch{}
 console.log('CLEANUP disposable providers/database/network removed');
}
