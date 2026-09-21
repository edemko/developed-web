# Portal and browser-family production upgrade — 2026-09-21

The owner approved browser-only logout across DevelopED and its web apps,
preserving other browsers/native apps, plus a one-time web-app re-login. This
checkpoint supersedes the original private-runtime/SSO-off observations.

## Live application and policy

- Application commit/release: `57277411f3b9510bad1e93063649d56f5c184247` at
  `/opt/developed-accounts/releases/57277411f3b9510bad1e93063649d56f5c184247`.
  `current` resolves there; `developed-accounts.service` PID3432072, UID988/GID982,
  Node22.23.2, only `127.0.0.1:3140`, active/enabled, NRestarts0 at verification.
- Mail worker PID3462074 is active/enabled with launcher bundle
  `/opt/developed-accounts/mail-workers/e4ab156a91c2a437fd0e47505fa0724bb9e66ab8`.
  Only readiness checks changed; it still imports the reviewed `c561a81` mail
  modules. All four module hashes, six protected input fields, sender/templates,
  permissions and API-mail-disabled state remain unchanged.
- Additive migration `20260921112156_developed_browser_session_families.sql`,
  SHA256 `3269fc5feb6b2116b54ddecbdefc9bd83962ca25fc7ddadbd1d87a17f0b046bc`,
  applied through the hash-pinned, owner-aware operator with atomic ledger entry.
  The four-entry central ledger and narrowly owned RLS helper were verified.
- Migration staged with binding disabled. Only after the new API and public
  token/userinfo broker qualified, `browser_binding_required=true` was committed
  in a short guarded transaction with an audit record. Registration remains
  `invitation`; all seven apps remain published and OIDC-enforced.
- Existing unbound web sessions must sign in once. No provider sessions, account,
  device/MCP credentials, native tokens or product rows were deleted. Do not
  restore compatibility mode or legacy broker-bypass routes as a rollback.
- Default logout revokes the current browser family; explicit global logout
  remains available separately. Other native/browser sessions are independent.
  See [family semantics](../../../docs/ecosystem-browser-families.md).
- Invitation signup binds the server-authoritative invited address, displays it
  read-only, rejects overrides and creates it email-confirmed without a second
  verification message. Ordinary email changes still require confirmation.

## Public artifacts and ingress

Only `index.html`, `en/index.html`, `styles.css`, `script.js` changed in
`/var/www/developed.sk`. Existing assets/favicon/legal files were preserved and
the complete public-file inventory checked. The immutable marketing fallback
contains only the two HTML files at `marketing/57277411f3b9510bad1e93063649d56f5c184247`.
Only `ACCOUNTS_MARKETING_DIR` changed in the protected API environment; all keys
and `ACCOUNTS_MAIL_ENABLED=false` remain byte-for-byte preserved.

Marketing and portal now share the existing logo, dark/purple styling and
`/favicon.png`, SHA256
`555b5bf2e29576a22e144ad34be54ae893740bdac472b15fecf9a0b8848de71c`.
The marketing header includes login/register links and an Apps dropdown directly
right of the logo. All seven catalog icons use existing first-party assets,
including Mega Music's real thumbnail; no icon registry/data rewrite was needed.

Caddy was gracefully reloaded, not restarted; PID862 stayed unchanged. Exact
candidate SHA256: `89ef99358d9783e8e7d8caef251137bfa25f6bc8168cf68e071e3b1f8b50bc43`.
The full adapted configuration comparison proved only issuer token POST and
userinfo GET/HEAD moved from the private provider3141 to the broker3140. Issuer,
keys, discovery/JWKS, authorization, product routes and denied legacy APIs remain.
No product app, shared database/provider or native client was restarted/released.

## Protected evidence and reconciled stops

Root0700 `/var/backups/developed-portal-upgrade-20260921-browser` contains the
root0600 account-schema dump (archive inventory validated), original environment,
Caddy/unit/drop-in files and four marketing files, immutable artifact manifests,
and separate staging/migration/apply/activation receipts. Credentials and backup
contents must never be copied into Git/public artifacts. Prior releases remain.

The coordinator stopped rather than replaying ambiguous phases:

1. Staging compared159 byte-identical files but found the intended664-to644
   permission hardening. Explicit reconciliation verified all copies/ownership
   and completed manifests without recopying or touching live state.
2. `daemon-reload` reordered only systemd `After`/`Requires` sets. Their exact
   membership and all other hardening properties matched. The continuation
   skipped already-installed files; no service had yet restarted.
3. The first mail startup guard refused during the coordinated API restart.
   The API was healthy, old processes had exited, and the unchanged guard passed
   independently. One inspected mail-only start then succeeded; no API restart
   was repeated and no duplicate sender existed. Startup timing is a plausible
   cause, not a proven diagnostic. The follow-up readiness guard is recorded in
   the mail-worker runbook; email templates/credentials remain unchanged.

The accepted brief login interruption occurred during the single API restart;
no zero-downtime claim is made. Public static websites stayed online.

## Verification and remaining owner acceptance

- Exact committed disposable build:122 default tests passed,19 opt-in skipped;
  no failures, production dependency audit reported zero vulnerabilities.
- Separate disposable real-provider suites: lifecycle15, MFA8, browser families7,
  native6 and Chromium6 passed. Two actual browsers using the Mega adapter proved
  logout A denies A's app while B remains; native refresh/userinfo survives local
  logout and fails global logout. No owner credentials or live test mail used.
- Isolated PostgreSQL migration tests7/7; broker3/3; source-only routing, worker
  and upgrade-helper suite15 passed with one optional live-inspection skip.
  The later bounded mail-readiness guard passed its expanded10/10 tests too.
- Live public Chromium at320/1440px: canonical SK/EN marketing and login share
  decoded144px favicon, correctly adjacent app dropdown, all seven decoded
  thumbnails, login/register links and no horizontal overflow. Catalog checks
  preserve existing registry display names, not guessed brand-name spellings.
- 17 public route checks passed: protocol discovery/JWKS positive, broker userinfo
  absent-token401/no-store/no cookie; generic password/signup/admin/user writes,
  consent bypasses, wrong methods and extra-path bypasses remain denied.
- Actual services, strict Tailscale namespace denial, single loopback listener,
  root-owned releases and preserved mail=false/input bytes checked. No new
  central runtime errors appeared in the bounded post-start journal scan.

Owner acceptance remains: use an actual invitation, sign in, launch the desired
apps, compare logout across two browsers/devices and inspect a real delivered
message. Automated fixture success is not a claim of new production account
creation, inbox delivery or Android installation in this upgrade.
