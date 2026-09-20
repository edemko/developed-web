# Final-cutover ingress inventory — 2026-09-20

This is a fresh read-only snapshot, not an activation record. Central SSO,
publication, registration and enforcement remain off. No tunnel, Caddy, Kong,
network policy, runtime or account setting was changed for this inventory.
The separate coordinator is staging the data filter on loopback3143.

## Actual ingress, including paths outside Caddy

| Surface | Observed route or process | Required final treatment |
| --- | --- | --- |
| `cloudflared.service` API route | Remote-managed ingress: `sam-api.developed162.bid`, regex `^/(auth\|rest\|realtime\|storage\|functions\|graphql)/`, directly to `http://127.0.0.1:8000`; same-host fallback404 | Move this origin through the reviewed public protocol/data gateway. Updating existing Caddy app sites alone does nothing to this route. Include the exact RFC8414 alias, currently excluded by the tunnel regex. |
| Same tunnel, Studio alias | `sam-studio.developed162.bid` catch-all to8000 | Preserve operator access behind Cloudflare Access, observed302 to the Access login. This is a privileged operator alias, not an ordinary app route. Review Access membership/service tokens and prevent product use of them. |
| `cloudflared-sam-apps.service` | Locally managed `/home/openclaw/.cloudflared/config.yml`, catch-all `http://localhost:80` | Keep unrelated app routing; add central paths only during coordinated final closure. |
| Live Caddy | No `sam-api` site. `www.developed.sk` and `test.developed.sk` serve static marketing plus `/hooks/*`→9000. No public3140/3141/3143 route at observation. | Add exact central portal routes on the canonical host; keep the test host out of central session/callback routing unless explicitly registered. |
| Internal Kong | Loopback8000/8443 and `172.18.0.10:8000` | Keep platform data/operator use; remove or deny generic Auth routes for products. A public filter alone cannot close these paths. |
| Old GoTrue | `172.18.0.3:9999`, `supabase_default` | Retain privately for investigated rollback; deny product and legacy runtime access. |
| Green GoTrue | Loopback3141 and `172.30.241.2:9999` | Existing dedicated protection denies tested product identities; retain central/edge access only. |
| Studio/Meta/Edge | `172.18.0.6:3000`, `.14:8080`, `.5:9000` | Preserve legitimate platform administration privately; deny product direct access. |
| Caddy control / deploy receiver | Loopback2019 /9000 | Trusted control only. Public hook still needs authenticated delivery, protected signing credential and a reviewed narrowly scoped publisher. |

Kong's mounted route source is
`/home/openclaw/Dev/supabase/docker/volumes/api/kong.yml`. Its relevant services
remain:

- Open legacy `/auth/v1/verify`, `/callback`, `/authorize`,
  `/.well-known/jwks.json`, `/sso/saml/acs`, `/sso/saml/metadata`.
- Generic `/auth/v1/`→`auth:9999/`, with key-auth/ACL; anon keys qualify for this
  gateway, so possession of the old public key is not a central-only boundary.
- `/rest/v1/`, root OpenAPI, `/graphql/v1`, `/storage/v1/`, `/realtime/v1/`
  and its API routes. Realtime tenant/OpenAPI administration has explicit
  request-termination routes; preserve these denials.
- `/functions/v1/`→`functions:9000/`, with CORS only at Kong;
  `/.well-known/oauth-authorization-server`→old Auth;
  `/pg/`→Meta with key-auth/ACL; dashboard `/`→Studio with CORS.
- `/api/mcp` and `/mcp` explicitly terminate. Kong admin8001 refused the tested
  connection; exposed image-port metadata is not proof of a listening admin API.

Non-mutating GET probes with redirects disabled and a browser User-Agent found:
public API anon-key health/settings200 JSON, JWKS200 JSON, functions root400 JSON,
`/pg/` and `/`404; RFC8414 alias404. Private Kong anon-key health/settings and
discovery200, functions root400 without a key, `/pg/`401 without a key,
dashboard307, and both MCP paths403. No sign-in, signup, token issuance, user
mutation, SQL mutation or hook invocation was attempted. Cloudflare blocked a
default Python User-Agent with403; that bot response must not be mistaken for
the intended identity boundary. Following Studio redirects also gives a
misleading200 login page; the actual origin request is Access302.

## Runtimes that still bypass the new host-UID boundary

Live Caddy still selects Mega3138, ScreenTime3127, KešTrek3124, Otázkomat3126,
Airsoft3002 and Vocabulum3001. New dedicated candidates are not evidence that
these old serving processes have drained.

KešTrek development3123/4201, production3124, Otázkomat3126 and ScreenTime3127
remain active user units under UID1000. KešTrek's development backend is a
wildcard listener;4201 is loopback. The shared UID has sudo/Docker group
membership. KešTrek backend `.env` still has `SUPABASE_SERVICE_KEY`, Otázkomat
backend `.env` has `SUPABASE_SERVICE_ROLE_KEY`, and the running ScreenTime process
has that service-role setting. Only names/presence were inspected. Absence from
`/proc/PID/environ` is not proof that a dotenv-loaded credential is absent.

Actual socket probes under UID1000 reached Kong8000/8443, oldAuth9999,
Studio3000, Meta8080, Edge9000, Caddy2019 and webhook9000. Green3141 was denied.
The same ten probes under dedicated KešTrek982, Vocabulum985 and Airsoft986 were
all denied with `EHOSTUNREACH`.

Running `airsoft-marketplace` and `voc-builder` have no configured non-root user,
retain service-role configuration, and remain on `supabase_default`. Socket
probes from **both actual containers** reached oldAuth, Studio, Meta, Edge and
Kong; green direct9999 timed out. A host OUTPUT UID policy does not isolate these
container forwarding paths. Odonto Feedback also remains on the shared network,
but its dedicated anonymous-feedback writer and independent contract must be
preserved; it is not Odonto AI.

Edge Runtime has `VERIFY_JWT=false`, platform credential settings, writable
function/cache mounts, and a sole inventoried `functions/main/index.ts`. Its main
dispatcher passes all runtime environment variables into child function workers.
No product function directory was found. This is a privileged execution surface,
not evidence of a currently deployed exploitable product function. Keep public
functions denied at final closure unless an exact reviewed dependency requires
a separately authenticated route.

The public `/hooks/deploy-developed-web` receiver runs as UID1000. Its root-owned
launcher now publishes a curated static snapshot, rather than resetting the
working tree or restarting accounts. The initial audit found `/etc/webhook.conf`
root:root0644 containing an HMAC signing secret. The coordinator subsequently
changed **only that file** to root:openclaw0640, verified read denial under
UID982/985/986 and retained trusted openclaw access. The active receiver PID893
was unchanged; no key rotation or hook invocation occurred. This resolves the
observed dedicated-UID DAC exposure, while legacy UID1000 applications remain
inside that trusted credential boundary until retired. Keep the separate Mega
isolation guard intact.

## Remote consumers and incomplete alias inventory

Odonto AI's frontend `frontend-jet-rho-66.vercel.app/login` and API
`backend-ten-sand-50.vercel.app/` respond200. GitHub Actions run35514914274
successfully deployed revision `97d7392e9436ee24992c4896053a1ce0c7f4b432` at
2026-09-20 13:55Z. Both Vercel projects need matching BFF/scoped-role settings
and real acceptance; a VPS route change cannot replace these deployments.

Vocabulum has more remote deployments than the previous host runbook recorded:

| GitHub deployment | Revision | Successful immutable Vercel alias |
| --- | --- | --- |
|6554122225,14:58:07Z|`64c975e1dfade01f46b1ce9884c6596dda83aee3`|`vocabulary-builder-8aipptq1s-erik-demkos-projects.vercel.app`|
|6554102492,14:55:52Z|`97919acc212d382e7afcaa4909f8cede74b52cb5`|`vocabulary-builder-mf77x9awz-erik-demkos-projects.vercel.app`|
|6553257654,13:25Z|`9ad7b96e7f728e7be0ca589858b26086e329abd2`|`vocabulary-builder-edchbeu9o-erik-demkos-projects.vercel.app`|

The third alias responded200. GitHub deployment history is not a complete Vercel
account/project alias inventory: older production URLs, previews and aliases
still require explicit migration/retirement and credential checks. Source
`[no deploy]` messages alone do not suppress this Vercel integration. This audit
did not enumerate private Vercel configuration or revoke any deployment.

## Smallest preserving final configuration and operation order

1. Complete all seven products' acceptance and supported native KešTrek release.
   Fix dev/legacy/remote consumers and guard automation before scheduling closure.
   Record each exact secure release and route rollback; retain data and independent
   JASOM/My Clinic authentication. Do not touch the retired hosted Otázkomat project.
2. Stage an exact `http://sam-api.developed162.bid` site in the **existing Caddy80
   server**, avoiding a new port/unit or any container restart. The current
   tunnel has no global or per-route `httpHostHeader` override, so preserve the
   original host when routing to80. Its
   ordered rules use the existing `qualification.Caddyfile` method/path allowlist:
   GET/HEAD discovery, JWKS, OAuth authorization and userinfo; POST exact
   `/auth/v1/oauth/token`; GET/HEAD exact
   `/.well-known/oauth-authorization-server/auth/v1` rewritten to provider metadata.
   These alone target protected green3141, with `/auth/v1` stripped as required.
   No prefix wildcard for OAuth consent/admin routes.
3. In that same ordered gateway, the existing public-data rules forward
   REST/Storage/Realtime through3143 before8000. Keep S3/vector denials. Explicitly
   deny generic Auth and all unmatched paths, including GraphQL, functions,
   `/pg`, dashboard and root OpenAPI. If a legitimate GraphQL/function consumer
   exists, it needs an equivalent reviewed gate before allowing it; routing it
   around3143 is not preserving the security boundary.
4. Rehearse the complete merged Caddy/tunnel/Kong configuration with disposable
   fixtures and no public route. Preserve Studio's Access-protected operator route,
   platform service dependencies and unrelated application hosts. Route the exact
   RFC8414 alias at the tunnel; the current prefix regex excludes it. The minimal
   tunnel change replaces the two `sam-api` entries with one hostname-only
   `sam-api.developed162.bid`→`http://127.0.0.1:80` entry. Caddy's final403 then
   owns unmatched-path denial; retain `sam-studio`→8000 and final tunnel404.
   Validate and gracefully reload Caddy first, then propagate only that remote
   tunnel configuration change and verify its effective revision/Host behavior.
   This public route change does not require Kong reload or any container
   restart. Caddy's upstream protection trusts UID999, not arbitrary loopback
   processes. Internal Kong remains a separate access-isolation/drain gate;
   retaining its operator routes is safe only when products cannot reach them.
5. Prepare every affected app and static release for coordinated activation.
   Enforce data/client gates and close alternate provider access before admitting
   central sessions. Use graceful affected-route changes, short scoped DB
   transactions and compatible secure rollback releases; there is no atomic
   cross-system toggle. Keep publication/registration/mail closed during closure.
6. Remove product reachability of old Kong/Auth/control surfaces and product
   platform credentials, including development, old containers and remote
   deployments. Preserve private administrator service access. Drain/retire exact
   superseded processes only under the coordinated cutover authority. Merely
   leaving them unrouted is insufficient while privileged code/keys remain active.
7. Verify protocol positives and identity-write/consent/admin negatives through
   public, Access/operator, loopback, raw Docker and remote-alias paths. Verify
   assigned app data, cross-app denial, stale bearer denial, logout/revoke/lock,
   Storage/Realtime, and each independent device/MCP flow. Verify hook credential
   and control-socket denials from the actual runtimes. Only then enable the
   explicitly selected app publication/enforcement and registration/mail policy.

The blockers are therefore concrete: direct tunnel→legacy Kong routing; unclosed
Kong/raw provider/control paths; still-serving UID1000 and shared-network
containers; development3123/4201; UID1000's retained hook credential access; unqualified
remote deployment/alias settings; and missing coordinated real-client acceptance.
Private green health, registered clients and a staged3143 filter do not resolve
these ingress dependencies on their own.

Evidence was limited to selected systemd metadata, live Caddy route structure,
effective tunnel routes parsed privately from journal configuration, Docker
network/user/mount and credential-name metadata, source route maps, non-mutating
GET/socket probes, and GitHub deployment metadata. No secrets, user records,
session contents or complete credential-bearing configuration were printed.
Current [Supabase self-hosting documentation](https://supabase.com/docs/guides/self-hosting/docker)
was checked; this host's observed Kong-based deployment takes precedence over
newer default gateway descriptions.
