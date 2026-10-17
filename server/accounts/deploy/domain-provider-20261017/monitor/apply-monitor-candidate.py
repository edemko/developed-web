#!/usr/bin/env python3
# Guarded one-time operator installer; never sends SMS or restarts a service.
import os,sys,stat,json,hashlib,subprocess,ast
from pathlib import Path
SOURCE=Path('/home/openclaw/Dev/developed-web/server/accounts/deploy/domain-provider-20261017/monitor')
OLD=Path('/opt/developed-control/critical-monitor-20261017-jasom-slots')
NEW=Path('/opt/developed-control/critical-monitor-20261017-domains')
BACKUP=Path('/var/backups/developed-domain-migration-20261017/monitor')
WRAPPER=Path('/usr/local/sbin/developed-monitor')
BOOT=Path('/usr/local/sbin/developed-boot-check')
DROPIN=Path('/etc/systemd/system/developed-critical-monitor.service.d/30-jasom-slots.conf')
CANDIDATE={'host-health-check.py': '0f5dc8a600c13bdb85b1d0d1faaeac9a5b8430c08968efc8250ccbc071198e89', 'critical_service_monitor.py': 'f1f2a4629ec2961087fceb32ec07b6a33d29f3e65ce0b35f9016827fda3a75fa', 'sms_gate_v1.py': '35aa91e08bfbffe414f2110a478382011ee73fd5f02212ea0eb0abde173ccceb'}
BASELINE={'host-health-check.py': '7b605391272e5cc4a9270c9179a417acbe20bbf6de2e4b9dafaa4dab2441373a', 'critical_service_monitor.py': '89be4fe8bc045847f4b0f5f3f69d22f497dad864032d4f0140c64d3dbe5b1012', 'sms_gate_v1.py': '35aa91e08bfbffe414f2110a478382011ee73fd5f02212ea0eb0abde173ccceb'}
WRAPPER_SHA='0115209fbb45879ee022b63e0d311fe2dbd83b61db771811281953e0051ff5d7'
DROPIN_SHA='52f989f16e0ea59054484b7fa646f714582531c1edafdf65cf1692327854308e'
def require(ok,label):
 if not ok:raise RuntimeError(label)
def sha(data):return hashlib.sha256(data).hexdigest()
def trusted(path,directory=False):
 s=path.lstat();require(s.st_uid==0 and not (s.st_mode&0o022) and (stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode)),'Untrusted installed path')
 return stat.S_IMODE(s.st_mode)
def write_new(path,data,mode):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as f:os.fchmod(f.fileno(),mode);f.write(data);f.flush();os.fsync(f.fileno())
def replace(path,data,mode):
 temporary=path.with_name(path.name+'.domain-new');write_new(temporary,data,mode);os.replace(temporary,path)
def command(args,timeout=15):
 r=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 require(r.returncode==0,'Command failed: '+Path(args[0]).name)
 return r.stdout
try:
 require(os.getuid()==0 and sys.argv[1:]==['--apply'],'Requires root --apply')
 trusted(OLD,True);trusted(NEW.parent,True);trusted(WRAPPER.parent,True);trusted(DROPIN.parent,True)
 require(not NEW.exists() and not BACKUP.exists(),'New release or backup already exists')
 data={name:(SOURCE/name).read_bytes() for name in CANDIDATE}
 modes={}
 for name,content in data.items():
  require(sha(content)==CANDIDATE[name],'Candidate hash changed');ast.parse(content)
  modes[name]=trusted(OLD/name);require(sha((OLD/name).read_bytes())==BASELINE[name],'Installed source changed')
 wrapper_mode=trusted(WRAPPER);dropin_mode=trusted(DROPIN)
 wrapper_before=WRAPPER.read_bytes();dropin_before=DROPIN.read_bytes()
 require(sha(wrapper_before)==WRAPPER_SHA and sha(dropin_before)==DROPIN_SHA,'Entrypoint baseline changed')
 require(BOOT.is_symlink() and BOOT.lstat().st_uid==0 and os.readlink(BOOT)==str(OLD/'host-health-check.py'),'Boot checker target changed')
 require(command(['/usr/bin/systemctl','is-active','developed-critical-monitor.timer']).strip()=='active','Monitor timer not active')
 # No credentials/state files are read, copied or modified by this installer.
 BACKUP.parent.mkdir(mode=0o700,exist_ok=True);trusted(BACKUP.parent,True);BACKUP.mkdir(mode=0o700)
 write_new(BACKUP/'developed-monitor',wrapper_before,0o600);write_new(BACKUP/'30-jasom-slots.conf',dropin_before,0o600)
 write_new(BACKUP/'boot-check-target.txt',(os.readlink(BOOT)+'\n').encode(),0o600)
 write_new(BACKUP/'manifest.json',json.dumps({'old':str(OLD),'new':str(NEW),'baseline':BASELINE,'candidate':CANDIDATE,'modes':modes,'wrapperMode':wrapper_mode,'dropinMode':dropin_mode}).encode(),0o600)
 NEW.mkdir(mode=0o755)
 for name,content in data.items():write_new(NEW/name,content,modes[name])
 wrapper=('#!/bin/sh\nexec /usr/bin/python3 -I -B '+str(NEW/'critical_service_monitor.py')+' "$@"\n').encode()
 dropin=('[Service]\nExecStart=\nExecStart=/usr/bin/python3 -I -B '+str(NEW/'critical_service_monitor.py')+'\n').encode()
 # Recheck command targets immediately before the atomic path replacements.
 require(WRAPPER.read_bytes()==wrapper_before and DROPIN.read_bytes()==dropin_before and os.readlink(BOOT)==str(OLD/'host-health-check.py'),'Entrypoints changed during preparation')
 temporary=BOOT.with_name(BOOT.name+'.domain-new');os.symlink(str(NEW/'host-health-check.py'),temporary);os.replace(temporary,BOOT)
 replace(WRAPPER,wrapper,wrapper_mode);replace(DROPIN,dropin,dropin_mode)
 command(['/usr/bin/systemctl','daemon-reload'])
 require(command(['/usr/bin/systemctl','is-active','developed-critical-monitor.timer']).strip()=='active','Monitor timer inactive')
 # --check branches before credential loading, lock/state writes, receipt polling
 # and SMS sending. Capture and summarize only; never echo arbitrary diagnostics.
 result=subprocess.run([str(WRAPPER),'--check'],capture_output=True,text=True,timeout=100)
 snapshot=json.loads(result.stdout)
 failures=snapshot.get('failures');require(isinstance(failures,list),'Unrecognized check output')
 print(json.dumps({'installed':True,'serviceRestarted':False,'timerActive':True,'readOnlyCheckPassed':result.returncode==0 and not failures,'failureCount':len(failures),'release':str(NEW)}))
 require(result.returncode==0 and not failures,'Read-only monitor check found failures; inspect via --check')
 write_new(BACKUP/'completed.json',json.dumps({'installed':True,'readOnlyCheckPassed':True}).encode(),0o600)
except RuntimeError as error:
 print(str(error),file=sys.stderr);sys.exit(1)
except Exception:
 print('Monitor installer stopped; inspect protected paths and exact state. No automatic rollback or service restart.',file=sys.stderr);sys.exit(1)
