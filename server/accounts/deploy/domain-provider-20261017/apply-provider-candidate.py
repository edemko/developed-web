#!/usr/bin/env python3
# Parent-reviewed operator only; staged script does nothing unless root --apply.
import os,sys,json,hashlib,subprocess,time,stat
from pathlib import Path
ROOT=Path('/home/openclaw/tmp/domain-provider-migration-20261017')
BACKUP=Path('/var/backups/developed-domain-migration-20261017')
CONTROL=Path('/opt/developed-control/domain-provider')
NODE='/opt/developed-runtimes/node-v24.21.0/bin/node'
HASHES={'domain-provider-stage.mjs': 'fd8e63af3bc24f8371ede9bfb395c2ce74359344c7ba1ca9b7c42d660d48e415', 'domain-provider-boundary.mjs': 'd9741d63df1cafc66a33d9ab03a0dd43eef0ac8ef0919ce360071f3f89fcbd7b', 'domain-provider-load-boundary.mjs': '2ebcb2c103fca9c5518c7d094bb5070e6cdb5aae8a06fb4479a583ab0dcb5cc9', 'domain-provider-verify.mjs': '3b853b53aab21c55f36b22673c59aef06cceb9673b06bf01fa3b6e5050b353ec', 'domain-provider-runtime.service': '5b588568caa82f60fed2938e889cabffe84eb78e5d97e5b7f31b3bb5aac20ce4', 'domain-provider-boundary.service': '236c3cbdfca3e786dd6d75d26d33653d2821d11e7805b655ca8b4ae84ccb2d9f', 'uid-network-boundary.baseline.json': '80f6c08071de18270b1110c025b946ad18e6ec8037b321af566e314001b6cfee', 'uid-network-boundary.candidate.json': '03a54e4d1ea824f27f427997f46fd45ee97d726fefd0e7894d3f331625b596b3', 'bind-boundary.baseline.json': 'd9f64b8622e0e0726ed83d160756a653d813cc92302f8cd5bbc881bdfb743256', 'bind-boundary.candidate.json': '1ade54c598bcc7b35ea150d019388ede4809525cc957d4bcd8fab2c1569a32ac'}
UIDSOURCE=Path('/opt/developed-control/network-music-e307109/uid-network-boundary.mjs')
UIDHASH='e7273bc5fc4bfa7d5f2af8bbed644d2ddbc49475d491e3df93a386caca69d6e3'
def require(ok,label):
 if not ok:raise RuntimeError(label)
def run(args,timeout=40):
 r=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 require(r.returncode==0,'Command failed: '+Path(args[0]).name+' '+args[1])
 return r.stdout
def sha(data):return hashlib.sha256(data).hexdigest()
def trusted_dir(path):
 s=path.lstat();require(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not (s.st_mode & 0o022),'Untrusted directory')
def create_file(path,data,mode=0o600):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as f:f.write(data)
def atom_replace(path,data):
 tmp=path.with_name(path.name+'.domain-migration-new')
 create_file(tmp,data);os.replace(tmp,path)
def probe(uid,url,expected):
 source="import os,urllib.request; os.setgroups([]); os.setgid(int(os.environ['PROBE_UID'])); os.setuid(int(os.environ['PROBE_UID'])); print(urllib.request.urlopen(os.environ['PROBE_URL'],timeout=2).status)"
 r=subprocess.run(['/usr/bin/python3','-c',source],env={'PROBE_UID':str(uid),'PROBE_URL':url},capture_output=True,text=True,timeout=4)
 require((r.returncode==0 and r.stdout.strip()=='200')==expected,'Private control probe mismatch')
def nc(container,host,port,expected):
 r=subprocess.run(['/usr/bin/docker','exec',container,'nc','-z','-w','2',host,str(port)],capture_output=True,timeout=5)
 require((r.returncode==0)==expected,'Provider network probe mismatch')
try:
 require(os.getuid()==0 and sys.argv[1:]==['--apply'],'Requires root --apply')
 data={name:(ROOT/name).read_bytes() for name in HASHES}
 for name,content in data.items():require(sha(content)==HASHES[name],'Candidate hash mismatch')
 require(sha(UIDSOURCE.read_bytes())==UIDHASH,'Live UID generator changed')
 for name in ['uid-network-boundary','bind-boundary']:
  current=Path('/etc/developed-accounts/'+name+'.json')
  require(current.read_bytes()==data[name+'.baseline.json'],'Live policy differs from reviewed baseline')
 require(not CONTROL.exists(),'Control destination already exists')
 for unit in ['domain-provider-boundary.service','developed-auth-domain.service']:
  require(not Path('/etc/systemd/system/'+unit).exists(),'Unit already exists')
 BACKUP.mkdir(mode=0o700,exist_ok=True);trusted_dir(BACKUP)
 state=BACKUP/'provider';state.mkdir(mode=0o700,exist_ok=False);trusted_dir(state)
 for name in ['uid-network-boundary','bind-boundary']:
  create_file(state/(name+'.json'),data[name+'.baseline.json'])
 create_file(state/'approved-hashes.json',json.dumps(HASHES,indent=2).encode())
 CONTROL.mkdir(mode=0o755);trusted_dir(CONTROL)
 for name in ['domain-provider-stage.mjs','domain-provider-boundary.mjs','domain-provider-load-boundary.mjs','domain-provider-verify.mjs']:
  create_file(CONTROL/name,data[name],0o644)
 run([NODE,str(CONTROL/'domain-provider-stage.mjs'),'--check'])
 for name in ['uid-network-boundary','bind-boundary']:
  atom_replace(Path('/etc/developed-accounts/'+name+'.json'),data[name+'.candidate.json'])
 run(['/usr/bin/systemctl','reload','developed-uid-boundary.service'])
 # Bind wire policy is identical: protectedPorts is validation metadata only;
 # no reload is necessary and no runtime UID gains listener permission.
 rules=run(['/usr/sbin/nft','list','table','inet','developed_uid_boundary'])
 for fragment in ['ip daddr 127.0.0.1 tcp dport 3142','ip6 daddr ::1 tcp dport 3142','ip daddr 172.30.242.2 tcp dport 9999']:
  require(fragment in rules,'New UID control rule absent')
 run([NODE,str(CONTROL/'domain-provider-stage.mjs'),'--create'],90)
 for source,target in [('domain-provider-runtime.service','developed-auth-domain.service'),('domain-provider-boundary.service','domain-provider-boundary.service')]:
  create_file(Path('/etc/systemd/system')/target,data[source],0o644)
 run(['/usr/bin/systemd-analyze','verify','/etc/systemd/system/developed-auth-domain.service','/etc/systemd/system/domain-provider-boundary.service'])
 run(['/usr/bin/systemctl','daemon-reload'])
 run(['/usr/bin/systemctl','start','domain-provider-boundary.service'])
 for family in ['inet','bridge']:
  rules=run(['/usr/sbin/nft','list','table',family,'developed_domain_provider'])
  require('172.30.242.2' in rules and '172.30.242.3' in rules,'New egress gate missing')
 run(['/usr/bin/systemctl','start','developed-auth-domain.service'])
 for attempt in range(15):
  try:probe(0,'http://127.0.0.1:3142/health',True);break
  except RuntimeError:
   if attempt==14:raise
   time.sleep(1)
 run([NODE,str(CONTROL/'domain-provider-verify.mjs')])
 policy=json.loads(data['uid-network-boundary.candidate.json'])
 for uid in [0,988,999]:
  for url in ['http://127.0.0.1:3142/health','http://172.30.242.2:9999/health']:probe(uid,url,True)
 for uid in sorted({1000,65534,*[a['uid'] for a in policy['apps']],policy['downloadRelayUid'],policy['importFrontUid'],policy['downloadStatusUid'],policy['dataBoundaryUid']}):
  for url in ['http://127.0.0.1:3142/health','http://172.30.242.2:9999/health']:probe(uid,url,False)
 nc('developed-auth-domain','172.30.242.3',5432,True)
 nc('developed-auth-domain','172.30.241.3',5432,False)
 nc('developed-auth-domain','172.30.242.1',3140,False)
 nc('developed-auth-domain','1.1.1.1',443,False)
 nc('developed-auth-domain','169.254.169.254',80,False)
 nc('supabase-db','172.30.242.2',9999,False)
 probe(0,'http://127.0.0.1:3141/health',True)
 run(['/usr/bin/systemctl','enable','domain-provider-boundary.service','developed-auth-domain.service'])
 create_file(state/'completed.json',json.dumps({'status':'parallel-provider-private-verified','port':3142,'oldProviderHealthy':True}).encode())
 print('Parallel provider started privately, parity/control/DB-only checks passed, old provider healthy. No public route changed.')
except Exception:
 # Never expose captured env, credential-bearing command failures or provider logs.
 print('Provider install stopped at a failed guard. Inspect exact protected state; no automatic rollback, public route change or old-service stop performed.',file=sys.stderr)
 sys.exit(1)
