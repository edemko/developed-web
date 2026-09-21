import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Accounts } from './accounts.js';
import { HttpError } from './security.js';

const fields = new Set(['grant_type', 'client_id', 'client_secret', 'code', 'redirect_uri', 'code_verifier', 'refresh_token', 'scope']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class OAuthFailure extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
function invalid(code = 'invalid_request', status = 400): never { throw new OAuthFailure(code, status); }

export function tokenRequest(contentType: string | undefined, raw: string, authorization?: string) {
  let form: URLSearchParams;
  if (contentType?.split(';')[0]?.trim() === 'application/x-www-form-urlencoded') form = new URLSearchParams(raw);
  else if (contentType?.split(';')[0]?.trim() === 'application/json') {
    let value;
    try { value = JSON.parse(raw); } catch { return invalid(); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
    if (Object.values(value).some(item => typeof item !== 'string')) return invalid();
    form = new URLSearchParams(value);
  } else return invalid();
  for (const key of form.keys()) {
    if (!fields.has(key) || form.getAll(key).length !== 1 || form.get(key)!.length > 16000 || /[\u0000-\u001f\u007f]/.test(form.get(key)!)) return invalid();
  }
  const grant = form.get('grant_type');
  if (grant !== 'authorization_code' && grant !== 'refresh_token') return invalid('unsupported_grant_type');
  let clientId = form.get('client_id');
  if (authorization) {
    if (!/^Basic [A-Za-z0-9+/]+={0,2}$/.test(authorization) || authorization.length > 8192 || form.has('client_secret')) return invalid('invalid_client', 401);
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 1) return invalid('invalid_client', 401);
    let basicId;
    try { basicId = decodeURIComponent(decoded.slice(0, separator).replace(/\+/g, ' ')); }
    catch { return invalid('invalid_client', 401); }
    if (clientId && clientId !== basicId) return invalid('invalid_client', 401);
    clientId = basicId;
  }
  if (!clientId || !uuid.test(clientId)) return invalid('invalid_client', 401);
  if (grant === 'authorization_code') {
    if (!form.get('code') || !form.get('redirect_uri') || !/^[A-Za-z0-9._~-]{43,128}$/.test(form.get('code_verifier') || '') || form.has('refresh_token')) return invalid();
  } else if (!form.get('refresh_token') || form.has('code') || form.has('code_verifier') || form.has('redirect_uri')) return invalid();
  return { form, clientId, grant, authorization };
}

async function limitedBody(req: IncomingMessage) {
  if (req.headers['content-encoding']) return invalid();
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length; if (size > 32768) return invalid(); chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function reply(res: ServerResponse, status: number, data: unknown, head = false) {
  res.setHeader('Pragma', 'no-cache');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(head ? undefined : JSON.stringify(data));
}

export async function oauthBroker(accounts: Accounts, req: IncomingMessage, res: ServerResponse, path: string) {
  const head = req.method === 'HEAD';
  try {
    await accounts.db.limit(`oauth:${req.socket.remoteAddress || 'unknown'}`, 2000, 60);
    if (path === '/oauth/userinfo') {
      if (req.method !== 'GET' && !head) return invalid('invalid_request', 405);
      const bearer = req.headers.authorization;
      if (!bearer?.startsWith('Bearer ') || bearer.length > 16000) return invalid('invalid_token', 401);
      const access = bearer.slice(7);
      await accounts.validateOAuthAccess(access);
      const info = await accounts.provider.call('/oauth/userinfo', 'GET', undefined, access);
      return reply(res, 200, info, head);
    }
    if (path !== '/oauth/token' || req.method !== 'POST') return invalid('invalid_request', 405);
    const parsed = tokenRequest(req.headers['content-type'], await limitedBody(req), req.headers.authorization);
    // Registry eligibility is checked before network I/O. Actual client-secret
    // and verifier validation remains the provider's standard OAuth operation.
    try { await accounts.appForClient(parsed.clientId); }
    catch (error) { if (error instanceof HttpError && error.status < 500) return invalid('invalid_client', 401); throw error; }
    const response = await accounts.provider.exchangeOAuth(parsed.form, parsed.authorization);
    if (!response.ok) {
      // Do not copy provider error bodies, cookies or other response headers.
      await response.body?.cancel();
      return invalid(response.status >= 500 || response.status === 429 ? 'temporarily_unavailable'
        : response.status === 401 ? 'invalid_client' : 'invalid_grant', response.status >= 500 || response.status === 429 ? 503 : response.status === 401 ? 401 : 400);
    }
    const result = await response.json() as Record<string, unknown>;
    if (!result || typeof result.access_token !== 'string' || result.access_token.length > 16000
      || typeof result.refresh_token !== 'string' || result.refresh_token.length > 16000
      || typeof result.token_type !== 'string' || result.token_type.toLowerCase() !== 'bearer') return invalid('server_error', 502);
    if (parsed.grant === 'authorization_code') {
      await accounts.finalizeOAuthCode(parsed.form.get('code')!, result.access_token, parsed.clientId);
    } else await accounts.validateOAuthAccess(result.access_token, parsed.clientId);
    // Never return a code-exchange result until its exact browser binding has
    // committed, or a refresh result after its family has been revoked.
    return reply(res, 200, result);
  } catch (error) {
    const failure = error instanceof OAuthFailure ? error : error instanceof HttpError && error.status < 500
      ? new OAuthFailure(path === '/oauth/userinfo' ? 'invalid_token' : 'invalid_grant', path === '/oauth/userinfo' ? 401 : 400)
      : new OAuthFailure('temporarily_unavailable', 503);
    if (path === '/oauth/userinfo' && failure.status === 401) res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
    return reply(res, failure.status, { error: failure.code }, head);
  }
}
