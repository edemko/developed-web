# Private Karak II identity integration — 2026-10-03

Owner requested Karak II for registered, signed-in users, omitted from the
DevelopED public website, and running on this host for manual testing.

Karak is available at `https://karak2.developed.sk`, central ID `app_karak2`,
slug `karak2`. It is published to the authenticated picker with free joining,
OIDC enforcement and `public_listing=false`. Existing central invitation-only
registration admission, MFA, browser-family logout and other app policies remain.
The anonymous catalog and all public marketing/navigation/sitemaps omit Karak.
No marketing HTML or marketing assets were deployed.

## Central release

API release: `8a476978a2875503af7438a6b7fa7aaef9e57cec`, selected by
`/opt/developed-accounts/current`. This artifact copies the previously serving
`f6cd40f7e6effcaabaa6d5fae1a6ded0f084395d` and changes only `dist/http.js`:
the anonymous catalog additionally requires `a.public_listing`. Other current
main-branch work, including screenshots/avatars, was not bundled or activated.
Authenticated `/api/account/apps` and admin app management keep their existing
published-app behavior. Private/public discovery is independent of availability.

Migration `20261003210216_account_public_catalog_visibility.sql` adds a NOT NULL
boolean defaulting true, preserving all existing public app visibility. Applied
alone, with its SHA256 recorded atomically in `accounts.deployment_migrations`.
The new confidential OAuth client has exactly
`https://karak2.developed.sk/auth/callback`, PKCE, client_secret_post, and
code/refresh grants. Its unique app key is stored hashed centrally and the
original lives only in the app's protected gateway credential.

The sole mail worker was stopped/drained before the central API restart, then
resumed with its API-release pin updated in a new immutable launcher bundle.
The worker's mail release remains `502a7048ac639fe61ba8b95b0834fdaeafe0cc8b`;
mail implementation, credential inputs and API mail-disabled setting remain.
Both services passed readiness with zero automatic restarts. A brief central
API restart occurred; no zero-downtime claim is made.

## Game runtime

Karak release `6a2e802a988d111598d1cbd6f7dbe10b485a3f0c` runs as
`developed-karak2.service`, UID977/GID971, gateway loopback3182. Next/Nest listen
on private Unix sockets under runtime0700; every public route passes OIDC
session checks. It uses a new private `karak2` database with a dedicated restricted
runtime role; no product data or identity records were replaced.

The existing UID network policy and bind guard were extended only for Karak's
UID, scoped DB/DNS/public HTTPS and gateway3182. Live checks denied provider3141,
raw Kong8000, Caddy admin2019 and unauthorized loopback/wildcard listeners.
The actual service masks Tailscale/Docker/D-Bus and protects the developer home,
central configuration and root-owned immutable code. Its own uploads/cache are
separate writable paths. See Karak's `deploy/README.md` and checked-in units.

Caddy's full candidate validated before graceful reload. A new proxied DNS
record uses the existing sam-apps tunnel. The old cloudflared certificate could
not create DNS; the existing protected Cloudflare API credential succeeded.
No tunnel was restarted or reconfigured.

## Verification and acceptance

- Central suite:171 passed,23 opt-in skipped; added private-catalog regression
  also passed, including unsigned picker denial and signed-in inclusion.
- Karak build/typecheck and unit suites passed, including gateway cookie,
  revocation, subject/client binding, rotation, logout, CSRF and administrator
  mutation checks; API ownership regression passed.
- Rehearsed central migration and all Karak schema/seed migrations in a newly
  created disposable PostgreSQL container, then removed it.
- All live library endpoints and the play page render. Starter data contains
  14 heroes,27 skills,18 tiles,21 monsters,3 expansions; items/dice are empty in
  the source seed. Thirteen exact-name hero portraits were attached. All
  referenced starter images exist.
- Real public OAuth redirects and Chromium reach the DevelopED login form. Anonymous
  game API returns401 and game/assets redirect. Public catalog retains exactly
  seven previous apps, without Karak. Browser sign-in/gameplay with the owner's
  actual account remains manual; no owner's credentials or sessions were read.

## Backup and rollback

Protected root-only evidence is `/var/backups/karak2-20261003`: pre-change
accounts/core dump and validated archive inventory, original Caddy config,
network/bind policies, mail launcher drop-in, staged release metadata and DNS
record identifier. No credential values are documented here.

Disable only Karak via `published=false,join_policy=closed`, stop its service
and remove only its Caddy block/DNS record if needed; retain the private database
and uploads. Central rollback may select the previous API artifact/mail pin
only while Karak is unpublished, because the old anonymous query ignores the
new visibility flag. Retain the additive column and migration ledger. Never
restore the shared database or weaken another application's security boundary
as an app rollback.
