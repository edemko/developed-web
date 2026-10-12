import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountServer } from '../dist/http.js';
import { HttpError } from '../dist/security.js';

test('retirement traffic records only a fixed route family and method, never credentials', async t => {
  const events = [], original = console.info;
  console.info = value => events.push(JSON.parse(value));
  t.after(() => { console.info = original; });
  const accounts = {
    config: { origin: 'http://127.0.0.1', insecureLocal: true },
    db: { limit: async () => {} },
    registrationSurface: async () => { throw new HttpError(403, 'invalid_origin'); },
  };
  const server = createAccountServer(accounts);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  accounts.config.origin = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${accounts.config.origin}/api/account/registration/session?token=private-query`, {
    headers: { Origin: 'http://fixture.invalid', Cookie: 'private-cookie', Authorization: 'private-key' },
  });
  await fetch(`${accounts.config.origin}/api/account/internal/profile/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"private-body"}',
  });
  await fetch(`${accounts.config.origin}/health`);
  assert.deepEqual(events, [
    { event: 'legacy_password_api_request', route: 'registration', method: 'GET' },
    { event: 'legacy_password_api_request', route: 'product-password', method: 'POST' },
  ]);
});
