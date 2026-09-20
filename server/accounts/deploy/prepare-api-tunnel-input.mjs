// Protected credential assembly after the reviewed product routes are applied.
// The caller may preserve only CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, fchmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateInput } from './switch-api-tunnel.mjs';
const destination = '/etc/developed-accounts/api-tunnel-input.json';
const proofPath = '/var/backups/developed-product-routes-20260920/verified.json';
export const expectedConfigSha256 = '01b8dd6febbcda7bbebef5165002f924e1f7b97ca116873746a79d8eee9c09a1';
function trusted(path, privateFile = false) {
  let part = '';
  for (const item of path.split('/').filter(Boolean)) {
    part += '/' + item; const s = lstatSync(part);
    assert.ok(!s.isSymbolicLink() && s.uid === 0 && !(s.mode & 0o022), 'Unsafe protected path');
  }
  if (privateFile) { const s = lstatSync(path); assert.ok(s.isFile() && s.nlink === 1 && (s.mode & 0o777) === 0o600); }
}
export function assemble(execStart, env, expectedCaddySha256) {
  const match = execStart.match(/--token\s+([A-Za-z0-9+/=_-]+)/); assert.ok(match);
  const connector = JSON.parse(Buffer.from(match[1], 'base64').toString());
  assert.equal(connector.a, env.CLOUDFLARE_ACCOUNT_ID, 'Connector account mismatch');
  const input = { accountId: env.CLOUDFLARE_ACCOUNT_ID, tunnelId: connector.t,
    apiToken: env.CLOUDFLARE_API_TOKEN, expectedVersion: 1,
    expectedConfigSha256, expectedCaddySha256 };
  validateInput(input); return input;
}
export function execute() {
  assert.equal(process.getuid(), 0, 'Root required'); trusted(new URL(import.meta.url).pathname);
  trusted('/etc/developed-accounts'); trusted(proofPath, true); trusted('/etc/caddy/Caddyfile');
  const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
  assert.equal(proof.humanSsoEnabled, false);
  assert.equal(createHash('sha256').update(readFileSync('/etc/caddy/Caddyfile')).digest('hex'), proof.candidateSha256, 'Final product routes not selected');
  const unit = spawnSync('/usr/bin/systemctl', ['show', 'cloudflared.service', '-p', 'ExecStart', '--value'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(unit.status, 0);
  const input = assemble(unit.stdout, process.env, proof.candidateSha256);
  const fd = openSync(destination, 'wx', 0o600);
  try { fchmodSync(fd, 0o600); writeFileSync(fd, JSON.stringify(input) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  trusted(destination, true); assert.deepEqual(JSON.parse(readFileSync(destination, 'utf8')), input);
  const dir = openSync('/etc/developed-accounts', 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
  return { prepared: true, rootOnly: true, remoteChanged: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assert.equal(process.argv.length, 3); assert.equal(process.argv[2], '--prepare'); console.log(JSON.stringify(execute())); }
  catch { console.error('Protected tunnel input preparation refused; details suppressed.'); process.exitCode = 1; }
}
