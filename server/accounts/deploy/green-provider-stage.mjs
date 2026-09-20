#!/usr/bin/env node
// Explicit operator-only preparation. This program NEVER starts a container.
import { execFileSync } from 'node:child_process';
import { mkdirSync, lstatSync, writeFileSync } from 'node:fs';

export const image = 'sha256:385184459f57569c54c25209f51f3b2be99ddd7c4ce9e3555b5d3eea8447b7cf';
export const network = 'developed-auth-green';
export const container = 'developed-auth-green';
export const subnet = '172.30.241.0/28';
export const address = '172.30.241.2';
export const databaseAddress = '172.30.241.3';
export const envPath = '/etc/developed-accounts/green-provider.env';
const directory = '/etc/developed-accounts';
const allowed = new Set(`API_EXTERNAL_URL GOTRUE_API_HOST GOTRUE_API_PORT
GOTRUE_DB_DATABASE_URL GOTRUE_DB_DRIVER GOTRUE_DB_MIGRATIONS_PATH
GOTRUE_DISABLE_SIGNUP GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED
GOTRUE_EXTERNAL_EMAIL_ENABLED GOTRUE_EXTERNAL_PHONE_ENABLED GOTRUE_JWT_ADMIN_ROLES
GOTRUE_JWT_AUD GOTRUE_JWT_DEFAULT_GROUP_NAME GOTRUE_JWT_EXP GOTRUE_JWT_ISSUER
GOTRUE_JWT_KEYS GOTRUE_JWT_SECRET GOTRUE_MAILER_AUTOCONFIRM
GOTRUE_MAILER_URLPATHS_CONFIRMATION GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE
GOTRUE_MAILER_URLPATHS_INVITE GOTRUE_MAILER_URLPATHS_RECOVERY GOTRUE_SITE_URL
GOTRUE_SMS_AUTOCONFIRM GOTRUE_SMTP_ADMIN_EMAIL GOTRUE_SMTP_HOST GOTRUE_SMTP_PASS
GOTRUE_SMTP_PORT GOTRUE_SMTP_SENDER_NAME GOTRUE_SMTP_USER GOTRUE_URI_ALLOW_LIST PATH`.split(/\s+/));
export const overrides = {
  GOTRUE_OAUTH_SERVER_ENABLED: 'true',
  GOTRUE_OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION: 'false',
  GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH: '/account/authorize',
  GOTRUE_SITE_URL: 'https://www.developed.sk',
  GOTRUE_URI_ALLOW_LIST: [
    'https://www.developed.sk/account/authorize',
    'https://megamusic.developed.sk/api/music/auth/callback',
    'https://kestrek.sk/api/auth/ecosystem/callback',
    'https://screentime.developed.sk/api/auth/callback',
    'https://amp.developed.sk/api/auth/ecosystem/callback',
    'https://vocabulum.developed.sk/api/auth/callback/developed',
    'https://frontend-jet-rho-66.vercel.app/api/account/callback',
    'https://educatio.sk/api/auth/ecosystem/callback',
    'sk.kestrek://oauth/callback',
  ].join(','),
};
function command(program, args) {
  return execFileSync(program, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }).trim();
}
function docker(...args) { return command('docker', args); }
function inspect(name, field) { return JSON.parse(docker('inspect', name, '--format', `{{json .${field}}}`)); }
function requireTrue(value) { if (!value) throw new Error('precondition failed'); }
function blueEnvironment() {
  const entries = inspect('supabase-auth', 'Config.Env');
  const env = {};
  for (const entry of entries) {
    const split = entry.indexOf('=');
    const name = entry.slice(0, split), value = entry.slice(split + 1);
    requireTrue(split > 0 && allowed.has(name) && !(name in env) && !/[\r\n\0]/.test(value));
    env[name] = value;
  }
  const url = new URL(env.GOTRUE_DB_DATABASE_URL);
  requireTrue(url.username === 'supabase_auth_admin' && url.hostname === 'db'
    && (!url.port || url.port === '5432') && url.pathname === '/postgres');
  requireTrue(env.GOTRUE_DISABLE_SIGNUP === 'true' && env.GOTRUE_JWT_ISSUER === 'https://sam-api.developed162.bid/auth/v1'
    && env.GOTRUE_JWT_KEYS && env.GOTRUE_JWT_SECRET && env.GOTRUE_API_PORT === '9999');
  return { ...env, ...overrides };
}
function preflight() {
  requireTrue(inspect('supabase-auth', 'Image') === image && inspect('supabase-auth', 'State.Running'));
  requireTrue(inspect('supabase-db', 'State.Running'));
  const env = blueEnvironment();
  const latest = docker('exec', 'supabase-db', 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-Atc',
    'select max(version) from auth.schema_migrations');
  requireTrue(latest === '20260302000000');
  const ledger = docker('exec', 'supabase-db', 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-Atc',
    'select version from auth.schema_migrations').split('\n');
  const bundled = docker('exec', 'supabase-auth', 'ls', '/usr/local/etc/auth/migrations').split('\n')
    .filter(name => name.endsWith('.up.sql')).map(name => name.split('_')[0]);
  requireTrue(bundled.length > 0 && bundled.every(version => ledger.includes(version)));
  const routes = command('ip', ['-4', 'route']);
  requireTrue(!routes.includes('172.30.241.'));
  const networks = docker('network', 'ls', '--format', '{{.Name}}').split('\n');
  requireTrue(!networks.includes(network));
  requireTrue(!docker('ps', '-a', '--format', '{{.Names}}').split('\n').includes(container));
  // The explicit /28 was reviewed against the current host routes and all Docker IPAM ranges.
  for (const name of networks) {
    const ranges = JSON.parse(docker('network', 'inspect', name, '--format', '{{json .IPAM.Config}}')) || [];
    for (const range of ranges) requireTrue(!range.Subnet?.startsWith('172.30.'));
  }
  requireTrue(command('ss', ['-H', '-ltn', '( sport = :3141 )']) === '');
  return env;
}

if (process.argv[1]?.endsWith('/green-provider-stage.mjs')) {
  try {
    requireTrue(process.argv.length === 3 && ['--check', '--create'].includes(process.argv[2]));
    const env = preflight();
    if (process.argv[2] === '--check') {
      console.log(JSON.stringify({ status: 'validated-not-created', network, subnet, address, databaseAddress,
        changedNames: Object.keys(overrides), preservedIdentity: true }));
    } else {
      requireTrue(process.getuid() === 0);
      mkdirSync(directory, { mode: 0o700, recursive: true });
      const stat = lstatSync(directory);
      requireTrue(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0 && !(stat.mode & 0o022));
      writeFileSync(envPath, Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
      docker('network', 'create', '--driver', 'bridge', '--subnet', subnet, '--gateway', '172.30.241.1',
        '--label', 'sk.developed.purpose=private-green-auth', network);
      const defaultRoute = () => docker('exec', 'supabase-db', 'ip', 'route').split('\n').filter(line => line.startsWith('default ')).join('\n');
      const before = defaultRoute();
      // Negative priority preserves the original DB default route, without restarting it.
      docker('network', 'connect', '--gw-priority', '-1', '--ip', databaseAddress, '--alias', 'db', network, 'supabase-db');
      requireTrue(defaultRoute() === before);
      docker('create', '--name', container, '--label', 'sk.developed.purpose=private-green-auth',
        '--network', network, '--ip', address, '--publish', '127.0.0.1:3141:9999',
        '--user', '1000:1000', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--memory', '256m', '--memory-swap', '256m', '--cpus', '0.5', '--pids-limit', '100',
        '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777', '--restart', 'no',
        '--log-driver', 'local', '--log-opt', 'max-size=5m', '--log-opt', 'max-file=2', '--env-file', envPath, image);
      requireTrue(inspect(container, 'State.Status') === 'created' && !inspect(container, 'State.Running'));
      console.log(JSON.stringify({ status: 'created-not-started', network, subnet, address, databaseAddress, envPath }));
    }
  } catch {
    // Docker/env/connection errors can contain credentials. Never print raw errors.
    console.error('Green provider staging failed; inspect protected state before retrying. No automatic rollback or start performed.');
    process.exitCode = 1;
  }
}
