# Private green Auth staging — 2026-09-20

Status: **running privately and verified**. Public SSO remains off. The existing
`supabase-auth` provider continues serving. No ingress, public OAuth route,
client registration, mail, account, key rotation or app activation was changed.
All seven intended web callbacks and the separate KešTrek native callback are
included as exact redirects; including them does not register or enable a client.

## Reserved live topology

| Item | Actual staged value |
| --- | --- |
| Container | `developed-auth-green` (`da97597f0af2`) |
| Image | `sha256:385184459f57569c54c25209f51f3b2be99ddd7c4ce9e3555b5d3eea8447b7cf` (`v2.189.0`) |
| Network | `developed-auth-green`, `172.30.241.0/28`, IPv6 disabled |
| Bridge | `br-e1eff445efe4` |
| Green address | `172.30.241.2:9999` |
| Private host binding | `127.0.0.1:3141:9999` |
| DB-only destination | `172.30.241.3:5432`, network alias `db` |
| Environment | `/etc/developed-accounts/green-provider.env`, root-owned0600 |

The existing `supabase-db` gained one additional interface, with gateway priority
`-1`. Its existing `172.18.0.12` interface and default route through
`172.18.0.1`/`eth0` are unchanged; the DB was not restarted. The green container
has no product/shared-network membership. It runs UID/GID1000 inside the container,
with no capabilities, no-new-privileges, read-only root, 16MiB non-executable tmpfs,
256MiB memory/no additional swap, 0.5CPU and100PIDs. Docker automatic restart is
disabled so it cannot boot ahead of the reviewed network policy.

The staging operator copies only the reviewed environment-name allowlist from
blue in memory, then exclusively creates the protected runtime file. The exact
issuer, audience, JWT keys/secret, DB role/password/query parameters, signup
closure, mail and compatibility settings are preserved. Only these names differ:

- `GOTRUE_OAUTH_SERVER_ENABLED`
- `GOTRUE_OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION`
- `GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH`
- `GOTRUE_SITE_URL`
- `GOTRUE_URI_ALLOW_LIST`

The central Site URL is `https://www.developed.sk`, authorization path
`/account/authorize`, OAuth enabled, dynamic registration disabled. There are no
wildcard redirects. The provider retains `supabase_auth_admin` against the
existing `postgres` database. SMTP configuration is preserved privately but
network egress for SMTP is intentionally unavailable in this private stage.

## Two independent network gates

The coordinator installed the global host-UID/control gate before this container
was created: root, central988 and Caddy999 alone may use loopback3141 or the exact
green IP9999. Its separate forwarding rules deny container access to that control
tuple without treating container-root as trusted host-root. This gate belongs to
`developed-uid-boundary.service`; it is not implemented by these new files.

`green-provider-boundary.mjs` adds the separate green egress restriction in two
owned tables, `inet developed_green_provider` and
`bridge developed_green_provider`. Both tables are now installed live through
the enabled `green-provider-boundary.service`.
Only green original TCP traffic to the exact DB5432 tuple is allowed. Replies to
host-originated control requests are permitted; green original traffic to host,
other bridges, public destinations and metadata is denied. Actual pre-DNAT
filtering is at PREROUTING priority-150; FORWARD chains also check translated
destinations, and INPUT denies green-initiated host connections. There is no
general established-connection exemption.

This host has no `br_netfilter` sysctls. The bridge-family rule therefore also
restricts same-bridge green traffic to DB5432 and denies IPv6 forwarding/input on
this dedicated IPv4-only bridge. ARP is preserved. Docker's embedded resolver
resolves the local `db` alias; its daemon-mediated DNS behavior is distinct from
the provider's permitted TCP egress. No app joins this network, and green lacks
raw/network-admin capabilities. These rules do not authorize DB access: the
unchanged dedicated provider DB identity remains required.

An additional bridge destination rule explicitly denies any forwarded request to
green9999, including requests initiated by DB extension workers on the same
bridge. Trusted host control traverses bridge OUTPUT, not this FORWARD rule.
The DB namespace was already unable to establish this connection because of
the original green reply-egress restriction; the explicit ingress denial avoids
depending on that return-path detail. The disconnected fixture proves the DB
can connect before policy and cannot afterward. After live atomic reload, actual
DB-namespace denial and both root/central private health200 passed, without
restarting either provider or the database.

The root-only loader validates source/config ancestors and permissions, exact
Docker network ID/subnet, both existing owned tables, and nft syntax before an
atomic own-table transaction. It never flushes a ruleset. Its configuration is
`/etc/developed-accounts/green-provider-network.json` with exactly
`{"version":1,"bridge":"br-e1eff445efe4"}`. Install reviewed source only under
`/opt/developed-control/green-provider/`. The boundary service owns a private
`/run/developed-green-provider` directory and deliberately has no firewall-removal
stop action. The runtime template installs as `developed-auth-green.service`
after private-start authorization, requiring both boundary services and checking
the egress policy first. Both systemd units are now installed; the provider unit
was boot-enabled only after private health/identity/parity verification passed.
The runtime unit explicitly permits writes only to the root-owned boundary
transaction directory for its startup check.

## Verification and remaining activation gates

Passed before start:

- Exact-image parity: all69 bundled Auth migrations already occur in the live
  ledger of76 rows, latest `20260302000000`; no pending bundled migration.
  Prestart ordered-ledger MD5: `60589993deff051bb630bbf046781f15` (metadata only).
- Private source/environment preflight, unique free subnet/control port,
  retained blue image/running state, unchanged DB default route, and stopped
  green container resource/network metadata.
- `node server/accounts/deploy/green-provider-boundary-test.mjs --run` in newly
  disconnected namespaces: DB-positive; same-bridge non-DB, host, public,
  metadata and IPv6 negatives; post-DNAT denial; host control replies and
  unrelated DB traffic; atomic replacement preserving an unrelated table.
- `systemd-analyze verify` on both new units and `git diff --check`.

One preparation check initially stopped after DB interface attachment because
BusyBox `ip route show default` printed all routes, including the new connected
route. No default route changed. The script now explicitly selects `default`
lines, and the exact stopped container was then created. Do not rerun `--create`
over this staged state: it deliberately refuses existing files/networks/containers.

The coordinator reviewed and authorized the two owned firewall tables, then
conditionally authorized private start after actual probes. Verified live:

- The persistent boundary loaded and root reload twice passed; repeated reloads
  after probes also passed. No other firewall table was changed.
- A temporary nonprivileged echo container at the exact green IP/private binding
  proved root/central988/Caddy999 access and denial for UID1000,983,984,985,986,987,
  995,996,65534 (24 checks). An untrusted Docker bridge could not reach green9999.
- Green-source DB alias/.3:5432 succeeded. A live temporary same-bridge peer5432,
  the old shared DB address5432, a live temporary host echo listener, public443
  and metadata were denied. Exact labelled probe containers were removed after
  testing; the retained qualification fixture was not touched.
- Actual provider `/health`, OIDC discovery and JWKS all returned200. Version,
  issuer and blue/green JWKS match, the environment differs only as listed above,
  and blue remained running. Post-start actual-provider UID/container controls
  and DB-only routing were rechecked.
- A single private administrator read of at most one existing user returned200;
  only status and count were printed. The unchanged DB DSN selects
  `supabase_auth_admin`, verified NOSUPERUSER/NOBYPASSRLS. No active connection
  appeared in the instant role snapshot (blue also has zero idle connections);
  that snapshot is not claimed as observed green session identity. There were
  no green waiting locks. Auth's76-row ledger and ordered hash remain unchanged,
  with registration closed. No identity/client/mail mutation was performed.

The first service start failed before Docker startup because `ProtectSystem`
prevented the verifier's root-only temporary transaction file. The explicit
`ReadWritePaths=/run/developed-green-provider` correction passed. A first provider
check also incorrectly required a persistent idle DB connection; the verifier
now reports the snapshot accurately and proves DB-backed operation with the
bounded private read. No grant, key, schema or shared provider setting was
changed to address either issue.

The read-only `green-provider-verify.mjs` preserves these checks without creating
test accounts, registering clients, sending mail or printing tokens/logs. Public
route closure, client registration, full app data policies, all seven product
cutovers and owner/native acceptance remain separate activation gates.

If startup fails, leave blue serving and stop only `developed-auth-green`; retain
the network gates and private evidence. Do not restore the shared database,
recreate blue or remove the DB interface while green is using it. Public SSO and
the seven application cutovers remain separately gated by the full activation
checklist. This private stage is not completed deployed SSO acceptance.

Reviewed primary references: [Supabase changelog](https://supabase.com/changelog)
and its [self-hosted gateway notice](https://supabase.com/changelog/48048-self-hosted-supabase-envoy-becomes-the-default-api-gateway-b),
[OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
and [exact v2.189.0 configuration source](https://github.com/supabase/auth/blob/v2.189.0/internal/conf/configuration.go).
The existing Kong/provider version is retained; no latest-compose gateway upgrade
belongs to this staging change.
