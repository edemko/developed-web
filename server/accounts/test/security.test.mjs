import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { diagnostics, equal, password, passwordInput, email, seal, unseal, exactHttps, text, line, oauthCallback } from '../dist/security.js';
import { config } from '../dist/config.js';
import { Provider } from '../dist/provider.js';
import { Accounts } from '../dist/accounts.js';
import { validateAppConfiguration } from '../dist/operator.js';
import { validateNativeConfiguration } from '../dist/native-operator.js';
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
test('native callbacks allow only the exact registered KešTrek protocol and path', () => {
  assert.equal(oauthCallback('sk.kestrek://oauth/callback?code=fixture&state=fixture', 'native').pathname, '/callback');
  for (const url of ['javascript:alert(1)', 'sk.kestrek://evil/callback', 'sk.kestrek:/oauth/callback',
    'sk.kestrek://oauth/other', 'sk.kestrek://oauth:123/callback', 'sk.kestrek://user@oauth/callback',
    'sk.kestrek://oauth/callback#token=x', 'https://oauth/callback']) {
    assert.throws(() => oauthCallback(url, 'native'));
  }
  assert.throws(() => oauthCallback('sk.kestrek://oauth/callback', 'web'));
});
test('native operator accepts only the intended public-client configuration', () => {
  const input = { appId: 'app_kestrek', clientId: '11111111-1111-4111-8111-111111111111', callbackUrl: 'sk.kestrek://oauth/callback' };
  assert.deepEqual(validateNativeConfiguration(input), {...input,platform:'android'});
  assert.throws(() => validateNativeConfiguration({ ...input, clientSecret: 'must-not-exist' }));
  assert.throws(() => validateNativeConfiguration({ ...input, appId: 'app_mega_music' }));
  assert.throws(() => validateNativeConfiguration({ ...input, callbackUrl: `${input.callbackUrl}?next=evil` }));
  assert.throws(() => validateNativeConfiguration({ ...input, clientId: 'invalid' }));
});
test('configuration refuses insecure public hosting and malformed encryption keys', () => {
  const env = { ACCOUNTS_ORIGIN: 'https://www.developed.sk', ACCOUNTS_PROVIDER_URL: 'https://auth.example.test/auth/v1', ACCOUNTS_PROVIDER_ADMIN_KEY: 'stub-only', ACCOUNTS_DATABASE_URL: 'stub-only', ACCOUNTS_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
  assert.equal(config(env).mailEnabled, false);
  assert.throws(() => config({ ...env, ACCOUNTS_INSECURE_LOCAL: 'true' }));
  assert.throws(() => config({ ...env, ACCOUNTS_ENCRYPTION_KEY: 'abc' }));
});
test('embedded registration is limited to the published app launch origin', async () => {
  const db = { query: async (sql, args) => {
    assert.match(sql, /a\.published/); assert.deepEqual(args, ['airsoft']);
    return [{ app_id: 'app_airsoft', slug: 'airsoft', launch_url: 'https://amp.developed.sk/api/auth/ecosystem/login', name: 'Airsoft Marketplace' }];
  } };
  const accounts = new Accounts(db, {}, { insecureLocal: false });
  assert.equal((await accounts.registrationSurface('airsoft', 'https://amp.developed.sk')).app_id, 'app_airsoft');
  await assert.rejects(accounts.registrationSurface('airsoft', 'https://evil.invalid'), error => error.code === 'invalid_origin');
  await assert.rejects(accounts.registrationSurface('airsoft', 'https://amp.developed.sk/path'), error => error.code === 'invalid_origin');
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
test('email follows the canonical ecosystem policy', () => {
  const accepted = { 'a@example.com': 'a@example.com', 'first.last+tag@example.co.uk': 'first.last+tag@example.co.uk',
    "o'brien@example.sk": "o'brien@example.sk", 'user@xn--80ak6aa92e.com': 'user@xn--80ak6aa92e.com',
    'x@sub-domain.example.org': 'x@sub-domain.example.org', [`${'a'.repeat(64)}@example.com`]: `${'a'.repeat(64)}@example.com`,
    '  Mixed@Example.COM  ': 'mixed@example.com' };
  for (const [input, output] of Object.entries(accepted)) assert.equal(email(input), output, input);
  const total254 = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`;
  assert.equal(total254.length, 254); assert.equal(email(total254), total254);
  const total255 = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.com`;
  assert.equal(total255.length, 255);
  for (const input of ['a..b@example.com', '.a@example.com', 'a.@example.com', 'a@-example.com', 'a@example-.com',
    'a@example..com', 'a@example', 'a@example.c', 'a@example.123', `${'a'.repeat(65)}@example.com`, total255,
    'a@@example.com', 'a@b@example.com', '"a b"@example.com', 'a@[127.0.0.1]', 'a b@example.com', 'a@exämple.com',
    'a\n@example.com', 'a\0@example.com', 'a@\u212Aexample.com', '', '   ', {}, [], 42, null, undefined]) {
    assert.throws(() => email(input), e => e.code === 'invalid_email', JSON.stringify(input));
  }
});
test('single-line names keep real-world punctuation but reject control characters', () => {
  assert.equal(line('  Ľudmila O\'Brien-Šťastná  ', 100, true), 'Ľudmila O\'Brien-Šťastná');
  assert.equal(line('J. R. R. O’Neill', 100, true), 'J. R. R. O’Neill');
  assert.equal(line('Cafe\u0301', 100, true), 'Caf\u00e9'); // NFC before storing and measuring
  assert.equal(line('x'.repeat(99), 100, true).length, 99); assert.equal(line('x'.repeat(100), 100, true).length, 100);
  assert.throws(() => line('x'.repeat(101), 100, true));
  assert.equal(line(undefined, 100), ''); assert.throws(() => line(undefined, 100, true)); assert.throws(() => line('   ', 100, true));
  for (const input of [null, 42, {}, ['name']]) assert.throws(() => line(input, 100, true), e => e.code === 'invalid_input');
  for (const input of ['Ann\nSmith', 'Ann\rSmith', 'Ann\tSmith', 'Ann\0Smith', 'Ann\u007fSmith', 'Ann\u0085Smith', 'Ann\u2028Smith', 'Ann\u2029Smith']) {
    assert.throws(() => line(input, 100, true), JSON.stringify(input));
  }
  // Multi-line text keeps line breaks and tabs but still refuses NUL/DEL/other C0.
  assert.equal(text('first\n\tsecond\r\nthird', 100), 'first\n\tsecond\r\nthird');
  for (const input of ['a\0b', 'a\u007fb', 'a\u001bb']) assert.throws(() => text(input, 100));
});
