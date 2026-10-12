import test from 'node:test';
import assert from 'node:assert/strict';
import { password, PASSWORD_POLICY, HttpError } from '../dist/security.js';

// The one password rule for every DevelopED app: at least 6 characters and at most 72 UTF-8
// bytes (GoTrue's bcrypt limit), enforced only here.
test('password policy accepts 6 characters to 72 bytes', () => {
  assert.deepEqual({ ...PASSWORD_POLICY }, { minLength: 6, maxBytes: 72 });
  for (const ok of ['a'.repeat(6), 'a'.repeat(72), 'é'.repeat(36), 'heslo1']) assert.equal(password(ok), ok);
  for (const bad of ['', 'a'.repeat(5), 'a'.repeat(73), 'é'.repeat(37), '😀'.repeat(19), 123456, null]) {
    assert.throws(() => password(bad), (e) => e instanceof HttpError && e.status === 400 && e.code === 'weak_password');
  }
});
