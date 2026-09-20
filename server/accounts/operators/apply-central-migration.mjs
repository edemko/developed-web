// Explicit operator utility for exactly three pinned central additive files.
// Dry run is local-only. Never activates account/app policy or issues secrets.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const migrations = Object.freeze([
  Object.freeze({ version: '20260920070607', file: '20260920070607_developed_accounts_v1.sql', sha256: '42aff1569d5bc410785d8f5339bc8c6bd1f8edfda0728819275e8f1275fbc823' }),
  Object.freeze({ version: '20260920114956', file: '20260920114956_developed_native_clients.sql', sha256: '942e1f4dee7632f914642df221ca0c69025cc79224d330ffb47c33aeffbd164d' }),
  Object.freeze({ version: '20260920125511', file: '20260920125511_developed_totp_sessions.sql', sha256: '06a25e25ea6319c7455450191d7d63ee10f8591ed2fe01e5d83f679427e35778' }),
]);
const rejected = () => new Error('Central migration operation rejected');

function replaceExactOnce(source, expected, replacement) {
  const index = source.indexOf(expected);
  if (index < 0 || source.indexOf(expected, index + expected.length) >= 0) throw rejected();
  return source.slice(0, index) + replacement + source.slice(index + expected.length);
}

export function prepareMigration(file, bytes) {
  const index = migrations.findIndex(item => item.file === file), migration = migrations[index];
  if (!migration || !Buffer.isBuffer(bytes)
    || createHash('sha256').update(bytes).digest('hex') !== migration.sha256) throw rejected();
  const source = bytes.toString('utf8');
  // Content hashes fix the entire SQL, including strings/DO bodies. The extra
  // shape guard makes transaction handling explicit and must stay fail-closed
  // when a reviewed file is added or changed; this is not a generic SQL parser.
  const boundaries = [...source.matchAll(/^\s*(begin|commit|rollback|start transaction|end|abort)\s*;\s*$/gim)];
  if (boundaries.length !== 2 || boundaries[0][1].toLowerCase() !== 'begin'
    || boundaries[1][1].toLowerCase() !== 'commit' || /^\s*\\/m.test(source)
    || source.slice(boundaries[1].index + boundaries[1][0].length).trim()) throw rejected();
  const beginEnd = boundaries[0].index + boundaries[0][0].length;
  const originalBody = source.slice(beginEnd, boundaries[1].index);
  // The first reviewed source uses 5s. Reassert the operator's stricter bound
  // after its exact known settings, before the guard or any schema operation.
  // Do not rewrite arbitrary SQL or silently accept new timeout statements.
  const timeoutPrefix = [
    "\nset local lock_timeout = '5s';\nset local statement_timeout = '30s';\n",
    "\nset local lock_timeout='500ms';\nset local statement_timeout='5s';\n",
    '',
  ][index];
  if (!originalBody.startsWith(timeoutPrefix)) throw rejected();
  let body = originalBody.slice(timeoutPrefix.length);
  if (/\b(?:lock_timeout|statement_timeout|set_config|reset\s+all)\b/i.test(body)) throw rejected();
  // Production postgres is not the owner of provider tables or auth schema.
  // The trusted session can assume existing owners; never add memberships or
  // elevate postgres. Only exact hash-pinned provider grants/policies switch.
  if (index === 0) {
    body = replaceExactOnce(body, 'grant usage on schema core,auth to developed_accounts;',
      'grant usage on schema core to developed_accounts;\nSET LOCAL ROLE supabase_admin;\ngrant usage on schema auth to developed_accounts;\nSET LOCAL ROLE postgres;');
    const start = 'grant select(id,email,email_confirmed_at,created_at) on auth.users to developed_accounts;';
    const end = '  on auth.oauth_authorizations to developed_accounts;';
    body = replaceExactOnce(body, start, `SET LOCAL ROLE supabase_auth_admin;\n${start}`);
    body = replaceExactOnce(body, end, `${end}\nSET LOCAL ROLE postgres;`);
  } else if (index === 2) {
    const start = 'grant select(aal) on auth.sessions to developed_accounts;';
    const end = 'create policy developed_accounts_factor_read on auth.mfa_factors for select to developed_accounts using(true);';
    body = replaceExactOnce(body, start, `SET LOCAL ROLE supabase_auth_admin;\n${start}`);
    body = replaceExactOnce(body, end, `${end}\nSET LOCAL ROLE postgres;`);
  }
  const functionOwner = 'alter function accounts.app_request_allowed(text) owner to developed_accounts;';
  if (index === 0) {
    body = replaceExactOnce(body, functionOwner,
      `SET LOCAL ROLE supabase_admin;\n${functionOwner}\nSET LOCAL ROLE postgres;`);
  } else if (index === 1) {
    // The existing SECURITY DEFINER function is owned by the runtime role,
    // which deliberately has no schema CREATE grant. Replace only this exact
    // function as operator, immediately retaining its least-privileged owner.
    const start = 'create or replace function accounts.app_request_allowed(expected_app text) returns boolean';
    body = replaceExactOnce(body, start, `SET LOCAL ROLE supabase_admin;\n${start}`);
    body = replaceExactOnce(body, functionOwner, `${functionOwner}\nSET LOCAL ROLE postgres;`);
  }
  if (index < 2) {
    for (const statement of [
      'revoke all on function accounts.app_request_allowed(text) from public,anon;',
      'grant execute on function accounts.app_request_allowed(text) to authenticated;',
    ]) body = replaceExactOnce(body, statement,
      `SET LOCAL ROLE developed_accounts;\n${statement}\nSET LOCAL ROLE postgres;`);
  }
  const predecessorCheck = index === 0
    ? `IF to_regnamespace('accounts') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='developed_accounts') THEN
         RAISE EXCEPTION 'Unrecorded central objects require operator reconciliation'; END IF;`
    : `IF to_regclass('accounts.deployment_migrations') IS NULL THEN RAISE EXCEPTION 'Central ledger missing'; END IF;
       IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
         WHERE c.oid='accounts.deployment_migrations'::regclass AND r.rolname='postgres'
           AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'Unsafe central ledger'; END IF;
       IF (SELECT count(*) FROM accounts.deployment_migrations) <> ${index} THEN RAISE EXCEPTION 'Unexpected central migration history'; END IF;
       ${migrations.slice(0, index).map(previous => `IF NOT EXISTS(SELECT 1 FROM accounts.deployment_migrations
         WHERE version='${previous.version}' AND source_sha256='${previous.sha256}') THEN RAISE EXCEPTION 'Central predecessor checksum mismatch'; END IF;`).join('\n')}`;
  const ledger = index === 0 ? `
CREATE TABLE accounts.deployment_migrations (
  version text PRIMARY KEY CHECK(version ~ '^[0-9]{14}$'),
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE accounts.deployment_migrations OWNER TO postgres;
ALTER TABLE accounts.deployment_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts.deployment_migrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON accounts.deployment_migrations FROM PUBLIC,anon,authenticated,service_role,developed_accounts;
` : '';
  const sql = `${source.slice(0, beginEnd)}${timeoutPrefix}
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='${index === 1 ? '5s' : '30s'}';
SET LOCAL ROLE postgres;
DO $central_operator_guard$ BEGIN
  IF current_user<>'postgres' OR session_user<>'supabase_admin' OR current_database()<>'postgres'
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper)
    THEN RAISE EXCEPTION 'Trusted Supabase operator required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='auth' AND pg_get_userbyid(nspowner)='supabase_admin')
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='auth' AND c.relname IN ('users','sessions','oauth_authorizations','mfa_factors')
        AND c.relkind='r' AND pg_get_userbyid(c.relowner)='supabase_auth_admin')<>4
    THEN RAISE EXCEPTION 'Unexpected provider ownership'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='core' AND pg_get_userbyid(nspowner)='postgres')
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='core' AND c.relname IN ('profiles','apps','app_access')
        AND c.relkind='r' AND pg_get_userbyid(c.relowner)='postgres')<>3
    THEN RAISE EXCEPTION 'Unexpected core ownership'; END IF;
  IF NOT pg_try_advisory_xact_lock(194812, 20260920) THEN RAISE EXCEPTION 'Another central migration is active'; END IF;
  ${predecessorCheck}
END $central_operator_guard$;
${body}${ledger}
INSERT INTO accounts.deployment_migrations(version,source_sha256) VALUES('${migration.version}','${migration.sha256}');
COMMIT;
`;
  return { ...migration, sql };
}

function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === '--apply') { if (result.apply) throw rejected(); result.apply = true; continue; }
    if (!['--migration', '--container'].includes(key) || Object.hasOwn(result, key)
      || !args[index + 1] || args[index + 1].startsWith('--')) throw rejected();
    result[key] = args[++index];
  }
  if (!migrations.some(item => item.file === result['--migration'])) throw rejected();
  if (result['--container'] && result['--container'] !== 'supabase-db'
    && !/^developed-central-migration-test-\d+-db$/.test(result['--container'])) throw rejected();
  if (result.apply && !result['--container']) throw rejected();
  return result;
}

export async function run(args) {
  const opts = options(args);
  const source = await readFile(new URL(`../../../supabase/migrations/${opts['--migration']}`, import.meta.url));
  const prepared = prepareMigration(opts['--migration'], source);
  if (!opts.apply) return `Validated ${prepared.file} SHA256 ${prepared.sha256}; dry run, no connection or mutation.`;
  const container = opts['--container'];
  const docker = (args, input) => execFileSync('docker', args, {
    encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  if (container !== 'supabase-db') {
    const label = docker(['inspect', '--format', '{{index .Config.Labels "developed.central.migration.test"}}', container]).trim();
    if (label !== 'true') throw rejected();
  }
  // Do not inherit psqlrc or place SQL/credentials in arguments. All provider
  // diagnostics are captured and deliberately omitted from terminal output.
  docker(['exec', '-i', container, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-q'], prepared.sql);
  return `Applied ${prepared.version}; source checksum and schema committed atomically. SSO policy remains unchanged.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(message => process.stdout.write(`${message}\n`))
    .catch(() => { process.stderr.write('Central migration failed; database diagnostics withheld. Recheck protected operator state and committed ledger before retrying.\n'); process.exitCode = 1; });
}
