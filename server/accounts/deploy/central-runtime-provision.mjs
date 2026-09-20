// Explicit one-time root operator. Does not start services, publish routes,
// register clients, change grants or send mail. Never print child diagnostics.
import { randomBytes, pbkdf2Sync, createHmac, createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const environmentPath = '/etc/developed-accounts/accounts.env';
export const backupPath = '/var/backups/developed-accounts-keys/initial-20260920.key';
const sourcePath = '/home/openclaw/.config/mega-music/accounts.env';
const fail = () => { throw new Error('Central provisioning precondition failed'); };
function requireTrue(value) { if (!value) fail(); }
export function parseEnvironment(source) {
  const env = {};
  for (const line of source.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=([^\r\n\0]*)$/.exec(line);
    requireTrue(match && !Object.hasOwn(env, match[1]));
    env[match[1]] = match[2];
  }
  return env;
}
export function scramVerifier(password, salt = randomBytes(16)) {
  requireTrue(/^[A-Za-z0-9_-]{43}$/.test(password) && salt.length === 16);
  const salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
  const client = createHmac('sha256', salted).update('Client Key').digest();
  const stored = createHash('sha256').update(client).digest('base64');
  const server = createHmac('sha256', salted).update('Server Key').digest('base64');
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`;
}
export function provisioningSql(verifier) {
  requireTrue(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/.test(verifier));
  return `BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='5s';
SET LOCAL log_statement='none';
SET LOCAL log_min_duration_statement=-1;
SET LOCAL log_min_error_statement='panic';
DO $guard$ BEGIN
  IF session_user<>'supabase_admin' OR current_database()<>'postgres'
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
    THEN RAISE EXCEPTION 'Trusted operator required'; END IF;
  IF NOT pg_try_advisory_xact_lock(194812,20260920)
    THEN RAISE EXCEPTION 'Central operator busy'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_authid WHERE rolname='developed_accounts'
    AND NOT rolcanlogin AND rolpassword IS NULL AND NOT rolsuper AND NOT rolbypassrls
    AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolinherit)
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member='developed_accounts'::regrole)
    THEN RAISE EXCEPTION 'Unexpected central role'; END IF;
  IF (SELECT count(*) FROM accounts.deployment_migrations)<>3
    OR NOT EXISTS(SELECT 1 FROM accounts.settings WHERE registration_mode='closed')
    OR EXISTS(SELECT 1 FROM accounts.app_settings WHERE published OR enforce_oidc)
    OR EXISTS(SELECT 1 FROM accounts.sessions) OR EXISTS(SELECT 1 FROM accounts.outbox)
    THEN RAISE EXCEPTION 'Unexpected staging state'; END IF;
END $guard$;
ALTER ROLE developed_accounts LOGIN PASSWORD '${verifier}';
COMMIT;
`;
}
function directory(path, mode) {
  const st = lstatSync(path);
  requireTrue(st.isDirectory() && st.uid === 0 && (st.mode & 0o777) === mode);
}
export async function provision(args) {
  requireTrue(process.getuid?.() === 0 && args.length === 1 && args[0] === '--apply');
  directory('/etc', 0o755); directory('/etc/developed-accounts', 0o700);
  directory('/var', 0o755); directory('/var/backups', 0o755);
  requireTrue(!existsSync(environmentPath) && !existsSync(backupPath));
  const sourceStat = lstatSync(sourcePath);
  requireTrue(sourceStat.isFile() && sourceStat.uid === 1000 && (sourceStat.mode & 0o777) === 0o600);
  const source = parseEnvironment(readFileSync(sourcePath, 'utf8'));
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY','MAILJET_API_KEY','MAILJET_SECRET_KEY'])
    requireTrue(source[key] && /^[A-Za-z0-9._-]+$/.test(source[key]));
  // The existing credential must work against the retained private provider.
  // Status only: don't read or print identity/credential response bodies.
  const response = await fetch('http://127.0.0.1:3141/admin/users?page=1&per_page=1', {
    headers: { Authorization: `Bearer ${source.SUPABASE_SERVICE_ROLE_KEY}`, apikey: source.SUPABASE_SERVICE_ROLE_KEY },
    signal: AbortSignal.timeout(5000), redirect: 'error',
  });
  await response.body?.cancel(); requireTrue(response.status === 200);
  const password = randomBytes(32).toString('base64url'), encryptionKey = randomBytes(32).toString('base64');
  const values = {
    ACCOUNTS_ORIGIN: 'https://www.developed.sk', ACCOUNTS_PORT: '3140', ACCOUNTS_INSECURE_LOCAL: 'false',
    ACCOUNTS_MARKETING_DIR: '/opt/developed-accounts/marketing/initial-20260920',
    ACCOUNTS_PROVIDER_URL: 'http://127.0.0.1:3141', ACCOUNTS_PROVIDER_ADMIN_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    ACCOUNTS_DATABASE_URL: `postgresql://developed_accounts:${password}@172.18.0.12:5432/postgres`,
    ACCOUNTS_ENCRYPTION_KEY: encryptionKey, ACCOUNTS_MAIL_ENABLED: 'false',
    MAILJET_API_KEY: source.MAILJET_API_KEY, MAILJET_SECRET_KEY: source.MAILJET_SECRET_KEY,
    ACCOUNTS_DAILY_EMAIL_LIMIT: '200', ACCOUNTS_HOURLY_REGISTRATION_LIMIT: '20',
  };
  directory(values.ACCOUNTS_MARKETING_DIR, 0o755);
  for (const path of ['index.html', 'en/index.html']) {
    const st = lstatSync(`${values.ACCOUNTS_MARKETING_DIR}/${path}`);
    requireTrue(st.isFile() && st.uid === 0 && (st.mode & 0o022) === 0);
  }
  if (!existsSync('/var/backups/developed-accounts-keys')) mkdirSync('/var/backups/developed-accounts-keys', { mode: 0o700 });
  directory('/var/backups/developed-accounts-keys', 0o700);
  // Persist recoverable material before DB mutation. Exclusive create prevents
  // accidental rotation. Any failure leaves files for private reconciliation.
  writeFileSync(backupPath, `${encryptionKey}\n`, { mode: 0o600, flag: 'wx' });
  writeFileSync(environmentPath, Object.entries(values).map(([key,value]) => `${key}=${value}\n`).join(''), { mode: 0o600, flag: 'wx' });
  execFileSync('docker', ['exec','-i','supabase-db','psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-q'], {
    input: provisioningSql(scramVerifier(password)), encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 15000,
  });
  return 'Central LOGIN provisioned; grants unchanged. Private environment and independent key backup saved; service not started.';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  provision(process.argv.slice(2)).then(message => process.stdout.write(`${message}\n`))
    .catch(() => { process.stderr.write('Central provisioning stopped; diagnostics withheld. Inspect exact protected files and role state before retrying.\n'); process.exitCode = 1; });
}
