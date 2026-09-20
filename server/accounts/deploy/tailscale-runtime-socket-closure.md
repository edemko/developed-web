# No-restart Tailscale socket closure

Source preparation is not installation. No API restart, environment change,
Tailscale RPC or human SSO activation is part of this operator.

## Fixed scope and mechanism

`seal-tailscale-runtime-sockets.mjs` permits only the four current Mega,
ScreenTime, KešTrek and Otázkomat API instances, Ke notifications, My Clinic,
Mega import front, and inactive future Mega cleanup. The approved extension adds
central API's live directory overlay, the inactive mail worker, and already
directory-masked Airsoft/Vocabulum. It adds twelve root-owned template/standalone
drop-ins and changes eight current namespaces, preserving the two existing
directory masks. It does not
edit original units, startup guards, releases, job schedules or environments.
Mega front needs its own control listener, not Tailscale. JASOM web/worker and
the isolated importer already mask the directory. The intentional status broker
and dedicated egress daemon are not mutation targets.

Existing `/run` mounts are slave+shared. A blind bind mount may propagate.
The operator requires the longest covering mount to be exactly `/run`, rejects
stacked parents/child masks, checks root-owned mode000 inaccessible source,
and pins all cgroup members' UID/GID/start time/cgroup and mount namespaces.
Unrelated processes sharing a target namespace fail preflight. Network namespaces
must match the host because UNIX-FD inventory uses host `ss` and `/proc/net/unix`.
Only existing journal output, same-cgroup anonymous socketpairs and Mega front's
own control listener qualify; any other UNIX socket fails closed.

After approval, the operator pins the namespace descriptor, enters only that
namespace, makes **only `/run` nonrecursively private**, verifies that state,
then binds existing root:root mode000 `/run/systemd/inaccessible/dir` over exact
`/run/tailscale`. No host mount, unmount, recursive remount or restart occurs.
Ordinary file changes under `/run` remain visible; future host **submount
propagation** under `/run` stops for that service. These fixed apps use injected
environments, not dynamic `/run` mount dependencies. The directory mask also
blocks socket unlink/recreation, unlike an exact file mask.

The durable drop-in is additive and deliberately nonoptional:

```ini
[Unit]
After=tailscaled.service
[Service]
InaccessiblePaths=/run/tailscale
```

It does not start/require Tailscale. When both have startup jobs it orders
the app after daemon startup; an absent directory fails application startup
closed rather than silently skipping the mask. Existing restrictions remain.

## Coordinator procedure

1. Review/commit exact source with `[no deploy]`, then install only the operator
   root-owned and non-writable under a new immutable `/opt/developed-control/`
   directory. No root package installation. Use pinned Node22.
2. `--inspect` is read-only. After separate approval, `--stage` creates exclusive
   root0700 `/var/backups/developed-tailscale-socket-seal-20260920/` and root0600
   `before.json`. It records operator/runtime/mount/socket metadata, never envs.
3. `--apply` checks that complete snapshot, writes an exclusive attempt record,
   installs twelve root0644 drop-ins and calls only `systemctl daemon-reload`.
   It does not start cleanup/mail, alter timers, or restart any API/worker.
4. Each namespace mask must yield actual UID/GID socket EACCES, preserve service
   PID/restart count and preserve host mount table/socket. Not-yet-masked target
   mount tables remain byte-identical. Per-target and final private proof files
   record completion. Repeat approved product health/denial checks afterward.
5. A failure preserves completed masks/drop-ins and the attempt proof. Stop and
   reconcile partial state. No automatic unmask, retry, rollback or API restart.

Do not restart Tailscale or replace its parent runtime directory during this
operation. FD inventories before/after are not an atomic freeze of an adversarial
process; unexpected existing connections/process changes block qualification.

## Classification and tests

Installed Tailscale is 1.102.4. Its [Unix actor permission code](https://github.com/tailscale/tailscale/blob/v1.102.4/ipn/ipnserver/server.go)
permits reads for Unix peers and separately determines write permission.
The [LocalAPI dispatcher and `serveDial`](https://github.com/tailscale/tailscale/blob/v1.102.4/ipn/localapi/localapi.go)
have no `PermitWrite` gate for dial upgrades. Daemon-mediated dialing is limited
to Tailscale routes; non-Tailscale destinations receive `Dial-Self` instructions
to preserve the caller's UID. Thus socket reachability is not harmless merely
because the app is not an operator. No actual dial/status body/mutating RPC was
used for this finding, and arbitrary root-network dialing is not claimed.

Run `node --test server/accounts/deploy/seal-tailscale-runtime-sockets.test.mjs`.
`TAILSCALE_SOCKET_NAMESPACE_TEST=1` additionally exercises fresh disconnected
mount/network/PID namespaces and synthetic sockets. Parent, target and peer
initially share `/run` propagation. Only target is detached/masked; parent/peer
mount tables and socket identities stay unchanged, ordinary file changes remain
visible, and recreated sockets stay denied by the directory mask. The fixture
also proves the old file mask loses denial after socket recreation (the probe
must exit1 specifically on successful connection, not a generic failure), while
a directory overlay over that existing file mask preserves denial. No host
socket is accessed, and external host mount metadata stays unchanged.

Mechanism reference: [Linux mount namespaces](https://man7.org/linux/man-pages/man7/mount_namespaces.7.html).

## Verified live checkpoint — 2026-09-20 21:01 UTC

Reviewed source commit `28b6e47609bb64cdd666b7cc440c2d77fe6984fe` was pushed with
`[no deploy]`. The exact operator was installed root-owned under
`/opt/developed-control/tailscale-socket-seal-28b6e47/`; its SHA-256 is
`31e9400448105b58fcfe96dcc49caf16f693abda16a4940a472935f8320b3d12`.
Read-only inspection passed; stage/apply then ran once successfully. Twelve
nonoptional additive drop-ins are installed. Eight live namespace directory
masks were applied, Airsoft/Vocabulum's existing masks were preserved, and
cleanup/mail remained inactive. No API/worker restart, environment change,
timer change, host mount change or Tailscale RPC occurred.

The exclusive root0700 proof directory
`/var/backups/developed-tailscale-socket-seal-20260920/` contains eleven root0600
files: before/attempt, eight target completion records, and `verified.json`.
Independent rechecks confirmed EACCES under all ten active services' exact
UID/GID and namespaces, all twelve PID/state/restart snapshots unchanged,
effective nonoptional rules, unchanged host mount-table hash and socket inode.
The coordinator independently reported all eight public sites 40/40 HTTP200
and the public scoped-data gateway 50/50 checks passing after sealing.

The intentional status broker was not changed. Human central SSO was still off
at this checkpoint; this operation proves socket closure, not user-login or
mail acceptance. Preserve masks and proofs during later product operations.
