// Six new nonsecret unit drop-ins; no environment rewrite, restart or enablement.
import assert from 'node:assert/strict';
import { lstatSync, readFileSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, fchmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
export const targets = [
  ['mega-music', 'mega-music-accounts-isolated@.service'],
  ['screentime', 'developed-screentime@.service'],
  ['kestrek', 'developed-kestrek@.service'],
  ['otazkomat', 'developed-otazkomat@.service'],
  ['airsoft', 'developed-airsoft-green.service'],
  ['vocabulum', 'developed-vocabulum-green.service'],
];
export const guard = '/opt/developed-control/central-runtime-v1/assert-central-runtime.mjs';
export function contents(slug) {
  assert.ok(targets.some(([name]) => name === slug));
  return `[Service]\nEnvironmentFile=\nEnvironmentFile=/etc/developed-accounts/host-env-staging/${slug}.central.env\nExecStartPre=/opt/developed-runtimes/node-v22.23.2/bin/node ${guard} ${slug}\n`;
}
function trusted(path) {
  let prefix = '';
  for (const part of path.split('/').filter(Boolean)) {
    prefix += '/' + part; const stat = lstatSync(prefix);
    assert.ok(!stat.isSymbolicLink() && stat.uid === 0 && !(stat.mode & 0o022), 'Unsafe deployment path');
  }
}
function absent(path) { try { lstatSync(path); throw Error('Target exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
function sync(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
export function execute() {
  assert.equal(process.getuid(), 0, 'Root required'); trusted(new URL(import.meta.url).pathname); trusted(guard);
  assert.equal(readFileSync(guard, 'utf8'), readFileSync(new URL('./assert-central-runtime.mjs', import.meta.url), 'utf8'), 'Guard differs from reviewed bundle');
  trusted('/etc/systemd/system');
  for (const [slug, unit] of targets) {
    trusted('/etc/systemd/system/' + unit);
    const env = `/etc/developed-accounts/host-env-staging/${slug}.central.env`; trusted(env);
    assert.equal(lstatSync(env).mode & 0o777, 0o600, 'Unsafe runtime configuration');
    const directory = '/etc/systemd/system/' + unit + '.d';
    try { trusted(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    absent(directory + '/central-production.conf');
  }
  const results = [];
  for (const [slug, unit] of targets) {
    const directory = '/etc/systemd/system/' + unit + '.d';
    try { mkdirSync(directory, { mode: 0o755 }); sync(dirname(directory)); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    trusted(directory); const body = contents(slug), fd = openSync(directory + '/central-production.conf', 'wx', 0o644);
    try { fchmodSync(fd, 0o644); writeFileSync(fd, body); fsyncSync(fd); } finally { closeSync(fd); } sync(directory);
    results.push({ unit, sha256: createHash('sha256').update(body).digest('hex') });
  }
  assert.equal(spawnSync('/usr/bin/systemctl', ['daemon-reload'], { encoding: 'utf8', timeout: 15000 }).status, 0, 'Definition reload failed');
  return { installed: results, servicesRestarted: false, environmentFilesChanged: false, bootEnablementChanged: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assert.equal(process.argv.length, 3); assert.equal(process.argv[2], '--install'); console.log(JSON.stringify(execute())); }
  catch { console.error('Runtime guard installation failed; inspect partial drop-ins before retry.'); process.exitCode = 1; }
}
