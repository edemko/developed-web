import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { browserPayload, HTML, DESTINATION, assertHandoffMetadata, smoke, assertPromoted, HANDOFF_ID } from './vocabulum-vercel-browser-handoff.mjs';
import { PROJECT, ENV_NAMES } from './vocabulum-vercel-operator.mjs';
const payload = browserPayload(await readFile(new URL('./vocabulum-vercel-retirement/config.json', import.meta.url), 'utf8'));
const routes = JSON.parse(payload.files[0].data).routes;
function routeFor(method, path, host = 'old.example') {
  return routes.find((r) => new RegExp(r.src, 'i').test(new URL(path, 'https://old.example').pathname)
    && (!r.methods || r.methods.includes(method)) && (!r.has || r.has.every((h) => h.value === host)));
}
test('browser handoff is two files, no code/runtime/environment, no HTTP Location', () => {
  assert.equal(payload.target, 'production'); assert.equal(payload.autoAssignCustomDomains, false);
  assert.equal(payload.env, undefined); assert.equal(payload.build, undefined);
  assert.deepEqual(payload.files.map((f) => f.file), ['vercel.json', 'handoff.html']);
  assert.ok(!/<script|\bon\w+=|<link|<img|<iframe/i.test(HTML));
  assert.equal((HTML.match(/https:\/\/vocabulum\.developed\.sk\/auth\/login#/g) ?? []).length, 2);
  for (const r of routes) {
    assert.equal(r.headers.Location, undefined); assert.equal(r.headers['Cache-Control'], 'no-store');
    assert.equal(r.headers['Referrer-Policy'], 'no-referrer');
    assert.equal(r.headers['Content-Security-Policy'], "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  }
  for (const path of ['/', '/auth/login?code=fixture', '/reset-password?token=fixture', '/folders/example']) {
    assert.equal(routeFor('GET', path).status, 200); assert.equal(routeFor('HEAD', path).status, 200);
    assert.equal(routeFor('POST', path).status, 410); assert.equal(routeFor('GET', path, 'vocabulum.developed.sk').status, 410);
  }
  for (const path of ['/api/auth/providers', '/api/auth/callback/developed?code=fixture', '/oauth/token', '/.well-known/openid-configuration'])
    for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS', 'DELETE']) assert.equal(routeFor(method, path).status, 410);
});
test('handoff metadata refuses credentials, functions, nonproduction and unreviewed route hash', () => {
  const d = { id: 'dpl_fixture', projectId: PROJECT, readyState: 'READY', target: 'production',
    alias: ['vocabulary-builder-erik-demkos-projects.vercel.app'], meta: payload.meta, env: ['VERCEL'], build: { env: ['VERCEL'] } };
  assertHandoffMetadata(d, d.id, payload);
  for (const change of [(a) => a.env.push(ENV_NAMES[0]), (a) => { a.functions = { api: {} }; },
    (a) => { a.target = null; }, (a) => { a.meta.routingSha256 = 'wrong'; }]) {
    const a = structuredClone(d); change(a); assert.throws(() => assertHandoffMetadata(a, a.id, payload));
  }
});
test('real Chromium meta refresh clears incoming query and fragment without any external asset or referrer',
  { skip: !process.env.VOCABULUM_PLAYWRIGHT_MODULE }, async () => {
    const { chromium } = await import(pathToFileURL(process.env.VOCABULUM_PLAYWRIGHT_MODULE).href);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const suffix of ['/?code=fixture-code&token=fixture-token#access_token=fragment-secret',
        '/auth/login?next=https://untrusted.invalid#fixture-fragment', '/folders/example?state=fixture#fixture']) {
        const context = await browser.newContext(); const seen = [];
        const host = process.env.VOCABULUM_LIVE_HANDOFF === '1' ? 'vocabulary-builder-plum.vercel.app' : 'old.example';
        await context.route('**/*', async (route) => {
          const req = route.request(); seen.push({ url: req.url(), referrer: req.headers().referer });
          if (new URL(req.url()).hostname === host) {
            if (process.env.VOCABULUM_LIVE_HANDOFF === '1') { await route.continue(); return; }
            const r = routeFor(req.method(), req.url());
            await route.fulfill({ status: r.status, headers: r.headers, body: HTML });
          } else {
            assert.equal(req.url(), DESTINATION.slice(0, -1)); assert.equal(req.headers().referer, undefined);
            await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Canonical fixture</title>' });
          }
        });
        const page = await context.newPage(); await page.goto(`https://${host}${suffix}`);
        await page.waitForURL(DESTINATION);
        assert.equal(page.url(), DESTINATION); assert.equal(seen.length, 2);
        assert.equal(seen[1].url, DESTINATION.slice(0, -1)); assert.equal(seen[1].referrer, undefined);
        await context.close();
      }
    } finally { await browser.close(); }
  });

test('public HTTP handoff refuses platform redirects, altered HTML, query forwarding and live protocols', async () => {
  const fixture = async (host, path, method = 'GET', direct = false) => {
    const r = routeFor(method, path, direct ? 'vocabulum.developed.sk' : 'old.example');
    return { status: r.status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
      body: r.status === 200 && method === 'GET' ? HTML : '' };
  };
  assert.equal((await smoke(fixture)).checks, 13);
  for (const change of [(r) => { r.status = 303; }, (r) => { r.headers.location = `${DESTINATION}?code=fixture`; },
    (r) => { r.headers['set-cookie'] = ['fixture']; }, (r) => { r.body = 'changed'; }])
    await assert.rejects(smoke(async (...args) => { const r = await fixture(...args); change(r); return r; }));
  assert.throws(() => assertPromoted({ project: { targets: { production: { id: `${HANDOFF_ID}-other` } } } }));
});
