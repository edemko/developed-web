# Durable central-mode runtime selection

Installed from reviewed `f29d5b3` on 2026-09-20. The private app candidates remain
unrouted; this checkpoint does not activate public SSO or boot-enable them.

The four instance templates (Mega, ScreenTime, KešTrek, Otázkomat) and two
standalone units (Airsoft, Vocabulum) now have root-owned0644
`central-production.conf` drop-ins. Their exact targets and generated contents
are in `install-central-runtime-guards.mjs`. Both existing and future instances
select `/etc/developed-accounts/host-env-staging/<slug>.central.env`, never the
retained legacy `/etc/developed-apps/*.env`. The directory name is historical;
these protected artifacts are the selected runtime configuration. Preserve their
keys and paired backups during future releases.

An additive ExecStartPre runs the immutable, nonsecret
`/opt/developed-control/central-runtime-v1/assert-central-runtime.mjs` under the
product UID. It requires the exact isolated UID and central=true, matching
ScreenTime's browser flag, and no nonempty legacy shared administrator/signing/
Mailjet variables. It performs no network or file writes and prints no secrets.
This is a configuration guard, not proof of a new release's implementation or
browser bundle. Future artifacts still require scoped tests and review.

Three tests passed and an independent agent reviewed the source. Installation
created only six new drop-ins and reloaded systemd definitions. No environment
file, existing drop-in, running process, route, boot state or private key changed.
All six effective units select their exact central artifact and contain the new
pre-start gate. Manual checks inside each actual service mount namespace as its
real UID passed. PIDs and NRestarts=0 remained unchanged.

Do not remove these guards or restore legacy environments to work around a
failed start. Fix the reviewed central release/configuration. Retained
instance-specific `central-private.conf` files currently select the same artifacts;
they are redundant for selection, not permission to delete whole drop-in folders.
Preserve the independent bind/network boundary drop-ins.
