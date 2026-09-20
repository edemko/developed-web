# Dedicated UID fixed-listener bind boundary

Status: reviewed-source candidate and disposable real-kernel proof, 2026-09-20.
**Not deployed.** No production cgroup attachment, BPF pin, mount, systemd change,
host firewall change, package install, kernel upgrade or SSO activation is made
by the fixture. This supplements the separate UID OUTPUT policy; it does not
replace egress authorization, scoped database roles or filesystem isolation.

## Why this is separate from systemd's unit directives

The VPS has Linux6.8 with `CONFIG_BPF_SYSCALL=y` and `CONFIG_CGROUP_BPF=y`, but
systemd255 was built without its BPF framework. Accepted SocketBindAllow/Deny
configuration did not prevent an actual dedicated UID from binding an unapproved
port. IPAddressAllow/Deny directives therefore are not enforcement evidence either.
The syscall helper uses installed GCC and Linux UAPI headers, with no libbpf,
clang, new packages or systemd BPF framework dependency.

The guard covers listed dedicated UIDs only. Their explicit IPv4 binds permit
TCP on **127.0.0.1 and that UID's exact configured ports**. Other addresses, TCP
port0, protocols, fixed UDP ports and every explicit IPv6 bind are denied. Optional
`udpEphemeral:true` permits IPv4 UDP port0 on wildcard/127.0.0.1 for a reviewed
resolver/library requirement. Implicit TCP/UDP outgoing connections retain normal
kernel source-port selection. DNS destination authorization remains the nft policy's
job. Unlisted UIDs are unaffected; root, UID1000 and nobody cannot be listed.
Dedicated runtime UIDs must have identical real/effective identities, no privilege
to change UID, no writable cgroup delegation, no privileged inherited sockets,
no CAP_BPF/NET_ADMIN/SYS_ADMIN and no descriptor-passing privileged broker.

### Exact security claim and autobind limitation

The goal is preventing one dedicated runtime from impersonating a sibling's
**fixed app/control listener**, including while the owner restarts. It is not a
claim that every unauthorized `listen()` call fails. Linux `listen()` on an
unbound TCP socket bypasses bind hooks and creates a wildcard ephemeral listener.
This occurs for both IPv4 and IPv6. Kernel `post_bind` hooks do not fix it.

All protected app/control ports must be below `ip_local_port_range`'s minimum.
The current host range is32768–60999; inventoried fixed ports3140/3141/3143/316x,
8787,1088/1089,18088/18091 are below it. `protectedPorts` must inventory **every**
fixed impersonation target, even one owned by an unlisted trusted component.
Every allowed per-UID port must be in that inventory. The wrapper and native
backend independently reject allowed ports within/above the ephemeral range;
the wrapper also checks the complete protected-port inventory.

Linux's per-socket IP_LOCAL_PORT_RANGE can only narrow the global range; bounds
outside it are ignored. The fixture verifies attempted3191–3192 overrides still
autobind inside32768–60999 for both families. Apps must lack NET_ADMIN and have
`ProtectKernelTunables=yes`; no delegated network/user namespaces may let them
modify the host range. An operator changing the global range must revalidate this
invariant **before** the change. Startup validation cannot retroactively prevent
a privileged operator's later sysctl change. Ephemeral wildcard listeners remain
possible and must not be described as blocked. If that broader prohibition becomes
a requirement, use a reviewed private network namespace/Unix-socket design with
explicit egress routing and a coordinated cutover. No zero-outage claim follows.

The BPF LSM is compiled but not active in this host's LSM list; this implementation
does not require enabling it, changing boot configuration or rebooting.

## Operator configuration and lifecycle

Example only; not a production identity/port allocation:

```json
{
  "version": 1,
  "protectedPorts": [3140, 3141, 3161, 18088],
  "apps": [
    { "name": "central", "uid": 61041, "tcpLoopbackPorts": [3140], "udpEphemeral": false },
    { "name": "product", "uid": 61042, "tcpLoopbackPorts": [3161], "udpEphemeral": true },
    { "name": "worker", "uid": 61043, "tcpLoopbackPorts": [], "udpEphemeral": false }
  ]
}
```

Unknown fields, duplicate identities/names/ports, shared per-UID listener ports,
missing protected-port inventory and oversized policies fail validation. Limits
are64 UIDs and16 ports per UID. Empty port arrays explicitly deny all fixed binds.
Never remove a retired UID's entry while processes or recycled identities could
still exist: the native replacement refuses to remove existing protected UIDs.

Root-controlled deployment paths, if separately approved:

- `/etc/developed-accounts/bind-boundary.json`: reviewed policy.
- `/opt/developed-control/network/bind-boundary.mjs` and
  `bind-boundary-operator`: wrapper and GCC-built executable.
- `/sys/fs/bpf/developed_bind_boundary/{policy,bind4,bind6}`: root-only pins on
  the **already mounted** bpffs. The helper never mounts anything.
- `bind-boundary.service`: candidate boot unit; not installed by source creation.

The wrapper verifies root ownership/non-writability of itself, configuration,
Node executable, backend and every ancestor. Compile as the trusted developer,
then install reviewed bytes as root; do not execute package/build scripts as root.
Run `bind-boundary.mjs --check` first: this validates and verifier-loads both
programs but performs no attachment/pinning. `--apply` installs initially or
updates an existing policy. Do not run `--apply` from a writable checkout.

Initial installation attaches IPv4 and IPv6 guards at the cgroup-v2 root using
`BPF_F_ALLOW_MULTI`, leaving all unrelated programs in place. It does not restart
or move existing services. Legacy BPF_PROG_ATTACH references and root-only pins
retain programs/maps after the loader exits; no long-running privileged daemon
or app BPF capability is needed. Initial setup is not atomic across two hook
types: keep protected services stopped/unexposed until both attachments pass
verification. If IPv6 attachment fails, the helper attempts to detach only its
new IPv4 attachment, reports failure and leaves pins for operator inspection.
Partial installation never silently overwrites/removes pins or other programs.

Both guards reference one outer ARRAY_OF_MAPS entry. A replacement constructs and
freezes a complete inner UID hash, confirms both pinned programs are still attached
to the exact root cgroup and use that outer map, checks that no UID was removed,
then swaps the single outer entry. Each bind observes one complete old/new policy;
there is no detach/re-attach gap or partial per-UID mutation. A policy rollback is
the same atomic operation with a reviewed previous configuration, retaining any
new UID entries with empty port arrays. Program upgrades are **not** policy updates
and need their own reviewed lifecycle; this helper does not replace program code.

Order every affected app `Requires=`/`After=bind-boundary.service` as well as the
existing nft boundary. A failed boot installation must prevent those apps from
starting. Stopping the loader deliberately does not remove protection. Kernel
objects do not survive reboot, so boot ordering is mandatory. Root can remove
protection; protection from trusted root/operator compromise is not claimed.

Existing unauthorized bound/listening descriptors are not revoked by a bind hook.
Inspect actual socket ownership, retire privileged legacy processes and test new
bind attempts from each actual runtime UID before claiming production coverage.
The remaining UID1000 importer/legacy apps are outside this policy by design and
remain cutover blockers until migrated/retired. Central SSO must remain off until
the complete shared cutover gates pass.

## Tests and actual evidence

From repository root, compile binaries into a fresh developer-owned temporary
directory (example paths below must be replaced with your exact temporary path):

```sh
gcc -std=c11 -O2 -Wall -Wextra -Werror server/accounts/deploy/bind-boundary-fixture.c -o /tmp/your-private-dir/bind-fixture
gcc -std=c11 -O2 -Wall -Wextra -Werror server/accounts/deploy/bind-boundary-operator.c -o /tmp/your-private-dir/bind-operator
node --test server/accounts/deploy/bind-boundary.test.mjs
sudo /tmp/your-private-dir/bind-fixture --run-disposable-fixture
```

The fixture creates a disconnected network namespace and one exact root-owned
`/sys/fs/cgroup/developed-bind-fixture-<pid>` cgroup and its disposable descendant.
Only disposable children enter the descendant, proving ancestor inheritance.
An unrelated permissive program remains attached alongside the guard, proving
multi-program composition does not override denials. No existing service/process
moves, no root-cgroup attachment, no BPF pin and
no mount occurs. Numeric test UIDs61041/61042 are dropped without creating accounts.
Both guard programs use the same builder as the operator. Test children receive
no policy/program/cgroup FDs. Both empty fixture cgroups are removed afterward.

Observed passing on this kernel: allowed fixed loopback bind, forbidden fixed
port, wildcard/other-loopback, TCP0, explicit IPv6 and fixed UDP denial; optional
UDP0; immutable frozen inner maps; unlisted UID continuity; inherited denial
through a descendant cgroup and after fork; SO_REUSEPORT does not
bypass the bind guard; IPv4/IPv6 autobind remains in the global range even with a
low per-socket range override; implicit outgoing UDP/TCP; atomic replacement
revokes the former allowed port, permits the new port and retains IPv6 denial.
Production root attachment/pins and boot/reboot behavior still require separate
review and acceptance. The fixture is mechanism evidence, not production status.

Primary mechanism references:
[Linux6.8 bind/listen paths](https://github.com/torvalds/linux/blob/v6.8/net/ipv4/af_inet.c),
[port allocation](https://github.com/torvalds/linux/blob/v6.8/net/ipv4/inet_connection_sock.c),
[cgroup BPF attachment/lifetime](https://github.com/torvalds/linux/blob/v6.8/kernel/bpf/cgroup.c),
[global ephemeral range](https://www.kernel.org/doc/html/v6.15/networking/ip-sysctl.html),
[per-socket range](https://man7.org/linux/man-pages/man2/IP_LOCAL_PORT_RANGE.2const.html).
