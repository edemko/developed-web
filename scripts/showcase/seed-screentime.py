"""One-time, transactional fixture for DevelopED Demo. No device token is issued."""
import argparse,json,subprocess,uuid
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
USER='1c10d8f6-2689-4ac3-947c-3b10777844e8'
ns=uuid.UUID('d619714a-7a28-4c85-885e-3e478bfacba1')
def uid(x):return str(uuid.uuid5(ns,x))
def lit(x):return "'"+str(x).replace("'","''")+"'"
now=datetime.now(ZoneInfo('Europe/Bratislava'))
sql=['BEGIN;',"SET LOCAL lock_timeout='2s';","SET LOCAL statement_timeout='30s';",'SET LOCAL ROLE screentime_backend;',f"SELECT pg_advisory_xact_lock(hashtext('developed-demo-screentime'));",f"DO $$ BEGIN IF EXISTS(SELECT 1 FROM screentime.children WHERE owner_id='{USER}') THEN RAISE EXCEPTION 'Demo already populated'; END IF; END $$;"]
for child,name in enumerate(['Alex','Sofia']):
 cid=uid(f'child:{child}');did=uid(f'device:{child}')
 sql.append(f"INSERT INTO screentime.children(id,owner_id,display_name,birth_year) VALUES ('{cid}','{USER}','{name}',{2015+child*2});")
 sql.append(f"INSERT INTO screentime.devices(id,child_id,owner_id,label,model,manufacturer,timezone,token_hash) VALUES ('{did}','{cid}','{USER}','{name} · ukážkový tablet','Demo tablet','Demo','Europe/Bratislava',NULL);")
 sessions=[];periods=[]
 for days in range(14):
  start=(now-timedelta(days=days)).replace(hour=15,minute=0,second=0,microsecond=0)
  # On the current day, never invent observations from the future.
  if start>now:start=now.replace(hour=8,minute=0,second=0,microsecond=0)
  for ai,base in enumerate([28,18,22,14]):
   duration=base+(days*3+child*7)%13
   end=start+timedelta(minutes=duration)
   sessions.append({'package_name':['sk.developed.demo.blocks','sk.developed.demo.words','sk.developed.demo.math','sk.developed.demo.reading'][ai],'started_at':start.isoformat(),'ended_at':end.isoformat()})
   periods.append({'started_at':start.isoformat(),'ended_at':end.isoformat()})
   start=end+timedelta(minutes=12)
 apps=[{'package_name':p,'label':l,'category':c} for p,l,c in [('sk.developed.demo.blocks','Block Adventures','GAME'),('sk.developed.demo.words','Word Explorer','EDUCATION'),('sk.developed.demo.math','Math Garden','EDUCATION'),('sk.developed.demo.reading','Story Time','BOOKS')]]
 payload={'apps':apps,'sessions':sessions,'screen_periods':periods,'app_version':'demo','usage_access_ok':True,'battery_unrestricted':True,'window_from':min(s['started_at'] for s in sessions),'window_to':max(s['ended_at'] for s in sessions),'events_read':len(sessions)*2}
 sql.append(f"SELECT screentime.ingest_batch('{did}',{lit(json.dumps(payload))}::jsonb);")
sql+=['RESET ROLE;','SET LOCAL ROLE developed_accounts;',f"INSERT INTO accounts.audit(target_id,action,result,context) VALUES ('{USER}','operator_demo_data_seed','succeeded','{{\"app\":\"screentime\",\"synthetic\":true,\"children\":2,\"days\":14}}');",'COMMIT;']
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply',action='store_true')
if not parser.parse_args().apply:
 print('Preview ready for the designated demo account. Add --apply for the guarded one-time transaction.')
 raise SystemExit(0)
r=subprocess.run(['docker','exec','-i','supabase-db','psql','-U','supabase_admin','-d','postgres','-X','-q','-v','ON_ERROR_STOP=1'],input='\n'.join(sql),text=True,capture_output=True)
print(r.stdout if r.returncode==0 else r.stderr);raise SystemExit(r.returncode)
