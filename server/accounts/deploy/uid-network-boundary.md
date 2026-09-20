# Dedicated host-UID network boundary

This complements `runtime-isolation.md` and `ecosystem-app@.service`. The generator
does **not** install users, start services, publish GoTrue or apply firewall rules.
The chosen next topology moves the ecosystem Node processes, including Airsoft
and Vocabulum, to separate host systemd UIDs outside `/home`. No container-app
forwarding isolation is claimed by this artifact. Other products, Python workers,
JASOM and My Clinic were subsequently authorized; their exact production entries
still require verification before adding them to the table.

## Live checkpoint — 2026-09-20

The dedicated table is now installed by the root-only boot-enabled system unit
`developed-uid-boundary.service`. It covers importer995 and newly staged host
app identities Airsoft986, Vocabulum985, Mega accounts984, ScreenTime983,
KešTrek982 and Otázkomat981. Live JASOM web993/worker990 and My Clinic996 are
now covered as well, with actual UID positive/negative checks and no restarts.
No running legacy app was included or stopped by this policy installation.
The trusted identities are central988 (reserved, not running), Caddy999 and the
download relay987 (reserved, not running). Private green Auth is protected on
127.0.0.1:3141 and172.30.241.2:9999; public Auth routes remain unchanged.
Mega accounts and both JASOM identities have the reviewed DB pre/post-DNAT tuples
127.0.0.1:5432 and172.18.0.13:5432; other new app entries are HTTPS-only for now.
JASOM worker alone also has explicit public HTTP80 compatibility for its existing
direct-media validator, after all local/private destination exclusions.

Root-owned policy is `/etc/developed-accounts/uid-network-boundary.json`; reviewed
generator/loader are in `/opt/developed-control/network/`. The loader validates
root ownership, ancestors and non-writable permissions, checks the transaction,
and atomically creates/replaces **only** `inet developed_uid_boundary`. It uses
private regular transaction files under `/run/developed-uid-boundary`: this
host's nft rejects Node's socket-backed stdin for `--file -`. No `ExecStop` removes
rules; stopping the loader does not remove protection. `Requires`/`After` in new
app templates prevent booting them if boundary installation fails. Existing
JASOM/My Clinic units now have the corresponding startup dependency drop-ins.

Actual UID995 tests passed: proxy1088/status18088/bgutil4416 reachable; Kong8000,
Postgres5432, KešTrek3124, Caddy-admin2019 and webhook9000 denied; DNS and canonical
public HTTPS200 work. Atomic reload passed. The extended disconnected namespace
suite also proves IPv4/IPv6, pre/post-DNAT, raw1089 denial, incoming replies and
role-specific worker exceptions. This is **not complete ecosystem isolation**:
legacy1088 still needs the validated public-destination relay before worker
activation; other app UIDs/containers and old Auth routes remain pending.

The JASOM/My Clinic extension passed nine unit tests and the disconnected real
namespace suite, including JASOM public IPv4/IPv6 HTTP and private-DNAT denial.
The first PREROUTING fixture caught trusted loopback being incorrectly denied;
the explicit loopback exception fixed it before production installation. A later
fixture-only NAT rule needed a newline between closing braces; final verification
passed. Actual990/993/996 denied private Auth, Kong, Caddy admin, hooks and sibling
apps; JASOM alone retained DB access. Public HTTPS200, JASOM worker HTTP200, live
catalogue200, My Clinic health200, central private Auth200 and the sole JASOM
worker lock all passed after atomic reload. No service restart or data mutation
was needed. Exact pre-change generator/policy backups are retained alongside the
root operator files under the `before-jasom-myclinic` names.

## What the rules enforce

`uid-network-boundary.mjs` prints only the `inet developed_uid_boundary` table.
It never executes nftables. Two OUTPUT chains inspect packets after conntrack
but **before destination NAT** (priority -150), and again **after NAT** (50).
Existing host and Docker chains remain intact; an accept here cannot override
a drop in another base chain.

For each listed product UID:

- Replies on connections initiated toward the app are allowed, using
  `ct direction reply ct state established`. There is deliberately no general
  established/related exemption. An already-open app-initiated forbidden
  connection loses access when the policy is installed.
- TCP5432 is allowed only to that app's explicit DB tuples, including both the
  published loopback address and actual translated pooler/DB address when DNAT
  is involved. This permits networking, not database authorization: unique
  least-privilege DB credentials are still mandatory.
- TCP/UDP53 is allowed only to the explicitly inventoried DNS resolver addresses.
- Only `mega-music` can have an explicit TCP18887 stable-import-front exception.
  Direct backend8787 is deliberately not an app exception.
- Only `mega-youtube` and `jasom-worker` can have exact IPv4-loopback download
  relay1088/status18088 exceptions; bgutil4416 is Mega-only. A relay exception
  requires a distinct `downloadRelayUid`, which also protects raw1089 from every
  host UID except root and that relay, including central and Caddy. The relay
  UID itself can initiate only TCP127.0.0.1:1089 and DNS127.0.0.53:53, with incoming
  replies allowed; no direct public HTTPS, sibling ports or private Auth.
  Application access to1088 is safe only
  once the reviewed destination-validation relay replaces the raw proxy there.
- Other host-local destinations, loopback, RFC1918, carrier-grade/Tailscale,
  link-local/metadata and reserved IPv4 ranges are denied. IPv6 is limited to
  global unicast with transition/documentation ranges excluded; ULA, link-local,
  multicast, IPv4-mapped and standard NAT64 ranges are not public egress.
  Configured additional internal networks are denied before public egress.
- Remaining public TCP443 is allowed. HTTP80, QUIC/UDP443 and arbitrary other
  ports are not. The sole optional `publicHttp:true` exception is accepted only
  for `jasom-worker`; it permits public TCP80 after the same local/private ranges
  are denied, on both sides of DNAT. The host's own public IP443 is **not** an exception; canonical
  HTTPS resolves through the public Cloudflare ingress. Do not point these
  canonical names at loopback/private addresses in `/etc/hosts`.

All host UIDs except root, the dedicated central UID and Caddy are denied access
to `127.0.0.1:3141`, `[::1]:3141`, and every configured extra control endpoint
(for example green GoTrue's exact private bridge IP9999). Keep old and new private
control addresses recorded until their listeners are actually retired. Product
UIDs additionally cannot initiate any unlisted internal connection, including
old Kong8000/8443, GoTrue9999, Studio, Meta, Edge Functions, Caddy admin2019,
deployment hooks, or sibling app listeners.

Optional `protectForwardedControl=true` also rejects the exact configured control
tuples in PREROUTING before destination NAT and in FORWARD after translation.
FORWARD hook priorities alone do not precede PREROUTING DNAT. Loopback ingress
is exempt from this extra PREROUTING chain because its locally originating
requests already passed UID-aware OUTPUT checks; container interfaces are not.
There are **no UID trust exemptions** for forwarded/container traffic. Replies
to provider-initiated connections remain allowed, and unrelated forwarding is
unchanged. Set this before a green container is exposed and include its exact
private IP9999. Never include the still-serving old provider tuple until its
legacy consumers have migrated. The fixture proves real IPv4/IPv6 forwarding
across three disconnected namespaces, including namespace-root denial and
unrelated-port continuity, plus original-protected/translated-safe and
original-safe/translated-protected cases for both IP families. This option is
enabled in production and is
not general per-container data/egress isolation; old product containers must
still be replaced and retired.

This is not HTTP authorization. Public issuer routes still require the reviewed
OAuth allowlist. Public REST/Storage/Realtime still require
`public-data-boundary.mjs`, ordinary JWT verification and scoped DB grants/RLS.
Storage's S3/vector protocols have alternate authentication channels and must
remain blocked at public ingress unless separately reviewed.

## Configuration contract

Use a root-owned configuration outside any app release. Values below are
**namespace-test examples, not allocated production UIDs or addresses**:

```json
{
  "version": 1,
  "centralUid": 61001,
  "caddyUid": 61002,
  "extraControlEndpoints": [
    { "address": "172.30.40.2", "port": 9999 }
  ],
  "blockedNetworks": ["172.30.40.0/24"],
  "apps": [
    {
      "name": "mega-music",
      "uid": 61003,
      "database": [
        { "address": "127.0.0.1", "port": 5432 },
        { "address": "172.30.40.3", "port": 5432 }
      ],
      "dns": [{ "address": "127.0.0.53", "port": 53 }],
      "musicImport": { "address": "127.0.0.1", "port": 18887 }
    },
    {
      "name": "vocabulum",
      "uid": 61004,
      "database": [],
      "dns": [{ "address": "127.0.0.53", "port": 53 }]
    }
  ]
}
```

Each actual app gets its own entry, even if two happen to use identical DB/DNS
addresses. Empty `database` is valid for HTTPS-only data clients. Add `::1` or
other IPv6 exceptions only when actually required. No hostnames, subnets in
endpoint exceptions, implicit fallback ports, secrets, role JWTs or passwords
are accepted. Unknown properties fail validation. Numeric UIDs must be distinct;
root, UID1000 (`openclaw` on this host), and nobody65534 are rejected as app or
central/Caddy identities. UID values must come from the final host account
inventory, never UID guesses or the example above.

`blockedNetworks` is required, even when empty after review. Include all Docker,
VPN and private-control routed ranges, especially globally numbered internal
networks that are not RFC1918/ULA. Public egress is not a guarantee against a
private service deliberately exposed through a public relay. Audit all ingress
aliases, tunnels and routes separately.

## Offline verification

Node22+, nftables, iproute2, util-linux and passwordless sudo are needed only for
the optional namespace test. Pure unit tests need no privilege:

```sh
node --test server/accounts/deploy/uid-network-boundary.test.mjs
node --test server/accounts/deploy/load-uid-boundary.test.mjs
node server/accounts/deploy/uid-network-namespace-test.mjs --run
```

The second command uses `sudo unshare --net`, verifies its namespace differs
from the host and PID1, then creates only private veth interfaces and nft tables
inside that disconnected namespace. A second disposable namespace supplies
simulated public IPv4/IPv6 HTTPS endpoints; **no Internet packets are sent**.
Fixture subprocesses drop groups/GID/UID to numeric test identities without
creating host accounts. Test listeners exist only inside the new namespaces.

The fixture checks nft syntax, both IP families, trusted control UIDs, denied
unlisted UIDs, exact per-app DB/DNS/import access, permitted incoming responses,
blocked sibling requests, an already-established forbidden connection, public
HTTPS versus HTTP, host-public-IP denial, and successful/denied DNAT paths.
It also proves replacing this table does not remove an unrelated fixture table.
Namespaces and interfaces disappear when fixture processes exit; the test never
flushes, replaces or lists the host ruleset. A failed test is not permission to
test on the host instead.

## Reviewed installation sequence

1. Inventory current numeric UIDs, supplementary groups, routes, addresses,
   resolver configuration, all published/private DB tuples and actual Docker
   DNAT targets. Confirm the chosen Node runtime and immutable root-owned
   release directories live outside home. No app UID may hold sudo/docker,
   capabilities, writable deployment code, Docker sockets or shared secrets.
   `DynamicUser=` is not suitable for these fixed numeric rules.
2. Reserve dedicated UIDs and stage green systemd units without starting public
   traffic. Moving live Airsoft/Vocabulum containers requires their own tested
   side-by-side host releases. Until their container predecessors and other
   privileged legacy runtimes are drained/retired, this host OUTPUT policy alone
   is not a completed isolation boundary.
3. Generate rules from the reviewed root-controlled JSON into a reviewed
   root-owned file outside web roots. The generator itself requires no root:

   ```sh
   node server/accounts/deploy/uid-network-boundary.mjs reviewed-uid-config.json
   ```

   Initial output uses `create table`, so an existing table causes a fail-closed
   error rather than appending duplicate rules. For a reviewed update only,
   `--replace` emits `delete table inet developed_uid_boundary` and its replacement
   in one nft transaction. It fails if that exact table is absent. Never use
   `flush ruleset`, change Docker's firewall backend, or delete another table.
4. With an explicit production change window/authorization, root first runs
   `nft --check --file /etc/nftables.d/developed-uid-boundary.nft`, then applies that
   exact reviewed file with `nft --file`. Preserve the previous exact table file
   for an atomic scoped rollback. Persist only this dedicated table through the
   host's reviewed boot mechanism; do not enable a distro nftables unit whose
   bundled startup/shutdown actions flush the entire ruleset.
   The installed scoped loader performs these checks and transactions. Use
   `sudo systemctl reload developed-uid-boundary.service` after reviewing and
   backing up an exact policy update, not a global nftables restart. Root can
   run `load-uid-boundary.mjs --check` first; it does not apply rules.
5. Rules must be active before any app unit or private3141 provider is reachable.
   Order the dedicated firewall loader before those units and fail their startup
   if installation fails. Reboots, restart, resolver changes, Docker IP changes,
   IPv6 enablement and pooler recreation all need regression tests. A changed DB
   target must fail closed until both pre/post NAT tuples are reviewed.
6. Start the scoped green host processes and verify positive and negative probes
   from **their actual UIDs**, then switch only their proxy routes gracefully.
   Existing old services remain serving during staging; don't claim zero
   downtime until real readiness, drain and route-switch checks pass. The
   namespace proof establishes mechanics, not production route correctness.
7. Roll back an app to a security-compatible release while retaining the UID
   boundary. If firewall correction is required, atomically replace only this
   table with its previous known-good version. Removing isolation or reopening
   a legacy administrator path is a security rollback requiring explicit review.

## Limits that remain outside this rule generator

- No defense against root, CAP_NET_ADMIN, a Docker-member operator, compromised
  Caddy/central, or a process already holding a privileged connected socket.
  Keep privileged operators separate from Internet-facing app runtimes.
- Socket UID filtering is for host-originated IPv4/IPv6 traffic. It does not
  constrain container forwarding, Unix sockets, inherited file descriptors,
  filesystem writes, or allowed application-protocol actions. Enforce the
  systemd restrictions and file permissions in the companion runbook as well.
- Do not give app UIDs network namespaces, raw sockets, alternate tunnels,
  proxy relays or descriptor-passing control APIs. No new firewall exemptions
  for unrelated applications/workers are implicitly authorized here.
- Public HTTPS egress remains intentionally broad for app integrations. Local
  control plane services must not be reachable through an alternate public
  domain or cloud tunnel with weaker authorization.

Mechanism references: [nftables manual](https://netfilter.org/projects/nftables/manpage.html),
[hook priorities](https://wiki.nftables.org/wiki-nftables/index.php/Netfilter_hooks),
[connection-tracking direction](https://wiki.iptables.org/wiki-nftables/index.php/Matching_connection_tracking_stateful_metainformation),
[route lookup expressions](https://wiki.netfilter.org/wiki-nftables/index.php/Routing_information).
The namespace test was exercised with nftables1.0.9; target-host verification
remains required for its actual rules, routes and services.
