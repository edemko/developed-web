import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNativeConfiguration, validateNativeProviderRegistration } from '../dist/native-operator.js';
import { oauthCallback } from '../dist/security.js';
import { logoutNativeSession } from '../dist/native-logout.js';
const clientId = '11111111-1111-4111-8111-111111111111';
const input = { appId:'app_voc_builder',clientId,callbackUrl:'sk.developed.vocabulum://oauth/callback',platform:'android' };
test('Vocabulum native registration binds exact app, public client and callback', () => {
  assert.deepEqual(validateNativeConfiguration(input),input);
  const registered={client_id:clientId,client_type:'public',token_endpoint_auth_method:'none',redirect_uris:[input.callbackUrl]};
  validateNativeProviderRegistration(input,registered);
  assert.throws(()=>validateNativeProviderRegistration(input,{...registered,client_type:'confidential'}));
  for(const callbackUrl of ['sk.kestrek://oauth/callback',input.callbackUrl+'?next=other','sk.developed.vocabulum://evil/callback']) {
    assert.throws(()=>validateNativeConfiguration({...input,callbackUrl}));
  }
  assert.equal(oauthCallback(input.callbackUrl+'?code=test&state=test','native').protocol,'sk.developed.vocabulum:');
});
test('native logout checks app key/token then revokes only that provider session',async()=>{
 const calls=[];
 const accounts={internalCheck:async(key,token)=>{calls.push(['check',key,token]);return {app:{id:'app_voc_builder'},client:{kind:'native'}};},provider:{logout:async(token,scope)=>calls.push(['logout',token,scope])}};
 assert.deepEqual(await logoutNativeSession(accounts,'app-key','opaque'),{loggedOut:true});
 assert.deepEqual(calls,[['check','app-key','opaque'],['logout','opaque','local']]);
});
test('native logout cannot revoke web sessions or other products',async()=>{
 for(const [id,kind] of [['app_kestrek','native'],['app_voc_builder','web']]) {
   let revoked=false;
   const accounts={internalCheck:async()=>({app:{id},client:{kind}}),provider:{logout:async()=>{revoked=true;}}};
   await assert.rejects(logoutNativeSession(accounts,'key','token'));assert.equal(revoked,false);
 }
});
test('native logout does not report success on gate or provider failure',async()=>{
 await assert.rejects(logoutNativeSession({internalCheck:async()=>{throw Error('denied');}},'key','token'));
 await assert.rejects(logoutNativeSession({internalCheck:async()=>({app:{id:'app_voc_builder'},client:{kind:'native'}}),provider:{logout:async()=>{throw Error('offline');}}},'key','token'));
});
