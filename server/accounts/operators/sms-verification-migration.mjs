// One exact additive SMS-verification migration. Default execution validates
// locally; production application is explicit and checksum-ledgered.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const file = '20260923164815_developed_airsoft_sms_verification.sql';
export const version = '20260923164815';
export const sourceSha = 'e5dbcb8fe4df77290e3e833a8804da232c5eba3c947283c81cc46a74bc61c9b3';
const predecessors = Object.freeze([
  ['20260920070607','42aff1569d5bc410785d8f5339bc8c6bd1f8edfda0728819275e8f1275fbc823'],
  ['20260920114956','942e1f4dee7632f914642df221ca0c69025cc79224d330ffb47c33aeffbd164d'],
  ['20260920125511','06a25e25ea6319c7455450191d7d63ee10f8591ed2fe01e5d83f679427e35778'],
  ['20260921112156','3269fc5feb6b2116b54ddecbdefc9bd83962ca25fc7ddadbd1d87a17f0b046bc'],
  ['20260921141121','f1be590df91ba01517caffe0a171b620268edfb7553622d1c96b5a78afeeb82f'],
  ['20260921163940','c34354cc49ae8ab37e3adf15d3e05d67eb30e47dad51b9627070076bcb204bea'],
]);

export function prepareSmsMigration(bytes) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sourceSha, 'Unreviewed migration');
  const source = bytes.toString('utf8');
  const prefix = "begin;\nset local lock_timeout='500ms';\nset local statement_timeout='10s';\n";
  assert.ok(source.includes(prefix));
  assert.equal((source.match(/^\s*(?:begin|commit|rollback|start transaction|end|abort)\s*;\s*$/gim) || []).length, 2);
  assert.ok(source.endsWith('commit;\n'));
  assert.equal(/^\s*\\/m.test(source), false);
  const body = source.slice(source.indexOf(prefix) + prefix.length, -'commit;\n'.length);
  return `BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='10s';
SET LOCAL ROLE postgres;
DO $sms_migration_guard$ BEGIN
  IF session_user<>'supabase_admin' OR current_user<>'postgres' OR current_database()<>'postgres'
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper)
    THEN RAISE EXCEPTION 'Trusted operator required'; END IF;
  IF NOT pg_try_advisory_xact_lock(194812,20260920) THEN RAISE EXCEPTION 'Another central migration is active'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='accounts.deployment_migrations'::regclass
    AND pg_get_userbyid(relowner)='postgres' AND relrowsecurity AND relforcerowsecurity)
    THEN RAISE EXCEPTION 'Unexpected central ledger'; END IF;
  IF (SELECT count(*) FROM accounts.deployment_migrations)<>${predecessors.length} THEN RAISE EXCEPTION 'Unexpected migration history'; END IF;
  ${predecessors.map(([v,h]) => `IF NOT EXISTS(SELECT 1 FROM accounts.deployment_migrations WHERE version='${v}' AND source_sha256='${h}') THEN RAISE EXCEPTION 'Predecessor checksum mismatch'; END IF;`).join('\n  ')}
  IF to_regclass('accounts.sms_challenges') IS NOT NULL OR to_regclass('accounts.verified_phones') IS NOT NULL
    THEN RAISE EXCEPTION 'Already applied or unrecorded schema'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='developed_accounts' AND NOT rolsuper AND NOT rolbypassrls)
    THEN RAISE EXCEPTION 'Unexpected runtime role'; END IF;
END $sms_migration_guard$;
${body}
SET LOCAL ROLE postgres;
INSERT INTO accounts.deployment_migrations(version,source_sha256) VALUES('${version}','${sourceSha}');
COMMIT;
`;
}

export function run(args) {
  const bytes = readFileSync(new URL(`../../../supabase/migrations/${file}`, import.meta.url));
  const sql = prepareSmsMigration(bytes);
  if (!args.length) return 'Validated Airsoft SMS-verification migration; no connection or mutation.';
  assert.deepEqual(args.slice(0,2), ['--apply','--container']); assert.equal(args.length,3);
  const container = args[2];
  assert.ok(container === 'supabase-db' || /^developed-central-migration-test-\d+-db$/.test(container));
  const docker = (parameters, input) => execFileSync('docker', parameters, { encoding:'utf8', input, stdio:['pipe','pipe','pipe'], timeout:30000, maxBuffer:1024*1024 });
  if (container !== 'supabase-db') assert.equal(docker(['inspect','--format','{{index .Config.Labels "developed.central.migration.test"}}',container]).trim(),'true');
  docker(['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-q','-v','ON_ERROR_STOP=1'],sql);
  const recorded = docker(['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-Atq'],
    `select count(*) from accounts.deployment_migrations where version='${version}' and source_sha256='${sourceSha}';`).trim();
  assert.equal(recorded,'1');
  return 'Applied the additive Airsoft SMS-verification schema and recorded its checksum atomically.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(run(process.argv.slice(2))); }
  catch { console.error('SMS-verification migration refused or failed; inspect the protected ledger before retrying.'); process.exitCode=1; }
}
