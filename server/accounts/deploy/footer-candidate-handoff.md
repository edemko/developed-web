# Vocabulum/Airsoft footer follow-up — candidates qualified, routes unchanged

This is a UI-only follow-up to the central-auth runtime cutover. Both new
unrouted candidates are qualified; the exact own-UID bind additions are applied.
The old serving units, central environment files and packet policy are unchanged.
The coordinator separately opened the human portal before final candidate
qualification; this operator did not change Caddy. Route changes require their
own reviewed handoff and approval. The final observed checkpoint is below.

## Pinned source and local qualification

| App | Exact source | Qualified own-UID candidate | Current serving PID/port |
| --- | --- | --- | --- |
| Vocabulum | `5833953287ee51be6b35225e87b88dfef69d2d97` | UID985/GID979, 127.0.0.1:3171 | PID4056033 / 3161 |
| Airsoft | `1fcb452cf8bcb11505ad5250ac4d1ab55e06b57f` | UID986/GID980, 127.0.0.1:3172 | PID3542385 / 3162 |

Both source revisions were pushed using `[no deploy]`. Vocabulum unit tests:
418 passed, two opt-in skipped; Airsoft:22 passed, two opt-in skipped. Focused
ESLint checks passed. The logo addition's two footer tests also passed; the
approved local DevelopED wordmark is byte-identical to the existing Airsoft and
central assets (SHA256 `fbb0413f8291241a3d82a353ddb96b96932bb39ea92f7e568288e5dc36a591d3`).

Disposable build root: `/home/openclaw/ecosystem-footer-build-iZcGAh`.
`build.mjs` exports only pinned tracked source, excludes every `.env*`, verifies
the unchanged source/dependency locks and reuses the existing developer dependency
trees. TypeScript and webpack production builds passed for both apps, sequentially
under `/home/openclaw/.cache/developed-ecosystem-build.lock`, a1536MiB memory limit,
zero swap and1024MiB Node heap, with one build worker. Vocabulum received synthetic
server configuration only. Airsoft received only four existing public build
settings through a pipe; its public key's role was checked as `anon`. No private
runtime credential was supplied to either build or printed.

`browser.mjs` starts only disposable developer-UID fixtures with synthetic server
credentials. Five compiled pages passed: Vocabulum `/login` and `/`, Airsoft
`/sk/login`, `/cs/login`, `/uk/login`. Each rendered200 with no visible password
field and exactly one report/support/logo link. Report clicks from a synthetic
query+fragment page produced only the fixed central app-slug/platform URL with
no Referer. All external requests were intercepted/aborted; no live sign-in,
registration, mail, product write or end-to-end SSO acceptance is claimed.
The initial Vocabulum fixture used an invalid HTTP trusted origin and failed;
correcting that fixture to the application's required HTTPS origin passed without
changing application code.

Local artifact preparation retained39 old Vocabulum and47 old Airsoft static
files absent from the new build; every shared path had identical bytes. The
resulting browser-static inventories have159 and122 files, respectively. No
synthetic server-secret/issuer marker appeared in browser JavaScript. Each
`*-artifact-manifest.json` records the selected server/static/public payload
inventory and critical build/config files; it is not a complete installed-release
or dependency manifest. Installation still requires complete final-release
ownership/file hashing, including all Next runtime metadata and reused modules.

## Source-only preparation tool

`prepare-footer-candidates.mjs --stage` requires a separate coordinator GO and an
immutable root installation. It only prepares protected proposed files under
`/var/backups/developed-footer-candidates-20260920`; it does not install units,
apply a bind map, change packet rules, start services or touch Caddy. There is no
live-apply/start phase in this tool. Three fixture tests cover the exact bind-map
delta, preservation of existing unit content and disposable unit syntax.

The tool pins the observed old bind-config SHA256 and active serving PIDs,
checks3171/3172 free across both listener families, captures effective trusted
unit fragments and existing bind bytes, records network/Caddy hashes, and checks
the old files/PIDs again. Exclusive root0600 writes plus file/directory fsync
preserve partial evidence; do not overwrite/retry a partial stage automatically.

Exact proposed bind delta, and nothing else:

- Add3171 and3172 to `protectedPorts`.
- Add3171 only to Vocabulum UID985 `tcpLoopbackPorts` (keep3161).
- Add3172 only to Airsoft UID986 `tcpLoopbackPorts` (keep3162).

Removing those additions must reproduce every original config field. No nft
egress delta is needed: Caddy/root already reach loopback, replies are permitted,
and app-initiated sibling/private/control connections remain denied. The new
ports do not grant cross-UID or provider/database access. They were free at
read-only inventory; recheck immediately before any installation/start.

## Later reviewed handoff — not authorized by this document

1. Install exact new immutable releases, verifying source/build manifests and
   dependency-lock equality. Keep the old releases and non-conflicting old
   `.next/static` assets for in-flight pages; reject a same-path/different-byte
   collision. Use separate new cache directories/symlinks:
   `/var/cache/developed-vocabulum-footer` and
   `/var/cache/developed-airsoft-footer`; never share the running caches.
2. Review and apply only the exact bind delta with protected recovery copies;
   prove existing owners retain their listeners and unrelated UIDs cannot bind
   the new ports. No change to the nft packet policy is part of this handoff.
3. Install proposed `developed-{vocabulum,airsoft}-footer.service` units without
   enabling them. Each includes all current effective unit fragments (including
   the central-runtime startup guard, required boundary services and sandbox),
   followed only by fixed release/listener/cache overrides. Reuse the exact
   existing central EnvironmentFile; `Environment=PORT=3171/3172` adds no
   credential copy, but EnvironmentFile values take precedence over Environment
   assignments. The fixed CLI `--hostname 127.0.0.1 --port ...` is authoritative
   for the listener. Do not claim the process's PORT environment differs until
   it is checked; no secret-bearing EnvironmentFile needs modification.
4. With separate start approval, start each unrouted candidate, verify actual
   UID/GID, central-only credentials, isolated cache, denied private peers and
   unauthorized binds, no unexpected listener, UI/footer/registration behavior,
   and unchanged serving PIDs/health. Do not send real auth/mail/product requests.
5. After gateway/Odonto/portal readiness, capture the then-current Caddy config;
   replace only Voc3161→3171 and Air3162→3172, validate full-config equivalence for
   every unrelated route, and gracefully reload. Verify canonical HTTP and real
   browser footer outcomes before draining/stopping the old exact units.
6. Keep the already-enforcing old releases/units as recovery targets. Do not
   reopen legacy Docker/Vercel identity or remove old caches/data. Only enable
   the new units and retire old boot selections after the successful handoff.

A bind-update response or route reload with ambiguous status requires read-only
reconciliation, not an automatic retry or broad rollback. Neither staging nor
this footer change authorizes new users, registration, mail or data mutations.

## Observed protected preparation

Preparation commit `6c9b00f` was pushed with `[no deploy]` and installed under
`/opt/developed-operators/footer-candidates-6c9b00f`. Its one approved `--stage`
completed. All five proposed/recovery files are root:root0600, nlink1, in the
root0700 backup directory; both full generated units pass systemd syntax checks.
No live unit, environment, bind map, packet rule or Caddy file was changed.
The before/proposed bind hashes are `dce4e0c6…` / `aebabfc8…`; packet config
`fd2d25e6…` and Caddy `501bbc47…` were unchanged. These shortened hashes are
labels only; the protected proof and operators use complete hashes.

## Candidate operator — separate approval per phase

`apply-footer-candidates.mjs` proposes distinct one-shot `--install <slug>`,
`--bind`, and `--start <slug>` phases. It must not be run until reviewed and
explicitly approved. It has no Caddy, enable, old-unit stop/restart or data-delete
phase. Protected attempt receipts precede writes; partial failure stops without
retry/automatic rollback. New root modules include the independent
`footer-candidate-probe.mjs`, `footer-bind-check.mjs` and reviewed preparation module.

Complete runtime payload manifests now include all `.next` files except mutable
cache, plus public/i18n/package/config files; dependency manifests cover every
existing immutable dependency file and internal symlink. Exact pinned inventories:

| App | Payload files/hash | Dependency entries/hash |
| --- | --- | --- |
| Vocabulum | 528 / `d37f24c6013f7aa7739b1e2b72e309781396d5244979783907ba84dc4b09c463` | 45554 / `093b1105788080d95eb864dffa30036b0aab53f038fae3a6fa2d38fb2bf3f487` |
| Airsoft | 370 / `f100ad5c076f9695605b1ea2d17ca696c18736c2f5151ddc54b2de6423345abb` | 29688 / `2a038e466c99903732e9d4cdbd0a84ecd811dec3bbf12da434b9c96ff2dc9330` |

The installer checks the exact manifests before creating release paths, compares
every copied byte, hardlinks only unchanged root-owned dependency files, rejects
escaping dependency symlinks, and emits an installed manifest with an explicit
separate-cache exception. Startup rechecks those files, unit bytes and guard hash.
The current prestart guard was independently inspected: it checks slug→UID,
central mode and absence of legacy/service-role/mail credentials, not any old
unit/release/port; the installer also rejects unexpected old-port/unit pins.

Start qualification checks the actual UID/GID and the candidate mount
namespace: protected-file denials, writable own cache, rejected3199 bind and
rejected connections to8000/3141/5432/2019/9000. It then checks the unrouted login
page/footer, exactly one PID-owned IPv4-loopback listener, zero restarts, unchanged
old serving PIDs, and unchanged Caddy/packet policy. The current implementation
waits for HTTP readiness before checking process identity and mount isolation.

### Socket hardening and exact bind acceptance

The original staged proof and unit files remain immutable evidence. Installation
derives a new unit by appending nonoptional `InaccessiblePaths=/run/tailscale`
and `After=tailscaled.service`, with no Wants/Requires daemon dependency. The
separate `*-hardened.service` and `*-hardened-unit.json` receipt record original
and derived hashes; neither staging nor the old proof is overwritten. Existing
masks/guards/hardening remain additive. Actual candidate mount-namespace probing
requires `/run/tailscale` to be a root:root mode000 directory and an actual Unix
connect attempt to fail EACCES/EPERM; ENOENT or a Docker read-access test is not
accepted as Tailscale denial. No LocalAPI payload is sent.

Before and after the bind-map replacement, `footer-bind-check.mjs` creates only
new disconnected network namespaces, checks they differ from the host, brings
up only their own loopback, then drops to each retained protected UID/GID. The
host's cgroup bind policy still applies. Every original owner's fixed IPv4
loopback port must bind successfully in that empty namespace, avoiding collisions
with live host listeners. Before replacement all protected UIDs must be denied
3171/3172; afterward only UID985 may bind3171 and UID9863172. All other protected
UIDs are denied both, and IPv6 binds of the new ports remain denied for everyone.
Each transient listener closes immediately. This complements actual serving-PID
preservation and subsequent new candidate PID/listener checks; it neither changes
host packet rules nor opens a new host listener during the permission test.

All mount/network-namespace fixtures, transient jobs, installs, binds and starts
waited for the socket coordinator's quiet-window release. Ten source tests pass,
including additive unit derivation, mode000 socket-directory requirements and
the pre/post bind matrix.

## Observed unrouted qualification — 2026-09-20

The reviewed phases completed with exclusive protected receipts under
`/var/backups/developed-footer-candidates-20260920`. The initial Vocabulum install
stopped after writing the complete artifact because the unit reported `static`,
not `disabled`. An explicitly reviewed receipt-only reconciliation verified the
complete installation; the install was not replayed or its staged bytes amended.
Airsoft installation then completed normally. These units have no `[Install]`
section: `static` is a valid unenabled candidate, not evidence of boot selection.
After a successful future route handoff, boot selection requires an exact trusted
`multi-user.target.wants` symlink; do not claim `systemctl enable` worked.

The first disconnected bind fixture stopped before any bind attempt receipt or
map change because its dropped UID could not read the host namespace identity.
Commit `cf43d5b` moved that identity read into the root parent, which pins distinct
host/isolated identities; the child checks only its own readable namespace.
The corrected standalone before-fixture passed, followed by the one-shot bind
phase and both permission matrices. Current bind-config SHA256 is
`aebabfc82c832115be917cb530f82e1bc089666818d5c5241125d9052db9c4b9`.
No host sysctl or packet-rule change was made.

The initial Vocabulum start created PID723605 but stopped without a completion
receipt or a recorded failure phase. Its cause remains **unproven**. Commit
`fc0e68f` added fixed nonsecret failure labels, readiness-first qualification,
and a receipt-only `--verify-start-voc` mode pinned to that exact existing PID.
The immutable bundle `/opt/developed-operators/footer-apply-fc0e68f` passed that
verification once without starting/restarting or changing any unit. The subsequent
normal Airsoft start completed once with the same qualification checks.

| Candidate | PID | UID/GID | Only TCP listener | Restarts / boot state |
| --- | --- | --- | --- | --- |
| Vocabulum | 723605 | 985/979 | 127.0.0.1:3171 | 0 / static, unenabled |
| Airsoft | 767388 | 986/980 | 127.0.0.1:3172 | 0 / static, unenabled |

Both `*-started.json` receipts include the pinned revision/PID. Full installed
artifact and guard checks, actual UID/GID, own-cache access, protected-file and
private-peer denials, the mandatory mode000 Tailscale directory and denied Unix
connect, HTTP200 footer readiness and exact PID-owned listener checks passed.
The Vocabulum receipt records its reconciliation and unproven initial cause.
Old serving PIDs4056033 and3542385 remained active/enabled with zero restarts.
The final Caddy SHA256 remained
`3f49a9a881a51683a787d103d191911bb9bb842c058116fb2d846b04751b8a9c`;
packet policy and both protected EnvironmentFiles were unchanged from each phase's
checkpoint. No route reload, boot-selection change, old-unit stop, artifact/cache
deletion, real sign-in or product-data mutation was performed by these phases.

### Read-only boot/drain review; execution still pending

Each old green unit has exactly one boot link across `/etc/systemd/system` and
`/run/systemd/system`: its root-owned `multi-user.target.wants` link targets the
exact `/etc/systemd/system/developed-<slug>-green.service`. Both old units have
empty RequiredBy/PartOf/TriggeredBy; both new units also have empty WantedBy.
The installed `systemctl` supports `add-wants`, independently of `[Install]`.
After separately approved route and browser acceptance, capture the current
links/fragments/PIDs, add only the two footer units to `multi-user.target` using
`systemctl add-wants` without `--now` or `--force`, and verify each exact trusted
symlink plus unchanged running PIDs. No unit rewrite is needed.

Before disabling/stopping either exact old green unit, require both IPv4/IPv6
socket inventories for its old port3161/3162 to contain only LISTEN/TIME_WAIT;
drain other accepted connections first. At this review both ports showed only
LISTEN. Disable and stop one old unit at a time, keeping every old artifact,
cache and environment for recovery. Their stop behavior is control-group SIGTERM
with a60-second timeout and no ExecStop; no reverse stop-propagation dependency
was present. Require PID0/ControlPID0, no old listener, unchanged new PIDs and
public health afterward. Any unexpected failed state requires read-only
reconciliation, not a reset-failed, restart, deletion or broadened retry.
