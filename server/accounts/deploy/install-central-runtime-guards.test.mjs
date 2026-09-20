import test from 'node:test';
import assert from 'node:assert/strict';
import { targets, contents, execute } from './install-central-runtime-guards.mjs';
test('exact six central environment selections plus additive startup check', () => {
  assert.equal(targets.length, 6);
  for (const [slug] of targets) {
    const body = contents(slug);
    assert.ok(body.includes(`EnvironmentFile=/etc/developed-accounts/host-env-staging/${slug}.central.env`));
    assert.ok(body.endsWith(`assert-central-runtime.mjs ${slug}\n`));
    assert.ok(!body.includes('ExecStart=') && !body.includes('[Install]'));
  }
  assert.throws(() => contents('../other'));
});
test('non-root install fails before writes', { skip: process.getuid() === 0 }, () => assert.throws(execute, /Root required/));
