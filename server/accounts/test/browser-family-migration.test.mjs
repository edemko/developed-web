import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareBrowserFamilyMigration, file, run } from '../operators/browser-family-migration.mjs';
const bytes = () => readFileSync(new URL(`../../../supabase/migrations/${file}`, import.meta.url));
test('browser family migration is hash-pinned, additive and staged without strict legacy invalidation', () => {
  const sql = prepareBrowserFamilyMigration(bytes());
  assert.match(sql, /browser_binding_required boolean not null default false/);
  assert.match(sql, /SET LOCAL ROLE supabase_admin;\ncreate or replace function/);
  assert.match(sql, /owner to developed_accounts;\nSET LOCAL ROLE developed_accounts;/);
  assert.match(sql, /SET LOCAL ROLE postgres;\nINSERT INTO accounts.deployment_migrations[\s\S]+COMMIT;/);
  assert.equal((sql.match(/^COMMIT;/gm) || []).length, 1);
  assert.doesNotMatch(sql, /DELETE FROM|TRUNCATE|DROP TABLE|browser_binding_required\s*=\s*true/i);
  assert.throws(() => prepareBrowserFamilyMigration(Buffer.concat([bytes(), Buffer.from('\n')])));
  assert.match(run([]), /no connection or mutation/);
  assert.throws(() => run(['--apply', '--container', 'some-other-database']));
});
