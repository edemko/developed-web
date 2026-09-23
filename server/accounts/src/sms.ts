import { createHmac, randomInt, randomUUID } from 'node:crypto';
import type { Accounts } from './accounts.js';
import type { Row } from './db.js';
import { email, equal, fail, seal, text, unseal, uuid } from './security.js';

const AIRSOFT_APP_ID = 'app_airsoft';
const CODE_LIFETIME_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 3;
const MAX_CODE_ATTEMPTS = 5;

type ProviderResult = { ok: boolean; status: string; messageId?: string };

function keyed(accounts: Accounts, purpose: string, value: string) {
  return createHmac('sha256', accounts.config.encryptionKey).update(`${purpose}:${value}`).digest('hex');
}

export function normalizeSlovakMobile(input: unknown): string {
  let value = text(input, 40, true).replace(/[^0-9+]/g, '');
  if (value.startsWith('00421')) value = `+${value.slice(2)}`;
  else if (/^09\d{8}$/.test(value)) value = `+421${value.slice(1)}`;
  else if (/^9\d{8}$/.test(value)) value = `+421${value}`;
  if (!/^\+4219\d{8}$/.test(value)) return fail(400, 'invalid_phone');
  return value;
}

function providerToken(value: unknown, fallback: string) {
  const token = String(value || '').toLowerCase();
  return /^[a-z0-9_]{1,80}$/.test(token) ? token : fallback;
}

function providerId(value: unknown): string | undefined {
  const id = String(value ?? '');
  return /^[A-Za-z0-9_-]{1,200}$/.test(id) ? id : undefined;
}

export async function sendSms(accounts: Accounts, phone: string, message: string, fetcher = fetch): Promise<ProviderResult> {
  if (!accounts.config.smsGateKey) return { ok: false, status: 'not_configured' };
  const body = new URLSearchParams({ token: accounts.config.smsGateKey, to: phone, text: message });
  try {
    const response = await fetcher('https://api.smsgate.sk/json/send_message', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString(),
    });
    if (!response.ok) return { ok: false, status: response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'upstream_unavailable' : 'rejected' };
    const data = await response.json() as Row;
    const resultStatus = String(data.result?.status || data.status || '').toLowerCase();
    const resultCode = String(data.result?.code || data.code || '').toUpperCase();
    const item = Array.isArray(data.messages) ? data.messages[0] : null;
    const itemStatus = String(item?.status || '').toLowerCase();
    const itemCode = String(item?.code || '').toUpperCase();
    const messageId = providerId(item?.message_id ?? data.message_id);
    const accepted = (resultStatus === 'success' || resultCode === 'OK')
      && ((item && (itemStatus === 'success' || itemCode === 'OK')) || (!item && Boolean(messageId)));
    return accepted
      ? { ok: true, status: 'accepted', ...(messageId ? { messageId } : {}) }
      : { ok: false, status: (resultStatus === 'success' || resultCode === 'OK') ? 'malformed' : providerToken(itemCode || resultCode, 'rejected') };
  } catch {
    // A timeout after dispatch is ambiguous, so never retry automatically and
    // never reveal provider or destination details to logs or the browser.
    return { ok: false, status: 'ambiguous' };
  }
}

export class SmsVerification {
  constructor(readonly accounts: Accounts) {}

  private binding(body: Row) {
    if (body.invitation) return `invitation:${text(body.invitation, 100, true)}`;
    return `email:${email(body.email)}`;
  }

  async start(sessionId: string, appId: string, body: Row) {
    if (appId !== AIRSOFT_APP_ID) return fail(404, 'not_found');
    const [settings] = await this.accounts.db.query('select registration_mode from accounts.settings where singleton');
    if (!settings || settings.registration_mode === 'closed') return fail(403, 'registration_closed');
    if (settings.registration_mode === 'invitation' && !body.invitation) return fail(400, 'invalid_invitation');
    const binding = this.binding(body);
    if (body.invitation) await this.accounts.invitationPreview(body.invitation);
    const phone = normalizeSlovakMobile(body.phone), phoneLookup = keyed(this.accounts, 'phone', phone);
    const id = randomUUID(), code = randomInt(100000, 1000000).toString();
    const codeHash = keyed(this.accounts, `sms-code:${id}`, code);
    const bindingHash = keyed(this.accounts, 'sms-binding', binding);
    await this.accounts.db.limit(`sms-session:${sessionId}`, 5, 3600);
    await this.accounts.db.tx(async q => {
      await q('select pg_advisory_xact_lock(hashtextextended($1,0))', [phoneLookup]);
      const [usage] = await q(`select count(*)::integer as hourly,
        max(created_at) as latest from accounts.sms_challenges where phone_lookup=$1 and created_at>now()-interval '1 hour'`, [phoneLookup]);
      if (Number(usage!.hourly) >= MAX_SENDS_PER_HOUR) return fail(429, 'sms_rate_limited');
      if (usage!.latest && Date.now() - new Date(usage!.latest).getTime() < RESEND_COOLDOWN_SECONDS * 1000) return fail(429, 'sms_resend_too_soon');
      await q(`insert into accounts.sms_challenges(id,session_id,app_id,phone_lookup,phone_ciphertext,binding_hash,code_hash,expires_at)
        values($1,$2,$3,$4,$5,$6,$7,now()+$8*interval '1 second')`,
      [id, sessionId, appId, phoneLookup, seal(phone, this.accounts.config.encryptionKey, `sms-phone:${id}`), bindingHash, codeHash, CODE_LIFETIME_SECONDS]);
    });
    const result = await sendSms(this.accounts, phone, `DevelopED: Overovaci kod pre Airsoft Marketplace je ${code}. Plati 5 minut.`);
    await this.accounts.db.query(`update accounts.sms_challenges set status=$2,provider_message_id=$3,provider_status=$4 where id=$1`,
      [id, result.ok ? 'sent' : 'failed', result.messageId || null, result.status]);
    if (!result.ok) return fail(503, 'sms_delivery_failed');
    return { challengeId: id, expiresIn: CODE_LIFETIME_SECONDS, resendAfter: RESEND_COOLDOWN_SECONDS };
  }

  async verify(sessionId: string, appId: string, body: Row) {
    if (appId !== AIRSOFT_APP_ID) return fail(404, 'not_found');
    let challengeId: string;
    try { challengeId = uuid(body.challengeId); } catch { return fail(400, 'invalid_sms_code'); }
    if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) return fail(400, 'invalid_sms_code');
    return this.accounts.db.tx(async q => {
      const [challenge] = await q(`select * from accounts.sms_challenges where id=$1 and session_id=$2 and app_id=$3 for update`, [challengeId, sessionId, appId]);
      if (!challenge || challenge.status !== 'sent' || new Date(challenge.expires_at).getTime() <= Date.now() || challenge.attempts >= MAX_CODE_ATTEMPTS) return fail(400, 'invalid_sms_code');
      const attempts = Number(challenge.attempts) + 1;
      if (!equal(keyed(this.accounts, `sms-code:${challengeId}`, body.code), challenge.code_hash)) {
        await q(`update accounts.sms_challenges set attempts=$2,status=case when $2>=$3 then 'locked' else status end where id=$1`, [challengeId, attempts, MAX_CODE_ATTEMPTS]);
        return fail(400, 'invalid_sms_code');
      }
      await q(`update accounts.sms_challenges set attempts=$2,status='verified',verified_at=now() where id=$1`, [challengeId, attempts]);
      return { verified: true, challengeId };
    });
  }

  async consume(q: import('./db.js').Query, sessionId: string, appId: string, body: Row) {
    if (appId !== AIRSOFT_APP_ID) return null;
    let challengeId: string;
    try { challengeId = uuid(body.phoneChallenge); } catch { return fail(400, 'phone_verification_required'); }
    const bindingHash = keyed(this.accounts, 'sms-binding', this.binding(body));
    let challenge: Row | undefined;
    try {
      const [candidate] = await q(`select * from accounts.sms_challenges where id=$1 and session_id=$2 and app_id=$3
        and binding_hash=$4 and status='verified' and verified_at>now()-interval '10 minutes' and consumed_at is null for update`,
      [challengeId, sessionId, appId, bindingHash]);
      if (!candidate) return fail(400, 'phone_verification_required');
      const [registered] = await q('select user_id from accounts.verified_phones where phone_lookup=$1', [candidate.phone_lookup]);
      if (registered) return fail(409, 'phone_already_registered');
      [challenge] = await q(`update accounts.sms_challenges set status='consumed',consumed_at=now()
        where id=$1 and status='verified' and consumed_at is null returning *`, [challengeId]);
    } catch (error: any) {
      if (error?.code === '23505') return fail(409, 'phone_already_registered');
      throw error;
    }
    if (!challenge) return fail(400, 'phone_verification_required');
    return challenge;
  }

  async attach(q: import('./db.js').Query, userId: string, challenge: Row) {
    const phone = unseal<string>(challenge.phone_ciphertext, this.accounts.config.encryptionKey, `sms-phone:${challenge.id}`);
    try {
      await q(`insert into accounts.verified_phones(user_id,phone_lookup,phone_ciphertext,verified_at)
        values($1,$2,$3,$4)`, [userId, challenge.phone_lookup,
        seal(phone, this.accounts.config.encryptionKey, `verified-phone:${userId}`), challenge.verified_at]);
    } catch (error: any) {
      if (error?.code === '23505') return fail(409, 'phone_already_registered');
      throw error;
    }
  }
}
