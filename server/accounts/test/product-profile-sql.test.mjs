// Creates its own network-disabled disposable DB; never accepts a database URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { ProductProfile } from '../dist/product-profile.js';

test('central phone transactions preserve pending contacts, attempts, ownership, expiry, replay and three slots', {
  skip: process.env.ACCOUNTS_PROFILE_SQL_ISOLATED !== '1', timeout: 60000,
}, async () => {
  const name = `central-profile-test-${process.pid}-${randomBytes(4).toString('hex')}`;
  const socket = mkdtempSync(join(tmpdir(),'central-profile-socket-')); chmodSync(socket,0o777);
  const docker = args => execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000});
  const sql = input => execFileSync('docker',['exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000});
  let pool;
  docker(['run','-d','--pull=never','--name',name,'--label','developed.profile.test=true','--network','none','--memory','256m','--cpus','0.5','-v',`${socket}:/var/run/postgresql`,'--tmpfs','/var/lib/postgresql/data:rw,size=128m','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine']);
  try {
    for(let i=0;i<100;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{await delay(100);}}
    sql(`create role developed_accounts login;
      create schema core; create schema accounts;
      create table core.profiles(id uuid primary key);
      create table core.apps(id text primary key);
      create table accounts.security_state(user_id uuid primary key,security_version bigint default 1,locked boolean default false,operation_id uuid);
      grant usage on schema core,accounts to developed_accounts;
      grant select,update on accounts.security_state to developed_accounts;
      grant select on core.profiles to developed_accounts;
      insert into core.apps values('app_airsoft');
      insert into core.profiles values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
      insert into accounts.security_state(user_id) select id from core.profiles;`);
    // Apply the real prerequisite and additive migrations, including real RLS/grants.
    const migrations = new URL('../../../supabase/migrations/',import.meta.url);
    const { readdirSync } = await import('node:fs');
    const sms = readdirSync(migrations).find(file => file.endsWith('_developed_airsoft_sms_verification.sql'));
    assert.ok(sms,'registration SMS prerequisite exists');
    sql(readFileSync(new URL(sms,migrations),'utf8'));
    sql(readFileSync(new URL('20260924194706_account_profile_contacts.sql',migrations),'utf8'));
    sql(readFileSync(new URL('20261005160242_account_profile_sms_delivery.sql',migrations),'utf8'));
    pool = new pg.Pool({host:socket,user:'developed_accounts',database:'postgres',max:4});
    const query = async (s,a=[]) => (await pool.query(s,a)).rows;
    const db = { query, limit: async()=>{}, audit: async()=>{}, tx: async run => {
      const client = await pool.connect();
      try {await client.query('begin');const result=await run(async(s,a=[]) => (await client.query(s,a)).rows);await client.query('commit');return result;}
      catch(e){await client.query('rollback');throw e;}finally{client.release();}
    }};
    const user='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
    const accounts={db,config:{encryptionKey:randomBytes(32)},
      internalCheck:async(_key,token)=>({app:{id:'app_airsoft'},client:{kind:'web'},user:{id:token},securityVersion:1}),
      userById:async id=>({id,security_version:1}),publicUser:u=>({id:u.id})};
    const sent=[];
    let sendResult = {ok:true,status:'accepted',messageId:'123'};
    let checked = 0, delivery = {status:'sent'};
    const service=new ProductProfile(accounts,async(_a,phone,message)=>{sent.push({phone,code:message.match(/\d{6}/)[0]});return sendResult;},
      async () => { checked++; return delivery; });
    const call=(action,body={},who=user)=>service.handle('test',action,{...body,accessToken:who});
    const resetCooldown=()=>sql("update accounts.profile_phone_challenges set created_at=now()-interval '2 hours'");
    async function start(phone,replaceId){resetCooldown();return call('phone-start',{phone,...(replaceId?{replaceId}:{})});}
    const first=await start('+421911111111');
    assert.equal(first.status,'accepted');
    assert.ok(first.resendAfter>0 && first.resendAfter<=60);
    assert.equal((await query('select provider_message_id from accounts.profile_phone_challenges where id=$1',[first.challengeId]))[0].provider_message_id,'123');
    const restored=await call('details');
    assert.equal(restored.phones.length,0,'pending number is not a contact');
    assert.equal(restored.pendingPhone.challengeId,first.challengeId);
    assert.equal(restored.pendingPhone.phone,'+421911111111');
    await assert.rejects(call('phone-status',{challengeId:first.challengeId},other),e=>e.code==='not_found');
    assert.equal(checked,0,'other users cannot query the provider');
    assert.equal((await call('phone-status',{challengeId:first.challengeId})).status,'sent');
    assert.equal((await call('phone-status',{challengeId:first.challengeId})).status,'sent');
    assert.equal(checked,1,'repeated polls use cached delivery status');
    assert.equal((await call('details')).phones.length,0,'delivery does not verify a phone');
    delivery={status:'failed',errorCode:'ERROR'};
    sql("update accounts.profile_phone_challenges set delivery_checked_at=now()-interval '20 seconds'");
    assert.equal((await call('phone-status',{challengeId:first.challengeId})).status,'failed');
    assert.equal((await query('select delivery_error_code from accounts.profile_phone_challenges where id=$1',[first.challengeId]))[0].delivery_error_code,'ERROR');
    await assert.rejects(call('phone-verify',{challengeId:first.challengeId,code:sent.at(-1).code},other),e=>e.code==='invalid_sms_code');
    for(let i=0;i<5;i++) await assert.rejects(call('phone-verify',{challengeId:first.challengeId,code:'000000'}),e=>e.code==='invalid_sms_code');
    assert.equal((await query('select attempts from accounts.profile_phone_challenges where id=$1',[first.challengeId]))[0].attempts,5);
    await assert.rejects(call('phone-verify',{challengeId:first.challengeId,code:sent.at(-1).code}),e=>e.code==='invalid_sms_code');
    sendResult={ok:false,status:'rejected',errorCode:'NO_CREDIT'};
    const failed=await start('+421911111111');
    assert.equal(failed.status,'failed');
    assert.ok(failed.resendAfter>0,'failed sends still expose cooldown');
    await assert.rejects(call('phone-start',{phone:'+421911111111'}),e=>e.code==='sms_resend_too_soon');
    await assert.rejects(call('phone-verify',{challengeId:failed.challengeId,code:sent.at(-1).code}),e=>e.code==='invalid_sms_code');
    sendResult={ok:false,status:'ambiguous',errorCode:'TIMEOUT'};
    const uncertain=await start('+421911111111');
    assert.equal(uncertain.status,'unknown');
    assert.equal((await call('phone-status',{challengeId:uncertain.challengeId})).status,'unknown');
    sendResult={ok:true,status:'accepted',messageId:'124'};
    const verified=await start('+421911111111'); const code=sent.at(-1).code;
    await call('phone-verify',{challengeId:verified.challengeId,code});
    await assert.rejects(call('phone-verify',{challengeId:verified.challengeId,code}),e=>e.code==='invalid_sms_code');
    assert.equal((await call('details')).pendingPhone,null);
    const old=(await call('details')).phones[0];
    const replacement=await start('+420777111111',old.id);
    assert.equal((await call('details')).phones[0].phone,old.phone);
    await call('phone-verify',{challengeId:replacement.challengeId,code:sent.at(-1).code});
    assert.deepEqual((await call('details')).phones.map(p=>p.phone),['+420777111111']);
    for(const phone of ['+380501111111','+421922222222']) {const c=await start(phone);await call('phone-verify',{challengeId:c.challengeId,code:sent.at(-1).code});}
    await assert.rejects(start('+421933333333'),e=>e.code==='phone_limit');
    const contacts=(await call('details')).phones;
    const expired=await start('+421933333333',contacts[0].id);
    sql(`update accounts.profile_phone_challenges set expires_at=now()-interval '1 second'`);
    await assert.rejects(call('phone-verify',{challengeId:expired.challengeId,code:sent.at(-1).code}),e=>e.code==='invalid_sms_code');
    assert.equal((await call('phone-status',{challengeId:expired.challengeId})).status,'expired');
    assert.equal((await call('details')).phones.length,3);
    await assert.rejects(call('phone-start',{phone:'+421944444444',replaceId:contacts[0].id},other),e=>e.code==='phone_not_found');
    // A late uniqueness conflict rolls back deletion of the old contact.
    const race=await start('+421933333333',contacts[0].id);
    const raceCode=sent.at(-1).code;
    sql(`insert into accounts.verified_phones(user_id,phone_lookup,phone_ciphertext,verified_at)
      select '${other}',phone_lookup,'fixture',now() from accounts.profile_phone_challenges where id='${race.challengeId}'`);
    await assert.rejects(call('phone-verify',{challengeId:race.challengeId,code:raceCode}),e=>e.code==='phone_already_registered');
    assert.deepEqual((await call('details')).phones.map(p=>p.id),contacts.map(p=>p.id));
    // Multiple verification requests on the same code serialize on the user lock.
    const concurrent=await start('+421955555555',contacts[0].id);
    const attempts=await Promise.allSettled([1,2].map(()=>call('phone-verify',{challengeId:concurrent.challengeId,code:sent.at(-1).code})));
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await call('details')).phones.length,3);
  } finally {
    await pool?.end();
    const label=docker(['inspect','-f','{{index .Config.Labels "developed.profile.test"}}',name]).trim();
    assert.equal(label,'true');
    docker(['exec',name,'chmod','0777','/var/run/postgresql']);
    docker(['exec',name,'chown',`${process.getuid()}:${process.getgid()}`,'/var/run/postgresql']);
    docker(['rm','-f','-v',name]);rmSync(socket,{recursive:true,force:true});
  }
});
