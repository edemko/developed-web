import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Accounts, type Context } from './accounts.js';
import { diagnostics, email, equal, fail, hash, HttpError, language, password, text, uuid } from './security.js';
import type { Row } from './db.js';
import { Mfa } from './mfa.js';
import { catalogApp } from './catalog.js';
import { oauthBroker } from './oauth-broker.js';

const assets = new Map<string, [string, string]>([
  ['app.js', ['app.js', 'text/javascript']], ['i18n.js', ['i18n.js', 'text/javascript']],
  ['app.css', ['app.css', 'text/css']], ['logo.svg', ['logo.svg', 'image/svg+xml']],
]);
async function body(req: IncomingMessage): Promise<Row> {
  if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') return fail(415, 'json_required');
  if (req.headers['content-encoding']) return fail(415, 'encoding_not_supported');
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length; if (size > 32768) return fail(413, 'request_too_large'); chunks.push(chunk);
  }
  try { const parsed = JSON.parse(Buffer.concat(chunks).toString()); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(400, 'invalid_json'); return parsed; }
  catch { return fail(400, 'invalid_json'); }
}
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data));
}
function integer(value: string | null, fallback: number, max: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) > max) return fail(400, 'invalid_pagination');
  return Number(value);
}
function cookieValue(req: IncomingMessage, name: string) {
  const items = (req.headers.cookie || '').split(';').map(x => x.trim()).filter(x => x.startsWith(`${name}=`));
  return items.length === 1 ? items[0]!.slice(name.length + 1) : undefined;
}
export function marketingPolicy(html: string) {
  // Exact, operator-curated static HTML only. Preserve its existing inline
  // progressive-enhancement/JSON-LD scripts without weakening account-page CSP.
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(match => !/\bsrc\s*=/i.test(match[1]!))
    .map(match => `'sha256-${createHash('sha256').update(match[2]!).digest('base64')}'`);
  return `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self' ${hashes.join(' ')}; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'`;
}
export function createAccountServer(accounts: Accounts) {
  const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
  const mfa = new Mfa(accounts);
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (!accounts.config.insecureLocal) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(req.url || '/', accounts.config.origin), method = req.method || 'GET';
      if (url.origin !== accounts.config.origin) return fail(400, 'invalid_request');
      // Only the issuer's exact OAuth routes are mapped here by the gateway.
      // These standard back-channel endpoints never bootstrap browser cookies,
      // trust a portal cookie, or expose a generic provider proxy.
      if (url.pathname === '/oauth/token' || url.pathname === '/oauth/userinfo') {
        if (url.search) return json(res, { error: 'invalid_request' }, 400);
        return await oauthBroker(accounts, req, res, url.pathname);
      }
      if (url.pathname === '/health' && method === 'GET') return json(res, { ok: true });
      if (!url.pathname.startsWith('/api/account/')) {
        if (method !== 'GET' && method !== 'HEAD') return fail(405, 'method_not_allowed');
        if (url.pathname === '/' || url.pathname === '/en/') {
          const ctx = await accounts.bootstrap(cookieValue(req, accounts.config.insecureLocal ? 'developed_local' : '__Host-developed_session'));
          if (ctx.cookie) res.setHeader('Set-Cookie', ctx.cookie);
          if (ctx.user) { res.writeHead(303, { Location: '/apps' }); return res.end(); }
          if (!accounts.config.marketingDir) return fail(503, 'marketing_not_configured');
          const html = await readFile(`${accounts.config.marketingDir}/${url.pathname === '/en/' ? 'en/' : ''}index.html`, 'utf8');
          res.setHeader('Content-Security-Policy', marketingPolicy(html));
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(method === 'HEAD' ? undefined : html);
        }
        if (url.pathname.startsWith('/account-assets/')) {
          const asset = assets.get(url.pathname.slice('/account-assets/'.length));
          if (!asset) return fail(404, 'not_found');
          const content = await readFile(`${publicRoot}${asset[0]}`);
          res.setHeader('Content-Type', `${asset[1]}; charset=utf-8`); return res.end(method === 'HEAD' ? undefined : content);
        }
        if (!/^\/(apps|login|register|verify-email|forgot-password|reset-password|profile|security|account\/authorize|admin\/(apps|users|reports)|report-bug(?:\/[a-z0-9-]+)?)$/.test(url.pathname)) return fail(404, 'not_found');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(method === 'HEAD' ? undefined : await readFile(`${publicRoot}index.html`));
      }
      const path = url.pathname.slice('/api/account'.length);
      // Service is loopback bound. No caller-supplied Forwarded header is trusted.
      // Production reverse proxy must also rate-limit clients before this boundary.
      const address = req.socket.remoteAddress || 'unknown';
      await accounts.db.limit(`requests:${address}`, 2000, 60);
      if (path === '/internal/session/check' || path === '/internal/user/check') {
        if (method !== 'POST') return fail(405, 'method_not_allowed');
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) return fail(401, 'invalid_app_credentials');
        const data = await body(req);
        return json(res, path === '/internal/session/check' ? await accounts.internalCheck(auth.slice(7), data.accessToken) : await accounts.internalUserCheck(auth.slice(7), data.userId));
      }
      if (path === '/catalog' && method === 'GET') {
        const apps = await accounts.db.query(`select a.app_id as id,a.slug,c.name,c.description,c.icon,a.launch_url as "launchUrl"
          from accounts.app_settings a join core.apps c on c.id=a.app_id
          where a.published and c.status='ACTIVE' and c.deleted_at is null order by c.sort_order,c.name`);
        return json(res, { apps: apps.map(catalogApp) });
      }
      let ctx = await accounts.bootstrap(cookieValue(req, accounts.config.insecureLocal ? 'developed_local' : '__Host-developed_session'));
      const setContext = (next: Context) => { ctx = next; if (ctx.cookie) res.setHeader('Set-Cookie', ctx.cookie); };
      setContext(ctx);
      let data: Row = {};
      if (!['GET', 'HEAD'].includes(method)) {
        if (req.headers.origin !== accounts.config.origin || req.headers['sec-fetch-site'] === 'cross-site') return fail(403, 'invalid_origin');
        if (!equal(req.headers['x-csrf-token'], accounts.csrf(ctx.session))) return fail(403, 'invalid_csrf');
        data = await body(req);
      }
      if (method === 'GET' && path === '/session') {
        const [settings] = await accounts.db.query('select registration_mode from accounts.settings where singleton');
        return json(res, { csrfToken: accounts.csrf(ctx.session), user: accounts.publicUser(ctx.user), mfa: ctx.mfa || null, registrationMode: settings!.registration_mode, supportEmail: accounts.config.supportEmail });
      }
      if (path === '/mfa' && method === 'GET') return json(res, await mfa.status(ctx));
      if (path === '/mfa/enroll' && method === 'POST') {
        const result = await mfa.enroll(ctx, data.password); setContext(result.context);
        return json(res, result.enrollment);
      }
      if (path === '/mfa/verify' && method === 'POST') {
        setContext(await mfa.verify(ctx, data.factorId, data.code));
        const redirectUrl = await accounts.launchAfterLogin(ctx, data.appSlug);
        return json(res, { user: accounts.publicUser(ctx.user), ...(redirectUrl ? { redirectUrl } : {}) });
      }
      if (method === 'POST' && ['/login', '/register', '/resend-verification', '/forgot-password', '/reset-password', '/verify-email', '/reauthenticate'].includes(path)) {
        await accounts.db.limit(`sensitive:${address}`, 200, 3600);
        if (path === '/login') {
          setContext(await accounts.login(ctx, data));
          const redirectUrl = ctx.user ? await accounts.launchAfterLogin(ctx, data.appSlug) : undefined;
          return json(res, { user: accounts.publicUser(ctx.user), mfa: ctx.mfa || null, ...(redirectUrl ? { redirectUrl } : {}) });
        }
        if (path === '/register') return json(res, await accounts.register(data));
        if (path === '/resend-verification' || path === '/forgot-password') { await accounts.sendCredential(data.email, path === '/forgot-password'); return json(res, { accepted: true }); }
        if (path === '/verify-email' || path === '/reset-password') return json(res, await accounts.consumeCredential(data.token, path === '/reset-password' ? data.password : undefined));
        const user = accounts.requireUser(ctx, true);
        await accounts.db.limit(`reauth:${user.id}`, 10, 900);
        const auth = await accounts.checkPassword(user, data.password, data.code, data.factorId);
        setContext(await accounts.newSession(ctx, auth, user)); return json(res, { ok: true });
      }
      if (path === '/invitation/preview' && method === 'POST') {
        await accounts.db.limit(`invitation-preview:${address}`, 200, 3600);
        return json(res, await accounts.invitationPreview(data.token));
      }
      if ((path === '/logout' || path === '/logout-all') && method === 'POST') {
        if (path === '/logout-all') await accounts.logoutAll(ctx);
        else await accounts.logout(ctx);
        res.setHeader('Set-Cookie', accounts.cookie('', 0)); return json(res, { ok: true });
      }
      if (path.startsWith('/reports/source/') && method === 'GET') return json(res, { app: await accounts.source(path.slice('/reports/source/'.length)) });
      if (path === '/reports' && method === 'POST') {
        await accounts.db.limit(`reports:${ctx.user?.id || ctx.session.id}`, 5, 3600);
        await accounts.db.limit('reports:aggregate', 100, 86400);
        return json(res, await accounts.report(ctx, data), 201);
      }
      const user = accounts.requireUser(ctx, path.startsWith('/profile') || path === '/security');
      if (path === '/apps' && method === 'GET') {
        const apps = await accounts.db.query(`select a.app_id as id,a.slug,c.name,c.description,c.icon,a.launch_url as "launchUrl",
          (a.join_policy<>'closed' and c.status='ACTIVE' and not coalesce(e.suspended,false) and (e.expires_at is null or e.expires_at>now())
          and (a.join_policy='free' or e.user_id is not null or m.user_id is not null)) as available,
          coalesce(e.plan,a.free_plan) as plan from accounts.app_settings a join core.apps c on c.id=a.app_id
          left join accounts.entitlements e on e.app_id=a.app_id and e.user_id=$1
          left join core.app_access m on m.app_id=a.app_id and m.user_id=$1
          where a.published and c.deleted_at is null order by c.sort_order,c.name`, [user.id]);
        return json(res, { apps: apps.map(catalogApp) });
      }
      if (path === '/profile' && method === 'PATCH') {
        const name = text(data.displayName, 100, true), lang = language(data.language);
        await accounts.db.tx(async q => {
          await q('update core.profiles set display_name=$2,updated_at=now() where id=$1', [user.id, name]);
          await q(`insert into accounts.security_state(user_id,language) values($1,$2) on conflict(user_id) do update set language=$2`, [user.id, lang]);
        });
        return json(res, { user: accounts.publicUser(await accounts.userById(user.id)) });
      }
      if (['/profile/password', '/profile/email'].includes(path) && method === 'POST') {
        await accounts.db.limit(`identity:${user.id}`, 10, 3600);
        const nextPassword = path.endsWith('password') ? password(data.password) : null;
        const nextEmail = path.endsWith('email') ? email(data.email) : null;
        const auth = await accounts.checkPassword(user, data.currentPassword, data.code, data.factorId);
        await accounts.provider.logout(auth.access_token, 'local');
        if (nextPassword) {
          await accounts.mutateIdentity(user.id, user.id, 'password_change', { password: nextPassword }, async q => {
            await q('update accounts.security_state set require_password_change=false where user_id=$1', [user.id]);
          }, { version: String(user.security_version), email: user.email });
          res.setHeader('Set-Cookie', accounts.cookie('', 0)); return json(res, { ok: true });
        }
        if (user.requirePasswordChange) return fail(403, 'password_change_required');
        await accounts.db.tx(q => accounts.credential(q, user, nextEmail!, 'email_change', user.language));
        return json(res, { accepted: true });
      }
      if (path === '/security' && method === 'GET') {
        const sessions = await accounts.db.query(`select id,created_at as "createdAt",expires_at as "expiresAt",id=$2 as current
          from accounts.sessions where user_id=$1 and revoked_at is null and expires_at>now() order by created_at desc`, [user.id, ctx.session.id]);
        return json(res, { sessions });
      }
      if (path === '/authorize' && method === 'GET') return json(res, await accounts.authorize(ctx, url.searchParams.get('authorization_id')));
      if (path === '/authorize' && method === 'POST') {
        if (typeof data.approve !== 'boolean') return fail(400, 'invalid_input');
        return json(res, await accounts.authorize(ctx, data.authorizationId, data.approve));
      }
      if (!path.startsWith('/admin/')) return fail(404, 'not_found');
      accounts.requireAdmin(ctx, method !== 'GET');
      if (path === '/admin/registration') {
        if (method === 'GET') {
          const [settings] = await accounts.db.query('select registration_mode as mode from accounts.settings where singleton'); return json(res, settings);
        }
        if (method === 'PATCH') {
          if (!['open','invitation','closed'].includes(data.mode)) return fail(400, 'invalid_policy');
          await accounts.db.tx(async q => {
            await q('update accounts.settings set registration_mode=$1,updated_at=now() where singleton', [data.mode]);
            await accounts.db.audit(q, user.id, null, 'registration_policy', 'succeeded', { mode: data.mode });
          }); return json(res, { ok: true });
        }
      }
      if (path === '/admin/invitations' && method === 'POST') {
        await accounts.db.limit(`invitations:${user.id}`, 20, 3600);
        await accounts.db.tx(q => accounts.credential(q, null, email(data.email), 'invitation', user.language)); return json(res, { accepted: true });
      }
      if (path === '/admin/apps' && method === 'GET') {
        const apps = await accounts.db.query(`select a.app_id as id,a.slug,c.name,c.description,c.icon,a.launch_url as "launchUrl",
          a.published,a.join_policy as "joinPolicy",a.reportable from accounts.app_settings a join core.apps c on c.id=a.app_id order by c.sort_order,c.name`);
        return json(res, { apps });
      }
      if (path.startsWith('/admin/apps/') && method === 'PATCH') {
        if (data.published !== undefined && typeof data.published !== 'boolean' || data.reportable !== undefined && typeof data.reportable !== 'boolean'
          || data.joinPolicy !== undefined && !['free','invitation','closed'].includes(data.joinPolicy)) return fail(400, 'invalid_policy');
        const appId = text(decodeURIComponent(path.slice('/admin/apps/'.length)), 100, true);
        await accounts.db.tx(async q => {
          const [app] = await q(`update accounts.app_settings set published=coalesce($2,published),join_policy=coalesce($3,join_policy),
            reportable=coalesce($4,reportable),updated_at=now() where app_id=$1 returning app_id`, [appId, data.published, data.joinPolicy, data.reportable]);
          if (!app) return fail(404, 'app_not_found');
          await accounts.db.audit(q, user.id, null, 'app_policy', 'succeeded', { appId, published: data.published, joinPolicy: data.joinPolicy, reportable: data.reportable });
        }); return json(res, { ok: true });
      }
      if (path === '/admin/users' && method === 'GET') {
        const users = await accounts.db.query(`select p.id,u.email,p.display_name as "displayName",p.role,coalesce(s.locked,false) as locked,p.created_at as "createdAt"
          from core.profiles p join auth.users u on u.id=p.id left join accounts.security_state s on s.user_id=p.id
          where u.email ilike $1 or p.display_name ilike $1 order by p.created_at desc limit $2 offset $3`,
        [`%${text(url.searchParams.get('q') || '', 100).replaceAll('%', '\\%').replaceAll('_', '\\_')}%`, integer(url.searchParams.get('limit'), 50, 100), integer(url.searchParams.get('offset'), 0, 100000)]);
        return json(res, { users });
      }
      const userAction = path.match(/^\/admin\/users\/([^/]+)\/action$/);
      if (userAction && method === 'POST') {
        const target = uuid(userAction[1]), action = text(data.action, 30, true);
        const targetUser = await accounts.userById(target); if (!targetUser) return fail(404, 'user_not_found');
        if (action === 'send-reset') {
          await accounts.sendCredential(targetUser.email, true);
          await accounts.db.audit(accounts.db.query, user.id, target, 'admin_send_reset', 'succeeded');
        } else if (action === 'set-password') {
          if (data.requirePasswordChange !== undefined && typeof data.requirePasswordChange !== 'boolean') return fail(400, 'invalid_input');
          await accounts.mutateIdentity(user.id, target, 'admin_set_password', { password: password(data.password) }, async q => {
            await q('update accounts.security_state set require_password_change=$2 where user_id=$1', [target, data.requirePasswordChange !== false]);
          });
        } else if (action === 'lock' || action === 'unlock') {
          if (action === 'lock' && user.id === target) return fail(409, 'cannot_lock_self');
          await accounts.mutateIdentity(user.id, target, `admin_${action}`, { ban_duration: action === 'lock' ? '876000h' : 'none' }, async q => {
            await q('update accounts.security_state set locked=$2 where user_id=$1', [target, action === 'lock']);
          });
        } else if (action === 'revoke-sessions') {
          await accounts.db.tx(async q => { await accounts.revoke(q, target); await accounts.db.audit(q, user.id, target, 'admin_revoke_sessions', 'succeeded'); });
        } else return fail(400, 'invalid_action');
        return json(res, { ok: true });
      }
      if (path === '/admin/reports' && method === 'GET') {
        const status = url.searchParams.get('status') || null, app = url.searchParams.get('app') || null, reporter = url.searchParams.get('user');
        if (status && !['new','in_progress','resolved','closed'].includes(status)) return fail(400, 'invalid_status');
        const from = url.searchParams.get('from'), to = url.searchParams.get('to');
        if ([from, to].some(v => v && !Number.isFinite(Date.parse(v)))) return fail(400, 'invalid_date');
        const reports = await accounts.db.query(`select r.id,'DEV-'||r.ticket as reference,r.app_id as "appId",coalesce(c.name,'DevelopED') as "appName",
          r.summary,r.description,r.steps,r.expected,r.actual,r.reporter_id as "reporterId",r.contact_email as "contactEmail",r.contact_verified as "contactVerified",
          r.created_at as "createdAt",r.occurred_at as "occurredAt",r.diagnostics,r.status,
          coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'note',n.note,'actorId',n.actor_id,'createdAt',n.created_at) order by n.created_at) from accounts.report_notes n where n.report_id=r.id),'[]') as notes
          from accounts.reports r left join core.apps c on c.id=r.app_id
          where ($1::text is null or r.app_id=$1 or ($1='developed' and r.app_id is null)) and ($2::text is null or r.status=$2)
          and ($3::uuid is null or r.reporter_id=$3) and ($4::timestamptz is null or r.created_at>=$4)
          and ($5::timestamptz is null or r.created_at<=$5) order by r.created_at desc limit $6 offset $7`,
        [app, status, reporter ? uuid(reporter) : null, from, to, integer(url.searchParams.get('limit'), 50, 100), integer(url.searchParams.get('offset'), 0, 100000)]);
        return json(res, { reports });
      }
      if (path.startsWith('/admin/reports/') && method === 'PATCH') {
        const id = uuid(path.slice('/admin/reports/'.length)), note = text(data.note, 5000);
        if (data.status !== undefined && !['new','in_progress','resolved','closed'].includes(data.status)) return fail(400, 'invalid_status');
        if (!note && data.status === undefined) return fail(400, 'invalid_input');
        await accounts.db.tx(async q => {
          const [report] = await q('update accounts.reports set status=coalesce($2,status),updated_at=now() where id=$1 returning id', [id, data.status]);
          if (!report) return fail(404, 'report_not_found');
          if (note) await q('insert into accounts.report_notes(id,report_id,actor_id,note) values(gen_random_uuid(),$1,$2,$3)', [id, user.id, note]);
          await accounts.db.audit(q, user.id, null, 'report_update', 'succeeded', { reportId: id, status: data.status, noteAdded: Boolean(note) });
        }); return json(res, { ok: true });
      }
      return fail(404, 'not_found');
    } catch (error) {
      const expected = error instanceof HttpError;
      // Deliberately no request URL/body, cookies, email, DB detail or provider payload.
      if (!expected) process.stderr.write('accounts: request failed\n');
      if (!res.headersSent) json(res, { error: { code: expected ? error.code : 'service_unavailable', message: expected ? error.code : 'Service temporarily unavailable' } }, expected ? error.status : 503);
      else res.end();
    }
  });
}
