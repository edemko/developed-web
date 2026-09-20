// Immutable public artifacts only. Never changes a serving root or proxy route.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, lstatSync, readFileSync, mkdirSync, openSync, writeFileSync, closeSync, fsyncSync, fchmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const targets = [
  { slug: 'kestrek', source: '/home/openclaw/kestrek-central-build-cQnJvz/frontend/dist/kestrek-frontend',
    old: '/var/www/kestrek.sk', count: 95, hash: '71995697e98755484440c11e84917fc46bf0ef1ded172c0b1315ae86a9cbf323',
    destination: '/opt/developed-static/releases/kestrek-central-09236ab' },
  { slug: 'otazkomat', source: '/opt/developed-apps/otazkomat/releases/7393f6b095f0/web',
    old: '/var/www/educatio.sk', count: 4, hash: '58f012ddca3413df863d21bebac5b275439f468137de37ec24fbad9febe83aa9',
    destination: '/opt/developed-static/releases/otazkomat-central-7393f6b' },
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function readTree(root) {
  const rows = [];
  function visit(relative) {
    const path = join(root, relative), stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), 'Artifact symlink rejected');
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) { assert.ok(!name.startsWith('.'), 'Hidden artifact rejected'); visit(join(relative, name)); }
    } else {
      assert.ok(stat.isFile() && stat.size < 5_000_000, 'Unexpected public artifact');
      assert.match(relative, /\.(?:html|js|css|json|txt|svg|png|ico|webp|jpg|jpeg|woff2?|ttf)$/i);
      rows.push([relative, sha(readFileSync(path))]);
    }
  }
  visit(''); rows.sort((a, b) => a[0].localeCompare(b[0], 'en'));
  assert.ok(rows.length < 1000, 'Unexpected file count');
  return rows;
}
export const treeHash = rows => sha(JSON.stringify(rows));
export function retainedAsset(path) {
  return /^(?:(?:chunk|main|polyfills|styles)-[A-Z0-9]+\.(?:js|css)|assets\/[^.][^\0]*\.(?:js|css|svg|png|ico|webp|jpg|jpeg|woff2?|ttf))$/.test(path)
    && !path.split('/').some(part => part === '..' || part.startsWith('.'));
}
function trustedDirectory(path) {
  let prefix = '';
  for (const part of path.split('/').filter(Boolean)) {
    prefix += '/' + part; const stat = lstatSync(prefix);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0 && !(stat.mode & 0o022), 'Untrusted destination ancestor');
  }
}
function syncDirectory(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function ensureDirectory(path) {
  try { trustedDirectory(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    ensureDirectory(dirname(path)); mkdirSync(path, { mode: 0o755 }); trustedDirectory(path); syncDirectory(dirname(path));
  }
}
function writeExclusive(path, bytes) {
  ensureDirectory(dirname(path)); const fd = openSync(path, 'wx', 0o644);
  try { fchmodSync(fd, 0o644); writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  syncDirectory(dirname(path));
}
export function execute() {
  assert.equal(process.getuid(), 0, 'Root required');
  // Inspect BOTH inputs before creating any output. Existing targets never overwrite.
  const plans = targets.map(target => {
    const fresh = readTree(target.source), old = readTree(target.old);
    assert.equal(fresh.length, target.count); assert.equal(treeHash(fresh), target.hash, 'Qualified artifact changed');
    try { lstatSync(target.destination); throw Error('Destination already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const selected = new Map(fresh.map(([path, hash]) => [path, { hash, source: target.source }]));
    for (const [path, hash] of old) if (retainedAsset(path)) {
      const present = selected.get(path);
      // Identical hashed filename must mean identical bytes; never overwrite a collision.
      if (present && /(?:^|\/)[^/]+-[A-Za-z0-9_-]+\.(?:js|css)$/.test(path)) assert.equal(present.hash, hash, 'Hashed asset collision');
      if (!present) selected.set(path, { hash, source: target.old });
    }
    return { target, fresh, old, selected };
  });
  for (const { target, fresh, old, selected } of plans) {
    ensureDirectory(dirname(target.destination)); mkdirSync(target.destination, { mode: 0o755 });
    for (const [path, entry] of selected) {
      const bytes = readFileSync(join(entry.source, path)); assert.equal(sha(bytes), entry.hash, 'Input changed during staging');
      writeExclusive(join(target.destination, path), bytes);
    }
    assert.deepEqual(readTree(target.source), fresh, 'Qualified source drift');
    assert.deepEqual(readTree(target.old), old, 'Serving source drift');
    const output = readTree(target.destination);
    assert.deepEqual(output, [...selected].map(([path, entry]) => [path, entry.hash]).sort((a, b) => a[0].localeCompare(b[0], 'en')));
    syncDirectory(target.destination); syncDirectory(dirname(target.destination));
    console.log(JSON.stringify({ slug: target.slug, destination: target.destination, files: output.length,
      qualifiedTreeSha256: target.hash, oldTreeSha256: treeHash(old), outputTreeSha256: treeHash(output), servingChanged: false }));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assert.equal(process.argv[2], '--stage'); assert.equal(process.argv.length, 3); execute(); }
  catch { console.error('Frontend staging failed; inspect exact partial outputs before continuing.'); process.exitCode = 1; }
}
