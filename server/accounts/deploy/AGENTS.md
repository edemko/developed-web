# Production deployment boundaries

Read `README.md`, `runtime-isolation.md`, and the affected application's own
deployment instructions before any host change. These files are not permission
to deploy: follow the user's current authorized scope.

For central API/mail releases also read `portal-upgrade-checkpoint-20260921.md`
and `central-mail-worker.md`: the API and worker have separate immutable pins,
browser-family enforcement is active, and historical SSO-off worksheets are not
current state. Never replay a completed release's baseline-pinned coordinator.

- Separate the trusted deployment/operator account from non-login runtime UIDs.
  Runtime UIDs must not receive sudo/Docker groups, control sockets, writable
  executables, sibling credentials or unrestricted Tailscale control access.
- Tailscale runtime masks must cover the directory and fail closed if missing
  at startup. Optional/file-only masks do not establish durable denial. Follow
  `tailscale-runtime-socket-closure.md`; never bind into a shared live mount
  namespace or restart APIs as an unreviewed isolation shortcut.
- Use root-owned immutable releases/runtimes outside home; only each app's
  explicit state/cache/log locations may be writable. Keep normal Git/build
  work under the developer identity. Do not run package-install scripts as root.
- Preserve current data and independent login systems for JASOM/My Clinic.
  Never silently merge their users into central identity.
- Inspect actual running code/version and writable paths. A checkout can be
  newer than its process. Do not deploy unrelated dirty work without approval.
- Stage/test side-by-side, validate complete proxy config, switch only affected
  routes gracefully, drain requests and single-owner jobs before retiring old
  services. No bulk restarts, `docker compose down`, or shared DB restores.
- Do not apply a generic host firewall or flush rulesets. The UID generator
  owns one named table and needs actual numeric identities/routes and positive
  and negative probes. Worker proxy exceptions need separate relay review.
- No secrets in commands, logs, Git, build archives or docs. Credential inventory
  reports names/permissions only. Do not print full env, process argv, Docker
  inspect, or credential-bearing service definitions.
- Central SSO stays off until **all** documented security cutover gates pass.
  A source commit, fixture pass, new UID or staged unit is not activation.
- Update README/application runbooks with exact live unit/port/revision and
  pending work after changes. Record verification failures and rollback targets.
