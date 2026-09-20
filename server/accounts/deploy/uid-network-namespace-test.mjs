// Opt-in root-assisted test. Every networking command runs INSIDE a new,
// unconnected network namespace. Never applies rules to the host namespace.
import assert from 'node:assert/strict';
import { execFileSync,spawn } from 'node:child_process';
import { readlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateRules } from './uid-network-boundary.mjs';

const self=fileURLToPath(import.meta.url), mode=process.argv[2];
const run=(command,args,input)=>execFileSync(command,args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const children=[];
async function readyChild(command,args) {
  const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});children.push(child);
  await new Promise((resolve,reject)=>{
    let output='';const timeout=setTimeout(()=>reject(new Error('Fixture child startup timeout')),5000);
    child.stdout.on('data',data=>{output+=data;if(output.includes('READY')){clearTimeout(timeout);resolve();}});
    child.once('error',error=>{clearTimeout(timeout);reject(error);});
    child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Fixture child exited ${code}`));});
  });
  return child;
}
function ensureIsolated(hostNamespace) {
  if(process.getuid()!==0 || !/^net:\[\d+\]$/.test(hostNamespace||'')) throw new Error('Explicit isolated root namespace required');
  const current=readlinkSync('/proc/self/ns/net');
  if(current===hostNamespace || current===readlinkSync('/proc/1/ns/net')) throw new Error('Refusing host network namespace');
}
const serverSource=`const net=require('node:net'),dgram=require('node:dgram');
  const uid=Number(process.argv[1]), endpoints=JSON.parse(process.argv[2]);
  if(uid){process.setgroups([]);process.setgid(uid);process.setuid(uid);}
  Promise.all(endpoints.map(([host,port,udp])=>new Promise((resolve,reject)=>{
    if(udp){const s=dgram.createSocket(host.includes(':')?'udp6':'udp4');s.on('error',reject);s.on('message',(m,r)=>s.send(m,r.port,r.address));s.bind(port,host,resolve);}
    else {const s=net.createServer(c=>c.on('data',d=>c.write(d)));s.on('error',reject);s.listen(port,host,resolve);}
  }))).then(()=>console.log('READY')).catch(()=>process.exit(2));`;
const probeSource=`const net=require('node:net'),dgram=require('node:dgram');
  const uid=Number(process.argv[1]),host=process.argv[2],port=Number(process.argv[3]),udp=process.argv[4]==='udp';
  if(uid){process.setgroups([]);process.setgid(uid);process.setuid(uid);}
  let done=false;const finish=ok=>{if(!done){done=true;process.exit(ok?0:1)}};setTimeout(()=>finish(false),Number(process.argv[5]||600));
  if(udp){const s=dgram.createSocket(host.includes(':')?'udp6':'udp4');s.on('error',()=>finish(false));s.on('message',m=>finish(m.toString()==='probe'));s.send('probe',port,host);}
  else{const s=net.connect({host,port},()=>s.write('probe'));s.on('error',()=>finish(false));s.on('data',d=>finish(d.toString()==='probe'));}`;
async function probe(uid,host,port,allowed,label,udp=false) {
  const child=spawn(process.execPath,['-e',probeSource,String(uid),host,String(port),udp?'udp':'tcp'],{stdio:'ignore'});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  assert.equal(code===0,allowed,label);
}

if(mode==='--run') {
  const host=readlinkSync('/proc/self/ns/net');
  const child=spawn('sudo',['-n','unshare','--net','--',process.execPath,self,'--inside',host],{stdio:'inherit'});
  child.once('exit',code=>{process.exitCode=code??1;});
} else if(mode==='--peer') {
  ensureIsolated(process.argv[3]);run('ip',['link','set','lo','up']);
  process.stdout.write('READY\n');
  // The controlling isolated namespace configures our veth before requesting
  // listeners through nsenter. This keeps this peer namespace alive only.
  setInterval(()=>{},1000);
} else if(mode==='--inside') {
  ensureIsolated(process.argv[3]);
  const host=process.argv[3];
  try {
    run('ip',['link','set','lo','up']);
    const peer=await readyChild('unshare',['--net','--',process.execPath,self,'--peer',host]);
    assert.notEqual(readlinkSync(`/proc/${peer.pid}/ns/net`),readlinkSync('/proc/self/ns/net'));
    run('ip',['link','add','fixture0','type','veth','peer','name','fixture1']);
    run('ip',['link','set','fixture1','netns',String(peer.pid)]);
    run('ip',['addr','add','8.8.8.1/24','dev','fixture0']);
    run('ip',['addr','add','172.22.40.1/24','dev','fixture0']);
    run('ip',['addr','add','11.77.40.1/24','dev','fixture0']);
    run('ip',['-6','addr','add','2003:1::1/64','dev','fixture0','nodad']);
    for(const ip of ['fd00:77::1/64','2003:77::1/64','2002:1::1/64','64:ff9b::1/96']) run('ip',['-6','addr','add',ip,'dev','fixture0','nodad']);
    run('ip',['link','set','fixture0','up']);
    const inPeer=args=>run('nsenter',[`--net=/proc/${peer.pid}/ns/net`,'--',...args]);
    inPeer(['ip','addr','add','8.8.8.8/24','dev','fixture1']);
    inPeer(['ip','addr','add','172.22.40.2/24','dev','fixture1']);
    inPeer(['ip','addr','add','11.77.40.2/24','dev','fixture1']);
    inPeer(['ip','-6','addr','add','2003:1::2/64','dev','fixture1','nodad']);
    for(const ip of ['fd00:77::2/64','2003:77::2/64','2002:1::2/64','64:ff9b::a00:2/96']) inPeer(['ip','-6','addr','add',ip,'dev','fixture1','nodad']);
    inPeer(['ip','link','set','fixture1','up']);
    await readyChild('nsenter',[`--net=/proc/${peer.pid}/ns/net`,'--',process.execPath,'-e',serverSource,'0',JSON.stringify([
      ['8.8.8.8',443],['8.8.8.8',443,true],['8.8.8.8',80],['2003:1::2',443],['2003:1::2',80],
      ['172.22.40.2',9999],['fd00:77::2',9999],
      ...['172.22.40.2','11.77.40.2','fd00:77::2','2003:77::2','2002:1::2','64:ff9b::a00:2'].map(ip=>[ip,443])])]);
    // A separate sender exercises actual FORWARD traffic like a sibling Docker
    // bridge. Namespace-root must not inherit trusted host-root's UID exception.
    const sender=await readyChild('unshare',['--net','--',process.execPath,self,'--peer',host]);
    run('ip',['link','add','sender0','type','veth','peer','name','sender1']);
    run('ip',['link','set','sender1','netns',String(sender.pid)]);
    run('ip',['addr','add','10.77.0.1/24','dev','sender0']);
    run('ip',['-6','addr','add','fd00:78::1/64','dev','sender0','nodad']);
    run('ip',['link','set','sender0','up']);
    const inSender=args=>run('nsenter',[`--net=/proc/${sender.pid}/ns/net`,'--',...args]);
    inSender(['ip','addr','add','10.77.0.2/24','dev','sender1']);
    inSender(['ip','-6','addr','add','fd00:78::2/64','dev','sender1','nodad']);
    inSender(['ip','link','set','sender1','up']);
    inSender(['ip','route','add','172.22.40.0/24','via','10.77.0.1']);
    inSender(['ip','-6','route','add','fd00:77::/64','via','fd00:78::1']);
    inPeer(['ip','route','add','10.77.0.0/24','via','172.22.40.1']);
    inPeer(['ip','-6','route','add','fd00:78::/64','via','fd00:77::1']);
    run('sysctl',['-q','-w','net.ipv4.ip_forward=1']);
    run('sysctl',['-q','-w','net.ipv6.conf.all.forwarding=1']);
    const forwardProbe=(address,port,allowed)=>{
      let ok=true;
      // Initial IPv6 neighbor discovery across two links needs a longer budget
      // than already-established one-hop probes; don't misclassify it as denial.
      try {inSender([process.execPath,'-e',probeSource,'0',address,String(port),'tcp','2500']);} catch {ok=false;}
      assert.equal(ok,allowed,`forwarded ${address}:${port}`);
    };
    for(const address of ['172.22.40.2','fd00:77::2']) forwardProbe(address,9999,true);
    // Local aliases exercise Docker/private/tailnet/link-local/metadata/public
    // host addresses without contacting any host or external service.
    for(const ip of ['172.30.40.2','172.30.40.3','100.100.100.100','169.254.169.254','9.9.9.9']) run('ip',['addr','add',`${ip}/32`,'dev','lo']);
    await readyChild(process.execPath,['-e',serverSource,'0',JSON.stringify([
      ['127.0.0.1',3141],['::1',3141],['127.0.0.1',5432],['::1',5432],['127.0.0.1',18887],
      ['127.0.0.1',8787],['127.0.0.1',1088],['127.0.0.1',1089],['::1',1089],['127.0.0.1',18088],['127.0.0.1',4416],
      ['127.0.0.1',8000],['::1',8000],['127.0.0.53',53],['127.0.0.53',53,true],['::1',53],['::1',53,true],
      ['172.30.40.2',9999],['172.30.40.2',443],['172.30.40.3',5432],['100.100.100.100',443],
      ['169.254.169.254',443],['9.9.9.9',443]])]);
    await readyChild(process.execPath,['-e',serverSource,'61003',JSON.stringify([['127.0.0.1',3100],['::1',3100]])]);
    // Establish a forbidden connection BEFORE installing the policy. Its next
    // original-direction packet must not inherit an "established" exemption.
    const persistent=spawn(process.execPath,['-e',`
      const net=require('node:net');process.setgroups([]);process.setgid(61003);process.setuid(61003);
      const s=net.connect({host:'127.0.0.1',port:8000},()=>s.write('first'));let first=true;
      s.on('data',()=>{if(first){first=false;console.log('READY');}else process.exit(3)});
      s.on('error',()=>process.exit(first?2:0));process.stdin.once('data',()=>{s.write('second');setTimeout(()=>process.exit(0),650)});
    `],{stdio:['pipe','pipe','pipe']});children.push(persistent);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Persistent fixture timeout')),2000);persistent.stdout.once('data',()=>{clearTimeout(timer);resolve();});persistent.once('error',reject);});
    const config={version:1,centralUid:61001,caddyUid:61002,downloadRelayUid:61006,protectForwardedControl:true,blockedNetworks:['11.77.0.0/16','2003:77::/48'],
      extraControlEndpoints:[{address:'172.30.40.2',port:9999},{address:'172.22.40.2',port:9999},{address:'fd00:77::2',port:9999}],apps:[
        {name:'mega-music',uid:61003,database:[{address:'127.0.0.1',port:5432},{address:'::1',port:5432},{address:'172.30.40.3',port:5432}],
          dns:[{address:'127.0.0.53',port:53},{address:'::1',port:53}],musicImport:{address:'127.0.0.1',port:18887}},
        {name:'vocabulum',uid:61004,database:[],dns:[{address:'127.0.0.53',port:53}]},
        {name:'mega-youtube',uid:61007,database:[],dns:[{address:'127.0.0.53',port:53}],
          downloadRelay:{address:'127.0.0.1',port:1088},downloadStatus:{address:'127.0.0.1',port:18088},downloadProvider:{address:'127.0.0.1',port:4416}},
        {name:'jasom-worker',uid:61008,database:[{address:'127.0.0.1',port:5432},{address:'172.30.40.3',port:5432}],dns:[{address:'127.0.0.53',port:53}],
          downloadRelay:{address:'127.0.0.1',port:1088},downloadStatus:{address:'127.0.0.1',port:18088}}]};
    const rules=generateRules(config);
    run('nft',['--check',rules]);run('nft',[rules]);
    assert.throws(()=>run('nft',[rules]),'initial install must not merge into an existing table');
    for(const address of ['172.22.40.2','fd00:77::2']) {
      forwardProbe(address,9999,false);
      forwardProbe(address,443,true);
    }
    const persistentExit=new Promise(resolve=>persistent.once('exit',resolve));persistent.stdin.end('continue');
    assert.equal(await persistentExit,0,'pre-existing forbidden connection retained access');
    const positives=[
      [61003,'127.0.0.1',5432],[61003,'::1',5432],[61003,'172.30.40.3',5432],
      [61003,'127.0.0.1',18887],[61001,'127.0.0.1',3141],[61002,'::1',3141],[0,'127.0.0.1',3141],
      [61001,'172.30.40.2',9999],[0,'127.0.0.1',3100],[0,'::1',3100],
      [61003,'8.8.8.8',443],[61003,'2003:1::2',443],
      [61007,'127.0.0.1',1088],[61007,'127.0.0.1',18088],[61007,'127.0.0.1',4416],
      [61008,'127.0.0.1',1088],[61008,'127.0.0.1',18088],
      [61006,'127.0.0.1',1089],[0,'127.0.0.1',1089]];
    for(const item of positives) await probe(...item,true,`allowed ${item[0]}:${item[1]}:${item[2]}`);
    for(const ip of ['127.0.0.53','::1']) for(const udp of [false,true]) await probe(61003,ip,53,true,'exact DNS works',udp);
    for(const udp of [false,true]) await probe(61006,'127.0.0.53',53,true,'relay exact DNS works',udp);
    const negatives=[
      [61003,'127.0.0.1',3141],[61003,'::1',3141],[61005,'127.0.0.1',3141],
      [61003,'172.30.40.2',9999],[61005,'172.30.40.2',9999],
      [61003,'127.0.0.1',8000],[61003,'::1',8000],[61004,'127.0.0.1',5432],
      [61004,'127.0.0.1',18887],[61003,'172.30.40.2',443],[61003,'100.100.100.100',443],
      [61003,'169.254.169.254',443],[61003,'9.9.9.9',443],
      [61003,'8.8.8.8',80],[61003,'2003:1::2',80],[61004,'127.0.0.1',3100],
      [61003,'127.0.0.1',8787],[61003,'127.0.0.1',1088],[61004,'127.0.0.1',18088],
      [61007,'127.0.0.1',1089],[61007,'::1',1089],[61007,'127.0.0.1',3141],
      [61008,'127.0.0.1',4416],[61008,'127.0.0.1',1089],[61008,'127.0.0.1',8000],
      [61001,'127.0.0.1',1089],[61005,'127.0.0.1',1089],[61006,'127.0.0.1',3141],
      [61006,'::1',1089],[61006,'127.0.0.1',1088],[61006,'127.0.0.1',4416],
      [61006,'127.0.0.1',18088],[61006,'8.8.8.8',443],[61006,'2003:1::2',443],
      ...['172.22.40.2','11.77.40.2','fd00:77::2','2003:77::2','2002:1::2','64:ff9b::a00:2'].map(ip=>[61003,ip,443])];
    for(const item of negatives) await probe(...item,false,`denied ${item[0]}:${item[1]}:${item[2]}`);
    await probe(61003,'8.8.8.8',443,false,'UDP/QUIC443 is not implicit public HTTPS',true);
    // Simulate published DB DNAT. Both original and translated tuples must be
    // authorized, while a public443 DNAT to raw provider remains forbidden.
    run('nft',[`table ip fixture_nat { chain output { type nat hook output priority -100; policy accept;
      ip daddr 127.0.0.1 tcp dport 5432 dnat to 172.30.40.3:5432
      ip daddr 8.8.8.8 tcp dport 443 dnat to 172.30.40.2:9999
    }
    }\n`]);
    await probe(61003,'127.0.0.1',5432,true,'exact DB pre/post NAT tuples allowed');
    await probe(61003,'8.8.8.8',443,false,'public URL cannot DNAT into raw provider');
    const narrowed=structuredClone(config);narrowed.apps[0].database=narrowed.apps[0].database.filter(item=>item.address!=='172.30.40.3');
    run('nft',[generateRules(narrowed,{replace:true})]);
    await probe(61003,'127.0.0.1',5432,false,'missing translated DB tuple fails closed');
    assert(run('nft',['list','tables']).includes('table ip fixture_nat'),'scoped replacement touched unrelated table');
    process.stdout.write('PASS: isolated nft syntax + IPv4/IPv6 UID and forwarded packets, incoming replies, exact DB/DNS/import/worker/relay, public HTTPS, private/control denial and both DNAT sides.\n');
  } finally {
    for(const child of children.reverse()) child.kill('SIGKILL');
    // No host cleanup: the private namespace and its veth/rules disappear when
    // these fixture processes exit. Never delete or flush a host table.
  }
} else {
  process.stderr.write('Opt-in only: node uid-network-namespace-test.mjs --run\n');process.exitCode=1;
}
