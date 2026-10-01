// Explicitly authorized copy from Erik's library to DevelopED Demo. Never changes originals.
// Run with the protected Mega Music runtime environment; no credential output.
import pg from '/opt/developed-apps/mega-music/releases/5c1fd62b79dfc242b0ef6d777ac57c1bb3b7f417/node_modules/pg/lib/index.js';
import * as s4 from '/opt/developed-apps/mega-music/releases/5c1fd62b79dfc242b0ef6d777ac57c1bb3b7f417/s4.mjs';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const owner='4c3e497a-511d-49dc-85fe-60f3cc37c3ae',demo='1c10d8f6-2689-4ac3-947c-3b10777844e8';
const choices=[
['83ffcae2-cf5f-435a-8ad5-6fe2714aea2e','Calvin Harris & Dua Lipa — One Kiss.m4a','Dance'],
['cd641366-2b68-445a-8f29-ebd4645f42e1','Foxes — Holding Onto Heaven (Kove Remix).m4a','Drum & Bass'],
['7dd2fd4c-7f49-408a-9443-3565f1a231f9','Andy C & Fiora — Heartbeat Loud.m4a','Drum & Bass'],
['65d57592-5e77-439f-8814-d5c33f1850d5','A Tribe Called Quest — Electric Relaxation.m4a','Hip-Hop'],
['5f46c5be-db00-4f39-81cd-a432fbbe72f1','ACRAZE feat. Cherish — Do It To It.m4a','Dance'],
['de668bee-06fa-4dc7-9143-9091ee39ee2a','Au5 feat. Fiora — Guardians.m4a','Electronic'],
['59dbe77c-99ea-41b5-85b0-6d1a98f6ab00','Slynk & JPod — Just Stay There.m4a','Funk'],
['8154bf54-d140-4414-b6ed-449589ca9ee6','Slynk — Inside.m4a','Funk'],
['877322a6-4656-4f73-bda6-6e88c5954a79','J Majik & Wickaman feat. Rita Campbell — Crazy World.m4a','Drum & Bass'],
['930fad17-2968-469b-8434-dd63319c59fc','Bassnectar — Blow (C1TZN X Edit).mp3','Electronic'],
['328cb2e8-004e-49ff-a5b1-eaaf2025267e','Ana Tijoux — 1977.m4a','Hip-Hop'],
['51fdd7da-f05d-44f4-b52f-363a1cc698bf','Extraordinary (Sigma Remix).m4a','Drum & Bass']];
const db=new pg.Client({connectionString:process.env.DATABASE_URL,statement_timeout:15000});
const context={endpoint:process.env.MANAGED_S4_ENDPOINT,region:process.env.MANAGED_S4_REGION,bucket:process.env.MANAGED_S4_BUCKET,prefix:process.env.MANAGED_S4_PREFIX||'users/',credentials:{accessKeyId:process.env.MANAGED_S4_ACCESS_KEY,secretAccessKey:process.env.MANAGED_S4_SECRET_KEY}};
const receipt='/home/openclaw/.local/share/developed-demo/showcases/music-copy-receipt.json';
let phase='preflight';
try{
await db.connect();
const readAs=async(user,fn)=>{await db.query('BEGIN READ ONLY');try{await db.query("SELECT set_config('mega_music.user_id',$1,true)",[user]);const result=await fn();await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}};
const source=await readAs(owner,async()=>{const p=(await db.query('SELECT email FROM mega_music.profiles WHERE user_id=$1',[owner])).rows[0];if(p?.email!=='erik.demko162@gmail.com')throw Error('source');return(await db.query("SELECT id,object_key,size_bytes FROM mega_music.songs WHERE user_id=$1 AND id=ANY($2::uuid[]) AND state='ready'",[owner,choices.map(c=>c[0])])).rows;});
if(source.length!==choices.length)throw Error('missing source');
const bytes=source.reduce((sum,s)=>sum+Number(s.size_bytes),0);
await readAs(demo,async()=>{const p=(await db.query('SELECT email,library_version,quota_bytes FROM mega_music.profiles WHERE user_id=$1',[demo])).rows[0];const count=(await db.query('SELECT count(*) FROM mega_music.songs WHERE user_id=$1',[demo])).rows[0];if(p?.email!=='demo@developed.sk'||p.library_version!==1||Number(count.count)!==0||bytes>Number(p.quota_bytes))throw Error('target');});
const folder=randomUUID();const tracks=choices.map(([sourceId,name,category],i)=>{const original=source.find(s=>s.id===sourceId);const id=randomUUID();return{id,sourceId,name,category,sourceKey:original.object_key,key:`${context.prefix}${demo}/objects/demo-showcase/${id}/${name}`,size:Number(original.size_bytes),rating:4+(i%2)};});
writeFileSync(receipt,JSON.stringify({status:'copying',folder,tracks},null,2),{mode:0o600,flag:'wx'});
phase='copy';for(const track of tracks){const existing=await s4.headObject(context,track.key);if(existing)throw Error('target exists');const head=await s4.headObject(context,track.sourceKey);if(head?.size!==track.size)throw Error('source size');await s4.copyObject(context,track.sourceKey,track.key,head.etag);const copied=await s4.headObject(context,track.key);if(copied?.size!==track.size)throw Error('copy size');console.log('Copied',track.name);}
phase='catalog';await db.query('BEGIN');await db.query("SELECT set_config('mega_music.user_id',$1,true)",[demo]);const profile=(await db.query('SELECT quota_bytes FROM mega_music.profiles WHERE user_id=$1 FOR UPDATE',[demo])).rows[0];const total=(await db.query('SELECT coalesce(sum(size_bytes),0) AS bytes FROM mega_music.songs WHERE user_id=$1',[demo])).rows[0];if(Number(total.bytes)+bytes>Number(profile.quota_bytes))throw Error('quota changed');
await db.query('INSERT INTO mega_music.folders(id,user_id,name,comparison_name) VALUES($1,$2,$3,$3)',[folder,demo,'Good Songs']);
for(const track of tracks)await db.query('INSERT INTO mega_music.songs(id,user_id,folder_id,name,comparison_name,object_key,size_bytes,rating,rating_steps,category,tags) VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10)',[track.id,demo,folder,track.name,track.key,track.size,track.rating,track.rating*2,track.category,['Good vibes','Demo collection']]);
await db.query('COMMIT');writeFileSync(receipt,JSON.stringify({status:'complete',folder,bytes,tracks:tracks.map(({sourceKey,key,...track})=>track)},null,2),{mode:0o600});console.log(JSON.stringify({songs:tracks.length,bytes,folder:'Good Songs',sourceUntouched:true}));
}catch{await db.query('ROLLBACK').catch(()=>{});console.error('Copy stopped during '+phase+'; inspect private receipt before retrying.');process.exitCode=1;}finally{await db.end();}
