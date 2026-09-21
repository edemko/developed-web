// Isolated static fixture only: no production network or account mutations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

test('marketing navigation exposes login, registration and owner-selected app thumbnails on desktop and mobile', { skip: !process.env.PLAYWRIGHT_MODULE }, async () => {
  const root = new URL('../../../', import.meta.url);
  const catalog = JSON.parse(await readFile(new URL('server/accounts/launch-catalog.json', root), 'utf8'));
  const files = new Map([
    ['/', ['index.html', 'text/html']], ['/en/', ['en/index.html', 'text/html']],
    ['/styles.css', ['styles.css', 'text/css']], ['/script.js', ['script.js', 'text/javascript']],
    ...catalog.apps.map(app => [app.icon, [app.icon.slice(1), app.icon.endsWith('.svg') ? 'image/svg+xml' : 'image/webp']]),
  ]);
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/api/account/catalog') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ apps: catalog.apps })); return; }
    const file = files.get(path);
    if (!file) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file[1]); res.end(await readFile(new URL(file[0], root)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    // No app launch is needed to qualify the menu's link targets and images.
    for (const path of ['/', '/en/']) {
      for (const width of [375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`http://127.0.0.1:${server.address().port}${path}`);
        await page.waitForFunction(() => document.querySelectorAll('[data-apps-list] img').length === 7 && [...document.querySelectorAll('[data-apps-list] img')].every(image => image.complete && image.naturalWidth > 0));
        const summary = page.locator('[data-apps-menu] summary');
        await summary.click();
        assert.equal(await page.locator('[data-apps-list] a').count(), 8);
        for (const app of catalog.apps) assert.equal(await page.locator('[data-apps-list] a').filter({ hasText: app.name }).getAttribute('href'), app.launchUrl);
        const position = await page.locator('.brand-group').evaluate(group => {
          const logo = group.querySelector('.brand').getBoundingClientRect();
          const apps = group.querySelector('summary').getBoundingClientRect();
          return apps.left > logo.right && Math.abs(apps.top + apps.height / 2 - logo.top - logo.height / 2) < 2;
        });
        assert.equal(position, true);
        if (process.env.UI_SCREENSHOT_DIR && path === '/' && [375, 1440].includes(width)) {
          await page.screenshot({ path: `${process.env.UI_SCREENSHOT_DIR}/marketing-${width === 375 ? 'mobile' : 'desktop'}.png` });
        }
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-apps-menu]').evaluate(menu => menu.open), false);
        if (width < 761) await page.locator('[data-menu-toggle]').click();
        assert.equal(await page.locator('.account-links a[href^="/login"]').isVisible(), true);
        assert.equal(await page.locator('.account-links a[href^="/register"]').isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path} at ${width}px`);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
