# sam security remediation — 14 October 2026

Reviewed `/home/openclaw/Downloads/sam-security-audit-2026-10-14.md` against
the live host, then applied the bounded host repairs below. This is not a
penetration test or a claim that every application is vulnerability-free.
No credential values are included. Protected rollback files and restore-test
evidence are under `/var/backups/sam-security-20261014` (root-only).

## Finding disposition

| Finding | Result |
| --- | --- |
| F1: root-capable public webhook | Fixed live: dedicated UID976/GID970, sandbox, no sudo/Docker/operator-home access, restricted egress and signed push rules. |
| F2: public SSH/Mosh | Preserved pending confirmation of Tailscale-only access and a working recovery console. Key-only login, no root SSH, firewall and both Fail2ban jails remain active. |
| F3: duplicate logrotate entry | Fixed live in the shared `openclaw-logs` rule; no project-specific rule changed. Debug validation and normal rotation succeed. |
| F4: mail-worker guard refusal | Fixed live: stale direct-container database address replaced with the validated session-pooler route. Post-reboot recovery also adds a bounded API-readiness wait before the unchanged full guard; sole worker active, outbox pending0/failed0. |
| F5: kernel packages | Reboot confirmed: running `6.8.0-147-generic`, new boot ID, no reboot-required marker. Containerd.io2.4.2 is downloaded but not installed, pending coordinated container maintenance. |
| F6: application protection | Central checks and tests passed. After explicit approval, dependency fixes were published and deployed to both KešTrek and Otázkomat APIs; both serving production dependency audits now report zero findings. |
| F7: backup recovery | Expanded missing coverage, created remote snapshots, verified integrity, restored both database dumps into isolated containers and matched snapshot row counts. Full replacement-host reconstruction/PITR and independent credential custody remain unverified. |
| F8: monitoring | Recurring fifteen-minute health/backup/disk checks and ntfy reporting installed. On 15 October, added one-minute critical production SMS checks with development maintenance windows and rate limits; the single approved SMS test was delivered and owner-confirmed. All 44 health probes pass. Independent off-host uptime coverage remains outstanding. |

## Webhook and tunnel isolation

`webhook.service` now runs as `developed-webhook` (976:970), listening only on
127.0.0.1:9000. `/etc/webhook.conf` remains root-owned, mode0640, with only its
dedicated group able to read it. The existing HMAC secret was preserved.
Rules require POST, a valid SHA256 HMAC, `push`, the exact repository and main
branch. No request arguments or environment values are passed to the command.

The root-owned `/usr/local/bin/deploy-developed-web` fetches the public repository
without operator credentials into `/var/lib/developed-webhook/source.git` and
publishes only the existing curated static allowlist after `check-publication`.
It cannot build or execute repository code. Its writable destinations are its
private state/temp and `/var/www/developed.sk`; no account backend or repository
is a web root. The shared checkout is never fetched or reset by this service.

`marketing-webhook.conf` records the installed systemd sandbox. Namespace tests
denied account credentials, developer home, backups, Docker, D-Bus, Tailscale,
sudo and writes to executable/configuration paths. The persistent UID boundary
allows only DNS and public HTTPS egress, plus replies to incoming requests;
private database/provider/Caddy-admin/Tailscale connection probes were denied.
An isolated publication and a valid signed hook passed. Unsigned, wrong-branch,
wrong-repository and wrong-event requests returned403; GET returned405. Public
unsigned requests also returned403. The reviewed marketing bytes were unchanged.

Both Cloudflare tunnels also moved off privileged operator/root identities:

| Unit | Identity | Credential transport |
| --- | --- | --- |
| `cloudflared.service` | `developed-tunnel-edge` | systemd `LoadCredential` + `--token-file` |
| `cloudflared-sam-apps.service` | `developed-tunnel-apps` | systemd credentials for config and tunnel JSON |

The root tunnel previously had its token in a world-readable service definition
and process arguments. It is now in root0600 `/etc/developed-tunnels/edge.token`,
under a root0700 directory. Original secret-bearing unit backups are root0600
inside the protected rollback directory. Tokens are absent from the new unit
definitions and command lines. Tunnel tokens were not rotated; prior local
credential exposure is not proof of compromise, but Cloudflare-side rotation
can be coordinated separately. Operator tunnel copies remain private.

`cloudflared-isolation.conf` records the sandbox, with no capabilities, no new
privileges, protected home/filesystem and control-socket masks. Temporary
connectors were brought online before replacing each original connector, and
removed after each replacement registered four connections. Public checks passed.

## Mail and Karak II database routes

API: `/opt/developed-accounts/releases/f2c1811702e3`,
`developed-accounts.service`, loopback3140, Node24.21.0. The API's actual
environment and root-owned file agreed on loopback5432 with the session-pooler
login `developed_accounts.oc-prod`. The old worker still selected 172.18.0.12,
which no longer belonged to the database. This was the confirmed guard failure.

The worker now uses immutable launcher bundle
`/opt/developed-accounts/mail-workers/f2c1811702e3-pooler-20261014`, preserving
the implementation release `/opt/developed-accounts/releases/7cf9d4100a9a`,
all module hashes and the six-field input contract. Only its database URL changed;
encryption/Mailjet values, origin and daily cap200 were preserved. Validation
requires the exact loopback session endpoint, role/tenant, database and empty
URL query/fragment. The actual database connection still verifies current/session
role `developed_accounts`, no superuser/BYPASSRLS/role creation/database creation/
replication/membership, and the startup guard still verifies one API and no other
worker. The API mail sender remains disabled. The worker starts successfully,
has no restarts and the outbox has zero pending/failed entries. No synthetic test
email was sent; normal existing production delivery was resumed.

Karak's private database health returned503 because its environment and UID rule
also referenced 172.18.0.12. Its runtime now uses the database's explicitly assigned
172.30.241.3:5432 address with the existing `karak2_app` role/database/password.
Only UID977's exact DB tuple changed; old-address and private-control probes fail.
The app remains `developed-karak2.service`, release `0ba56d72f17c`, gateway3182,
with private API/web sockets. Private health now returns200/databaseOK; public
health remains401 without authentication. No application code or schema changed.

## Operational incident and prevention

At about20:41 CEST, restarting `developed-uid-boundary.service` propagated restarts
to dependent application services. This was an operator error during this work,
not a required part of applying the firewall transaction. Requests may have been
interrupted and Karak's in-memory sessions/games may have been cleared. Services
recovered; all health checks were subsequently verified. No zero-downtime claim
is made for this operation.

The installed `uid-boundary-reload.conf` adds **`systemctl reload
developed-uid-boundary`** using the existing locked atomic loader. It was tested
with unchanged PIDs for the API, mail worker, Karak, webhook and both tunnels.
Never restart this boundary unit merely to apply its JSON configuration.
No global firewall ruleset was flushed. SSH/operator sudo access was preserved.

## Dependencies and application checks

The exact serving Accounts backend requires MFA for SUPERADMIN, and the single
administrator has a verified TOTP factor. Reviewed session/CSRF/authorization and
database-backed rate-limit logic remains active. Public unauthenticated admin,
internal account-check and generic provider admin/password-grant requests are
rejected. Login sends no-store, CSP, anti-framing and HTTPS security headers.
No real account brute-force, live rate-limit flood, password reset or factor
change was performed. Cloudflare WAF/Access policy, tailnet ACLs and complete
cross-product authorization were not independently qualified.

Initial production dependency audits: Accounts and Mega Music reported zero findings.
KešTrek reported7 (1 critical,4 high,2 moderate); Otázkomat9 (1 critical,4 high,
4 moderate). These are advisory classifications, not demonstrated exploits.
Both share a proxy-addr advisory; other affected dependencies include multipart
handling, URI parsing, query parsing and the MCP SDK.

Published fixes change only `backend/package.json` and `backend/package-lock.json`
in `/home/openclaw/Dev/kestrek` and `/home/openclaw/Dev/otazkomat`. KešTrek updates
aligned Nest packages to11.2.7 and removes the vulnerable multer override;
Otázkomat uses the CommonJS-compatible uuid11 line. Both resolve compatible
transitive fixes. The backend source matched the deployed revisions before these
changes. Credential-free builds are under
`/home/openclaw/sam-security-deps-vpbd_s3w`; do not package tracked `.env*` files.

Validation:

- KešTrek:34 suites/786 tests passed; Nest build passed; production audit zero.
- Otázkomat:20 suites/224 tests passed;132 database-dependent tests skipped;
  production audit zero. Tests used dummy Supabase inputs, not live credentials.
- Accounts:183 passed,24 optional skipped; worker/boundary suites24/24;
  health-check regressions3/3. Shell syntax and diff whitespace checks passed.

The owner explicitly approved publishing both tested fixes. Both were committed
and pushed to their existing main branches, then deployed with the installed
`developed-release` tool, serialized with its poll/build locks. Required release
tests repeated the results above. No migration or frontend deployment was needed.

| App | Source commit / live API release | Live unit / loopback |
| --- | --- | --- |
| KešTrek | `8c02d7aa42ffc23893b4193546a9be05f19e53f4` / `8c02d7aa42ff` | `developed-kestrek@8c02d7aa42ff.service` / 3164 |
| Otázkomat | `130ad343f8a33e42502bb2fc28d9ba2fa97235d1` / `130ad343f8a3` | `developed-otazkomat@130ad343f8a3.service` / 3166 |

Both switches completed at21:47 CEST. `npm audit --omit=dev --json` from each
sealed, serving backend reports zero advisories in every severity class. All
12,962 KešTrek and2,217 Otázkomat manifest file hashes match. Local/public health
and expected unauthenticated denials passed; both APIs have zero restarts.
Frontend releases remain `7ae2c731ee90` and `6420e4271c8e`, respectively.

The KešTrek notification worker remains active with its ownership guard pinned
to the new API. Its separate non-listening implementation still loads the
previously reviewed `1c102674a293` release; the zero-advisory audit result above
applies to the serving HTTP APIs, not that separate worker dependency tree.
The release tool's existing retention policy removed prior API artifacts
`582424b5d817` and `b2f442b01329` after successful switches. Their source commits
remain available for a reviewed rebuild; there is no retained immediate artifact
rollback to those two revisions.

One scheduled poll overlapped the manual deployment lock and exited before
running any deployment code. After both successful releases, that confirmed
lock-contention failure state was cleared; the timer remains enabled.

A separate Vocabulum frontend build-test failure temporarily made the shared
release poll fail during the review. It subsequently recovered in the existing
pipeline; this task did not alter that application's tests or code.

## Backup coverage and restore evidence

`vps-backup.sh` now includes JASOM state and service credentials, tunnel files,
SSH/firewall/Fail2ban/logrotate configuration, host maintenance/deploy scripts,
operator user units, immutable mail launcher/marketing pins, Supabase compose/
bootstrap configuration, the database encryption-key volume and ntfy config.
The live PostgreSQL data directory is explicitly excluded from file backup;
logical dumps plus the existing base/WAL backup remain its recovery sources.
`backup-manifest.py` records nonsecret release paths, runtime executables, users
and image identities. New dumps use umask077. A success receipt is written only
after remote backup and the existing retention operation succeed. Retention was
not broadened or shortened.

The initial remote snapshot `7eaa492d` passed metadata and a5% data-pack check,
gzip checks and a byte-identical Caddyfile restore. New coverage was backed up as
`57b0fa79`; the final tested snapshot `da8abe9c` also includes the GraphQL shim
needed for a blank-cluster restore. All selected restored files passed restic's
verification. Recovery credentials and their values were never printed.

A final successful backup, `5413bd6a` at21:00 CEST, includes the completed host
configuration and `/opt/developed-control/sam-security-20261014`: nonsecret
remediation sources plus the two tested dependency patches before publication. The
database-restore evidence above is from the explicitly identified tested snapshots.

The rehearsal used the same PostgreSQL images in read-only containers with no
network, no exposed ports, no capabilities and disposable memory-backed data.
Only downloaded snapshot data/configuration was supplied. All SQL imports used
`ON_ERROR_STOP=1`. The successful bootstrap procedure is:

1. Initialize empty clusters with the original bootstrap superuser
   (`supabase_admin` or `jasom`), and skip only its duplicate `CREATE ROLE` line
   in the dump. A different bootstrap user cannot faithfully replay PostgreSQL17
   `GRANTED BY` relationships.
2. For Supabase, mount the restored database configuration/key directory read-only
   at `/etc/postgresql-custom`. Preload the required extension libraries
   (`pg_stat_statements,pgaudit,pg_cron,pg_net,pgsodium,pg_tle,plan_filter,supabase_vault`)
   and disable cron execution for the rehearsal.
3. Stream the protected gzip dump into `psql` from the host; do not weaken dump
   permissions to let the container user read it. Immediately after pg_graphql's
   `CREATE EXTENSION`, insert restored `graphql-wrapper.sql` terminated with `;`,
   then attach that function to the extension with `ALTER EXTENSION pg_graphql
   ADD FUNCTION graphql_public.graphql(text,text,jsonb,jsonb);`.
4. Compare restored table counts against the dump's COPY row counts, and verify
   restricted roles and RLS. Both complete imports returned0.
5. Remove only the explicitly labelled, network-disabled rehearsal containers.
   Both were removed; no production database was restored or replaced.

Verified snapshot counts: `_supabase`2 tables/1535 rows; `karak2`10/101;
selected application/platform schemas in `postgres`265/100311; separate JASOM
database5/1851. All matched exactly. The restored account/karak runtime roles
remain non-superuser/non-BYPASSRLS;23 account tables have RLS enabled.
The root-only import logs and count receipts remain with the rollback evidence.

This does not prove full fresh-host reconstruction, point-in-time recovery,
off-host custody of the restic password/storage recovery credentials, or
immutability against a compromised host deleting remote snapshots. The owner
was asked to confirm independent recovery credentials without sharing them.

## Monitoring and remaining maintenance

### Authorized kernel reboot — 2026-10-14

The owner explicitly requested the reboot after the dependency releases.
`shutdown -r +1` was accepted for22:00:11 CEST on14 October2026; the systemd
shutdown receipt confirmed `MODE=reboot`. Follow-up on15 October confirmed the
host booted at22:00:32 CEST, with boot ID
`3abcfbd7-918d-4ea1-b813-a812e2181198` and running kernel
`6.8.0-147-generic`. No reboot-required marker remains.
Preflight at21:58 CEST passed all44 health probes, with10 containers running,
no failed units, no active deployment/package operation, and an off-site backup
success about one hour old. Kernel image, modules and initramfs for
`6.8.0-147-generic` exist; GRUB syntax passes and its default entry selects147.
The previous146 kernel remains installed. SSH socket activation, Tailscale,
tunnels, Docker, security boundaries, worker and post-boot health timer are
enabled. Operator user services have lingering enabled.

Pre-reboot boot ID: `4d2b6cfb-cec9-4c7f-9420-56370a485883`;
previous running kernel: `6.8.0-146-generic`. The existing
`developed-boot-check.timer` runs about
five minutes after boot, retries while services settle, and records results in
`/var/log/developed-boot-check.log`. Its checks cover the44 probes, containers,
runtime units, security boundaries and notification-worker ownership guard.
Containerd remains2.4.1; this reboot does not install the separately pending2.4.2.

### Mail-worker boot timing repair — 2026-10-15

The automatic checks correctly reported that the mail worker had failed after
reboot. The API's first database connection failed at22:00:53; its automatic
restart recovered at22:00:58. The worker's unchanged five-second readiness guard
had already expired at22:00:57. It remained failed, with delivery unavailable,
until the inspected start at09:40:22 the next morning. The API and launcher had
been automatically repinned to `6de6078ad4cd` before reboot; the prior session's
`f2c1811702e3` pin is historical. The six-field input/pooler fix remained intact.

The new root-owned helper at
`/opt/developed-control/central-mail-readiness-20261015/central-mail-worker-readiness.mjs`
runs unprivileged through the independent `boot-readiness.conf` systemd drop-in.
Its `ExecCondition` waits up to120seconds for loopback health200 with the canonical
Host, before the original full `ExecStartPre` security guard. Requests have a
one-second total deadline and never follow redirects. Timeout exits255, marking
the unit failed; `TimeoutStartSec=135s` bounds service startup. All original
ownership, PID, release/hash, credential-parity and role checks remain. No sender
restart policy, API process, database configuration or mail input changed.

Fifteen fixture/regression tests passed, including recovery after an eight-second
API startup/restart, timeout, late success and stalled connections. Combined
service syntax and an actual runtime-UID probe passed. The worker then passed
its full guard and role gate, while API PID7760 stayed unchanged. Scoped read-only
outbox counts are pending0/failed0/delivered6; no test mail was generated. The
worker has zero restarts. All44 probes pass; automatic monitoring recovered
at09:40:31 CEST. No failed system/user units remain. Pre-change evidence is under
`/var/backups/sam-reboot-20261015`. The new wait was tested with fixtures and a
real worker start; no second reboot was performed.

`host-health-check.py` is installed at `/usr/local/sbin/developed-boot-check`.
It ignores its own previous failed state, checks44 health endpoints plus enabled
runtime/required units and containers, warns below10% or5GiB free, and requires
an off-site success receipt within30hours. Notifications occur on state changes
and six-hour persistent-failure reminders. Failed ntfy delivery now fails visibly
and is not recorded as delivered. Normal recurring execution is enabled through
`host-health-check.timer.conf`; no separate synthetic alert was sent.

Final production checks:44 probes passed,10 production containers running,
no failed system/user units, root filesystem about25% available, both tunnels
and the sole mail worker active with zero restarts since their last start.
Normal alert HTTP acceptance is distinct from proving receipt on an owner's device.

The authorized reboot and follow-up service recovery are verified. Still
requires owner action/approval: coordinate
the downloaded containerd upgrade (Docker live restore is currently disabled);
confirm SSH/Mosh access requirements and
out-of-band console before restricting them; confirm independent backup credentials.
Preserve the remaining rollback evidence until those steps finish.

### Critical SMS monitoring — 2026-10-15

Installed the enabled one-minute `developed-critical-monitor.timer` and private,
root-owned SMS Gate v1 client. The requested `DevelopED` identifier was verified
by one approved test (message `110315924`, provider `DELIVERED`, owner-confirmed).
Credentials and the recipient remain outside Git in a root-only configuration.

Two failed observations are required before alerting. Build/development failures
alone do not trigger SMS; verified app deployments receive up to fifteen minutes
of scoped grace, and longer planned work can use automatically expiring maintenance
windows. Persistent incidents do not generate reminders or recovery texts.
Durable send reservations, a ten-minute cooldown and ten-attempt daily cap prevent
duplicate or excessive SMS. The existing checker supervises the SMS monitor.

All 23 relevant regression tests pass. Live checks report 44 passing probes and
10 running containers; repeated scheduled cycles completed with no critical
failures and zero automatic SMS attempts. Actual maintenance/status/resume commands
were verified and the temporary test window cleared. No application was restarted.
The nightly backup configuration now includes monitor credentials and state; no
additional off-site backup was run for this installation. Complete host/network
loss still requires independent off-host monitoring.

See [the SMS monitoring runbook](../../server/accounts/deploy/critical-service-monitoring.md)
for installed paths, development commands and delivery limits. Previous scripts
and verification evidence are retained under
`/var/backups/sam-critical-monitor-20261015/`.

Mechanism references: [webhook configuration](https://github.com/adnanh/webhook/blob/master/docs/Hook-Definition.md),
[systemd sandboxing](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml),
[restic verification](https://restic.readthedocs.io/en/stable/045_working_with_repos.html),
[Supabase restore considerations](https://supabase.com/docs/guides/self-hosting/restore-from-platform),
[proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).
