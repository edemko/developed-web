# Central TOTP: implementation and activation boundary

## Remember this browser — 2026-09-21 (local implementation)

The authenticator verification form offers an unchecked-by-default “Remember this
browser for 14 days” checkbox in EN/SK/CS/UK. Only a successful real provider AAL2
verification can issue a separate remembered-browser credential. Its host-only,
Secure, HttpOnly, SameSite=Strict cookie (`__Host-developed_mfa_trust`) contains
32 random bytes; only a SHA-256 hash is stored in the private, RLS-protected
`accounts.browser_trust` table. It is bound to the user, verified TOTP factor and
central security version, with a fixed fourteen-day expiry. It is not a login
session and cannot bootstrap access, consent or account data by itself.
Remembered sessions are exempt from the ordinary 24-hour inactivity limit; the
seven-day absolute/24-hour idle policy is unchanged when the box is unchecked.
After a **correct password** login, the server may accept this separate credential
instead of prompting for TOTP again. It is read only from the protected cookie,
never from the JSON body, and rotated atomically on use without sliding its expiry.
A malformed, wrong-user, expired, revoked or already-rotated credential falls back
to the normal authenticator challenge. Password rate limits still apply.

Explicit browser logout ends the central provider/opaque sessions and the same
browser's app family, **but leaves browser trust intact**. A subsequent login must
use the password and creates a new provider session/family; it cannot resurrect
logged-out app sessions. All-device logout, account locks and password/security
changes invalidate browser trust through the central security version/cutoff.
Removed/unverified factors also invalidate it. Provider-session and family
revocation still deny the affected signed-in sessions.

Remembered password login honestly remains provider **AAL1**. Central policy
records validated browser trust separately and rechecks it in portal, delegated
server checks and the existing RLS helper. It does not modify provider JWT claims,
retain a logged-out AAL2 provider session, or pretend a fresh TOTP was entered.
Sensitive operations still require fresh password plus TOTP/actual AAL2, including
superadmin writes; remembered login leaves `authenticated_at` empty. Step-up
preserves the original remembered deadline, never extending it on activity.
Clearing cookies, expiry or signing in from a different browser requires a new
login and code. Product sessions may expire earlier and then return through SSO.

Apply only `20260921141121_developed_mfa_remember_browser.sql` through a reviewed
operator procedure before deploying this backend. The nullable columns leave old
sessions unchanged; the updated existing RLS helper keeps native-client and other
authorization checks intact. Do not deploy the new backend against the old schema.
No production migration or deployment is performed by this source change.

Verification includes the standard backend suite, isolated Chromium checkbox/
request tests, and a fresh disposable PostgreSQL/GoTrue pair: remembered versus
ordinary inactivity, SQL lifetime bounds, absolute expiry, non-sliding step-up,
delegated access through both the backend and RLS, browser logout revocation,
password-required trust reuse, credential rotation/replay rejection, honest AAL1,
mandatory sensitive-action step-up and all-device trust revocation.
No real users, live credentials, email delivery or production databases are used.

## Historical implementation qualification

Status: source and isolated qualification only; no production factors, identities,
mail, configuration or migrations were changed by this work. Production SSO remains
off until the coordinated security cutover passes all other release gates.

## Policy and flow

- SUPERADMIN must enroll a TOTP authenticator before any protected portal/admin or
  consent access. Ordinary accounts may enroll from Security with their password.
- Password-only login for an enrolled account returns `user: null` and a restricted
  MFA mode. Pending credentials are encrypted server-side, with a ten-minute opaque
  cookie. Only MFA setup/challenge, local cancellation and public routes are usable.
- Setup shows a QR image and manual key once. Reload can finish a previously scanned
  setup, but cannot retrieve its secret. Cancel and sign in again to restart if the
  key was lost. Browser local/session storage never holds tokens, keys or codes.
- Verification accepts only an eligible factor belonging to the cookie's candidate
  UUID, checks actual AAL2 and provider-session identity, then rotates cookie/CSRF.
  Consent, profile and admin routes reject incomplete MFA. All admin reads require
  an enrolled factor and AAL2; sensitive writes require five-minute freshness.
- Reauthentication and password/email changes require the current password plus a
  TOTP code for enrolled accounts. A password reset or admin-set password does not
  remove MFA. Successful enrollment revokes other central sessions and queues a
  security notification, without including the setup key or code.
- Enrollment and verification have separate per-user rate limits. Token-rotating
  verification reserves a committed database fence before the provider call.
  Definite rejected codes may retry; ambiguous provider/save failures fail closed
  without replaying an old credential, including after failed cleanup.

The migration grants the runtime only approved factor ID/user ID/status/type and
session AAL columns, not `auth.mfa_factors.secret`. No provider administrative token,
provider access/refresh token, or factor-management bearer is returned to a browser.
The QR SVG is displayed as an isolated image, never inserted as HTML.

## Important provider assurance distinction

Real isolated Supabase Auth v2.189.0 tests establish that TOTP verification upgrades
the central provider session to AAL2, and refreshing that session retains AAL2.
However, an OAuth authorization-code exchange after AAL2 central consent issues a
delegated product token at **AAL1**. Do not claim delegated AAL2, rewrite the claim,
or require downstream AAL2 based on this implementation. The current protection is
completed MFA enforced by the central consent/control plane, exact registered
client/session checks and closed alternate provider ingress. A product-specific
high-assurance action needs separately designed central step-up.

This is why blocking legacy/raw provider login and factor endpoints on every public
ingress remains an activation prerequisite. Central UI policy alone cannot secure
a separately reachable password/consent/factor API.

## Recovery and activation

There are no recovery codes, verified-factor removal, password-only bypass, passkeys
or account-support automation in this version. Lost factors require deliberate
operator identity verification and a scoped audited provider recovery. Revoke the
user's provider/central sessions, advance the central security cutoff, notify the
owner, and require fresh password plus mandatory re-enrollment before granting
admin access. Never log a factor secret, QR payload, OTP or provider bearer while
performing recovery. Never delete all users' factors or disable the policy globally.

Before activating production, review/apply the MFA migration, rehearse the precise
operator recovery on a disposable account, and have the actual owner enroll using
their own authenticator. Verify encrypted backups include provider factor state and
its required encryption keys. Existing live admin access has not been changed by
these local tests. Initial setup must be operator-coordinated to avoid treating a
password-only existing admin session as authorized after the policy is enabled.

## Reproducible isolated checks

From `server/accounts`:

```sh
npm test
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs CHROME_BIN=/absolute/path/to/chrome node --test test/mfa.browser.test.mjs test/ui.browser.test.mjs
ACCOUNTS_TEST_CONTAINER=developed-identity-test-<fixture>-db node --test test/mfa-database.test.mjs
ACCOUNTS_TEST_CONTAINER=developed-identity-test-<fixture>-db node --test test/database.test.mjs
```

The opt-in database tests refuse unlabeled/non-disposable fixtures, use fake
identities and loopback provider URLs, and never run the mail worker. The dedicated
MFA test uses uniquely named disposable roles/users and removes its own temporary
OAuth app/client; fake audit/users/roles remain until the disposable fixture is
removed by its owner. Run the lifecycle test separately: its existing fixture setup
rotates only that disposable database's runtime test password.

Coverage includes real enroll/challenge/verify, wrong-code and foreign-factor
rejection, pending access denial, actual AAL2 refresh, password-plus-TOTP step-up,
actual delegated OAuth AAL1, SQL denial of factor secrets, durable failure fences,
Chromium setup/challenge/profile/admin flows, CSRF rotation and empty browser
storage. No test sends email or constitutes production deployment acceptance.

Latest local verification (2026-09-20): TypeScript build and standard suite
46 passed / 7 opt-in skipped; real MFA fixture 8/8; existing real account lifecycle
14/14; Chromium MFA plus existing portal UI 2/2; mail-template suite including
desktop/mobile browser rendering 8/8. A separate freshly created capped pair then
replayed the actual infrastructure core baseline plus central v1, native-client
and MFA migrations: native authorization/client binding/RLS passed 5/5 unchanged,
and real MFA/consent passed 8/8 again. This avoided changing the shared scoped-role
fixture's registry prerequisites. Supabase CLI 2.113.0 security advisors against
that new isolated database returned no issues (`--type security --level info`,
JSON `results: []`). This result applies only to the replayed isolated schema, not
the live shared database or its unrelated apps. The new pair and its dedicated
network were removed after qualification; the shared fixture was left untouched.
