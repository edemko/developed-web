import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac,randomBytes } from 'node:crypto';
import { ProductProfile } from '../dist/product-profile.js';

test('guest phone lookup accepts only the active AMP service credential and reveals no identity',async()=>{
 const key=randomBytes(32),serverKey=randomBytes(32).toString('base64url');
 let app={app_id:'app_airsoft',status:'ACTIVE',deleted_at:null},found=true,lookups=0;
 const service=new ProductProfile({config:{encryptionKey:key},db:{query:async(sql,params)=>{
  if(sql.includes('accounts.app_settings'))return app?[app]:[];
  assert.match(sql,/phone_lookup=\$1/);lookups++;
  assert.equal(params[0],createHmac('sha256',key).update('phone:+421900000099').digest('hex'));
  return found?[{id:'private-identity'}]:[];
 }}});
 assert.deepEqual(await service.phoneLinked(serverKey,'+421900000099'),{linked:true});found=false;
 assert.deepEqual(await service.phoneLinked(serverKey,'+421900000099'),{linked:false});
 await assert.rejects(service.phoneLinked('bad','+421900000099'));assert.equal(lookups,2);
 for(const value of [null,{...app,app_id:'other'},{...app,status:'DISABLED'},{...app,deleted_at:new Date()}]){
  app=value;await assert.rejects(service.phoneLinked(serverKey,'+421900000099'));
 }
 assert.equal(lookups,2);
});
