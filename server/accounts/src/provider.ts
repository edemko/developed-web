import { HttpError } from './security.js';
export interface ProviderUser { id: string; email: string; email_confirmed_at?: string; factors?: { id: string; status: string; factor_type: string }[] }
export interface ProviderSession { access_token: string; refresh_token: string; expires_in: number; user: ProviderUser }
export class Provider {
  constructor(readonly url: string, private key: string, private request: typeof fetch = fetch) {}
  async call<T>(path: string, method = 'GET', body?: unknown, bearer = this.key): Promise<T> {
    const response = await this.request(`${this.url}${path}`, {
      method, headers: { apikey: this.key, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000), redirect: 'error',
    });
    if (!response.ok) {
      // Never propagate provider payloads: these can contain sensitive identity details.
      // Only a recognized end-user bearer rejection is a logged-out session.
      // Unknown authorization failures (including bad administrator/gateway keys)
      // must remain availability errors, as must every administrative request.
      if (path === '/user' && method === 'GET' && [401, 403].includes(response.status)) {
        const error = await response.json().catch(() => null) as { error_code?: unknown } | null;
        if (typeof error?.error_code === 'string' && ['session_not_found', 'user_not_found', 'bad_jwt'].includes(error.error_code)) {
          throw new HttpError(401, 'invalid_session');
        }
      }
      const unavailable = response.status >= 500 || response.status === 401 || response.status === 403 || response.status === 429;
      throw new HttpError(unavailable ? 503 : 400, unavailable ? 'provider_unavailable' : 'provider_rejected');
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') return {} as T;
    const content = await response.text(); return content ? JSON.parse(content) as T : {} as T;
  }
  login(email: string, password: string) { return this.call<ProviderSession>('/token?grant_type=password', 'POST', { email, password }); }
  refresh(refresh_token: string) { return this.call<ProviderSession>('/token?grant_type=refresh_token', 'POST', { refresh_token }); }
  user(accessToken: string) { return this.call<ProviderUser>('/user', 'GET', undefined, accessToken); }
  enrollTotp(accessToken: string, name: string) {
    return this.call<{ id: string; type: string; totp: { secret: string; qr_code: string } }>('/factors', 'POST', { factor_type: 'totp', friendly_name: name, issuer: 'DevelopED' }, accessToken);
  }
  async verifyTotp(accessToken: string, factorId: string, code: string) {
    const challenge = await this.call<{ id: string }>(`/factors/${encodeURIComponent(factorId)}/challenge`, 'POST', {}, accessToken);
    return this.call<ProviderSession>(`/factors/${encodeURIComponent(factorId)}/verify`, 'POST', { challenge_id: challenge.id, code }, accessToken);
  }
  create(email: string, password: string, displayName: string) {
    return this.call<ProviderUser>('/admin/users', 'POST', { email, password, email_confirm: false, user_metadata: { name: displayName } });
  }
  update(id: string, data: object) { return this.call<ProviderUser>(`/admin/users/${encodeURIComponent(id)}`, 'PUT', data); }
  logout(accessToken: string, scope = 'global') { return this.call(`/logout?scope=${scope}`, 'POST', undefined, accessToken); }
}
