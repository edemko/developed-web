import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvironment, scramVerifier, provisioningSql } from './central-runtime-provision.mjs';

test('environment parsing rejects ambiguous or multiline settings without disclosing input', () => {
  assert.deepEqual(parseEnvironment('# comment\nKEY=abc.def-123\n'), { KEY: 'abc.def-123' });
  for (const input of ['KEY=secret\nKEY=other','KEY=secret\rvalue','export KEY=secret','KEY=secret\0value'])
    assert.throws(() => parseEnvironment(input), error => error.message === 'Central provisioning precondition failed');
});
test('SCRAM generation is deterministic for a fixed salt and rejects SQL metacharacters', () => {
  const verifier = scramVerifier('a'.repeat(43), Buffer.alloc(16));
  assert.match(verifier, /^SCRAM-SHA-256\$4096:AAAAAAAAAAAAAAAAAAAAAA==\$/);
  assert.equal(verifier, scramVerifier('a'.repeat(43), Buffer.alloc(16)));
  const sql = provisioningSql(verifier);
  assert.equal((sql.match(/ALTER ROLE/g) || []).length, 1);
  assert.match(sql, /ALTER ROLE developed_accounts LOGIN PASSWORD/);
  assert.doesNotMatch(sql, /GRANT|CREATE ROLE|SUPERUSER;/);
  assert.match(sql, /rolpassword IS NULL/);
  assert.match(sql, /log_min_error_statement='panic'/);
  assert.throws(() => provisioningSql(`${verifier}'; SELECT 1; --`));
});
