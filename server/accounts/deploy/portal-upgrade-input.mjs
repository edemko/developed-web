// Pure, non-applying upgrade helpers. See portal-upgrade.md for phase ordering.
// Never print environment text or include it in exception diagnostics.
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { sourceHash } from './browser-session-broker-routes.mjs';

export const MARKETING_FILES = ['index.html', 'en/index.html', 'styles.css', 'script.js'];
export const OLD_MARKETING = '/opt/developed-accounts/marketing/initial-20260920';
export const OLD_RELEASE = '/opt/developed-accounts/releases/c561a81';
export const OLD_PIDS = { api: 3197193, mail: 700440, caddy: 862 };
export const WORKER_FILES = ['central-mail-worker.mjs', 'central-mail-worker-input.mjs', 'central-mail-worker-guard.mjs'];
const NODE = '/opt/developed-runtimes/node-v22.23.2/bin/node';
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function requireKeys(value, expected, message) {
  assert.ok(object(value) && Object.keys(value).sort().join('\0') === [...expected].sort().join('\0'), message);
}

export function pathsForRevision(revision) {
  assert.ok(typeof revision === 'string' && /^[a-f0-9]{40}$/.test(revision), 'Exact reviewed 40-character revision required');
  return {
    release: `/opt/developed-accounts/releases/${revision}`,
    marketing: `/opt/developed-accounts/marketing/${revision}`,
    mailBundle: `/opt/developed-accounts/mail-workers/${revision}`,
  };
}

// Hashes describe reviewed staged bytes, not a claim that source tests suffice.
// Complete artifact manifests are coordinator-created/root-protected evidence;
// the application manifest covers all files, including production dependencies.
export function validateManifest(input) {
  requireKeys(input, ['version', 'revision', 'sourceCaddySha256', 'applicationManifestSha256', 'mailBundleManifestSha256', 'marketingSha256'], 'Invalid upgrade manifest fields');
  assert.equal(input.version, 1, 'Unsupported upgrade manifest version');
  const paths = pathsForRevision(input.revision);
  assert.ok(input.sourceCaddySha256 === sourceHash, 'Wrong Caddy baseline');
  assert.ok(digest(input.applicationManifestSha256) && digest(input.mailBundleManifestSha256), 'Invalid immutable-artifact digest');
  requireKeys(input.marketingSha256, MARKETING_FILES, 'Exactly four marketing files required');
  assert.ok(Object.values(input.marketingSha256).every(digest), 'Invalid marketing artifact digest');
  return paths;
}

export function readProtectedManifest(path) {
  assert.ok(typeof path === 'string' && path.startsWith('/var/backups/developed-portal-upgrade-')
    && /^\/var\/backups\/developed-portal-upgrade-[a-z0-9-]+\/manifest\.json$/.test(path), 'Unexpected manifest evidence location');
  let current = '';
  for (const component of path.split('/').filter(Boolean)) {
    current += '/' + component;
    const stat = lstatSync(current);
    assert.ok(stat.uid === 0 && !(stat.mode & 0o022) && !stat.isSymbolicLink(), 'Untrusted manifest path');
  }
  const file = lstatSync(path), directory = lstatSync(path.slice(0, path.lastIndexOf('/')));
  assert.ok(file.isFile() && file.nlink === 1 && (file.mode & 0o777) === 0o600, 'Manifest must be root-owned0600');
  assert.ok(directory.isDirectory() && (directory.mode & 0o777) === 0o700, 'Evidence directory must be root-owned0700');
  const input = JSON.parse(readFileSync(path, 'utf8')); validateManifest(input); return input;
}

export function rewriteMarketingEnvironment(source, revision) {
  assert.ok(typeof source === 'string' && !source.includes('\r') && !source.includes('\0'), 'Unexpected environment format');
  // Do not permit duplicate settings or a silent first-wins/last-wins parser.
  const marketing = source.match(/^ACCOUNTS_MARKETING_DIR=.*$/gm);
  const mail = source.match(/^ACCOUNTS_MAIL_ENABLED=.*$/gm);
  assert.ok(marketing?.length === 1 && marketing[0] === `ACCOUNTS_MARKETING_DIR=${OLD_MARKETING}`, 'Marketing environment baseline changed');
  assert.ok(mail?.length === 1 && mail[0] === 'ACCOUNTS_MAIL_ENABLED=false', 'API mail must remain disabled');
  const nextLine = `ACCOUNTS_MARKETING_DIR=${pathsForRevision(revision).marketing}`;
  const candidate = source.replace(marketing[0], nextLine);
  assert.ok(candidate.replace(nextLine, marketing[0]) === source, 'Unrelated environment bytes changed');
  return candidate;
}

export function mailWorkerDropIn(revision) {
  const { mailBundle } = pathsForRevision(revision);
  // Apply only after verifying the current worker has exactly its one reviewed
  // ExecStartPre and ExecStart. Otherwise clearing lists could remove a new guard.
  return `[Service]\nExecStartPre=\nExecStartPre=+${NODE} ${mailBundle}/central-mail-worker-guard.mjs\nExecStart=\nExecStart=${NODE} ${mailBundle}/central-mail-worker.mjs\n`;
}
