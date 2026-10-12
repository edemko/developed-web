import test from 'node:test';
import assert from 'node:assert/strict';
import { password, HttpError } from '../dist/security.js';

// The one password rule for every DevelopED app: 6 to 128 characters, enforced only here.
test('password policy accepts 6 to 128 characters', () => {
  for (const ok of ['a'.repeat(6), 'a'.repeat(128)]) assert.equal(password(ok), ok);
  for (const bad of ['', 'a'.repeat(5), 'a'.repeat(129), 123456, null]) {
    assert.throws(() => password(bad), (e) => e instanceof HttpError && e.status === 400 && e.code === 'weak_password');
  }
});
