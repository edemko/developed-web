import { randomUUID } from 'node:crypto';
import type { Accounts, Context } from './accounts.js';
import type { ProviderSession } from './provider.js';
import { claims, fail, HttpError, unseal, uuid } from './security.js';
import { queueMail, securityMail } from './mail.js';

/** TOTP control plane: this class is reachable only behind central cookie/CSRF. */
export class Mfa {
  constructor(readonly accounts: Accounts) {}
  private candidate(ctx: Context) {
    const user = ctx.candidate || ctx.user;
    if (!user) return fail(401, 'authentication_required');
    return user;
  }
  private auth(ctx: Context) {
    const auth = unseal<ProviderSession>(ctx.session.provider_tokens, this.accounts.config.encryptionKey, `session:${ctx.session.id}`);
    const parsed = claims(auth.access_token);
    if (parsed.sub !== this.candidate(ctx).id || parsed.session_id !== ctx.session.provider_session_id || parsed.client_id) return fail(401, 'invalid_session');
    return auth;
  }
  async status(ctx: Context) {
    const user = this.candidate(ctx);
    const factors = await this.accounts.db.query("select id,factor_type as type from auth.mfa_factors where user_id=$1 and status='verified' and factor_type='totp'", [user.id]);
    return { mode: ctx.mfa?.mode || null, enabled: Boolean(user.hasMfa), required: user.role === 'SUPERADMIN', factors,
      enrollmentId: ctx.session.mfa_enrollment_id || null };
  }
  async enroll(ctx: Context, password?: unknown) {
    const user = this.candidate(ctx), accounts = this.accounts;
    await accounts.db.limit(`mfa:enroll:${user.id}`, 3, 3600);
    if (user.hasMfa || ctx.mfa?.mode === 'challenge') return fail(409, 'mfa_already_enrolled');
    if (ctx.session.mfa_enrollment_id) return fail(409, 'mfa_enrollment_pending');
    let next = ctx;
    if (!ctx.mfa) {
      const auth = await accounts.checkPassword(user, password);
      next = await accounts.newSession(ctx, auth, user, { enroll: true });
    }
    // An enrollment can only use the fresh password-established restricted
    // session, never an expired remembered login or an arbitrary browser bearer.
    if (Date.now() - new Date(next.session.created_at).getTime() > 600_000) return fail(401, 'invalid_session');
    const access = this.auth(next).access_token;
    const operation = randomUUID();
    const [reserved] = await accounts.db.query(`update accounts.sessions set refresh_id=$2,refresh_started_at=now()
      where id=$1 and revoked_at is null and expires_at>now() and refresh_id is null and mfa_enrollment_id is null returning id`, [next.session.id, operation]);
    if (!reserved) return fail(409, 'mfa_operation_pending');
    try {
      const result = await accounts.provider.enrollTotp(access, `DevelopED ${randomUUID().slice(0, 8)}`);
      uuid(result.id);
      if (result.type !== 'totp' || !/^[A-Z2-7]{16,128}$/.test(result.totp?.secret) || typeof result.totp.qr_code !== 'string' || result.totp.qr_code.length > 1048576) return fail(502, 'invalid_provider_response');
      const [saved] = await accounts.db.query(`update accounts.sessions set mfa_enrollment_id=$3,refresh_id=null,refresh_started_at=null
        where id=$1 and refresh_id=$2 and revoked_at is null and expires_at>now() returning id`, [next.session.id, operation, result.id]);
      if (!saved) return fail(401, 'invalid_session');
      next.session.mfa_enrollment_id = result.id;
      await accounts.db.audit(accounts.db.query, user.id, user.id, 'mfa_enrollment', 'started');
      return { context: next, enrollment: { factorId: result.id, secret: result.totp.secret,
        qrCode: `data:image/svg+xml;base64,${Buffer.from(result.totp.qr_code).toString('base64')}` } };
    } catch (error) {
      // Ambiguous enrollment leaves no usable authenticated session. An
      // unverified orphan expires at the provider; never remove verified MFA.
      await accounts.db.query('update accounts.sessions set revoked_at=now() where id=$1 and refresh_id=$2', [next.session.id, operation]);
      throw error;
    }
  }
  async verify(ctx: Context, factorInput: unknown, code: unknown) {
    const accounts = this.accounts, user = this.candidate(ctx), factorId = uuid(factorInput);
    if (!ctx.mfa) return fail(409, 'mfa_not_pending');
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return fail(400, 'invalid_mfa_code');
    await accounts.db.limit(`mfa:verify:${user.id}`, 8, 900);
    const [factor] = await accounts.db.query('select id,status,factor_type from auth.mfa_factors where id=$1 and user_id=$2', [factorId, user.id]);
    const enrollment = ctx.mfa.mode === 'enroll';
    if (!factor || factor.factor_type !== 'totp' || (enrollment ? factorId !== ctx.session.mfa_enrollment_id || factor.status !== 'unverified' : factor.status !== 'verified')) return fail(400, 'invalid_mfa_factor');
    const auth = this.auth(ctx), operation = randomUUID();
    // Verification rotates provider tokens. Commit a durable fence before the
    // remote call; ambiguous outcomes must never reuse the previous bundle.
    const [reserved] = await accounts.db.query(`update accounts.sessions set refresh_id=$2,refresh_started_at=now()
      where id=$1 and revoked_at is null and expires_at>now() and refresh_id is null returning id`, [ctx.session.id, operation]);
    if (!reserved) return fail(409, 'mfa_operation_pending');
    let verified = false;
    try {
      const upgraded = await accounts.provider.verifyTotp(auth.access_token, factorId, code);
      verified = true;
      const parsed = claims(upgraded.access_token);
      if (upgraded.user.id !== user.id || parsed.sub !== user.id || parsed.session_id !== ctx.session.provider_session_id || parsed.aal !== 'aal2' || parsed.client_id) return fail(401, 'invalid_session');
      const freshUser = await accounts.userById(user.id);
      if (!freshUser?.hasMfa) return fail(401, 'invalid_session');
      const next = await accounts.newSession(ctx, upgraded, freshUser, { fence: operation });
      if (next.mfa) return fail(401, 'invalid_session');
      await accounts.db.tx(async q => {
        await accounts.db.audit(q, user.id, user.id, enrollment ? 'mfa_enabled' : 'mfa_challenge', 'succeeded');
        if (enrollment) {
          await q('update accounts.sessions set revoked_at=now() where user_id=$1 and id<>$2 and revoked_at is null', [user.id, next.session.id]);
          await queueMail(q, accounts.config, securityMail(user.email, user.language, accounts.config, 'mfa_enabled'));
        }
      });
      return next;
    } catch (error) {
      if (!verified && error instanceof HttpError && error.status === 400) {
        // A definite rejected code did not rotate tokens and is safe to retry.
        await accounts.db.query('update accounts.sessions set refresh_id=null,refresh_started_at=null where id=$1 and refresh_id=$2 and revoked_at is null', [ctx.session.id, operation]);
        return fail(400, 'invalid_mfa_code');
      }
      await accounts.db.query('update accounts.sessions set revoked_at=now() where id=$1 and refresh_id=$2', [ctx.session.id, operation]);
      throw error;
    }
  }
}
