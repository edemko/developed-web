import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, chmod, lstat, symlink, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { audience, issuer, roles, validateSigningConfig, validateRequest, signScopedKey, run } from '../operators/issue-scoped-data-key.mjs';

const command = promisify(execFile);
const script = fileURLToPath(new URL('../operators/issue-scoped-data-key.mjs', import.meta.url));
const secret = 'offline-test-only-signing-material-0123456789';
const config = () => ({ version: 1, algorithm: 'HS256', issuer, audience, jwtSecret: secret });
const now = Date.parse('2026-09-20T12:00:00Z');
const expiry = () => new Date(Date.now() + 3600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'scoped-key-operator-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = join(directory, 'signing.json'), output = join(directory, 'role-key.json');
  await writeFile(configPath, JSON.stringify(config()), { mode: 0o600 });
  return { directory, configPath, output,
    args: ['--config', configPath, '--role', 'kestrek_backend', '--expires-at', expiry(), '--output', output] };
}

test('all and only the five approved data roles produce valid fixed-issuer HS256 credentials', async () => {
  const key = await webcrypto.subtle.importKey('raw', Buffer.from(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  for (const role of roles) {
    const result = signScopedKey(config(), { role, expiresAt: '2026-09-20T13:00:00Z' }, now);
    const [header, payload, signature] = result.token.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'HS256', typ: 'JWT' });
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(claims.role, role); assert.equal(claims.iss, issuer); assert.equal(claims.aud, audience);
    assert.equal(claims.exp - claims.iat, 3600); assert.equal(claims.nbf, claims.iat - 30);
    assert.match(claims.jti, /^[a-f0-9-]{36}$/);
    assert.equal(await webcrypto.subtle.verify('HMAC', key, Buffer.from(signature, 'base64url'), Buffer.from(`${header}.${payload}`)), true);
    assert.equal(await webcrypto.subtle.verify('HMAC', key, Buffer.from(signature, 'base64url'), Buffer.from(`${header}.${payload}changed`)), false);
    assert.equal(Object.hasOwn(claims, 'sub'), false); assert.equal(Object.hasOwn(claims, 'client_id'), false);
  }
  for (const role of ['service_role', 'postgres', 'anon', 'authenticated', 'odonto_identity_web', 'kestrek_backend ', '', null]) {
    assert.throws(() => signScopedKey(config(), { role, expiresAt: '2026-09-20T13:00:00Z' }, now));
  }
});

test('expiry is explicit, real UTC, future and at most 90 days', () => {
  for (const expiresAt of [undefined, '2026-09-20', '2026-09-20T13:00:00+00:00', '2026-02-30T13:00:00Z',
    '2026-09-20T12:04:59Z', '2026-09-20T11:00:00Z', '2027-01-01T00:00:00Z']) {
    assert.throws(() => validateRequest({ role: 'kestrek_backend', expiresAt }, now));
  }
  assert.equal(validateRequest({ role: 'kestrek_backend', expiresAt: '2026-09-20T12:05:00Z' }, now).exp, now / 1000 + 300);
});

test('config rejects algorithm, issuer, audience, version, secret and unknown-field substitutions', () => {
  for (const patch of [{ algorithm: 'none' }, { algorithm: 'ES256' }, { issuer: 'https://attacker.invalid' },
    { audience: 'service_role' }, { version: 2 }, { jwtSecret: 'short' }, { jwtSecret: secret + '\n' },
    { extra: true }, { jwtSecret: null }]) assert.throws(() => validateSigningConfig({ ...config(), ...patch }));
});

test('default CLI validates without issuing or printing any credential; write is explicit and mode0600', async t => {
  const f = await fixture(t);
  const dry = await command(process.execPath, [script, ...f.args]);
  assert.match(dry.stdout, /dry run/); assert.equal(dry.stderr, '');
  await assert.rejects(lstat(f.output), { code: 'ENOENT' });
  const written = await command(process.execPath, [script, ...f.args, '--write']);
  const result = JSON.parse(await readFile(f.output, 'utf8'));
  assert.equal((await lstat(f.output)).mode & 0o777, 0o600);
  assert.match(written.stdout, /Issued kestrek_backend/); assert.equal(written.stderr, '');
  for (const value of [secret, result.token]) {
    assert.equal(dry.stdout.includes(value), false); assert.equal(written.stdout.includes(value), false);
  }
  await assert.rejects(run([...f.args, '--write']));
  assert.equal(JSON.parse(await readFile(f.output, 'utf8')).token, result.token);
});

test('unsafe config permissions, symlink and hardlink are rejected', async t => {
  const f = await fixture(t);
  await chmod(f.configPath, 0o644); await assert.rejects(run(f.args));
  await chmod(f.configPath, 0o600);
  const linked = join(f.directory, 'linked.json'); await symlink(f.configPath, linked);
  const linkedArgs = [...f.args]; linkedArgs[1] = linked; await assert.rejects(run(linkedArgs));
  await link(f.configPath, join(f.directory, 'hardlinked.json')); await assert.rejects(run(f.args));
});

test('output cannot overwrite, follow a symlink or use a symlinked directory', async t => {
  const f = await fixture(t);
  await symlink(f.configPath, f.output); await assert.rejects(run([...f.args, '--write']));
  const target = join(f.directory, 'private'); await mkdir(target, { mode: 0o700 });
  const alias = join(f.directory, 'alias'); await symlink(target, alias);
  const args = [...f.args]; args[args.length - 1] = join(alias, 'new.json');
  await assert.rejects(run([...args, '--write']));
  assert.equal((await readFile(f.configPath, 'utf8')).includes(secret), true);
});

test('Git repository/worktree and public/writable containing directories are rejected', async t => {
  const f = await fixture(t);
  const args = [...f.args];
  const repo = join(f.directory, 'repository'); await mkdir(repo, { mode: 0o700 });
  await writeFile(join(repo, '.git'), 'gitdir: /unused\n');
  args[args.length - 1] = join(repo, 'credential.json'); await assert.rejects(run(args));
  const publicDir = join(f.directory, 'public'); await mkdir(publicDir, { mode: 0o755 });
  args[args.length - 1] = join(publicDir, 'credential.json'); await assert.rejects(run(args));
  await chmod(publicDir, 0o777); await assert.rejects(run(args));
});

test('malformed, duplicate, unknown and secret-bearing CLI options fail without echo', async t => {
  const f = await fixture(t);
  for (const extra of [['--write', '--write'], ['--role', 'service_role'], ['--jwt-secret', secret], ['--unknown']]) {
    await assert.rejects(command(process.execPath, [script, ...f.args, ...extra]), error => {
      assert.equal(error.code, 1); assert.equal(error.stdout, '');
      assert.equal(error.stderr.includes(secret), false); assert.match(error.stderr, /no credentials printed/); return true;
    });
  }
  const relative = [...f.args]; relative[1] = 'relative.json'; await assert.rejects(run(relative));
  const same = [...f.args]; same[same.length - 1] = f.configPath; await assert.rejects(run(same));
});

test('rotation requires a new file and issues a distinct jti without changing signing config', async t => {
  const f = await fixture(t), before = await readFile(f.configPath, 'utf8');
  await run([...f.args, '--write']);
  const args = [...f.args]; args[args.length - 1] = join(f.directory, 'next-key.json');
  await run([...args, '--write']);
  const a = JSON.parse(await readFile(f.output, 'utf8'));
  const b = JSON.parse(await readFile(args.at(-1), 'utf8'));
  assert.notEqual(a.token, b.token); assert.equal(await readFile(f.configPath, 'utf8'), before);
});
