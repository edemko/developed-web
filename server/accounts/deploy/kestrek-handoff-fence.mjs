import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, mkdirSync, openSync, closeSync, writeFileSync, fsyncSync, fchmodSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TABLE = 'developed_kestrek_handoff';
export const RULES = `create table inet ${TABLE}
table inet ${TABLE} {
  chain input {
    type filter hook input priority -10; policy accept;
    iifname != "lo" tcp dport 3124 counter reject with icmpx type admin-prohibited
  }
}
`;
const backup = '/var/backups/developed-kestrek-handoff-fence-20260920';
const sha = value => createHash('sha256').update(value).digest('hex');
function run(args) { const r = spawnSync('/usr/sbin/nft', args, { encoding: 'utf8', timeout: 10000 }); assert.equal(r.status, 0, 'Scoped nft operation failed; output suppressed'); return r.stdout; }
export function verifyFenceJson(value) {
  assert.ok(Array.isArray(value.nftables), 'Invalid nft response');
  const tables = value.nftables.filter(item => item.table).map(item => item.table);
  const chains = value.nftables.filter(item => item.chain).map(item => item.chain);
  const rules = value.nftables.filter(item => item.rule).map(item => item.rule);
  assert.equal(tables.length, 1); assert.equal(chains.length, 1); assert.equal(rules.length, 1);
  assert.ok(value.nftables.every(item => item.metainfo || item.table || item.chain || item.rule), 'Unexpected fence objects');
  assert.ok(tables[0].family === 'inet' && tables[0].name === TABLE, 'Wrong fence table');
  const c = chains[0], r = rules[0];
  assert.ok(c.family === 'inet' && c.table === TABLE && c.name === 'input' && c.type === 'filter' && c.hook === 'input' && c.prio === -10 && c.policy === 'accept', 'Wrong fence chain');
  assert.ok(r.family === 'inet' && r.table === TABLE && r.chain === 'input', 'Wrong fence rule');
  assert.deepEqual(r.expr.filter(item => !item.counter), [
    { match: { op: '!=', left: { meta: { key: 'iifname' } }, right: 'lo' } },
    { match: { op: '==', left: { payload: { protocol: 'tcp', field: 'dport' } }, right: 3124 } },
    { reject: { type: 'icmpx', expr: 'admin-prohibited' } },
  ], 'Fence must reject only non-loopback input to3124');
}
export function assertFencePresent() { verifyFenceJson(JSON.parse(run(['-j', 'list', 'table', 'inet', TABLE]))); }
function trusted(path, privateFile = false) {
  let prefix = '';
  for (const part of path.split('/').filter(Boolean)) { prefix += '/' + part; const s = lstatSync(prefix); assert.ok(!s.isSymbolicLink() && s.uid === 0 && !(s.mode & 0o022), 'Unsafe operator path'); }
  if (privateFile) { const s = lstatSync(path); assert.ok(s.isFile() && s.nlink === 1 && (s.mode & 0o777) === 0o600, 'Unsafe private artifact'); }
}
function write(path, bytes) { const fd = openSync(path, 'wx', 0o600); try { fchmodSync(fd, 0o600); writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); } }
function sync() { const fd = openSync(backup, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
export function execute(mode) {
  assert.ok(process.getuid() === 0 && ['--stage', '--apply', '--verify'].includes(mode), 'Reviewed root stage/apply/verify only');
  trusted(fileURLToPath(import.meta.url));
  if (mode === '--verify') { assertFencePresent(); return { verified: true, table: TABLE }; }
  const listed = JSON.parse(run(['-j', 'list', 'tables']));
  assert.ok(!listed.nftables.some(item => item.table?.family === 'inet' && item.table.name === TABLE), 'Handoff table must be absent');
  if (mode === '--stage') {
    trusted('/var/backups'); mkdirSync(backup, { mode: 0o700 });
    write(backup + '/rules.nft', RULES); run(['--check', '--file', backup + '/rules.nft']);
    write(backup + '/proof.json', JSON.stringify({ rulesSha256: sha(RULES), inputOnly: true, port: 3124 }) + '\n'); sync();
    return { staged: true, applied: false, rulesSha256: sha(RULES) };
  }
  trusted(backup + '/rules.nft', true); trusted(backup + '/proof.json', true);
  assert.ok(readFileSync(backup + '/rules.nft', 'utf8') === RULES && JSON.parse(readFileSync(backup + '/proof.json')).rulesSha256 === sha(RULES), 'Fence staged bytes changed');
  run(['--check', '--file', backup + '/rules.nft']); run(['--file', backup + '/rules.nft']); assertFencePresent();
  write(backup + '/applied.json', JSON.stringify({ appliedAt: new Date().toISOString(), rulesSha256: sha(RULES) }) + '\n'); sync();
  return { applied: true, table: TABLE, inputOnly: true, outputChanged: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assert.equal(process.argv.length, 3); console.log(JSON.stringify(execute(process.argv[2]))); }
  catch { console.error('Scoped KešTrek fence operation failed; inspect protected state.'); process.exitCode = 1; }
}
