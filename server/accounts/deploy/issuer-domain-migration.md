# Dual-issuer domain migration — 17 October 2026

This source change is prepared against exact live API commit
`18caeaa1ea42285d394e1381d30653ac08a17241`. It does not deploy a provider,
change DNS, modify production data, or choose a retirement date for old clients.

The original public issuer `https://sam-api.developed162.bid/auth/v1`
continues to issue the original JWT issuer claim. A parallel provider may issue
`https://auth.developed.sk/auth/v1` using the same approved GoTrue image,
Auth database, client registry and signing keys. Never merely change the one
existing provider's issuer: installed native clients validate it strictly.

The optional operator setting `ACCOUNTS_OAUTH_PROVIDER_URL` selects the
reviewed private base of the second provider. Keep `ACCOUNTS_PROVIDER_URL`
unchanged. Only token exchange and userinfo transport use the second provider;
client eligibility, exact authorization-code/browser binding, primary provider
signature/session validation, entitlement checks and revocation stay on the
existing Accounts object. Password login, MFA, consent, mail and account APIs
are unchanged.

## Required ingress mapping

| Public route on auth.developed.sk | Private target |
| --- | --- |
| `/auth/v1/.well-known/openid-configuration` | Second provider discovery |
| `/auth/v1/.well-known/jwks.json` | Second provider JWKS |
| `/auth/v1/oauth/authorize` | Second provider authorization |
| `/auth/v1/oauth/token` | Existing central API `/oauth-migration/token` |
| `/auth/v1/oauth/userinfo` | Existing central API `/oauth-migration/userinfo` |

Only exact existing gateway methods/paths are exposed. Deny direct public
requests to `/oauth-migration/*` on every hostname; these paths are only
internal gateway rewrites. Do not select provider URLs from Host, forwarded
headers, user input or query parameters. If branded host routing is enabled,
preserve the gateway's trusted primary portal Host override. No administrative,
password-grant, registration or consent bypass may reach either provider publicly.
Both providers and the second loopback port require the existing UID/network
isolation model and positive/negative reachability checks.

Keep old public OAuth routes and existing clients working during the transition.
The API/storage domain migration is separate; keep saved old file URLs usable.
Do not change the home-hosted `www.3dprinted.sk` tunnel. Update app build-time
configuration and its deployment/startup guards together, verify each app, and
only retire old endpoints after known installed clients have migrated.

## Isolated verification

Run `npm test --prefix server/accounts` for the configuration and fixed-route
tests. The optional standalone
`server/accounts/test/issuer-migration.qualification.mjs` creates a fresh,
labeled, resource-capped PostgreSQL container and two GoTrue 2.189.0 containers.
It uses generated fixture secrets and a minimal synthetic core schema plus
committed account migrations; no production connection/credentials are accepted.
It removes its containers and network in finally cleanup. It requires Docker,
Node 24, both package dependency installs and the account build.

Verified using exact production source plus this patch:
- Old and new web authorization, primary consent, strict ID/access issuer
  validation, issuer-specific broker exchange, primary access check, userinfo
  and refresh.
- Old and new native public clients, S256 PKCE, nonce, exact issuer, refresh
  and primary access validation without browser-family binding.
- Missing web delegation denial and tampered-signature rejection.
- Primary browser logout invalidates both web issuers while preserving both
  native sessions; explicit all-device logout invalidates native access.

This is protocol/session qualification, not real-device UI or public TLS/DNS
acceptance. Full account suite: 233 tests, 207 passed, 26 optional skips, zero
failures. The exact-commit fixture initially omitted public assets/docs required
by unrelated tests; restoring those source files resolved those fixture failures.

## Deployed source checkpoint — 17 October 2026

The central migration is live on sam. The exact committed source is
`7b15a5881f7afec87ab2c316af34d781b67413fa`, rebuilt by the installed release
tool and sealed at `/opt/developed-accounts/releases/7b15a5881f7a`.
`developed-accounts.service` follows `/opt/developed-accounts/current` and
listens on loopback3140. Its30 compiled/public files and both package files
were compared byte-for-byte with the preceding migration overlay
`eca0536fc5db`; application behavior is unchanged.

The sole `developed-accounts-mail-worker.service` launcher is
`/opt/developed-accounts/mail-workers/7b15a5881f7a`. Its implementation remains
pinned to `/opt/developed-accounts/releases/e51b271b962a`. The existing
coordinator drained the worker, switched and health-checked the API, repinned
only the worker launcher guard, then restarted the sole worker. Actual process
checks verified the five pinned worker modules, logo, API mail-disabled state,
protected six-field worker input parity and unchanged boot-readiness guard.
The Node runtime remains24.21.0. Environment and signing keys were unchanged.

The second provider is loopback3142; the old provider remains3141.
`ACCOUNTS_OAUTH_PROVIDER_URL=http://127.0.0.1:3142` selects the new broker
transport. See [the isolated provider and monitor deployment](domain-provider-20261017/README.md)
for ingress and network controls. Old issuer compatibility remains required.
Per-application rollout and real-device acceptance remain separate checks.

The overlay was reconciled against upstream761cb84 without changing runtime
source. Current main was explicitly fast-forwarded, then only the8 migration
files and28 isolated infrastructure files were committed. Unrelated local
working files were retained; their original bytes and hashes are privately
saved at `/home/openclaw/tmp/issuer-migration-20261017/preserve-before-ff`.
They are not included in this release. The release now has a truthful
sourceCommit; no release-source guard was removed or weakened. The release
poll subsequently returned success and recognized the live revision.

Required release checks passed:207 account tests,26 optional skips, browser
acceptance,4 provider-policy tests and34 monitor tests. The earlier isolated
dual-provider protocol and branded-authorization qualification still applies,
because all runtime source is byte-identical.

For operational rollback, retain both the previous overlayeca0536fc5db and
its matching worker launcher. Use the existing coordinated API/sole-worker
switch process; do not repoint just the API or change the worker implementation.
Rolling back before the compatibility overlay also requires coordinated
public token/userinfo route rollback. Preserve old clients and data throughout.
