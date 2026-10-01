"""Private demo organisation and general-knowledge tests. Keeps the demo a member."""
import argparse,json,subprocess,uuid
from pathlib import Path
USER='1c10d8f6-2689-4ac3-947c-3b10777844e8'
ns=uuid.UUID('ae63d0ef-a544-4897-a153-16b38768a746')
def uid(key):return str(uuid.uuid5(ns,key))
def lit(v):
 if v is None:return 'NULL'
 if isinstance(v,bool):return 'true' if v else 'false'
 if isinstance(v,int):return str(v)
 return "'"+str(v).replace("'","''")+"'"
org=uid('org');rows=[]
def insert(table,**values):rows.append('INSERT INTO otazkomat.'+table+' ('+','.join(values)+') VALUES ('+','.join(lit(v) for v in values.values())+');')
insert('organizations',id=org,name='Akadémia Horizont · Demo',description='Súkromná ukážková organizácia. Všetky údaje sú fiktívne.',organization_type='other',organization_kind='organization',created_by=USER)
insert('user_organization_memberships',id=uid('member'),user_id=USER,organization_id=org,role='member',is_active=True)
modules=[('Digitálny svet','Zorientujte sa v technológiách, ktoré používame každý deň.','Digitálna gramotnosť',[
('Na čo slúži internetový prehliadač?',['Na otváranie webových stránok','Na nabíjanie počítača','Na tlač fotografií'],0),
('Čo znamená skratka PDF?',['Portable Document Format','Personal Data Folder','Public Download File'],0),
('Ktorá prípona zvyčajne označuje obrázok?',['.jpg','.mp3','.zip'],0),
('Na čo slúži záložka v prehliadači?',['Na uloženie odkazu na stránku','Na zvýšenie jasu obrazovky','Na zmenu klávesnice'],0),
('Čo označuje pojem cloudové úložisko?',['Úložisko dostupné cez internet','Pamäť iba na USB kľúči','Priečinok na pracovnej ploche'],0)]),
('Svet okolo nás','Objavujte prírodu, mestá a zaujímavosti zo sveta.','Zem a príroda',[
('Ktoré mesto je hlavným mestom Slovenska?',['Bratislava','Košice','Žilina'],0),
('Koľko dní má priestupný rok?',['366','365','364'],0),
('Ktorá planéta je najbližšie k Slnku?',['Merkúr','Venuša','Mars'],0),
('Aký plyn rastliny uvoľňujú pri fotosyntéze?',['Kyslík','Hélium','Vodík'],0),
('Ktorý oceán je najväčší?',['Tichý oceán','Atlantický oceán','Indický oceán'],0)]),
('Angličtina v praxi','Krátke kvízy pre istotu v každodennej komunikácii.','Každodenné situácie',[
('Ako po anglicky pozdravíme ráno?',['Good morning','Good night','Goodbye'],0),
('Čo znamená slovo library?',['Knižnica','Kníhkupectvo','Laboratórium'],0),
('Doplňte: She ___ a book every week.',['reads','read','reading'],0),
('Ktoré slovo označuje ročné obdobie?',['Spring','Monday','Morning'],0),
('Ako zdvorilo požiadať o pomoc?',['Could you help me, please?','Go away.','See you later.'],0)])]
for mi,(name,desc,subname,questions) in enumerate(modules):
 mid=uid(f'module:{mi}');sid=uid(f'submodule:{mi}')
 insert('modules',id=mid,name=name,description=desc,organization_id=org,created_by=USER,sort_order=mi)
 insert('submodules',id=sid,module_id=mid,name=subname,description=desc,organization_id=org,created_by=USER)
 insert('user_module_assignments',id=uid(f'assignment:{mi}'),user_id=USER,module_id=mid,organization_id=org,can_view=True,can_edit=False,can_delete=False,can_assign_tests=False,assigned_by=USER)
 for ti in range(2):
  tid=uid(f'test:{mi}:{ti}')
  insert('tests',id=tid,submodule_id=sid,title=f'{subname} · '+('Overte si základy' if ti==0 else 'Krátke opakovanie'),description='Ukážkový vedomostný test s piatimi otázkami.',time_limit_minutes=10,passing_score_percentage=60,organization_id=org,created_by=USER,sort_order=ti)
  insert('user_test_access',id=uid(f'access:{mi}:{ti}'),user_id=USER,test_id=tid,organization_id=org,is_active=True,granted_by=USER)
  for qi,(question,options,correct) in enumerate(questions):
   qid=uid(f'question:{mi}:{ti}:{qi}');insert('questions',id=qid,test_id=tid,question_text=question,question_type='single_choice',sort_order=qi,points=1,explanation=options[correct])
   # Vary answer positions so screenshots look like a normal quiz.
   offset=qi%3
   for oi in range(3):
    source=(oi+offset)%3
    insert('question_options',id=uid(f'option:{mi}:{ti}:{qi}:{oi}'),question_id=qid,option_text=options[source],is_correct=source==correct,sort_order=oi)
pre=['BEGIN;',"SET LOCAL lock_timeout='2s';","SET LOCAL statement_timeout='30s';",'SET LOCAL ROLE otazkomat_backend;','SET LOCAL search_path=otazkomat,pg_catalog;',f"SELECT pg_advisory_xact_lock(hashtext('developed-demo-otazkomat'));",f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM otazkomat.users WHERE id='{USER}' AND email='demo@developed.sk' AND role='member') OR EXISTS(SELECT 1 FROM otazkomat.organizations WHERE id='{org}') THEN RAISE EXCEPTION 'Demo precondition failed'; END IF; END $$;"]
# Only the newly created demo identity's default membership is deactivated.
rows.append(f"UPDATE otazkomat.user_organization_memberships SET is_active=false,updated_at=now() WHERE user_id='{USER}' AND organization_id='a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';")
post=['RESET ROLE;','SET LOCAL ROLE developed_accounts;',f"INSERT INTO accounts.audit(target_id,action,result,context) VALUES ('{USER}','operator_demo_data_seed','succeeded','{{\"app\":\"otazkomat\",\"synthetic\":true,\"organization\":\"{org}\",\"tests\":6}}');",'COMMIT;']
# Insert every option set atomically; the live AFTER INSERT guard requires a correct option.
option_rows=[row for row in rows if row.startswith('INSERT INTO otazkomat.question_options ')]
rows=[row for row in rows if not row.startswith('INSERT INTO otazkomat.question_options ')]
head=option_rows[0].split(' VALUES ')[0]+' VALUES '
rows.append(head+',\n'.join(row.split(' VALUES ')[1].removesuffix(';') for row in option_rows)+';')
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply',action='store_true')
if not parser.parse_args().apply:
 print('Preview ready for the designated demo account. Add --apply for the guarded one-time transaction.')
 raise SystemExit(0)
r=subprocess.run(['docker','exec','-i','supabase-db','psql','-U','supabase_admin','-d','postgres','-X','-q','-v','ON_ERROR_STOP=1'],input='\n'.join(pre+rows+post),text=True,capture_output=True)
print(r.stderr if r.returncode else json.dumps({'organization':org,'modules':3,'tests':6,'questions':30}));raise SystemExit(r.returncode)
