import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';

test('isolated music migration preserves old clients and binds three native platforms',{
 skip:process.env.ACCOUNTS_SQL_ISOLATED!=='1',timeout:60000,
},async()=>{
 const name=`music-identity-migration-${process.pid}-${randomUUID().slice(0,8)}`;
 const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000});
 let pool;
 try{
  docker(['run','-d','--pull=never','--name',name,'--label','developed.music.migration.test=true','-p','127.0.0.1::5432','--memory','256m','--cpus','1',
   '--tmpfs','/var/lib/postgresql/data:rw,size=128m','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine']);
  const port=Number(docker(['port',name,'5432/tcp']).trim().split(':').at(-1));
  pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',database:'postgres',max:1});
  let ready=false;for(let n=0;n<80;n++){try{await pool.query('SELECT 1');ready=true;break;}catch{await delay(250);}}assert.ok(ready);
  await pool.query(`create role developed_accounts;create role anon;create role authenticated;
   create schema auth;create table auth.users(id uuid primary key);
   create schema accounts;create table accounts.app_settings(app_id text primary key);
   insert into accounts.app_settings values('app_kestrek'),('app_mega_music');
   create table accounts.oauth_clients(client_id uuid primary key,app_id text references accounts.app_settings(app_id),client_kind text,callback_url text,enabled boolean default true,
    constraint oauth_clients_check check ((client_kind='web' and callback_url ~ '^https://') or (client_kind='native' and app_id='app_kestrek' and callback_url='sk.kestrek://oauth/callback')));
   create unique index oauth_clients_callback_idx on accounts.oauth_clients(callback_url) where enabled;
   insert into accounts.oauth_clients values(gen_random_uuid(),'app_kestrek','native','sk.kestrek://oauth/callback',true),
    (gen_random_uuid(),'app_mega_music','web','https://megamusic.developed.sk/api/music/auth/callback',true);`);
  await pool.query(readFileSync(new URL('../../../supabase/migrations/20260921163940_mega_music_native_clients.sql',import.meta.url),'utf8'));
  assert.equal((await pool.query("select platform from accounts.oauth_clients where app_id='app_kestrek'")).rows[0].platform,'android');
  for(const platform of ['android','macos','ios'])await pool.query("insert into accounts.oauth_clients values($1,'app_mega_music','native','sk.developed.megamusic://oauth/callback',true,$2)",[randomUUID(),platform]);
  await assert.rejects(pool.query("insert into accounts.oauth_clients values($1,'app_kestrek','native','sk.developed.megamusic://oauth/callback',true,'ios')",[randomUUID()]));
  await assert.rejects(pool.query("insert into accounts.oauth_clients values($1,'app_mega_music','native','sk.developed.megamusic://oauth/callback',true,NULL)",[randomUUID()]));
  await assert.rejects(pool.query("insert into accounts.oauth_clients values($1,'app_mega_music','native','sk.developed.megamusic://oauth/callback',true,'ios')",[randomUUID()]));
  await pool.query('set role anon');await assert.rejects(pool.query('select * from accounts.product_registrations'));await pool.query('reset role');
 }finally{
  await pool?.end();const metadata=JSON.parse(docker(['inspect',name]))[0];assert.equal(metadata.Config.Labels['developed.music.migration.test'],'true');docker(['rm','-f','-v',name]);
 }
});
