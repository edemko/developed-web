# DevelopED central account service — private runtime

This directory contains the new Node/TypeScript account backend and its vanilla
browser UI. It is **not deployed by creating these files**. Registration starts
closed and transactional email starts disabled. Existing static Slovak/English
marketing remains a separate public artifact; it is not replaced by this app.

The approved private runtime is now `developed-accounts.service`, UID988,
loopback3140, application release `c561a81`; public SSO remains off. The exact
credential paths, two anonymous acceptance sessions, scoped-role checks and
remaining activation gates are recorded in the
[private runtime checkpoint](deploy/central-runtime.md). No public account
routes, real users, client registrations or mail delivery were enabled.

Read the [implementation plan](../../docs/ecosystem-identity-plan.md),
[API contract](../../docs/ecosystem-identity-api.md) and
[provider qualification](../../docs/ecosystem-provider-qualification.md) before
deploying. The provider qualification identifies live-release blockers, notably
generic provider identity/consent APIs and legacy shared administrator keys.

## What runs here

- Loopback-only HTTP service on port 3140, behind the canonical
  `https://www.developed.sk` ingress. The bare `developed.sk` hostname keeps its
  canonical redirect. No cross-domain/shared parent-domain authentication cookie.
- Same-origin JSON API at `/api/account/*`; static account UI assets at
  `/account-assets/*`; login, registration, profile, app picker, authorization
  and bug-report/admin routes handled by this service.
- PostgreSQL-backed opaque sessions, central account state, registry extension,
  email credentials, audit log, rate limits and encrypted mail outbox.
- One in-process outbox worker, no Redis or separate queue daemon. A 60-second
  lease with `SKIP LOCKED` and a per-job lease identifier allows safe competing
  workers if deliberately scaled later.
- Provider password authentication, account management and consent happen
  server-side. Provider credentials/tokens and the encryption key never enter
  the browser. Product OIDC integrations use the separate
  [RP adapter](../../packages/ecosystem-auth/README.md).

The portal has English, Slovak, Czech and Ukrainian account copy. Marketing
continues its existing Slovak/English routing. The support address is
`info@developed.sk` (Zoho); Mailjet transactional messages use
`noreply@developed.sk` with Reply-To `info@developed.sk`.

Transactional messages use the version-controlled templates in
`src/mail-templates.ts`: branded HTML plus plain text in EN/SK/CS/UK for email
confirmation, password recovery, email changes, invitations, security notices,
and bug-report acknowledgements. Operator report alerts contain only the app,
reference, and an authenticated admin-page link—not the report body. Mailjet
open/click tracking is explicitly disabled, and templates load no remote assets.
Credential links are limited to the configured portal origin and the correct
route/fragment. Their expiry copy shares the backend lifetime definition:
24 hours for confirmation, 30 minutes for recovery/email changes, and 7 days for
invitations. Existing text-only encrypted outbox entries receive an escaped HTML
fallback during upgrades. Template tests never send mail.

## Security boundary

The runtime requires the **exact** PostgreSQL role `developed_accounts`, without
superuser or BYPASSRLS. It refuses startup under a more privileged role. The
private `accounts` tables have explicit grants and RLS. The service can read
only approved provider identity/session columns, not password hashes or signing
keys. Its provider administrator key is nevertheless platform-privileged:
isolate this process and secret from product services.

Browser session cookie: `__Host-developed_session`, Secure, HttpOnly, SameSite=Lax,
Path=/, no Domain. State-changing browser requests require the configured exact
Origin and session-bound `X-CSRF-Token`. Passwords remain byte-for-byte intact;
the display-name normalization routine is never applied to passwords. New
passwords require 15–128 characters; existing shorter credentials can still be
authenticated for migration/recovery.

Session access rechecks current user status, central security version,
provider-session existence and the user's `revoked_before` cutoff. Account
security changes revoke central access immediately via this state even when a
provider JWT has not expired. Integrated products must perform their own
central access checks and client-aware data authorization; hiding a tile is not
an access-control mechanism.

The central logout action means **all apps and devices** for interactive human
sessions. Local app logout removes that product session. Child-device and MCP/
integration credentials are separate and must retain their intended lifecycle;
do not delete them as a browser-session cleanup shortcut.

`/api/account/internal/*` is a **server-authenticated** surface served through
the central HTTPS origin, including for off-VPS products. Each request requires
the requesting product's unique private app key in Authorization; browser
cookies do not authenticate these calls and no cross-origin browser access is
granted. The backend maps the key to one app and rejects missing/invalid keys.
Do not expose the key in frontend/mobile bundles. Additional source-network
controls are optional if coordinated with product deployment, not assumed by
the current adapters. User-ID checks for device operations do not authenticate
a browser and must never issue a browser session. These central check endpoints
are distinct from provider administration/consent endpoints, which must remain
behind the restricted provider control-plane boundary.

## Local checks

Node.js **22.23 or newer** is required. From the repository root:

```sh
npm ci --ignore-scripts --prefix server/accounts
npm test --prefix server/accounts
git diff --check
```

For focused mail-worker unit checks:

```sh
npm run build --prefix server/accounts
node --test server/accounts/test/mail.test.mjs
```

The default tests do not use production credentials or deliver mail. SQL or
provider integration checks must explicitly target a newly created disposable
database. Do not point them at the shared live database. The separate OIDC
qualification harness is opt-in:

```sh
npm ci --ignore-scripts --prefix packages/ecosystem-auth
npm test --prefix packages/ecosystem-auth
node packages/ecosystem-auth/test/provider-qualification.mjs --isolated-docker --gateway
```

Its requirements and resource cleanup are documented in the RP package README.
No application/native build is needed for documentation-only changes. Flutter,
KešTrek and Screen Time verification remains scoped to their own repositories.

### Isolated real-browser SSO acceptance

`test/browser-sso.test.mjs` runs the actual central portal/backend, actual GoTrue
and Mega Music's actual OIDC adapter against PostgreSQL. It requires an existing
**labeled disposable qualification pair**, with the reviewed core baseline and
central account migrations already staged there. Retaining that pair with the
qualification harness's `--keep` is only for coordinated testing; never substitute
a live container/database. Also install the RP package, the sibling
`../mega-media-player/server/accounts` dependencies, OpenSSL, and Playwright with
Chromium. From the DevelopED repository root, use the selected fixture names and
installed browser paths:

```sh
npm run build --prefix server/accounts
ACCOUNTS_TEST_CONTAINER='developed-identity-test-<qualification-id>-db' \
PLAYWRIGHT_MODULE='/absolute/path/to/playwright/index.mjs' \
CHROME_BIN='/absolute/path/to/chromium/chrome' \
node --test server/accounts/test/browser-sso.test.mjs
```

Run it **serially**, not alongside `database.test.mjs`: it temporarily configures
the isolated Mega registry entry, restoring prior settings afterward. Generated
test identities, roles and minimal product tables remain only in that pair;
the qualification owner must remove its exact labeled containers, anonymous
test volumes and network when finished. No email is sent. Missing opt-in
variables skip the test in the default suite.

The acceptance covers central sign-in → app tile → logged-in app, cross-site
host-only Secure/HttpOnly/Lax cookies, empty browser token storage, free-tier
membership, return-to-picker, direct app SSO and central logout denying a still-
present app cookie. Product rendering/provisioning is a minimal fixture, not a
full player/native acceptance. An ephemeral loopback HTTPS forwarder and
browser-process DNS mapping preserve real redirects and cookie handling without
changing host DNS or production proxy configuration. Only the isolated
provider's fixed browser URLs are aliased; JWT issuer/signature validation stays
real. Its temporary self-signed certificate is trusted only by this test browser,
so this does **not** qualify public certificates or deployed ingress security.

## Configuration

Use [accounts.env.example](accounts.env.example) only as a template. Store real
values outside Git, for example `/etc/developed-accounts/accounts.env`, with
owner-only/root-readable permissions appropriate to the service manager. Never
paste the runtime file, tokens, link fragments or provider response bodies into
logs, test output or bug reports.

| Setting | Meaning |
| --- | --- |
| `ACCOUNTS_ORIGIN` | Exact public canonical origin, no path/query; normally `https://www.developed.sk`. |
| `ACCOUNTS_PORT` | Loopback service port; default 3140. |
| `ACCOUNTS_MARKETING_DIR` | Curated public marketing directory. Only `index.html` and `en/index.html` are read for exact-root fallback. Never a repository root. |
| `ACCOUNTS_PROVIDER_URL` | Trusted private provider control-plane base. HTTPS allowed; HTTP only for `127.0.0.1` or `localhost`. Docker hostname HTTP is not accepted. |
| `ACCOUNTS_PROVIDER_ADMIN_KEY` | Private provider admin credential; never an app/browser key. |
| `ACCOUNTS_DATABASE_URL` | Scoped `developed_accounts` PostgreSQL connection. |
| `ACCOUNTS_ENCRYPTION_KEY` | Base64 encoding of 32 cryptographically random bytes, separately backed up. |
| `ACCOUNTS_INSECURE_LOCAL` | Test-only loopback origin/cookie mode; never enable for the public portal. |
| `ACCOUNTS_MAIL_ENABLED` | Defaults false; queued mail is not transmitted while disabled. |
| `MAILJET_API_KEY`, `MAILJET_SECRET_KEY` | Server-only Mailjet credentials. |
| `ACCOUNTS_DAILY_EMAIL_LIMIT` | Aggregate attempted mail-send budget; default 200/day, UTC fixed window. |
| `ACCOUNTS_HOURLY_REGISTRATION_LIMIT` | Aggregate registration admission budget; default 20/hour. |

The public OIDC **issuer** is independent of the central private provider URL.
Keep the current issuer stable during v1; a loopback control-plane URL must
never replace it in product JWT validation or discovery metadata. A private
loopback mapping must be newly reviewed and restricted, not assumed to exist
because the example contains a placeholder port.

**Loopback is not central-only on a shared VPS.** A sibling product process can
normally connect to the same loopback port. Restrict provider control-plane
access with reviewed network isolation or per-service/UID controls, and remove
unneeded product access to the provider's Docker network. The example systemd
unit provides filesystem/process hardening, not that network authorization.
Without it, a compromised product holding a delegated token could bypass the
public gateway and reproduce the identity-write/consent failures in the
qualification report.

Back up the database and encryption key separately. A different/missing key
makes saved sessions and queued mail undecryptable. Do not rotate it by changing
one environment variable while old encrypted rows remain: use a planned
re-encryption/key-version migration or deliberately invalidate sessions and
handle outstanding queued credentials before rotation.

## Database staging and migration

The first migration is
`supabase/migrations/20260920070607_developed_accounts_v1.sql` at repository root.
It extends the existing shared `core` directory, preserves Auth UUIDs and product
data, and defaults registration/app publication/cutover controls to closed/off.
It expects the actual core baseline and GoTrue auth schema to exist; test
bootstrap fixtures are **not** a production baseline.

Apply the additive `20260920114956_developed_native_clients.sql` migration next,
before running the current service or app-configuration operator. Authorization
now reads `accounts.oauth_clients` for both web and native clients; a single
`app_settings.oauth_client_id` value is no longer sufficient. Existing configured
web clients are seeded by the migration. See
[native client staging](../../docs/ecosystem-native-clients.md) for the explicit
public-client operator and the Android installation release gate.

Before any live apply, review the exact migration, verify a restorable backup,
inventory existing core policies/triggers and rehearse on an isolated provider
database. Follow the shared platform's scoped `psql` migration procedure and
record the applied version/checksum in its migration history. **Do not run
`supabase db push`** or replay unrelated migration directories against the shared
instance. Migration creation uses the Supabase CLI; this README does not invent
or rename migration timestamps.

The migration creates `developed_accounts` with NOLOGIN. In a protected operator
session, configure LOGIN and a unique database password without putting that
password in SQL files or shell history (`psql`'s interactive `\password` is
appropriate), verify HBA/network restrictions, then use that exact role for the
service. Never grant role membership in `postgres`, `service_role` or another
privileged role to bypass a failed test.

The core apps already exist. Use the reviewed operator app-configuration tool
from this implementation to attach exact OAuth registrations and product URLs;
do not guess IDs or insert a parallel directory. Each product gets a unique
OAuth client and server-check key. Configure confidential clients with
`client_secret_post`, exact callbacks, code/refresh grants and S256.

After registering the client through the private provider administration API,
put `{ "appId", "slug", "clientId", "serverKey", "launchUrl", "callbackUrl" }`
in a mode-0600 JSON file outside the repository (actual values, not this list).
The server key must be 32 random bytes encoded as 43 base64url characters.
Run `node dist/operator.js --input /protected/app.json` for validation-only;
`--apply` explicitly attaches it to the existing registry using the scoped role.
Existing configuration requires `--replace`; coordinate app credential rotation.
No provider credentials are printed and no app is automatically published.
Actual registry IDs: `app_mega_music`, `app_kestrek`, `app_screentime`; report slugs
`mega-music`, `kestrek`, `screentime`. Callback/start paths must come from each
implemented adapter, not guessed host conventions.

The confirmed picker now includes seven products. The nonsecret
[launch catalog](launch-catalog.json) and [staging runbook](../../docs/ecosystem-launch-catalog.md)
also cover Airsoft, Vocabulum, Odonto AI and Otázkomat, with exact adapter URLs
and same-origin icons. The manifest does not create registry rows or enable SSO.

Keep `enforce_oidc=false`, app publication off and registration closed until
each product's migration/gateway checks pass. `enforce_oidc` is deliberately not
an ordinary portal switch. Existing users/roles/device credentials must be
preserved; retiring old sessions is allowed, deleting their data is not.

## Staged deployment artifact

Nothing in `deploy/` installs or restarts a service. The files are reviewed
templates:

- [developed-accounts.service](deploy/developed-accounts.service): dedicated
  non-login OS service user, resource limits, read-only filesystem and loopback
  Node service. Review the actual Node binary path before installation. This
  VPS has a reviewed root-owned Node22.23.2 runtime at
  `/opt/developed-runtimes/node-v22.23.2/bin/node`; the unit intentionally blocks
  home-directory access and requires the UID, bind and private-provider services.
- [portal-routes.Caddyfile](deploy/portal-routes.Caddyfile): route additions
  inside the existing canonical site, preserving the separate marketing root
  and serving app-key-authenticated central checks over HTTPS.
- [Provider gateway fixture](../../packages/ecosystem-auth/qualification.Caddyfile):
  **test fixture only**, not a replacement for the shared production gateway.
  Its tested allowlist and required legacy-consumer coordination are in the
  provider qualification report.

Build an **application-only release directory**, e.g.
`/opt/developed-accounts/releases/<reviewed-release>/`, containing only
`dist/`, `public/`, `package.json`, `package-lock.json` and production
`node_modules/`. Build with development dependencies in a disposable build
directory, then install production dependencies using the lockfile in the
release. Point `/opt/developed-accounts/current` at the approved release. The
service must not run from or publicly serve the Git repository, runtime `.env`,
source tree, tests or migration directory.

Serve marketing from a separate curated directory containing only reviewed
public HTML/CSS/JS/assets/legal files. Do not add a catch-all reverse proxy that
sends marketing/legal URLs to this backend. The root matcher sends only GET/HEAD
visits to `/` or `/en/` carrying the central cookie through the backend. The
backend validates that session before returning a no-store 303 redirect to
`/apps`. An invalid/expired/locked session receives the corresponding exact
marketing HTML from `ACCOUNTS_MARKETING_DIR`, not a redirect loop; if that
directory is unset it returns 503. Cookie presence alone is not authentication.
Unsigned root visits remain with the existing static handler. Verify canonical/
hreflang behavior and root routing end-to-end on staging before deployment.

At the public edge, apply per-client request/body limits and do not cache
`/api/account/*` or authenticated HTML/redirects. The backend distrusts all
caller-supplied Forwarded/IP headers and has aggregate socket-source limits;
when proxied, those socket limits are shared. Configure real client IP handling
and anti-abuse controls at a trusted edge, not through a browser-set header.
Disable/redact access logging of credential/callback query strings and request
bodies, and retain `Cache-Control: no-store` plus the backend security headers.

Before activation, validate the complete merged Caddy config without changing
the running server, validate the systemd unit, test localhost health and
canonical HTTPS headers, and retain the previous release for rollback. Rollback
of code must not reopen obsolete password/consent bypasses or undo shared
schemas. Keep registration closed during any uncertain cutover.

## Email and support operations

The staged [separate central mail worker](deploy/central-mail-worker.md) reuses
the immutable mail implementation without restarting the API. Keep the API's
`ACCOUNTS_MAIL_ENABLED=false` while that worker is used; never run both senders.
Worker start/send approval is separate from installation, and registration
remains closed until its own activation is approved.

Verify Mailjet sender/domain authentication and controlled-address delivery
before enabling mail. Do not enable sending merely to exercise a unit test.
Confirm link destinations use the canonical central origin, not the historic
provider Site URL or a product hostname. Account links put one-time credentials
in fragments; browser code strips them before sending the token via same-origin
JSON. Do not consume credentials on a GET, because mail scanners follow links.

Delivery is **at least once**. An ambiguous provider timeout can produce a
duplicate email; one-time server credentials still prevent duplicate actions.
Successful outbox payloads are cleared. Actual delivery failures retry with a
bounded backoff, then become failed after ten attempts. Reaching the daily cap
reschedules after the next UTC reset without exhausting delivery attempts.
Inspect counts/ages/failed IDs—not encrypted payloads or decrypted recipients—in
operational dashboards. Requeue failed mail only after identifying the cause
and confirming its embedded credential has not expired or been consumed.

Report links such as `/report-bug/mega-music` automatically assign a validated
registry source; the user does not choose the app manually. This is reporting
context, not tamper-proof evidence of the executing app. Anonymous typed contact
email is never used to attach an account identity. Only authenticated reporter
contacts are marked verified. Notifications carry a ticket reference and
admin-page link; descriptions/diagnostics/private notes remain in the portal.
Zoho correspondence stays manual using the reference; there is no mailbox-sync
or ticket-email ingestion integration in v1.

Accounts do not automatically expire. Deleting identity and product data stays
manual. Do not apply cascading cleanup to reports, memberships, child-device
credentials, media files, receipts or other app records. Expired sessions,
credential tokens, invitations and rate-limit buckets are different from account
expiry. Review a narrowly scoped retention/cleanup job separately; do not add a
blanket account-delete cron.

## Central authenticator policy

Central TOTP is mandatory for SUPERADMIN and opt-in from `/security` for ordinary
users. Password-only admin/enrolled-user login creates a restricted ten-minute
cookie, not access to apps, profile, admin data or consent. Successful verification
promotes the actual provider session to AAL2 and rotates the opaque central cookie
and CSRF value. Identity changes and sensitive admin actions require fresh
password-plus-TOTP confirmation. There is no public factor-removal/bypass route.

Apply `20260920125511_developed_totp_sessions.sql` with the reviewed central
migrations before using this build. The runtime can read factor ID/type/status,
never factor secrets. Factor setup QR/manual key is returned once to the current
fresh cookie, held only in page memory and never logged. See
[MFA implementation and qualification](../../docs/ecosystem-mfa.md) for provider
assurance boundaries, recovery, tests and activation requirements.

## Emergency operator recovery

The preferred route is an authenticated central superadmin action, with audit
and fresh authentication. Direct VPS/database access is a **break-glass** path,
not an alternative public password API. Never edit `auth.users.encrypted_password`
or copy hashes between users.

For a pending `accounts.security_state.operation_id`:

1. Keep the account blocked. Capture the exact user UUID, operation UUID, action,
   start time and audit result with targeted read-only queries. Do not clear all
   pending rows, expose token columns or assume the provider call failed because
   a browser showed an error.
2. Inspect the exact user's provider state through the private administrative
   API. Reconcile the intended change: email confirmation, lock/unlock or
   password mutation. Password success cannot be inferred from a hash; if
   ambiguous, perform a new controlled reset/set through the provider and
   communicate securely with the owner. Do not bypass enrolled MFA casually.
3. If unlocking is intended, successfully remove the provider ban through the
   private API first. Setting the central `locked` flag alone does not undo a
   provider ban. Preserve a deliberate lock for all other actions.
4. In a short, scoped database transaction, lock that exact security-state row,
   verify its operation UUID still matches the inspected operation, increase
   `security_version`, set `revoked_before=clock_timestamp()`, revoke that user's
   central sessions and consume their outstanding recovery/email-change/
   verification credentials. Clear the matching pending-operation fields only
   after the provider state is known. Change `locked`/`require_password_change`
   only as dictated by the reviewed recovery action.
5. Add an audit entry recording the operator, exact target, action, outcome and
   recovery reason, without secrets. Commit only if the expected one-row state
   change is confirmed; otherwise roll back and re-evaluate concurrent activity.
   Revoke provider sessions where appropriate, send a security notification, and
   verify a fresh login and product access checks.

If the owner's platform role was accidentally changed, verify the exact existing
Auth/core UUID and recover only that profile's `core.profiles.role` to SUPERADMIN
in a similarly scoped/audited transaction. The runtime role intentionally cannot
edit this privilege field. Avoid provisioning a second identity or altering
product-local admin roles as a shortcut.

Backups must include the shared identities/registry and each affected product's
data at a recoverable consistent point. A service release rollback is not a
database restore strategy. Perform an isolated restore rehearsal before declaring
the identity service production-ready.

## Release gates still requiring explicit verification

No public launch is claimed by the local tests or these templates. Release needs
completed product cutovers, staged signed-in root verification, actual owner TOTP
enrollment and tested operator recovery (MFA code/UI is isolated-tested, not activated),
closed public provider bypasses on **every** ingress, removal/restriction of
legacy app admin keys, controlled Mailjet delivery, restore proof, monitoring,
and review of account/privacy/support retention disclosures. Unrelated shared
Auth consumers must not be broken without agreed migration scope.
