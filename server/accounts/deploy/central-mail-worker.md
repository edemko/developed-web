# Separate central mail worker — source-only preparation

No worker has been installed/started, no live database query has been executed by
this preparation, and no email has been sent. The existing central API continues
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

`central-mail-worker-input.mjs --apply` is a future root-only, exclusive-create
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

Future installation must copy only these reviewed launcher/input/guard modules
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
