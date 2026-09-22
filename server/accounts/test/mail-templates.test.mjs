import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialMail, credentialLifetime, securityMail, reportMail, registrationMail, legacyMailHtml } from '../dist/mail-templates.js';

const recipient = 'recipient@example.invalid';
const origin = 'https://www.developed.sk';
const token = 'a'.repeat(43);
const routes = { verification: '/verify-email#token=', recovery: '/reset-password#token=', email_change: '/verify-email#token=', invitation: '/register#invitation=' };

for (const language of ['en', 'sk', 'cs', 'uk']) test(`all transactional kinds provide localized HTML and text (${language})`, () => {
  for (const [purpose, route] of Object.entries(routes)) {
    const link = origin + route + token;
    const mail = credentialMail(recipient, purpose, link, language);
    assert.ok(mail.text.includes(link)); assert.ok(mail.html.includes(`href="${link}"`));
    assert.equal(mail.text.split(link).length, 2);
    assert.ok(mail.text.includes(String(credentialLifetime(purpose) === 604800 ? 7 : credentialLifetime(purpose) === 86400 ? 24 : 30)));
    assert.match(mail.html, new RegExp(`<html lang="${language}">`));
    assert.ok(mail.text.includes(mail.subject));
    assert.ok(mail.html.includes('info@developed.sk'));
    assert.doesNotMatch(mail.html, /<script|<img|<iframe|<link|<form|onerror=|url\(/i);
  }
  for (const mail of [securityMail(recipient, language), securityMail(recipient, language, {}, 'verification'), reportMail(recipient, 'DEV-42', 'Mega Music', language, false), reportMail(recipient, 'DEV-42', 'Mega Music', language, true), registrationMail(recipient, 'new@example.test', 'New User', 'Mega Music', language)]) {
    assert.ok(mail.html.includes(mail.subject)); assert.ok(mail.text.includes('info@developed.sk'));
    assert.ok(mail.html.includes(`lang="${language}"`));
  }
});

test('credential URLs are purpose-bound, same-origin and cannot become injected or tracked links', () => {
  for (const link of [
    `https://evil.test/verify-email#token=${token}`, `http://www.developed.sk/verify-email#token=${token}`,
    `${origin}/reset-password#token=${token}`, `${origin}/verify-email?redirect=https://evil.test#token=${token}`,
    `${origin}/verify-email#token=${token}&other=value`, `${origin}/verify-email#token=<img>`,
    `https://user:pass@www.developed.sk/verify-email#token=${token}`, `${origin}/verify-email#invitation=${token}`,
    `${origin}/a/../verify-email#token=${token}`,
  ]) assert.throws(() => credentialMail(recipient, 'verification', link, 'en'), /Unsafe/);
  assert.throws(() => credentialMail(recipient, '__proto__', origin, 'en'), /Unknown/);
  assert.throws(() => credentialMail(recipient, 'verification', 'javascript:alert(1)', 'en'));
  assert.throws(() => securityMail(recipient, 'en', { supportEmail: 'info@developed.sk\r\nBcc:other@example.test' }), /Unsafe/);
  const local = 'http://127.0.0.1:3140';
  assert.throws(() => credentialMail(recipient, 'verification', `${local}/verify-email#token=${token}`, 'en', { origin: local }), /Unsafe/);
  assert.ok(credentialMail(recipient, 'verification', `${local}/verify-email#token=${token}`, 'en', { origin: local, insecureLocal: true }).html);
});

test('report mail contains no report contents and renders app text inertly', () => {
  const app = '<img src=x onerror="attack()"> & \'quoted\'\r\nBcc: other@example.test';
  const mail = reportMail(recipient, 'DEV-42', app, 'en', true);
  assert.doesNotMatch(mail.subject, /Bcc|\r|\n/);
  assert.ok(mail.html.includes('&lt;img')); assert.ok(mail.html.includes('&amp;'));
  assert.doesNotMatch(mail.html, /<img/);
  assert.ok(mail.text.includes(app));
  assert.ok(mail.text.includes(`${origin}/admin/reports`));
  assert.throws(() => reportMail(recipient, 'DEV-42\nInjected', 'App', 'en', true));
  const ack = reportMail(recipient, 'DEV-42', 'App', 'en', false);
  assert.ok(!ack.text.includes('/admin'));
  assert.ok(!ack.html.includes('/admin'));
});

test('registration alert identifies the user and trusted app with an admin link', () => {
  const mail = registrationMail(recipient, 'new+user@example.test', '<New User>', '<App & name>', 'en');
  assert.ok(mail.text.includes('new+user@example.test'));
  assert.ok(mail.text.includes('<New User>'));
  assert.ok(mail.text.includes('<App & name>'));
  assert.ok(mail.text.includes(`${origin}/admin/users`));
  assert.ok(mail.html.includes('&lt;New User&gt;'));
  assert.ok(mail.html.includes('&lt;App &amp; name&gt;'));
  assert.doesNotMatch(mail.html, /<New User>|<App/);
});

test('language fallback, configured support, verification notice and legacy outbox stay safe', () => {
  assert.equal(securityMail(recipient, '__proto__').subject, securityMail(recipient, 'en').subject);
  const confirmed = securityMail(recipient, 'en', {}, 'verification');
  assert.ok(confirmed.text.includes(`${origin}/login`)); assert.doesNotMatch(confirmed.text, /settings changed/);
  const configured = securityMail(recipient, 'sk', { supportEmail: 'support@example.test' });
  assert.ok(configured.text.includes('support@example.test')); assert.ok(configured.html.includes('mailto:support@example.test'));
  const legacy = legacyMailHtml({ to: recipient, subject: 'A <title>', text: '<script>attack()</script>\nhttps://evil.test' });
  assert.ok(legacy.includes('&lt;script&gt;')); assert.doesNotMatch(legacy, /<script|href="https:\/\/evil/);
});

test('HTML emails render at mobile and desktop widths without remote assets', { skip: !process.env.PLAYWRIGHT_MODULE }, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const requests = [];
    await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
    for (const width of [320, 600, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const language of ['en', 'sk', 'cs', 'uk']) {
        const link = origin + routes.verification + token;
        const mail = credentialMail(recipient, 'verification', link, language);
        await page.setContent(mail.html);
        assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), mail.subject);
        assert.equal(await page.locator(`a[href="${link}"]`).count(), 2);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${language} at ${width}px`);
      }
    }
    assert.deepEqual(requests, []);
  } finally { await browser.close(); }
});
