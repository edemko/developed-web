// Real Chromium UI, isolated API fixtures only; no provider/account/mail calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

test('browser MFA enrollment, challenge, recovery copy and password+TOTP step-up remain token-free', { skip: !process.env.PLAYWRIGHT_MODULE }, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const asset = path.startsWith('/account-assets/') ? path.slice('/account-assets/'.length) : 'index.html';
    if (!['index.html', 'app.js', 'i18n.js', 'app.css', 'logo.svg'].includes(asset)) return res.writeHead(404).end();
    res.setHeader('Content-Type', asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : asset.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
    res.end(await readFile(new URL(`../public/${asset}`, import.meta.url)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ locale: 'en-US' }), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    let phase = 'signed-out', csrf = 'csrf-0', badCode = true, requireReauth = true, appReads = 0;
    const factorId = '11111111-1111-4111-8111-111111111111';
    const user = { id: 'fixture-user', email: 'fixture@example.invalid', displayName: 'Fixture User', role: 'SUPERADMIN', hasMfa: true, emailVerified: true, language: 'en' };
    await page.route('**/api/account/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname.replace('/api/account', ''), body = request.postDataJSON();
      requests.push({ path, body, headers: request.headers() });
      let result = {}, status = 200;
      if (path === '/session') result = { csrfToken: csrf, user: phase === 'done' ? user : null, mfa: ['enroll', 'challenge'].includes(phase) ? { mode: phase } : null, registrationMode: 'closed' };
      else if (path === '/login') { phase = 'enroll'; csrf = 'csrf-1'; result = { user: null, mfa: { mode: phase } }; }
      else if (path === '/mfa') result = { mode: phase === 'done' ? null : phase, required: true, enabled: phase !== 'enroll', factors: [{ id: factorId, type: 'totp' }] };
      else if (path === '/mfa/enroll') result = { factorId, secret: 'JBSWY3DPEHPK3PXP', qrCode: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/></svg>').toString('base64')}` };
      else if (path === '/mfa/verify') {
        if (badCode) { badCode = false; status = 400; result = { error: { code: 'invalid_mfa_code' } }; }
        else { phase = 'done'; csrf = 'csrf-2'; result = { user }; }
      }
      else if (path === '/apps') { appReads++; result = { apps: [] }; }
      else if (path === '/profile/password') result = { ok: true };
      else if (path === '/admin/reports') result = { reports: [{ id: 'fixture-report', reference: 'DEV-1', appName: 'Fixture', description: 'Fixture report', status: 'new', notes: [] }] };
      else if (path === '/admin/reports/fixture-report') {
        if (requireReauth) { status = 428; result = { error: { code: 'reauthentication_required' } }; }
        else result = { ok: true };
      }
      else if (path === '/reauthenticate') { requireReauth = false; csrf = 'csrf-after-reauth'; result = { ok: true }; }
      else { status = 404; result = { error: { code: 'not_found' } }; }
      await route.fulfill({ status, json: result });
    });
    await page.goto(base + '/login');
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill('fixture long password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Authenticator verification', exact: true }).waitFor();
    assert.equal(await page.locator('input[type=password]').count(), 0);
    assert.equal(appReads, 0);
    await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
    await page.getByText('JBSWY3DPEHPK3PXP', { exact: true }).waitFor();
    assert.equal(await page.locator('.mfa-qr').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)');
    await page.getByLabel('Six-digit authenticator code').fill('006734');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByRole('alert').waitFor(); assert.equal(appReads, 0);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByRole('heading', { name: 'Your apps', exact: true }).waitFor();
    assert.equal(await page.getByText('JBSWY3DPEHPK3PXP').count(), 0);
    assert.deepEqual(await page.evaluate(() => [Object.keys(localStorage), Object.keys(sessionStorage)]), [[], []]);
    assert.equal(requests.find(item => item.path === '/mfa/verify').body.code, '006734');
    phase = 'challenge';
    const readsBefore = appReads;
    await page.goto(base + '/apps');
    await page.getByLabel('Six-digit authenticator code').waitFor();
    assert.equal(appReads, readsBefore); assert.equal(await page.getByRole('button', { name: 'Set up authenticator' }).count(), 0);
    await page.getByLabel('Six-digit authenticator code').fill('006734');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByRole('heading', { name: 'Your apps', exact: true }).waitFor();
    await page.goto(base + '/profile');
    const passwordForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Change password', exact: true }) });
    await passwordForm.getByLabel('Current password', { exact: true }).fill('fixture long password');
    await passwordForm.getByLabel('New password', { exact: true }).fill('new fixture long password');
    await passwordForm.getByLabel('Repeat new password', { exact: true }).fill('new fixture long password');
    await passwordForm.getByLabel('Six-digit authenticator code').fill('006734');
    await passwordForm.getByRole('button', { name: 'Change password', exact: true }).click();
    await page.getByText('Password changed. Sign in again on your apps.').waitFor();
    assert.equal(requests.find(item => item.path === '/profile/password').body.code, '006734');
    await page.goto(base + '/admin/reports');
    await page.getByText('Details', { exact: true }).click();
    await page.getByLabel('Add a private note').fill('Reviewed fixture');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Password', { exact: true }).fill('fixture long password');
    await dialog.getByLabel('Six-digit authenticator code').fill('006734');
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/admin/reports/fixture-report') && response.status() === 200),
      dialog.getByRole('button', { name: 'Confirm', exact: true }).click(),
    ]);
    await page.waitForFunction(() => !document.querySelector('dialog'));
    assert.equal(requests.find(item => item.path === '/reauthenticate').body.code, '006734');
    const reportWrites = requests.filter(item => item.path === '/admin/reports/fixture-report');
    assert.equal(reportWrites.at(-1).headers['x-csrf-token'], 'csrf-after-reauth');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
