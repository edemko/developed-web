import test from 'node:test';
import assert from 'node:assert/strict';
import { readTree, treeHash, targets, retainedAsset, execute } from './stage-product-frontends.mjs';

test('retention allows public assets but not old entrypoints/config/source', () => {
  for (const path of ['chunk-275EIYAO.js', 'main-73ADWX3V.js', 'styles-2NHVI36V.css', 'assets/index-aBC123.js', 'assets/icon.svg']) assert.ok(retainedAsset(path));
  for (const path of ['index.html', '.env', 'assets/.env', 'assets/../secret.js', 'assets/.git/config', 'settings.json', 'ngsw.json', 'worker.js', 'backend/src/main.ts']) assert.ok(!retainedAsset(path));
});
test('developer invocation cannot install', { skip: process.getuid() === 0 }, () => assert.throws(execute, /Root required/));
test('read-only qualified and current serving artifacts satisfy staging contracts', { skip: process.env.PRODUCT_FRONTEND_CURRENT_TEST !== '1' }, () => {
  for (const target of targets) {
    const current = readTree(target.source); assert.equal(current.length, target.count); assert.equal(treeHash(current), target.hash);
    const old = readTree(target.old); assert.ok(old.some(([path]) => path === 'index.html'));
    const selected = new Map(current);
    for (const [path, hash] of old) if (retainedAsset(path) && selected.has(path) && /(?:^|\/)[^/]+-[A-Za-z0-9_-]+\.(?:js|css)$/.test(path)) assert.equal(selected.get(path), hash);
  }
});
