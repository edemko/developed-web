import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import {Accounts} from '../dist/accounts.js';
import {createAccountServer} from '../dist/http.js';
import {credentialMail} from '../dist/mail-templates.js';
import {validateNativeConfiguration} from '../dist/native-operator.js';

const config={origin:'https://www.developed.sk',musicOrigin:'https://megamusic.developed.sk',encryptionKey:Buffer.alloc(32,3),supportEmail:'info@developed.sk'};
test('product cookies cannot be replayed as portal cookies or remembered MFA cookies',()=>{
 const product=new Accounts({}, {}, {...config,origin:config.musicOrigin,surfaceAppId:'app_mega_music'});
 const raw='A'.repeat(43),sealed=product.surfaceCookie(raw,'session');
 assert.notEqual(sealed,raw);assert.equal(product.readSurfaceCookie(sealed,'session'),raw);
 assert.equal(product.readSurfaceCookie(sealed,'trust'),undefined);
 assert.equal(product.readSurfaceCookie(raw,'session'),undefined);
 assert.match(product.cookie(raw),/HttpOnly; SameSite=Lax/);assert.doesNotMatch(product.cookie(raw),/Domain=/);
});
test('music mail uses central copy, local action URLs, embedded logo and four languages',()=>{
 for(const language of ['en','sk','cs','uk']){
  const mail=credentialMail('fixture@example.invalid','verification',`${config.musicOrigin}/verify-email#token=${'a'.repeat(43)}`,language,{...config,origin:config.musicOrigin,mailBrand:'mega-music'});
  assert.equal(mail.brand,'mega-music');assert.ok(mail.inlineLogo.length>100);
  assert.match(mail.html,/cid:mega-music-logo/);assert.match(mail.html,/#d90007/);
  assert.match(mail.text,/developed.sk/);assert.doesNotMatch(mail.html,/<img[^>]+src="https:/);
 }
 assert.throws(()=>credentialMail('fixture@example.invalid','verification',`https://evil.invalid/verify-email#token=${'a'.repeat(43)}`,'en',{origin:config.musicOrigin,mailBrand:'mega-music'}));
});
test('music surface is opt-in and exposes no central administrative or internal routes',async t=>{
 const db={query:async sql=>{
  if(sql.includes('insert into accounts.sessions'))return [{id:'fixture'}];
  if(sql.includes('select registration_mode'))return [{registration_mode:'invitation'}];
  throw Error('Unexpected database access');
 },limit:async()=>{}};
 const server=createAccountServer(new Accounts(db,{},config));server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>server.close());
 const request=path=>new Promise((resolve,reject)=>{
  http.get({host:'127.0.0.1',port:server.address().port,path,headers:{Host:'megamusic.developed.sk'}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));}).on('error',reject);
 });
 const registration=await request('/register');assert.equal(registration.status,200);assert.match(registration.body,/data-product="mega-music"/);
 const session=await request('/api/account/session');assert.equal(session.status,200);assert.equal(JSON.parse(session.body).registrationMode,'invitation');
 for(const path of ['/admin/users','/api/account/admin/users','/api/account/internal/session/check','/oauth/token'])assert.equal((await request(path)).status,404);
});
test('native registration binds music callback to the music app and its platform',()=>{
 const clientId='11111111-1111-4111-8111-111111111111';
 assert.equal(validateNativeConfiguration({appId:'app_mega_music',clientId,callbackUrl:'sk.developed.megamusic://oauth/callback',platform:'ios'}).platform,'ios');
 assert.throws(()=>validateNativeConfiguration({appId:'app_kestrek',clientId,callbackUrl:'sk.developed.megamusic://oauth/callback'}));
});
