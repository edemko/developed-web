import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateAppConfiguration } from '../dist/operator.js';

const catalog = JSON.parse(await readFile(new URL('../launch-catalog.json', import.meta.url), 'utf8'));

test('the seven intended launch entries are staged closed without credentials', async () => {
  assert.equal(catalog.version, 1);
  assert.equal(catalog.origin, 'https://www.developed.sk');
  assert.equal(catalog.registrationMode, 'closed');
  assert.equal(catalog.mailEnabled, false);
  assert.deepEqual(catalog.apps.map(app => [app.appId, app.name]), [
    ['app_mega_music', 'Mega Music'], ['app_kestrek', 'KešTrek'], ['app_screentime', 'ScreenTime'],
    ['app_airsoft', 'Airsoft'], ['app_voc_builder', 'Vocabulum'], ['app_odonto', 'Odonto AI'], ['app_otazkomat', 'Otázkomat'],
  ]);
  assert.equal(new Set(catalog.apps.map(app => app.slug)).size, 7);
  assert.equal(new Set(catalog.apps.map(app => app.launchUrl)).size, 7);
  for (const app of catalog.apps) {
    assert.deepEqual(Object.keys(app).sort(), ['appId', 'slug', 'name', 'icon', 'launchUrl', 'callbackUrl', 'published', 'enforceOidc', 'joinPolicy'].sort());
    assert.equal(app.published, false);
    assert.equal(app.enforceOidc, false);
    assert.equal(app.joinPolicy, 'closed');
    const validated = validateAppConfiguration({
      appId: app.appId, slug: app.slug, launchUrl: app.launchUrl, callbackUrl: app.callbackUrl,
      clientId: '11111111-1111-4111-8111-111111111111', serverKey: Buffer.alloc(32, 1).toString('base64url'),
    });
    assert.equal(validated.launchUrl, app.launchUrl);
    assert.equal(validated.callbackUrl, app.callbackUrl);
    // Same-origin icons satisfy the portal's img-src 'self' CSP. Every referenced
    // asset must be present in the separate curated marketing release.
    assert.match(app.icon, /^\/assets\/projects\/[a-z0-9.-]+\.(svg|webp)$/);
    const icon = await readFile(new URL(`../../../${app.icon.slice(1)}`, import.meta.url));
    assert.ok(icon.length > 0);
    if (app.icon.endsWith('.svg')) assert.doesNotMatch(icon.toString(), /<script|<foreignObject|\bon\w+=|(?:href|src)\s*=/i);
  }
});
