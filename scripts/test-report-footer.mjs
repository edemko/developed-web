import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '../server/accounts/node_modules/playwright/index.mjs');

test('shared reporting stays in the footer through responsive layout, locale and SPA changes', async () => {
  const js = await readFile(new URL('../assets/support/report.js', import.meta.url));
  const css = await readFile(new URL('../assets/support/report.css', import.meta.url));
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/report.js' ? 'application/javascript; charset=utf-8' : req.url === '/report.css' ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8');
    res.end(req.url === '/report.js' ? js : req.url === '/report.css' ? css : '<!doctype html><html lang="en"><head><link rel="stylesheet" href="/report.css"><script defer src="/report.js" data-developed-app="kestrek"></script></head><body style="background:#0f0f0f"><header><span data-developed-support-slot></span></header><main>Page</main></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin + '/dashboard?token=private#secret');
    assert.equal(await page.locator('a').count(), 0, 'no floating/header fallback before footer mounts');
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<footer><div class="footer-bottom"></div></footer>'));
    const report = page.locator('footer a');
    await report.waitFor();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await report.hover();
      const style = await report.evaluate(node => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor, position: getComputedStyle(node).position, height: node.getBoundingClientRect().height }));
      assert.equal(style.color, 'rgb(248, 113, 113)');
      assert.equal(style.background, 'rgba(0, 0, 0, 0)');
      assert.notEqual(style.position, 'fixed');
      assert.ok(style.height >= 44);
      assert.equal(await page.locator('a').count(), 1);
    }
    for (const [lang,label] of Object.entries({sk:'Nahlásiť',cs:'Nahlásit',uk:'Повідомити',en:'Report'})) {
      await page.evaluate(lang => document.documentElement.lang = lang, lang);
      await page.waitForFunction(label => document.querySelector('footer a span')?.textContent === label, label);
    }
    await page.evaluate(() => history.pushState({}, '', '/transactions?token=private#secret'));
    await report.dispatchEvent('contextmenu');
    const url = new URL(await report.getAttribute('href'));
    assert.equal(url.pathname, '/report-bug/kestrek');
    assert.equal(url.searchParams.get('sourceUrl'), origin + '/transactions');
    assert.equal(await report.getAttribute('referrerpolicy'), 'no-referrer');
    await page.evaluate(() => document.querySelector('footer').outerHTML = '<footer><a class="developed-report-link" href="https://www.developed.sk/report-bug/kestrek?platform=web">Authored report</a></footer>');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('a').count(), 1, 'authored link replaces fallback without duplicates');
    await page.evaluate(() => document.querySelector('footer').remove());
    await page.waitForTimeout(100);
    assert.equal(await page.locator('a').count(), 0);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
