import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ProductProfile, contactPhone, sendProfileSms } from '../dist/product-profile.js';

test('profile phone accepts international numbers without silently stripping letters', () => {
  assert.equal(contactPhone('0911 123 456'), '+421911123456');
  assert.equal(contactPhone('00420 777 123 456'), '+420777123456');
  assert.equal(contactPhone('+380 50 123 4567'), '+380501234567');
  for (const input of ['call +421911123456','++421911123456','+01234567890','123']) assert.throws(() => contactPhone(input));
});

test('product account writes require central subject, web client and app binding', async () => {
  for (const checked of [{ app: { id: 'other' }, client: { kind: 'web' } }, { app: { id: 'app_airsoft' }, client: { kind: 'native' } }]) {
    const service = new ProductProfile({ internalCheck: async () => checked });
    await assert.rejects(service.handle('key','password',{}), e => e.code === 'forbidden');
  }
});

test('email remains pending and password uses the central revoking identity mutation after reauthentication', async () => {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'old@example.test', security_version: 4, language: 'sk' };
  const calls = [];
  const query = async sql => sql.startsWith('select *') ? [user] : [];
  const a = {
    config: { encryptionKey: randomBytes(32) },
    internalCheck: async () => ({ app: { id: 'app_airsoft' }, client: { kind: 'web' }, user, securityVersion: 4 }),
    userById: async () => user,
    db: { limit: async () => {}, tx: async run => run(query) },
    checkPassword: async (u,p,c) => { calls.push(['reauth',u.id,p,c]); return { access_token: 'private' }; },
    provider: { logout: async (...args) => calls.push(['logout',...args]) },
    credential: async (_q,u,email,purpose,_language,appId) => calls.push(['pending',u.id,email,purpose,appId]),
    mutateIdentity: async (...args) => calls.push(['mutate',...args.slice(0,4)]),
  };
  const service = new ProductProfile(a);
  assert.deepEqual(await service.handle('key','email',{email:'new@example.test',currentPassword:'old-secret',code:'123456'}),{accepted:true});
  assert.equal(user.email,'old@example.test');
  assert.equal(calls.some(c => c[0] === 'mutate'),false);
  assert.deepEqual(calls.at(-1),['pending',user.id,'new@example.test','email_change','app_airsoft']);
  calls.length=0;
  assert.deepEqual(await service.handle('key','password',{password:'a new long password',currentPassword:'old-secret',code:'123456'}),{ok:true,loginRequired:true});
  assert.equal(calls[0][0],'reauth');
  assert.equal(calls[1][0],'logout');
  assert.deepEqual(calls[2],['mutate',user.id,user.id,'password_change',{password:'a new long password'}]);
  a.checkPassword=async()=>{throw new Error('invalid credentials');}; calls.length=0;
  await assert.rejects(service.handle('key','email',{email:'new@example.test',currentPassword:'bad'}));
  assert.equal(calls.length,0);
});

test('profile SMS uses explicit sender and v2 without retrying an ambiguous send', async () => {
  const a = { config: { smsGateKey: 'fixture-key', smsGateFrom: 'DevelopED' } };
  let calls = 0;
  const ok = await sendProfileSms(a,'+421911111111','Fixture code',async(url,init)=>{
    calls++; assert.equal(url,'https://api.smsgate.sk/v2/messages');
    assert.equal(init.headers['X-API-KEY'],'fixture-key');
    assert.equal(JSON.parse(init.body).sms.from,'DevelopED');
    assert.equal(JSON.parse(init.body).channels[0].ttl,300);
    return Response.json({messages:[{messageId:123}]});
  });
  assert.equal(ok.ok,true); assert.equal(calls,1);
  calls=0;
  assert.equal((await sendProfileSms(a,'+421911111111','Fixture',async()=>{calls++;throw new Error('timeout');})).status,'ambiguous');
  assert.equal(calls,1);
  assert.equal((await sendProfileSms({config:{smsGateKey:'fixture'}},'+421911111111','Fixture',async()=>assert.fail())).status,'not_configured');
});

test('product profile display name shares the central 100-character single-line limit', async () => {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'old@example.test', security_version: 4, language: 'sk' };
  const writes = [];
  const query = async (sql, args) => { if (sql.startsWith('select *')) return [user]; writes.push(args); return []; };
  const service = new ProductProfile({
    internalCheck: async () => ({ app: { id: 'app_airsoft' }, client: { kind: 'web' }, user, securityVersion: 4 }),
    userById: async () => user, db: { tx: async run => run(query) },
  });
  for (const name of ['x'.repeat(99), 'x'.repeat(100), "Ľudmila O'Brien-Šťastná"]) {
    assert.deepEqual(await service.handle('key', 'profile', { displayName: `  ${name}  ` }), { ok: true });
    assert.deepEqual(writes.pop(), [user.id, name]);
  }
  for (const displayName of ['x'.repeat(101), '   ', null, 42, {}, 'Ann\nSmith', 'Ann\u0000Smith']) {
    await assert.rejects(service.handle('key', 'profile', { displayName }), e => e.code === 'invalid_input', JSON.stringify(displayName));
  }
  assert.equal(writes.length, 0);
});

test('profile SMS distinguishes rejection from uncertainty and keeps safe error codes', async () => {
  const a={config:{smsGateKey:'fixture-secret',smsGateFrom:'DevelopED'}};
  for (const [payload,http,status,code] of [
    [{code:'NO_CREDIT',description:'fixture-secret'},400,'rejected','NO_CREDIT'],
    [{error:{code:10}},200,'rejected','10'],
    [{messages:[]},200,'ambiguous','INVALID_RESPONSE'],
    [{},503,'ambiguous','HTTP_503'],
  ]) {
    let calls=0;
    const result=await sendProfileSms(a,'+421911111111','Code',async()=>{calls++;return Response.json(payload,{status:http});});
    assert.equal(result.status,status);assert.equal(result.errorCode,code);assert.equal(calls,1);
    assert.ok(!JSON.stringify(result).includes('fixture-secret'));
  }
});

test('profile delivery requires DELIVERED, handles ERROR and never returns provider secrets', async () => {
  const {checkProfileSms}=await import('../dist/profile-sms.js');
  const a={config:{smsGateKey:'fixture-secret'}};
  for(const [code,status] of [['SENT','sent'],['QUEUED','accepted'],['DELIVERED','delivered'],['EXPIRED','failed'],['ERROR','failed'],['UNDELIVERABLE','failed'],['NEW_STATUS','unknown']]) {
    const result=await checkProfileSms(a,'123',async(url,init)=>{
      assert.equal(url.searchParams.get('message_id'),'123');assert.equal(init.redirect,'error');
      return Response.json({result:{code:'OK'},code,deliveryDateTime:'2026-10-05 15:56:00'});
    });
    assert.equal(result.status,status);
  }
  const result=await checkProfileSms(a,'123',async()=>{throw new Error('fixture-secret');});
  assert.equal(result.status,'unknown');assert.ok(!JSON.stringify(result).includes('fixture-secret'));
  assert.equal((await checkProfileSms(a,'invalid',async()=>assert.fail())).status,'unknown');
});
