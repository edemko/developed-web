// Prints narrowly scoped SOURCE ONLY; never applies a host firewall rule.
import { pathToFileURL } from 'node:url';
export function greenProviderRules(bridge, { replace = false } = {}) {
  if (!/^br-[a-z0-9-]{1,12}$/.test(bridge)) throw new Error('Explicit Docker bridge required');
  const green = '172.30.241.2', db = '172.30.241.3';
  const egress = `ip saddr ${green} ct direction reply ct state established accept
    ip saddr ${green} ip daddr ${db} tcp dport 5432 accept
    ip saddr ${green} counter drop`;
  return `${replace ? 'delete table inet developed_green_provider\ndelete table bridge developed_green_provider\n' : ''}
create table inet developed_green_provider
table inet developed_green_provider {
  chain before_dnat {
    # PREROUTING is the actual pre-DNAT hook; FORWARD priorities alone are not.
    type filter hook prerouting priority -150; policy accept;
    ${egress}
  }
  chain forward_before {
    type filter hook forward priority -150; policy accept;
    ${egress}
  }
  chain forward_after {
    type filter hook forward priority 50; policy accept;
    ${egress}
  }
  chain input {
    type filter hook input priority -150; policy accept;
    ip saddr ${green} ct direction reply ct state established accept
    ip saddr ${green} counter drop
  }
}
create table bridge developed_green_provider
table bridge developed_green_provider {
  chain forward {
    type filter hook forward priority -150; policy accept;
    # Same-bridge frames need their own rule when br_netfilter is absent.
    meta ibrname "${bridge}" ether type ip6 counter drop
    ip saddr ${green} ip daddr ${db} tcp dport 5432 accept
    ip saddr ${green} counter drop
  }
  chain input {
    type filter hook input priority -150; policy accept;
    meta ibrname "${bridge}" ether type ip6 counter drop
  }
}
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length < 3 || process.argv.length > 4 || (process.argv[3] && process.argv[3] !== '--replace')) throw new Error();
    process.stdout.write(greenProviderRules(process.argv[2], { replace: process.argv[3] === '--replace' }));
  } catch { console.error('Usage: green-provider-boundary.mjs br-<reviewed-id> [--replace]'); process.exitCode = 1; }
}
