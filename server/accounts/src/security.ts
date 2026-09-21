import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message = code) { super(message); }
}
export const fail = (status: number, code: string): never => { throw new HttpError(status, code); };
export const token = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function equal(a: unknown, b: string): boolean {
  if (typeof a !== 'string') return false;
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
export function text(value: unknown, max: number, required = false): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') return fail(400, 'invalid_input');
  const clean = value.trim().normalize('NFC');
  if (clean.length > max || (required && !clean) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean)) return fail(400, 'invalid_input');
  return clean;
}
export function email(value: unknown): string {
  const clean = text(value, 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return fail(400, 'invalid_email');
  return clean;
}
export function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 15 || value.length > 128) return fail(400, 'weak_password');
  return value;
}
export function passwordInput(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) return fail(400, 'invalid_credentials');
  return value;
}
export function language(value: unknown): string {
  return typeof value === 'string' && ['en', 'sk', 'cs', 'uk'].includes(value) ? value : 'en';
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return fail(400, 'invalid_id');
  return value;
}
export function diagnostics(value: unknown): Record<string, string> {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return fail(400, 'invalid_diagnostics');
  const result: Record<string, string> = {};
  for (const key of ['version', 'platform', 'screen', 'locale', 'errorId']) {
    const item = (value as Record<string, unknown>)[key];
    if (item !== undefined) {
      const clean = text(item, 80);
      if (!/^[\p{L}\p{N} ._+-]*$/u.test(clean)) return fail(400, 'invalid_diagnostics');
      if (clean) result[key] = clean;
    }
  }
  return result;
}
export function seal(value: unknown, key: Buffer, context: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function unseal<T>(value: string, key: Buffer, context: string): T {
  const data = Buffer.from(value, 'base64url');
  if (data.length < 29) throw new Error('Invalid sealed value');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')) as T;
}
export function claims(accessToken: string): { sub: string; session_id: string; client_id?: string; exp: number; aal?: string } {
  // Not a verifier. Only use AFTER provider /user has authenticated this token.
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8'));
    uuid(payload.sub); uuid(payload.session_id);
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now() / 1000) return fail(401, 'invalid_session');
    return payload;
  } catch { return fail(401, 'invalid_session'); }
}
export function exactHttps(value: string, allowLoopback = false): URL {
  const url = new URL(value);
  if ((url.protocol !== 'https:' && !(allowLoopback && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) || url.username || url.password || url.hash) throw new Error('Expected safe HTTPS URL');
  return url;
}

export function oauthCallback(value: string, kind: string, allowLoopback = false): URL {
  if (kind === 'web') return exactHttps(value, allowLoopback);
  // v1 native callback is deliberately exact, not an arbitrary URI scheme.
  const url = new URL(value);
  if (kind !== 'native' || !['sk.kestrek:','sk.developed.megamusic:'].includes(url.protocol) || url.hostname !== 'oauth'
    || url.pathname !== '/callback' || url.port || url.username || url.password || url.hash) {
    throw new Error('Invalid native callback');
  }
  return url;
}
