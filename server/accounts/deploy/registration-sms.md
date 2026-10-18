# New registration SMS alerts — 17 October 2026

Enabled on sam at 08:53 UTC (10:53 Europe/Bratislava), following the owner's
request. `developed-registration-sms.timer` checks once per minute and starts
`developed-registration-sms.service`. The owner confirmed receipt of the single
setup SMS, provider message `110415115`.

Each newly committed central `registration/succeeded` audit event produces an
SMS using **SMS Gate v1** `/json/send_message`, `from=DevelopED`, and the existing
private monitoring recipient. Example:

```text
Nova registracia. Aplikacia: KesTrek. Email: user@example.test. Cas: 17.10.2026 11:15.
```

The alert means account creation succeeded, before ordinary email confirmation;
opening a signup form, a rejected attempt, or signing up an existing identity
does not alert. DevelopED and all eight centrally integrated apps are covered.
My Clinic and JASOM retain independent registration systems and are outside this
notifier. Existing superadmin email notifications remain in place.

The source app comes from the first server-written verification or invitation
credential associated with that registration, joined to the app registry. Direct
portal registrations use DevelopED. The email is read from that original
registration credential rather than a later profile address. App names are
transliterated and bounded; the complete email, including plus aliases and other
valid punctuation, is preserved. Long addresses may use multipart SMS; a backtick
requires Unicode encoding. The text is bounded to 400 printable ASCII characters.
SMS includes the local timestamp and omits the audit reference. Passwords,
verification codes and credential links are never included. Emails remain only
in private queued-message state and SMS, not status output or journals.

## Runtime and state

- Immutable root-owned code: `/opt/developed-control/registration-sms-email-20261017/`
  (`registration_sms.py` and `sms_gate_v1.py`, with bounded email support scoped
  to registration sends). The critical monitor keeps its original helper and limits.
- Units: `/etc/systemd/system/developed-registration-sms.{service,timer}`.
- Private systemd credentials: `/etc/developed-health/sms.json` and
  `/etc/developed-health/registration-db.json`. The latter contains only the
  central database connection; no provider admin or encryption/mail keys.
- Persistent deduplication: `/var/lib/developed-health/registration-sms.sqlite`;
  serialized runs use `registration-sms.lock`; sanitized health is recorded in
  `registration-status.json`. Existing nightly backup paths cover these files,
  the private config, installed code and units.
- Central API was `/opt/developed-accounts/releases/40ee1e50534e`, loopback3140,
  at preflight. No API/mail release, restart, proxy change or schema migration
  was needed. Existing dirty checkout work was not deployed with this notifier.

The query uses the existing `developed_accounts` role through the private
session pooler. It executes an explicit `BEGIN READ ONLY`, bounds the statement
to ten seconds and verifies both current/session role and read-only mode.
Preflight found that pooler startup options alone did not set read-only mode;
the explicit transaction was verified successfully before activation.

At initialization, three existing registration audit IDs were marked baseline,
without SMS. Each later unseen event is durably queued. The query scans committed
registration events rather than advancing a maximum audit ID: a lower ID may
commit after a higher one. This prevents missing concurrent registrations.
The initial live read contained three registrations; revisit the scan strategy
if audit growth approaches the bounded query timeout.

Each run attempts at most ten queued messages; remaining events wait for the
next run. Reservation commits to SQLite before calling the provider. Ambiguous
sends, interruptions, explicit rejections and delivery failures are recorded,
never blindly resent. Provider acceptance is separate from delivery; pending
receipts are checked for up to an hour. The existing host health checker reports
a stopped timer, stale results or an unconfirmed/failed notification through its
existing ntfy channel. Review the exact private event before retrying any failed
delivery; resetting the history can duplicate SMS and is not a recovery method.

## Checks and operations

```sh
sudo python3 -I -B /opt/developed-control/registration-sms-email-20261017/registration_sms.py --status
sudo python3 -I -B /opt/developed-control/registration-sms-email-20261017/registration_sms.py --check
systemctl status developed-registration-sms.timer
sudo journalctl -u developed-registration-sms.service -n 10 --no-pager
```

`--check` only reads the source and prints counts/app names. `--initialize` is a
one-time activation operation and refuses an existing baseline. Routine runs
refuse missing history, so a lost state file cannot silently reset the baseline.
The service is normally inactive between successful oneshot runs; the timer must
be active and enabled.

Verification: 33 targeted SMS, registration, incident-monitor and health-check
tests passed; systemd verification passed. The installed query verified the
scoped role and read-only transaction. Activation excluded the three existing
registrations, with zero automatic SMS attempts. The separate setup SMS was
accepted, returned `DELIVERED`, and was confirmed received by the owner. All 44 host health probes passed,
with 10 expected containers running. Tests created no live accounts or emails.

At 09:00 UTC (11:00 local), the owner's follow-up added registration email and
removed the SMS reference. The owner had also registered through Voc Builder and
confirmed receipt of its automatic alert; private state recorded one delivered
registration SMS. The format update passed 36 targeted tests and read-only live
message validation, including the actual new registration, without sending a
second test SMS. Two historical baseline rows lack credential metadata and remain
excluded from alerts. The installed service ran successfully with three baseline
events and one delivered event, preserving deduplication. Queued, unsent events
are refreshed to the new format; already attempted messages are not resent.
The timer remains active/enabled. The original immutable release is retained at
`/opt/developed-control/registration-sms-20261017/`, with the preceding unit at
`/var/backups/registration-sms-20261017/developed-registration-sms.before-email.service`.

To disable only these alerts, stop/disable `developed-registration-sms.timer`
and stop any active `developed-registration-sms.service`; preserve private state
and credentials. The health checker will report the disabled timer until its
registration supervision is deliberately removed. The preceding health script
is retained at `/var/backups/registration-sms-20261017/developed-boot-check`.
Critical outage SMS monitoring is a separate timer and remains unchanged.
