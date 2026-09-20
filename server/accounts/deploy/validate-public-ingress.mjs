// Read-only validator: private temporary candidate only; never reloads Caddy.
// Exact current host block is a deliberate guard against adapting a stale layout.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

if (process.argv.length !== 3 || process.argv[2] !== '--validate-current') {
  process.stderr.write('Usage: node validate-public-ingress.mjs --validate-current\n');
  process.exitCode = 2;
} else {
  let directory;
  try {
    const currentPath = '/etc/caddy/Caddyfile';
    const current = await readFile(currentPath, 'utf8');
    assert.ok(!/^\s*import\s/m.test(current), 'Review existing imports before relocating the source');
    const hostLine = 'http://www.developed.sk, http://test.developed.sk {';
    assert.equal(current.split(hostLine).length, 2, 'Expected exact single canonical/test site');
    assert.ok(!current.includes('sam-api.developed162.bid'), 'Supabase site already exists; review merge');
    directory = await mkdtemp(join(tmpdir(), 'developed-ingress-validation-'));
    for (const name of ['public-supabase-site.Caddyfile', 'public-data-routes.Caddyfile', 'portal-canonical-routes.Caddyfile', 'portal-routes.Caddyfile']) {
      await writeFile(join(directory, name), await readFile(new URL(name, import.meta.url)), { mode: 0o600 });
    }
    const merged = current.replace(hostLine, hostLine + '\n import portal-canonical-routes.Caddyfile')
      + '\nimport public-supabase-site.Caddyfile\n';
    const originalPath = join(directory, 'original.Caddyfile'), mergedPath = join(directory, 'candidate.Caddyfile');
    await writeFile(originalPath, current, { mode: 0o600 });
    await writeFile(mergedPath, merged, { mode: 0o600 });
    const adapt = file => {
      const result = spawnSync('caddy', ['adapt', '--adapter', 'caddyfile', '--config', file], { encoding: 'utf8' });
      assert.equal(result.status, 0, 'Caddy adaptation failed; inspect privately, never dump config');
      return JSON.parse(result.stdout);
    };
    const before = adapt(originalPath), after = adapt(mergedPath);
    const servers = obj => obj.apps.http.servers;
    // Caddy renumbers generated mutually-exclusive handler groups globally when
    // adding handles. Compare their within-site relationships, not serial names.
    const normalizeGroups = route => {
      const groups = new Map();
      return JSON.parse(JSON.stringify(route, (key, value) => {
        // file_server automatically hides each source/import filename. The
        // private candidate introduces additional temp filenames to hide.
        if (key === 'hide' && Array.isArray(value)) return value.filter(item => typeof item !== 'string' || !item.startsWith(directory + '/'));
        if (key !== 'group' || typeof value !== 'string' || !/^group\d+$/.test(value)) return value;
        if (!groups.has(value)) groups.set(value, `group${groups.size}`);
        return groups.get(value);
      }));
    };
    const differencePath = (a, b, path = '') => {
      if (JSON.stringify(a) === JSON.stringify(b)) return '';
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return path;
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const found = differencePath(a[key], b[key], `${path}/${key}`);
        if (found) return found;
      }
      return path;
    };
    assert.deepEqual(Object.keys(servers(after)), Object.keys(servers(before)), 'No additional HTTP server');
    let addedSites = 0, unchangedSites = 0;
    for (const key of Object.keys(servers(before))) {
      const previous = servers(before)[key], candidate = servers(after)[key];
      assert.deepEqual(candidate.listen, previous.listen, 'No listener change');
      const hosts = route => JSON.stringify(route.match?.[0]?.host || []);
      const originalRoutes = new Map(previous.routes.map(route => [hosts(route), route]));
      for (const route of candidate.routes) {
        const names = route.match?.[0]?.host || [];
        if (names.includes('sam-api.developed162.bid')) { addedSites++; continue; }
        if (names.includes('www.developed.sk')) continue;
        const normalized = normalizeGroups(route), prior = normalizeGroups(originalRoutes.get(hosts(route)));
        assert.deepEqual(normalized, prior, `Unrelated site changed (${names.join(',') || 'fallback'}, field ${differencePath(normalized, prior)})`);
        unchangedSites++;
      }
      assert.equal(candidate.routes.length, previous.routes.length + 1, 'Exactly one added site');
    }
    assert.equal(addedSites, 1);
    const check = spawnSync('caddy', ['validate', '--adapter', 'caddyfile', '--config', mergedPath], { encoding: 'utf8' });
    assert.equal(check.status, 0, 'Caddy validation failed; inspect privately, never dump config');
    assert.equal(await readFile(currentPath, 'utf8'), current, 'Live source changed while validating');
    console.log(JSON.stringify({ validated: true, originalSha256: createHash('sha256').update(current).digest('hex'), addedSites, unchangedSites, listenerChanged: false, canonicalPortalOnly: true, reloaded: false }));
  } catch (error) {
    // Never print Caddy stdout/stderr, parsed configuration or environment.
    console.error(error.message?.split('\n')[0] || 'Candidate validation failed');
    process.exitCode = 1;
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }); // Exact private temporary directory created above.
  }
}
