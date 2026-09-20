# Coordinated final cutover sequence

Prepared 2026-09-20. Phase A has an execution checkpoint below; later phases are
a source plan, not a record of executed changes.
The [current activation checklist](../../../docs/ecosystem-activation-checklist.md),
[internal-ingress checkpoint](internal-ingress.md) and app-owned runtime records
provide the changing live facts. The owner authorized all-seven deployment and
a brief interactive login/relogin window while websites stay online. Public
human SSO remains unavailable until the entire security boundary is closed.
This sequence adds no one-app pilot or new owner-approval requirement.

## Controls and ordering

App policy publication and human ingress admission are different controls.
Central `ensureAccess()` rejects `published=false` or `join_policy=closed` before
considering existing membership. This applies to OAuth consent, browser/native
session checks and independent device/integration owner checks. There is no
SUPERADMIN exception. Usable policy must precede routing preserved device/MCP
requests to central-mode candidates; public login/consent can remain unrouted.

ScreenTime's owner-check403 becomes ingest401. Android `Sync.kt` clears its
unsent spool on401/403. A closed-policy handoff can therefore lose buffered data,
not merely require human re-login. KešTrek's integration guard also maps the
denial to401, although the server path does not delete the MCP credential.
Do not use a deliberate device denial to test a production tablet. Controlled
positive checks can lazily create entitlements; they are authorized acceptance
operations, not read-only health probes.

## Prepare before starting the login window

1. Pin each exact candidate, frontend artifact and secure rollback release;
   check current healthy routes, jobs, backup/restore evidence and guarded
   deployment automation. Retain the existing separate JASOM, My Clinic and
   Odonto Feedback identities and worker state. No shared database restore,
   broad restart, deployment-guard removal or retired hosted-project cleanup.
2. Complete Vocabulum's canonical VPS artifact and the separately reviewed
   remote Vercel retirement operation. Its old executable artifacts need the
   exact authorized retirement decision; Git disconnection alone is insufficient.
   Complete Odonto's paired candidate qualification, temporary-token cleanup,
   exact current/candidate alias pins and the old deployment/credential closure
   plan. Do not consume the short login window waiting for missing remote access.
3. Prepare the seven-row policy/enforcement transaction, KešTrek final migration,
   exact product-route/static switch, exact old service/container/dev stop set,
   remote tunnel change and human-admission merge. Preserve independent
   device/MCP credentials. Any rollback after enforcement must retain enforcement.
4. Keep the [two internal POST checks](portal-internal-routes.Caddyfile)
   available with app-key authentication. Confirm the central/data/provider
   candidates and their existing UID boundaries are healthy. Do not route human
   login, session UI, registration or consent during these preparation steps.

## Phase A: install the gateway without changing the tunnel or human ingress

`install-gateway-ingress.mjs` is the executable one-change operator for this
phase. It pins the post-internal-ingress Caddy source SHA256
`29a1541baed510647a17a49b3c6a3f685211d5b1179bbf3b35be6a4ba61c53d8`,
the reviewed public gateway and data-filter snippets. It appends exactly one
`sam-api.developed162.bid` site, inlining the reviewed data snippet so that there
are no newly relocatable imports. Every original source byte remains unchanged.
No app route, policy, tunnel, service lifetime or human portal route is modified.

The read-only opt-in test adapts/validates both full configs and compares every
pre-existing adapted server/site, including canonical www/test. Run from the
repository as the developer:

```sh
GATEWAY_INGRESS_CURRENT_TEST=1 node --test server/accounts/deploy/install-gateway-ingress.test.mjs
PUBLIC_SUPABASE_CADDY_TEST=1 node --test server/accounts/deploy/public-supabase-caddy.test.mjs
```

The second command is a disposable protocol/data fixture; it does not publish
its full-portal fixture. `validate-public-ingress.mjs` also assembles the full
human portal and must not be used as this intermediate deployment artifact.

After committing/reviewing the exact source, stage an immutable root-owned copy
of the new operator plus `public-supabase-site.Caddyfile` and
`public-data-routes.Caddyfile`. The operator accepts only `--stage` and `--apply`
under root. The directory and executable path chosen for that immutable copy
must themselves satisfy its root ownership/no-symlink/no-group-write checks.
`--stage` creates exclusive0700/0600 backup/candidate/proof files under
`/var/backups/developed-gateway-ingress-20260920`; it never reloads Caddy.
`--apply` rechecks pinned live/staged bytes, validates, atomically installs0644
and gracefully reloads. A failed reload restores the exact prior source and
reloads it. A transport error or source drift requires inspecting effective
state; never blindly replay. No automatic rollback is supplied after a later
tunnel switch, because that would remove the gateway serving that tunnel.

Apply this exact pinned addition before another planned Caddy mutation. If the
source has already changed, rebuild/review its pin against that actual source;
do not rewrite a current config to satisfy the old hash. Record installed hash,
PID and health, test no-credential protocol paths and unchanged human routes.
The tunnel still reaches legacy Kong at this point; closure is not claimed.

### Phase A execution checkpoint

Reviewed commit `86e7efe5cd08eab64f0b7fe0304a166cf18ba215` was pushed with
`[no deploy]`. Its exact three runtime files were extracted from Git and installed
root-owned under `/opt/developed-control/gateway-ingress-86e7efe`. The operator
completed `--stage` then `--apply` once. Recovery/candidate/proof files are at the
root-private backup path above. Installed Caddy SHA256:
`9b25d5d170f901c8be78cecab23fcf64a672b4a41c52f0cce15df8af69dca33c`.
Caddy remained active with PID862 and NRestarts0. No tunnel configuration,
product route, app policy, database, credential, service lifetime or mail changed.

Local Caddy requests with Host `sam-api.developed162.bid` returned200 for OpenID
metadata, JWKS and the RFC8414 alias; generic password/user/factor paths,
functions and the unmatched root returned403. Fake service-role class,
malformed bearer and invalid apikey data requests returned403. Credentialless
REST returned upstream401: the denial filter deliberately permits credentialless
public/signed Storage requests and leaves authentication to the upstream. The
first probe incorrectly expected403 for this case; source inspection and a
corrected bounded check confirmed401 without any configuration adjustment.

Public central marketing remained200 and `/login`, `/security`, `/apps`404.
All six original product homepage statuses matched the preflight: five200 and
Airsoft307. The public issuer's no-key legacy health route remained401, consistent
with its unchanged direct-Kong tunnel. Its first probe likewise used an incorrect
200 expectation without the anon key; the corrected no-key expectation passed.
No real token, user check, login, mail or data mutation was used in these probes.
The new current-source merge tests passed2/2 before installation, and the existing
real-Caddy disposable protocol/data fixture passed1/1. No reboot was tested.

## Phase B: usable policies and coordinated product routes

Make all seven registered products published with their intended nonclosed join
policy while keeping registration/mail closed and human ingress unavailable.
Use the reviewed seven exact app IDs, keep existing memberships/roles and verify
existing device/integration owners are eligible. Do not repurpose `free` versus
`invitation` without the intended product policy. The operator must assert seven
rows, exact client bindings and the expected starting flags before its short
transaction. `enforce_oidc` is a separate explicit security cutover control.

Before changing the ScreenTime/KešTrek route, qualify their actual candidates'
authenticated owner checks with controlled existing device/integration flows.
No temporary bypass or fail-open logic is needed. Then gracefully switch the
six VPS product routes to these dedicated listeners with their matching static
artifacts; re-resolve exact active unit/release pins at execution time:

| Product | Old serving listener | New dedicated listener | Static/release coupling |
| --- | --- | --- | --- |
| Mega Music | 3138 (also retire old3137) | 3168, UID984 | Account UI/assets must match the isolated account release; preserve S4/player/import paths. |
| ScreenTime | 3127 | 3167, UID983 | Use the central-compiled Next release and preserve device ingest/presence/update routes. |
| KešTrek | 3124 | 3164, UID982 | Atomically select the central Angular artifact; retain old hashed assets for in-flight HTML. |
| Otázkomat | 3126 | 3166, UID981 | Select the matching central frontend; preserve timed attempts/uploads and disabled identity-cleanup flags. |
| Airsoft | container3002 | 3162, UID986 | Switch the matching immutable Next release; preserve public catalog/photo reads. |
| Vocabulum | container3001 | 3161, UID985 | Select the freshly verified personal-folder/word/sentence artifact, not the earlier private build. |

Odonto is the seventh product and has a separate paired Vercel handoff. Recheck
the exact verified frontend/backend deployment IDs, canonical bindings and
frontend backend-target configuration immediately before promotion. Unless its
paired handoff proves a different dependency order, promote the restrictive
backend first, then its matching frontend: legacy interactive login can fail
during the authorized window, but a new frontend must never use an old privileged
backend. Preserve protection configuration and revoke temporary test bypasses.
An alias promotion does not retire old immutable credential-bearing deployments.

Immediately verify preserved ScreenTime device and KešTrek MCP requests against
the newly selected releases. Stop the handoff on a device401/403; do not leave
production devices polling known-closed policies while fixing unrelated steps.

## Phase C: enforcement and exact predecessor retirement

Activate exact seven-product client/data enforcement with usable app policies.
Apply only KešTrek's reviewed
`20260920071603_kestrek_ecosystem_raw_token_cutover.sql` using its scoped migration
ledger and bounded lock/statement timeouts. It revokes raw browser roles on that
schema while the already-qualified backend role serves API/MCP/native requests.
Do not apply it while supported legacy raw-token browser/native access is still
intended. Native signed build/install and browser-return acceptance must be
coordinated; a protocol fixture is not physical-device evidence.

Drain and stop/disable the exact superseded Mega3137/3138, ScreenTime3127,
KešTrek3124, Otázkomat3126 and Airsoft/Vocabulum containers under the coordinated
scope. The coordinator subsequently recorded the owner's explicit approval and
completed suspension of KešTrek development3123/4201: both exact user units
inactive/disabled with PID0 and no listeners; production was unchanged. Its
root-private backup is `/var/backups/kestrek-preview-suspension-20260920` and
KešTrek documentation commit is `6d42755`. Do not repeat this stop or restore the
old privileged preview; a future preview needs its own isolated replacement.
Preserve development source, state, media, queued jobs and independent credentials. Update automatic
start/deployment targets so old privileged code cannot reappear. Merely removing
a route does not isolate UID1000 or a container retaining the shared network/key.
Do not stop unrelated shared platform services, Studio, Odonto Feedback or workers.

Retire or restrict copied product administrator credentials at every reachable
boundary, including immutable remote deployments. Keep signing material and the
necessary administrator credential only in the trusted central/operator domain.
If the old provider/Kong remain running for platform administration, products
must demonstrably lack access through loopback, raw Docker, forwarding, alternate
ports and remote aliases. Retain the reviewed private Studio/operator path.

## Phase D: switch only the shared public API tunnel route

This is a separate scoped operation from installing the Caddy gateway. Re-read
the running remote tunnel's exact current configuration/version, save its full
recovery copy root-private, and compare against the reviewed expected structure.
Never print configuration or connector/API tokens. The intended transformation:

| Existing exact ingress entry | Replacement |
| --- | --- |
| `sam-api.developed162.bid`, path regex for auth/rest/realtime/storage/functions/graphql, service `http://127.0.0.1:8000` | One hostname-only `sam-api.developed162.bid` entry, service `http://127.0.0.1:80`, original Host retained. |
| Same API hostname fallback404 | Remove only this now-redundant API fallback. Caddy's final403 owns unmatched API paths. |
| `sam-studio.developed162.bid` to8000 | Byte-equivalent unchanged entry; retain Cloudflare Access. |
| Final tunnel404 and all other/origin options | Unchanged. |

Reject unexpected extra API entries, paths, Host overrides or route order; do
not construct a whole-account overwrite from an old snapshot. Preserve the
complete API-returned configuration object and edit only its ingress entries.
Immediately before PUT, GET again and require the same version/config digest.
Use only the authorized exact-tunnel endpoint
`PUT /accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations` with the API's
`config` envelope. API write capability has not been established by the historical
read-only evidence; read access alone is not proof of it. Do not confuse the
running connector token with a management API credential.

After PUT, GET the same tunnel, verify the desired version/config and effective
connector routing. Probe the public issuer's discovery/JWKS and exact RFC8414
alias, generic Auth/consent/factor/admin denial, privileged data denial and valid
scoped/public data/Storage behavior. Preserve redirects-off checks for Studio
Access so its login page200 is not mistaken for unprotected operator access.
Do not declare propagation from the API response alone. Reverting to raw Kong
after enforcement reopens a security boundary and is not automatic rollback.

## Phase E: admit human SSO after complete security closure

Verify all seven secure runtimes, old-runtime/remote closure, actual-UID/socket
denials, enforced app/client data access and public/private alternate-ingress
denials. Then merge the full canonical portal routes against the current Caddy
source, preserving the existing narrow internal checks or replacing only their
marked block. Never apply the old combined config snapshot after product/tunnel
changes. Validate every unaffected host and use a graceful reload.

This admits all seven products together, initially with registration/mail closed.
Owner MFA is mandatory before consent; physical Android, cookie/browser return,
logout/revocation and product acceptance run through the completed boundary.
If pre-public owner enrollment/device acceptance is required, use a reviewed
non-public canonical-origin path earlier; closed picker tiles are not a private
path. New registration/mail admission follows the intended policy and the
authorized mailbox confirmation/picker/seven-app test. Do not confuse inbox
delivery or full product workflow acceptance with a prerequisite to installing
the server-only ingress/gateway. Record actual checks and limitations; build
success and private unauthenticated health are not authenticated runtime proof.
