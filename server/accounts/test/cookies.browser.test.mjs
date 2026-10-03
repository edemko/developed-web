// Static local fixture: never contacts production or sets account cookies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../../../', import.meta.url);
const paths = ['/', '/en/', ...['kestrek', 'mega-music', 'screen-time', 'airsoft', 'odonto-ai', 'otazkomat', 'vocabulum', 'cookies'].flatMap(slug => [`/${slug}/`, `/en/${slug}/`]), '/ochrana-osobnych-udajov/', '/pravne-informacie/', '/podmienky-pouzivania/', '/en/privacy/', '/en/legal-notice/', '/en/website-terms/'];

test('every public page has a cookie-policy fallback and both releases use identical dialog assets', async () => {
  for (const path of paths) {
    const html = await readFile(new URL(`.${path}index.html`, root), 'utf8');
    const policy = path.startsWith('/en/') ? '/en/cookies/' : '/cookies/';
    assert.ok(html.includes(`href="${policy}" data-cookie-info`), path);
    assert.ok(html.includes('src="/assets/privacy/cookies.js"'), path);
    assert.ok(html.includes('href="/assets/privacy/cookies.css"'), path);
  }
  for (const name of ['cookies.js', 'cookies.css']) {
    assert.equal(await readFile(new URL(`assets/privacy/${name}`, root), 'utf8'), await readFile(new URL(`server/accounts/public/${name}`, root), 'utf8'));
  }
});

test('cookie information works on every public page without tracking or storage, including keyboard and mobile', { skip: !process.env.PLAYWRIGHT_MODULE }, async () => {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/api/account/catalog') { res.setHeader('Content-Type', 'application/json'); res.end('{"apps":[]}'); return; }
    const file = paths.includes(path) ? `${path}index.html` : path;
    if (!paths.includes(path) && !/^\/(?:assets\/[a-zA-Z0-9/_.-]+|styles\.css|script\.js|favicon\.png)$/.test(path)) { res.writeHead(404).end(); return; }
    try {
      const content = await readFile(new URL(`.${file}`, root));
      res.setHeader('Content-Type', ({ html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })[file.split('.').pop()] || 'application/octet-stream');
      res.end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    for (const [index, path] of paths.entries()) {
      await page.setViewportSize({ width: index % 2 ? 375 : 1440, height: 850 });
      await page.goto(origin + path);
      const initialWidth = await page.evaluate(() => Math.max(innerWidth, document.documentElement.scrollWidth));
      assert.equal(await page.locator('#developed-cookie-dialog').count(), 0, 'No unsolicited consent prompt');
      const trigger = page.locator('[data-cookie-info]');
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: path.startsWith('/en/') ? 'Cookies and your privacy' : 'Cookies a vaše súkromie' });
      await dialog.waitFor({ state: 'visible' });
      assert.equal(await page.locator('#developed-cookie-title').evaluate(node => node === document.activeElement), true);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'Modal contains keyboard focus');
      assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), true, path);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= initialWidth, `${path}: dialog must not widen the page`);
      assert.equal(await dialog.evaluate(node => { const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }), true, path);
      if (process.env.UI_SCREENSHOT_DIR && index < 2) await page.screenshot({ path: `${process.env.UI_SCREENSHOT_DIR}/cookies-${index ? 'mobile' : 'desktop'}.png` });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('developed-cookie-dialog'));
      assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
      await trigger.click();
      await dialog.getByRole('button').click();
      await page.waitForFunction(() => !document.getElementById('developed-cookie-dialog'));
      assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
      assert.deepEqual(await context.cookies(), []);
    }
    // Privacy/storage restrictions must not prevent opening the information.
    await page.evaluate(() => {
      for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, { get() { throw new Error('Storage blocked'); } });
    });
    await page.locator('[data-cookie-info]').click();
    await page.locator('#developed-cookie-dialog').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    const noScript = await browser.newContext({ javaScriptEnabled: false });
    const fallback = await noScript.newPage();
    await fallback.goto(origin + '/en/kestrek/');
    await fallback.locator('[data-cookie-info]').click();
    assert.equal(new URL(fallback.url()).pathname, '/en/cookies/');
    await noScript.close();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
