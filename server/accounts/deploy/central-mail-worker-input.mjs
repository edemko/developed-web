import assert from 'node:assert/strict';
import { readFileSync, lstatSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
export const INPUT = '/etc/developed-accounts/mail-worker.json';
export const API_ENV = '/etc/developed-accounts/accounts.env';
export const keys = ['databaseUrl', 'encryptionKey', 'mailjetKey', 'mailjetSecret', 'origin', 'dailyEmailLimit'].sort();
export function parseEnvironment(text, separator = '\n') {
  const values = {};
  for (const line of text.split(separator)) {
    if (!line || separator === '\n' && line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=([^\r\n\0]*)$/.exec(line);
    assert.ok(match && !Object.hasOwn(values, match[1]), 'Invalid environment input'); values[match[1]] = match[2];
  }
  return values;
}
export function validateInput(value) {
  assert.deepEqual(Object.keys(value).sort(), keys, 'Only six mail-worker inputs allowed');
  assert.equal(value.origin, 'https://www.developed.sk');
  assert.ok(Number.isSafeInteger(value.dailyEmailLimit) && value.dailyEmailLimit > 0 && value.dailyEmailLimit <= 200);
  for (const key of ['databaseUrl', 'encryptionKey', 'mailjetKey', 'mailjetSecret'])
    assert.ok(typeof value[key] === 'string' && value[key].length > 0 && !/[\r\n\0]/.test(value[key]));
  const url = new URL(value.databaseUrl);
  assert.equal(url.protocol, 'postgresql:'); assert.equal(url.username, 'developed_accounts'); assert.ok(url.password);
  assert.equal(url.hostname, '172.18.0.12'); assert.equal(url.port, '5432'); assert.equal(url.pathname, '/postgres');
  assert.equal(url.search, ''); assert.equal(url.hash, '');
  const encryption = Buffer.from(value.encryptionKey, 'base64');
  assert.equal(encryption.length, 32); assert.equal(encryption.toString('base64'), value.encryptionKey);
  return value;
}
export function selectInput(env) {
  assert.equal(env.ACCOUNTS_MAIL_ENABLED, 'false', 'API mail must remain explicitly disabled');
  return validateInput({ databaseUrl: env.ACCOUNTS_DATABASE_URL, encryptionKey: env.ACCOUNTS_ENCRYPTION_KEY,
    mailjetKey: env.MAILJET_API_KEY, mailjetSecret: env.MAILJET_SECRET_KEY, origin: env.ACCOUNTS_ORIGIN,
    dailyEmailLimit: Number(env.ACCOUNTS_DAILY_EMAIL_LIMIT || '200') });
}
export function trusted(path) {
  let part = '';
  for (const component of path.split('/').filter(Boolean)) {
    part += '/' + component; const stat = lstatSync(part);
    assert.ok(stat.uid === 0 && !stat.isSymbolicLink() && !(stat.mode & 0o022), 'Untrusted mail-worker path');
  }
}
export function protectedText(path) {
  trusted(path); const stat = lstatSync(path);
  assert.ok(stat.isFile() && stat.nlink === 1 && (stat.mode & 0o777) === 0o600);
  return readFileSync(path, 'utf8');
}
async function assemble() {
  assert.equal(process.getuid(), 0); assert.deepEqual(process.argv.slice(2), ['--apply']); trusted(new URL(import.meta.url).pathname);
  const input = selectInput(parseEnvironment(protectedText(API_ENV)));
  const { checkCentral } = await import('./central-mail-worker-guard.mjs'); await checkCentral(input);
  writeProtectedInput(INPUT, input);
  assert.deepEqual(JSON.parse(protectedText(INPUT)), input);
  console.log('Six protected mail-worker inputs assembled; no service started or mail sent.');
}
export function writeProtectedInput(path, input) {
  validateInput(input);
  const parent = dirname(path), stat = lstatSync(parent);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700);
  const file = openSync(path, 'wx', 0o600);
  try { writeFileSync(file, JSON.stringify(input)); fsyncSync(file); } finally { closeSync(file); }
  const dir = openSync(parent, 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
  const saved = lstatSync(path); assert.ok(saved.isFile() && !saved.isSymbolicLink() && saved.nlink === 1
    && saved.uid === process.getuid() && (saved.mode & 0o777) === 0o600);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), input);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) assemble().catch(() => {
  console.error('Mail-worker input assembly refused; inspect privately. No automatic overwrite or retry.'); process.exitCode = 1;
});
