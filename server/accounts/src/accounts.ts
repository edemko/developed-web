import { createHmac, randomUUID } from 'node:crypto';
import type { Config } from './config.js';
import { Database, type Query, type Row } from './db.js';
import { Provider, type ProviderSession } from './provider.js';
import { claims, diagnostics, email, equal, fail, hash, HttpError, language, password, passwordInput, seal, text, token, unseal, uuid, exactHttps, oauthCallback } from './security.js';
import { credentialMail, credentialLifetime, queueMail, securityMail, reportMail } from './mail.js';

export interface Context { session: Row; user: Row | null; cookie?: string; trustCookie?: string; candidate?: Row; mfa?: { mode: 'enroll' | 'challenge' } }
export class Accounts {
  constructor(readonly db: Database, readonly provider: Provider, readonly config: Config) {}
  csrf(session: Row) { return createHmac('sha256', this.config.encryptionKey).update(`csrf:${session.id}`).digest('base64url'); }
  surfaceCookie(raw: string, kind: string) {
    return raw && this.config.surfaceAppId ? seal(raw,this.config.encryptionKey,`surface:${this.config.origin}:${kind}`) : raw;
  }
  readSurfaceCookie(raw: string | undefined, kind: string): string | undefined {
    if (!raw || !this.config.surfaceAppId) return raw;
    try { return unseal<string>(raw,this.config.encryptionKey,`surface:${this.config.origin}:${kind}`); } catch { return undefined; }
  }
  cookie(raw: string, age = 604800) {
    raw = this.surfaceCookie(raw,'session');
    return `${this.config.insecureLocal ? 'developed_local' : '__Host-developed_session'}=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${this.config.insecureLocal ? '' : '; Secure'}`;
  }
  trustCookie(raw: string, age = 1209600) {
    raw = this.surfaceCookie(raw,'trust');
    return `${this.config.insecureLocal ? 'developed_trust_local' : '__Host-developed_mfa_trust'}=${raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${this.config.insecureLocal ? '' : '; Secure'}`;
  }
  async bootstrap(rawCookie?: string): Promise<Context> {
    rawCookie = this.readSurfaceCookie(rawCookie,'session');
    let session: Row | undefined;
    if (rawCookie && /^[A-Za-z0-9_-]{43}$/.test(rawCookie)) {
      [session] = await this.db.query(`select s.* from accounts.sessions s where token_hash=$1 and revoked_at is null
        and expires_at>now() and (mfa_remember_until>now() or last_seen_at>now()-interval '24 hours')
        and (s.mfa_trust_id is null or accounts.browser_trust_valid(s.mfa_trust_id,s.user_id,s.security_version))
        and (s.user_id is null or exists(select 1 from accounts.browser_families f
          where f.id=s.browser_family_id and f.user_id=s.user_id and f.revoked_at is null))`, [hash(rawCookie)]);
    }
    if (!session) {
      const raw = token(), id = randomUUID();
      [session] = await this.db.query(`insert into accounts.sessions(id,token_hash,csrf_hash,expires_at)
        values($1,$2,$3,now()+interval '30 minutes') returning *`, [id, hash(raw), hash(this.csrf({ id }))]);
      return { session: session!, user: null, cookie: this.cookie(raw, 1800) };
    }
    let user = null;
    if (session.user_id) {
      user = await this.userById(session.user_id);
      if (!user || user.locked || user.operation_id || !user.emailVerified || String(user.security_version) !== String(session.security_version)) {
        await this.db.query('update accounts.sessions set revoked_at=now() where id=$1', [session.id]);
        return this.bootstrap();
      }
      const [providerSession] = await this.db.query(`select id,aal from auth.sessions where id=$1 and user_id=$2
        and created_at>$3 and (not_after is null or not_after>now())`, [session.provider_session_id, user.id, user.revoked_before]);
      if (!providerSession) {
        await this.db.query('update accounts.sessions set revoked_at=now() where id=$1', [session.id]);
        return this.bootstrap();
      }
      session.aal = providerSession.aal;
      // Only the private SQL-validated binding establishes remembered MFA.
      // Do not modify or misrepresent the provider's actual assurance level.
      session.browser_trusted = Boolean(session.mfa_trust_id);
    }
    await this.db.query(`update accounts.sessions set last_seen_at=now() where id=$1 and last_seen_at<now()-interval '5 minutes'`, [session.id]);
    return this.context(session, user);
  }
  context(session: Row, user: Row | null, cookie?: string): Context {
    const required = user && (session.mfa_pending || (user.role === 'SUPERADMIN' && !user.hasMfa) || ((user.hasMfa || user.role === 'SUPERADMIN') && session.aal !== 'aal2' && !session.browser_trusted));
    return required ? { session, user: null, candidate: user!, mfa: { mode: user!.hasMfa || session.mfa_pending === 'challenge' ? 'challenge' : 'enroll' }, cookie } : { session, user, cookie };
  }
  async userById(id: string): Promise<Row | null> {
    const [row] = await this.db.query(`select p.id,u.email,p.display_name as "displayName",p.photo_url as "avatarUrl",p.role,
      u.email_confirmed_at is not null as "emailVerified",p.created_at as "createdAt",
      coalesce(s.language,'en') as language,coalesce(s.locked,false) as locked,
      coalesce(s.require_password_change,false) as "requirePasswordChange",coalesce(s.security_version,1) as security_version,
      coalesce(s.revoked_before,'-infinity'::timestamptz) as revoked_before,s.operation_id,
      exists(select 1 from auth.mfa_factors f where f.user_id=p.id and f.status='verified') as "hasMfa"
      from core.profiles p join auth.users u on u.id=p.id left join accounts.security_state s on s.user_id=p.id where p.id=$1`, [id]);
    return row || null;
  }
  publicUser(user: Row | null) {
    if (!user) return null;
    const { id, email, displayName, avatarUrl, language, role, emailVerified, requirePasswordChange, hasMfa } = user;
    return { id, email, displayName, avatarUrl, language, role, emailVerified, requirePasswordChange, hasMfa };
  }
  requireUser(ctx: Context, allowPasswordChange = false): Row {
    if (!ctx.user) return fail(401, 'authentication_required');
    if (ctx.user.requirePasswordChange && !allowPasswordChange) return fail(403, 'password_change_required');
    return ctx.user;
  }
  requireAdmin(ctx: Context, fresh = false) {
    const user = this.requireUser(ctx);
    if (user.role !== 'SUPERADMIN') return fail(403, 'forbidden');
    if (!user.hasMfa || (ctx.session.aal !== 'aal2' && !ctx.session.browser_trusted)) return fail(403, 'mfa_required');
    if (fresh && (ctx.session.aal !== 'aal2' || !ctx.session.authenticated_at || Date.now() - new Date(ctx.session.authenticated_at).getTime() > 300_000)) return fail(428, 'reauthentication_required');
    return user;
  }
  async checkPassword(user: Row, input: unknown, code?: unknown, factorId?: unknown): Promise<ProviderSession> {
    const current = passwordInput(input);
    let result: ProviderSession;
    try { result = await this.provider.login(user.email, current); }
    catch (error) { if (error instanceof HttpError && error.status === 400) return fail(401, 'invalid_credentials'); throw error; }
    if (result.user.id !== user.id) return fail(401, 'invalid_credentials');
    // Fresh password + a verified factor, never password-only downgrade.
    const factors = result.user.factors?.filter(f => f.status === 'verified') || [];
    if (factors.length || user.hasMfa || user.role === 'SUPERADMIN') {
      try {
        const selected = factors.find(f => f.factor_type === 'totp' && (!factorId || f.id === factorId));
        if (!selected || typeof code !== 'string' || !/^\d{6}$/.test(code)) return fail(403, 'mfa_required');
        const upgraded = await this.provider.verifyTotp(result.access_token, selected.id, code);
        const parsed = claims(upgraded.access_token);
        if (upgraded.user.id !== user.id || parsed.sub !== user.id || parsed.session_id !== claims(result.access_token).session_id || parsed.aal !== 'aal2' || parsed.client_id) return fail(401, 'invalid_session');
        return upgraded;
      } catch (error) {
        await this.provider.logout(result.access_token, 'local').catch(() => {});
        if (error instanceof HttpError && error.status === 400) return fail(400, 'invalid_mfa_code');
        throw error;
      }
    }
    return result;
  }
  async newSession(ctx: Context, auth: ProviderSession, user: Row, options: { enroll?: boolean; fence?: string; newFamily?: boolean; rememberMfa?: boolean; factorId?: string; trustCookie?: string } = {}): Promise<Context> {
    const parsed = claims(auth.access_token), raw = token(), id = randomUUID();
    if (parsed.sub !== user.id || parsed.client_id) return fail(401, 'invalid_session');
    let pending = options.enroll ? 'enroll' : parsed.aal !== 'aal2' && (user.hasMfa || auth.user.factors?.some(f => f.status === 'verified') || user.role === 'SUPERADMIN') ? user.hasMfa || auth.user.factors?.some(f => f.status === 'verified') ? 'challenge' : 'enroll' : null;
    // Only an actual AAL2 verification can opt in. A fresh step-up may retain,
    // but never slide, the original deadline for this same browser/user.
    const remaining = ctx.session.user_id === user.id && ctx.session.browser_family_id && !options.newFamily && (ctx.session.aal === 'aal2' || ctx.session.browser_trusted)
      ? Math.floor((new Date(ctx.session.mfa_remember_until || 0).getTime() - Date.now()) / 1000) : 0;
    let remembered = !pending && parsed.aal === 'aal2'
      ? options.rememberMfa === true ? 1209600 : options.rememberMfa === undefined ? Math.max(0, Math.min(1209600, remaining)) : 0 : 0;
    let lifetime = pending ? 600 : remembered || 604800;
    let trustCookie: string | undefined, trustId: string | null = null, trustedLogin = false;
    const [created] = await this.db.tx(async q => {
      await q('insert into accounts.security_state(user_id) values($1) on conflict do nothing', [user.id]);
      const [state] = await q('select * from accounts.security_state where user_id=$1 for update', [user.id]);
      if (state!.locked || state!.operation_id) return fail(403, 'account_unavailable');
      if (state!.require_password_change) remembered = 0;
      if (remembered && options.rememberMfa === true) {
        // Called only after real factor verification; confirm ownership/status
        // again under the account-state lock before issuing a separate credential.
        const [factor] = await q("select id from auth.mfa_factors where id=$1 and user_id=$2 and status='verified' and factor_type='totp'", [options.factorId, user.id]);
        if (!factor) return fail(401, 'invalid_session');
        const rawTrust = token(); trustId = randomUUID();
        await q(`insert into accounts.browser_trust(id,token_hash,user_id,factor_id,security_version,expires_at)
          values($1,$2,$3,$4,$5,now()+interval '14 days')`, [trustId, hash(rawTrust), user.id, options.factorId, state!.security_version]);
        trustCookie = this.trustCookie(rawTrust);
      } else if (pending === 'challenge' && options.trustCookie && /^[A-Za-z0-9_-]{43}$/.test(options.trustCookie)) {
        const [trust] = await q(`select t.id,floor(extract(epoch from t.expires_at-now()))::integer as remaining from accounts.browser_trust t
          where t.token_hash=$1 and accounts.browser_trust_valid(t.id,$2,$3) for update`, [hash(options.trustCookie), user.id, state!.security_version]);
        if (trust && trust.remaining > 0) {
          const rawTrust = token(); trustId = trust.id; remembered = Math.min(1209600, trust.remaining);
          await q('update accounts.browser_trust set token_hash=$2 where id=$1', [trustId, hash(rawTrust)]);
          trustCookie = this.trustCookie(rawTrust, remembered);
          trustedLogin = true; pending = null;
          await this.db.audit(q, user.id, user.id, 'mfa_remembered_login', 'succeeded');
        }
      } else if (remembered && ctx.session.mfa_trust_id) {
        const [validTrust] = await q('select id from accounts.browser_trust where id=$1 and accounts.browser_trust_valid(id,$2,$3)', [ctx.session.mfa_trust_id, user.id, state!.security_version]);
        if (validTrust) trustId = validTrust.id; else remembered = 0;
      }
      if (remembered && !trustId) remembered = 0;
      lifetime = pending ? 600 : remembered || 604800;
      // A fresh browser starts a new family; password re-login, reauthentication
      // and MFA rotation retain an existing, validated same-user browser family.
      const carryFamily = !options.newFamily && ctx.session.user_id === user.id && ctx.session.browser_family_id;
      const familyId = carryFamily || randomUUID();
      if (carryFamily) {
        const [family] = await q('select id from accounts.browser_families where id=$1 and user_id=$2 and revoked_at is null for update', [familyId, user.id]);
        if (!family) return fail(401, 'invalid_session');
      } else await q('insert into accounts.browser_families(id,user_id) values($1,$2)', [familyId, user.id]);
      // Consistent lock order: account state -> family -> opaque session.
      if (options.fence || carryFamily) {
        const [owned] = await q(`select id from accounts.sessions where id=$1 and revoked_at is null and expires_at>now()
          and ($2::uuid is null or refresh_id=$2) for update`, [ctx.session.id, options.fence || null]);
        if (!owned) return fail(401, 'invalid_session');
      }
      const [valid] = await q('select id from auth.sessions where id=$1 and user_id=$2 and created_at>$3', [parsed.session_id, user.id, state!.revoked_before]);
      if (!valid) return fail(401, 'invalid_session');
      await q('update accounts.sessions set revoked_at=now() where id=$1', [ctx.session.id]);
      return q(`insert into accounts.sessions(id,token_hash,csrf_hash,user_id,provider_session_id,provider_tokens,security_version,authenticated_at,expires_at,mfa_pending,browser_family_id,mfa_remember_until,mfa_trust_id)
        values($1,$2,$3,$4,$5,$6,$7,case when $8::text is null and not $13::boolean then now() else null end,now()+$9*interval '1 second',$8,$10,case when $11::boolean then now()+$9*interval '1 second' else null end,$12) returning *`,
      [id, hash(raw), hash(this.csrf({ id })), user.id, parsed.session_id, seal(auth, this.config.encryptionKey, `session:${id}`), state!.security_version, pending, lifetime, familyId, remembered > 0, trustId, trustedLogin]);
    });
    created!.aal = parsed.aal || 'aal1';
    created!.browser_trusted = Boolean(trustId);
    return { ...this.context(created!, user, this.cookie(raw, lifetime)), ...(trustCookie ? { trustCookie } : {}) };
  }
  async login(ctx: Context, body: Row, trustCookie?: string): Promise<Context> {
    const address = email(body.email), current = passwordInput(body.password);
    await this.db.limit(`login:email:${address}`, 10, 900);
    let auth: ProviderSession;
    try { auth = await this.provider.login(address, current); }
    catch (error) { if (error instanceof HttpError && error.status === 400) return fail(401, 'invalid_credentials'); throw error; }
    const user = await this.userById(auth.user.id);
    if (!user || !auth.user.email_confirmed_at || user.locked || user.operation_id) {
      await this.provider.logout(auth.access_token, 'local').catch(() => {}); return fail(403, 'account_unavailable');
    }
    const next = await this.newSession(ctx, auth, user, { trustCookie });
    await this.db.audit(this.db.query, user.id, user.id, 'login', next.mfa ? 'pending' : 'succeeded'); return next;
  }
  async providerToken(ctx: Context): Promise<string> {
    this.requireUser(ctx);
    const refreshId = randomUUID();
    const prepared = await this.db.tx(async q => {
      const [session] = await q('select * from accounts.sessions where id=$1 and revoked_at is null for update', [ctx.session.id]);
      if (!session) return fail(401, 'authentication_required');
      if (session.refresh_id) {
        if (Date.now() - new Date(session.refresh_started_at).getTime() > 30_000) return { stale: true, auth: null };
        return fail(503, 'refresh_pending');
      }
      const auth = unseal<ProviderSession>(session.provider_tokens, this.config.encryptionKey, `session:${session.id}`);
      const payload = JSON.parse(Buffer.from(auth.access_token.split('.')[1]!, 'base64url').toString());
      if (payload.exp < Date.now() / 1000 + 60) {
        // Commit fence before remote rotation: a crash cannot reuse the previous
        // refresh token. Competing requests never rotate the same credential.
        await q('update accounts.sessions set refresh_id=$2,refresh_started_at=now() where id=$1', [session.id, refreshId]);
        return { stale: false, auth, rotate: true };
      }
      return { stale: false, auth, rotate: false };
    });
    if (prepared.stale) {
      await this.db.query('update accounts.sessions set revoked_at=now() where id=$1', [ctx.session.id]); return fail(401, 'invalid_session');
    }
    if (!prepared.rotate) return prepared.auth!.access_token;
    try {
      const auth = await this.provider.refresh(prepared.auth!.refresh_token);
      if (auth.user.id !== ctx.user!.id || claims(auth.access_token).session_id !== ctx.session.provider_session_id) return fail(401, 'invalid_session');
      const [saved] = await this.db.query(`update accounts.sessions set provider_tokens=$2,refresh_id=null,refresh_started_at=null
        where id=$1 and refresh_id=$3 and revoked_at is null returning id`, [ctx.session.id, seal(auth, this.config.encryptionKey, `session:${ctx.session.id}`), refreshId]);
      if (!saved) return fail(401, 'invalid_session');
      return auth.access_token;
    } catch (error) {
      await this.db.query('update accounts.sessions set revoked_at=now() where id=$1 and refresh_id=$2', [ctx.session.id, refreshId]); throw error;
    }
  }
  async revoke(query: Query, userId: string) {
    await query(`insert into accounts.security_state(user_id,revoked_before) values($1,clock_timestamp())
      on conflict(user_id) do update set security_version=accounts.security_state.security_version+1,
      revoked_before=clock_timestamp(),updated_at=now()`, [userId]);
    await query('update accounts.sessions set revoked_at=now() where user_id=$1 and revoked_at is null', [userId]);
    await query(`update accounts.credentials set consumed_at=now() where user_id=$1 and consumed_at is null and purpose in ('recovery','email_change')`, [userId]);
  }
  async logout(ctx: Context) {
    // Browser-family logout: only explicit server-issued bindings are revoked.
    // Native OAuth clients and another browser's family remain independent.
    let access: string | null = ctx.user ? await this.providerToken(ctx).catch(() => null) : null;
    const user = ctx.user || ctx.candidate;
    if (!access && user && ctx.session.provider_tokens) {
      try {
        const auth = unseal<ProviderSession>(ctx.session.provider_tokens, this.config.encryptionKey, `session:${ctx.session.id}`);
        const parsed = claims(auth.access_token);
        if (parsed.sub === user.id && parsed.session_id === ctx.session.provider_session_id && !parsed.client_id) access = auth.access_token;
      } catch { /* A corrupt/expired provider bundle must not prevent local logout. */ }
    }
    await this.db.tx(async q => {
      if (user && ctx.session.browser_family_id) {
        await q('update accounts.browser_families set revoked_at=coalesce(revoked_at,now()) where id=$1 and user_id=$2', [ctx.session.browser_family_id, user.id]);
        await q('update accounts.sessions set revoked_at=now() where browser_family_id=$1 and user_id=$2 and revoked_at is null', [ctx.session.browser_family_id, user.id]);
      } else await q('update accounts.sessions set revoked_at=now() where id=$1 and revoked_at is null', [ctx.session.id]);
      if (user) await this.db.audit(q, user.id, user.id, 'logout_local', 'succeeded');
    });
    // The opaque central session is already denied even during provider outage.
    if (access) await this.provider.logout(access, 'local').catch(() => {});
  }
  async logoutAll(ctx: Context) {
    // A password-only pending-MFA cookie must not revoke another device.
    const user = this.requireUser(ctx, true);
    const access = await this.providerToken(ctx).catch(() => null);
    await this.db.tx(async q => { await this.revoke(q, user.id); await this.db.audit(q, user.id, user.id, 'logout_all', 'succeeded'); });
    if (access) await this.provider.logout(access, 'global').catch(() => {});
  }
  async credential(query: Query, user: Row | null, address: string, purpose: string, lang = 'en', returnAppId: string | null = null) {
    const raw = token();
    if (user) await query(`update accounts.credentials set consumed_at=now() where user_id=$1 and purpose=$2 and consumed_at is null`, [user.id, purpose]);
    await query(`insert into accounts.credentials(token_hash,purpose,user_id,email,security_version,expires_at,return_app_id)
      values($1,$2,$3,$4,$5,now()+$6*interval '1 second',$7)`, [hash(raw), purpose, user?.id || null, address, user?.security_version || 1, credentialLifetime(purpose), returnAppId]);
    const route = purpose === 'recovery' ? '/reset-password' : purpose === 'invitation' ? '/register' : '/verify-email';
    const fragment = purpose === 'invitation' ? 'invitation' : 'token';
    await queueMail(query, this.config, credentialMail(address, purpose, `${this.config.origin}${route}#${fragment}=${raw}`, lang, this.config));
  }
  async invitationPreview(input: unknown) {
    if (typeof input !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input)) return fail(400, 'invalid_invitation');
    const [invitation] = await this.db.query(`select email from accounts.credentials where token_hash=$1
      and purpose='invitation' and consumed_at is null and user_id is null and expires_at>now()`, [hash(input)]);
    if (!invitation) return fail(400, 'invalid_invitation');
    // Possession of the high-entropy emailed credential permits this preview.
    // Never consume on preview: mail scanners and a page reload are not signup.
    return { email: invitation.email as string };
  }
  async register(body: Row) {
    const secret = password(body.password), name = text(body.displayName, 100, true), lang = language(body.language);
    const invited = body.invitation !== undefined && body.invitation !== '';
    const preview = invited ? await this.invitationPreview(body.invitation) : null;
    const address = preview ? preview.email : email(body.email);
    // The invitation, never the submitted address or a client confirmation flag,
    // chooses the identity. Explicit mismatches also fail for direct API callers.
    if (preview && body.email !== undefined && email(body.email) !== address) return fail(400, 'invitation_email_mismatch');
    const returnAppId = this.config.surfaceAppId || await this.registrationContinuation(body.continuation);
    let invitationHash: string | null = null;
    await this.db.limit(`register:${address}`, 3, 3600);
    await this.db.limit('register:aggregate', this.config.hourlyRegistrationLimit, 3600);
    // Admission is linearized here. Closing registration after this reservation
    // does not cancel a request already accepted under the preceding mode.
    await this.db.tx(async q => {
      const [settings] = await q('select registration_mode from accounts.settings where singleton for share');
      if (settings!.registration_mode === 'closed') return fail(403, 'registration_closed');
      if (settings!.registration_mode === 'invitation' && !invited) return fail(400, 'invalid_invitation');
      if (invited) {
        const [valid] = await q(`update accounts.credentials set consumed_at=now() where token_hash=$1 and purpose='invitation'
          and email=$2 and expires_at>now() and consumed_at is null and user_id is null returning token_hash`, [hash(body.invitation), address]);
        if (!valid) return fail(400, 'invalid_invitation');
        invitationHash = valid.token_hash;
      }
    });
    const [existing] = await this.db.query('select id from auth.users where lower(email)=$1', [address]);
    if (existing) {
      if (invitationHash) await this.db.query('update accounts.credentials set user_id=$2 where token_hash=$1 and user_id is null', [invitationHash, existing.id]);
      // Never verify an existing account or replace its password through signup.
      if (invitationHash) return fail(409, 'account_exists');
      return { accepted: true, emailVerified: false };
    }
    let created;
    try { created = await this.provider.create(address, secret, name, Boolean(invitationHash)); }
    catch (error) {
      if (error instanceof HttpError && error.status === 400) {
        if (invitationHash) return fail(400, 'registration_failed');
        return { accepted: true, emailVerified: false };
      }
      throw error;
    }
    // Invitation consumption commits before the remote call: failure is closed,
    // never replayable. An ambiguous create must be reconciled, not retried with
    // the same invite. Ordinary registration remains unverified until its email.
    await this.db.tx(async q => {
      await q(`insert into accounts.security_state(user_id,language) values($1,$2) on conflict do nothing`, [created.id, lang]);
      await q('update core.profiles set display_name=$2,updated_at=now() where id=$1', [created.id, name]);
      if (!invitationHash) await this.credential(q, { id: created.id, security_version: 1 }, address, 'verification', lang, returnAppId);
      if (invitationHash) await q('update accounts.credentials set user_id=$2 where token_hash=$1 and user_id is null', [invitationHash, created.id]);
      if (this.config.surfaceAppId) await q('insert into accounts.product_registrations(user_id,app_id) values($1,$2) on conflict do nothing',[created.id,this.config.surfaceAppId]);
      await this.db.audit(q, null, created.id, 'registration', 'succeeded');
    });
    return { accepted: true, emailVerified: Boolean(invitationHash) };
  }
  async sendCredential(addressInput: unknown, recovery: boolean) {
    const address = email(addressInput);
    await this.db.limit(`email:${address}`, 3, 3600);
    await this.db.limit('email:requests', this.config.dailyEmailLimit, 86400);
    const [row] = await this.db.query('select id,email_confirmed_at from auth.users where lower(email)=$1', [address]);
    if (!row || Boolean(row.email_confirmed_at) !== recovery) return;
    const user = await this.userById(row.id);
    if (!user || user.operation_id) return;
    const [prior] = recovery ? [] : await this.db.query(`select return_app_id from accounts.credentials where user_id=$1 and purpose='verification' order by created_at desc limit 1`, [user.id]);
    await this.db.tx(q => this.credential(q, user, address, recovery ? 'recovery' : 'verification', user.language, prior?.return_app_id || null));
  }
  async mutateIdentity(actorId: string, userId: string, action: string, update: object, after?: (q: Query) => Promise<void>, expected?: { version: string; email?: string }) {
    const operation = randomUUID(), user = await this.userById(userId);
    if (!user) return fail(404, 'user_not_found');
    await this.db.tx(async q => {
      await q('insert into accounts.security_state(user_id) values($1) on conflict do nothing', [userId]);
      const [current] = await q(`select s.security_version,u.email from accounts.security_state s join auth.users u on u.id=s.user_id where s.user_id=$1 for update of s`, [userId]);
      if (expected && (String(current!.security_version) !== expected.version || (expected.email && current!.email !== expected.email))) return fail(400, 'invalid_or_expired_token');
      const [state] = await q(`update accounts.security_state set operation_id=$2,operation_started_at=now() where user_id=$1 and operation_id is null returning user_id`, [userId, operation]);
      if (!state) return fail(409, 'security_change_pending');
      await this.db.audit(q, actorId, userId, action, 'started', { operation });
    });
    try {
      await this.provider.update(userId, update);
      await this.db.tx(async q => {
        await this.revoke(q, userId);
        if (after) await after(q);
        await q('update accounts.security_state set operation_id=null,operation_started_at=null where user_id=$1 and operation_id=$2', [userId, operation]);
        await this.db.audit(q, actorId, userId, action, 'succeeded', { operation });
        await queueMail(q, this.config, securityMail(user.email, user.language, this.config, action));
        const nextEmail = (update as Row).email;
        if (nextEmail && nextEmail !== user.email) await queueMail(q, this.config, securityMail(nextEmail, user.language, this.config, action));
      });
    } catch (error) {
      if (error instanceof HttpError && error.status === 400) {
        // Definite provider rejection is safe to clear. Ambiguous network/DB
        // failures remain fail-closed for explicit operator reconciliation.
        await this.db.query('update accounts.security_state set operation_id=null,operation_started_at=null where user_id=$1 and operation_id=$2', [userId, operation]);
        await this.db.audit(this.db.query, actorId, userId, action, 'failed', { operation });
      } else await this.db.audit(this.db.query, actorId, userId, action, 'pending', { operation });
      throw error;
    }
  }
  async consumeCredential(raw: unknown, resetPassword?: unknown) {
    const credential = text(raw, 100, true), secret = resetPassword === undefined ? undefined : password(resetPassword);
    const saved = await this.db.tx(async q => {
      const [row] = await q(`select c.*,u.email as current_email from accounts.credentials c join auth.users u on u.id=c.user_id
        where c.token_hash=$1 and c.consumed_at is null and c.expires_at>now() for update of c`, [hash(credential)]);
      if (!row || (secret ? row.purpose !== 'recovery' : !['verification','email_change'].includes(row.purpose))) return fail(400, 'invalid_or_expired_token');
      const [state] = await q('select * from accounts.security_state where user_id=$1 for update', [row.user_id]);
      if (state?.operation_id || String(row.security_version) !== String(state?.security_version || 1) || (['recovery','verification'].includes(row.purpose) && row.current_email !== row.email)) return fail(400, 'invalid_or_expired_token');
      await q('update accounts.credentials set consumed_at=now() where token_hash=$1', [row.token_hash]); return row;
    });
    const changes = saved.purpose === 'recovery' ? { password: secret } : saved.purpose === 'email_change' ? { email: saved.email, email_confirm: true } : { email_confirm: true };
    await this.mutateIdentity(saved.user_id, saved.user_id, saved.purpose, changes,
      async q => { if (secret) await q('update accounts.security_state set require_password_change=false where user_id=$1', [saved.user_id]); },
      { version: String(saved.security_version), email: saved.purpose === 'email_change' ? undefined : saved.email });
    const [app] = saved.return_app_id ? await this.db.query('select slug from accounts.app_settings where app_id=$1 and published', [saved.return_app_id]) : [];
    return { ok: true, loginUrl: app ? `/login?app=${encodeURIComponent(app.slug)}` : '/login' };
  }
  async registrationContinuation(value: unknown): Promise<string | null> {
    if (!value) return null;
    const path = text(value, 500);
    if (!path.startsWith('/account/authorize?')) return null;
    const parsed = new URL(path, this.config.origin);
    if (parsed.origin !== this.config.origin || parsed.pathname !== '/account/authorize' || parsed.hash) return null;
    const id = parsed.searchParams.get('authorization_id'); if (!id || !/^[a-zA-Z0-9]{32}$/.test(id)) return null;
    const [app] = await this.db.query(`select a.app_id from accounts.app_settings a join accounts.oauth_clients oc on oc.app_id=a.app_id and oc.enabled
      join auth.oauth_authorizations o on o.client_id=oc.client_id
      where o.authorization_id=$1 and o.expires_at>now() and o.status='pending' and o.redirect_uri=oc.callback_url and a.published`, [id]);
    return app?.app_id || null;
  }
  async launchAfterLogin(ctx: Context, slug: unknown): Promise<string | undefined> {
    if (!slug || ctx.user?.requirePasswordChange) return undefined;
    const user = this.requireUser(ctx);
    const [app] = await this.db.query(`select a.*,c.name,c.status,c.deleted_at from accounts.app_settings a join core.apps c on c.id=a.app_id where a.slug=$1`, [text(slug, 80)]);
    if (!app) return undefined;
    try { await this.ensureAccess(user, app); }
    catch (error) { if (error instanceof HttpError && error.status === 403) return undefined; throw error; }
    return exactHttps(app.launch_url).href;
  }
  async source(slug: string) {
    if (slug === 'developed') return { id: null, slug, name: 'DevelopED' };
    const [app] = await this.db.query(`select a.app_id as id,a.slug,c.name from accounts.app_settings a join core.apps c on c.id=a.app_id
      where a.slug=$1 and a.reportable and c.deleted_at is null`, [slug]);
    if (!app) return fail(404, 'unknown_report_source'); return app;
  }
  async report(ctx: Context, body: Row) {
    const app = await this.source(text(body.appSlug, 80, true));
    const contact = ctx.user ? ctx.user.email : body.contactEmail ? email(body.contactEmail) : null;
    const data = { summary: text(body.summary, 160), description: text(body.description, 10000, true),
      steps: text(body.steps, 5000), expected: text(body.expected, 2000), actual: text(body.actual, 2000), diagnostics: diagnostics(body.diagnostics),
      occurredAt: body.occurredAt ? text(body.occurredAt, 40) : null };
    if (data.occurredAt && (!Number.isFinite(Date.parse(data.occurredAt)) || Date.parse(data.occurredAt) > Date.now() + 300_000)) return fail(400, 'invalid_date');
    const key = hash(`${ctx.user?.id || ctx.session.id}:${uuid(body.idempotencyKey)}`), payloadHash = hash(JSON.stringify({ appId: app.id, contact, data }));
    return this.db.tx(async q => {
      const [report] = await q(`insert into accounts.reports(id,app_id,idempotency_hash,payload_hash,reporter_id,contact_email,contact_verified,summary,description,steps,expected,actual,diagnostics,occurred_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict(idempotency_hash) do nothing returning ticket`,
      [randomUUID(), app.id, key, payloadHash, ctx.user?.id || null, contact, Boolean(ctx.user), data.summary, data.description, data.steps, data.expected, data.actual, data.diagnostics, data.occurredAt]);
      if (!report) {
        const [prior] = await q('select ticket,payload_hash from accounts.reports where idempotency_hash=$1', [key]);
        if (prior!.payload_hash !== payloadHash) return fail(409, 'idempotency_conflict');
        return { reference: `DEV-${prior!.ticket}` };
      }
      const reference = `DEV-${report.ticket}`;
      await queueMail(q, this.config, reportMail(this.config.supportEmail, reference, app.name, 'en', true, this.config));
      if (ctx.user) await queueMail(q, this.config, reportMail(ctx.user.email, reference, app.name, ctx.user.language, false, this.config));
      return { reference };
    });
  }
  async ensureAccess(user: Row, app: Row) {
    if (!app.published || app.status !== 'ACTIVE' || app.deleted_at || app.join_policy === 'closed') return fail(403, 'app_unavailable');
    return this.db.tx(async q => {
      const [grant] = await q('select * from accounts.entitlements where user_id=$1 and app_id=$2 for update', [user.id, app.app_id]);
      if (grant?.suspended || (grant?.expires_at && new Date(grant.expires_at).getTime() <= Date.now())) return fail(403, 'app_access_denied');
      const [member] = await q('select role from core.app_access where user_id=$1 and app_id=$2', [user.id, app.app_id]);
      if (!grant && !member && app.join_policy !== 'free') return fail(403, 'app_access_denied');
      await q(`insert into core.app_access(id,user_id,app_id,role) values($1,$2,$3,'USER') on conflict(user_id,app_id) do nothing`, [`aa_${randomUUID().replaceAll('-', '')}`, user.id, app.app_id]);
      await q(`insert into accounts.entitlements(user_id,app_id,plan,source) values($1,$2,$3,$4) on conflict(user_id,app_id) do nothing`, [user.id, app.app_id, app.free_plan, member ? 'legacy' : 'free']);
      return grant?.plan || app.free_plan;
    });
  }
  async appForClient(client: string) {
    const [app] = await this.db.query(`select a.*,c.name,c.status,c.deleted_at,oc.client_id,oc.client_kind,oc.callback_url as registered_callback
      from accounts.oauth_clients oc join accounts.app_settings a on a.app_id=oc.app_id join core.apps c on c.id=a.app_id
      where oc.client_id=$1 and oc.enabled`, [uuid(client)]);
    if (!app) return fail(403, 'unregistered_client'); return app;
  }
  async internalCheck(serverKey: string, accessToken: unknown) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(serverKey)) return fail(401, 'invalid_app_credentials');
    const [app] = await this.db.query(`select a.*,c.name,c.status,c.deleted_at from accounts.app_settings a join core.apps c on c.id=a.app_id where a.server_key_hash=$1`, [hash(serverKey)]);
    if (!app) return fail(401, 'invalid_app_credentials');
    const checked = await this.oauthContext(text(accessToken, 12000, true));
    if (checked.app.app_id !== app.app_id) return fail(401, 'invalid_session');
    const plan = await this.ensureAccess(checked.user, checked.app);
    const activationRequested = this.config.musicOrigin && app.app_id==='app_mega_music'
      ? Boolean((await this.db.query('select user_id from accounts.product_registrations where user_id=$1 and app_id=$2',[checked.user.id,app.app_id])).length) : false;
    return { user: this.publicUser(checked.user), app: { id: app.app_id, plan, activationRequested, unlimitedStorage: checked.user.role === 'SUPERADMIN' }, client: { id: checked.client.client_id, kind: checked.client.client_kind }, securityVersion: checked.user.security_version };
  }
  async validateOAuthAccess(accessToken: string, expectedClientId?: string) {
    const { user, app, client } = await this.oauthContext(accessToken, expectedClientId);
    const plan = await this.ensureAccess(user, app);
    return { user: this.publicUser(user), app: { id: app.app_id, plan, unlimitedStorage: user.role === 'SUPERADMIN' }, client: { id: client.client_id, kind: client.client_kind }, securityVersion: user.security_version };
  }
  private async oauthContext(accessToken: string, expectedClientId?: string, requireBinding = true) {
    const access = text(accessToken, 12000, true);
    const providerUser = await this.provider.user(access), parsed = claims(access);
    if (parsed.sub !== providerUser.id || !parsed.client_id || !providerUser.email_confirmed_at) return fail(401, 'invalid_session');
    if (expectedClientId && parsed.client_id !== expectedClientId) return fail(401, 'invalid_session');
    const [client] = await this.db.query('select client_id,client_kind,app_id from accounts.oauth_clients where client_id=$1 and enabled', [uuid(parsed.client_id)]);
    if (!client) return fail(401, 'invalid_session');
    const [app] = await this.db.query(`select a.*,c.name,c.status,c.deleted_at from accounts.app_settings a join core.apps c on c.id=a.app_id where a.app_id=$1`, [client.app_id]);
    if (!app) return fail(401, 'invalid_session');
    const user = await this.userById(parsed.sub);
    if (!user || user.locked || user.operation_id || user.requirePasswordChange || !user.emailVerified) return fail(403, 'account_unavailable');
    const [valid] = await this.db.query(`select id from auth.sessions where id=$1 and user_id=$2 and oauth_client_id=$3
      and created_at>$4 and (not_after is null or not_after>now())`, [parsed.session_id, user.id, client.client_id, user.revoked_before]);
    if (!valid) return fail(401, 'invalid_session');
    if (requireBinding && client.client_kind === 'web') {
      const [binding] = await this.db.query(`select d.user_id,d.client_id,f.user_id as family_user_id,f.revoked_at,
        exists(select 1 from accounts.sessions cs join auth.sessions ps on ps.id=cs.provider_session_id and ps.user_id=cs.user_id
          where cs.browser_family_id=f.id and cs.user_id=f.user_id and cs.mfa_pending is null
          and cs.revoked_at is null and cs.expires_at>now() and (cs.mfa_remember_until>now() or cs.last_seen_at>now()-interval '24 hours')
          and (cs.mfa_trust_id is null or accounts.browser_trust_valid(cs.mfa_trust_id,cs.user_id,cs.security_version))
          and (ps.not_after is null or ps.not_after>now())) as active
        from accounts.browser_delegations d join accounts.browser_families f on f.id=d.browser_family_id where d.provider_session_id=$1`, [parsed.session_id]);
      if (binding) {
        if (binding.user_id !== user.id || binding.family_user_id !== user.id || binding.client_id !== client.client_id || binding.revoked_at || !binding.active) return fail(401, 'invalid_session');
      } else {
        const [settings] = await this.db.query('select browser_binding_required from accounts.settings where singleton');
        if (!settings || settings.browser_binding_required) return fail(401, 'invalid_session');
      }
    }
    return { user, app, client, parsed };
  }
  async finalizeOAuthCode(code: string, accessToken: string, expectedClientId: string): Promise<void> {
    if (typeof code !== 'string' || !code || code.length>2048) return fail(400, 'invalid_authorization');
    const codeHash = hash(code); // Opaque credential: never trim or normalize it.
    // A token freshly returned by the private provider still needs subject,
    // client, live session and central policy validation before binding.
    const { user, app, client, parsed } = await this.oauthContext(accessToken, expectedClientId, false);
    await this.ensureAccess(user, app);
    await this.db.tx(async q => {
      const [state] = await q('select * from accounts.security_state where user_id=$1 for update', [user.id]);
      const [binding] = await q(`select * from accounts.oauth_code_bindings where code_hash=$1 and user_id=$2 and client_id=$3
        and consumed_at is null and expires_at>now()`, [codeHash, user.id, client.client_id]);
      if (!state || state.locked || state.operation_id || state.require_password_change || !binding
        || String(binding.security_version) !== String(state.security_version)) return fail(401, 'invalid_session');
      if (client.client_kind === 'web') {
        const [family] = await q('select id from accounts.browser_families where id=$1 and user_id=$2 and revoked_at is null for update', [binding.browser_family_id, user.id]);
        if (!family) return fail(401, 'invalid_session');
        const [active] = await q(`select cs.id from accounts.sessions cs join auth.sessions ps on ps.id=cs.provider_session_id and ps.user_id=cs.user_id
          where cs.browser_family_id=$1 and cs.user_id=$2 and cs.mfa_pending is null and cs.revoked_at is null
          and cs.expires_at>now() and (cs.mfa_remember_until>now() or cs.last_seen_at>now()-interval '24 hours')
          and (cs.mfa_trust_id is null or accounts.browser_trust_valid(cs.mfa_trust_id,cs.user_id,cs.security_version))
          and (ps.not_after is null or ps.not_after>now()) limit 1`, [family.id, user.id]);
        if (!active) return fail(401, 'invalid_session');
      } else if (binding.browser_family_id !== null) return fail(401, 'invalid_session');
      const [valid] = await q(`select id from auth.sessions where id=$1 and user_id=$2 and oauth_client_id=$3
        and created_at>$4 and (not_after is null or not_after>now())`, [parsed.session_id, user.id, client.client_id, state.revoked_before]);
      if (!valid) return fail(401, 'invalid_session');
      const [consumed] = await q(`update accounts.oauth_code_bindings set consumed_at=now() where code_hash=$1
        and consumed_at is null and expires_at>now() returning code_hash`, [codeHash]);
      if (!consumed) return fail(401, 'invalid_session');
      if (client.client_kind === 'web') {
        // No upsert/reparent: a provider session can belong to exactly one family.
        await q(`insert into accounts.browser_delegations(provider_session_id,user_id,client_id,browser_family_id)
          values($1,$2,$3,$4)`, [parsed.session_id, user.id, client.client_id, binding.browser_family_id]);
      }
    });
  }
  async internalUserCheck(serverKey: string, userId: unknown) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(serverKey)) return fail(401, 'invalid_app_credentials');
    const [app] = await this.db.query(`select a.*,c.name,c.status,c.deleted_at from accounts.app_settings a join core.apps c on c.id=a.app_id where a.server_key_hash=$1`, [hash(serverKey)]);
    if (!app) return fail(401, 'invalid_app_credentials');
    const user = await this.userById(uuid(userId));
    if (!user || user.locked || user.operation_id || !user.emailVerified) return fail(403, 'account_unavailable');
    // Only after the product verifies its own independent API/device credential.
    // Do not provision membership from a user ID alone.
    const [member] = await this.db.query('select user_id from core.app_access where user_id=$1 and app_id=$2', [user.id, app.app_id]);
    if (!member) return fail(403, 'app_access_denied');
    const plan = await this.ensureAccess(user, app);
    return { user: this.publicUser(user), app: { id: app.app_id, plan, unlimitedStorage: user.role === 'SUPERADMIN' }, securityVersion: user.security_version };
  }
  async authorize(ctx: Context, authorizationId: unknown, approve?: boolean) {
    const user = this.requireUser(ctx), id = text(authorizationId, 100, true);
    if (!/^[a-zA-Z0-9]{32}$/.test(id)) return fail(400, 'invalid_authorization');
    const [authorization] = await this.db.query(`select authorization_id,client_id,user_id,redirect_uri,scope,code_challenge_method,nonce,status,expires_at
      from auth.oauth_authorizations where authorization_id=$1`, [id]);
    if (!authorization || new Date(authorization.expires_at).getTime() <= Date.now() || authorization.status !== 'pending' || (authorization.user_id && authorization.user_id !== user.id)) return fail(400, 'invalid_authorization');
    const app = await this.appForClient(authorization.client_id);
    if (this.config.surfaceAppId && app.app_id !== this.config.surfaceAppId) return fail(403,'wrong_app_surface');
    const scopes = authorization.scope.split(' ').filter(Boolean) as string[];
    if (authorization.redirect_uri !== app.registered_callback || authorization.code_challenge_method !== 's256' || !authorization.nonce
      || !scopes.includes('openid') || scopes.some(scope => !['openid','email','profile'].includes(scope))) return fail(400, 'invalid_authorization');
    await this.ensureAccess(user, app);
    if (approve === undefined) return { app: { id: app.app_id, name: app.name }, scopes };
    const access = await this.providerToken(ctx);
    // Inspect eligibility before GET: remembered consent may immediately issue code.
    const details = await this.provider.call<Row>(`/oauth/authorizations/${id}`, 'GET', undefined, access);
    const result = details.redirect_url ? details : await this.provider.call<Row>(`/oauth/authorizations/${id}/consent`, 'POST', { action: approve ? 'approve' : 'deny' }, access);
    if (typeof result.redirect_url !== 'string') return fail(502, 'invalid_provider_response');
    const target = oauthCallback(result.redirect_url, app.client_kind, this.config.insecureLocal), registered = oauthCallback(app.registered_callback, app.client_kind, this.config.insecureLocal);
    if (target.protocol !== registered.protocol || target.host !== registered.host || target.pathname !== registered.pathname || target.hash) return fail(502, 'invalid_provider_response');
    if (!approve && details.redirect_url) {
      // Do not return an already minted code after a user chose Cancel.
      target.searchParams.delete('code'); target.searchParams.set('error', 'access_denied');
    }
    if (approve && target.searchParams.has('code')) {
      const code = target.searchParams.get('code')!;
      if (!code || code.length>2048) return fail(502, 'invalid_provider_response');
      await this.db.tx(async q => {
        const [state] = await q('select * from accounts.security_state where user_id=$1 for update', [user.id]);
        if (!state || state.locked || state.operation_id || state.require_password_change
          || String(state.security_version) !== String(ctx.session.security_version)) return fail(401, 'invalid_session');
        const [family] = await q('select id from accounts.browser_families where id=$1 and user_id=$2 and revoked_at is null for update', [ctx.session.browser_family_id, user.id]);
        if (!family) return fail(401, 'invalid_session');
        const [current] = await q(`select id from accounts.sessions where id=$1 and user_id=$2
          and browser_family_id=$3 and revoked_at is null and expires_at>now() for update`, [ctx.session.id, user.id, family.id]);
        if (!current) return fail(401, 'invalid_session');
        await q(`insert into accounts.oauth_code_bindings(code_hash,user_id,client_id,browser_family_id,security_version,expires_at)
          values($1,$2,$3,$4,$5,now()+interval '5 minutes')`, [hash(code), user.id, app.client_id, app.client_kind === 'web' ? family.id : null, state.security_version]);
      });
    }
    return { redirectUrl: target.href };
  }
}
