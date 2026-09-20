// Reviewed, explicit app registration attachment. Never run on service startup.
// Secrets arrive in a protected input file, never argv or printed output.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { Database } from './db.js';
import { exactHttps, hash, text, uuid } from './security.js';

export function validateAppConfiguration(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected app configuration object');
  const data = input as Record<string, unknown>;
  const allowed = ['appId','slug','clientId','serverKey','launchUrl','callbackUrl'];
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new Error('Unknown app configuration field');
  const appId = text(data.appId, 100, true), slug = text(data.slug, 80, true), clientId = uuid(data.clientId);
  if (!/^app_[a-z0-9_]+$/.test(appId) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug === 'developed') throw new Error('Invalid app registry ID or slug');
  if (typeof data.serverKey !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.serverKey) || Buffer.from(data.serverKey, 'base64url').length !== 32) throw new Error('Expected a 32-byte base64url server key');
  const launch = exactHttps(text(data.launchUrl, 2000, true)), callback = exactHttps(text(data.callbackUrl, 2000, true));
  if (launch.search || callback.search || launch.origin !== callback.origin) throw new Error('Launch and callback must be fixed paths on the same app origin');
  return { appId, slug, clientId, keyHash: hash(data.serverKey), launchUrl: launch.href, callbackUrl: callback.href };
}
async function main() {
  const args = process.argv.slice(2), inputIndex = args.indexOf('--input');
  if (inputIndex < 0 || !args[inputIndex + 1]) throw new Error('Usage: node dist/operator.js --input /protected/app.json [--apply] [--replace]');
  const filename = args[inputIndex + 1]!;
  const app = validateAppConfiguration(JSON.parse(await readFile(filename, 'utf8')));
  if (!args.includes('--apply')) {
    process.stdout.write(`Validated ${app.appId} (${app.slug}); dry run, no connection or mutation.\n`); return;
  }
  const settings = config(), db = new Database(settings.databaseUrl);
  try {
    await db.tx(async q => {
      const [role] = await q('select current_user as name');
      if (role?.name !== 'developed_accounts') throw new Error('Use developed_accounts role');
      const [existingApp] = await q('select id from core.apps where id=$1 and deleted_at is null', [app.appId]);
      if (!existingApp) throw new Error('Existing core registry app required; no duplicate registry created');
      const [old] = await q('select app_id from accounts.app_settings where app_id=$1 for update', [app.appId]);
      if (old && !args.includes('--replace')) throw new Error('Already configured; explicit --replace and coordinated credential rotation required');
      await q(`insert into accounts.app_settings(app_id,slug,oauth_client_id,server_key_hash,launch_url,callback_url)
        values($1,$2,$3,$4,$5,$6) on conflict(app_id) do update set slug=$2,oauth_client_id=$3,server_key_hash=$4,
        launch_url=$5,callback_url=$6,updated_at=now()`, [app.appId, app.slug, app.clientId, app.keyHash, app.launchUrl, app.callbackUrl]);
      await q("update accounts.oauth_clients set enabled=false where app_id=$1 and client_kind='web'", [app.appId]);
      const [registered] = await q(`insert into accounts.oauth_clients(client_id,app_id,client_kind,callback_url)
        values($1,$2,'web',$3) on conflict(client_id) do update set callback_url=$3,enabled=true
        where oauth_clients.app_id=$2 and oauth_clients.client_kind='web' returning client_id`, [app.clientId, app.appId, app.callbackUrl]);
      if (!registered) throw new Error('Client already belongs to another app or platform');
      await db.audit(q, null, null, 'operator_app_configuration', 'succeeded', { appId: app.appId, replaced: Boolean(old) });
    });
    process.stdout.write(`Configured ${app.appId}. Publication/join-policy/cutover controls were not enabled.\n`);
  } finally { await db.pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stderr.write('App configuration failed; inspect protected inputs and registry without exposing credentials.\n'); process.exitCode = 1; });
}
