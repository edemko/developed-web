import test from 'node:test';
import assert from 'node:assert/strict';
import { ampWatchMail } from '../dist/amp-watch-mail.js';
import { MailWorker } from '../dist/mail.js';
import { HttpError } from '../dist/security.js';
const alert = { id: '99999999-9999-4999-8999-999999999999', listing_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', listing_title: 'AK <script>alert(1)</script> & kit\r\nBcc: x', kind: 'price', old_value: '12000', new_value: '9900', locale: 'sk', recipient: 'fixture@example.invalid', email_attempts: 1 };
for (const locale of ['sk','cs','uk']) test(`AMP ${locale} mail uses product copy and safely escapes listing text`, () => {
  const mail = ampWatchMail(alert.recipient, { ...alert, locale });
  assert.equal(mail.brand,'amp'); assert.match(mail.subject,/^AMP — /); assert.doesNotMatch(mail.subject,/[\r\n]/);
  assert.match(mail.html, /&lt;script&gt;/); assert.doesNotMatch(mail.html,/<script>/);
  assert.ok(mail.html.includes(`lang="${locale}"`));
  assert.ok(mail.text.includes(`https://amp.developed.sk/${locale}/listings/${alert.listing_id}`));
  assert.match(mail.html,/#293d26/); assert.match(mail.html,/#e87524/);
  assert.match(mail.text,/info@developed.sk/); assert.doesNotMatch(mail.html,/<img|<link|<script/);
  assert.throws(() => ampWatchMail(alert.recipient,{...alert,listing_id:'../evil"'}),/Invalid/);
});
test('all watched fields have localized old and new values', () => {
  for (const locale of ['sk','cs','uk']) for (const [kind,old_value,new_value] of [['status','active','sold'],['condition','new','fair'],['functional_state','','broken']]) {
    const mail=ampWatchMail(alert.recipient,{...alert,locale,kind,old_value,new_value});
    assert.doesNotMatch(mail.text,/undefined|NaN|functional_state/);
    assert.ok(mail.text.includes(' → '));
  }
});
function fixture({recipient=alert.recipient, response, cap=false, enabled=true}={}) {
  const calls=[], requests=[], limits=[];
  const config={mailEnabled:true,ampWatchMailEnabled:enabled,mailjetKey:'fixture-key',mailjetSecret:'fixture-secret',supportEmail:'info@developed.sk',dailyEmailLimit:200};
  const db={ async query(sql,args) { calls.push({sql,args}); return sql.includes('claim_amp_watch') ? [{...alert,recipient}] : []; },
    async limit(...args) {limits.push(args); if(cap) throw new HttpError(429,'rate_limited');} };
  const worker=new MailWorker(db,config,async(url,init)=>{requests.push({url,init}); if(response instanceof Error) throw response; return response ?? Response.json({Messages:[{Status:'success'}]});});
  return {worker,calls,requests,limits};
}
test('AMP uses existing credentials, sender domain, shared cap and lease-bound acknowledgement',async()=>{
  const f=fixture(); assert.equal(await f.worker.tick(),true);
  const {url,init}=f.requests[0]; const mail=JSON.parse(init.body).Messages[0];
  assert.equal(url,'https://api.mailjet.com/v3.1/send');
  assert.equal(init.headers.Authorization,`Basic ${Buffer.from('fixture-key:fixture-secret').toString('base64')}`);
  assert.deepEqual(mail.From,{Email:'noreply@developed.sk',Name:'AMP'});
  assert.equal(mail.ReplyTo.Email,'info@developed.sk'); assert.match(mail.Subject,/^AMP/);
  assert.equal(mail.TrackOpens,'disabled'); assert.equal(mail.TrackClicks,'disabled');
  assert.deepEqual(f.limits,[['aggregate:mail',200,86400]]);
  assert.deepEqual(f.calls.at(-1).args,[alert.id,f.calls[1].args[0],'sent',0]);
});
test('suppressed recipient consumes no email quota and is skipped',async()=>{
  const f=fixture({recipient:null}); await f.worker.tick();
  assert.equal(f.requests.length,0); assert.equal(f.limits.length,0); assert.equal(f.calls.at(-1).args[2],'skipped');
});
for(const response of [new Response('',{status:503}),Response.json({Messages:[{Status:'error'}]}),new Error('timeout')]) test('failed delivery retries without acknowledging success',async()=>{
  const f=fixture({response}); await f.worker.tick(); assert.equal(f.calls.at(-1).args[2],'retry'); assert.equal(f.calls.at(-1).args[3],60);
});
test('daily cap defers AMP until reset and does not send',async()=>{
  const f=fixture({cap:true}); await f.worker.tick(); assert.equal(f.requests.length,0);
  assert.equal(f.calls.at(-1).args[2],'capacity'); assert.ok(f.calls.at(-1).args[3]>0);
});
test('AMP polling stays disabled until the worker enables the migration',async()=>{
  const f=fixture({enabled:false}); assert.equal(await f.worker.tick(),false); assert.equal(f.calls.length,1);
});
