# Ecosystem identity implementation progress

Started 2026-09-20 at the owner's request. Central SSO remains inactive: no live
central-identity migration, account mutation, secret change or session revocation.
Source was pushed, and Mega's account/web-player release was deployed separately
with existing login retained; see the publication/production notes below.

## Work streams

- Central backend, private schema, transactional mail/outbox and tests: main agent.
- Portal screens/localization/UI tests: portal_ui agent.
- Standard OIDC client and installed-provider qualification: oidc_qualification agent.
- Product support entry points and staged auth adapters: app_integrations agent.

## Working decisions

- Preserve canonical www.developed.sk and existing provider issuer.
- Preserve identity UUIDs, product records/roles/quotas and device credentials.
- Keep marketing static; add a separate TypeScript account service.
- Central logout explicitly means all apps/devices; product logout is local.
  This supersedes the proposed custom browser-family binding in the planning doc.
- Registration defaults closed until deployment acceptance. Apps default
  unpublished until explicitly configured. No hidden authorization by tile alone.
- Mailjet transactional mail; Zoho manual support; no live mail during tests.
- No automatic account deletion/expiry. Tokens and sessions do expire.
- User-owned unrelated working-tree changes remain untouched.
- Owner requested commit/push on 2026-09-20; this does not itself activate SSO.
  Product dependencies now use reviewed, lockfile-integrity-pinned npm archives
  inside each repository, not sibling-checkout symlinks. Static Vercel publishing
  excludes the new backend, package sources, migrations and internal docs.

## Implemented locally

- Separate TypeScript account service, private Postgres schema and least-privilege
  role; existing auth UUID/core registry retained. Operator configuration tool
  validates exact app callbacks and keeps server credentials out of output.
- Registration modes, verification, password recovery/change, verified email
  change, profile name/language, superadmin account controls and audit trail.
- Encrypted opaque sessions, CSRF/Origin checks, session revocation cutoffs,
  single-use email credentials and crash-safe serialized refresh fences.
- Mailjet encrypted outbox with bounded retry/aggregate capacity, fixed sender
  and Zoho Reply-To; no live mail sent. Text bug reports with automatic registered
  app attribution, anonymous/unverified contact distinction, idempotent saving,
  admin filters/private notes and minimal notification payloads.
- EN/SK/CS/UK portal UI, app picker/profile menu, account/security/admin/report
  screens, signed-in root redirect and static marketing fallback.
- Shared standard OIDC helper with S256/state/nonce, signature/issuer/audience/
  client/subject/session validation. Tested provider requires client_secret_post.
- Mega Music and KešTrek staged web adapters, footer support links, encrypted
  private sessions and legacy identity-route closure when enabled. KešTrek has a
  separate reviewed raw-token cutover migration; independent MCP keys retain
  their lifecycle but account lock is checked centrally.
- Screen Time staged cookie/BFF parent operations and restrictive data policies,
  separate device-owner lock checks, preserved device credentials. Verification
  results are recorded below; its production integration remains disabled.
- Central systemd/Caddy templates and recovery/cutover documentation remain staged.

## Verified so far (2026-09-20)

- Central build and offline suite: 27 passed, three opt-in suites normally skipped.
- Fresh isolated GoTrue v2.189.0/Postgres17: current full migration replay passed
  after the real core baseline. Final lifecycle/integration run: 13 scenarios
  passed (14 TAP tests including the parent), no skips.
  Covers true OAuth, client-aware RLS, role restrictions, account/email/recovery
  changes, password Unicode/whitespace, refresh concurrency and revocation.
- Provider helper: 10 offline checks plus actual S256/nonce/signatures, remembered
  consent, refresh and replay rejection. Isolated gateway allowlist passed.
- Portal: real Chromium smoke passed; mobile profile, inert user text, no browser
  token storage, explicit email confirmation and idempotent failed-report retry.
- Cross-site browser SSO: three scenarios passed (four TAP tests including the
  parent) against the real central UI/backend, GoTrue and Mega Music's actual
  session adapter. An ephemeral HTTPS forwarder served three synthetic origins;
  redirects and APIs were not mocked. Checked tile-to-app login, free membership,
  host-only Secure/HttpOnly/Lax cookies, no JS-visible credentials, footer return
  to the picker, direct app login reusing central identity, and global logout
  rejecting the remaining app cookie with 401. The product page was a minimal
  fixture, not the full player or a production-origin deployment test.
- Browser acceptance caught and fixed a response-classification defect after
  global logout: recognized provider `/user` bearer failures now return 401,
  while unknown administrative/gateway failures and outages remain 503. Offline
  regression coverage preserves that distinction; codes follow the
  [provider error-code contract](https://supabase.com/docs/guides/auth/debugging/error-codes).
- Mega Music: 59 tests passed, two opt-in tests skipped in the default suite;
  separate migration rehearsal passed. Caddy and public login-page smoke passed.
- KešTrek: 679 backend and 120 browser tests passed; TypeScript checks passed.
  Product migration/grant checks passed in a separate disposable database.
- Screen Time: 25 offline tests, TypeScript and isolated Chromium BFF smoke
  passed; lint has no errors and one pre-existing PostCSS warning. A disposable
  central-enabled production build passed with webpack; default Turbopack rejected
  that test copy's outside-root dependency symlink. Production `.next` was not
  touched. All four app migrations and two-owner/legacy-client/lock/RPC/grant
  assertions passed in a disposable database using a fixture of the central gate.
  Refresh crash fencing, failed deletion, post-refresh central outage and logout
  races have regression tests. Read-only live catalogue checks found no Screen
  Time views/materialized views and no parent-callable SECURITY DEFINER routines;
  parent history is SECURITY INVOKER. Browser data APIs were stubbed: this is not
  a completed Screen Time real-provider SSO/deployment acceptance test.
- Test services are capped, labeled and disposable. They do not use live users,
  mail recipients or product data. The shared verification pair, its anonymous
  database volume and its private network were removed after the final passing
  browser/database runs. Test data was intentionally discarded and can be
  recreated from the harness; no production services or data were removed.
  The inspected Screen Time build copy `/tmp/developed-screentime-build-e5AkiD`
  remains available for review; its test web server is stopped.

## Release gates (not yet satisfied)

- Provider protocol proof passed, but delegated tokens can mutate identity,
  enroll factors and approve other clients through generic provider APIs.
  Public gateway closure AND private control-plane network isolation are required;
  loopback alone does not isolate sibling processes on this shared VPS.
- Full-product browser smoke tests for all apps and deployment-origin routing
  checks. The isolated real-Mega-adapter cross-site browser test passed above.
- Eliminate legacy identity-write/token paths in participating apps; inventory
  unrelated shared-key holders without modifying them under this scope.
- Reviewed exact callback/client configuration, sender authentication and proxy
  routes. No production activation before coordinated cutover readiness.
- Controlled test email and rollback rehearsal without restoring shared data.
- Central MFA login/enrollment UI is not implemented; enrolled factors fail
  closed, not bypassed. Resolve superadmin MFA policy before public activation.
- Installed KešTrek Android clients still use legacy password tokens. Native
  central-login source is now implemented and tested, but production client
  registration, a configured release-signed APK, installation and device
  acceptance must precede the new rejecting web/API boundary.
- Shared service-role holders and KešTrek storage/business API isolation remain
  a documented hardening gate. Do not confuse client-aware RLS with containment
  of a compromised backend that still holds an administrator key.
- Dedicated production Node22 runtime must be provisioned outside protected home
  directories before the staged systemd unit can run. No host install attempted.

None of these remaining gates is waived by the passing isolated tests. Account
registration remains closed and every product integration flag remains off.

See [API contract](ecosystem-identity-api.md), [plan](ecosystem-identity-plan.md)
and [evidence](ecosystem-identity-evidence.md). Update this record with actual
test results and remaining gaps; do not equate source changes with deployment.

## Commit/push and publication follow-up (2026-09-20)

- Pushed `92360bd` (portal), `39273a8` (KešTrek), and `6cace5f` (Screen Time)
  to their `origin/main`. The owner subsequently approved including Mega Music's
  prerequisite web-player work and requested production deployment with no downtime.
- Clean `npm ci --ignore-scripts` and real packaged OIDC imports passed in three
  standalone disposable directories. Each product archive contains only the
  reviewed helper source, package manifest and README, not a sibling symlink.
- The existing DevelopED VPS webhook was discovered to run `git reset --hard`
  on the development checkout and rsync almost the entire repository. The first
  requested push therefore cleared the pre-existing `styles.css` modification
  and copied backend/package/migration files into the static web root. This was
  not an account-service activation. The original CSS difference was not captured
  and has not been recovered; Git's unreachable object check contained only a
  progress-document blob, not the CSS edit.
- Removed the unintended public copies, and previously copied project metadata,
  by moving exact paths to the private directory
  `/tmp/developed-deploy-quarantine-lCy9jq` (recoverable, not deleted).
  No literal credential-shaped fields were found in the quarantined MCP config;
  this limited check is not a comprehensive exposure/access audit.
- Corrected only `/usr/local/bin/deploy-developed-web`, retaining its old version
  in that quarantine. The reviewed replacement is
  `server/accounts/deploy/deploy-marketing.sh`: it archives an explicit static
  path allowlist from `origin/main` and never resets the development checkout.
  The first static rerun inherited mktemp's private directory mode and briefly
  returned 403; this was corrected with explicit public static-file permissions
  (`D755,F644`) in rsync and restoration of the web-root mode. Final public and
  origin homepage probes return 200, while backend/config probes return 404.
  Shared auth/proxy configuration was not changed. No central login activation
  or full browser acceptance is claimed.

### No-downtime production request: checked constraints

- Mega's current deployment receiver swaps a shared release path and restarts
  both account and Python services. Its live release currently resolves to the
  dirty development checkout; packaging only committed HEAD would roll back the
  excluded newer Python/playlist and landing-page work. The approved SSO/player
  commit uses `[no deploy]`, a workflow guard that retains CI tests but skips the
  old SSH/package/restart deployment steps. A separate health-checked release and
  graceful proxy switch must precede production activation.
- Read-only recheck confirms GoTrue 2.189.0 still has OAuth disabled, and generic
  public Auth routes still serve native KešTrek and other platform applications.
  A same-key/database sidecar avoids a process restart but does not isolate its
  delegated tokens from legacy password/factor APIs. Secure closure requires
  coordinated migration of the affected consumers and private control-plane
  access separation. Scope approval was requested; no shared services restarted.
- KešTrek's marked raw-token cutover must not be applied while its current native
  client is supported. Before Screen Time restrictive policies are applied, seed
  its `accounts.app_settings` row with `enforce_oidc=false`; a missing row denies
  access, not legacy-compatible access. Neither migration was applied live.
- All four public entry pages returned HTTP 200 during these checks. This is
  a point-in-time availability observation, not proof of completed SSO or an
  absolute future uptime guarantee. Registration/publication remain inactive.
- The owner approved expanding scope to affected auth integrations. Read-only
  inventory also identified Otázkomat and managed school identities in Vocabulum;
  see the shared-cutover inventory. Native KešTrek needs an updated installed
  binary, so the owner's actual Android/iOS/web usage was requested before
  choosing distribution/signing work. Existing clients have not been blocked.
- Mega `d3f7721` is now pushed and deployed as an immutable accounts-only green
  release on `3138`; central mode remains false. Backed up relevant schemas and
  applied only the missing web-player prerequisite migration. Caddy was reloaded
  gracefully; the old account process and Python/landing files were untouched.
  Public browser smoke passed; 330 health probes observed zero failures during
  cutover. Detailed record: `mega-media-player/docs/ecosystem-deployment.md`.

## Registration, mail, and Android follow-up (2026-09-20)

- Added central branded HTML/plain-text templates in EN/SK/CS/UK for verification,
  recovery, email changes, invitations, security notifications, and bug-report
  mail. Credential lifetimes and copy share one definition; links are constrained
  to the canonical origin; dynamic content is escaped; tracking is disabled.
- The isolated browser acceptance now starts with real UI registration, rejects
  unconfirmed login, consumes the encrypted fixture outbox's single-use link,
  and then verifies login, picker, Mega Music SSO and central logout: 5/5 passed.
  No real mailbox, identity, product data or production route was used.
- Added an explicit many-client registry and exact native callback handling.
  Native operator verifies a public/no-secret provider registration before
  attaching it. Central session checks return the authenticated client ID/kind.
  Actual-provider native central checks and RLS: 5/5 passed; account/database
  lifecycle: 14/14 passed. Separate native protocol qualification rejects wrong
  PKCE, wrong clients, wrong callbacks, supplied secrets, and code replay.
- User confirmed Android and willingness to install/test an updated APK.
  Native source implementation is complete behind a default-off switch: final
  Flutter suite 151/151, central-mode suite 13/13, analyzer clean, backend native
  suite 23/23 and TypeScript clean. Exact-source Android debug build passed.
  This debug-signed, deliberately unconfigured artifact is a compile check, not
  a production SSO update. No production public client has been provisioned,
  and installed-device acceptance has not occurred.
- Subapp registration suspension is staged behind off-by-default switches. The
  old forms remain in source and stale local creation requests are rejected in
  central mode. A flag alone is not an SSO implementation or a safe cutover.
- The owner authorized a controlled new-account email test. No real test account
  or email has been created/sent by this follow-up yet; delivery remains a gate.
- Odonto AI's live Vercel frontend/API were positively located. The owner
  approved including reviewed pre-existing auth/email prerequisite work, with
  new central behavior taking precedence. Reviewed source is pushed as
  `07dba80`; the unrelated `CLAUDE.md` edit remains uncommitted. Backend 26/26,
  frontend redirect tests 4/4, TypeScript and disposable credential-free frontend
  production build passed. A separate committed-source Nest production build
  passed and packaged all five HTML templates beside the compiled email service;
  real environment files were excluded. Fixed mismatched confirmation/reset placeholders,
  safe HTML/links/text delivery, recovery membership rechecking and bounded
  local rate limits. Removed unverified exact legacy-email expiry claims.
  This prepares registration suspension but is not a full Odonto OIDC client.
  Exact-commit GitHub Actions run `35510258772` completed both `Deploy Backend`
  and `Deploy Frontend` successfully. Public login, retained registration,
  password-recovery page and API returned 200 after deployment; the frontend
  pages contain their expected content and do not redirect to central identity.
  No central flag, production identity, mailbox or database migration was changed.
- Production central schema/service/provider configuration, constrained generic
  Auth ingress, product runtime credential isolation, remaining legacy consumer
  migrations and the coordinated deployment are still pending. Do not describe
  isolated tests or source commits as production E2E readiness.

### Follow-up publication record

- Pushed staged source: DevelopED `2609b2f`, Mega Music `0b4a602`, KešTrek
  `2386d3c`, Screen Time `eb9fa7f`, Vocabulum `ebbbe48`, Airsoft `3a3369c`,
  and Otázkomat `9c67898`. These are source revisions, not evidence that all
  corresponding production services serve them or that SSO is active.
- Mega's `[no deploy]` workflow completed successfully without its old coupled
  deployment. KešTrek's existing host auto-deployer now honors that same marker;
  its next timer execution explicitly skipped the marked source revision.
  The prior script is recoverable from
  `/home/openclaw/kestrek-deploy-guard-backup-4R0oTr/kestrek-autodeploy`.
  No KešTrek service was restarted for this source push.
- Latest central default suite: 37 passed, five opt-in suites skipped; actual
  isolated browser/database/native acceptance results are recorded above.
  Mega default suite: 61 passed, two opt-in skips. Otázkomat's isolated focused
  registration/cleanup/mail suite: 28/28; frontend production build passed.
- No production test account or live Mailjet message was created by these
  publication steps. Production activation and mailbox delivery remain open.
- The owner explicitly rejected the transitional invite-only production pilot:
  keep SSO off until the full security cutover is complete. Do not enable a
  limited pilot that leaves alternate shared-credential mutation paths open.
- Read-only public DNS check found one SPF record including both Zoho and
  Mailjet, plus a monitoring-only DMARC policy (`p=none`). This does not verify
  Mailjet sender approval, DKIM alignment, or actual mailbox delivery. No DNS
  or mail-provider settings were changed.
