# Central activation dependency checklist

## Current coordinator checkpoint — 2026-09-20, after 16:45 UTC

**Public SSO is still off. All seven apps remain required for launch.** The
14:29–14:38 inventory below is retained as historical evidence, not current host
state. In particular, its statements that central schemas, credentials, services
and network boundaries are absent are superseded by these completed checkpoints:

- Central and additive app migrations are installed with registration,
  publication and enforcement closed; see the [central database
  checkpoint](ecosystem-db-checkpoint-20260920.md) and [app SQL
  checkpoint](ecosystem-app-sql-checkpoint-20260920.md). KešTrek's final raw-token
  cutover migration remains unapplied.
- Central accounts, private green Auth, the private data filter, and dedicated
  app runtime candidates are running. UID network and actual bind boundaries
  are installed. Old serving app processes and alternate ingress remain a
  separate closure gate; see the [ingress inventory](ecosystem-ingress-inventory-20260920.md).
- Seven confidential web clients and one public KešTrek Android client are
  registered and attached. Seventeen restricted runtime credentials are issued,
  backed up and verified, including actual-UID database login/denial checks.
  See the [credential checkpoint](ecosystem-runtime-credentials-checkpoint-20260920.md).
  Finite JWTs require rotation by December 4 and expire December 18, 16:00 UTC.
- Central-enabled ScreenTime and KešTrek browser artifacts and Otázkomat browser
  behavior have been qualified privately; see the [frontend artifact
  record](ecosystem-frontend-artifacts-20260920.md). A release-signed KešTrek
  Android APK exists privately, but installation/browser-return acceptance is
  not yet established.
- Six host central-mode environment artifacts are staged and selected by exact
  private-instance overrides. All six unrouted candidates are now running
  central mode: 29 bounded HTTP checks, six actual-UID isolation checks and five
  scoped database checks passed. Original env files and public PIDs/routes were
  preserved. See the [private activation checkpoint](../server/accounts/operators/private-host-activation.md).
  Public monitoring had one Otázkomat transport failure among 312 requests,
  followed by 20 successful public/local checks; do not claim zero interruption.
- Odonto's exact private CI bundle was verified and uploaded as an encrypted
  repository secret. Run `35523564853` staged both projects' configuration and
  produced READY frontend candidate `dpl_3Ly2znk42wShJDB921nsCyphUP2F` at source
  `03a26c23252f12cf86d580843c5bb2806cd1d37b`, but its wrapper then failed before
  producing a backend candidate. The deployment gate was disabled and its
  revision allowlist cleared. Read-only inspection `35523947563` subsequently
  confirmed both canonical alias bindings unchanged and identified the wrapper
  failure: Vercel recorded a protected automatic project alias, while the wrapper
  incorrectly required an empty alias list. Both the immutable URL and automatic
  alias redirect anonymous requests to Vercel authentication. No existing
  automation bypass token was available, so authenticated runtime qualification
  remains pending. A narrowly reviewed backend-only resume is being prepared;
  there has been no automatic retry, promotion or deletion.
- Mailjet sender/SPF/DKIM read-only checks and localized template/browser tests
  passed. No registration confirmation email has been sent to the approved
  test mailbox, and live mailbox delivery is not yet proven.

Remaining launch gates include Odonto's complete protected least-privilege
Vercel candidates and safe paired handoff,
Vocabulum's remote Vercel access/alias closure, coordinated old-runtime and
provider/data-ingress closure, owner MFA/recovery acceptance, Android acceptance,
and real registration/email/picker/seven-app end-to-end tests. Do not interpret
an unpublished picker as permission to expose a pilot login endpoint.

Vocabulum's read-only inventory found all existing words/folders already owned
by the requested owner and no sentences to transfer. No sample account has
been deleted: two of three non-owner identities are not proven to be examples,
so exact deletion scope awaits clarification. Personal free-tier content-writing
policy also awaits the owner; do not grant school/admin privileges by default.

## Historical baseline — do not use as current deployment state

Read-only recheck: 2026-09-20, approximately 14:29–14:38 UTC, source `d4a7267`.
This is a staging handoff, not an activation record. The owner requires SSO to
remain off until the complete security cutover; no production pilot is allowed.
No production database, credentials, routes, services or firewall were changed
by this recheck. No test account or mail was created. The retained qualification
fixture `developed-identity-test-2357912-{db,auth,rest,storage}` was not modified.

## Actual readiness and gaps

The older progress/shared-cutover tables describe several now-completed source
tasks. Current source contains central TOTP MFA, the many-client registry, all
seven product browser adapters, KešTrek native PKCE, five scoped data roles,
Odonto's HTTPS session store, and tested UID/data-ingress boundary generators.
Use the current per-app documents below for implementation contracts. Passing
fixture tests does not establish deployed acceptance.

Observed live facts:

- `accounts`, `airsoft_identity`, `otazkomat_identity` and `odonto_identity`
  schemas are absent. `developed_accounts` and the five new backend roles are
  absent. All seven intended `core.apps` IDs already exist; do not recreate them.
- `developed-accounts.service` is not installed and its OS account is absent.
  Caddy is UID999. The root-owned Node runtime already used by isolated My Clinic
  is `/opt/developed-runtimes/node-v22.23.2/bin/node`; the old central template's
  `/usr/bin/node` is absent. Verify ownership/path components before reuse.
- No `inet developed_uid_boundary` table is installed. Live GoTrue is v2.189.0
  with no OAuth configuration variable names present. No production green Auth
  instance is running. The issuer remains the existing shared issuer.
- Mega accounts blue3137/green3138 still run as `openclaw`. KešTrek3124,
  development3123/4201, ScreenTime3127 and Otázkomat3126 remain user processes.
  Airsoft3002 and Vocabulum3001 still run in default/root containers on
  `supabase_default`. These old instances remain activation blockers until
  replaced and drained, even after new host UID rules pass.
- My Clinic is already isolated as UID996 on3155 and retains separate identity.
  JASOM/importer work is coordinated separately; preserve their jobs and logins.
- The live `core.app_access` trigger for Airsoft already exists, alongside
  KešTrek and Odonto triggers. Airsoft's migration replaces its function; do not
  add a duplicate trigger based solely on an old infrastructure baseline.
- There is no live `supabase_migrations.schema_migrations` relation. Existing
  products track migration versions in their own schema, with differing columns.
  Establish the central/platform migration ledger deliberately; do not assume a
  CLI ledger or replay baselines to create one.

Concrete deployment work remains: exact root-owned service/credential files,
numeric UID/network configuration, a persistent fail-closed firewall loader and
unit dependencies, private green Auth launch configuration and database route,
deployment of the new operator-only scoped JWT issuance/rotation procedure, merged ingress changes,
and full deployed acceptance. These are not missing OIDC adapter implementations.

## Shortest safe dependency order

1. Freeze exact reviewed revisions and maintain autodeploy guards. Inventory
   remaining privileged workers, dev processes, containers, aliases and shared
   key holders. Confirm a recent restorable backup and isolated restore; protect
   encryption/signing material separately. Build immutable releases outside live
   `.next`, repository and public roots. Do not package unrelated dirty changes.
2. Allocate actual non-login UIDs, protected credential/state locations and
   per-service ports. Reuse the verified external Node runtime. Move Airsoft and
   Vocabulum to the selected host-UID topology; the current generator does not
   isolate container forwarding. Keep their old containers serving while staging.
3. Rehearse and apply only central v1, native-client and MFA migrations, in that
   dependency order. Keep registration closed and publication/enforcement off.
   Seed seven `app_settings` rows with their correct slugs/HTTPS launch URLs and
   `enforce_oidc=false` before installing restrictive app policies. Nullable
   client/key fields permit this prerequisite seed before OAuth registration.
4. Apply the reviewed app session/provisioning migrations listed below, then
   the shared scoped-data-role migration, then Odonto HTTPS-store migration.
   The shared migration grants existing relations only: applying it before app
   session/RPC migrations can leave missing grants. Hold KešTrek raw-token REVOKE.
   Record exact versions/checksums in the chosen scoped migration ledgers.
5. Prepare root-controlled UID policy from actual UID, DNS, DB pre/post-DNAT,
   import8787 and private-control tuples. Install/check only its named table and
   fail-closed startup loader before private3141 or green app listeners become
   reachable. Include old Auth/Kong/control aliases. Product DB credentials must
   remain narrow even where a DB network tuple is allowed. No host-wide flush.
6. Launch green GoTrue privately with the exact installed version and existing
   issuer/signing/session identity, on a control network inaccessible to products.
   Give it a reviewed DB-only route. Verify startup migration parity, DB locks,
   health and connection budget; do not attach it to the broad product bridge.
   Keep blue running. Enable OAuth and disable dynamic client registration only
   on green. Public generic Auth remains unchanged until the final closure.
7. Register seven confidential web clients and one KešTrek public native client
   privately. Attach the web registrations with `dist/operator.js` and native
   with `dist/native-operator.js`; use protected input files. A pre-seeded web
   settings row requires `--replace`, although no old credentials were deployed.
   Review exact provider web-client authentication/callback settings separately:
   the web operator validates registry input, not the provider registration.
8. Provision scoped data JWTs, separate session-store credentials, independent
   encryption keys and one central-check key per app. The signing secret remains
   exclusively with the trusted operator/platform. New runtimes receive no
   service-role/admin key. Qualify own CRUD/storage and foreign-schema/bucket/RPC
   denial before routing. Preserve legitimate platform Storage/Realtime/Studio/
   Meta/Edge administration through a reviewed private operator path.
9. Stage green central/data-filter/app services and complete fixture/controlled
   acceptance without publishing a production SSO pilot. Prepare and validate
   the complete Caddy/tunnel/Kong configuration, including OAuth well-known alias,
   public data denial filter and closed generic Auth routes. Build the configured,
   release-signed KešTrek APK and coordinate owner installation/device acceptance.
   Sender approval/DKIM, controlled mailbox delivery, owner MFA enrollment and
   scoped lost-factor recovery rehearsal remain explicit acceptance gates.
10. Only when all replacements and native gates pass, execute the rehearsed
    final closure: exact data/client enforcement, rejection of legacy raw tokens,
    generic Auth and alternate private/public paths, matching app flags/routes
    and central publication. There is no cross-system atomic transaction; record
    and test the precise route/DB ordering before execution. Use graceful reloads
    and atomic static switches, retain old assets, and drain requests/jobs. Existing
    interactive re-login is accepted; preserved devices/integrations are separate.
11. Probe positive and negative paths from every actual runtime UID and reachable
    ingress, plus the installed APK. Retire drained privileged predecessors and
    obsolete credentials; copied shared tokens must be denied at all reachable
    boundaries, not merely removed from env files. Post-enforcement rollback must
    retain the new security boundary and user writes.

Steps 1–9 do not authorize opening a limited production SSO pilot. If real-origin
acceptance needs authenticated routes before closure, use a genuinely isolated
staging environment or an explicitly reviewed non-public test path; unpublished
tiles alone do not isolate an active production login endpoint.

## Exact migration dependencies

Central repository:

- `20260920070607_developed_accounts_v1.sql`
- `20260920114956_developed_native_clients.sql`
- `20260920125511_developed_totp_sessions.sql` (before current central runtime)
- `20260920124145_ecosystem_scoped_data_roles.sql` (after app migrations below)

App-owned prerequisites, against their existing production baselines only:

| Product | Additive migration | Session/data credentials in enabled mode |
| --- | --- | --- |
| Mega Music | `20260920070834_mega_music_ecosystem_sessions.sql` | Existing narrow `mega_music_web` connection; OIDC and app-check credentials; retain S4 encryption identity. |
| KešTrek | `20260920071554_kestrek_ecosystem_sessions.sql` | Private `kestrek_identity_web` login; `SUPABASE_DATA_API_KEY` role `kestrek_backend`; bucket `avatars`. |
| ScreenTime | `20260920071953_ecosystem_web_sessions.sql` | Private `screentime_web` login; device backend role `screentime_backend`; parent queries use validated user OAuth JWT. |
| Airsoft | `20260920123109_airsoft_ecosystem_sessions.sql` | Private `airsoft_identity` login; protected data/storage use user OAuth JWT and existing owner RLS; no new backend service-role replacement token. |
| Vocabulum | `20260920123043_ecosystem_oidc_sessions.sql` | `SUPABASE_DATA_API_KEY` role `vocabulum_backend`; own session RPCs and filtered identity views; optional `tts-audio` bucket. |
| Odonto AI | `20260920123136_odonto_private_identity_sessions.sql` | Backend `odonto_backend` data JWT; `study-materials` bucket. Frontend session JWT is separately `odonto_identity_web`, NOLOGIN, over HTTPS. |
| Otázkomat | `20260920123206_central_web_sessions.sql` | Private `otazkomat_identity_web` login; `otazkomat_backend` data JWT; `question-images`, `content-icons`, `report-images` buckets. |

After shared scoped roles, apply Odonto
`20260920132100_odonto_identity_https_store.sql`; its RPCs must not be granted to
`odonto_backend`. At final closure only, apply KešTrek
`20260920071603_kestrek_ecosystem_raw_token_cutover.sql`. No `supabase db push`.
Otázkomat provisioning also requires the protected active `platform_default`
organization. Public anon apikey remains separate from each signed role bearer.
Roles need finite-lived credentials with monitored expiry and a rotation procedure.
The offline [scoped-key operator](../server/accounts/operators/README.md) now
validates and explicitly writes the five reviewed data-role credentials; it has
not issued production credentials. The distinct Odonto identity-store role is
outside that operator's allowlist and still needs a reviewed issuance workflow.

## App registry and outstanding acceptance

Every web client uses `client_secret_post`, S256, code/refresh grants and an exact
callback; client secrets and central-check keys remain server-only.

| App ID | Exact callback | Remaining product acceptance |
| --- | --- | --- |
| `app_mega_music` | `https://megamusic.developed.sk/api/music/auth/callback` | Full player/media/S4 behavior and UID-isolated deployed SSO; existing green3138 is still legacy mode. Launch is `/api/music/auth/start`. |
| `app_kestrek` | `https://kestrek.sk/api/auth/ecosystem/callback` | Web finances/ownership/MCP plus real configured release-signed Android install and native refresh/logout/lock. |
| `app_screentime` | `https://screentime.developed.sk/api/auth/callback` | Actual provider parent login, two-parent isolation, existing tablet ingest/presence/enrollment. |
| `app_airsoft` | `https://amp.developed.sk/api/auth/ecosystem/callback` | New free profile, owner/moderator rules, listing/photo CRUD, messaging/proposals, public catalog. |
| `app_voc_builder` | `https://vocabulum.developed.sk/api/auth/callback/developed` | School roles/classes/tenants, invitation/managed identity UX. Owner confirmed native app is planned, not actively installed; do not invent an active-native prerequisite. |
| `app_odonto` | `https://frontend-jet-rho-66.vercel.app/api/account/callback` | Both Vercel projects, real BFF/provider flow, HTTPS session role, catalog/attachment access. |
| `app_otazkomat` | `https://educatio.sk/api/auth/ecosystem/callback` | New member/default organization, existing school roles, timed attempts, scoped storage; global identity deletion stays suspended. |

KešTrek Android additionally requires a **public** client, method `none`, exact
`sk.kestrek://oauth/callback`, and the same native client UUID in APK and API.
Build inputs are `ECOSYSTEM_AUTH_ENABLED`, `ECOSYSTEM_OIDC_ISSUER`,
`ECOSYSTEM_NATIVE_OIDC_CLIENT_ID`, `ECOSYSTEM_ORIGIN`, `API_BASE_URL`. No web secret
or central app-check key goes into the APK. Missing `android/key.properties`
causes debug signing in the current project; a successful build alone is not an
installable production update. Verify signing continuity and actual browser return.

Independent identity/data systems stay independent: My Clinic, JASOM and anonymous
Odonto Feedback do not gain central accounts from this cutover. The retired
Otázkomat hosted project audit remains explicitly deferred.

## Evidence and verification boundaries

This recheck used the existing `audit-runtime-boundary.mjs --live`, selected
systemd metadata, executable-path/UID checks, container environment **names**,
nftables table names and rollback-only PostgreSQL catalog queries. The first
migration-ledger query failed because the assumed Supabase ledger is absent;
the follow-up discovered actual per-app ledgers. No user/session rows were read.

Current implementation details: [central README](../server/accounts/README.md),
[MFA](ecosystem-mfa.md), [native registry](ecosystem-native-clients.md),
[UID policy](../server/accounts/deploy/uid-network-boundary.md), and each product's
`docs/ecosystem-*.md` / Odonto `docs/oidc-bff.md`. Recheck live topology before
mutating it: parallel runtime-isolation work can supersede this snapshot.
