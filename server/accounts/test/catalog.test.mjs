import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { appIcons, catalogApp } from '../dist/catalog.js';

test('all launch catalog icons override legacy symbolic registry values', async () => {
  const catalog = JSON.parse(await readFile(new URL('../launch-catalog.json', import.meta.url)));
  assert.equal(Object.keys(appIcons).length, catalog.apps.length);
  for (const app of catalog.apps) {
    assert.equal(catalogApp({ id: app.appId, icon: 'Wallet' }).icon, app.icon);
    assert.equal(catalogApp({ id: app.appId, icon: null }).icon, app.icon);
    const bytes = await readFile(new URL(`../../..${app.icon}`, import.meta.url));
    assert.ok(bytes.length > 0);
  }
});

test('unknown apps never expose component names, external or active-content icon URLs', () => {
  for (const icon of ['Wallet', 'https://other.invalid/icon.png', '//other.invalid/i.svg', '/assets/projects/../../private.png',
    '/assets/projects/x.svg?secret=value', 'data:image/svg+xml,x', null]) {
    assert.equal(catalogApp({ id: 'unknown', icon }).icon, null);
  }
  assert.equal(catalogApp({ id: 'future', icon: '/assets/projects/future.v1.svg' }).icon, '/assets/projects/future.v1.svg');
});
