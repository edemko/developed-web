// Read-only metadata collection. Deliberately never inspect env/argv/logs.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const userUnits = ['kestrek-prod.service', 'kestrek-backend.service',
  'kestrek-frontend.service', 'otazkomat-prod.service', 'screentime-prod.service',
  'jasom-web.service', 'jasom-submissions.service', 'mega-youtube.service',
  'myclinic-prod.service', 'kestrek-autodeploy.service', 'screentime-autodeploy.service'];
const systemUnits = ['mega-music-accounts.service', 'mega-music-accounts-green.service',
  'developed-accounts.service', 'caddy.service', 'cloudflared-sam-apps.service', 'webhook.service'];
const properties = ['Id', 'User', 'Group', 'WorkingDirectory', 'FragmentPath', 'MainPID', 'LoadState'];
const containers = ['airsoft-marketplace', 'voc-builder', 'supabase-auth',
  'supabase-kong', 'supabase-db', 'supabase-rest', 'supabase-storage',
  'supabase-edge-functions', 'supabase-studio', 'supabase-meta', 'supabase-pooler',
  'realtime-dev.supabase-realtime', 'odonto-feedback-api-1', 'jasom-db'];

export function parseServiceMetadata(output) {
  return output.trim().split(/\n\s*\n/).filter(Boolean).map(block => {
    const entry = {};
    for (const line of block.split('\n')) {
      const separator = line.indexOf('=');
      const key = line.slice(0, separator);
      if (properties.includes(key)) entry[key] = line.slice(separator + 1);
    }
    return entry;
  });
}

export function collect(run = (command, args) => execFileSync(command, args, {
  encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
})) {
  const report = { capturedAt: new Date().toISOString(), failures: [] };
  const read = (label, command, args, transform = value => value.trim()) => {
    try { report[label] = transform(run(command, args)); }
    catch { report.failures.push(label); } // Never print child stderr or credentials.
  };
  const flags = properties.flatMap(property => ['-p', property]);
  read('userServices', 'systemctl', ['--user', 'show', ...userUnits, ...flags], parseServiceMetadata);
  read('systemServices', 'systemctl', ['show', ...systemUnits, ...flags], parseServiceMetadata);
  read('developerGroups', 'id', ['-nG', 'openclaw']);
  read('listeners', 'ss', ['-lntH']); // No process argv or process inspection.
  read('runningContainers', 'docker', ['ps', '--format', '{{.Names}}\t{{.Image}}\t{{.Ports}}']);
  // Go template evaluates on daemon metadata; full inspect JSON is never emitted.
  const format = '{{.Name}} user={{json .Config.User}} networks={{range $name, $net := .NetworkSettings.Networks}}{{$name}} {{end}} privileged={{.HostConfig.Privileged}}';
  for (const name of containers) read(`container:${name}`, 'docker', ['inspect', '--format', format, name]);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] !== '--live') {
    process.stderr.write('Read-only audit. Explicit opt-in: node audit-runtime-boundary.mjs --live\n');
    process.exitCode = 2;
  } else process.stdout.write(`${JSON.stringify(collect(), null, 2)}\n`);
}
