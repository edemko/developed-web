import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { diagnostics, equal, password, passwordInput, email, seal, unseal, exactHttps, text } from '../dist/security.js';
import { config } from '../dist/config.js';
import { Provider } from '../dist/provider.js';
import { validateAppConfiguration } from '../dist/operator.js';
import { marketingPolicy } from '../dist/http.js';

test('credential comparison handles Unicode without exceptions', () => {
  assert.equal(equal('é', 'x'), false); assert.equal(equal('safe', 'safe'), true); assert.equal(equal(undefined, 'safe'), false);
});
test('passwords retain spaces and Unicode exactly; minimum only on new passwords', () => {
  const secret = '  cafe\u0301 and spaces  ';
  assert.equal(password(secret), secret); assert.equal(passwordInput(secret), secret);
  assert.equal(passwordInput('legacy'), 'legacy'); assert.throws(() => password('short'));
  assert.throws(() => password('x'.repeat(129))); assert.throws(() => passwordInput({}));
});
test('AES-GCM binds ciphertext to specific row and purpose', () => {
  const key = randomBytes(32), box = seal({ secret: 'test' }, key, 'session:one');
  assert.deepEqual(unseal(box, key, 'session:one'), { secret: 'test' });
  assert.throws(() => unseal(box, key, 'mail:one')); assert.throws(() => unseal(box, randomBytes(32), 'session:one'));
  assert.throws(() => unseal(`${box.slice(0, -3)}AAA`, key, 'session:one'));
});
test('report diagnostics strip unknown fields and reject raw URLs', () => {
  assert.deepEqual(diagnostics({ version: '1.2.3', screen: 'player', accessToken: 'private', href: 'https://private' }), { version: '1.2.3', screen: 'player' });
  assert.throws(() => diagnostics({ screen: 'player?token=secret' })); assert.throws(() => diagnostics([]));
});
test('input and redirect allowlists reject unsafe values', () => {
  assert.equal(email(' TEST@example.com '), 'test@example.com'); assert.throws(() => email('not-email'));
  assert.throws(() => text('\0', 100)); assert.throws(() => exactHttps('javascript:alert(1)'));
  assert.throws(() => exactHttps('https://user:pass@example.com')); assert.throws(() => exactHttps('http://example.com', true));
});
test('configuration refuses insecure public hosting and malformed encryption keys', () => {
  const env = { ACCOUNTS_ORIGIN: 'https://www.developed.sk', ACCOUNTS_PROVIDER_URL: 'https://auth.example.test/auth/v1', ACCOUNTS_PROVIDER_ADMIN_KEY: 'stub-only', ACCOUNTS_DATABASE_URL: 'stub-only', ACCOUNTS_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
  assert.equal(config(env).mailEnabled, false);
  assert.throws(() => config({ ...env, ACCOUNTS_INSECURE_LOCAL: 'true' }));
  assert.throws(() => config({ ...env, ACCOUNTS_ENCRYPTION_KEY: 'abc' }));
});
test('provider requests contain no browser redirects and hide upstream error payloads', async () => {
  const requests = [];
  const provider = new Provider('https://auth.invalid', 'secret', async (url, init) => {
    requests.push({ url, init }); return new Response(JSON.stringify({ error: 'private-email@example.com' }), { status: 400 });
  });
  await assert.rejects(provider.login('user@example.test', 'password'), error => error.code === 'provider_rejected' && !error.message.includes('private-email'));
  assert.equal(requests[0].init.redirect, 'error');
});
test('operator configuration validates registered HTTPS callback boundaries and keeps secrets out of output', () => {
  const app = { appId: 'app_mega_music', slug: 'mega-music', clientId: '11111111-1111-4111-8111-111111111111', serverKey: randomBytes(32).toString('base64url'), launchUrl: 'https://music.example.test/auth/login', callbackUrl: 'https://music.example.test/auth/callback' };
  const validated = validateAppConfiguration(app);
  assert.ok(validated.keyHash); assert.equal(validated.serverKey, undefined);
  assert.throws(() => validateAppConfiguration({ ...app, published: true }));
  assert.throws(() => validateAppConfiguration({ ...app, callbackUrl: 'https://evil.invalid/callback' }));
  assert.throws(() => validateAppConfiguration({ ...app, launchUrl: 'https://music.example.test/auth/login?next=https://evil.invalid' }));
});
test('revoked user bearers are unauthenticated while provider and administrator failures remain unavailable', async () => {
  let status = 401, errorCode = 'session_not_found';
  const provider = new Provider('https://auth.invalid', 'admin-fixture', async () =>
    new Response(JSON.stringify({ error_code: errorCode, message: 'private@example.invalid' }), { status }));
  for (const code of ['session_not_found', 'user_not_found', 'bad_jwt']) {
    errorCode = code;
    await assert.rejects(provider.user('user-fixture'), error => error.status === 401 && error.code === 'invalid_session' && !error.message.includes('private@'));
    await assert.rejects(provider.update('user-fixture', {}), error => error.status === 503 && error.code === 'provider_unavailable');
  }
  errorCode = 'invalid_api_key';
  await assert.rejects(provider.user('user-fixture'), error => error.status === 503);
  status = 503; errorCode = 'session_not_found';
  await assert.rejects(provider.user('user-fixture'), error => error.status === 503);
});
test('expired-cookie marketing fallback permits only exact inline script hashes, not arbitrary inline scripts', () => {
  const policy = marketingPolicy('<script>document.documentElement.classList.add("js");</script><script src="/script.js"></script>');
  assert.match(policy, /script-src 'self' 'sha256-[A-Za-z0-9+/]+=*'/);
  assert.equal(policy.includes('unsafe-inline'), false);
  assert.notEqual(policy, marketingPolicy('<script>different()</script>'));
});
