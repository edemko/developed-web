import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { config } from '../dist/config.js';
import { createAccountServer } from '../dist/http.js';
import { HttpError } from '../dist/security.js';

const client='17064340-5563-4ca0-b7f3-cf44c6af7001';
const input={grant_type:'authorization_code',client_id:client,client_secret:'fixture-client-secret',code:'fixture-code',code_verifier:'v'.repeat(43),redirect_uri:'https://fixture.invalid/callback'};
const tokens={access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'bearer'};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));

test('secondary OAuth provider is opt-in, operator-controlled and rejects unsafe URL inputs',()=>{
 const env={ACCOUNTS_ORIGIN:'https://www.developed.sk',ACCOUNTS_PROVIDER_URL:'http://127.0.0.1:3141',ACCOUNTS_PROVIDER_ADMIN_KEY:'fixture-admin',ACCOUNTS_DATABASE_URL:'fixture',ACCOUNTS_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
 assert.equal(config(env).oauthProviderUrl,undefined);
 assert.equal(config({...env,ACCOUNTS_OAUTH_PROVIDER_URL:'http://127.0.0.1:39998/'}).oauthProviderUrl,'http://127.0.0.1:39998');
 assert.equal(config({...env,ACCOUNTS_OAUTH_PROVIDER_URL:'https://trusted.example.invalid/auth/v1'}).oauthProviderUrl,'https://trusted.example.invalid/auth/v1');
 for(const value of ['http://evil.invalid','http://172.30.1.2:9999','https://user:secret@trusted.invalid','https://trusted.invalid/#fragment','https://trusted.invalid/?upstream=evil','file:///tmp/provider']){
  assert.throws(()=>config({...env,ACCOUNTS_OAUTH_PROVIDER_URL:value}));
 }
});

test('fixed migration routes select only token transport and preserve primary checks',async()=>{
 const calls=[];let denied=false;
 const upstream=createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  calls.push('secondary:'+req.url);
  if(req.url==='/oauth/token'){
   assert.equal(req.headers.authorization,undefined);assert.equal(req.headers.apikey,undefined);assert.equal(req.headers.cookie,undefined);
   assert.equal(new URLSearchParams(Buffer.concat(chunks).toString()).get('client_secret'),input.client_secret);
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(tokens));
  }else if(req.url==='/oauth/userinfo'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({sub:'fixture-user'}));}
  else {res.writeHead(404);res.end();}
 });
 const upstreamOrigin=await listen(upstream);
 const primary={
  exchangeOAuth:async()=>{calls.push('primary:exchange');return Response.json(tokens);},
  call:async()=>{calls.push('primary:userinfo');return {sub:'fixture-user'};},
 };
 const accounts={
  config:{origin:'https://www.developed.sk',providerUrl:'http://127.0.0.1:3141',providerKey:'fixture-admin',oauthProviderUrl:upstreamOrigin,insecureLocal:false},
  provider:primary,db:{limit:async()=>{}},
  appForClient:async id=>{assert.equal(id,client);calls.push('primary:client');},
  finalizeOAuthCode:async()=>{calls.push('primary:binding');if(denied)throw new HttpError(401,'invalid_session');},
  validateOAuthAccess:async()=>{calls.push('primary:validate');if(denied)throw new HttpError(401,'invalid_session');},
 };
 const server=createAccountServer(accounts),origin=await listen(server);
 const post=path=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Host:'attacker.invalid','X-Forwarded-Host':'another.invalid',Cookie:'ignored=value'},body:new URLSearchParams(input)});
 try{
  assert.equal((await post('/oauth-migration/token')).status,200);
  assert.deepEqual(calls,['primary:client','secondary:/oauth/token','primary:binding']);
  calls.length=0;
  assert.equal((await post('/oauth/token')).status,200);
  assert.deepEqual(calls,['primary:client','primary:exchange','primary:binding']);
  calls.length=0;
  assert.equal((await fetch(origin+'/oauth-migration/userinfo',{headers:{Authorization:'Bearer fixture-access'}})).status,200);
  assert.deepEqual(calls,['primary:validate','secondary:/oauth/userinfo']);
  calls.length=0;denied=true;
  assert.equal((await fetch(origin+'/oauth-migration/userinfo',{headers:{Authorization:'Bearer fixture-access'}})).status,401);
  assert.deepEqual(calls,['primary:validate']);
  calls.length=0;
  assert.equal((await post('/oauth-migration/token')).status,400);
  assert.deepEqual(calls,['primary:client','secondary:/oauth/token','primary:binding']);
  calls.length=0;
  assert.equal((await post('/oauth-migration/token?upstream=http://evil.invalid')).status,400);
  assert.deepEqual(calls,[]);
  assert.equal((await fetch(origin+'/oauth-migration/admin/users')).status,404);
 }finally{await close(server);await close(upstream);}
});

test('migration endpoints remain unavailable when operator setting is absent',async()=>{
 const server=createAccountServer({config:{origin:'https://www.developed.sk'},provider:{},db:{}});
 const origin=await listen(server);
 try{for(const path of ['/oauth-migration/token','/oauth-migration/userinfo'])assert.equal((await fetch(origin+path)).status,404);}
 finally{await close(server);}
});
