# DevelopED deployment and runtime separation

## What changes for the operator

Continue using the existing trusted SSH/Git/deployment account. Each application
runs automatically as its own non-login Linux service account; operators do not
switch to that user or maintain a password for it. Deployment automation stages
root-owned releases, health-checks candidates and switches only the affected
route. New filesystem/network dependencies need explicit, reviewed permissions.

Do not give runtime accounts access to Docker, sudo, the developer home,
deployment hooks or sibling secrets to fix a permission error. Give only the
required resource to the affected app and document why.

## Runbooks and tests

- `runtime-isolation.md`: observed topology, immutable releases, credential
  boundaries, side-by-side cutover and rollback obligations.
- `ecosystem-app@.service`: host Node application template, not a full deployment.
- `uid-network-boundary.md`: scoped nftables generator and isolated namespace
  tests. No global flush, no implicit Docker-forwarding protection.
- `public-data-boundary.mjs` / `public-data-routes.Caddyfile`: credential-class
  denial filter for public REST/Storage/Realtime ingress. This does **not** verify
  JWT signatures or replace upstream JWT validation, app checks or scoped RLS.
  It holds the public anon key only. Raw/private upstreams still need isolation.
  Storage S3/vector protocols remain denied because their alternate credentials
  would otherwise bypass the HTTP bearer classification.
- `deploy-marketing.sh`: explicit static publication allowlist. Never rsync the
  repository into a public web root and never reset a dirty development checkout.
- My Clinic: `my-clinic/deploy/README.md` (canonical repo `CLAUDE.md` points there).
- JASOM and Mega imports: use their own runtime-isolation deployment runbooks;
  queue ownership, absolute media paths and the shared download proxy require
  additional care beyond the Node template.

```sh
node --test server/accounts/deploy/runtime-boundary.test.mjs \
  server/accounts/deploy/public-data-boundary.test.mjs \
  server/accounts/deploy/public-data-caddy.test.mjs \
  server/accounts/deploy/uid-network-boundary.test.mjs
```

The optional UID namespace test runs only in disconnected disposable namespaces:
`node server/accounts/deploy/uid-network-namespace-test.mjs --run`.
Do not substitute the host network for this test.

## Authorization and actual status — 2026-09-20

The owner approved additional runtime separation for JASOM, My Clinic and the
music import worker, preserving their login systems and data. The owner also
approved committing/pushing reviewed latest My Clinic and importer code before
deployment; this is not permission to discard other dirty work.

- Central SSO is still **off**, pending the full shared security cutover.
- Runtime/firewall/public-data templates have isolated-test evidence. The root-only
  persistent UID boundary now covers importer995 and staged host accounts
  Airsoft986/Vocabulum985/Mega984/ScreenTime983/KešTrek982/Otázkomat981;
  raw-relay1089 access is restricted and private green-provider ingress is
  protected on host OUTPUT and Docker forwarding. Live socket probes, DNS,
  public HTTPS and atomic reload passed. Remaining UIDs and
  proxy-target restrictions remain pending; no complete enforcement or central
  activation is claimed. See `uid-network-boundary.md` for exact live paths.
- JASOM web993/worker990 and My Clinic996 now have actual UID network checks
  and boot dependencies too. JASOM keeps its exact DB tuples and worker-only
  public HTTP80 compatibility; My Clinic remains on its independent hosted
  identity over HTTPS. No service restarts were needed for these policy updates.
- The separate root-cgroup bind boundary is live for fourteen dedicated UIDs,
  with fixed-port/address negative probes and boot dependencies verified. Existing
  services were not restarted. Systemd's accepted SocketBind directives alone
  do not enforce this on the host build; see `bind-boundary.md` for evidence,
  exact per-UID ports and the explicit ephemeral-listener limitation.
- My Clinic is now live as `developed-myclinic` UID996 on loopback3155, system
  `developed-myclinic@release-37c2650.service`. Old user API stopped/disabled;
  cron schedules preserved and targets updated.295/295 route-switch probes
  passed. Its own runbook records the frontend, exact approved migration and
  remaining owner acceptance. This is not complete ecosystem network isolation.
- Worker cutovers must preserve active jobs, queue/SQLite state and S4 keys.
  A temporary pause in taking new jobs is not permission to drop API requests.
- The retired Otázkomat hosted Supabase project's key review and broader security
  audit were explicitly deferred by the owner; do not rotate/delete that project
  as part of this runtime deployment.

Update this section from verified live state, not merely from intended steps.
