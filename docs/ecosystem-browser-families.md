# Browser-scoped ecosystem logout

Source implementation and isolated qualification, 2026-09-21. This document is
not evidence of production activation; consult the live deployment checkpoint.

`POST /api/account/logout` revokes the current browser family: DevelopED and its
delegated web-app sessions. Other browser families and native OAuth sessions stay
signed in. `POST /api/account/logout-all` remains an explicit, fully authenticated
all-interactive-session action. Neither action deletes paired devices, MCP
credentials, accounts or product data. Physical cookies on other origins may
remain, but a revoked cookie/token must no longer authorize a request.

## Trusted binding

1. A fresh central browser login creates a private `browser_families` row. Cookie
   rotation, reauthentication, MFA and same-browser password re-login preserve it.
2. Central consent checks the exact registered client/callback/S256/nonce and
   stores the **hash** of the exact issued code, subject, client, security version
   and family before returning the redirect. Native clients store no family.
3. The standard OAuth token endpoint is proxied through a narrow broker. The
   provider still checks the secret or public client, redirect and PKCE. Before
   releasing tokens, the broker verifies the provider response and atomically
   binds its exact provider session to that code's family, consuming the binding.
   A provider session cannot be reassigned to another family.
4. Internal app checks, OAuth refresh/userinfo and the existing product RLS gate
   require a valid mapping and a live family for web clients. Native clients keep
   their independently registered lifecycle. All retain user/client/session,
   entitlement, lock and global-revocation checks.
5. Browser logout tombstones the family. Consents/exchanges and logout serialize
   on that row; a code minted before logout cannot create usable access afterward.
   Provider logout is best effort, but committed central/RLS denial is immediate.

The family also requires a live central session: unrevoked, unexpired, seen within
the existing 24-hour idle window, not pending MFA, and with a live provider session.
An abandoned/expired central login therefore cannot leave inaccessible old-family
app sessions active after the browser logs in again. A fresh login does not revive
an expired family. Reauthentication rotates within one transaction so there is
no committed gap between its old and new cookies.

There is no device fingerprinting, cross-domain cookie, caller-chosen family ID,
timestamp correlation, or disclosure of central provider credentials to apps.
Code bindings expire after five minutes. Uncertain exchange failures fail closed;
restart a normal OAuth login, never replay a consumed code or reparent a session.

## Migration and activation

`20260921112156_developed_browser_session_families.sql` creates private RLS-protected
tables and indexes, adds the opaque-session family ID, and backfills each known
live central session into its own family. It does **not** guess ownership of
pre-existing OAuth sessions or delete/revoke those sessions. The existing RLS
helper retains its narrow owner, empty search path and restricted execute grant.

`accounts.settings.browser_binding_required` defaults **false** for staging.
Already mapped but revoked families are denied even in this compatibility state.
Only after deploying the broker, its exact public OAuth routes and the updated
API should a reviewed activation set the flag **true**. That makes previously
unmapped web sessions require the owner-approved one-time login. Native sessions
are not invalidated by this switch. Do not use compatibility mode as a rollback
after strict activation, because it would restore unbound access.

Do not expose a provider token/userinfo bypass on another public alias. Issuer,
JWKS, normal OAuth grants, PKCE, scopes and native redirects remain unchanged.
Expired binding/family housekeeping is deliberately not introduced here: family
tombstones must outlive every delegated session and opaque-session cleanup.

## Isolated evidence

The opt-in labeled disposable GoTrue/Postgres suites exercise two independent
browser families, actual delegated tokens, reauthentication/password rotation,
code replay/client mismatch, strict legacy rejection, expired-family rejection,
an outstanding code denied after logout, RLS and refresh/userinfo denial. The
native fixture exercises actual public-client PKCE plus native refresh/userinfo
surviving browser logout and failing after global logout. No production identities,
mailboxes, credentials or app data are used by those tests.
