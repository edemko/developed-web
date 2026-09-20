# Runtime isolation and no-stop cutover worksheet

Status: reviewed source templates and **read-only inventory**, 2026-09-20.
Nothing here creates users, starts services, changes firewall rules or enables
identity. This complements `docs/ecosystem-shared-cutover.md`, not an automatic
deployment command. Recheck all live facts immediately before implementation.

## Observed boundaries

| Workload | Current unit/container | Listener / serving path | Current execution boundary |
| --- | --- | --- | --- |
| Mega Music accounts | system `mega-music-accounts-green.service` | loopback 3138, Caddy selected; release `/srv/mega-music/releases/accounts-d3f7721/server/accounts` | `openclaw` |
| Mega Music previous accounts | system `mega-music-accounts.service` | loopback 3137, `/srv/mega-music/current/server/accounts` | `openclaw`; still running |
| Mega Python imports | user `mega-youtube.service` | loopback 8787; `/srv/mega-music/current` | `openclaw`; separately preserve media/queue state |
| KešTrek API | user `kestrek-prod.service` | wildcard 3124, `/home/openclaw/Dev/kestrek/backend` | `openclaw` |
| KešTrek developer consumers | user `kestrek-backend.service`, `kestrek-frontend.service` | wildcard 3123 / loopback 4201 | `openclaw`, live source/watch process |
| Ota/educatio | user `otazkomat-prod.service` | wildcard 3126, `/home/openclaw/Dev/otazkomat/backend` | `openclaw` |
| ScreenTime | user `screentime-prod.service` | loopback 3127, `/home/openclaw/Dev/screentime/web` | `openclaw` |
| Airsoft | container `airsoft-marketplace` | loopback 3002 → container 3000 | image default root, `supabase_default` network |
| Vocabulum | container `voc-builder` | loopback 3001 → container 3000 | image default root, `supabase_default` network |
| JASOM | user `jasom-web.service`, `jasom-submissions.service` | web loopback 8091; immutable release `6-71198e06e22a3d0a242c8a317fbcba97ab173524` | `openclaw` |
| Odonto Feedback, not OdontoAI | `odonto-feedback-web-1`, `odonto-feedback-api-1` | web loopback 3100, API container 4100 | API `node`, both app network and `supabase_default` |
| Other My Clinic | user `myclinic-prod.service` | wildcard 3125; `/var/www/myclinic.sk` static frontend | `openclaw`; separate hosted identity, do not silently migrate |
| Deployment receiver | system `webhook.service` | loopback 9000, `/hooks/*` route | `openclaw` |
| Public ingress | `caddy.service`, `cloudflared-sam-apps.service` | local HTTP Caddy → loopback app ports | `caddy` / `openclaw` respectively |
| Shared Auth | `supabase-auth` | internal GoTrue 9999, no host publication | `supabase`, `supabase_default` |
| Shared gateway | `supabase-kong` | loopback 8000/8443 | `kong`, `supabase_default` |
| Shared database/pooler | `supabase-db`, `supabase-pooler` | DB internal5432; pooler loopback5432/6543 | `supabase_default`; Tailscale also has5432 listener |

The host has systemd255. Node22.23.2 currently lives under openclaw's NVM home;
`/usr/bin/node` does not exist. Do not install a unit referencing that absent
binary or bypass `ProtectHome` by running the writable developer runtime.

`openclaw` is UID1000 and belongs to `sudo` and `docker`; Docker's socket is
root:docker0660. Consequently an app running as this identity is potentially
host-root-equivalent, not just able to read another app's `.env`. The old/new
Mega release trees and public static roots are also currently openclaw-owned.
Changing service `User=` alone does not protect code still writable by a
compromised legacy process. Treat remaining deployment hooks as privileged
control-plane components until redesigned, not ordinary public application UIDs.

Auth, REST, Storage, Realtime, Edge Functions, Studio, Meta, pooler, Airsoft,
Vocabulum and Odonto Feedback API share `supabase_default`. Separate container
names and schema settings are not isolation. Edge Functions has writable
function/cache mounts; inventory deployed functions and their credentials before
claiming shared administrator credentials are gone. Do not disable platform
Studio/Meta/admin access without preserving a private operator route.

### Consumer classification, not guessed by schema name

- Active JASOM's `pipeline/auth.py` uses local scrypt username/password hashes,
  integer account IDs and `jasom_private.sessions`, via `JASOM_WEB_DB_URL`.
  It is not a GoTrue login consumer in that inspected module. Its separate
  `jasom-db` is not proof all JASOM data resides there: its web account tables
  use the shared database. Inspect grants without exposing its DSN. Preserve
  web/submission worker access and S4/media paths. Central integration would
  require an explicit identity mapping; never merge integer IDs into Auth UUIDs.
- Odonto Feedback's dedicated writer is not evidence about OdontoAI. Identify
  actual OdontoAI deployment/issuer before declaring that product migrated.
- KešTrek dev3123/4201 are running, not hypothetical. Move development to an
  isolated fixture or supply reviewed central-client configuration; an old
  watch process with a provider-admin key remains a bypass after prod changes.
- Static KešTrek and Ota are served by Caddy from `/var/www/kestrek.sk` and
  `/var/www/educatio.sk`. Deployed bytes matter, not only repository flags.
  Repo Vercel files (Ota, My Clinic, Vocabulum and others) do not prove an active
  remote deployment. Inventory account-owned Vercel aliases/previews, published
  APKs and cached/service-worker bundles; record retired or migrated explicitly.
- Existing KešTrek and ScreenTime autodeploy timers run every roughly two minutes.
  Coordinate their approved release guards before switching roots; they must
  not restart legacy services or republish old browser-token code afterward.

## Target topology and mandatory negative tests

Use a dedicated non-login Linux UID for each host app and the central service;
no `docker`, `sudo`, shared supplementary groups or writable executable paths.
For container apps use a fixed non-root numeric UID, no Docker socket/host PID or
host network, dropped capabilities, no-new-privileges, read-only application
filesystem and an app-private bridge **without** `supabase_default` membership.
Only explicit private state/cache directories may be writable. Keep uploads,
MCP/device credentials and media/receipt storage in their existing data lifecycle.

An acceptable same-host identity topology is:

```text
public issuer → trusted Caddy OAuth allowlist → private green GoTrue
central UID  → protected loopback control port → private green GoTrue
product UID  → public OAuth + app-key central checks + scoped data endpoint
```

Green GoTrue must have its own control/data network, not the product network.
Give it a DB-only route or tightly restricted DB proxy and its existing minimum
provider DB role, never general product-network membership. Keep the established
external issuer and signing/session identity stable. Shared auth schema compatibility
and simultaneous old/new provider use must be rehearsed against the exact image;
do not allow an unreviewed automatic migration during process start.

The reviewed central code accepts private HTTP only at localhost/127.0.0.1.
A protected loopback control port therefore fits existing code, but **loopback
alone is not protection**. Before starting/publishing that endpoint, implement
reviewed host OUTPUT ownership filtering allowing only central, the trusted
OAuth edge and break-glass root. Also deny product access to raw container IPs,
old provider listeners, host gateway addresses and alternate published ports.
Docker container traffic follows forwarding/DNAT paths, not the host process
OUTPUT rule: enforce its separate bridge/forward policy too. Preserve IPv4 and
IPv6 behavior. Do not paste generic `nft flush ruleset`, change Docker's firewall
backend or assume UFW INPUT rules cover container publication.

Concrete production firewall rules are **not yet installed**. The companion
`uid-network-boundary.mjs` now generates a dedicated table and has disconnected
namespace tests; actual numeric UIDs, green subnets, DB route, current Docker
firewall backend and trusted Caddy reachability still need production review.
An incorrect allow rule can defeat the identity boundary. Record those choices
and packet-path tests before activation. The existing provider qualification Caddy file is the reviewed
protocol allowlist; merge that behavior into every issuer ingress and also
remove/deny generic Auth routes on internal Kong. A front-door-only patch leaves
`127.0.0.1:8000/auth/v1/user` and container `kong:8000` as alternate bypasses.

Check from **each** app's real UID/container, including dev and legacy workers:

1. Private green/old GoTrue, Docker direct IPs, Kong generic Auth operations,
   Studio/Meta/Edge privileged operations and sibling secret files are denied.
2. Public discovery, JWKS, authorization and OAuth token exchange work through
   the fixed issuer. Generic password grant, signup/recovery, `/user` writes,
   factors, admin APIs and raw OAuth-consent approval fail even with an old
   anon/service key. Do not log those keys while testing.
3. Central account checks work only with the assigned app key. Exact web/native
   client binding, own/other-app data, lock, revoke and logout checks pass.
4. There are no product service-role/admin credentials or privileged DB roles.
   Scoped grants and restrictive RLS apply to REST **and Storage**. Verify old
   shared bearer tokens cannot bypass the new per-app data gate.
5. A compromised product cannot modify releases/static roots, invoke sudo,
   reach the Docker socket or drive the privileged deployment hook. Failures
   here remain release blockers even when browser SSO is green.

Root and trusted deployment operators remain explicit platform administrators;
this does not claim isolation from the VPS owner or root compromise. Back up and
rotate removed credentials in a coordinated dependency-safe plan. Merely deleting
a variable does not revoke an already copied shared JWT/service credential.

## Side-by-side sequence and rollback

1. Record exact unit/container/image/release IDs, ports, DNS/tunnel destinations,
   proxy route checksums and applied migration versions. Preserve original
   root-readable configs outside repositories. Back up shared Auth/core/accounts
   and affected product schemas at a consistent point; separately protect session
   encryption keys, signing identity, object storage and app-specific writable
   state. Prove an isolated restore. This audit made **no new live backup**.
2. Finish consumer classification and deployment-hook controls. Stage root-owned
   immutable runtime/releases outside home, new scoped credentials and dedicated
   UIDs. Do not overwrite running `.next`, frontend `dist`, mutable repo files,
   Python environment or old service executable. Build outside live roots.
3. Apply only reviewed additive app/shared migrations with short lock timeout;
   seed registry prerequisites first, publication/registration/enforcement off.
   No `supabase db push`, broad schema reset or data restore into the live DB.
4. Install/test isolation policy, then boot a private green provider and central
   release against the intended scoped DB paths. Central3140 is a *proposed*
   port, not currently active. Reserve free per-app green ports only after a fresh
   `ss` check (do not assume3138 is free: it is the current Mega green).
5. Boot each green app beside its existing process with its correct production
   origin and canonical callback; verify health and real routed HTTPS/OIDC in a
   controlled test path. Test registration→email confirmation→picker→fresh free
   membership/provisioning, old UUID/local role continuity, central password/email
   changes, revocation, support links and app data/storage under scoped roles.
   Source/browser fixture tests are not this deployed acceptance.
6. Prepare/validate a complete merged Caddy config with only reviewed affected
   routes changed. Switch routes using Caddy's graceful reload; never restart all
   services or `docker compose down`. Switch static releases atomically with
   assets retained for in-flight old HTML. Drain requests/uploads/streams/jobs;
   queue workers need explicit single-owner leases, not blind parallel workers.
7. After all consumers are ready, activate exact client/data enforcement and
   close **every** old provider path. These operations span routing and database
   systems, so there is no magical atomic switch. Choose and rehearse an order
   that keeps requests served without a temporary authorization bypass. A short
   required re-login is distinct from service downtime; never claim all existing
   sessions continue if they are intentionally retired. Keep registration closed
   if the central mail/provider path is not ready.
8. Re-run positive and negative acceptance through public, loopback, Docker and
   remote aliases, including native callback return. Observe sanitized errors,
   latency, memory, DB pool use and queue depth. Only after a drain/rollback window
   stop exact superseded processes and remove their obsolete network/key access.
   Leaving privileged legacy processes alive indefinitely is not completed cutover.

Rollback before enforcement: restore only the affected route/static release to
its still-running known-good process; do not restart or restore the shared DB.
Rollback after enforcement: use a known-good release that **retains central and
data enforcement**. Sending traffic back to a legacy password/token app or
reopening raw provider access is a security rollback, not an ordinary recovery;
it requires an explicit operator decision. Preserve newly written user data and
reconcile rather than overwrite it. Track each app's exact old/new port in the
change record. Mega's 3137 fallback is historical code, not a security-approved
post-enforcement rollback target.

## Source templates and validation

`ecosystem-app@.service` is a host-app skeleton, not a complete network boundary.
The instance must be a reviewed short lowercase app name; its root-owned `start`
launcher uses a reviewed Node22.23+ runtime outside home and the immutable release.
Its service UID/group must already exist and have no privileged memberships.
Each instance gets only its own `/etc/developed-apps/<app>.env`, root-owned0600;
systemd reads it before dropping privileges. Runtime code must bind loopback.
Next apps may require an explicitly scoped cache directory; do not make the full
release writable to fix a startup error. Budget memory per measured workload.
No `MemoryDenyWriteExecute` is set because Node/V8 requires JIT compatibility.

`audit-runtime-boundary.mjs --live` reads an allowlisted set of service metadata,
container names/images/UIDs/networks, listener addresses and openclaw group names.
It never requests environment variables, full `docker inspect`, process argv,
logs, database data or credentials. It does not probe endpoints or alter state.
Run its unit test without Docker access:

```sh
node --test server/accounts/deploy/runtime-boundary.test.mjs
```

The unit is syntax-checked with `systemd-analyze verify` using a disposable copy
whose absent deployment launcher is replaced by `/usr/bin/true`; that does not
qualify the production Node path, real UID, application startup or firewall.

Primary references used for the packet-path/design review:
[Docker firewall paths](https://docs.docker.com/engine/network/packet-filtering-firewalls/),
[Docker iptables forwarding](https://docs.docker.com/engine/network/firewall-iptables/),
[systemd execution sandbox](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml).
These describe mechanisms, not evidence that this VPS already enforces them.
