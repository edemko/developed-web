import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { OWNER, EMAIL, ACTION, snapshotSql, validateBefore, expectedAfter, applySql, execute } from './bootstrap-central-superadmin.mjs';
const fixture = () => ({ profile: { id: OWNER, role: 'USER', display_name: 'Preserved fixture' }, identity: { id: OWNER, email: EMAIL, confirmed: true }, superadmins: 0, tables: ['core.profiles','accounts.audit'].map(name => ({ name, kind: 'r', triggers: 0, rules: 0 })), audit: [] });
test('fixed existing confirmed owner only; reject privilege, identity and trigger drift', () => {
  validateBefore(fixture());
  for (const change of [s => s.profile.id = 'other', s => s.identity.email = 'other@example.invalid', s => s.identity.confirmed = false, s => s.profile.role = 'SUPERADMIN', s => s.superadmins = 1, s => s.audit.push({}), s => s.tables[0].triggers = 1, s => s.tables[1].rules = 1]) { const s = fixture(); change(s); assert.throws(() => validateBefore(s)); }
});
test('only one profile role and one audit change; no credential, factor, product, flag or mail writes', () => {
  const before = fixture(), after = expectedAfter(before), sql = applySql(before);
  assert.equal(before.profile.role, 'USER'); assert.equal(after.profile.role, 'SUPERADMIN');
  assert.equal(after.profile.display_name, before.profile.display_name); assert.deepEqual(after.identity, before.identity); assert.deepEqual(after.tables, before.tables);
  assert.equal(after.audit.length, 1); assert.equal(after.audit[0].actor_id, null); assert.equal(after.audit[0].action, ACTION);
  assert.equal((sql.match(/UPDATE /g) || []).length, 1); assert.equal((sql.match(/INSERT INTO /g) || []).length, 1);
  assert.match(sql, /UPDATE core\.profiles SET role='SUPERADMIN' WHERE id=/); assert.match(sql, /GET DIAGNOSTICS changed = ROW_COUNT/);
  assert.match(sql, /FOR SHARE/); assert.match(sql, /SHARE ROW EXCLUSIVE MODE/); assert.match(sql, /Unexpected bootstrap side effect/);
  assert.doesNotMatch(sql, /\b(?:GRANT|REVOKE|DELETE|TRUNCATE|ALTER|NOTIFY|encrypted_password|mfa_factors|outbox|app_access)\b/);
});
test('root-only entrypoint refuses staging and promotion', { skip: process.getuid() === 0 }, () => { for (const mode of ['--stage','--apply']) assert.throws(() => execute(mode), /root bootstrap/); });
test('disposable SQL preserves profile/auth rows, audits once and refuses replay or side effects', { skip: process.env.CENTRAL_BOOTSTRAP_SQL_TEST !== '1', timeout: 90000 }, async () => {
  const container = `developed-central-bootstrap-test-${process.pid}`;
  const docker = (args, input) => spawnSync('sudo', ['-n','docker',...args], { input, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  const created = docker(['run','--pull=never','-d','--name',container,'--label','developed.central-bootstrap-test=true','--network','none','--memory','256m','--cpus','0.5','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=supabase_admin','postgres:17-alpine']); assert.equal(created.status, 0, created.stderr);
  try {
    let ready = false; for (let i = 0; i < 120; i++) { const logs = docker(['logs',container]); if ((logs.stdout + logs.stderr).includes('PostgreSQL init process complete') && docker(['exec',container,'pg_isready','-U','supabase_admin']).status === 0) { ready = true; break; } await new Promise(resolve => setTimeout(resolve, 250)); } assert.ok(ready, 'Synthetic DB readiness');
    const query = sql => docker(['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'], sql);
    const exec = sql => { const r = query(sql); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
    exec(`CREATE SCHEMA core; CREATE SCHEMA auth; CREATE SCHEMA accounts;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,encrypted_password text);
CREATE TABLE core.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),role text,display_name text,updated_at timestamptz);
CREATE TABLE accounts.audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id uuid,target_id uuid,action text,result text,context jsonb,created_at timestamptz DEFAULT now());
INSERT INTO auth.users VALUES('${OWNER}','${EMAIL}',now(),'synthetic-unchanged-password');
INSERT INTO core.profiles VALUES('${OWNER}','USER','unchanged fixture','2026-01-01T00:00:00Z');`);
    const before = JSON.parse(exec(snapshotSql)); validateBefore(before); exec(applySql(before));
    assert.deepEqual(JSON.parse(exec(snapshotSql)), expectedAfter(before));
    assert.equal(exec('SELECT encrypted_password FROM auth.users'), 'synthetic-unchanged-password');
    assert.equal(exec('SELECT count(*) FROM accounts.audit'), '1');
    assert.notEqual(query(applySql(before)).status, 0); assert.deepEqual(JSON.parse(exec(snapshotSql)), expectedAfter(before));
    exec("UPDATE core.profiles SET role='USER'; DELETE FROM accounts.audit;");
    const staged = JSON.parse(exec(snapshotSql));
    exec('CREATE FUNCTION core.fixture_side_effect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER fixture_unreviewed BEFORE UPDATE ON core.profiles FOR EACH ROW EXECUTE FUNCTION core.fixture_side_effect();');
    assert.notEqual(query(applySql(staged)).status, 0);
    assert.equal(exec('SELECT role FROM core.profiles'), 'USER'); assert.equal(exec('SELECT count(*) FROM accounts.audit'), '0');
  } finally { const identity = docker(['inspect','--format','{{index .Config.Labels "developed.central-bootstrap-test"}} {{.HostConfig.NetworkMode}}',container]); if (identity.status === 0 && identity.stdout.trim() === 'true none') assert.equal(docker(['rm','-f','-v',container]).status, 0); }
});
