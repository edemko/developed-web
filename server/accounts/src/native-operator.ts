// Native clients contain no secret. Only an operator can attach a provider-
// registered public client to an existing product; this never publishes it.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { Database } from './db.js';
import { Provider } from './provider.js';
import { oauthCallback, uuid } from './security.js';

export function validateNativeConfiguration(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected native client configuration');
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => !['appId', 'clientId', 'callbackUrl', 'platform'].includes(key))) throw new Error('Unexpected field');
  if (!(data.appId === 'app_kestrek' && data.callbackUrl === 'sk.kestrek://oauth/callback')
    && !(data.appId === 'app_mega_music' && data.callbackUrl === 'sk.developed.megamusic://oauth/callback')) throw new Error('Unsupported native app/callback');
  const platform = data.platform ?? 'android';
  if (!['android','macos','ios'].includes(platform as string)) throw new Error('Invalid native platform');
  oauthCallback(data.callbackUrl as string, 'native');
  return { appId: data.appId as string, clientId: uuid(data.clientId), callbackUrl: data.callbackUrl as string, platform: platform as string };
}

export function validateNativeProviderRegistration(client: ReturnType<typeof validateNativeConfiguration>,
  registered: { client_id: string; client_type: string; token_endpoint_auth_method: string; redirect_uris: string[] }) {
  if (registered.client_id !== client.clientId || registered.client_type !== 'public'
    || registered.token_endpoint_auth_method !== 'none' || registered.redirect_uris?.length !== 1
    || registered.redirect_uris[0] !== client.callbackUrl) throw new Error('Provider registration does not match public native contract');
}

async function main() {
  const args = process.argv.slice(2), index = args.indexOf('--input');
  if (index < 0 || !args[index + 1]) throw new Error('Protected input file required');
  const client = validateNativeConfiguration(JSON.parse(await readFile(args[index + 1]!, 'utf8')));
  if (!args.includes('--apply')) {
    process.stdout.write('Native configuration validated; no connections or changes.\n'); return;
  }
  const settings = config(), db = new Database(settings.databaseUrl), provider = new Provider(settings.providerUrl, settings.providerKey);
  try {
    const registered = await provider.call<{ client_id: string; client_type: string; token_endpoint_auth_method: string; redirect_uris: string[] }>(`/admin/oauth/clients/${client.clientId}`);
    validateNativeProviderRegistration(client, registered);
    await db.tx(async q => {
      const [role] = await q('select current_user as name');
      if (role?.name !== 'developed_accounts') throw new Error('Scoped central role required');
      const [app] = await q('select app_id from accounts.app_settings where app_id=$1 for update', [client.appId]);
      if (!app) throw new Error('Configure the product web client first');
      const previous = await q("select client_id from accounts.oauth_clients where app_id=$1 and client_kind='native' and platform=$2", [client.appId,client.platform]);
      if (previous.length && !args.includes('--replace')) throw new Error('Replacement requires explicit --replace');
      await q("update accounts.oauth_clients set enabled=false where app_id=$1 and client_kind='native' and platform=$2", [client.appId,client.platform]);
      const [saved] = await q(`insert into accounts.oauth_clients(client_id,app_id,client_kind,callback_url,platform)
        values($1,$2,'native',$3,$4) on conflict(client_id) do update set callback_url=$3,enabled=true
        where oauth_clients.app_id=$2 and oauth_clients.client_kind='native' and oauth_clients.platform=$4 returning client_id`, [client.clientId, client.appId, client.callbackUrl,client.platform]);
      if (!saved) throw new Error('Client already belongs to another app/platform');
      await db.audit(q, null, null, 'operator_native_configuration', 'succeeded', { appId: client.appId, replaced: previous.length > 0 });
    });
    process.stdout.write('Native client attached; publication and cutover flags unchanged.\n');
  } finally { await db.pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stderr.write('Native configuration failed; inspect protected inputs without exposing credentials.\n'); process.exitCode = 1; });
}
