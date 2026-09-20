# Central activation dependency checklist

## Superseding coordinator checkpoint — 2026-09-20, 21:44 UTC

Central human login is live. The owner approved **invitation-only initial
testing**, not open registration. A fresh anonymous session check still reports
`registrationMode=closed`; the owner's MFA completion and authenticated admission
and invitation actions remain pending. All seven apps remain enabled.

- Vocabulum and Airsoft now serve their qualified footer builds on ports3171
  and3172, respectively. The exact two-route change preserved the central portal
  and gateway; current Caddy SHA-256 is
  `aa28db0fdd4c64a5c398e5c7e045ef59e19fae2e53e3e28dc437742ba072fdcc`.
  See the [applied route record](../server/accounts/deploy/footer-route-handoff.md)
  and [boot/drain record](../server/accounts/deploy/footer-candidate-handoff.md).
- Public Chromium checks passed both apps' localized footer/report links,
  no-referrer handling and suspended-registration redirects. Independent public
  checks passed all eight website roots with HTTP200. These anonymous checks do
  not establish authenticated app access.
- Both new footer services are active and boot-enabled with unchanged PIDs
  723605/767388 and zero restarts. Their exact predecessor retirement has its
  own checkpoint; do not rerun the earlier route or start operators.
- Next owner action: sign in at `https://www.developed.sk/login`, finish MFA,
  then use `/admin/apps` to save invitation-only registration and send the
  invitation to the privately recorded test mailbox. Keep passwords, invitation
  credentials, cookies and authenticator codes in the user's browser/inbox.

Actual invitation delivery, new registration, confirmation, signed-in picker and
all-seven automatic app login still require human acceptance. Android installation
and genuine MCP acceptance also remain unproven. Do not decrypt queued email
credentials or mint an owner session to substitute for these tests. Legal pages
remain unpublished drafts. General deployment notes omit personal mailbox values;
this documentation change does not remove earlier Git history or alter the
identity-pinned, already-applied bootstrap source/proofs.

## Superseding coordinator checkpoint — 2026-09-20, 21:11 UTC

Human SSO is now **on**, registration remains **closed**, and the separate
central mail worker is **active/enabled**. This checkpoint supersedes conflicting older
deployment statements below; it does not claim completed human/device acceptance.

- The six VPS central-mode serving routes and exact predecessor retirement remain
  complete. All seven app policies enforce central clients, KešTrek's raw-token
  ACL cutover is applied, and the API tunnel uses the restricted gateway.
- The full public gateway matrix passed **50/50**, including five scoped own-data
  HEAD200 checks, twenty cross-app403 checks, old service-role denial and protected
  Studio. It passed again after socket closure. Otázkomat's missing exposed schema
  was corrected with no grants or application-row changes and no REST restart;
  the committed transaction was reconciled read-only, never replayed. See the
  [gateway checkpoint](../server/accounts/deploy/gateway-acceptance-20260920.md).
- Tailscale control-socket isolation is verified across eight changed live
  namespaces, two preserved directory masks and twelve durable future-start
  restrictions, without service restarts. Coordinator public checks also passed
  eight targets across forty rounds. See the
  [socket boundary](../server/accounts/deploy/tailscale-runtime-socket-closure.md).
- The user-confirmed existing owner is now central
  `SUPERADMIN`: the exact UUID bootstrap changed one profile role and added one
  audit entry, preserving passwords, MFA, sessions and product roles. First login
  still requires MFA. See the
  [bootstrap checkpoint](../server/accounts/operators/central-superadmin-bootstrap.md).
- Vocabulum's 26 old executable Vercel deployments remain retired. Odonto's
  backend-then-frontend promotion completed successfully in run `35537483300`
  at 21:03:42 UTC, source `b13c148f89209387101a19651cddc67ca332c9a3`. Canonical
  backend and frontend health passed independently; all four immutable/automatic
  deployment URLs retain protected302 responses. Both temporary promotion
  variables were removed, leaving only the disabled staging variable.
- The user selected a controlled new-account test mailbox, recorded privately;
  its prior scoped check found no existing identity.
  The user subsequently approved **invitation-only admission for the initial
  test**, not unrestricted public registration. Actual registration remains
  closed pending owner MFA and authenticated policy/invitation actions; this
  choice does not unpublish any of the seven apps or reopen legacy login paths.
  No test account, confirmation message or owner MFA enrollment had been reported
  at this checkpoint.
- The reviewed human ingress was applied once from
  `/opt/developed-operators/human-portal-3f417bc`; its root proof is
  `/var/backups/developed-human-portal-20260920/applied.json`. Caddy SHA is now
  `3f49a9a881a51683a787d103d191911bb9bb842c058116fb2d846b04751b8a9c`.
  Anonymous Chromium verified marketing200, login200 with its central form,
  closed-registration200 without credential fields, and profile/security/apps
  redirecting to login. Portal responses are private/no-store; local/session
  storage stayed empty, with no login/signup or mutation request attempted.
  The test hostname's login remains404.
- All seven actual product registration entry points reached the central closed
  registration page in Chromium, with no visible legacy credential fields and
  no mutation requests. Airsoft uses `/sk/signup`; the initial `/en/signup`
  probe used an unsupported locale and was corrected without any source change.
- The separate central mail worker started with empty outbox and passed its
  actual runtime-role gate, socket/secret denials and no-listener checks. Its
  PID is 700440, UID988/GID982; central API PID3197193 and Caddy PID862 are unchanged.
  API-owned mail remains disabled. See the
  [mail-worker checkpoint](../server/accounts/deploy/central-mail-worker.md).
  At 21:12 UTC the coordinator's four aggregate outbox counters remained
  `0/0/0/0`. The owner was asked to complete MFA manually; completion has not
  been reported. Authenticated seven-app SSO and new-registration email
  confirmation are not yet proven.

Next: owner TOTP, authenticated invitation-only admission and real mailbox delivery
and confirmation, signed-in picker/seven-app flows, genuine MCP access and physical
Android install/browser-return acceptance remain to be performed. Preserve the
existing legal-draft publication restrictions; this checkpoint publishes no legal
claims or placeholders. Footer routing is a separate following change; do not
reuse a pre-human Caddy configuration for it.

## Superseding coordinator checkpoint — 2026-09-20, 20:15 UTC

Human SSO remains off and registration closed. The following supersedes older
deployment-state statements below; it does not claim completed user acceptance.

- Six VPS products now serve their isolated central-mode candidates. All five
  exact predecessor units are stopped/disabled; both exact old containers are
  stopped with restart disabled and retained. All seven predecessor ports are
  closed. Six replacements are active and boot-enabled. ScreenTime's stopped
  launcher retains its known `failed`/143 state; do not restart it to clear that.
  See the [retirement record](../server/accounts/deploy/product-predecessor-retirement-20260920.md).
- KešTrek's development preview is suspended. Its durable MCP state was copied
  with matching hashes, public metadata checks passed and only its required
  loopback self-API permission was added. The connected MCP client currently
  requests connection, so genuine authenticated MCP acceptance is not proven.
- All seven policies now enforce central clients, and KešTrek's exact raw-token
  ACL migration is applied. See the [policy checkpoint](../server/accounts/operators/final-policy-cutover.md).
- The exact shared API tunnel change is applied (version 2). Public legacy Auth
  health is denied403; discovery/JWKS remain200. The complete 50-check public
  gateway matrix is next, not yet passed at this checkpoint. Caddy remains at
  product-route SHA `501bbc47de35e94a45c24b9281b1e88ac918ae75d02750fd70c8f13bb1c63946`.
- Vocabulum's exact 26 old executable Vercel deployments are deleted, with
  metadata and immutable-URL404 checks. Static safe handoffs and VPS data remain.
  Odonto's canonical pair still awaits promotion after gateway acceptance.
- KešTrek's separate non-listening notification worker is active and enabled,
  preserving existing schedules without restarting the API. Mega's separate
  hourly session-maintenance timer and central mail worker are still source
  preparation; no real confirmation email has been sent.

The final human-ingress candidate is staged, not approved/applied. Remaining
steps are gateway acceptance, Odonto paired promotion, final boundary checks,
mail/registration readiness, then controlled human acceptance. The intended
superadmin identity and fresh Gmail-tagged test address await owner confirmation:
the originally supplied test address already exists. No owner role was silently
promoted, and no replacement test account was created. Android installation,
actual email delivery/confirmation and signed-in seven-app access remain untested.

## Superseding coordinator checkpoint — 2026-09-20, 19:40 UTC

Public human SSO is still off; central registration is closed and mail disabled.
The checkpoints below are historical where they conflict with these facts:

- All seven apps are now published/reportable with free joining, but
  `enforce_oidc=false`. Actual ScreenTime/KešTrek runtime-UID owner checks passed.
  This enables preserved device/integration checks, not public human login.
  See the [policy checkpoint](../server/accounts/operators/final-policy-cutover.md).
- The local OAuth/data gateway is installed and tested. The public shared API
  tunnel still reaches legacy Kong; its reviewed exact-change operator is staged
  as source only. No Cloudflare PUT has occurred.
- All six host candidates remain private; public product routes and predecessors
  are unchanged. Immutable KešTrek/Otázkomat static artifacts are ready. Durable
  central-environment/startup guards now cover current and future service
  instances; this does not boot-enable them or qualify authenticated access.
- The owner-approved KešTrek development preview is stopped and disabled, with
  its unit definitions backed up. Production KešTrek remains unchanged. Its
  final MCP state handoff, scoped self-API permission and old-runtime retirement
  are separate pending operations.
- Vocabulum's public Vercel alias now serves a function-free static browser
  handoff. Actual HTTP and Chromium checks confirm a fixed canonical destination
  without forwarding query credentials, fragments or Referer. The exact 26 old
  executable deployments still require retirement; alias protection alone is
  not complete closure. Follow its dedicated runbook for the current artifact.
- Odonto's paired promotion operator passed read-only CI inspection
  `35532291735`. Candidates are READY and protected; canonical bindings remain
  on the old deployments. Temporary testing bypasses are revoked.

Remaining sequence: finish remote retirement and MCP handoff, switch the six
host products and retire their predecessors, enforce app/client data access,
switch and verify the exact shared API tunnel, promote the Odonto pair, then
verify full security closure before admitting human SSO. Owner MFA, Android
installation and registration/confirmation/picker/seven-app acceptance remain
untested. No test account or confirmation email has been created.

## Current coordinator checkpoint — 2026-09-20, after 18:28 UTC

Owner decisions received after this checkpoint:

- A brief login-unavailable/re-login window during the coordinated cutover is
  acceptable while websites stay online. This does not authorize unrelated
  service outages or opening SSO before the security boundary is complete.
- Delete all three inventoried empty non-owner Vocabulum accounts (Admin,
  Teacher and Student), after fresh exact-target/reference checks and protected
  recovery copies. This is authorization, not a deletion-completion record.
- Give free users personal folders, words and sentences without school/admin
  privileges. Preserve ownership and tenant isolation; do not promote their role.
- The VPS Vercel login is renewed, and access to the exact Vocabulum project
  has been verified. Its Git deployment link was disconnected at 18:28 UTC;
  existing serving deployments, aliases, domains and protection were unchanged.

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
  remains pending. Reviewed backend-only resume `35528693089` subsequently
  succeeded at 18:21 UTC, producing READY backend
  `dpl_6LRVb8XSHMkMMRmtDrwBysqsKdro` at source `a554465`. The retained frontend,
  original canonical bindings, pinned bundle and application-tree checks passed.
  All four candidate/automatic URLs independently require Vercel authentication.
  The staging gate is again disabled and its revision allowlist removed. No
  canonical promotion, protection bypass creation or deletion occurred.
- The owner subsequently approved temporary automation access for the two exact
  Odonto candidates. Reviewed workflow `b5ab924`, run `35529688224`, completed at
  18:38 UTC with five of six checks passing: frontend config200 (including actual
  HTTPS session-role verification), session401, forbidden identity BFF404,
  allowed business BFF401, and backend health200 with startup guard invoked.
  Backend `/auth/session` unexpectedly returned302 rather than401, so overall
  qualification failed and no promotion followed. Both uniquely marked tokens
  were verified revoked by the in-process cleanup and separate cleanup job.
  Anonymous protection/canonical pins passed, and the probe revision gate was
  removed. Follow-up backend-only diagnostic source `017c76e`, run
  `35530363200`, succeeded at 18:51 UTC: health200 and `/auth/session`401 with
  the exact application-level BFF-authentication denial. The earlier302 did not
  recur; its cause is not established. Both cleanup mechanisms verified the
  operator's temporary markers absent and protection/canonical bindings intact.
  The revision gate was removed again. Actual authenticated-user/data acceptance
  remains pending; no user login, session, mail or registration was created.
- Internal-only central app-check ingress was applied from reviewed `4472848`.
  Both exact HTTPS POST endpoints deny unauthenticated requests401; human login
  remains404 and marketing/test home200. Caddy PID862 and restart count stayed
  unchanged. This exposes no human registration/login/consent path and changes
  no app policies. See the [applied ingress checkpoint](../server/accounts/deploy/internal-ingress.md).
- Mailjet sender/SPF/DKIM read-only checks and localized template/browser tests
  passed. No registration confirmation email has been sent to the approved
  test mailbox, and live mailbox delivery is not yet proven.

Remaining launch gates include Odonto's complete protected least-privilege
Vercel candidates and safe paired handoff,
Vocabulum's remote Vercel access/alias closure, coordinated old-runtime and
provider/data-ingress closure, owner MFA/recovery acceptance, Android acceptance,
and real registration/email/picker/seven-app end-to-end tests. Do not interpret
an unpublished picker as permission to expose a pilot login endpoint.

Vocabulum's three exact sample accounts were deleted once at 18:28 UTC by the
reviewed immutable `a4a4260` operator. Preservation fingerprints and a fresh
503-column scan passed. The owner retains 544 words, 22 folders, three tests and
two classes, with no sentences needing transfer. The coordinator independently
confirmed zero target Auth users, unchanged word/folder counts, seven closed app
gates, closed registration and empty outbox. Protected exact recovery copies
remain; see the [cleanup record](../server/accounts/operators/vocabulum-cleanup-20260920.md).

The complete [Vocabulum Vercel inventory](ecosystem-vocabulum-vercel-closure-20260920.md)
found 26 old executable deployments, five aliases and a retained custom-domain
mapping. The project production alias and direct Vercel Host/SNI access still
expose legacy credentials login. Disconnecting Git prevents accidental source
push deployment; it does **not** retire those runtimes. Static replacement and
exact old-artifact retirement are still pending. Personal free-tier source work
is committed and pushed as `1b4e623`; `305dd90` adds the Vercel Git deployment
guard without changing application bytes. The new immutable private artifact
`/opt/developed-apps/vocabulum/releases/305dd90d192a994aa0567af03ef8dbc15923946e`
now runs in `developed-vocabulum-green.service`, UID985/loopback3161, PID4056033
with NRestarts=0. Six private HTTP checks and twelve actual-UID boundary checks
passed; public Docker PID2391125/port3001 remains selected and unchanged. See
Vocabulum's `deploy/host-runtime.md` checkpoint `6696f95`. Personal folder creation
and renaming and word/sentence authoring are enabled in source; student folder
deletion deliberately fails closed pending an atomic cascading-delete guard.

### Handoff order: preserve device and integration access

Publication policy and public human-login admission are separate controls.
`ensureAccess()` rejects an unpublished or closed app before considering existing
membership, even for the owner. These same checks serve device/integration owner
validation. Do not switch preserved device traffic to a central-mode candidate
while its app policy is still closed.

In particular, ScreenTime maps a central owner-check403 to ingest401, and the
installed Android source's `Sync.kt` clears its unsent buffer on401/403. This is
a data-loss risk, not an acceptable interactive re-login window. A central
availability failure instead becomes503 and is retried. KešTrek's MCP guard also
maps a closed-policy403 to401, although that server path does not delete its
integration key. Keep the existing device/MCP routes serving until their new
authenticated central checks and intended app policy are available.

The coordinated sequence must therefore expose only app-key-authenticated
central internal checks first, keep public human login/consent unavailable,
make all seven app policies usable before switching device/MCP routes, then
complete client/data enforcement, gateway closure and exact legacy-runtime
retirement. Verify device/integration positives immediately. Only after the
complete security boundary passes may public human SSO open. Registration and
mail may remain closed while owner MFA, physical Android and product acceptance
are completed; this is not permission for a partial security pilot.

Owner MFA alone can be exercised with all app policies closed through a reviewed
private canonical-origin path. Android/OIDC app acceptance cannot. If retaining
the pre-public-login acceptance gate, that private path must also contain the
required product/provider routes and usable app policies. Hiding picker tiles
does not provide such containment. No admission, policy or route change was
made by this source review.

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
