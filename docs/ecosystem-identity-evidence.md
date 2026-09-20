# Evidence for the DevelopED identity plan

Read-only assessment date: 2026-09-17. Companion to
[ecosystem-identity-plan.md](ecosystem-identity-plan.md).

Planning update, 2026-09-20: the owner confirmed Mailjet with
noreply@developed.sk for transactional mail, Zoho with info@developed.sk for
customer communication, registration controls, superadmin lock/unlock/set/reset
authority, aggregate resource limits, no automatic account expiry and manual
deletion. The owner requested a Report a bug action throughout the ecosystem,
opening a central form that automatically assigns the originating application.
These are user-provided decisions, not new live infrastructure observations.
Sections 17–18 of the plan specify the operating/reporting design. Mailjet/Zoho
credentials, DNS configuration and delivery were not tested in this update;
no application changes or email sending were performed.

## Scope and confidence

Inspected repository source/docs in developed-web, mega-media-player, kestrek,
screentime and shared platform migrations/reference. The Mega Music working
tree contains existing uncommitted work; observations describe that working
tree and are not proof that every feature is deployed.

Live checks were limited to HTTP response metadata, the running Auth container
image and explicitly allowlisted non-secret configuration, and database catalog
queries inside BEGIN READ ONLY / ROLLBACK. No user records, password hashes,
session tokens or secret environment values were printed. No accounts were
created, mail sent, OAuth clients registered, sessions revoked, services
restarted or schema modified.

The platform reference is at
/home/openclaw/workspace/docs/features/supabase-platform-reference.md. Some app
instructions point to the older ~/.openclaw/workspace location. The reference
contains dated snapshots; current source and live metadata were used for the
specific facts below.

## Confirmed findings

| Finding | Evidence | Architectural consequence |
| --- | --- | --- |
| Shared identity already exists | core baseline and app source use auth.users/core.profiles | Preserve UUIDs rather than create a new identity directory by default. |
| Core registry already exists | Live columns in core.apps and core.app_access | Extend existing records; avoid a parallel app registry. |
| Membership has no status/plan fields yet | Live core.app_access has id, user_id, app_id, role | Add explicit suspension/provisioning/entitlement state without overloading role. |
| Core profile has display_name/photo_url/role | Live core.profiles columns | Use the existing canonical profile and protect privilege fields. |
| Browser profile updates are column-limited | Live authenticated UPDATE grants only on display_name, photo_url, username | An owner-only RLS policy was not evidence that role was editable; no such finding is claimed. |
| All registry rows currently readable to authenticated | core.apps apps_select_all policy USING true | Confidential apps require restricting direct registry reads too; filtering only the picker is insufficient. Never store client secrets here. |
| KešTrek/odonto profile setup is triggered by app_access INSERT | Live core.app_access triggers | Ensure-access must be idempotent; membership insertion has product side effects. |
| Running Auth is supabase/gotrue:v2.189.0 | docker ps for supabase-auth | Assess the exact version, not just current Cloud documentation. |
| OAuth enable/path/dynamic-registration variables unset | Allowlisted running-container config | OAuth is not currently configured; tagged source defaults enable to false. |
| Provider Site URL points to a former KešTrek Vercel deployment | Allowlisted running-container config | Central Site URL change needs an inventory of shared consumers. |
| Provider issuer is https://sam-api.developed162.bid/auth/v1 | Allowlisted config | Changing issuer is a separate shared-platform migration. |
| Provider JWT expiry configured to 3600 seconds | Allowlisted config | JWT expiry alone cannot deliver prompt logout. |
| Global self-signup disabled | Allowlisted config and app registration code | Central server registration can keep the existing boundary. |
| Unauthenticated public OIDC discovery returns HTTP 401 | GET /auth/v1/.well-known/openid-configuration | Gateway routing must be proved before relying on normal OIDC discovery. |
| Auth OAuth authorization/session tables already exist | Live information_schema column query | Feature schema exists; this is not proof of working federation. |
| OAuth session has client ID but no parent family column | Live auth.sessions metadata | Browser-scoped ecosystem logout needs a verified correlation mechanism. |
| Target app policies showed no literal app_access/client_id/session_id expressions | Read-only pg_policies filter for kestrek/screentime | Do not assume existing ownership policies implement ecosystem eligibility or client isolation; inspect full policy/function graph during implementation. |
| developed.sk redirects to www.developed.sk | Public GET returned 301 with canonical location | Preserve or deliberately migrate canonical routing. |
| Live homepage did not return repository CSP/Vercel-identifying headers in the sampled request | Public response-header observation | vercel.json cannot be treated as proof of live origin topology or security headers. |

The policy-expression search is an inventory aid, not a complete security audit.
It does not prove exploitability or rule out checks hidden in functions. No
cross-user or cross-app request was attempted against live data.

## Repository-specific integration evidence

### DevelopED

- README.md describes static SK/EN marketing pages, with no current account
  backend and no cookie/localStorage usage.
- AGENTS.md describes older page/contact/translation details. For implementation
  facts, current README and source take precedence over dated observations.
- vercel.json contains restrictive form-action/connect-src settings. Any new
  account UI needs matching live headers, not a broad relaxation.

### Mega Music

- ../mega-media-player/server/accounts/index.mjs validates a password against
  GoTrue, creates its own opaque session and revokes the temporary provider
  session. Its local session therefore has no current central browser family.
- server/accounts/README.md explicitly documents cross-app revocation absence.
- index.mjs creates/updates a product profile and inserts core.app_access on
  login; a future central denial cannot merely hide the tile.
- Password recovery currently updates the shared password then deletes only
  mega_music.sessions for that user.
- Playback URL signing uses 1800 seconds; PUT URL signing uses 3600 seconds.
- The schema is private to the dedicated mega_music_web database role; product
  credentials are encrypted and UUID-bound. Preserve this boundary and UUIDs.
- Name/avatar are currently app-local. Avatar reads are authenticated/private.
- Native Flutter/S4 setup is separate from web account login.

### KešTrek

- frontend/src/app/core/services/supabase.service.ts persists the provider
  session in localStorage under kestrek-auth and uses signInWithPassword.
- flutter/lib/features/auth/data/auth_repository.dart also uses password login;
  native auth cannot be assumed to work unchanged after a strict client-scoped
  token cutover.
- backend/src/auth/jwt-verifier.service.ts validates issuer and audience
  authenticated; it does not itself enforce a KešTrek OAuth client ID.
- backend/src/auth/guards/supabase-auth.guard.ts has a fallback minimal identity
  when a product user lookup fails. The new model must distinguish denied access
  from provisioning failure and database failure.
- backend/src/auth/auth-cache.service.ts caches token/user results for 15 seconds.
- backend/src/auth/user-provisioning.service.ts and the baseline trigger create
  the product user from an app_access INSERT, preserving existing rows.
- backend/src/supabase/supabase.service.ts creates shared service-role clients;
  transactions.service.ts uses the admin client extensively. Schema selection
  is not credential scoping.
- backend/src/users/users.service.ts changes the shared password, but the
  inspected changeOwnPassword path has no explicit ecosystem revocation step.
- backend/src/auth/email-token.service.ts signs app verification claims;
  auth.service.ts confirms by subject after verification. Central email changes
  require retiring or strengthening old paths so old-address tokens cannot
  confirm a later identity state.
- Profile/avatars are product-local; avatar uploads use a public storage bucket.
- MCP/integration credentials already have their own guard branch and should
  remain separate from browser-session semantics.

### Screen Time

- web/lib/supabase.ts creates a browser Supabase client; web/app/page.tsx and
  components query product tables directly.
- The baseline/current migrations enforce parent ownership with auth.uid().
- web/lib/device-auth.ts authenticates a tablet's hashed opaque token, separate
  from a parent's login; ingest/presence/enrolment have dedicated routes.
- CLAUDE.md explicitly requires that tablets never hold parent credentials.
- Preserve those device identities through the browser-session cutover.

## Primary external references used

- [Supabase OAuth server setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started):
  beta status, custom authorization UI and signing prerequisites.
- [Supabase token security](https://supabase.com/docs/guides/auth/oauth-server/token-security):
  identity scopes do not restrict database access; client-aware RLS is separate.
- [Supabase sessions](https://supabase.com/docs/guides/auth/sessions):
  session identifiers and the difference between JWT lifetime and session state.
- [Tagged Auth configuration source](https://github.com/supabase/auth/blob/v2.189.0/internal/conf/configuration.go):
  OAuth server configuration exists and is disabled by default.
- [Tagged Auth authorization source](https://github.com/supabase/auth/blob/v2.189.0/internal/api/oauthserver/authorize.go):
  authorization UI flow, stored consent and auto-approval, state/PKCE/nonce inputs.
- [Tagged Auth routing source](https://github.com/supabase/auth/blob/v2.189.0/internal/api/api.go):
  OAuth and user-management route inventory. Inspection is not a substitute for
  testing delegated tokens against account-management endpoints.
- [OAuth security BCP](https://www.rfc-editor.org/rfc/rfc9700.html):
  redirect, code-flow and token-security requirements.
- [Native OAuth](https://www.rfc-editor.org/rfc/rfc8252.html):
  external-browser authentication and public-client constraints.
- [OIDC back-channel logout](https://openid.net/specs/openid-connect-backchannel-1_0.html):
  standard logout notifications; not evidence the installed provider supports it.
- [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html):
  reauthentication, account-change and recovery considerations.
- [Keycloak OIDC interfaces](https://www.keycloak.org/securing-apps/oidc-layers):
  fallback provider reference, not an evaluated migration recommendation.

## Not established by this assessment

No staging client was registered or end-to-end SSO tested. No production
authentication flow was exercised. MFA propagation, exact delegated-token
restrictions, complete gateway configuration, public client registration policy,
native callback behaviour, provider logout interoperability and proposed session
binding remain implementation qualification tests. No full database/RLS audit,
load test or backup restore was performed. The planning documents do not imply
these tests have passed.
