# DevelopED public-domain migration — 17 October 2026

Owner-authorized scope: migrate central OAuth to `https://auth.developed.sk/auth/v1`
and the shared data/storage API to `https://api.developed.sk`, retaining all services
on sam (128.140.7.21). Central human login remains `https://www.developed.sk`.
The home-server `www.3dprinted.sk` tunnel is excluded. MyClinic and JASOM retain
independent authentication; customer projects Promile Club and PhoneTech are excluded.

## Compatibility contract

The existing `sam-api.developed162.bid` auth/data routes remain available throughout
the transition. Existing mobile installations and saved storage URLs must keep working.
The old issuer will not be removed until native clients are updated and compatibility
acceptance is complete; no retirement date is approved in this operation.

New data ingress must retain exactly the current credential-class denial filter and
Kong route. New OAuth ingress must retain the protocol allowlist, browser-family
broker, session/client validation and private-provider network isolation. No generic
Auth/admin endpoints, new grants, key rotation or DB schema migration is planned.

## Execution and evidence

1. Inventory existing clients, live releases, URL configuration and stored asset URLs.
2. Stage additive API route and DNS; verify unchanged existing routing and data boundary.
3. Rehearse two-issuer auth against an isolated disposable database/provider fixture.
4. Stage reviewed broker/provider compatibility and exact protected configuration changes.
5. Migrate each central web client, then native build definitions; verify callbacks,
   refresh and logout. Preserve legacy routes for deployed native clients.
6. Check every central app and leave an exact per-app completion/remaining-work record.

Production evidence and rollback material: `/var/backups/developed-domain-migration-20261017`
(root-private; never publish its contents). Existing unrelated dirty repository work is
preserved. The owner explicitly authorized the central main fast-forward and scoped
migration commits/pushes, and the scoped Odonto main migration commits/pushes.

## Live checkpoint

Both new domains are live on sam through the existing sam Cloudflare tunnel.
`auth.developed.sk/auth/v1` uses an isolated second provider sharing the existing
accounts and signing keys; the original issuer remains available. `api.developed.sk`
uses the existing scoped credential boundary and data gateway. Neither DNS record
routes to the home server. `www.3dprinted.sk` remains unchanged and HTTPS returns 200.

Central migration source commit: `7b15a5881f7afec87ab2c316af34d781b67413fa`.
Live API/worker launcher release: `7b15a5881f7a`. Worker implementation remains
`e51b271b962a`; sole sender, exact module hashes, credential parity and readiness
verified. Commit `29078f3` records the supported source/release reconciliation.
The original dirty files are preserved, with a private preservation snapshot at
`/home/openclaw/tmp/issuer-migration-20261017/preserve-before-ff`.

### Application acceptance

| Application | Live migration | Browser acceptance |
| --- | --- | --- |
| Vocabulum | New issuer and data API | Signed-in dashboard verified |
| Otázkomat | New issuer/data API; stale session DB host repaired | Signed-in dashboard verified |
| KešTrek | New issuer/data API; notification worker API migrated | Signed-in dashboard verified |
| Airsoft Marketplace | Rebuilt with new issuer/API/image host | Signed-in dashboard verified |
| ScreenTime | Rebuilt with new issuer/API; stale session DB host repaired | Signed-in family dashboard verified |
| Karak II | New issuer | Signed-in account menu verified |
| Mega Music | New issuer; native client dynamically reads configuration | Owner reported signed in; final callback inspection pending browser-control recovery |
| Odonto | Qualified frontend/backend pair promoted; new issuer/API bundle live | Login303 to new issuer verified; final browser callback inspection pending |

Otázkomat UID981 and ScreenTime UID983 now use the already-reserved database
address 172.30.241.3 in their scoped DSN/firewall exceptions. Actual runtime UID
read-only role checks and forbidden-host checks passed; no credentials/schema changed.
KešTrek notifications UID982 own-API read 200 and cross-app read 403 passed.

### Verification

- Full central suite:207 passed,26 optional skipped; browser test passed.
- Two-provider fixture: old/new web and native PKCE, nonce, refresh, userinfo,
  browser/client binding denials, signature rejection and logout/revocation passed.
- Public old/new discovery exactly matches each issuer; scoped API reads 200,
  generic/admin/internal routes 403, missing-token userinfo 401 and forbidden grants 400.
- Provider isolation fixtures: 4 passed; monitoring tests: 34 passed.
- Server monitoring: 50 probes passing, no maintenance windows or active failures.
- Home-server 3dprinted HTTPS 200; its DNS/tunnel/application were not modified.

### Remaining source and release work

- Vocabulum local Flutter configurations use the new issuer; folder-navigation
  UI/tests are saved locally. The iPhone17 simulator build succeeded and the installed
  binary contains the new issuer; its native login popup visibly shows auth.developed.sk.
  No native store release was published.
- KešTrek source commit `edf2fb4035b74a7998c0bf4c4129142f0fc1b2a8` is pushed on
  existing main with owner approval: health/provisioning guards and Flutter example.
  Nine focused tests passed. Existing protected production runtime settings persist.
- Airsoft current branch remains `feat/amp-shared-email`; its uncommitted
  `next.config.ts` image-host allowance must reach main before the next main build.
  Runtime issuer/API configuration persists; only that image allowance is at risk.
- Compatibility routes must remain until old native installations and stored
  old-domain image URLs no longer need them. No retirement is authorized.

Odonto promotion workflow39059146290 passed. Frontend candidate
`dpl_2iPbaNjTja4wEQCcDbF8N1efBtDE` and backend candidate
`dpl_4AoNCk6jJ22j7TjSZBXu3euUEDV9` now serve the existing canonical domains.
Both temporary-probe cleanup checks passed; all temporary workflow gates are closed.
Login initiation returns303 to auth.developed.sk with Secure/HttpOnly/SameSite=Lax
flow cookie. Previous secure pair remains documented for rollback in private operator
evidence. App source revisionc078469, reviewed metadata829e17f, bounded protection
propagation-readiness fix3e0472a;42 focused tests pass.

This checkpoint records observed results. Mega Music/Odonto final browser callback
inspection remains incomplete because the browser-control connection began timing out.
The owner reported signing in to Mega Music. Native store release remains outside
this operation; existing installations continue using compatibility endpoints.
