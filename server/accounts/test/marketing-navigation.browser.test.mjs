// Isolated static fixture only: no production network or account mutations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

test('marketing header groups app and offer links in accessible dropdowns on desktop and mobile', { skip: !process.env.PLAYWRIGHT_MODULE }, async () => {
  const root = new URL('../../../', import.meta.url);
  const catalog = JSON.parse(await readFile(new URL('server/accounts/launch-catalog.json', root), 'utf8'));
  const files = new Map([
    ['/', ['index.html', 'text/html']], ['/en/', ['en/index.html', 'text/html']],
    ['/styles.css', ['styles.css', 'text/css']], ['/script.js', ['script.js', 'text/javascript']],
    ['/assets/support/report.js', ['assets/support/report.js', 'text/javascript']],
    ['/assets/support/report.css', ['assets/support/report.css', 'text/css']],
    ['/assets/privacy/cookies.js', ['assets/privacy/cookies.js', 'text/javascript']],
    ['/assets/privacy/cookies.css', ['assets/privacy/cookies.css', 'text/css']],
    ['/favicon.png', ['favicon.png', 'image/png']],
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
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    // No app launch is needed to qualify the menu's link targets and images.
    for (const path of ['/', '/en/']) {
      for (const width of [320, 375, 768, 1024, 1025, 1100, 1440]) {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
        await page.goto(origin + path);
        assert.equal(await page.locator('link[rel=icon]').getAttribute('href'), '/favicon.png');
        assert.equal(await page.evaluate(() => new Promise(resolve => {
          const icon = new Image(); icon.onload = () => resolve(icon.naturalWidth > 0 && icon.naturalHeight > 0);
          icon.onerror = () => resolve(false); icon.src = document.querySelector('link[rel=icon]').href;
        })), true);
        await page.waitForFunction(() => document.querySelectorAll('[data-apps-list] img').length === 7 && [...document.querySelectorAll('[data-apps-list] img')].every(image => image.complete && image.naturalWidth > 0));
        const reportButton = page.locator('[data-report-link]');
        await reportButton.waitFor({ state: 'visible' });
        assert.equal(await reportButton.getAttribute('aria-label'), path === '/' ? 'Nahlásiť chybu' : 'Report a bug');
        assert.equal(await reportButton.innerText(), '');
        assert.equal(await reportButton.locator('svg').isVisible(), true);
        assert.equal(await page.locator('#developed-report-problem').count(), 0, 'no duplicate floating report button');
        // The shared report handler captures the source route at activation without opening a report.
        await reportButton.dispatchEvent('contextmenu');
        const reportUrl = new URL(await reportButton.getAttribute('href'));
        assert.equal(reportUrl.origin, 'https://www.developed.sk');
        assert.equal(reportUrl.pathname, '/report-bug');
        assert.equal(reportUrl.searchParams.get('sourceUrl'), origin + path);
        assert.equal(reportUrl.searchParams.get('platform'), 'web');
        assert.equal(await page.locator('[data-navbar] details, [data-navbar] select').count(), 0);
        assert.equal(await page.locator('[data-navbar]').evaluate(el => el.getBoundingClientRect().height <= 80), true, `single header row at ${width}px`);
        const mobile = width <= 1024;
        assert.equal(await page.evaluate(() => {
          const rect = selector => document.querySelector(selector).getBoundingClientRect();
          const brand = rect('[data-navbar] .brand');
          const utilities = rect('.nav-utilities');
          if (innerWidth <= 1024) return brand.right <= utilities.left;
          const sections = rect('.nav-sections');
          const actions = rect('.nav-actions');
          return brand.right <= sections.left && sections.right <= actions.left && actions.right <= utilities.left;
        }), true, `header controls do not overlap at ${width}px`);
        const menuToggle = page.locator('[data-menu-toggle]');
        const appsToggle = page.locator('[aria-controls="apps-dropdown"]');
        const offerToggle = page.locator('[aria-controls="offer-dropdown"]');
        if (mobile) {
          assert.equal(await appsToggle.isVisible(), false);
          await menuToggle.click();
          assert.equal(await appsToggle.evaluate(el => el === document.activeElement), true);
        }
        assert.equal(await page.locator('.nav-contact').isVisible(), true);
        assert.equal(await page.locator('.account-links a[href^="/login"]').isVisible(), true);
        assert.equal(await page.locator('.account-links a[href^="/register"]').isVisible(), true);
        await appsToggle.click();
        assert.equal(await page.locator('#apps-dropdown').isVisible(), true);
        if (mobile) assert.equal(await page.locator('[data-menu]').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), true);
        assert.equal(await page.locator('[data-apps-list] a').count(), catalog.apps.length + 1);
        for (const app of catalog.apps) assert.equal(await page.locator('[data-apps-list] a').filter({ hasText: app.name }).getAttribute('href'), app.launchUrl);
        await offerToggle.click();
        assert.equal(await appsToggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await page.locator('#apps-dropdown').isVisible(), false);
        assert.equal(await page.locator('#offer-dropdown a').count(), 5);
        assert.equal(await page.locator('#offer-dropdown').isVisible(), true);
        await page.keyboard.press('Escape');
        assert.equal(await offerToggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await offerToggle.evaluate(el => el === document.activeElement), true);
        if (mobile) assert.equal(await menuToggle.getAttribute('aria-expanded'), 'true');
        await offerToggle.press('ArrowDown');
        assert.equal(await page.locator('#offer-dropdown a').first().evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('End');
        assert.equal(await page.locator('#offer-dropdown a').last().evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Home');
        assert.equal(await page.locator('#offer-dropdown a').first().evaluate(el => el === document.activeElement), true);
        if (process.env.UI_SCREENSHOT_DIR && path === '/' && [375, 1440].includes(width)) {
          await page.screenshot({ path: `${process.env.UI_SCREENSHOT_DIR}/marketing-${width === 375 ? 'mobile' : 'desktop'}.png` });
        }
        // Click the nested icon, rather than its anchor, to exercise event delegation.
        await page.locator('#offer-dropdown a').last().locator('svg').click();
        assert.equal(new URL(page.url()).hash, path === '/' ? '#odporucanie' : '#referrals');
        assert.equal(await offerToggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await menuToggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await page.locator('.referral').evaluate(el => el === document.activeElement), true);
        assert.equal(await page.evaluate(() => document.body.classList.contains('menu-open')), false);
        if (mobile) await menuToggle.click();
        await appsToggle.press('ArrowUp');
        assert.equal(await page.locator('[data-apps-list] a').last().evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Escape');
        assert.equal(await appsToggle.evaluate(el => el === document.activeElement), true);
        await appsToggle.press('Enter');
        await page.locator('.nav-contact').focus();
        assert.equal(await appsToggle.getAttribute('aria-expanded'), 'false', 'Tab/focus outside closes the dropdown');
        await appsToggle.click();
        // A contact tap below an expanded mobile list must survive the panel collapse.
        await page.locator('.nav-contact').click();
        assert.equal(new URL(page.url()).hash, path === '/' ? '#kontakt' : '#contact');
        assert.equal(await menuToggle.getAttribute('aria-expanded'), 'false');
        if (mobile) await menuToggle.click();
        await appsToggle.click();
        await page.mouse.click(5, 85);
        assert.equal(await appsToggle.getAttribute('aria-expanded'), 'false', 'outside click closes the dropdown');
        assert.equal(await menuToggle.getAttribute('aria-expanded'), 'false');
        if (mobile) {
          await menuToggle.click();
          await page.keyboard.press('Escape');
          assert.equal(await menuToggle.evaluate(el => el === document.activeElement), true);
          assert.equal(await page.locator('[data-menu]').isVisible(), false);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path} at ${width}px`);
      }
    }
    // A resized menu must not leave a scroll lock or focus in hidden content.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin + '/');
    await page.locator('[aria-controls="offer-dropdown"]').press('ArrowDown');
    await page.setViewportSize({ width: 375, height: 900 });
    await page.waitForFunction(() => document.activeElement === document.querySelector('[data-menu-toggle]'));
    assert.equal(await page.locator('[data-menu]').isVisible(), false);
    await page.locator('[data-menu-toggle]').click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => !document.body.classList.contains('menu-open'));
    assert.equal(await page.locator('[data-menu]').isVisible(), true);
    assert.equal(await page.locator('[data-menu-toggle]').getAttribute('aria-expanded'), 'false');
    // An unavailable catalog still leaves the authored app-directory link usable.
    await page.route('**/api/account/catalog', route => route.fulfill({ status: 503, body: '{}' }));
    await page.goto(origin + '/en/');
    await page.locator('[aria-controls="apps-dropdown"]').click();
    assert.equal(await page.locator('[data-apps-list] a').count(), 1);
    assert.equal(await page.locator('[data-apps-list] a').getAttribute('href'), '/apps');
    assert.deepEqual(errors, []);
    // Touch generates focus at a different point from a mouse click.
    const touchPage = await browser.newPage({ hasTouch: true, isMobile: true, reducedMotion: 'reduce', viewport: { width: 375, height: 667 } });
    await touchPage.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await touchPage.goto(origin + '/');
    await touchPage.waitForFunction(() => document.querySelectorAll('[data-apps-list] a').length > 1);
    await touchPage.locator('[data-menu-toggle]').tap();
    await touchPage.locator('[aria-controls="apps-dropdown"]').tap();
    await touchPage.locator('[aria-controls="offer-dropdown"]').tap();
    assert.equal(await touchPage.locator('#offer-dropdown').isVisible(), true);
    await touchPage.locator('[aria-controls="apps-dropdown"]').tap();
    await touchPage.locator('.nav-contact').tap();
    assert.equal(new URL(touchPage.url()).hash, '#kontakt');
    assert.equal(await touchPage.locator('[data-menu]').isVisible(), false);
    await touchPage.close();
    const noJsPage = await browser.newPage({ javaScriptEnabled: false, reducedMotion: 'reduce', viewport: { width: 375, height: 900 } });
    await noJsPage.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await noJsPage.goto(origin + '/');
    assert.equal(await noJsPage.locator('.nav-fallback a').count(), 5);
    assert.equal(await noJsPage.locator('.nav-fallback a[href="/apps"]').isVisible(), true);
    assert.equal(await noJsPage.locator('[data-report-link]').isVisible(), true);
    assert.equal(await noJsPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await noJsPage.close();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
