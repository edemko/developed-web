# Seven-app launch catalog (staged only)

The owner confirmed all seven tiles: Mega Music, KešTrek, ScreenTime, Airsoft,
Vocabulum, Odonto AI and Otázkomat. The nonsecret
[launch manifest](../server/accounts/launch-catalog.json) records their existing
registry IDs, report slugs, display names, first-party icons and exact adapter
launch/callback URLs. It is operator input reference, not an automatic seed or a
runtime switch. It does not register provider clients or modify a database.

The original three-app planning scope is superseded for the intended picker.
All seven still require the [activation gates](ecosystem-activation-checklist.md).
Registration stays closed, mail disabled, publication false, join policy closed
and `enforce_oidc=false` during staging. Product `ECOSYSTEM_AUTH_ENABLED` flags
remain off. A staged registry row is not authorization to enable public SSO.

## Later operator attachment

1. Read the existing seven `core.apps` rows by exact manifest ID. Stop on a
   missing/deleted row or a conflicting slug; do not create parallel app IDs.
   Preserve existing product status, descriptions, sort order, memberships,
   administrator assignments and entitlements. Review name/icon changes before
   writing shared `core.apps`, since other products consume that directory.
2. Register a distinct confidential provider web client per app with the exact
   callback, `client_secret_post`, code/refresh grants and S256. Keep client
   secrets and unique app-check keys in protected operator files. Provider
   registration happens through the reviewed private control plane.
3. For each app, supply only `appId`, `slug`, `clientId`, `serverKey`, `launchUrl`
   and `callbackUrl` to the existing `dist/operator.js --input` validator; add
   `--apply` only during the authorized staging operation. The manifest itself
   is deliberately not accepted as the credential-bearing operator input.
   New settings default unpublished/closed with OIDC enforcement off. Existing
   rows need explicit `--replace`, which preserves their switches; inspect them
   first and do not assume replacement turns an already enabled row off.
4. Review a separate scoped update for the manifest names/icons in `core.apps`.
   The account-role configuration operator cannot edit those fields. Publish the
   two new Airsoft/Odonto assets with the curated static marketing artifact when
   authorized; account releases do not include the marketing tree. Verify every
   icon returns the expected image over the canonical portal origin.
5. Read back all seven attachments and confirm publication/enforcement false,
   join policies closed and registration closed. OAuth client rows may be
   enabled for attachment, but central app eligibility still denies unpublished
   or closed apps. No membership or product provisioning is performed here.
   Choose each product's eventual free/invitation offering deliberately before
   a later security-qualified launch; the manifest does not grant free access.

Airsoft's actual GET launch action is `/api/auth/ecosystem/login`, not `start`.
Vocabulum's `/auth/login` owns its NextAuth transition. Odonto launches on the
frontend Vercel origin, not its separate API origin. These details were checked
against each adapter source/runbook. Do not normalize them to a common path.

## Verification boundaries

Default account tests validate template localization (EN/SK/CS/UK), canonical
purpose-bound fragment links, expiry copy, escaping, no remote mail assets,
disabled tracking, encrypted outbox retries and send budgets. The opt-in isolated
database suite tests real-provider signup, closed admission, explicit one-time
verification and UUID preservation without delivering mail. The browser fixture
tests registration errors/retry, invitation/closed UI, scanner-safe confirmation
and the seven picker destinations; it stubs account responses and app pages.

Real browser SSO acceptance currently exercises central login with the actual
Mega adapter only. It does not prove real signup-to-inbox delivery or all seven
deployed apps. Remaining acceptance includes controlled Mailjet sender/DNS and
inbox delivery, owner MFA/recovery, registration-to-verification-to-picker,
all seven real provider launches, each app's first-use/product permissions and
global revocation. No real mailbox or account was used by this catalog change.
