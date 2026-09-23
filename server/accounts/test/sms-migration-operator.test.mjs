import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { file, prepareSmsMigration, run, sourceSha, version } from '../operators/sms-verification-migration.mjs';

test('SMS migration is exact, ledgered, additive and offline by default', () => {
  const source = readFileSync(new URL(`../../../supabase/migrations/${file}`, import.meta.url));
  const sql = prepareSmsMigration(source);
  assert.match(sql, new RegExp(`INSERT INTO accounts\\.deployment_migrations\\(version,source_sha256\\) VALUES\\('${version}','${sourceSha}'\\)`));
  assert.match(sql, /to_regclass\('accounts\.sms_challenges'\) IS NOT NULL/);
  assert.match(sql, /rolname='developed_accounts' AND NOT rolsuper AND NOT rolbypassrls/);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.match(run([]), /no connection or mutation/);
});

test('SMS migration rejects changed source and arbitrary apply arguments', () => {
  const source = readFileSync(new URL(`../../../supabase/migrations/${file}`, import.meta.url));
  assert.throws(() => prepareSmsMigration(Buffer.concat([source, Buffer.from('\n-- changed')])));
  for (const args of [['--apply'], ['--container','supabase-db'], ['--apply','--container','wrong-db'], ['--apply','--container','supabase-db','extra']]) {
    assert.throws(() => run(args));
  }
});
