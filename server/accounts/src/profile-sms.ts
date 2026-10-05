import type { Accounts } from './accounts.js';

export type DeliveryStatus = 'accepted' | 'sent' | 'delivered' | 'failed' | 'unknown' | 'expired' | 'verified' | 'locked';
export type SmsResult = { ok: boolean; status: string; messageId?: string; errorCode?: string };
const safeCode = (value: unknown, secret: string) => /^[A-Z0-9_]{1,80}$/.test(String(value ?? ''))
  && !String(value).includes(secret) ? String(value) : 'PROVIDER_REJECTED';

export function deliveryStatus(code: unknown): DeliveryStatus {
  if (code === 'DELIVERED') return 'delivered';
  if (['ERROR', 'EXPIRED', 'DELETED', 'UNDELIVERED', 'UNDELIVERABLE', 'DENIED', 'BLACKLISTED', 'rejected', 'not_configured'].includes(String(code))) return 'failed';
  if (code === 'SENT') return 'sent';
  if (['UNSENT', 'SENDING', 'IN_GROUP', 'QUEUED', 'SCHEDULED', 'PROCESSING', 'accepted'].includes(String(code))) return 'accepted';
  return 'unknown';
}

// Acceptance is not delivery. Never retry a send after an uncertain response.
export async function sendProfileSms(a: Accounts, phone: string, message: string, fetcher = fetch): Promise<SmsResult> {
  const from = a.config.smsGateFrom;
  if (!a.config.smsGateKey || !from || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,10}$/.test(from)) {
    return { ok: false, status: 'not_configured', errorCode: 'NOT_CONFIGURED' };
  }
  try {
    const response = await fetcher('https://api.smsgate.sk/v2/messages', {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { 'X-API-KEY': a.config.smsGateKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ recipients: [{ phone }], channels: [{ type: 'sms', ttl: 300 }], sms: { from, text: message, unicode: false } }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      return { ok: false, status: response.status >= 500 ? 'ambiguous' : 'rejected',
        errorCode: error?.error?.code || error?.code ? safeCode(error?.error?.code ?? error.code, a.config.smsGateKey) : `HTTP_${response.status}` };
    }
    const data = await response.json();
    const item = Array.isArray(data?.messages) ? data.messages[0] : null;
    if (data?.error || data?.code || item?.error) return { ok: false, status: 'rejected', errorCode: safeCode((item?.error ?? data.error ?? data).code, a.config.smsGateKey) };
    if (!Number.isSafeInteger(item?.messageId) || item.messageId <= 0) return { ok: false, status: 'ambiguous', errorCode: 'INVALID_RESPONSE' };
    return { ok: true, status: 'accepted', messageId: String(item.messageId) };
  } catch (error) {
    return { ok: false, status: 'ambiguous', errorCode: error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'TIMEOUT' : 'TRANSPORT_ERROR' };
  }
}

// Legacy check_message also accepts IDs returned by v2. Only the status itself
// proves delivery: the provider supplies deliveryDateTime for EXPIRED too.
export async function checkProfileSms(a: Accounts, id: string, fetcher = fetch): Promise<{ status: DeliveryStatus; errorCode?: string }> {
  if (!a.config.smsGateKey || !/^[0-9]{1,20}$/.test(id)) return { status: 'unknown' };
  const url = new URL('https://api.smsgate.sk/json/check_message');
  url.searchParams.set('token', a.config.smsGateKey);
  url.searchParams.set('message_id', id);
  try {
    const response = await fetcher(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { status: 'unknown', errorCode: `HTTP_${response.status}` };
    const data = await response.json();
    if (data?.result?.code !== 'OK' && data?.result?.status !== 'success') return { status: 'unknown', errorCode: safeCode(data?.result?.code, a.config.smsGateKey) };
    const status = deliveryStatus(data.code);
    return { status, ...(status === 'failed' ? { errorCode: safeCode(data.code, a.config.smsGateKey) } : {}) };
  } catch { return { status: 'unknown', errorCode: 'STATUS_UNAVAILABLE' }; }
}
