# Critical service SMS monitoring on sam

Installed and enabled on 2026-10-15. `developed-critical-monitor.timer` runs
every minute, with a three-minute boot grace period. It checks production
services, workers, security/network boundaries, 46 configured health probes,
10 expected containers and available root filesystem space. Customer projects
PhoneTech and Promile Club are excluded.

## Alert policy

- A failure must appear in two consecutive checks, at least 30 seconds apart.
  With the normal timer, detection usually takes one to two minutes.
- New confirmed failures are grouped into one SMS. An ongoing incident produces
  no reminder or recovery SMS. Two healthy observations rearm its alert.
- SMS submissions have a global ten-minute cooldown and a maximum of ten
  automatic attempts per rolling 24 hours. New incidents may wait for these limits.
- Failed builds, development services and generic failed deployment jobs do not
  trigger SMS. An unsuccessful deployment can still alert if production remains
  unavailable after its maintenance window ends.
- The v1 JSON API uses `from=DevelopED`, the privately configured operator
  recipient, high priority, a 30-minute validity and no callback. There is no v2
  fallback. Messages fit one GSM SMS.

The monitor reserves each send in durable state before contacting the provider.
An ambiguous result, rejection or delivery failure is not blindly retried:
preventing duplicate texts takes precedence. Provider acceptance is recorded
separately from delivery, and receipts are checked on subsequent runs. The
existing fifteen-minute health checker reports a stopped/stale SMS monitor or
an unresolved SMS delivery problem through its existing ntfy channel.

The single approved setup SMS, provider message `110315924`, reached
`DELIVERED`; the owner also confirmed receipt. No additional live SMS was sent
for the fixture tests or maintenance-control checks.

## Development and planned work

JASOM blue/green monitoring was corrected on 2026-10-17. The earlier checker
always required the green unit, causing false outage SMS whenever a successful
deployment switched to blue and retired green. The checker now reads only the
JASOM Caddy block to select the required unit, rechecks if the route changes
during observation, and probes the routed health and guest-session endpoints.
An inactive standby slot is expected; a stopped selected slot or an unknown
route still fails. Both slot names and the normalized incident name map to the
`jasom` maintenance scope. Confirmation, cooldown, delivery history and limits
are unchanged. Normal local builds and healthy slot switches require no mute.

A valid, live release-tool deployment lock automatically suppresses only the
affected app for up to fifteen minutes from lock creation. The monitor checks
the lock owner, age, process owner and installed release-tool path. Stale locks,
dead processes and unrelated processes do not mute alerts. Other apps and
shared infrastructure remain monitored.

For longer work or a manual restart that may interrupt production, set a timed
window before starting:

```sh
sudo developed-monitor --maintenance kestrek --minutes 60 --reason 'planned feature work'
sudo developed-monitor --status
```

After production is healthy, end the window early:

```sh
sudo developed-monitor --check
sudo developed-monitor --resume kestrek
```

Windows expire automatically, persist across reboots and last 1–240 minutes
(default 60). After expiry, a continuing failure must again meet the confirmation
threshold. Local builds and tests need no maintenance window. Do not disable
the timer for routine development.

Available scopes: `airsoft`, `developed-accounts`, `karak2`, `kestrek`,
`mega-music`, `myclinic`, `otazkomat`, `screentime`, `vocabulum`, `jasom`,
`infra`, and `all`. Prefer the affected app; reserve `infra` or `all` for planned
work that actually affects those scopes. App windows include their coupled
workers. `--resume` removes manual maintenance; a still-running verified
deployment retains its automatic grace period.

`--check` runs read-only probes without sending SMS or updating incident state.
`--status` shows saved observations and current maintenance windows. A status
snapshot may therefore show the previous check's suppressed failures until the
next scheduled check completes.

## Installation and operation

- Root-owned code: `/opt/developed-control/critical-monitor-20261017-jasom-slots/`;
  operator command: `/usr/local/sbin/developed-monitor`.
- Units: `/etc/systemd/system/developed-critical-monitor.{service,timer}`.
  The service's `30-jasom-slots.conf` drop-in selects the updated monitor;
  `critical-monitor-jasom-slots.conf` is its source. The common
  `/usr/local/sbin/developed-boot-check` links to the same release's checker.
- Credentials: `/etc/developed-health/sms.json`, root-only mode 0600 within a
  mode 0700 directory, delivered to the service using systemd `LoadCredential`.
  Never copy its contents into logs, documentation or Git.
- State: `/var/lib/developed-health/critical-sms.json`,
  `critical-status.json`, `maintenance.json` and `critical-sms.lock`.
  Files are root-only and serialized with a lock; writes use atomic replacement
  and fsync. Do not delete incident history to troubleshoot a delivery problem:
  doing so can rearm alerts.
- Previous health-check and backup scripts are retained under
  `/var/backups/sam-critical-monitor-20261015/`.
- The nightly backup now includes `/etc/developed-health` and
  `/var/lib/developed-health`; existing coverage includes the installed code,
  systemd units and operator commands. This change did not run an additional
  off-site backup.

Inspect operation without exposing credentials:

```sh
sudo developed-monitor --status
sudo systemctl status developed-critical-monitor.timer
sudo journalctl -u developed-critical-monitor.service -n 20 --no-pager
```

The oneshot service is normally inactive between successful runs; the timer
must remain active and enabled. Probe collection and provider requests are
bounded, and the service has a 90-second overall deadline. Its filesystem is
read-only apart from the private state directory. No application restart or
release was needed for installation.

Verification: all 23 SMS/incident/health regression tests passed. They cover
transient failures, cooldowns, restart/crash deduplication, uncertain delivery,
build-job exclusion, scoped maintenance and expiry, verified deployment locks,
and independent monitor supervision. Live read-only checks passed all 44
probes with all 10 containers running. Consecutive scheduled runs completed
successfully with zero automatic SMS attempts. The actual maintenance/status/
resume commands were checked and no manual window remains active.

This monitor runs on sam. A complete host outage or loss of outbound connectivity
can prevent SMS delivery; detecting that requires a separate off-host monitor.

### 2026-10-17 JASOM correction verification and rollback

All 31 offline health/monitor/SMS transport tests passed, including blue and green
selection, a switch during observation, stopped selected units, ambiguous routes,
routed HTTP failures, scoped maintenance and incident deduplication. Live read-only
checks passed all 46 probes with blue serving JASOM v18 and green inactive.
Two subsequent scheduled checks cleared the old false incident normally;
the persisted SMS attempt count stayed at four and no delivery problem remained.
No test SMS, application restart, credential change or incident-history reset
was needed. Other scopes retain their existing alert policy.

Previous checker and operator wrapper are preserved under
`/var/backups/sam-critical-monitor-20261017-jasom-slots/`; the original monitor
release remains under `/opt/developed-control/critical-monitor-20261015/`.
Rollback restores those two exact command paths, removes only
`/etc/systemd/system/developed-critical-monitor.service.d/30-jasom-slots.conf`,
then reloads systemd. Preserve `/var/lib/developed-health` and keep the monitoring
timer enabled. Such a rollback restores the old JASOM false-positive behavior.
