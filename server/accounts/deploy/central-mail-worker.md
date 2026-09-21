# Separate central mail worker — active after reviewed start

Current API/mail pins and coordinated music activation are recorded in
[managed-music-checkpoint-20260921.md](managed-music-checkpoint-20260921.md).
Earlier release/PID observations below are historical.

Current2026-09-21 checkpoint: worker PID3525935 is active/enabled, using launcher
bundle `/opt/developed-accounts/mail-workers/a4e05167f90cc5e5f28a871a324f54ab187ce7bc`.
Its imported mail implementation and WorkingDirectory remain `releases/c561a81`;
its independent API pin is `releases/ffefcf90c349cfe4154beed40febb5b3aa3c21b9`,
API PID3525884. The protected six-field input and all four mail-module hashes
are unchanged. This supersedes original launcher path/PID observations below.
The latest release changes only the portal flag selector UI; the worker guard
was repinned to its new immutable API path, with no other worker code change.

The guard now polls for at most five seconds for the same pinned API PID to
finish exec into the exact runtime/cwd/entrypoint and answer loopback health200.
It then performs every existing UID/GID, actual-environment, input-parity,
immutable-hash and single-sender check. Wrong process, PID replacement or deadline
fails closed. This retries only read-only readiness observations, never service
actions or mail. Ten injected/unit tests passed. The original guard refused once
during API restart, then passed after the API was fully ready; the exact original
cause was not logged. The hardened launcher was installed in a new immutable
bundle and only the mail service restarted/drained; API and Caddy PIDs stayed
unchanged. An immediate post-start process probe also observed Type=simple's
pre-exec window; later exact-process/ready-log verification passed without another
restart. See [complete upgrade evidence](portal-upgrade-checkpoint-20260921.md).

The production start checkpoint at the end supersedes the original staging state
below. The reviewed worker is now active/enabled after explicit coordinator GO.
The existing central API continues
on loopback3140 with its current process and `ACCOUNTS_MAIL_ENABLED=false`.
Starting the new worker is an explicit mail-delivery activation and needs the
coordinator's separate approval after security/canonical-link readiness and
controlled-address delivery authorization.

## Existing immutable application, no API restart/build

The launcher imports only `Database` and `MailWorker` from
`/opt/developed-accounts/releases/c561a81/dist/`. Its guard pins hashes for
`mail.js`, `db.js`, `security.js` and `mail-templates.js`, and requires root-owned,
non-writable release/runtime paths. There is no HTTP server, Accounts/Provider
construction, admin credential, copied application build or housekeeping loop.
The current API remains the owner of housekeeping and identity operations.

Existing `queueMail` queues encrypted outbox rows independently of the API mail
flag. Its in-process `MailWorker.tick()` returns before querying when mail is
false. The separate process uses the same lease IDs, SKIP LOCKED selection,
daily attempted-send budget, sender/reply addresses, localized templates,
tracking-disabled payloads and bounded delivery retry behavior. Delivery remains
at least once; ambiguous provider timeouts can duplicate a message, never a
one-time account action. No outbox payload or recipient is logged.

## Inputs and startup gates

`central-mail-worker-input.mjs --apply` is a root-only, exclusive-create
assembler. It reads the existing protected central file only in memory and
selects exactly six values into root:root0600
`/etc/developed-accounts/mail-worker.json`: database URL, encryption key, Mailjet
API key/secret, canonical origin and existing daily email limit (at most200).
It never copies provider administration, session, client or registration keys.
It creates no new password/key, changes no DB role/grant and refuses overwrite.
The input file and its root-only parent directory are fsynced and read back.

The source unit supplies only that JSON through systemd `LoadCredential` and
uses existing UID988/GID982, with no other supplementary groups. The runtime
rejects inherited `ACCOUNTS_`, `MAILJET_` and `SUPABASE_` environment variables;
it constructs only the mail configuration subset, with fixed
`supportEmail=info@developed.sk` and `mailEnabled=true`. It does not import the
full API configuration that requires a provider-admin key.

The root `ExecStartPre=+` guard verifies the actual central unit is active under
UID988/GID982, the actual executable/release is pinned, its process environment
still explicitly has mail disabled and exactly matches the six selected
inputs, and there is one central API and no standalone worker process. The
protected configuration file alone is not treated as evidence of live API
configuration. The guard does not restart the API. Its root prefix intentionally
allows reading protected configuration and process evidence; the worker itself
runs without that privilege.

Before the first tick, the worker issues only a read-only role query and requires
both `current_user` and `session_user` to equal `developed_accounts`, with no
superuser, BYPASSRLS, role/database creation, replication or role membership.
It neither changes roles nor grants itself access. Normal outbox/rate-limit
writes begin only after this gate, when explicitly authorized to start delivery.

UID988 is the existing central principal. The selected-input design avoids
handing the worker provider-admin credentials; it is not a claim of kernel-level
secret isolation between two processes sharing that UID. The existing central
network permissions are reused, not expanded. The entry point opens no listener.
`SocketBindDeny=any` is additional unit intent, not a substitute for verifying
the host's actual bind boundary and absence of listening sockets.

## Scheduling, shutdown and operator responsibilities

Ticks are sequential: the next five-second delay starts only after the current
tick finishes. SIGTERM/SIGINT cancels pending scheduling, waits up to90seconds
for an in-flight tick, then closes the pool with a separate five-second bound.
If the tick does not finish, the process exits without calling `pool.end()`
underneath it; its unacknowledged outbox lease expires normally. The unit allows
100seconds to stop. Restart is deliberately `no`; failures require inspection,
not an automatic second send attempt during ambiguous shutdown.

While this worker is running, keep the API's own mail flag false. Stop and drain
the standalone worker before ever enabling an API-owned worker or introducing
another sender process. `PartOf=developed-accounts.service` propagates an
operator-requested API stop/restart to this worker, whose next startup rechecks
the actual API flag; starting the worker does not itself request an API start.
After a separate API stop followed by start, the worker may remain inactive and
require its own explicitly authorized start; this dependency does not enable it.
The startup guard is a point-in-time check, not a new
central API reconfiguration mechanism. Do not bypass it with direct developer
execution or reuse the full API environment file in this unit.

Installation copies only these reviewed launcher/input/guard modules
into a root-owned immutable mail-worker directory, preserve the existing c561a81
release and central PID, validate the unit in isolation, assemble the protected
input, and obtain separate start/send approval. No API restart is needed. Before
and after starting, verify central internal checks remain available, the new
worker has no socket listener, scoped role/pool counts are expected, and logs
contain only fixed diagnostics. Keep registration admission separately gated.

The controlled first-delivery address remains the previously approved test
mailbox; this preparation does not create a user, enqueue a message or send it.
Do not inspect decrypted payloads to demonstrate readiness. Check aggregate
outbox counts and controlled recipient delivery only when authorized.

## Verification

`node --test server/accounts/deploy/central-mail-worker.test.mjs` uses only
fixtures. It checks exact-six-key assembly/root-style0600 exclusive output,
no provider-key copying, actual-API guard inputs and duplicate worker refusal,
exact role/no privilege, non-overlapping scheduling, in-flight shutdown and
deadline behavior. It also imports the actual pinned immutable MailWorker with
mocked DB and Mailjet request functions, proving preserved lease/cap/template
behavior without network or database access. The Supabase role/security review
informed the startup role gate; no Supabase schema/API change was required.

## Observed staging — 2026-09-20

Source commit `733903a` was pushed with `[no deploy]`; all seven fixture tests
passed. The three launcher/input/guard modules were copied unchanged into
root:root0555 `/opt/developed-accounts/mail-worker` with root:root0444 module
files. The unit was installed root:root0644, validated with
`systemd-analyze verify`, and systemd reloaded without starting/enabling it.
Source-to-installed byte equality and Node syntax checks passed. Installed hashes:

| File | SHA-256 |
| --- | --- |
| central-mail-worker-input.mjs | `10356d28c8850bd582f56aea92f9b78bb6b967336742574ece7728e6b7cf92de` |
| central-mail-worker-guard.mjs | `28b712d7fb7fd7341049dbe34abcb13c0231f8e86130dc9d6136e477538dcb8f` |
| central-mail-worker.mjs | `3447f372fbdfc6906122e3ce851b0e158ea05e521e32fcf64721fa6ff99c74ec` |
| developed-accounts-mail-worker.service | `3fdd29522b82d8752525f08b09a8d66138ef4d5c65096b6931ace9c9c93f9b98` |

The approved exclusive assembler created the six-field input as root:root0600,
link count1; file and parent fsync/readback passed. The root guard confirmed the
actual API process has mail disabled, matches the selected inputs, and is the
only central API, with no standalone mail worker.

A separate process dropped to actual UID988/GID982, received only the database
URL through stdin, imported the installed `ROLE_SQL`/`assertRole` and immutable
Database module, executed that read-only role query, and closed its pool. Both
database identities were `developed_accounts`; superuser, BYPASSRLS, role/database
creation, replication and membership were false. It never invoked the worker
entry point, instantiated MailWorker, queried outbox payloads, or ran a tick.

Final unit evidence: central API active/enabled, PID3197193, NRestarts0 unchanged;
mail worker inactive/disabled, PID0, NRestarts0. Actual worker namespace/protected
file-denial/listener checks and delivery checks remain pending an explicit
start/send authorization. No delivery success is claimed by this staging.

## Production start checkpoint — 2026-09-20

After all-seven security closure, Odonto paired promotion and canonical human
ingress activation, the coordinator verified the pending outbox was empty
(total0), passed the existing startup guard and explicitly started/enabled
`developed-accounts-mail-worker.service`. The worker's read-only runtime-role gate
passed and its fixed readiness line was observed. PID700440 runs as UID988/GID982,
with NoNewPrivileges and effective capabilities0, no socket listeners, protected
path denials and actual Tailscale socket EACCES.

Central API PID3197193/NRestarts0 remains unchanged with its own mail flagfalse;
Caddy PID862 is unchanged. No new account, queued message or actual delivery had
been produced at this start checkpoint. Starting on an empty queue is not inbox
delivery proof. The approved new-account test recipient is recorded privately;
registration remains separately closed until its next
approved admission step. Successful owner MFA may normally queue the owner's
security notification, and this worker processes all eligible queued messages,
not an address allowlist. Never inspect/decrypt an outbox credential to substitute
for real receipt and owner-controlled confirmation of the email.

At 21:12 UTC the coordinator's follow-up four aggregate outbox counters were
still `0/0/0/0`; no delivery or new-account confirmation is claimed. The owner
has been asked to perform MFA manually, but completion is not yet recorded.
