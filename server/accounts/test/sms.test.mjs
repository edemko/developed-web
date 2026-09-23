import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SmsVerification, normalizeSlovakMobile, sendSms } from '../dist/sms.js';

test('Slovak mobile numbers normalize before provider or persistence use', () => {
  assert.equal(normalizeSlovakMobile('0911 327 715'), '+421911327715');
  assert.equal(normalizeSlovakMobile('+421 911 327 715'), '+421911327715');
  assert.equal(normalizeSlovakMobile('00421 911 327 715'), '+421911327715');
  for (const value of ['+420911327715', '0212345678', '', null]) {
    assert.throws(() => normalizeSlovakMobile(value), error => error.code === 'invalid_phone' || error.code === 'invalid_input');
  }
});

test('SMS Gate transport uses a bounded POST and accepts only a concrete message result', async () => {
  const calls = [], accounts = { config: { smsGateKey: 'private-token' } };
  const accepted = await sendSms(accounts, '+421900000001', 'private code', async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ result: { status: 'success', code: 'OK' }, messages: [{ status: 'success', code: 'OK', message_id: 100427 }] }), { status: 200 });
  });
  assert.deepEqual(accepted, { ok: true, status: 'accepted', messageId: '100427' });
  assert.equal(calls[0].url, 'https://api.smsgate.sk/json/send_message');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(String(calls[0].url).includes('private-token'), false);
  assert.deepEqual(await sendSms(accounts, '+421900000001', 'private code', async () =>
    new Response(JSON.stringify({ result: { status: 'success', code: 'OK' } }), { status: 200 })),
  { ok: false, status: 'malformed' });
});

test('OTP challenge is session, app and invitation bound and becomes single-use', async () => {
  const rows = new Map(), key = randomBytes(32), sent = [];
  const query = async (sql, args = []) => {
    if (sql.startsWith('select pg_advisory')) return [];
    if (sql.includes('count(*)::integer as hourly')) return [{ hourly: 0, latest: null }];
    if (sql.startsWith('insert into accounts.sms_challenges')) {
      rows.set(args[0], { id: args[0], session_id: args[1], app_id: args[2], phone_lookup: args[3], phone_ciphertext: args[4], binding_hash: args[5], code_hash: args[6], attempts: 0,
        status: 'pending', expires_at: new Date(Date.now() + 300000), verified_at: null }); return [];
    }
    if (sql.startsWith('update accounts.sms_challenges set status=$2')) {
      Object.assign(rows.get(args[0]), { status: args[1], provider_message_id: args[2], provider_status: args[3] }); return [];
    }
    if (sql.startsWith('select * from accounts.sms_challenges')) {
      const row = rows.get(args[0]);
      if (!row || row.session_id !== args[1] || row.app_id !== args[2]) return [];
      if (sql.includes("status='verified'") && (row.status !== 'verified' || row.binding_hash !== args[3])) return [];
      return [row];
    }
    if (sql.startsWith('select user_id from accounts.verified_phones')) return [];
    if (sql.includes("set attempts=$2,status=case")) { Object.assign(rows.get(args[0]), { attempts: args[1] }); return []; }
    if (sql.includes("set attempts=$2,status='verified'")) {
      Object.assign(rows.get(args[0]), { attempts: args[1], status: 'verified', verified_at: new Date() }); return [];
    }
    if (sql.includes("set status='consumed'")) {
      const row = rows.get(args[0]);
      if (!row || row.status !== 'verified') return [];
      Object.assign(row, { status: 'consumed', consumed_at: new Date() }); return [row];
    }
    if (sql.startsWith('insert into accounts.verified_phones')) { sent.push({ verified: args }); return []; }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const accounts = {
    config: { encryptionKey: key, smsGateKey: 'fixture-token' },
    invitationPreview: async token => token === 'a'.repeat(43) ? { email: 'invited@example.test' } : assert.fail('unexpected invitation'),
    db: { limit: async () => {}, query, tx: async run => run(query) },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = new URLSearchParams(init.body); sent.push({ phone: body.get('to'), code: body.get('text').match(/\d{6}/)[0] });
    return new Response(JSON.stringify({ result: { status: 'success', code: 'OK' }, messages: [{ status: 'success', code: 'OK', message_id: 'fixture-1' }] }), { status: 200 });
  };
  try {
    const service = new SmsVerification(accounts), invitation = 'a'.repeat(43);
    const started = await service.start('session-a', 'app_airsoft', { phone: '0911 327 715', invitation });
    assert.equal(sent[0].phone, '+421911327715');
    await assert.rejects(service.verify('session-b', 'app_airsoft', { challengeId: started.challengeId, code: sent[0].code }), error => error.code === 'invalid_sms_code');
    assert.deepEqual(await service.verify('session-a', 'app_airsoft', { challengeId: started.challengeId, code: sent[0].code }), { verified: true, challengeId: started.challengeId });
    const challenge = await service.consume(query, 'session-a', 'app_airsoft', { phoneChallenge: started.challengeId, invitation });
    await service.attach(query, '11111111-1111-4111-8111-111111111111', challenge);
    assert.equal(sent.filter(item => item.verified).length, 1);
    await assert.rejects(service.consume(query, 'session-a', 'app_airsoft', { phoneChallenge: started.challengeId, invitation }), error => error.code === 'phone_verification_required');
  } finally { globalThis.fetch = originalFetch; }
});
