// Fixture-only authorization: no provider, credentials or real account requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

test('Vocabulum authorization returns to the native app without the generic error', {
  skip: !process.env.PLAYWRIGHT_MODULE,
}, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const publicRoot = process.env.ACCOUNTS_TEST_PUBLIC_DIR
    ? pathToFileURL(`${process.env.ACCOUNTS_TEST_PUBLIC_DIR}/`)
    : new URL('../public/', import.meta.url);
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const asset = path === '/account/authorize' ? 'index.html' : path.replace('/account-assets/', '');
    if (!['index.html', 'app.js', 'images.js', 'i18n.js', 'app.css', 'cookies.js', 'cookies.css'].includes(asset)) {
      res.writeHead(404).end(); return;
    }
    res.setHeader('Content-Type', asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await readFile(new URL(asset, publicRoot)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
  try {
    const page = await browser.newPage({ locale: 'en-US' });
    const callback = 'sk.developed.vocabulum://oauth/callback?code=fixture-code&state=fixture-state';
    const approvals = [];
    await page.route('**/api/account/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      let result;
      if (path.endsWith('/session')) result = { csrfToken: 'fixture-csrf', user: {
        id: 'fixture-user', email: 'fixture@example.test', displayName: 'Fixture',
        language: 'en', role: 'USER', emailVerified: true,
      } };
      else if (path.endsWith('/catalog') || path.endsWith('/apps')) result = { apps: [] };
      else if (path.endsWith('/authorize') && req.method() === 'GET') result = {
        app: { id: 'vocabulum', name: 'Vocabulum' }, scopes: ['openid', 'email', 'profile'],
      };
      else if (path.endsWith('/authorize') && req.method() === 'POST') {
        approvals.push(req.postDataJSON());
        assert.equal(req.headers()['x-csrf-token'], 'fixture-csrf');
        result = { redirectUrl: callback };
      } else throw new Error(`Unexpected fixture endpoint: ${path}`);
      await route.fulfill({ json: result });
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.enable');
    const requested = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Native callback was not requested')), 5000);
      cdp.on('Page.frameRequestedNavigation', event => {
        if (event.url === callback) { clearTimeout(timeout); resolve(event.url); }
      });
    });
    // Authorization auto-submits the same form used by the Continue button.
    await page.goto(`http://127.0.0.1:${server.address().port}/account/authorize?authorization_id=fixture-authorization`);
    assert.equal(await requested, callback);
    assert.deepEqual(approvals, [{ authorizationId: 'fixture-authorization', approve: true }]);
    assert.equal(await page.getByRole('alert').count(), 0);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
