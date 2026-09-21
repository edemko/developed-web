import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { diagnosticHints, initials, safeAuthorizationUrl, safeContinuation, safeHttpsUrl, safeIconUrl, takeFragmentToken } from '../public/app.js';
import { languages, messages, normaliseLanguage, translate } from '../public/i18n.js';

test('all account messages are translated for every supported language', () => {
  const keys = Object.keys(messages.en).sort();
  for (const language of Object.keys(languages)) {
    assert.deepEqual(Object.keys(messages[language]).sort(), keys, language);
    for (const key of keys) assert.ok(translate(language, key).trim(), `${language}.${key}`);
  }
  assert.equal(normaliseLanguage('ua'), 'uk');
  assert.equal(normaliseLanguage('cz-CZ'), 'cs');
  assert.equal(normaliseLanguage('sk-SK'), 'sk');
  assert.equal(normaliseLanguage('unknown'), 'sk');
});

test('continuations only retain local authorization or report context', () => {
  const origin = 'https://www.developed.sk';
  assert.equal(safeContinuation('/account/authorize?authorization_id=abc-123&redirect_uri=https://evil.test', origin), '/account/authorize?authorization_id=abc-123');
  assert.equal(safeContinuation('/report-bug/mega-music?secret=abc', origin), '/report-bug/mega-music');
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/admin/users', '/profile', '/account/authorize', '/report-bug/x#token=abc']) assert.equal(safeContinuation(value, origin), '/apps', value);
});

test('navigation and icon URLs reject script, cleartext and credential URLs', () => {
  const origin = 'https://www.developed.sk';
  assert.equal(safeHttpsUrl('/assets/app.svg', origin), `${origin}/assets/app.svg`);
  assert.equal(safeHttpsUrl('https://kestrek.sk/auth/login', origin), 'https://kestrek.sk/auth/login');
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'http://kestrek.sk', 'https://user:password@kestrek.sk', null]) assert.equal(safeHttpsUrl(value, origin), null);
});

test('catalog icons use real same-origin image paths, never legacy symbolic names or remote URLs', () => {
  const origin = 'https://www.developed.sk';
  assert.equal(safeIconUrl('/assets/projects/kestrek.svg', origin), origin + '/assets/projects/kestrek.svg');
  assert.equal(safeIconUrl('/assets/projects/kestrek.svg', 'http://127.0.0.1:1234'), 'http://127.0.0.1:1234/assets/projects/kestrek.svg');
  for (const value of ['Wallet', 'MM', null, 'https://other.test/assets/projects/kestrek.svg', '/assets/projects/x.svg?token=secret', '/api/account/session', '//evil.test/x.svg', 'data:image/svg+xml,x']) assert.equal(safeIconUrl(value, origin), null);
});

test('only bounded safe diagnostic hints are collected', () => {
  assert.deepEqual(diagnosticHints('?version=1.2.3&screen=player&platform=Android&token=SECRET&url=https://private.test&errorId=ERR-12', 'cs'), { locale: 'cs', version: '1.2.3', platform: 'Android', screen: 'player', errorId: 'ERR-12' });
  assert.deepEqual(diagnosticHints(`?screen=https://private.test/a?secret=1&version=${'x'.repeat(81)}`, 'en'), { locale: 'en' });
});

test('only authorization results allow the exact native KešTrek callback', () => {
  const origin = 'https://www.developed.sk';
  for (const value of ['sk.kestrek://oauth/callback?code=opaque-code&state=opaque-state', 'sk.kestrek://oauth/callback?error=access_denied&state=opaque-state']) {
    assert.equal(safeAuthorizationUrl(value, origin), value);
    assert.equal(safeHttpsUrl(value, origin), null);
  }
  assert.equal(safeAuthorizationUrl('https://kestrek.sk/auth/callback?code=opaque&state=state', origin), 'https://kestrek.sk/auth/callback?code=opaque&state=state');
  for (const value of [
    'sk.kestrek://other/callback?code=a&state=b', 'sk.kestrek://oauth/other?code=a&state=b',
    'sk.kestrek://oauth:123/callback?code=a&state=b', 'sk.kestrek://user@oauth/callback?code=a&state=b',
    'sk.kestrek://oauth/callback?code=a&state=b#fragment', 'sk.kestrek://oauth/callback?code=a',
    'sk.kestrek://oauth/callback?code=a&state=b&state=c', 'sk.kestrek://oauth/callback?code=a&state=b&error=denied',
    'sk.kestrek://oauth/callback?code=a&state=b&redirect_uri=https://evil.test',
    'sk.kestrek://oauth/callback?code=a&state=%0A', 'sk.kestrek://oauth/callback?code=a&state=',
    'sk.kestrek:/callback?code=a&state=b', 'other-app://oauth/callback?code=a&state=b',
    'javascript:alert(1)', null,
  ]) assert.equal(safeAuthorizationUrl(value, origin), null, value);
});

test('email credentials are read from fragments and immediately removed from history', () => {
  const calls = [];
  const token = takeFragmentToken({ hash: '#token=opaque-secret', pathname: '/verify-email', search: '' }, { replaceState: (...args) => calls.push(args) });
  assert.equal(token, 'opaque-secret');
  assert.deepEqual(calls, [[null, '', '/verify-email']]);
  assert.equal(initials('Ján Novák'), 'JN');
  assert.equal(initials(''), '?');
});

test('account UI does not render untrusted HTML or persist account credentials in browser storage', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const forbidden of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'localStorage', 'sessionStorage', 'document.cookie', 'eval(']) assert.ok(!source.includes(forbidden), forbidden);
  assert.match(source, /credentials: 'same-origin'/);
  assert.match(source, /'X-CSRF-Token'/);
  assert.match(source, /idempotencyKey = crypto.randomUUID\(\)/);
  assert.match(source, /await api\('\/reauthenticate'[\s\S]*?await bootstrap\(\)/);
});

test('portal and both marketing languages share the existing first-party favicon', async () => {
  for (const path of ['../public/index.html', '../../../index.html', '../../../en/index.html']) {
    const html = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(html, /<link\s+rel="icon"[^>]*href="\/favicon\.png"/);
  }
  const icon = await readFile(new URL('../../../favicon.png', import.meta.url));
  assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
