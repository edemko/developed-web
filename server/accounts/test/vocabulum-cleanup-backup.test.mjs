import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS, OWNER, TABLES, backupSql, validateBackup } from '../operators/vocabulum-cleanup-backup.mjs';
function fixture() {
  const rows=Object.fromEntries(TABLES.map(([table])=>[table,TARGETS.map((id,index)=>({id:table==='core.profiles'||table==='auth.users'?id:`session-${index}`,user_id:id,session_id:`session-${index}`,role:table==='core.profiles'?'USER':['ADMIN','TEACHER','STUDENT'][index]}))]));
  return {version:1,owner:OWNER,targets:[...TARGETS],rows};
}
test('backup query is explicitly read-only and includes indirect session claims',()=>{
  const sql=backupSql();assert.match(sql,/REPEATABLE READ READ ONLY/);assert.match(sql,/auth\.mfa_amr_claims/);assert.doesNotMatch(sql,/\b(DELETE|UPDATE|INSERT|ALTER|DROP|TRUNCATE)\b/i);
});
test('validates the exact 24-row fixed-target set',()=>assert.equal(Object.values(validateBackup(fixture())).reduce((a,b)=>a+b),24));
test('refuses owner substitution, missing rows and new roles',()=>{
  const a=fixture();a.rows['auth.users'][0].id=OWNER;assert.throws(()=>validateBackup(a));
  const b=fixture();b.rows['auth.identities'].pop();assert.throws(()=>validateBackup(b));
  const c=fixture();c.rows['voc_builder.memberships'][0].role='SUPERADMIN';assert.throws(()=>validateBackup(c));
});
test('refuses unrelated indirect sessions and tables',()=>{
  const a=fixture();a.rows['auth.mfa_amr_claims'][0].session_id='other';assert.throws(()=>validateBackup(a));
  const b=fixture();b.rows['other.data']=[];assert.throws(()=>validateBackup(b));
});
