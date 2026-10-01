import type { Accounts } from './accounts.js';
import { fail } from './security.js';

// A product key may revoke only a verified native session of that product.
// No caller-supplied identity, global logout, or browser-family mutation.
export async function logoutNativeSession(accounts: Accounts, serverKey: string, accessToken: unknown) {
  const checked = await accounts.internalCheck(serverKey, accessToken);
  if (checked.app.id !== 'app_voc_builder' || checked.client.kind !== 'native') return fail(403, 'invalid_session');
  await accounts.provider.logout(accessToken as string, 'local');
  return { loggedOut: true };
}
