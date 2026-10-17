# Additive domain monitoring — installed17 October2026

The coordinating operator applied the pinned guarded installer successfully.
Current immutable runtime: /opt/developed-control/critical-monitor-20261017-domains.
The boot-check symlink, operator wrapper and existing service drop-in select it;
timer remains active and no service restart was required. All50 health checks
passed immediately after installation. A later KešTrek client cutover required
its separate dual-issuer login-health checker update; the parent applied that
reviewed check and confirmed health passed again. This monitor update itself did
not change KešTrek application logic or disable any check.

Prepared against the JASOM-aware monitor release; preserves its routing
selection, incident state, cooldown, SMS transport, maintenance scopes and jobs.
Four new checks: private provider health, private discovery identity/endpoint
prefixes, public auth HTTPS discovery identity/endpoint prefixes, and public API
HTTPS denial of generic Auth access. No token, cookie, account query or write.
The API denial probe does not prove authenticated data access; local boundary,
Supabase container and existing app checks continue that coverage.

Required units add developed-auth-domain and domain-provider-boundary. Expected
containers add developed-auth-domain. Old green provider remains required.
Discovery/health incidents use developed-accounts scope; provider unit/container
and API boundary failures use infra. No notification or cooldown policy changes.

additive-monitor.patch is for the two canonical deploy source files. They were
already dirty with other work, so this task did not modify them. Candidate copies
are complete for review, and have the exact current JASOM fix. Apply patch only
after confirming both canonical and installed source match its recorded baseline:
host-health-check.py SHA256 7b605391272e5cc4a9270c9179a417acbe20bbf6de2e4b9dafaa4dab2441373a;
critical_service_monitor.py SHA256 89be4fe8bc045847f4b0f5f3f69d22f497dad864032d4f0140c64d3dbe5b1012.

Do not activate public auth probes until Caddy/central public cutover is healthy.
Install as a new immutable monitor release, preserve its sms_gate_v1.py sibling,
update only the operator/boot-check wrappers and monitor service drop-in using the
same existing pattern. Keep timer enabled and preserve all /var/lib/developed-health
state and credential configuration. Use --check only for read-only verification;
no live test SMS or incident-history reset. Parent owns installation/activation.

Offline tests include copied existing fixtures plus domain_monitor_test.py. The
JASOM-only fixture disables new issuer probes locally to avoid real network I/O;
the new fixture explicitly mocks issuer responses and errors.

The copied SMS fixture omits the later registration-only test because the live
monitor deliberately retains its older unchanged SMS transport; registration is
a separate service. No transport upgrade is bundled into this monitoring change.

Discovery uses the existing curl transport with5-second and64KiB bounds.
Python urllib default UA receives Cloudflare1010; curl public discovery and API
denial were independently checked successfully without changing CF protections.

## Guarded installer (parent review only)

apply-monitor-candidate.py --apply requires root and pins all3 runtime candidates,
all3 installed sources, the exact operator wrapper, service drop-in and boot-check
symlink target. It saves protected entrypoint backups and a manifest under
/var/backups/developed-domain-migration-20261017/monitor, preserves each original
file mode, installs the new immutable critical-monitor-20261017-domains release,
and atomically replaces only the boot-check symlink, operator wrapper and existing
monitor drop-in. A daemon-reload updates the next timer invocation; there is no
service restart, timer stop, SMS send, credential copy or incident-state reset.
It then runs only --check and reports sanitized success/failure counts.

A running check may complete using its original code; the following scheduled
check selects the new release. On a failed guard, inspect exact state instead of
blindly rerunning. Rollback restores only the saved wrapper/drop-in and old symlink
target, followed by daemon-reload. Keep timer enabled, leave incident history and
credentials untouched, and retain the new release for inspection.

The sibling ../domain-routes.Caddyfile contains only the live auth/api site
snippets. Merge these into current Caddy source when preserving infrastructure;
never replay an old full Caddyfile or duplicate existing host blocks.
