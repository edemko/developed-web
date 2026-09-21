// One reviewed additive central migration, never a directory-wide schema push.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { migrations } from './apply-central-migration.mjs';

export const file = '20260921112156_developed_browser_session_families.sql';
export const version = '20260921112156';
export const sourceSha = '3269fc5feb6b2116b54ddecbdefc9bd83962ca25fc7ddadbd1d87a17f0b046bc';
export function prepareBrowserFamilyMigration(bytes) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sourceSha, 'Unreviewed migration');
  const source = bytes.toString('utf8');
  assert.ok(source.startsWith("begin;\nset local lock_timeout='500ms';\nset local statement_timeout='10s';\n"));
  assert.equal((source.match(/^commit;$/gm) || []).length, 1);
  assert.ok(source.endsWith('commit;\n'));
  const start = 'create or replace function accounts.app_request_allowed(expected_app text) returns boolean';
  const owner = 'alter function accounts.app_request_allowed(text) owner to developed_accounts;';
  assert.equal(source.split(start).length, 2); assert.equal(source.split(owner).length, 2);
  const body = source.slice(source.indexOf('\n\n'), -'commit;\n'.length)
    .replace(start, `SET LOCAL ROLE supabase_admin;\n${start}`)
    .replace(owner, `${owner}\nSET LOCAL ROLE developed_accounts;`);
  return `BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='10s';
SET LOCAL ROLE postgres;
DO $browser_migration_guard$ BEGIN
  IF session_user<>'supabase_admin' OR current_user<>'postgres' OR current_database()<>'postgres'
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper)
    THEN RAISE EXCEPTION 'Trusted operator required'; END IF;
  IF NOT pg_try_advisory_xact_lock(194812,20260920) THEN RAISE EXCEPTION 'Another central migration is active'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='accounts.deployment_migrations'::regclass
    AND pg_get_userbyid(relowner)='postgres' AND relrowsecurity AND relforcerowsecurity)
    THEN RAISE EXCEPTION 'Unexpected central ledger'; END IF;
  IF (SELECT count(*) FROM accounts.deployment_migrations)<>3 THEN RAISE EXCEPTION 'Unexpected migration history'; END IF;
  ${migrations.map(previous => `IF NOT EXISTS(SELECT 1 FROM accounts.deployment_migrations WHERE version='${previous.version}' AND source_sha256='${previous.sha256}') THEN RAISE EXCEPTION 'Predecessor checksum mismatch'; END IF;`).join('\n  ')}
  IF to_regclass('accounts.browser_families') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='accounts.settings'::regclass AND attname='browser_binding_required' AND NOT attisdropped)
    THEN RAISE EXCEPTION 'Already applied or unrecorded schema'; END IF;
  IF md5(pg_get_functiondef('accounts.app_request_allowed(text)'::regprocedure))<>'f4d6503bd9c818b2867c56d3665b54eb'
    OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='accounts.app_request_allowed(text)'::regprocedure)<>'developed_accounts'
    THEN RAISE EXCEPTION 'Existing access gate changed'; END IF;
END $browser_migration_guard$;
${body}
SET LOCAL ROLE postgres;
INSERT INTO accounts.deployment_migrations(version,source_sha256) VALUES('${version}','${sourceSha}');
COMMIT;
`;
}
export function run(args) {
  const bytes = readFileSync(new URL(`../../../supabase/migrations/${file}`, import.meta.url));
  const sql = prepareBrowserFamilyMigration(bytes);
  if (!args.length) return 'Validated browser-family migration; no connection or mutation.';
  assert.equal(args.length, 3); assert.equal(args[0], '--apply'); assert.equal(args[1], '--container');
  const container = args[2];
  assert.ok(container === 'supabase-db' || /^developed-central-migration-test-\d+-db$/.test(container));
  const docker = (args, input) => execFileSync('docker', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 1024 * 1024 });
  if (container !== 'supabase-db') assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "developed.central.migration.test"}}', container]).trim(), 'true');
  docker(['exec', '-i', container, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'], sql);
  return 'Applied additive browser-family schema and checksum atomically; strict binding remains disabled.';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(run(process.argv.slice(2))); }
  catch { console.error('Browser-family migration refused or failed; inspect protected ledger before any retry.'); process.exitCode = 1; }
}
