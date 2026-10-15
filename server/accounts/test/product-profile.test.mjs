import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ProductProfile, contactPhone, profileVerificationSms, sendProfileSms } from '../dist/product-profile.js';

test('profile phone accepts complete SK/CZ mobiles without silently stripping letters', () => {
  assert.equal(contactPhone('0911 123 456'), '+421911123456');
  assert.equal(contactPhone('00420 777 123 456'), '+420777123456');
  assert.equal(contactPhone('+420 601 123 456'), '+420601123456');
  for (const input of ['call +421911123456','++421911123456','+01234567890','123',
    '+42191112345', '+421811123456', '+420911123456', '+42077712345', '+380501234567'])
    assert.throws(() => contactPhone(input));
});

test('bad phone or language does not consume an SMS quota or create a challenge', async () => {
  const user = { id: '11111111-1111-4111-8111-111111111111', security_version: 4, language: 'sk' };
  let usedQuota = false;
  const a = {
    config: { encryptionKey: randomBytes(32) },
    internalCheck: async () => ({ app: { id: 'app_airsoft' }, client: { kind: 'web' }, user, securityVersion: 4 }),
    userById: async () => user,
    db: { limit: async () => { usedQuota = true; }, tx: async () => assert.fail('challenge created') },
  };
  const service = new ProductProfile(a);
  for (const body of [
    { phone: '+42191112345', language: 'sk' },
    { phone: '+420911123456', language: 'cs' },
    { phone: '+421911123456', language: 'xx' },
  ]) await assert.rejects(service.handle('key','phone-start',body));
  assert.equal(usedQuota, false);
});

test('verification SMS follows page language and identifies Airsoft Marketplace', () => {
  const code = '123456';
  const sk = profileVerificationSms(code, 'sk');
  const cs = profileVerificationSms(code, 'cs');
  const uk = profileVerificationSms(code, 'uk');
  assert.match(sk, /^Airsoft Marketplace overovaci kod: 123456\./);
  assert.match(cs, /^Airsoft Marketplace overovaci kod: 123456\./);
  assert.match(uk, /^Airsoft Marketplace код підтвердження: 123456\./);
  for (const message of [sk, cs, uk]) assert.ok(!message.includes('DevelopED:'));
  assert.match(cs, /nesdelujte/);
  assert.match(uk, /Не діліться/);
  assert.ok(uk.length <= 70);
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

test('profile SMS uses SMS Gate v1 (json/send_message) without retrying an ambiguous send', async () => {
  const a = { config: { smsGateKey: 'fixture-key' } };
  let calls = 0;
  const ok = await sendProfileSms(a,'+421911111111','Fixture code',async(url,init)=>{
    calls++; assert.equal(url,'https://api.smsgate.sk/json/send_message');
    assert.equal(init.method,'POST'); assert.equal(init.redirect,'error');
    assert.ok(!String(url).includes('/v2/'));
    const form = new URLSearchParams(init.body);
    assert.equal(form.get('token'),'fixture-key'); assert.equal(form.get('to'),'+421911111111');
    assert.equal(form.get('text'),'Fixture code'); assert.equal(form.has('sender'),false); assert.equal(form.get('from'),'AMP');
    assert.equal(init.headers['X-API-KEY'],undefined);
    return Response.json({result:{status:'success',code:'OK'},messages:[{status:'success',code:'OK',message_id:110156285}]});
  });
  assert.deepEqual(ok,{ok:true,status:'accepted',messageId:'110156285'}); assert.equal(calls,1);
  calls=0;
  assert.equal((await sendProfileSms(a,'+421911111111','Fixture',async()=>{calls++;throw new Error('timeout');})).status,'ambiguous');
  assert.equal(calls,1);
  assert.equal((await sendProfileSms({config:{}},'+421911111111','Fixture',async()=>assert.fail())).status,'not_configured');
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
  const a={config:{smsGateKey:'fixture-secret'}};
  for (const [payload,http,status,code] of [
    [{result:{status:'error',code:'NO_CREDIT',description:'fixture-secret'}},200,'rejected','NO_CREDIT'],
    [{result:{status:'success',code:'OK'},messages:[{status:'error',code:'BAD_NUMBER'}]},200,'rejected','BAD_NUMBER'],
    [{result:{status:'error',code:'fixture-secret'}},200,'rejected','PROVIDER_REJECTED'],
    [{result:{status:'success',code:'OK'},messages:[]},200,'ambiguous','INVALID_RESPONSE'],
    [{result:{code:'AUTH_FAILED'}},401,'rejected','AUTH_FAILED'],
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
  for(const [code,status] of [['SENT','sent'],['QUEUED','accepted'],['DELIVERED','delivered'],['EXPIRED','failed'],['ERROR','accepted'],['PROCESSING','accepted'],['UNDELIVERABLE','failed'],['NEW_STATUS','unknown']]) {
    const result=await checkProfileSms(a,'123',async(url,init)=>{
      assert.equal(url.search,'');assert.equal(init.method,'POST');
      const form=new URLSearchParams(init.body);
      assert.equal(form.get('token'),'fixture-secret');assert.equal(form.get('message_id'),'123');assert.equal(init.redirect,'error');
      return Response.json({result:{code:'OK'},code,deliveryDateTime:'2026-10-05 15:56:00'});
    });
    assert.equal(result.status,status);
  }
  const result=await checkProfileSms(a,'123',async()=>{throw new Error('fixture-secret');});
  assert.equal(result.status,'unknown');assert.ok(!JSON.stringify(result).includes('fixture-secret'));
  assert.equal((await checkProfileSms(a,'invalid',async()=>assert.fail())).status,'unknown');
});
