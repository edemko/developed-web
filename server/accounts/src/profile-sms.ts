import type { Accounts } from './accounts.js';

export type DeliveryStatus = 'accepted' | 'sent' | 'delivered' | 'failed' | 'unknown' | 'expired' | 'verified' | 'locked';
export type SmsResult = { ok: boolean; status: string; messageId?: string; errorCode?: string };
const safeCode = (value: unknown, secret: string) => /^[A-Z0-9_]{1,80}$/.test(String(value ?? ''))
  && !String(value).includes(secret) ? String(value) : 'PROVIDER_REJECTED';

export function deliveryStatus(code: unknown): DeliveryStatus {
  if (code === 'DELIVERED') return 'delivered';
  if (['EXPIRED', 'DELETED', 'UNDELIVERED', 'UNDELIVERABLE', 'DENIED', 'BLACKLISTED', 'rejected', 'not_configured'].includes(String(code))) return 'failed';
  if (code === 'SENT') return 'sent';
  if (['UNSENT', 'SENDING', 'IN_GROUP', 'QUEUED', 'SCHEDULED', 'PROCESSING', 'ERROR', 'accepted'].includes(String(code))) return 'accepted';
  return 'unknown';
}

// ONLY the SMS Gate v1 (JSON) API is approved: the provider deprecated v2 and
// said it must not be used. Omit the optional v1 `from` field so every app
// uses the account default identifier MyClinic.
// Acceptance is not delivery. Never retry a send after an uncertain response.
const isOk = (item: any) => String(item?.status ?? '').toLowerCase() !== 'error'
  && (!item?.code || String(item.code).toUpperCase() === 'OK')
  && (String(item?.status ?? '').toLowerCase() === 'success' || String(item?.code ?? '').toUpperCase() === 'OK');

export async function sendProfileSms(a: Accounts, phone: string, message: string, fetcher = fetch): Promise<SmsResult> {
  if (!a.config.smsGateKey) return { ok: false, status: 'not_configured', errorCode: 'NOT_CONFIGURED' };
  const key = a.config.smsGateKey;
  try {
    const response = await fetcher('https://api.smsgate.sk/json/send_message', {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ token: key, to: phone, text: message }).toString(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const code = error?.result?.code ?? error?.code;
      return { ok: false, status: response.status >= 500 ? 'ambiguous' : 'rejected',
        errorCode: code ? safeCode(code, key) : `HTTP_${response.status}` };
    }
    const data = await response.json();
    const item = Array.isArray(data?.messages) ? data.messages[0] : null;
    if (!isOk(data?.result)) return { ok: false, status: 'rejected', errorCode: safeCode(item?.code ?? data?.result?.code ?? data?.code, key) };
    if (item && (item.status || item.code) && !isOk(item)) return { ok: false, status: 'rejected', errorCode: safeCode(item.code, key) };
    if (!item || !isOk(item)) return { ok: false, status: 'ambiguous', errorCode: 'INVALID_RESPONSE' };
    const id = String(item.message_id ?? '');
    if (!/^[0-9]{1,20}$/.test(id)) return { ok: false, status: 'ambiguous', errorCode: 'INVALID_RESPONSE' };
    return { ok: true, status: 'accepted', messageId: id };
  } catch (error) {
    return { ok: false, status: 'ambiguous', errorCode: error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'TIMEOUT' : 'TRANSPORT_ERROR' };
  }
}

// check_message (v1). Only the status itself
// proves delivery: the provider supplies deliveryDateTime for EXPIRED too.
export async function checkProfileSms(a: Accounts, id: string, fetcher = fetch): Promise<{ status: DeliveryStatus; errorCode?: string }> {
  if (!a.config.smsGateKey || !/^[0-9]{1,20}$/.test(id)) return { status: 'unknown' };
  const url = new URL('https://api.smsgate.sk/json/check_message');
  try {
    const response = await fetcher(url, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ token: a.config.smsGateKey, message_id: id }).toString(),
    });
    if (!response.ok) return { status: 'unknown', errorCode: `HTTP_${response.status}` };
    const data = await response.json();
    if (!isOk(data?.result)) return { status: 'unknown', errorCode: safeCode(data?.result?.code, a.config.smsGateKey) };
    const status = deliveryStatus(data.code);
    return { status, ...(status === 'failed' ? { errorCode: safeCode(data.code, a.config.smsGateKey) } : {}) };
  } catch { return { status: 'unknown', errorCode: 'STATUS_UNAVAILABLE' }; }
}
