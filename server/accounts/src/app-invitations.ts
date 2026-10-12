import type { Accounts } from './accounts.js';
import type { Row } from './db.js';
import { email, fail, language } from './security.js';

// An app admin (Vocabulum teacher, otazkomat organisation admin) invites someone by email.
// The app decides who may invite before calling; this authenticates the app and the acting
// user. New addresses get a central invitation (the password is chosen on /register);
// existing accounts are granted the app. Both answer the same, so nothing is enumerated.
export async function appInvitation(a: Accounts, serverKey: string, body: Row) {
  const checked = await a.internalCheck(serverKey, body.accessToken);
  if (checked.client.kind !== 'web') return fail(403, 'forbidden');
  const actor = checked.user!.id, address = email(body.email), lang = language(body.language);
  await a.db.limit(`app-invitations:${checked.app.id}:${actor}`, 100, 3600);
  await a.db.limit(`app-invitations:${checked.app.id}`, 500, 86400);
  const app = await a.registrationApp(checked.app.id, true);
  const [existing] = await a.db.query('select id from auth.users where lower(email)=$1', [address]);
  await a.db.tx(async q => {
    if (existing) await a.grantAppAccess(q, existing.id, app.app_id);
    else await a.credential(q, null, address, 'invitation', lang, app.app_id);
    await a.db.audit(q, actor, existing?.id ?? null, 'app_invitation', 'succeeded', { appId: app.app_id });
  });
  return { accepted: true };
}
