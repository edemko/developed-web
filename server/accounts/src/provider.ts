import { HttpError } from './security.js';
export interface ProviderUser { id: string; email: string; email_confirmed_at?: string; factors?: { status: string }[] }
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
  create(email: string, password: string, displayName: string) {
    return this.call<ProviderUser>('/admin/users', 'POST', { email, password, email_confirm: false, user_metadata: { name: displayName } });
  }
  update(id: string, data: object) { return this.call<ProviderUser>(`/admin/users/${encodeURIComponent(id)}`, 'PUT', data); }
  logout(accessToken: string, scope = 'global') { return this.call(`/logout?scope=${scope}`, 'POST', undefined, accessToken); }
}
