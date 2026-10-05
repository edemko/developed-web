import { createHmac, randomInt, randomUUID } from 'node:crypto';
import type { Accounts } from './accounts.js';
import type { Row, Query } from './db.js';
import { email, equal, fail, line, password, seal, text, unseal, uuid } from './security.js';


export function contactPhone(input: unknown) {
  let value = text(input, 40, true);
  if (!/^[+0-9 ()-]+$/.test(value)) return fail(400, 'invalid_phone');
  value = value.replace(/[ ()-]/g, '');
  if (value.startsWith('00')) value = '+' + value.slice(2);
  if (/^09[0-9]{8}$/.test(value)) value = '+421' + value.slice(1);
  if (!/^\+[1-9][0-9]{9,14}$/.test(value)) return fail(400, 'invalid_phone');
  return value;
}
const keyed = (a: Accounts, purpose: string, value: string) => createHmac('sha256', a.config.encryptionKey).update(`${purpose}:${value}`).digest('hex');

export { sendProfileSms } from './profile-sms.js';
import { sendProfileSms, checkProfileSms } from './profile-sms.js';

export class ProductProfile {
  constructor(readonly accounts: Accounts, readonly deliver = sendProfileSms, readonly checkDelivery = checkProfileSms) {}

  challengeInfo(c: Row) {
    const remaining = Math.max(0, Math.ceil((new Date(c.expires_at).getTime() - Date.now()) / 1000));
    const status = c.status === 'consumed' ? 'verified' : c.status === 'locked' ? 'locked'
      : c.status === 'failed' ? 'failed' : !remaining ? 'expired' : c.delivery_status;
    return { challengeId: c.id, status, expiresIn: remaining,
      resendAfter: Math.max(0, Math.ceil((new Date(c.created_at).getTime() + 60000 - Date.now()) / 1000)) };
  }

  async phones(userId: string) {
    const rows = await this.accounts.db.query('select id,phone_ciphertext,verified_at from accounts.verified_phones where user_id=$1 order by slot', [userId]);
    return rows.map(row => ({ id: row.id, phone: unseal<string>(row.phone_ciphertext, this.accounts.config.encryptionKey, `verified-phone:${userId}`), verifiedAt: row.verified_at }));
  }

  async locked(q: Query, user: Row) {
    const [state] = await q('select * from accounts.security_state where user_id=$1 for update', [user.id]);
    if (!state || state.locked || state.operation_id || String(state.security_version) !== String(user.security_version)) return fail(401, 'invalid_session');
  }

  async handle(serverKey: string, action: string, body: Row) {
    const a = this.accounts;
    const checked = await a.internalCheck(serverKey, body.accessToken);
    if (checked.app.id !== 'app_airsoft' || checked.client.kind !== 'web') return fail(403, 'forbidden');
    const user = await a.userById(checked.user!.id);
    if (!user || String(user.security_version) !== String(checked.securityVersion)) return fail(401, 'invalid_session');
    if (action === 'details') {
      const [pending] = await a.db.query(`select * from accounts.profile_phone_challenges
        where user_id=$1 and security_version=$2 and created_at>now()-interval '1 hour'
        order by created_at desc limit 1`, [user.id, user.security_version]);
      return { user: a.publicUser(user), phones: await this.phones(user.id),
        pendingPhone: pending && pending.status !== 'consumed' ? {
          ...this.challengeInfo(pending),
          phone: unseal<string>(pending.phone_ciphertext,a.config.encryptionKey,`profile-phone:${pending.id}`),
          ...(pending.replace_id ? { replaceId: pending.replace_id } : {}),
        } : null };
    }
    if (action === 'phone-status') {
      const id = uuid(body.challengeId);
      const [challenge] = await a.db.query(`select * from accounts.profile_phone_challenges
        where id=$1 and user_id=$2 and security_version=$3`, [id,user.id,user.security_version]);
      if (!challenge) return fail(404, 'not_found');
      const current = this.challengeInfo(challenge);
      if (['verified','expired','locked','failed','delivered'].includes(current.status) || !challenge.provider_message_id) return current;
      // Claim a short polling slot atomically, including across tabs/processes.
      const claimed = await a.db.query(`update accounts.profile_phone_challenges set delivery_checked_at=now()
        where id=$1 and (delivery_checked_at is null or delivery_checked_at<now()-interval '10 seconds') returning id`, [id]);
      if (!claimed.length) return current;
      const result = await this.checkDelivery(a, challenge.provider_message_id);
      const [updated] = await a.db.query(`update accounts.profile_phone_challenges set delivery_status=$2,delivery_error_code=$3
        where id=$1 returning *`, [id,result.status,result.errorCode ?? null]);
      return this.challengeInfo(updated!);
    }
    if (action === 'password' || action === 'email') {
      await a.db.limit(`identity:${user.id}`, 10, 3600);
      const nextPassword = action === 'password' ? password(body.password) : null;
      const nextEmail = action === 'email' ? email(body.email) : null;
      const auth = await a.checkPassword(user, body.currentPassword, body.code, body.factorId);
      await a.provider.logout(auth.access_token, 'local');
      if (nextPassword) {
        await a.mutateIdentity(user.id, user.id, 'password_change', { password: nextPassword }, async q => {
          await q('update accounts.security_state set require_password_change=false where user_id=$1', [user.id]);
        }, { version: String(user.security_version), email: user.email });
        return { ok: true, loginRequired: true };
      }
      await a.db.tx(async q => { await this.locked(q, user); await a.credential(q, user, nextEmail!, 'email_change', user.language, 'app_airsoft'); });
      return { accepted: true };
    }
    if (action === 'profile') {
      const displayName = line(body.displayName, 100, true);
      await a.db.tx(async q => { await this.locked(q, user); await q('update core.profiles set display_name=$2,updated_at=now() where id=$1', [user.id, displayName]); });
      return { ok: true };
    }
    if (action === 'phone-start') {
      const phone = contactPhone(body.phone), lookup = keyed(a, 'phone', phone);
      const replaceId = body.replaceId ? uuid(body.replaceId) : null;
      await a.db.limit(`profile-sms:${user.id}`, 5, 3600);
      await a.db.limit('profile-sms:aggregate', 200, 86400);
      const id = randomUUID(), code = randomInt(100000, 1000000).toString();
      await a.db.tx(async q => {
        await this.locked(q, user);
        const contacts = await q('select id from accounts.verified_phones where user_id=$1', [user.id]);
        if (replaceId && !contacts.some(p => p.id === replaceId)) return fail(404, 'phone_not_found');
        if (!replaceId && contacts.length >= 3) return fail(409, 'phone_limit');
        await q('select pg_advisory_xact_lock(hashtextextended($1,0))', [lookup]);
        if ((await q('select id from accounts.verified_phones where phone_lookup=$1', [lookup])).length) return fail(409, 'phone_already_registered');
        const [usage] = await q(`select count(*)::int as sends, coalesce(max(created_at)>now()-interval '60 seconds',false) as cooldown
          from accounts.profile_phone_challenges where (user_id=$1 or phone_lookup=$2) and created_at>now()-interval '1 hour'`, [user.id, lookup]);
        if (usage!.cooldown) return fail(429, 'sms_resend_too_soon');
        if (usage!.sends >= 5) return fail(429, 'sms_rate_limited');
        await q(`update accounts.profile_phone_challenges set expires_at=now() where user_id=$1 and status in ('pending','sent')`, [user.id]);
        await q(`insert into accounts.profile_phone_challenges(id,user_id,security_version,replace_id,phone_lookup,phone_ciphertext,code_hash,expires_at)
          values($1,$2,$3,$4,$5,$6,$7,now()+interval '5 minutes')`, [id,user.id,user.security_version,replaceId,lookup,
          seal(phone,a.config.encryptionKey,`profile-phone:${id}`),keyed(a,`profile-code:${id}`,code)]);
      });
      const result = await this.deliver(a, phone, `DevelopED: Overovaci kod ${code}. Plati 5 minut. Nikomu ho neposielajte.`);
      // An uncertain send may still arrive; possession of its code can prove the phone.
      const status = result.ok ? 'accepted' : result.status === 'ambiguous' ? 'unknown' : 'failed';
      const [challenge] = await a.db.query(`update accounts.profile_phone_challenges
        set status=$2,provider_message_id=$3,delivery_status=$4,delivery_error_code=$5 where id=$1 returning *`,
        [id,status === 'failed' ? 'failed' : 'sent',result.messageId ?? null,status,result.errorCode ?? null]);
      return this.challengeInfo(challenge!);
    }
    if (action === 'phone-verify') {
      const id = uuid(body.challengeId);
      if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) return fail(400, 'invalid_sms_code');
      await a.db.limit(`profile-sms-verify:${user.id}`, 30, 3600);
      let outcome: string | null;
      try {
        outcome = await a.db.tx(async q => {
          await this.locked(q, user);
          const [c] = await q('select *,expires_at>now() as valid from accounts.profile_phone_challenges where id=$1 and user_id=$2 for update', [id,user.id]);
          if (!c || !c.valid || c.status !== 'sent' || c.attempts >= 5 || String(c.security_version) !== String(user.security_version)) return 'invalid_sms_code';
          if (!equal(c.code_hash,keyed(a,`profile-code:${id}`,body.code))) {
            await q(`update accounts.profile_phone_challenges set attempts=attempts+1,status=case when attempts>=4 then 'locked' else status end where id=$1`, [id]);
            return 'invalid_sms_code'; // Commit failed attempts before reporting failure.
          }
          const contacts = await q('select id,slot from accounts.verified_phones where user_id=$1', [user.id]);
          const replaced = contacts.find(p => p.id === c.replace_id);
          if (c.replace_id && !replaced) return 'phone_not_found';
          const slot = replaced?.slot ?? [1,2,3].find(s => !contacts.some(p => p.slot === s));
          if (!slot) return 'phone_limit';
          const phone = unseal<string>(c.phone_ciphertext,a.config.encryptionKey,`profile-phone:${id}`);
          if (replaced) await q('delete from accounts.verified_phones where id=$1 and user_id=$2', [replaced.id,user.id]);
          await q('insert into accounts.verified_phones(user_id,slot,phone_lookup,phone_ciphertext,verified_at) values($1,$2,$3,$4,now())',
            [user.id,slot,c.phone_lookup,seal(phone,a.config.encryptionKey,`verified-phone:${user.id}`)]);
          await q(`update accounts.profile_phone_challenges set status='consumed',attempts=attempts+1 where id=$1`, [id]);
          await a.db.audit(q,user.id,user.id,'phone_verified','succeeded');
          return null;
        });
      } catch (error: any) { if (error?.code === '23505') return fail(409,'phone_already_registered'); throw error; }
      if (outcome) return fail(400,outcome);
      return { phones: await this.phones(user.id) };
    }
    return fail(404, 'not_found');
  }
}
