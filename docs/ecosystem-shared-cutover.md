# Shared identity: compatible blue-green cutover

Read-only inventory: 2026-09-20. This is an implementation/deployment plan,
**not evidence that the shared provider has been activated or isolated**.
The owner has expanded the scope to affected legacy consumers and native
KešTrek. The owner requires no production downtime. No production configuration,
database, account, network or service was changed while preparing this document.

Coordinator deployment update after this inventory: Mega Music account release
`d3f7721` is serving through the new green instance on port 3138 after a graceful
Caddy switch. The coordinator reports a prior auth/core/Mega backup, the scoped
missing web-player migration, passing public form/module checks and 330 health
checks with no failures. These are coordinator-reported results, not additional
live writes or independent acceptance performed by this audit. **All other Auth
paths remain legacy and central ecosystem activation remains off.** The native
platform choice and wider cutover below are still pending.

## Recommendation

Use an expand/verify/route/drain sequence, preserving the current database,
`auth.users` UUIDs and issuer. Do not replace the identity directory or stop the
existing provider. Build compatible app releases and the private control-plane
boundary first. Introduce an exact-version OAuth provider sidecar, then migrate
applications in waves. Close the generic public Auth surface only after every
remaining consumer has a verified replacement.

This avoids a planned service outage; it is not a guarantee of zero failed
requests. New sign-in may be required at an app cutover, as previously accepted
by the owner. That does not authorize breaking native clients or deleting data.
Until the final closure, the installation is a transitional shared-trust system,
not the completed central-only account-security model. Keep general ecosystem
registration/publication closed until that distinction is resolved.

## Verified live topology

- `supabase-auth`: `supabase/gotrue:v2.189.0`; OAuth enable/path/dynamic-registration
  settings are unset. Existing issuer and external API base are
  `https://sam-api.developed162.bid/auth/v1`. Site URL is still the older
  `https://kestrek-bnan-pi.vercel.app`. Signing-key configuration is present;
  no secret values were displayed or copied.
- Unauthenticated public OIDC discovery returned HTTP 401 during this audit.
- Mounted gateway source is
  `/home/openclaw/Dev/supabase/docker/volumes/api/kong.yml`. Its generic
  `/auth/v1/` route forwards to `auth:9999`, accepting the public anon key;
  legacy verify/callback/authorize and JWKS paths have open routes.
- `supabase_default` currently includes Auth, Kong, DB, REST, Storage, Realtime,
  Studio, Meta, Edge Functions, Airsoft, Vocabulum and Odonto Feedback API.
  Joining that network is not an authentication boundary.
- Airsoft and Vocabulum containers have no explicit non-root container user.
  Both have a service-role credential configured. Vocabulum uses
  `http://kong:8000`; Airsoft uses the public Supabase host.
- KešTrek production, ScreenTime, Otázkomat and other applications run as user
  services owned by `openclaw`. Mega Music's system service also runs as
  `openclaw` at the inspected baseline. A localhost-only Auth port is reachable
  by sibling processes; a shared OS user can also undermine file isolation.
- Read-only catalog inspection confirmed `core`, `auth`, `kestrek`, `odonto`,
  `voc_builder`, `otazkomat`, `screentime`, `mega_music`, `airsoft`,
  `odonto_feedback` and `jasom_private` schemas. Schema presence does not prove
  that a product uses this Auth provider.

## Consumer inventory and required changes

Source paths below are relative to `/home/openclaw/Dev/` unless absolute.
Repository source can differ from a deployed artifact; live placement is stated
separately. No user records or session contents were inspected.

| Consumer / placement | Current identity paths and evidence | Required replacement before closure |
| --- | --- | --- |
| Mega Music, `megamusic.developed.sk` | `mega-media-player/server/accounts/index.mjs`: backend password/admin operations and opaque local sessions. New adapter is `ecosystem-auth.mjs`; native player S4 connection is a separate credential domain. | Deploy matching browser/backend versions together, use confidential OIDC + central gate, retire local shared-identity mutations. Keep player/S4 credentials and signed media access unchanged. |
| KešTrek web/API, `kestrek.sk`, user unit `kestrek-prod` | `kestrek/backend/src/auth/`, `users/users.service.ts`, `supabase/supabase.service.ts`; legacy frontend password login, shared service-role business queries. New web BFF exists behind its flag. | OIDC cookie BFF and central revocation gates; scoped data role; disable legacy identity routes. Preserve local business/admin roles, MCP and API-key branches. |
| KešTrek Flutter | `kestrek/flutter/lib/features/auth/data/auth_repository.dart`: Supabase password sign-in and SDK session/refresh; current native app has no central browser callback. | Distinct **public** OIDC client, external-browser code + S256, state/nonce, secure token storage, refresh fencing; API validates the exact native client/session and central account/app state. Ship and verify native release before removing its supported legacy path. |
| ScreenTime, `screentime.developed.sk`, user unit `screentime-prod` | Browser Supabase Auth and direct product queries; new server-only parent BFF exists. `web/lib/device-auth.ts` and `/api/v1/*` use independent device credentials. | Enable parent BFF and client-aware RLS only after seed/config/test; retain device enrollment, ingest, presence and update flows. Replace device-side backend service-role data access with narrowly scoped machine permissions, not parent sessions. |
| Airsoft, `amp.developed.sk`, Docker `airsoft-marketplace` on 3002 | `airsoft-marketplace/app/[locale]/(auth)/{login,signup,forgot-password,reset-password}/page.tsx`: browser password grant/recovery/`updateUser`; `components/dashboard/settings-form.tsx` changes password. `lib/supabase-admin.ts` creates auto-confirmed shared users and `app_airsoft` membership. `lib/supabase/{client,server,middleware}.ts` uses browser/SSR provider sessions; listings/photos/settings also use browser data/storage clients. | Add opaque-session BFF OIDC and central profile/reset/signup links. Move browser writes and storage uploads behind app-owned APIs or carefully scoped signed upload operations. Retain public listings/taxonomy/photos. Add client-aware data/storage gates; retire auto-confirming registration and service-role identity access. |
| Vocabulum, `vocabulum.developed.sk`, Docker `voc-builder` on 3001 | `vocabulary-builder/lib/auth.ts`: NextAuth Credentials password verification then its own JWT session. `lib/supabase-auth.ts`: generic password/refresh, `/user`, logout, admin create/update/delete and recovery. `app/api/v1/auth/{login,refresh,logout,change-password}` also returns provider tokens to API/native clients. `app/users/{actions.ts,import/actions.ts}` creates and manages school identities. `lib/data/client.ts` and `lib/supabase-admin.ts` use service-role for data/storage. | Integrate OIDC into the existing app authorization/session layer, preserving role/org/class restrictions. Add central current-state checks to existing session checks. Migrate versioned API/native contract separately, not only NextAuth UI. Replace global identity delete/reset/email edits with central operations or app-membership removal. Resolve managed-school-account policy below before changing import/invite behavior. |
| Odonto AI, source `odonto-ai`; shared DB confirmed, current public frontend/API host not independently confirmed | `backend/src/auth/auth.controller.ts`: `/auth/{register,login,password-reset/request,password-reset/confirm,resend-confirmation}`. `auth.service.ts` maps username to email, password-signs in, returns bearer tokens, validates via `auth.getUser`. `frontend/src/app/login/page.tsx` saves bearer token to localStorage. `backend/src/admin/admin.service.ts` directly resets passwords, confirms emails and deletes global Auth users. Business queries use shared service-role. | Locate and verify the actual deployed frontend/API, including remote deployments, before cutover. Add OIDC BFF/session validation at the single `validateToken` seam or a reviewed global guard; migrate frontend API transport; move identity/admin operations to central. Preserve Odonto membership/blocked state. Do not switch to ordinary authenticated RLS without fixing its documented recursive policies or establishing a scoped server role. |
| Otázkomat, `educatio.sk`, user unit `otazkomat-prod` on 3126 | `otazkomat/backend/config/supabase.js`: internal Kong service-role data/admin client, separate anon Auth client. `routes/auth.js`: password login, refresh, shared password updates, global signout and custom app verification. `middleware/auth.js` uses `auth.getUser`. `services/{unverifiedUsers,userDeletion,organizationDeletion}.js` can reach global identity deletion. Browser obtains raw access/refresh tokens from backend. | Add OIDC BFF and cookie transport, central validation in auth middleware, scoped data/storage permissions. Preserve org/school roles and test-attempt workflows. Remove global identity deletion from per-app cleanup/deletion. Stop automatic shared-identity expiry (currently unverified cleanup can delete Auth users after seven days). Reconcile existing app-level email verification with central verification. |
| Odonto Feedback, `odonto.developed.sk`, `/opt/odonto-feedback/app`, Docker API/web | **Not Odonto AI.** Anonymous exam-feedback form; dedicated PostgreSQL writer, no service-role key configured. Its README documents no user accounts or public reading of submissions. | Keep anonymous submission contract and dedicated DB role unchanged. Its presence on the shared network does not make it an Auth consumer. It should not gain central login merely because its hostname contains Odonto. |
| JASOM | Dedicated `jasom-db` also runs on host; shared `jasom_private` exists. This audit did not establish shared GoTrue user login. | Do not infer identity coupling from schema name. Verify its actual administrator/session backend before any network/key retirement affecting its connections. |
| My Clinic and other local repositories | My Clinic production Caddy comment identifies a hosted Supabase project; current shared catalog has no clinic schema. Other repository references to Supabase include separate/retired cloud projects. | Treat as unconfirmed/outside this **shared-provider** cutover until actual issuer metadata establishes otherwise. The owner may later add ecosystem federation, but do not rewrite unrelated providers based on a text match. |

### Product decisions that are not deployment details

Vocabulum's import writes `username@noreply.local`; quick-create falls back to
`username@voc-builder.local`. `adminCreateUser` marks these identities confirmed.
Teachers/admins can supply or generate initial passwords and reset managed users.
These identities cannot satisfy an ordinary mailbox-confirmation flow. Choose
and implement an explicit model before migrating these operations:

1. Keep school-managed identities a restricted managed-account class, with
   central-issued, tenant-scoped administration and no automatic entitlement to
   unrelated ecosystem apps; upgrading to a personal account requires a real,
   confirmed address and removal of delegated password authority; or
2. Require real confirmed personal accounts and convert imports into invitations,
   accepting the resulting change to school onboarding and recovery.

Do not silently give teachers password-reset authority over a pupil's personal
KešTrek/Mega Music account. Do not silently disable working school onboarding.
Existing auto-confirmed Airsoft users and Otázkomat's separate verification flag
also need an explicit migration rule: provider `email_confirmed_at` alone is not
proof those legacy flows delivered and confirmed an email.

App-level “delete user” must mean membership/data removal under the agreed
retention policy, not `auth.admin.deleteUser` on the shared UUID. Full ecosystem
identity deletion remains a central, manual, superadmin operation.

## Native client prerequisite

The central initial schema maps one `oauth_client_id` per app. Introduce a
separate client registry (many registered clients to one app) before adding
native KešTrek. Keep web confidential and native public clients distinct; bind
callbacks, platform/client type, grants, tokens and provider sessions to the
correct registered client, while entitlement still belongs to `app_kestrek`.
Update authorization lookup, internal gates and RLS together.

Tagged GoTrue v2.189.0 supports public clients with
`token_endpoint_auth_method=none`; providing a secret for them is rejected.
Custom callback schemes are allowed only when the URI has both scheme and host,
and no fragment; `sk.kestrek://oauth/callback` has that shape, whereas a
single-slash URI without a host does not. Prefer verified HTTPS app links where
practical. Existing protocol qualification covered the confidential flow only:
public-client registration, callback matching, no-secret code/refresh, nonce,
wrong PKCE, replay and wrong-client rejection still require isolated tests plus
real-device return-to-app acceptance. Never ship the web client secret in an APK.

## Why a selective “legacy only for noncentral users” gateway is not the shortcut

Origin, Referer, app hostname, anon key and a caller-supplied app label do not
identify a trustworthy application. Legacy password tokens have no registered
OAuth client binding. A person may share the same UUID across migrated and
unmigrated apps; “noncentral identity” is not an existing durable partition.

An enforceable identity-based compatibility gateway would need at least:

- authoritative, server-owned migration state per UUID and coordinated state
  transitions, including registration, email rename, recovery and concurrent
  password/login requests;
- cryptographic token verification **and** live session lookup before user
  mutations; reject delegated clients even if their tokens are valid;
- safe classification of password grants before issuing a session, and opaque
  refresh/recovery tokens before forwarding a request with side effects;
- equivalent checks on legacy app backends holding admin credentials, all
  alternate ingresses and direct private provider connections;
- revocation of old unbound sessions when an identity crosses the boundary,
  without breaking that person's unmigrated apps.

Keeping an old-key password endpoint open still lets a migrated person obtain
an unbound token; denying only tokens containing `client_id` is therefore
insufficient. Rotating sidecar signing keys can stop some token reuse at the old
provider, but not shared-password/admin bypass, and adds JWKS/REST compatibility
work. A parallel DB copies rather than preserves the single authority and adds
credential/session consistency problems.

Consequently this gateway would be a new security-sensitive migration product,
not the smallest route. Do not implement a string-match/claim-decode bypass.
Prefer compatible client replacements, a bounded internal pilot, and one
reviewed final closure after dependencies are ready. If interim shared trust is
accepted, label it explicitly; do not claim central-only control during it.

## Least-privilege data and network boundary

Changing `.schema('app')` does not scope a service-role key. Removing `.auth.admin`
calls while retaining that key is not isolation either.

The smallest candidate that preserves most existing supabase-js query code is
an app-specific server PostgREST JWT/DB role, issued only by the trusted platform
control plane. For example, a `voc_builder_server` role may access its own
schema and narrow canonical-profile reads, but cannot become `service_role`,
read `auth`, set platform roles or touch other products. Apps must not receive
the platform JWT signing key. Qualify custom-role behavior with the installed
gateway/PostgREST before selecting this implementation; it is a proposal, not
an implemented credential issuer.

Required review for each such role: schema/table/sequence privileges, RLS
policies, default privileges, RPC `EXECUTE` and security-definer functions,
views, storage bucket/object policies and URL signing. Core membership
provisioning and shared profile mutations go through central narrow operations.
For server-only own-schema business access, an explicit own-schema server policy
may retain the app's existing tenant authorization, without cross-schema access.
Do not replace service-role with `authenticated` blindly: Vocabulum/Otázkomat
intentionally have no ordinary-client grants; Odonto has recursive legacy RLS.

Separate product runtimes from Auth/control services by actual network/OS
policy. Dedicated non-root users, protected secret files and no Docker socket
or platform administrative DB credentials are required. A new Auth-only bridge
with a constrained gateway is preferable to placing its container on the broad
product network; any second DB connection network must not re-expose raw Auth.
Inventory worker/dev/remote deployments and offline PDF/maintenance clients too.
Review all retained platform key holders (Studio, Storage, Realtime, Edge
Functions, administration) before rotating credentials; they are not ordinary
product clients and cannot simply be disabled.

## Concrete expand/verify/route/drain order

1. **Freeze exact release identities and rollback targets.** Inventory current
   routes, app release hashes, flags, provider image digest, startup config
   names, exposed schemas and key-holder names without logging values. Prevent
   repo autodeploy timers/watchers from racing this coordinated rollout using
   an agreed deployment lock; do not stop serving applications. Verify a recent
   backup and an isolated restore. Define success probes for every consumer.
2. **Prepare additive central/client schemas.** Replay against an isolated copy
   of the relevant schema shape, then apply only scoped reviewed migrations
   with short lock/statement timeouts; abort and retry later on contention.
   Never run shared `db push` or replay the platform baseline in production.
   Seed each app settings row with `enforce_oidc=false` before installing its
   restrictive policy. In particular ScreenTime's gate returns false when the
   row is absent. Do not apply KešTrek's raw-token REVOKE migration yet.
3. **Build compatibility releases off the live working directories.** Complete
   native/client registry work; implement Airsoft, Vocabulum, Odonto AI and
   Otázkomat replacements above. Deploy default-off versions on separate ports
   with old credential/session paths still functional. New central account
   operations remain hidden until tested. Test shared-identity deletions and
   old email links before retiring any handler. Disable/replace destructive
   app-owned identity cleanup before opening ecosystem registration.
4. **Prepare scoped app data credentials and isolation.** Grant new narrow roles
   first, run role-negative tests and product data/storage acceptance, deploy
   fresh app instances with those credentials, then remove each retired runtime
   credential. Keep legitimate platform services working. Key rotation alone
   is not complete until stale deployed/dev consumers and bypass routes are
   accounted for; do not dump secrets into commands/logs.
5. **Launch the green Auth instance privately.** Same exact GoTrue version,
   database and original issuer/signing configuration; enable OAuth and disable
   dynamic client registration in green only. Green Site URL/authorization path
   point at central; blue retains old link behavior. Confirm migration-version
   parity, startup migration behavior/locks, connection budget and health before
   sharing the live DB. Never run `compose down` or force-recreate blue.
   Private central control calls use green; products cannot access its generic
   user/admin/consent endpoints. Register exact clients privately.
6. **Expose only green protocol paths through a reviewed ingress update.** Route
   exact OAuth authorize/token/userinfo/discovery/JWKS paths to green; leave
   existing non-Auth APIs and blue legacy routes unchanged during the pilot.
   Ensure the Cloudflare path filter also allows the RFC 8414 well-known alias.
   Preserve the issuer and key set; use graceful config reload, validate first,
   retain the previous route target and continuously probe both old and new
   flows. Prove external and internal gateway behavior separately. Existing
   route source alone is not proof of live route precedence.
7. **Migrate products in dependency waves.** First the already-qualified
   Mega/ScreenTime web paths; KešTrek only when its native path works; then
   Airsoft; Otázkomat and Odonto after their identity administration/deletion
   paths are centralized; Vocabulum after its managed-school and versioned API
   contracts are resolved. Implementations can proceed in parallel, but every
   product remains on its verified old path until its whole replacement passes.
   Preserve independent tablets/API keys/MCP. This phase is still transitional
   shared trust while any generic legacy surface remains reachable.
8. **Perform the final security closure, not a provider restart.** Once no
   supported client needs it, deny public generic `/token`, `/user` writes,
   factor/identity operations, raw consent, recovery/verify/admin routes and all
   aliases/bypasses; only the private central control path retains them. Finish
   client-aware product data/storage gates, revoke old raw-token access and
   unused app service-role credentials. Validate no alternate public host,
   internal gateway or sibling runtime bypasses this. Then open the explicitly
   selected app tiles/registration policy. Keep blue available privately for
   investigated rollback; drain before stopping it in a later operation.

The wave order is a dependency guide, not permission to publish one app's SSO
with a knowingly bypassable security boundary. An internal pilot and completed
production activation are distinct milestones.

## No-downtime acceptance and rollback

Before routing an app, its new instance must pass readiness and a full controlled
login/data-write/logout test. Keep old assets available for previously loaded
pages; prefer release-pinned routing or compatible API contracts over changing
frontend and backend independently. Drain streaming requests, uploads and long
test attempts. Preserve idempotency and rollback-compatible schemas. Migration
lock timeouts prevent waiting DDL from silently becoming an outage.

Continuously measure error rate/latency and probe: marketing, old/new login,
password recovery, each product's representative data access, Airsoft photo
upload, ScreenTime tablet ingest, KešTrek native refresh and integration keys,
Vocabulum teacher/student tenant boundaries, Otázkomat active test submission,
and Odonto attachment access. Controlled mail tests must use explicit test
addresses, not existing customer accounts. Include wrong-client, locked user,
revoked session and cross-schema negative tests through every reachable ingress.

On failure, route traffic back to the known-compatible app release; keep
additive schemas. Do not restore an entire DB over new production writes. After
the security closure, re-opening unrestricted legacy Auth is a **security
rollback**, not an innocuous availability switch: it requires an explicit
decision, not an automatic fallback. Keep a compatible secure previous release
as the operational rollback target wherever possible.

## Evidence references

- [Provider qualification and exact tested gateway allowlist](ecosystem-provider-qualification.md).
- [Central deployment/runbook](../server/accounts/README.md).
- Live metadata checks: Docker image/network/config-presence inspection;
  `systemctl --user list-units`; Caddy route source; read-only `pg_namespace`
  query wrapped in `BEGIN READ ONLY` / `ROLLBACK`; public discovery status only.
- [GoTrue v2.189 public-client authentication](https://github.com/supabase/auth/blob/v2.189.0/internal/api/oauthserver/client_auth.go).
- [GoTrue v2.189 registration and redirect validation](https://github.com/supabase/auth/blob/v2.189.0/internal/api/oauthserver/service.go).
- [GoTrue v2.189 generic authentication middleware](https://github.com/supabase/auth/blob/v2.189.0/internal/api/auth.go): checks signature/session, not a central-only OAuth identity-management policy.
- [Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started): custom authorization UI and asymmetric-signing prerequisites; exact installed-version behavior takes precedence over assumptions from current Cloud defaults.
