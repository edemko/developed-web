# Ecosystem identity implementation progress

Started 2026-09-20 at the owner's request. Local implementation only: no live
account mutations, migration, deployment, secret changes or session revocation.

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
- Staged systemd/Caddy templates and recovery/cutover documentation; no deployment.

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
- Mega Music: 59 tests passed, one live integration test skipped; Caddy validated.
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
- KešTrek native Flutter still uses legacy password tokens: explicitly resolve
  native migration/scope before enabling the new rejecting web/API boundary.
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
