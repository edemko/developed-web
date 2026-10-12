import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountServer } from '../dist/http.js';

test('retired product credential routes have no CORS, cookie or provider side effects', async t => {
  const accounts = {
    config: { origin: 'http://127.0.0.1', insecureLocal: true },
    db: { limit: async () => {} },
    bootstrap: async () => { throw new Error('retired route bootstrapped a session'); },
  };
  const server = createAccountServer(accounts);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  accounts.config.origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['registration/session', 'registration/register', 'registration/invitation/preview',
    'registration/resend-verification', 'registration/sms/start', 'registration/sms/verify', 'internal/profile/password']) {
    for (const method of ['GET', 'POST', 'OPTIONS']) {
      const response = await fetch(`${accounts.config.origin}/api/account/${path}?app=airsoft`, {
        method, headers: { Origin: 'http://localhost:4173', 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({ password: 'fixture' }) } : {}),
      });
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.equal(response.headers.get('set-cookie'), null);
    }
  }
});
