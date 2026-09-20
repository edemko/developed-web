import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApplySql} from '../operators/vocabulum-cleanup-apply.mjs';
import {TARGETS,OWNER,TABLES} from '../operators/vocabulum-cleanup-backup.mjs';
function fixture(){return {version:1,owner:OWNER,targets:[...TARGETS],rows:Object.fromEntries(TABLES.map(([table])=>[table,TARGETS.map((id,index)=>({id:['auth.users','core.profiles'].includes(table)?id:`session-${index}`,user_id:id,session_id:`session-${index}`,role:table==='core.profiles'?'USER':['ADMIN','TEACHER','STUDENT'][index]}))]))};}
test('defaults to rollback and always scopes deletion to fixed predicates',()=>{
 const sql=buildApplySql(fixture());assert.match(sql,/ROLLBACK;$/);assert.doesNotMatch(sql,/TRUNCATE|DROP|DISABLE TRIGGER/);
 assert.equal((sql.match(/DELETE FROM /g)||[]).length,8);assert.equal((sql.match(/IF affected<>3/g)||[]).length,8);
 assert.ok(sql.indexOf('DELETE FROM auth.sessions')<sql.indexOf('DELETE FROM auth.users'));
 assert.match(sql,/Unbacked FK child/);assert.match(sql,/Unexpected DELETE trigger/);assert.match(sql,/Preserved data fingerprint changed/);
});
test('commit is explicit and foreign owners fail before SQL generation',()=>{
 assert.match(buildApplySql(fixture(),{commit:true}),/COMMIT;$/);
 const backup=fixture();backup.targets[0]=OWNER;assert.throws(()=>buildApplySql(backup));
});
test('session logging controls precede the transaction and secret-bearing block',()=>{
 const sql=buildApplySql(fixture());
 for(const setting of ["SET log_statement='none'","SET log_min_error_statement='panic'","SET log_min_duration_statement=-1","SET pgaudit.log='none'"]) {
   assert.ok(sql.indexOf(setting)>=0);assert.ok(sql.indexOf(setting)<sql.indexOf('BEGIN ISOLATION'));
 }
 assert.match(sql,/NOT reportable/);assert.match(sql,/count\(\*\) FROM accounts\.app_settings\)<>7/);
});
