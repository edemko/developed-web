import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { merge, execute } from './install-gateway-ingress.mjs';

test('unreviewed input and non-root execution fail before writes', () => {
  assert.throws(() => merge('unreviewed', 'unreviewed', 'unreviewed'), /Live source drift/);
  if (process.getuid() !== 0) {
    assert.throws(() => execute('--stage'), /Only reviewed root/);
    assert.throws(() => execute('--apply'), /Only reviewed root/);
  }
});

test('read-only current merge adds only gateway, preserving every existing adapted site', {
  skip: process.env.GATEWAY_INGRESS_CURRENT_TEST !== '1', timeout: 20000,
}, async () => {
  const current = readFileSync('/etc/caddy/Caddyfile', 'utf8');
  const gateway = readFileSync(new URL('./public-supabase-site.Caddyfile', import.meta.url), 'utf8');
  const data = readFileSync(new URL('./public-data-routes.Caddyfile', import.meta.url), 'utf8');
  const candidate = merge(current, gateway, data);
  assert.equal(candidate.slice(0, current.length), current);
  assert.equal(candidate.split('# BEGIN DEVELOPED INTERNAL CHECKS').length, 2);
  assert.doesNotMatch(candidate.slice(current.length), /127\.0\.0\.1:3140|portal-routes|www\.developed\.sk|^\s*import\s/m);
  assert.throws(() => merge(current + '\n', gateway, data), /Live source drift/);
  assert.throws(() => merge(current, gateway + '\n', data), /gateway source changed/);
  assert.throws(() => merge(current, gateway, data + '\n'), /gateway source changed/);
  assert.throws(() => merge(candidate, gateway, data), /Live source drift/);
  const directory = await mkdtemp(join(tmpdir(), 'developed-gateway-merge-test-'));
  try {
    const adapt = async (name, value) => {
      const path = join(directory, name); await writeFile(path, value, { mode: 0o600 });
      const r = spawnSync('/usr/bin/caddy', ['adapt', '--adapter', 'caddyfile', '--config', path], { encoding: 'utf8', timeout: 10000 });
      assert.equal(r.status, 0, 'Caddy adaptation failed; output suppressed');
      const validation = spawnSync('/usr/bin/caddy', ['validate', '--adapter', 'caddyfile', '--config', path], { encoding: 'utf8', timeout: 10000 });
      assert.equal(validation.status, 0, 'Caddy validation failed; output suppressed');
      return JSON.parse(r.stdout);
    };
    const before = await adapt('original.Caddyfile', current);
    const after = await adapt('candidate.Caddyfile', candidate);
    const normalize = value => {
      const groups = new Map();
      return JSON.parse(JSON.stringify(value, (key, item) => {
        if (key === 'hide' && Array.isArray(item)) return item.filter(path => typeof path !== 'string' || !path.startsWith(directory + '/'));
        if (key === 'group' && typeof item === 'string' && /^group\d+$/.test(item)) {
          if (!groups.has(item)) groups.set(item, `group${groups.size}`);
          return groups.get(item);
        }
        return item;
      }));
    };
    const beforeServers = before.apps.http.servers, afterServers = after.apps.http.servers;
    assert.deepEqual(Object.keys(afterServers), Object.keys(beforeServers));
    let added = 0;
    for (const [name, original] of Object.entries(beforeServers)) {
      const updated = afterServers[name];
      const gatewayRoutes = updated.routes.filter(route => route.match?.[0]?.host?.includes('sam-api.developed162.bid'));
      added += gatewayRoutes.length;
      const remaining = updated.routes.filter(route => !route.match?.[0]?.host?.includes('sam-api.developed162.bid'));
      // Compare all prior server settings and routes, including canonical www/test.
      assert.ok(JSON.stringify(normalize({ ...updated, routes: remaining })) === JSON.stringify(normalize(original)), 'Existing Caddy server/site changed; configuration suppressed');
    }
    assert.equal(added, 1);
    assert.equal(readFileSync('/etc/caddy/Caddyfile', 'utf8'), current, 'Live source drifted during read-only test');
  } finally {
    await rm(directory, { recursive: true, force: true }); // Exact disposable test directory only.
  }
});
