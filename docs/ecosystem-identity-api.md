# DevelopED accounts v1 implementation contract

Status: implementation in progress; not deployed. All browser endpoints below
are relative to `/api/account`. JSON responses use `{ error: { code, message } }`
on failure. No provider access/refresh token is returned to the browser.
All mutations require exact configured Origin, JSON Content-Type, and
`X-CSRF-Token` from GET `/session` (including signed-out flows). Cookies are
opaque, host-only, HttpOnly, Secure; the session cookie is SameSite=Lax and the
separate remembered-browser cookie is SameSite=Strict. Responses are no-store.

## Browser endpoints

- GET `/session`: `{ csrfToken, user: null | { id, email, displayName, avatarUrl,
  language, role, emailVerified, requirePasswordChange, hasMfa }, mfa: null | { mode: 'enroll'|'challenge' }, registrationMode,
  supportEmail }`. Anonymous session bootstrap is allowed.
- POST `/login` `{ email, password, appSlug? }`: `{ user, mfa, redirectUrl? }`. Pending MFA returns
  `user: null`; complete the restricted MFA flow before opening any authenticated page.
  A valid `__Host-developed_mfa_trust` cookie may satisfy the ordinary MFA prompt
  only after the password succeeds. Trust is never accepted from JSON. Successful
  use rotates the trust cookie without extending its fourteen-day deadline.
  UI navigates to `/apps` unless
  a validated local authorization continuation was explicitly supplied.
- POST `/logout`: **DevelopED and delegated web apps in this browser**, `{ ok: true }`.
  Other browser families and native mobile apps remain signed in. Allowed for
  anonymous and pending-MFA cookies too; requires the normal Origin/CSRF checks.
  Preserves remembered-browser trust, but the next login must still supply a password.
- POST `/logout-all`: explicit **all apps and devices** interactive logout,
  `{ ok: true }`; requires a fully authenticated central session. Product-local
  logout remains local. Browser-family code binding is described in
  [the session-family contract](ecosystem-browser-families.md).
  Also invalidates remembered-browser trust on every device and clears this browser's trust cookie.
- POST `/reauthenticate` `{ password, code?, factorId? }`: `{ ok: true }`, five-minute freshness.
  Enrolled users require password plus six-digit TOTP; no password-only step-up.
- GET `/mfa`: `{ mode, enabled, required, factors: [{ id, type: 'totp' }], enrollmentId }`.
  Accepts a restricted MFA cookie or fully authenticated cookie; never returns an existing secret.
- POST `/mfa/enroll` `{ password? }`: `{ factorId, secret, qrCode }`. Optional enrollment
  requires the current password; mandatory superadmin setup uses the fresh restricted
  password-login cookie. QR/manual secret are shown once, never stored in browser storage.
- POST `/mfa/verify` `{ factorId, code, rememberBrowser?: boolean, appSlug? }`: `{ user, redirectUrl? }`.
  Verifies only the current user's eligible factor and rotates cookie/CSRF after success.
  `rememberBrowser` defaults false and rejects non-booleans. True issues a separate
  fourteen-day trust credential only after actual provider AAL2 verification.
  Password-plus-trust login remains actual provider AAL1 and never grants fresh
  sensitive-action assurance; password-plus-TOTP step-up is unchanged.
  Incomplete sessions expire after ten minutes and cannot read protected profile/admin/app
  data or approve consent. There is no factor-removal or password-free trust-login endpoint.
- POST `/register` `{ email, password, displayName, language, invitation?, continuation? }`:
  `{ accepted: true, emailVerified: boolean }`; creates no signed-in session.
  Ordinary signup still needs the confirmation email. A valid invitation proves
  the address, creates a confirmed account and queues no second verification.
  The stored invitation address is authoritative; a mismatching submitted email
  is rejected, including direct API requests. Invites are single-use and checked
  even when open registration is enabled. Existing accounts are never confirmed
  or password-changed through this flow.
- A registered product may render this flow on its own origin through
  `/registration/session`, `/registration/invitation/preview`,
  `/registration/register` and `/registration/resend-verification`, each with
  `?app=<registered-slug>`. CORS is returned only when the exact request Origin
  matches that published app's registered HTTPS launch origin. These endpoints
  retain the central opaque cookie, CSRF, admission, rate-limit, invitation and
  email rules; they expose no signed-in user data and grant no provider or
  database credential to the product.
- POST `/invitation/preview` `{ token }`: `{ email }` for a valid unconsumed invite.
  Normal Origin/CSRF/no-store controls apply. This does not consume the invite;
  the browser shows its address read-only and keeps the fragment token in memory.
- POST `/resend-verification` or `/forgot-password` `{ email }`:
  `{ accepted: true }`, generic response independent of account existence.
- POST `/verify-email` `{ token }`: `{ ok: true, loginUrl }`. Email credential comes from
  the link fragment; never consume it on GET or put it in logs/storage.
  For registration initiated by an app, store only its resolved registered ID;
  confirmation returns `/login?app=slug`, and successful login returns its fixed
  launch URL for a fresh OIDC flow. Never retain an expiring authorization code
  across email verification or accept a caller-provided external return URL.
- POST `/reset-password` `{ token, password }`: `{ ok: true }`, login again.
- PATCH `/profile` `{ displayName, language }`: `{ user }`.
- POST `/profile/password` `{ currentPassword, password, code?, factorId? }`: `{ ok: true }`, login again.
- POST `/profile/email` `{ email, currentPassword, code?, factorId? }`: `{ accepted: true }`;
  current address retained until new-address confirmation.
  Both identity mutations require a current TOTP code when MFA is enrolled.
- GET `/apps`: `{ apps: [{ id, slug, name, description, icon, launchUrl,
  available, plan }] }`. Launch URLs are operator-registered HTTPS app login
  entry points, never arbitrary user return URLs. No provider credentials in URLs.
- GET `/catalog`: anonymous published/active app metadata for the header menu;
  no user, plan, membership or entitlement fields and no cookie/session creation.
  Both catalog and picker resolve historical symbolic icons to reviewed
  first-party assets. Catalog visibility does not grant application access.
- GET `/security`: `{ sessions: [{ id, createdAt, expiresAt, current }] }`.
- GET `/authorize?authorization_id=...`: provider details after app registration,
  central identity and eligibility checks, `{ app: { id, name }, scopes }`.
- POST `/authorize` `{ authorizationId, approve: boolean }`: `{ redirectUrl }`.
  UI never navigates to unvalidated browser-supplied redirect URLs.
- GET `/reports/source/:slug` (use `developed` for portal):
  `{ app: { id, slug, name } }`; unknown/nonreportable source is 404.
- POST `/reports` `{ appSlug, description, summary?, steps?, expected?, actual?,
  occurredAt?, contactEmail?, diagnostics?: { version?, platform?, screen?,
  locale?, errorId? }, idempotencyKey }`: `{ reference }`.
  User UUID is always derived server-side. Anonymous email is unverified.
  Idempotency key is a per-form UUID, retained in memory on retry.

## Superadmin endpoints

Role is read from protected core profile, never metadata. Sensitive account and
policy actions require recent password-plus-TOTP reauthentication and actual central
provider-session AAL2. Read-only admin routes require a verified factor and either
actual AAL2 or live server-validated remembered-browser trust after password login.

- GET `/admin/users?q=&limit=&offset=`: `{ users: [{ id, email, displayName,
  role, locked, createdAt }] }`.
- POST `/admin/users/:id/action` `{ action: 'lock'|'unlock'|'set-password'|
  'send-reset'|'revoke-sessions', password?, requirePasswordChange? }`: `{ ok: true }`.
- GET `/admin/apps`: `{ apps: [{ id, slug, name, description, icon, launchUrl,
  published, joinPolicy, reportable }] }`.
- PATCH `/admin/apps/:id` `{ published?, joinPolicy?, reportable? }`: `{ ok: true }`.
  Registry URLs/client IDs are provisioned by reviewed operator configuration,
  not arbitrary browser payloads. Policies: free, invitation, closed.
- GET `/admin/registration`: `{ mode }`.
- PATCH `/admin/registration` `{ mode: 'open'|'invitation'|'closed' }`: `{ ok: true }`.
- POST `/admin/invitations` `{ email }`: `{ accepted: true }` (mail, not raw token).
- GET `/admin/reports?app=&status=&user=&from=&to=&limit=&offset=`:
  `{ reports: [{ id, reference, appId, appName, summary, description, steps,
  expected, actual, reporterId, contactEmail, contactVerified, createdAt,
  occurredAt, diagnostics, status, notes }] }`.
- PATCH `/admin/reports/:id` `{ status?, note? }`: `{ ok: true }`.
  Status values: new, in_progress, resolved, closed. Notes are private.

## Internal product contract

Separate server credential per registered app; never ship it to a browser.
POST `/internal/session/check` verifies a provider access token with the provider,
requires its registered OAuth client_id and active provider session, central
security state and current membership/publishing policy. Returns identity and
policy state for **that app only**. Token goes in JSON to a TLS protected endpoint,
not URL. An app-local opaque session stores provider tokens server-side and
invokes this gate for protected requests, failing closed on network/DB failures.
Provider tokens alone are not authorization for another app.

POST `/internal/user/check` `{ userId }` uses the same app credential but ONLY
after that product authenticates an independent device/API credential. It checks
lock and existing membership without granting new membership or requiring an
interactive browser session. Global interactive logout does not delete paired
devices or integration keys. Account lock blocks their protected operations.
The caller must derive userId from its verified credential, not request input.

This contract does not claim legacy raw-token APIs have already been closed;
that is a separate cutover acceptance gate, including product RLS and other
holders of shared admin credentials.

## AMP account editing

The server-authenticated `/internal/profile/:action` POST endpoints allow the
registered `app_airsoft` **web** client to render account controls within AMP.
Each request contains `accessToken` and uses the existing app-key Authorization
header. The same internal session gate verifies subject, app/client, browser
family, membership and central security state. No caller-supplied user ID is used.

- `details` → `{ user, phones: [{ id, phone, verifiedAt }] }`.
- `profile` `{ displayName }` updates the shared display name (1–60 characters).
- `password` `{ currentPassword, password, code?, factorId? }` uses central
  password mutation/revocation → `{ ok: true, loginRequired: true }`.
- `email` `{ currentPassword, email, code?, factorId? }` queues central confirmation
  → `{ accepted: true }`. The old address remains until the existing email token
  consumer replaces it; successful confirmation continues to AMP sign-in.
- `phone-start` `{ phone, replaceId? }` → `{ challengeId, expiresIn: 300,
  resendAfter: 60 }`. Omit `replaceId` to add a number (maximum three verified
  contacts). International E.164 numbers and Slovak domestic mobile input work.
- `phone-verify` `{ challengeId, code }` atomically adds/replaces a number and
  returns `{ phones }`. Five failed attempts lock the challenge. Expiry, replay,
  subject/security-version mismatch and concurrent fourth-number creation fail.

Requires `20260924194706_account_profile_contacts.sql`. Existing central phone
ciphertexts remain compatible and occupy slot 1. Profile-phone challenges have
separate private storage, user/destination cooldowns, quotas, and housekeeping.
Only central sends SMS; products receive neither OTP hashes nor provider tokens.
This source addition does not deploy or activate endpoints on the live service.
