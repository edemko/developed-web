// SOURCE ONLY. Prints a dedicated nftables table; never invokes nft/systemd,
// resolves credentials, creates users, or changes the host network.
import { isIP } from 'node:net';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TABLE = 'developed_uid_boundary';
const deniedV4 = ['0.0.0.0/8','10.0.0.0/8','100.64.0.0/10','127.0.0.0/8',
  '168.63.129.16/32','169.254.0.0/16','172.16.0.0/12','192.0.0.0/24','192.0.2.0/24',
  '192.88.99.0/24','192.168.0.0/16','198.18.0.0/15','198.51.100.0/24',
  '203.0.113.0/24','224.0.0.0/4','240.0.0.0/4'];
// Only global-unicast 2000::/3 is subsequently allowed. These exclusions also
// prohibit transition/translation mechanisms that could encode a private IPv4.
const deniedV6 = ['2001::/23','2001:db8::/32','2002::/16'];
const own = (value,key) => Object.hasOwn(value,key);
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key=>!keys.includes(key))) throw new Error(`Invalid ${label}`);
}
function uid(value,label) {
  if (!Number.isSafeInteger(value) || value<100 || value>2147483647 || [1000,65534].includes(value)) {
    throw new Error(`${label} must be an explicit dedicated numeric UID (not root/openclaw/nobody)`);
  }
  return value;
}
function address(value) {
  if (typeof value !== 'string' || value.includes('%') || !isIP(value)) throw new Error('Numeric unscoped IP address required');
  return value.toLowerCase();
}
function endpoint(value,port,label) {
  object(value,['address','port'],label);
  if (value.port!==port) throw new Error(`${label} requires port ${port}`);
  return {address:address(value.address),port};
}
function list(value,label,max=32) {
  if (!Array.isArray(value) || value.length>max) throw new Error(`Invalid ${label}`);
  return value;
}
function cidr(value) {
  if (typeof value!=='string') throw new Error('Invalid blocked CIDR');
  const parts=value.split('/');
  if(parts.length!==2 || !/^\d{1,3}$/.test(parts[1])) throw new Error('Invalid blocked CIDR');
  const ip=address(parts[0]),bits=Number(parts[1]);
  if(bits<1 || bits>(isIP(ip)===4?32:128)) throw new Error('Invalid blocked CIDR');
  return `${ip}/${bits}`;
}
export function validateConfig(value) {
  object(value,['version','centralUid','caddyUid','downloadRelayUid','importFrontUid','downloadStatusUid','protectForwardedControl','extraControlEndpoints','blockedNetworks','apps'],'configuration');
  if(value.version!==1) throw new Error('Configuration version must be 1');
  if(own(value,'protectForwardedControl') && typeof value.protectForwardedControl!=='boolean') throw new Error('Forwarded control protection must be boolean');
  const centralUid=uid(value.centralUid,'centralUid'),caddyUid=uid(value.caddyUid,'caddyUid');
  const seen=new Set([centralUid,caddyUid]);
  if(seen.size!==2) throw new Error('Central and Caddy UIDs must differ');
  let downloadRelayUid;
  if(own(value,'downloadRelayUid')) {
    downloadRelayUid=uid(value.downloadRelayUid,'downloadRelayUid');
    if(seen.has(downloadRelayUid)) throw new Error('Download relay needs a distinct UID');
    seen.add(downloadRelayUid);
  }
  const helpers={};
  for(const name of ['importFrontUid','downloadStatusUid']) {
    if(!own(value,name)) continue;
    helpers[name]=uid(value[name],name);
    if(seen.has(helpers[name])) throw new Error('Each helper needs a distinct UID');
    seen.add(helpers[name]);
  }
  const controls=[{address:'127.0.0.1',port:3141},{address:'::1',port:3141},
    ...list(value.extraControlEndpoints??[],'extraControlEndpoints').map(item=>{
      object(item,['address','port'],'control endpoint');
      if(!Number.isInteger(item.port) || item.port<1 || item.port>65535) throw new Error('Invalid control port');
      return {address:address(item.address),port:item.port};
    })];
  const blockedNetworks=list(value.blockedNetworks,'blockedNetworks').map(cidr);
  const names=new Set();
  const apps=list(value.apps,'apps',32).map(app=>{
    object(app,['name','uid','database','dns','musicImport','downloadRelay','downloadStatus','downloadProvider','publicHttp'],'application');
    if(typeof app.name!=='string' || !/^[a-z][a-z0-9-]{1,31}$/.test(app.name) || names.has(app.name)) throw new Error('Unique lowercase app name required');
    names.add(app.name);
    if(own(app,'publicHttp') && (typeof app.publicHttp!=='boolean' || app.name!=='jasom-worker')) {
      throw new Error('Public HTTP compatibility requires the reviewed JASOM worker');
    }
    const appUid=uid(app.uid,'app.uid');
    if(seen.has(appUid)) throw new Error('Each application needs a distinct UID');
    seen.add(appUid);
    const database=list(app.database,'database').map(item=>endpoint(item,5432,'database'));
    const dns=list(app.dns,'dns').map(item=>endpoint(item,53,'DNS'));
    if(!dns.length) throw new Error('At least one explicit DNS endpoint required');
    let musicImport;
    if(own(app,'musicImport')) {
      if(app.name!=='mega-music') throw new Error('Import exception is only available to mega-music');
      musicImport=endpoint(app.musicImport,18887,'stable music import front');
    }
    const workerEndpoints={};
    for(const [key,port] of [['downloadRelay',1088],['downloadStatus',18088],['downloadProvider',4416]]) {
      if(!own(app,key)) continue;
      if(!['mega-youtube','jasom-worker'].includes(app.name) || (key==='downloadProvider' && app.name!=='mega-youtube')) {
        throw new Error('Download exceptions require the matching dedicated worker');
      }
      if(key==='downloadRelay' && downloadRelayUid===undefined) throw new Error('Download relay UID protection is required');
      const target=endpoint(app[key],port,key);
      if(target.address!=='127.0.0.1') throw new Error('Worker exceptions require exact IPv4 loopback');
      workerEndpoints[key]=target;
    }
    for(const item of [...database,...dns,...(musicImport?[musicImport]:[]),...Object.values(workerEndpoints)]) {
      if(controls.some(control=>control.address===item.address && control.port===item.port)) throw new Error('Application exception overlaps protected control endpoint');
    }
    return {name:app.name,uid:appUid,database,dns,publicHttp:app.publicHttp===true,...(musicImport?{musicImport}:{}),...workerEndpoints};
  });
  if(!apps.length) throw new Error('At least one dedicated app UID required');
  return {centralUid,caddyUid,downloadRelayUid,...helpers,protectForwardedControl:value.protectForwardedControl===true,controls,blockedNetworks,apps};
}
const destination=ip=>`${isIP(ip)===4?'ip':'ip6'} daddr ${ip}`;
export function generateRules(input,{replace=false}={}) {
  const config=validateConfig(input),trusted=`{ 0, ${config.centralUid}, ${config.caddyUid} }`;
  const lines=[
    '# Generated source-only UID boundary. Review numeric identities and packet paths before installation.',
    '# No global flush. Replacement, when requested, touches ONLY this named table.',
    ...(replace?[`delete table inet ${TABLE}`]:[`create table inet ${TABLE}`]),
    `table inet ${TABLE} {`,
    '  chain protected_control {',
    '    ct direction reply ct state established return',
    ...config.controls.map(item=>`    ${destination(item.address)} tcp dport ${item.port} meta skuid != ${trusted} counter reject with icmpx type admin-prohibited`),
    ...(config.downloadRelayUid===undefined?[]:[
      `    ip daddr 127.0.0.1 tcp dport 1089 meta skuid != { 0, ${config.downloadRelayUid} } counter reject with icmpx type admin-prohibited`,
      `    ip6 daddr ::1 tcp dport 1089 meta skuid != { 0, ${config.downloadRelayUid} } counter reject with icmpx type admin-prohibited`,
    ]),
    '  }',
  ];
  config.apps.forEach((app,index)=>{
    lines.push(`  chain app_${index} {`,`    # ${app.name}: UID ${app.uid}`,
      // A blanket established accept would retain app-initiated connections to
      // forbidden peers. Only responses to incoming requests bypass filtering.
      '    ct direction reply ct state established accept');
    for(const item of app.database) lines.push(`    ${destination(item.address)} tcp dport 5432 counter accept`);
    for(const item of app.dns) lines.push(`    ${destination(item.address)} meta l4proto { tcp, udp } th dport 53 counter accept`);
    if(app.musicImport) lines.push(`    ${destination(app.musicImport.address)} tcp dport 18887 counter accept`);
    for(const key of ['downloadRelay','downloadStatus','downloadProvider']) {
      if(app[key]) lines.push(`    ${destination(app[key].address)} tcp dport ${app[key].port} counter accept`);
    }
    lines.push('    fib daddr type local counter reject with icmpx type admin-prohibited');
    // Individual CIDR rules avoid overlapping interval-set ambiguities and
    // keep custom Docker/publicly-numbered internal ranges explicit.
    for(const range of [...deniedV4,...deniedV6,...config.blockedNetworks]) {
      lines.push(`    ${isIP(range.split('/')[0])===4?'ip':'ip6'} daddr ${range} counter reject with icmpx type admin-prohibited`);
    }
    if(app.publicHttp) lines.push('    meta nfproto ipv4 tcp dport 80 counter accept',
      '    ip6 daddr 2000::/3 tcp dport 80 counter accept');
    lines.push('    meta nfproto ipv4 tcp dport 443 counter accept',
      '    ip6 daddr 2000::/3 tcp dport 443 counter accept',
      '    counter reject with icmpx type admin-prohibited','  }');
  });
  if(config.downloadRelayUid!==undefined) lines.push(
    '  chain download_relay {',
    '    ct direction reply ct state established accept',
    '    ip daddr 127.0.0.1 tcp dport 1089 counter accept',
    '    ip daddr 127.0.0.53 meta l4proto { tcp, udp } th dport 53 counter accept',
    '    counter reject with icmpx type admin-prohibited',
    '  }',
  );
  for(const [key,name,port] of [['importFrontUid','import_front',8787],['downloadStatusUid','download_status',1088]]) {
    if(config[key]===undefined) continue;
    lines.push(`  chain ${name} {`,
      '    ct direction reply ct state established accept',
      `    ip daddr 127.0.0.1 tcp dport ${port} counter accept`,
      '    counter reject with icmpx type admin-prohibited','  }');
  }
  // Conntrack runs at -200. Check once before destination NAT (-100), and again
  // after NAT, so a permitted original URL cannot translate into a private peer.
  for(const [name,priority] of [['before_dnat',-150],['after_dnat',50]]) {
    lines.push(`  chain ${name} {`,`    type filter hook output priority ${priority}; policy accept;`,
      '    jump protected_control',
      ...(config.downloadRelayUid===undefined?[]:[`    meta skuid ${config.downloadRelayUid} jump download_relay`]),
      ...(config.importFrontUid===undefined?[]:[`    meta skuid ${config.importFrontUid} jump import_front`]),
      ...(config.downloadStatusUid===undefined?[]:[`    meta skuid ${config.downloadStatusUid} jump download_status`]),
      ...config.apps.map((app,index)=>`    meta skuid ${app.uid} jump app_${index}`),'  }');
  }
  if(config.protectForwardedControl) {
    lines.push('  chain prerouting_control {',
      '    type filter hook prerouting priority -150; policy accept;',
      // Local loopback requests already pass the UID-aware OUTPUT chains.
      '    iifname "lo" return',
      '    ct direction reply ct state established return',
      ...config.controls.map(item=>`    ${destination(item.address)} tcp dport ${item.port} counter reject with icmpx type admin-prohibited`),
      '  }');
    for(const [name,priority] of [['forward_control_before_dnat',-150],['forward_control_after_dnat',50]]) {
      lines.push(`  chain ${name} {`,`    type filter hook forward priority ${priority}; policy accept;`,
        '    ct direction reply ct state established return',
        ...config.controls.map(item=>`    ${destination(item.address)} tcp dport ${item.port} counter reject with icmpx type admin-prohibited`),
        '  }');
    }
  }
  lines.push('}','');
  return lines.join('\n');
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const args=process.argv.slice(2),replace=args.includes('--replace');
    const files=args.filter(arg=>arg!=='--replace');
    if(files.length!==1 || files[0].startsWith('-')) throw new Error('Usage: node uid-network-boundary.mjs CONFIG.json [--replace]');
    process.stdout.write(generateRules(JSON.parse(readFileSync(files[0],'utf8')),{replace}));
  } catch(error) { process.stderr.write(`${error.message}\n`);process.exitCode=1; }
}
