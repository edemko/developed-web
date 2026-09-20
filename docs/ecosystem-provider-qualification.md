# Provider qualification: DevelopED identity v1

Date: 2026-09-20. Status: installed provider protocol qualified in disposable
containers; **production cutover remains gated by shared gateway and product
integration hardening**. No live account was created, password changed, email
sent, OAuth client registered or production service restarted by these checks.

## Tested environment

- Exact installed provider image: `supabase/gotrue:v2.189.0`.
- Separate `postgres:17-alpine` database, GoTrue migrations applied from scratch.
- Fresh generated signing key (ES256), DB password, admin token, users and
  clients used only by that test. Addresses end in `example.invalid`;
  autoconfirm enabled, no SMTP configured, notification sending disabled by
  default. No production secrets copied.
- Each pair: 192 MB DB, 128 MB Auth, 0.5 CPU each, 100-PID limits, separate Docker
  network, Auth exposed only on an ephemeral loopback port. The network is a
  separate bridge, not Docker's `--internal` network (which suppresses the
  host-port binding). No test request targets external destinations.
- Real `openid-client` 6.8.8 and `jose` 6.2.12, Node 22.23.2. Lockfile committed
  with the source patch when the owner chooses to commit it.
- The `--gateway` variant launches an explicitly loopback-bound Caddy listener
  with admin API and config persistence disabled. This exercises the route
  fixture; it is not evidence that the
  production gateway has these rules.

Run from `packages/ecosystem-auth`:

```sh
npm ci --ignore-scripts
npm test
node test/provider-qualification.mjs --isolated-docker --gateway
```

## Findings and implementation consequences

| Check | Observed result | Consequence |
| --- | --- | --- |
| Direct OIDC discovery/JWKS | HTTP 200; ES256 public key | Public production gateway discovery still needs independent verification. |
| Code flow, S256, state/nonce and signed ID token | Passed through maintained RP library | Standard OIDC is viable without inventing handoff tokens. |
| Access JWT binding | Verified issuer, `aud=authenticated`, `client_id`, subject and `session_id` | Enforce client-specific application policy as well as identity. |
| Wrong PKCE | Provider rejected HTTP 400 | PKCE enforced. |
| Code used by a different client | Provider rejected HTTP 400 | Authorization codes bound to client. |
| Code replay | Provider rejected HTTP 400; RP callback replay rejected too | Both provider code and browser flow are single use. |
| Remembered consent | GET details returned only `redirect_url` and already minted a code | Central policy must run **before** calling provider details. |
| OAuth refresh | Passed; refresh token rotated | Serialize refreshes and persist rotated token atomically. |
| Delegated refresh at generic `/token` without OAuth client authentication | HTTP 400 | Do not use the generic refresh endpoint for delegated tokens. |
| `client_secret_basic` using maintained RP library | HTTP 400 `Invalid client_id format` | Register/use standard `client_secret_post` for this provider version. |
| Delegated token `PUT /user` metadata | **HTTP 200** | OAuth scopes do not prevent direct profile mutation. |
| Delegated token `PUT /user` password | **HTTP 200** | Provider alone does not guarantee central password policy/revocation. |
| Delegated token `POST /factors` TOTP enrollment | **HTTP 200** | Restrict factor management to the central trusted path too. |
| App A token gets and approves App B's authorization | **HTTP 200** on details and consent | Raw provider consent APIs must not be publicly reachable by apps. |
| Exact allowlist through disposable Caddy | Passed: sensitive public methods denied 403, protocol routes allowed | Confirms the draft route boundary in isolation, not production deployment. |

The last four are security failures of the proposed *unrestricted provider
boundary*, not failures of token cryptography. They block production release
unless mitigated. Keeping tokens out of browser storage is necessary but does
not stop an app server with a delegated token from calling these APIs.

The Basic interoperability failure is explained by the exact tagged provider
source: it base64-decodes and splits the header but does not form-decode the two
credentials. The maintained library form-encodes the UUID's hyphens. Standard
`client_secret_post` is supported by both sides and passed the full flow. Do not
modify the library or replace OIDC with a homegrown exchange.

## Central authorization UI REST contract

All routes below are at the existing issuer's `/auth/v1` base in production,
but central trusted calls should use a private upstream URL.

1. RP redirects to `GET /oauth/authorize` with registered `client_id`, exact
   `redirect_uri`, `response_type=code`, `scope=openid email profile`, random
   `state`, random `nonce`, `code_challenge`, and `code_challenge_method=S256`.
2. Provider redirects to configured Site URL + authorization path with
   `authorization_id`. This is a random 32-character alphanumeric handle, **not
   a UUID**. The provider's internal authorization row ID is a separate UUID.
3. Central service authenticates its own opaque session and performs current
   user/app policy checks. A narrow DB read of `auth.oauth_authorizations`
   resolves the client **before** calling details. Check expiry/status, nullable
   subject ownership, exact registered callback, S256 and openid/nonce.
4. Central calls `GET /oauth/authorizations/{authorization_id}` with its user's
   provider bearer token, privately. First consent returns
   `{authorization_id,redirect_uri,client:{id,name,uri,logo_uri},user:{id,email},scope}`.
   Remembered consent instead returns `{redirect_url}` and has already approved.
5. For first consent, privately call
   `POST /oauth/authorizations/{authorization_id}/consent`
   with JSON `{action:"approve"}` or `{action:"deny"}`. It returns
   `{redirect_url}`. Never expose raw provider tokens to the central browser.
6. Validate redirect destination against the callback registered for that app
   before releasing it to the browser. Reject unknown clients. Recheck current
   policy at the product callback before issuing its own session.

`Origin` validation in this provider accepts an absent Origin (backend callers),
so it is not an app-server authorization boundary. Do not rely on CORS to make
the consent endpoints central-only.

## Narrow provider DB reads

Grant only the central DB role the necessary columns; never give product roles
the `auth` schema. Do not select stored codes, refresh secrets or password hashes.

- `auth.oauth_authorizations`: `authorization_id`, `client_id`, `user_id`,
  `redirect_uri`, `scope`, `code_challenge_method`, `nonce`, `status`, `expires_at`.
  `code_challenge_method` is stored lowercase `s256` even though the protocol
  request is `S256`; pending status is `pending`.
- `auth.sessions`: `id`, `user_id`, `oauth_client_id`, `created_at`, `not_after`
  (plus `aal` only if enforcing proven MFA). `oauth_client_id` is nullable for
  ordinary central password sessions. There is no `revoked_at` in this version;
  provider revocation deletes sessions. Do not expose `refresh_token_hmac_key`
  or `refresh_token_counter`.
- Match session to token subject/client, check optional `not_after`, and require
  `created_at > accounts.security_state.revoked_before`. Also check account
  lock, pending security mutation, app publication and entitlement status.

## Gateway closure: draft boundary, not a live patch

The repository's current shared Kong config has open legacy verify/callback/
authorize/JWKS routes and a generic `/auth/v1/` route protected by `key-auth`.
The anon key is public, so this does **not** restrict generic user writes or
consent APIs to central. Adding more open OAuth routes without closing bypasses
does not complete the architecture.

The isolated [Caddy route fixture](../packages/ecosystem-auth/qualification.Caddyfile)
implements this proposed public allowlist:

| Public method | Exact public path | Private provider path |
| --- | --- | --- |
| GET/HEAD | `/auth/v1/.well-known/openid-configuration` | `/.well-known/openid-configuration` |
| GET/HEAD | `/auth/v1/.well-known/jwks.json` | `/.well-known/jwks.json` |
| GET/HEAD | `/auth/v1/.well-known/oauth-authorization-server` | `/.well-known/oauth-authorization-server` |
| GET/HEAD | `/.well-known/oauth-authorization-server/auth/v1` | `/.well-known/oauth-authorization-server` |
| GET/HEAD | `/auth/v1/oauth/authorize` | `/oauth/authorize` |
| GET/HEAD | `/auth/v1/oauth/userinfo` | `/oauth/userinfo` |
| POST | `/auth/v1/oauth/token` | `/oauth/token` |

Everything else on the provider's public identity surface is denied, even with
an anon or service key. Central password login, signup/recovery, provider user
lookup/management, factor operations, consent approval, revocation and client
administration use a private upstream accessible only to central. A custom
header from a public client is not a trustworthy bypass. Preserve non-Auth
Supabase APIs and their independently required client-aware RLS.

Before applying an equivalent production patch:

- Inventory all shared consumers, including odonto, vocabulary builder,
  integrations, Studio/backend administration and any old callback/email flows.
  Shared provider closure intentionally breaks generic public password grants,
  old verification/reset links and direct auth-js mutations. Migrating those
  unrelated applications requires owner-approved scope; do not silently break
  them to ship the three-product portal.
- Ensure no alternate host, direct GoTrue port, Kong route, old ingress or
  publicly reachable central internal endpoint bypasses the allowlist.
- Remove legacy product admin/service-role password-setting and registration
  endpoints. An app retaining the shared service-role secret/private provider
  network access remains part of the platform identity trust boundary. A scoped
  schema setting does not make that key scoped.
- Restrict private network/upstream access at deployment, not only DNS names.
  Product BFFs should have their own OAuth client and central app-check key, not
  platform administrator credentials.
- Keep current issuer stable, add exact public routes without API-key
  requirements for discovery/OAuth protocol endpoints, and independently prove
  route precedence, percent-encoding/trailing-slash behavior and denial through
  every public hostname.
- Re-run with production-equivalent config and staging clients, test real email
  templates/delivery to controlled addresses, verify central recovery/MFA
  policy, perform restore rehearsal, and only then schedule the clean cutover.

## Remaining qualifications

Not established: production route closure, native client callbacks, complete
cross-schema RLS isolation, MFA assurance propagation, abandoned session cleanup,
refresh replay after reuse grace, provider authorization-code concurrency under
load, full backup restore, production Mailjet delivery, and all legacy consumer
migrations. This report must not be represented as approval to deploy v1.

## Primary sources checked

- [Supabase changelog](https://supabase.com/changelog): refreshed 2026-09-20;
  relevant Node 22 baseline, self-hosted gateway migration, and token-status
  notice checked. The existing Kong installation is retained for this plan.
- [OAuth server setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started):
  feature remains beta; asymmetric signing required for OIDC ID tokens.
- [OAuth token security](https://supabase.com/docs/guides/auth/oauth-server/token-security):
  OAuth identity scopes do not constrain database access; RLS is separate.
- [Tagged authorization handlers](https://github.com/supabase/auth/blob/v2.189.0/internal/api/oauthserver/authorize.go),
  [token handlers](https://github.com/supabase/auth/blob/v2.189.0/internal/api/oauthserver/handlers.go),
  [client authentication](https://github.com/supabase/auth/blob/v2.189.0/internal/api/oauthserver/auth.go):
  version-specific REST, remembered consent, code and credential behavior.
- [Tagged authorization model](https://github.com/supabase/auth/blob/v2.189.0/internal/models/oauth_authorization.go),
  [session model](https://github.com/supabase/auth/blob/v2.189.0/internal/models/sessions.go):
  exact DB column meanings.
- [openid-client](https://github.com/panva/openid-client): maintained OIDC RP
  library; code additionally inspected from installed pinned dependencies.
