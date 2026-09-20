import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TARGETS = Object.freeze([
  'c3bf3064-8297-4bd5-8f92-54142598ffed',
  '29cc2004-d4e7-427f-8070-eed2eb7df29a',
  '668c5614-d834-424e-b962-0593d757c517',
]);
export const OWNER = '4c3e497a-511d-49dc-85fe-60f3cc37c3ae';
// These settings affect only this disposable operator connection. Keep them
// outside BEGIN so an expected transaction error cannot revert suppression.
// psql sends each SET before the later payload-bearing DO statement.
export const PRIVATE_SQL_LOGGING = `SET log_statement='none';
SET log_min_duration_statement=-1; SET log_min_duration_sample=-1;
SET log_duration=off; SET log_min_error_statement='panic';
SET log_error_verbosity='terse'; SET log_parameter_max_length=0;
SET log_parameter_max_length_on_error=0; SET pgaudit.log='none';
SET auto_explain.log_min_duration=-1; SET pg_stat_statements.track='none';`;
const ids = TARGETS.map(id => `'${id}'`).join(',');
export const TABLES = Object.freeze([
  ['auth.users', `id IN (${ids})`],
  ['auth.identities', `user_id IN (${ids})`],
  ['auth.sessions', `user_id IN (${ids})`],
  ['auth.refresh_tokens', `user_id IN (${ids})`],
  ['auth.mfa_amr_claims', `session_id IN (SELECT id FROM auth.sessions WHERE user_id IN (${ids}))`],
  ['core.profiles', `id IN (${ids})`],
  ['core.app_access', `user_id IN (${ids})`],
  ['voc_builder.memberships', `user_id IN (${ids})`],
]);

export function backupSql() {
  const tables = TABLES.map(([table, predicate]) =>
    `'${table}', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) FROM ${table} r WHERE ${predicate})`).join(',\n');
  return `${PRIVATE_SQL_LOGGING}
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='500ms';
SET LOCAL search_path=pg_catalog;
SELECT jsonb_build_object('version',1,'captured_at',clock_timestamp(),'snapshot',pg_current_snapshot()::text,
'targets',to_jsonb(ARRAY[${ids}]),'owner','${OWNER}','rows',jsonb_build_object(${tables}));
COMMIT;`;
}

export function validateBackup(backup) {
  if (backup?.version !== 1 || backup.owner !== OWNER || JSON.stringify(backup.targets) !== JSON.stringify(TARGETS)) throw Error('Invalid fixed target backup');
  if (Object.keys(backup.rows ?? {}).sort().join() !== TABLES.map(([table]) => table).sort().join()) throw Error('Unexpected table set');
  for (const [table] of TABLES) {
    const rows = backup.rows[table];
    if (!Array.isArray(rows) || rows.length !== 3) throw Error('Expected exactly three rows per table; review new state');
    const key = table === 'auth.users' || table === 'core.profiles' ? 'id' : 'user_id';
    if (table === 'auth.mfa_amr_claims') {
      const sessions = new Set(backup.rows['auth.sessions'].map(row => row.id));
      if (rows.some(row => !sessions.has(row.session_id))) throw Error('Unexpected session reference');
    } else if (rows.map(row => row[key]).sort().join() !== [...TARGETS].sort().join()) throw Error('Unexpected row owner');
  }
  const expected = new Map([[TARGETS[0],'ADMIN'],[TARGETS[1],'TEACHER'],[TARGETS[2],'STUDENT']]);
  if (backup.rows['voc_builder.memberships'].some(row => expected.get(row.user_id) !== row.role)) throw Error('Target membership changed');
  if (backup.rows['core.profiles'].some(row => row.role !== 'USER')) throw Error('Target platform role changed');
  return Object.fromEntries(TABLES.map(([table]) => [table,backup.rows[table].length]));
}

function privateDir(path) {
  const components=path.split('/').filter(Boolean); let current='';
  for (const component of components) {
    current += `/${component}`;
    try { lstatSync(current); } catch (error) { if(error.code!=='ENOENT')throw error; mkdirSync(current,{mode:0o700}); }
    const stat=lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid!==0 || (stat.mode&0o022)) throw Error('Unsafe backup parent');
  }
  const stat=lstatSync(path);
  if ((stat.mode&0o077)!==0) throw Error('Backup directory must be private');
}

export function captureBackup() {
  if (process.getuid() !== 0) throw Error('Root-only backup capture');
  const result=spawnSync('docker',['exec','-i','supabase-db','psql','-U','supabase_admin','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{input:backupSql(),encoding:'utf8',maxBuffer:8*1024*1024,timeout:35000});
  if(result.status!==0)throw Error('Read-only snapshot failed');
  const backup=JSON.parse(result.stdout.trim());
  const counts=validateBackup(backup);
  const bytes=Buffer.from(`${JSON.stringify(backup)}\n`);
  const digest=createHash('sha256').update(bytes).digest('hex');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const roots=['/var/backups/developed-vocabulum-cleanup','/root/developed-vocabulum-cleanup-recovery'];
  const files=[];
  for(const root of roots) {
    privateDir(root);
    const file=`${root}/${stamp}.json`;
    const fd=openSync(file,'wx',0o600);
    try {writeFileSync(fd,bytes);fsyncSync(fd);} finally {closeSync(fd);}
    const dirFd=openSync(root,'r');try{fsyncSync(dirFd);}finally{closeSync(dirFd);}
    const stat=lstatSync(file);
    if(stat.uid!==0 || (stat.mode&0o777)!==0o600 || stat.nlink!==1 || !readFileSync(file).equals(bytes))throw Error('Private backup verification failed');
    files.push(file);
  }
  return {status:'read-only backup complete',files,sha256:digest,counts,snapshot:backup.snapshot};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv.length!==3 || process.argv[2]!=='--capture')throw Error('Only --capture is supported; this tool cannot delete or revoke');
    console.log(JSON.stringify(captureBackup()));
  } catch { console.error('Fixed-target backup failed; no database changes were attempted.');process.exitCode=1; }
}
