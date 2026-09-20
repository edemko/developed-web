import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { merge, execute } from './install-internal-ingress.mjs';

test('unreviewed source and snippets fail before any write', () => {
  assert.throws(() => merge('unreviewed', 'unreviewed'), /Live source drift/);
});
test('developer invocation cannot perform root deployment', { skip: process.getuid() === 0 }, () => {
  assert.throws(() => execute('--stage'), /Only reviewed root/);
  assert.throws(() => execute('--apply'), /Only reviewed root/);
});
test('read-only exact-current merge preserves every original byte outside insertion', {
  skip: process.env.INTERNAL_INGRESS_CURRENT_TEST !== '1',
}, () => {
  const old = readFileSync('/etc/caddy/Caddyfile', 'utf8');
  const snippet = readFileSync(new URL('./portal-internal-routes.Caddyfile', import.meta.url), 'utf8');
  const candidate = merge(old, snippet);
  assert.equal(candidate.replace(/\n# BEGIN DEVELOPED INTERNAL CHECKS\n[\s\S]*?\n# END DEVELOPED INTERNAL CHECKS\n/, ''), old);
  assert.throws(() => merge(old + '\n', snippet), /Live source drift/);
  assert.throws(() => merge(old, snippet + '\n'), /snippet changed/);
  assert.throws(() => merge(candidate, snippet), /Live source drift/);
});
