// Fixture-only flow: real UI, delayed responses, no live accounts or provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

test('automatic authorization survives language changes without replay and explains expired grants', {
  skip: !process.env.PLAYWRIGHT_MODULE, timeout: 30000,
}, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const asset = path === '/account/authorize' ? 'index.html' : path.replace('/account-assets/', '');
    if (!['index.html', 'app.js', 'images.js', 'i18n.js', 'app.css', 'cookies.js', 'cookies.css'].includes(asset)) {
      res.writeHead(404).end(); return;
    }
    res.setHeader('Content-Type', asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await readFile(new URL(`../public/${asset}`, import.meta.url)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ locale: 'en-US' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let release;
    const responseGate = new Promise(resolve => { release = resolve; });
    let expired = false;
    const authorizations = [];
    const callback = 'https://app.example.test/callback?code=fixture&state=fixture';
    await page.route('https://app.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Signed in</h1>' }));
    await page.route('**/api/account/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/session')) return route.fulfill({ json: { csrfToken: 'fixture-csrf', user: {
        id: 'fixture-user', email: 'fixture@example.test', displayName: 'Fixture', language: 'en', role: 'USER', emailVerified: true,
      } } });
      if (path.endsWith('/apps') || path.endsWith('/catalog')) return route.fulfill({ json: { apps: [] } });
      assert.equal(path, '/api/account/authorize');
      assert.equal(request.method(), 'POST', 'No redundant metadata GET for a one-use grant');
      assert.equal(request.headers()['x-csrf-token'], 'fixture-csrf');
      authorizations.push(request.postDataJSON());
      if (expired) return route.fulfill({ status: 400, json: { error: { code: 'invalid_authorization' } } });
      await responseGate;
      return route.fulfill({ json: { redirectUrl: callback } });
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${base}/account/authorize?authorization_id=${'a'.repeat(32)}`);
    await page.getByRole('heading', { name: 'Signing you in…', exact: true }).waitFor();
    assert.equal(await page.locator('main form, main button').count(), 0);
    assert.equal(await page.getByRole('status').innerText(), 'Loading…');
    await page.locator('.language-menu summary').click();
    await page.locator('.language-menu').getByRole('button', { name: 'Slovenčina', exact: true }).click();
    await page.getByRole('heading', { name: 'Prihlasujeme vás…', exact: true }).waitFor();
    // Another render is waiting on the existing request, rather than replaying it.
    assert.deepEqual(authorizations, [{ authorizationId: 'a'.repeat(32), approve: true }]);
    release();
    await page.waitForURL(callback);
    await page.getByRole('heading', { name: 'Signed in' }).waitFor();
    assert.equal(authorizations.length, 1);

    expired = true;
    await page.goto(`${base}/account/authorize?authorization_id=${'b'.repeat(32)}`);
    await page.getByRole('heading', { name: 'This sign-in link is no longer valid', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Your apps', exact: true }).getAttribute('href'), '/apps');
    assert.equal(await page.locator('main button, main form').count(), 0);
    assert.equal(authorizations.length, 2);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
