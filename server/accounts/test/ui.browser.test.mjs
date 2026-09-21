// Optional browser suite: PLAYWRIGHT_MODULE points to an installed playwright
// module. No live backend is called; every API response below is an isolated stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const playwrightModule = process.env.PLAYWRIGHT_MODULE;
const launchCatalog = JSON.parse(await readFile(new URL('../launch-catalog.json', import.meta.url), 'utf8'));

test('browser account and report flows retain safe state and render user text inertly', { skip: !playwrightModule }, async () => {
  const { chromium } = await import(playwrightModule);
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const asset = path.startsWith('/account-assets/') ? path.slice('/account-assets/'.length) : 'index.html';
    if (!['index.html', 'app.js', 'i18n.js', 'app.css'].includes(asset)) { res.writeHead(404).end(); return; }
    const content = await readFile(new URL(`../public/${asset}`, import.meta.url));
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Content-Type', asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(content);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ locale: 'en-US' });
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    const requests = [];
    let authenticated = false;
    let reportAttempts = 0;
    let registrationAttempts = 0;
    let registrationMode = 'open';
    const user = { id: 'user-id', email: 'owner@example.test', displayName: 'Owner Name', language: 'en', role: 'SUPERADMIN', emailVerified: true };
    await page.route('**/api/account/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace('/api/account', '');
      const body = request.postDataJSON();
      requests.push({ path, body, headers: request.headers() });
      let status = 200;
      let result = {};
      if (path === '/session') result = { csrfToken: 'test-csrf', user: authenticated ? user : null, registrationMode };
      else if (path === '/invitation/preview') result = { email: 'invited@example.test' };
      else if (path === '/register') { registrationAttempts++; if (registrationAttempts === 1) { status = 503; result = { error: { code: 'unavailable' } }; } else result = { ok: true, emailVerified: Boolean(body.invitation) }; }
      else if (path === '/resend-verification') result = { ok: true };
      else if (path === '/login') { authenticated = true; result = { user }; }
      else if (path === '/apps' || path === '/catalog') result = { apps: launchCatalog.apps.map(app => ({ ...app, id: app.appId, available: true, plan: 'free' })) };
      else if (path === '/logout' || path === '/logout-all') { authenticated = false; result = { ok: true }; }
      else if (path === '/security') result = { sessions: [] };
      else if (path === '/mfa') result = { enabled: true };
      else if (path === '/reports/source/mega-music') result = { app: { id: 'music', slug: 'mega-music', name: 'Mega Music' } };
      else if (path === '/reports/source/unknown') { status = 404; result = { error: { code: 'not_found' } }; }
      else if (path === '/reports') { reportAttempts++; if (reportAttempts === 1) { status = 503; result = { error: { code: 'unavailable' } }; } else result = { reference: 'DEV-42' }; }
      else if (path === '/verify-email') result = { ok: true, loginUrl: '/login?app=mega-music' };
      else if (path === '/authorize' && request.method() === 'GET') result = { app: { id: 'music', name: 'Mega Music' }, scopes: ['openid', 'email', 'profile'] };
      else if (path === '/authorize') result = { redirectUrl: 'https://app.example.test/auth/callback?code=test-code&state=test-state' };
      else if (path === '/admin/reports') result = { reports: [{ id: 'report-id', reference: 'DEV-1', appId: 'music', appName: 'Mega Music', description: '<img src=x onerror=alert(1)>', summary: 'Test issue', reporterId: 'user-id', createdAt: '2026-09-20T08:00:00Z', status: 'new', notes: [] }] };
      else { status = 404; result = { error: { code: 'not_found' } }; }
      await route.fulfill({ status, json: result });
    });
    await page.route('https://app.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>App signed in</h1>' }));
    // These are local UI fixtures, never real product/provider requests. The
    // manifest stays closed; availability above is synthetic presentation data.
    for (const app of launchCatalog.apps) {
      await page.route(app.launchUrl, route => route.fulfill({ contentType: 'text/html', body: '<h1>Launch fixture</h1>' }));
      await page.route(`**${app.icon}`, async route => route.fulfill({
        contentType: app.icon.endsWith('.svg') ? 'image/svg+xml' : 'image/webp',
        body: await readFile(new URL(`../../../${app.icon.slice(1)}`, import.meta.url)),
      }));
    }
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${base}/register?next=${encodeURIComponent('/account/authorize?authorization_id=pending-auth&redirect_uri=https://evil.test')}`);
    await page.getByRole('heading', { name: 'Create account', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Invitation code').count(), 0);
    await page.getByLabel('Name', { exact: true }).fill('Registration Fixture');
    await page.getByLabel('Email', { exact: true }).fill('new@example.test');
    await page.getByLabel('Password', { exact: true }).fill('long-test-password-only');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByLabel('Email', { exact: true }).inputValue(), 'new@example.test');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByRole('heading', { name: 'Check your inbox', exact: true }).waitFor();
    assert.equal(await page.locator('input[type=password]').count(), 0);
    assert.equal(requests.find(request => request.path === '/register').body.continuation, '/account/authorize?authorization_id=pending-auth');
    await page.getByRole('button', { name: 'Resend confirmation', exact: true }).click();
    await page.getByRole('status').last().waitFor();
    assert.equal(requests.find(request => request.path === '/resend-verification').body.email, 'new@example.test');
    registrationMode = 'invitation';
    await page.goto(`${base}/register#invitation=private-invitation-code`);
    await page.getByLabel('Email', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.getByLabel('Invitation code').count(), 0);
    assert.equal(await page.getByLabel('Email', { exact: true }).inputValue(), 'invited@example.test');
    assert.equal(await page.getByLabel('Email', { exact: true }).evaluate(input => input.readOnly), true);
    await page.getByLabel('Name', { exact: true }).fill('Invited Fixture');
    await page.getByLabel('Password', { exact: true }).fill('long-test-password-only');
    // Even changing the readonly DOM value cannot change this request mailbox.
    await page.getByLabel('Email', { exact: true }).evaluate(input => { input.value = 'other@example.test'; });
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByRole('heading', { name: 'Your account is ready', exact: true }).waitFor();
    assert.equal(requests.filter(request => request.path === '/register').at(-1).body.email, 'invited@example.test');
    assert.equal(requests.filter(request => request.path === '/register').at(-1).body.invitation, 'private-invitation-code');
    assert.equal(await page.getByRole('button', { name: 'Resend confirmation' }).count(), 0);
    await page.goto(`${base}/register`);
    await page.getByText('An invitation is required to create an account.').waitFor();
    assert.equal(await page.locator('main form').count(), 0);
    registrationMode = 'closed';
    await page.goto(`${base}/register`);
    await page.getByText('Registration is currently closed. Existing accounts can still sign in.').waitFor();
    assert.equal(await page.locator('main form').count(), 0);
    assert.ok(await page.locator('main a').getAttribute('href'));
    registrationMode = 'open';
    await page.goto(`${base}/verify-email#token=private-email-token`);
    await page.getByRole('heading', { name: 'Confirm email', exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(requests.filter(request => request.path === '/verify-email').length, 0);
    await page.getByRole('button', { name: 'Confirm email', exact: true }).click();
    await page.getByText('Email confirmed. You can now sign in.').waitFor();
    assert.equal(requests.find(request => request.path === '/verify-email').body.token, 'private-email-token');
    assert.equal(await page.locator('main a.button').getAttribute('href'), '/login?app=mega-music');
    await page.goto(`${base}/report-bug/mega-music?screen=player&token=SECRET`);
    await page.getByRole('heading', { name: 'Reporting a bug in Mega Music' }).waitFor();
    await page.getByLabel('Description', { exact: true }).fill('The music stopped unexpectedly.');
    await page.getByRole('button', { name: 'Send bug report' }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByLabel('Description', { exact: true }).inputValue(), 'The music stopped unexpectedly.');
    await page.getByRole('button', { name: 'Send bug report' }).click();
    await page.getByText('Report saved. Your reference: DEV-42').waitFor();
    const reports = requests.filter(request => request.path === '/reports');
    assert.equal(reports.length, 2);
    assert.equal(reports[0].body.idempotencyKey, reports[1].body.idempotencyKey);
    assert.equal(reports[0].headers['x-csrf-token'], 'test-csrf');
    assert.equal(reports[0].body.appSlug, 'mega-music');
    assert.equal(reports[0].body.userId, undefined);
    assert.equal(reports[0].body.diagnostics.token, undefined);
    await page.goto(`${base}/report-bug/unknown`);
    await page.getByText('This reporting link does not identify an available source.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Send bug report' }).count(), 0);
    await page.goto(`${base}/login`);
    await page.getByLabel('Email', { exact: true }).fill('owner@example.test');
    await page.getByLabel('Password', { exact: true }).fill('long-test-password-only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Your apps', exact: true }).waitFor();
    await page.getByRole('button', { name: /Mega Music/ }).waitFor();
    assert.equal(await page.locator('.avatar').innerText(), 'ON');
    assert.equal(await page.locator('.app-tile').count(), 7);
    await page.waitForFunction(() => [...document.querySelectorAll('.app-tile img')].length === 7 && [...document.querySelectorAll('.app-tile img')].every(image => image.complete && image.naturalWidth > 0));
    await page.locator('.apps-menu summary').click();
    assert.equal(await page.locator('.apps-menu-items img').count(), 7);
    assert.equal(await page.locator('.apps-menu-items img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
    if (process.env.UI_SCREENSHOT_DIR) {
      await page.screenshot({ path: `${process.env.UI_SCREENSHOT_DIR}/portal-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: `${process.env.UI_SCREENSHOT_DIR}/portal-mobile.png`, fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.apps-menu').evaluate(menu => menu.open), false);
    for (const app of launchCatalog.apps) {
      await page.getByRole('button', { name: new RegExp(app.name) }).click();
      await page.getByRole('heading', { name: 'Launch fixture', exact: true }).waitFor();
      assert.equal(page.url(), app.launchUrl);
      await page.goto(`${base}/apps`);
      await page.getByRole('heading', { name: 'Your apps', exact: true }).waitFor();
    }
    await page.goto(`${base}/admin/reports`);
    await page.getByText('Test issue', { exact: true }).waitFor();
    await page.getByText('Details', { exact: true }).click();
    await page.getByText('<img src=x onerror=alert(1)>', { exact: true }).waitFor();
    assert.equal(await page.locator('main img').count(), 0);
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${base}/profile`);
    await page.getByRole('heading', { name: 'My profile', exact: true }).first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    user.requirePasswordChange = true;
    await page.goto(`${base}/apps`);
    await page.getByText('Please change your password before opening an app.').waitFor();
    assert.equal(new URL(page.url()).pathname, '/profile');
    user.requirePasswordChange = false;
    await page.goto(`${base}/security`);
    await page.getByRole('button', { name: 'Log out here', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.waitForURL('**/login');
    assert.equal(requests.filter(request => request.path === '/logout').length, 1);
    assert.equal(requests.filter(request => request.path === '/logout-all').length, 0);
    authenticated = true;
    await page.goto(`${base}/security`);
    await page.getByRole('button', { name: 'Log out of all apps and devices', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.waitForURL('**/login');
    assert.equal(requests.filter(request => request.path === '/logout-all').length, 1);
    authenticated = true;
    await page.goto(`${base}/account/authorize?authorization_id=0123456789abcdef0123456789abcdef`);
    await page.getByRole('heading', { name: 'App signed in' }).waitFor();
    assert.equal(requests.filter(request => request.path === '/authorize' && request.body?.approve === true).length, 1);
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
