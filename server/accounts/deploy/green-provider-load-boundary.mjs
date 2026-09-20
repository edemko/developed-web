// Root-only loader of the two green-provider tables; no broad firewall changes.
import { readFileSync, lstatSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { greenProviderRules } from './green-provider-boundary.mjs';
const configPath = '/etc/developed-accounts/green-provider-network.json';
function trusted(path) {
  let current = resolve(path), first = true;
  for (;;) {
    const stat = lstatSync(current);
    if (stat.uid !== 0 || (stat.mode & 0o022) || stat.isSymbolicLink() || (first ? !stat.isFile() : !stat.isDirectory())) throw new Error('Untrusted path');
    if (current === '/') return;
    current = dirname(current); first = false;
  }
}
function execute(command, args) {
  return spawnSync(command, args, { encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024, env: { PATH: '/usr/sbin:/usr/bin', LC_ALL: 'C' } });
}
let temporary;
try {
  if (process.getuid() !== 0 || process.argv.length !== 3 || !['--check', '--apply'].includes(process.argv[2])) throw new Error('Invalid mode');
  for (const path of [configPath, fileURLToPath(import.meta.url), fileURLToPath(new URL('./green-provider-boundary.mjs', import.meta.url)), process.execPath]) trusted(path);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (Object.keys(config).sort().join(',') !== 'bridge,version' || config.version !== 1) throw new Error('Invalid config');
  const inspected = execute('/usr/bin/docker', ['network', 'inspect', 'developed-auth-green', '--format', '{{.Id}} {{range .IPAM.Config}}{{.Subnet}}{{end}}']);
  if (inspected.status !== 0) throw new Error('Network absent');
  const [id, subnet] = inspected.stdout.trim().split(' ');
  if (config.bridge !== `br-${id.slice(0, 12)}` || subnet !== '172.30.241.0/28') throw new Error('Network changed');
  const present = ['inet', 'bridge'].map(family => {
    const result = execute('/usr/sbin/nft', ['list', 'table', family, 'developed_green_provider']);
    if (result.status === 0) return true;
    if (result.status === 1 && /No such file or directory/.test(result.stderr)) return false;
    throw new Error('Cannot inspect table');
  });
  if (present[0] !== present[1]) throw new Error('Partial boundary requires review');
  const base = '/run/developed-green-provider';
  const stat = lstatSync(base);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o077)) throw new Error('Private runtime directory required');
  temporary = mkdtempSync(base + '/transaction-');
  writeFileSync(temporary + '/rules.nft', greenProviderRules(config.bridge, { replace: present[0] }), { mode: 0o600, flag: 'wx' });
  if (execute('/usr/sbin/nft', ['--check', '--file', temporary + '/rules.nft']).status !== 0) throw new Error('Syntax check failed');
  if (process.argv[2] === '--apply' && execute('/usr/sbin/nft', ['--file', temporary + '/rules.nft']).status !== 0) throw new Error('Apply failed');
  console.log(JSON.stringify({ applied: process.argv[2] === '--apply', replaced: present[0], tables: ['inet developed_green_provider', 'bridge developed_green_provider'] }));
} catch {
  console.error('Green provider boundary failed closed; review protected configuration and exact table state.'); process.exitCode = 1;
} finally {
  if (temporary) {
    // A failed exclusive write must not be hidden by cleanup errors.
    try { unlinkSync(temporary + '/rules.nft'); } catch { /* preserve primary failure */ }
    try { rmdirSync(temporary); } catch { /* retained root-only diagnostic path */ }
  }
}
