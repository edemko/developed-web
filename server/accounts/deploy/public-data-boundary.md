# Public data denial filter — private checkpoint

At 2026-09-20 16:05 UTC, `developed-data-boundary.service` is active/enabled
as dedicated non-login UID978 on **127.0.0.1:3143**. It runs the root-owned
`/opt/developed-control/data-boundary/public-data-boundary.mjs` using the existing
immutable Node22 runtime. Its root0600 environment is
`/etc/developed-accounts/data-boundary.env` and contains **only the public anon
key**, verified equal across three existing app configurations. It has no
provider admin key, signing key, DB password or OAuth client secret.

**No public route uses this filter yet.** Do not add `public-data-routes.Caddyfile`
to live ingress until all product callers use the public anon apikey plus their
correct scoped/user bearer. Existing platform-service credentials would be
rejected. Every alternative ingress still needs closure; this private listener
is not the completed security cutover.

This is a credential-class denial filter, not a signature verifier. A syntactically
valid token with an allowlisted role may pass here and must subsequently pass
the actual upstream JWT and RLS checks. It rejects service-role credentials,
unknown classes, ambiguous paths and alternate Storage S3/vector/SigV4 paths.
Existing signed-URL capabilities remain subject to Storage's own verification.
Caddy must overwrite original-method/URI metadata as the source template does.

The persistent dedicated nft table allows UID978 to answer established incoming
requests but initiate **no** network traffic, including DNS. The frozen cgroup
bind policy allows only IPv4 loopback3143 and no explicit UDP binds. Both units
are required at service start. No systemd BPF enforcement is assumed on this
host. Fifteen dedicated UIDs are now in the bind policy; other UID permissions
are unchanged. The filter has no writable persistent state or privileged groups.

Verification:

- Nine filter/Caddy tests passed, including the opt-in **actual Caddy** test of
  spoofed original-URI/method headers; none skipped.
- Eleven UID-generator/loader tests and the disconnected IPv4/IPv6/DNAT namespace
  suite passed. Both live policy replacements passed preflight atomically.
- Actual UID978 could not connect to central/Auth/DB/DNS/public443 or IPv6 Auth;
  explicit sibling, wildcard and IPv6 fixed binds failed with kernel EPERM.
- Root and Caddy health200 succeeded; private checks returned expected204 for
  scoped-class/signed-storage examples and403 for service-role, Auth and missing
  metadata. No real data API query was made by these classification probes.
- The central account, importer and stable-front PIDs/restart counts were
  unchanged. No application, proxy, provider or database restart occurred.

Prior exact policies/generator and anon-only environment backup are retained at
`/var/backups/developed-data-boundary-initial-20260920` (root-private). They are
historical rollback evidence, not commands to overwrite future policy additions.
The filter's initial source/unit/policy change is `c4fe7a0`; no host reboot has
been tested. Keep this service private until the coordinated ingress cutover.
