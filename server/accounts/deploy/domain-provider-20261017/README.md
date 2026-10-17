# Parallel auth.developed.sk provider candidate — 2026-10-17

Status: deployed by the coordinating operator on17 October2026. The parallel
provider developed-auth-domain is live on sam at127.0.0.1:3142, with the new
protected DB-only network and auth.developed.sk public ingress. Existing
developed-auth-green at127.0.0.1:3141 remains available for old clients.
Private health, env/signing parity, strict discovery, host UID denials and DB-only
probes passed. The root-only source lives at/opt/developed-control/domain-provider.

This directory preserves the reviewed source and historical one-time coordinator;
do not rerun its create/apply operations against the installed state. No secrets
are present here. Protected config and rollback backups remain outside Git.

## Exact additive topology

- Container/network: developed-auth-domain; dedicated IPv4-only 172.30.242.0/28.
- New provider 172.30.242.2:9999, private publication 127.0.0.1:3142.
- Existing supabase-db gains 172.30.242.3:5432 with alias db and gateway priority -1.
  Preserve its existing interfaces/default route; never restart the DB.
- Same immutable image sha256:385184459f57569c54c25209f51f3b2be99ddd7c4ce9e3555b5d3eea8447b7cf
  (GoTrue v2.189.0), database URL/role/auth schema, signing keys and all other env.
- Only env changes: GOTRUE_JWT_ISSUER=https://auth.developed.sk/auth/v1 and
  API_EXTERNAL_URL=https://auth.developed.sk/auth/v1. Preserve current redirects/OAuth policy.
- Same UID1000:1000 inside container, read-only filesystem, capabilities dropped,
  no-new-privileges, 256MiB RAM/no extra swap, 0.5 CPU, 100 PIDs, private tmpfs.
- No Docker automatic restart; systemd waits for both network gates.

## Reviewed operator sequence (parent owns production execution)

1. Recheck live config against *.baseline.json and current source against the
   copied uid-network-boundary.mjs. The live loader is
   /opt/developed-control/network-music-e307109/load-uid-boundary.mjs.
   Back up root-readable current configs. Do not use stale baseline replacement.
2. Apply the additive uid-network-boundary.candidate.json through the existing
   managed loader using `systemctl reload developed-uid-boundary` (never restart).
   Existing extraControlEndpoints and all app permissions remain unchanged;
   new protected controls are 127.0.0.1:3142, ::1:3142, 172.30.242.2:9999, trusted
   only to root, central988 and Caddy999. Add blocked subnet172.30.242.0/28.
   bind-boundary.candidate.json adds3142 to protectedPorts but grants no app any
   listener rights. Its encoded kernel policy is identical to the old one.
3. Install reviewed domain-provider*.mjs under root-owned immutable
   /opt/developed-control/domain-provider. Run domain-provider-stage.mjs --check.
   This is a read-only preflight. Recheck currently free port/subnet.
4. Only after the host UID gate is live, root --create on the coordinator creates
   root0600 /etc/developed-accounts/domain-provider.env and network config JSON,
   the dedicated bridge, extra DB interface, and STOPPED container. It never starts.
   It refuses preexisting names/files, checks all bundled Auth migrations are
   already in the DB ledger, and verifies unchanged DB default route.
   A partial failure requires exact-state inspection, not blind rerun/rollback.
5. Install domain-provider-boundary.service under its given name, and
   domain-provider-runtime.service as developed-auth-domain.service.
   Run systemd-analyze verify on installed unit paths, daemon-reload, then start
   only domain-provider-boundary. It owns inet/bridge developed_domain_provider
   tables and uses the actual created Docker bridge ID, never a guessed ID.
6. Inspect the exact installed rules; verify root/central/Caddy private-control
   access and unrelated UID/container denial, and DB-only provider egress.
   Start only developed-auth-domain after these gates, then run root
   domain-provider-verify.mjs. It emits statuses/metadata only, checks same keys
   and exact env parity, old provider still running, new discovery issuer, health,
   one bounded admin user read, and provider role/locks. It prints no credentials.
   Record before/after migration ledger and default route separately.
7. Parent coordinates central ACCOUNTS_OAUTH_PROVIDER_URL=http://127.0.0.1:3142,
   new Caddy OAuth allowlist, discovery and issuer-aware client migration. Keep
   existing 3141 and old-domain routes while clients/native builds transition.
   Keep generic password/user/admin/consent APIs private on BOTH domains.

## Verification performed

- domain-provider-stage.mjs --check: passed against current live source container;
  no pending bundled migrations; exact free network/port; env parity except2 names.
- node --test domain-provider.test.mjs:4 tests passed, exact additive policies,
  unchanged per-UID binding rights, immutable image and scoped issuer changes.
- domain-provider-boundary-test.mjs --run: disconnected namespace DB-positive,
  non-DB/host/public/metadata/IPv6 negatives; DB-origin control denied;
  post-DNAT denial, host control replies, unrelated DB traffic and table replacement.
- domain-uid-namespace-test.mjs --run: disconnected namespace UID and forward
  controls for3142 and172.30.242.2, IPv4/IPv6, exact allowed destinations and
  public-to-private DNAT denial; unrelated fixture table survives replacement.
- Unit template syntax checked in disposable copies with absent helper paths
  replaced by /usr/bin/true. Production target ownership/existence still required.

Runtime and production login acceptance remain parent's responsibility; these
fixtures do not claim live deployed acceptance. Do not flush a firewall ruleset,
restart old provider/DB, rotate keys, upgrade GoTrue, or change existing DB grants.

## Guarded candidate installer and rollback

`apply-provider-candidate.py --apply` is root-only and must be reviewed/run by the
parent. It hashes every candidate in memory, checks both live baseline JSON files
byte-for-byte and the live UID generator SHA, refuses existing new destinations,
backs up policies under /var/backups/developed-domain-migration-20261017/provider,
installs root-owned immutable source from verified bytes, reloads only UID policy,
creates the stopped container/network, installs both dedicated units, loads egress,
then starts and verifies only the new provider. It checks exact metadata path
prefixes, signing/env parity, old health, every app/control/helper UID denial,
DB-positive and alternate DB/public/metadata negative probes. It enables only the
new two units after checks pass. It never modifies Caddy/DNS/central env.

The operator must pin the installer itself using its separately reported SHA256.
A failing guard leaves exact partial state for inspection; do not rerun blindly.

Rollback before any public route switch: stop/disable ONLY developed-auth-domain.
Keep the new egress/UID rules, dedicated bridge and DB interface in place until
cleanup is reviewed; these deny extra traffic and preserve the previous topology.
Do not restart or recreate developed-auth-green or supabase-db. After all new
provider use has stopped, exact container/network removal and DB disconnection
may be considered separately; no automated destructive cleanup is supplied.

If restoring policy files is necessary, first ensure no newer policy edits exist,
stop the new provider, restore only the protected JSON snapshots, and reload the
existing UID service (never restart or flush). The old provider uses its original
unchanged172.30.241.2/.3 and3141. Bind policy wire bytes never changed. After public
activation, FIRST restore the affected auth route/central selection to the known
old provider and verify client compatibility before stopping the new provider.
Do not restore the shared database, revoke active tokens or rotate signing keys.

The live old API_EXTERNAL_URL includes /auth/v1, so new API_EXTERNAL_URL and
GOTRUE_JWT_ISSUER both use https://auth.developed.sk/auth/v1. Public discovery must
show /auth/v1/oauth/authorize, /auth/v1/oauth/token and /auth/v1/.well-known/jwks.json.
