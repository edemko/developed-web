import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountServer } from '../dist/http.js';
import { HttpError } from '../dist/security.js';

test('product registration CORS exposes only the bounded anonymous flow', async t => {
  const productOrigin = 'http://localhost:4173';
  const calls = [];
  const accounts = {
    config: { origin: 'http://127.0.0.1', insecureLocal: true },
    db: {
      limit: async () => {},
      query: async sql => sql.includes('registration_mode') ? [{ registration_mode: 'invitation' }] : [],
    },
    registrationSurface: async (slug, origin) => {
      if (slug !== 'airsoft' || origin !== productOrigin) throw new HttpError(403, 'invalid_origin');
      return { app_id: 'app_airsoft' };
    },
    bootstrap: async raw => ({ session: { id: 'anonymous-session' }, ...(!raw ? { cookie: 'developed_local=fixture; Path=/; HttpOnly; SameSite=Lax' } : {}) }),
    csrf: session => `csrf-${session.id}`,
    invitationPreview: async token => token === 'invite' ? { email: 'invited@example.test' } : (() => { throw new HttpError(400, 'invalid_invitation'); })(),
    register: async (body, appId) => { calls.push({ body, appId }); return { accepted: true, emailVerified: Boolean(body.invitation) }; },
    sendCredential: async email => calls.push({ resend: email }),
    sms: {
      start: async (sessionId, appId, body) => { calls.push({ smsStart: { sessionId, appId, body } }); return { challengeId: '11111111-1111-4111-8111-111111111111' }; },
      verify: async (sessionId, appId, body) => { calls.push({ smsVerify: { sessionId, appId, body } }); return { verified: true }; },
    },
  };
  const server = createAccountServer(accounts);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  accounts.config.origin = origin;
  const endpoint = `${origin}/api/account/registration`;

  const denied = await fetch(`${endpoint}/session?app=airsoft`, { headers: { Origin: 'http://evil.test' } });
  assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const preflight = await fetch(`${endpoint}/register?app=airsoft`, { method: 'OPTIONS', headers: {
    Origin: productOrigin, 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type,x-csrf-token',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), productOrigin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');

  const session = await fetch(`${endpoint}/session?app=airsoft`, { headers: { Origin: productOrigin } });
  const state = await session.json();
  assert.deepEqual(state, { csrfToken: 'csrf-anonymous-session', registrationMode: 'invitation' });
  assert.match(session.headers.get('set-cookie'), /^developed_local=fixture/);

  const submit = await fetch(`${endpoint}/register?app=airsoft`, { method: 'POST', headers: {
    Origin: productOrigin, Cookie: 'developed_local=fixture', 'Content-Type': 'application/json',
    'X-CSRF-Token': state.csrfToken, 'Sec-Fetch-Site': 'same-site',
  }, body: JSON.stringify({ email: 'invited@example.test', password: 'long-enough-password', displayName: 'Fixture', invitation: 'invite' }) });
  assert.equal(submit.status, 200); assert.deepEqual(await submit.json(), { accepted: true, emailVerified: true });
  assert.deepEqual(calls[0].appId, 'app_airsoft');

  const smsStart = await fetch(`${endpoint}/sms/start?app=airsoft`, { method: 'POST', headers: {
    Origin: productOrigin, Cookie: 'developed_local=fixture', 'Content-Type': 'application/json',
    'X-CSRF-Token': state.csrfToken, 'Sec-Fetch-Site': 'same-site',
  }, body: JSON.stringify({ phone: '+421900000001', invitation: 'invite' }) });
  assert.equal(smsStart.status, 200);
  const smsVerify = await fetch(`${endpoint}/sms/verify?app=airsoft`, { method: 'POST', headers: {
    Origin: productOrigin, Cookie: 'developed_local=fixture', 'Content-Type': 'application/json',
    'X-CSRF-Token': state.csrfToken, 'Sec-Fetch-Site': 'same-site',
  }, body: JSON.stringify({ challengeId: '11111111-1111-4111-8111-111111111111', code: '123456' }) });
  assert.equal(smsVerify.status, 200);
  assert.deepEqual(calls[1].smsStart, { sessionId: 'anonymous-session', appId: 'app_airsoft', body: { phone: '+421900000001', invitation: 'invite' } });
  assert.deepEqual(calls[2].smsVerify, { sessionId: 'anonymous-session', appId: 'app_airsoft', body: { challengeId: '11111111-1111-4111-8111-111111111111', code: '123456' } });

  const blocked = await fetch(`${endpoint}/register?app=airsoft`, { method: 'POST', headers: {
    Origin: productOrigin, Cookie: 'developed_local=fixture', 'Content-Type': 'application/json',
    'X-CSRF-Token': state.csrfToken, 'Sec-Fetch-Site': 'cross-site',
  }, body: '{}' });
  assert.equal(blocked.status, 403);
});
