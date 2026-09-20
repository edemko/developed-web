# Approved empty Vocabulum account cleanup — completed checkpoint

The owner authorized and reconfirmed deleting the three empty non-owner accounts.
After coordinator review, the exact immutable operator was executed once and
reported a successful commit, verified at **2026-09-20 18:28:40 UTC**. It removed
the three identities and 24 exact backed-up rows, revoking their provider session
material first. Owner/remaining relational data fingerprints passed. No SSO,
registration, mail, app deployment or service restart was enabled/performed.

## Completed execution and verification

Reviewed source commit: `a4a426085429c3176b0f1c648f1a6ed65b625bff`
(`Prepare reviewed fixed-target Vocabulum cleanup operator [no deploy]`). The
root-owned bundle at
`/opt/developed-operators/vocabulum-cleanup/a4a426085429c3176b0f1c648f1a6ed65b625bff/`
has directory0555/files0444 and contains only three operator modules (apply,
backup and restore), the preflight SQL and the source-time runbook. Immediately
before execution, each installed
file was compared byte-for-byte with the pinned Git commit and root-owned safe
ancestors were verified. The helper uses Node built-ins only; no npm dependencies
or mutable-checkout code executed as root.

Pinned apply-module SHA-256:
`d9293e5d81caed48b5b4e4d44a6e6d3adff93f161ea06b19e529a532e707bff0`.
The reviewed Node22.23.2 binary hash
`3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327`
and `/usr/bin/docker` hash
`6d1ac33d27f9f73d1feb0184e7c0847c1b6051dd60b7a6ec7b3ad9a2f7ca01ea`
were rechecked before the one apply invocation:

```sh
sudo -n env -i PATH=/usr/bin:/bin \
  /opt/developed-runtimes/node-v22.23.2/bin/node \
  /opt/developed-operators/vocabulum-cleanup/a4a426085429c3176b0f1c648f1a6ed65b625bff/vocabulum-cleanup-apply.mjs --apply
```

At **2026-09-20 18:29:16 UTC**, the full read-only postflight completed with
snapshot `4675998:4675998:`: 503 reference columns scanned, zero target rows or
reference hits, and 248 FK constraints inspected. All owner counts remained
22 folders, 544 words, 0 sentences, 3 tests (2 teacher-owned plus 1 student-owned),
and 2 classes; owner Voc role remained SUPERADMIN. Shared Auth users decreased
from 7 to 4. Central registration remained `closed`, exactly seven app settings
remained unpublished/non-reportable/unenforced with closed join policies, and
outbox count remained 0. Neither a content transfer nor a retry was necessary.

The two private backup copies below remain available. Narrow recovery restores
only the three backed-up identities and Voc access, with fresh login required;
it must not restore old sessions or overwrite the shared database. No recovery
was performed. Do not rerun apply: it is deliberately bound to the former exact
24-row snapshot and will refuse the now-absent targets.

Exact targets:

| Auth UUID | Vocabulum role |
| --- | --- |
| `c3bf3064-8297-4bd5-8f92-54142598ffed` | ADMIN |
| `29cc2004-d4e7-427f-8070-eed2eb7df29a` | TEACHER |
| `668c5614-d834-424e-b962-0593d757c517` | STUDENT |

Protected owner: `4c3e497a-511d-49dc-85fe-60f3cc37c3ae`, Vocabulum SUPERADMIN,
core USER. All three targets have core USER and access only to `voc_builder`.
The fresh repeatable-read inventory scanned 503 UUID/ID-like text columns across
the shared database, with no target product data or other application records.
The recursive FK catalog was inspected as well. The owner has 22 folders,
544 words, 0 sentences, 3 tests (2 as teacher, 1 as student), and 2 classes.
No content transfer is currently needed. Any new target content must stop apply
for a reviewed transfer to the owner; the operator cannot transfer or discard it.

## Protected backup

`vocabulum-cleanup-backup.mjs` captured one read-only repeatable-read snapshot,
`4673895:4673895:`, into two exclusive-created root-owned0600 files within
root-owned0700 directories. Both copies were fsynced and read back byte-for-byte:

- `/var/backups/developed-vocabulum-cleanup/2026-09-20T17-01-41-710Z.json`
- `/root/developed-vocabulum-cleanup-recovery/2026-09-20T17-01-41-710Z.json`

SHA-256: `97890ec0f0965e1ae769b6fbd830944d8093d1ae98b1a8d0dea65835cc4074f6`.
These are separate private copies on the same VPS, not independent off-host
disaster recovery. Existing platform backups remain separate.

There are exactly 3 rows each in `auth.users`, `auth.identities`, `auth.sessions`,
`auth.refresh_tokens`, `auth.mfa_amr_claims`, `core.profiles`, `core.app_access`,
and `voc_builder.memberships`: 24 rows total. The MFA claims reference session
IDs indirectly and are intentionally included. Backups contain sensitive
identity/session material; never print, commit, publish or copy to a runtime.

## Concrete apply boundary

`vocabulum-cleanup-apply.mjs` has no connection or write by default. Only its
root-only `--apply` path can mutate the fixed `supabase-db` container. It accepts
no arbitrary UUID, database, SQL file, backup path or checksum override.
Both exact private backup copies and their pinned SHA-256 must match.

Before sending any backup-bearing SQL, each dedicated operator connection turns
off statement, duration, sampled-duration, parameter, error-statement and pgaudit
logging using session settings. Error verbosity is terse so error context cannot
include the enclosing DO block. Auto-explain and pg_stat_statements tracking are
disabled for that connection too. These SET statements precede BEGIN, so an
expected transaction rollback cannot revert them before error reporting. They
disappear on disconnect; no global logging or shared extension change occurs.

Inside a repeatable-read transaction, with a 500ms lock timeout and 30s statement
timeout, it locks the exact backed-up rows and verifies their full equality with
the backup. It rechecks the owner, seven closed/unpublished/unenforced app gates,
closed central registration, exactly seven non-reportable apps, empty outbox,
target Voc-only app access, the
503-column reference scan, and all children of every row to be removed. Any child
not itself in the exact backup fails. Any enabled non-internal DELETE trigger on
an affected table fails. New content, sessions, metadata or references fail.

Provider session material is explicitly deleted first: MFA session claims,
refresh tokens, sessions. Then the operator explicitly removes memberships,
app access, profiles, identities and Auth users. Every statement must affect
exactly 3 rows. No product row is removed and no unchecked cascade is relied upon.
Before/after fingerprints cover every Voc relational table except the unreferenced
TTS byte cache and every non-target row in the eight affected tables. Any mismatch
rolls the entire transaction back. The owner and all three tests are covered.

Both running GoTrue providers report a 3600-second JWT lifetime. The latest target
provider timestamps are from 2026-06-22 12:40:53 UTC, so tokens issued by those
sessions have expired under that configuration. Apply rechecks both provider
settings and rejects any provider timestamp within 3660 seconds. It also rejects
changed session rows, closing the gap between backup and deletion. Deleting
sessions prevents future refresh; deleting Auth users prevents future login.

The actual deployed Vocabulum NextAuth JWT callback re-reads profile and membership
on each request and returns null if either is missing. Membership removal therefore
denies existing application cookies on the next request. This does not claim that
deletion cryptographically revokes arbitrary already-signed provider JWTs; the
expiry check and current application membership gate address the observed sessions.

After coordinator GO, execute only the root-owned immutable bundle under
`/opt/developed-operators/vocabulum-cleanup/<full-source-commit>/`. The source
commit must contain `[no deploy]`; no push is needed. Copy all three `.mjs` files
and the preflight SQL from that exact commit, verify SHA-256 against Git bytes,
and make the directory0555/files0444, root:root. The only module dependencies
are Node built-ins and the included backup helper; there is no npm installation.
Run with an empty environment and trusted system PATH, using this command with
the concrete reviewed commit directory:

```sh
sudo -n env -i PATH=/usr/bin:/bin \
  /opt/developed-runtimes/node-v22.23.2/bin/node \
  /opt/developed-operators/vocabulum-cleanup/<full-source-commit>/vocabulum-cleanup-apply.mjs --apply
```

If execution fails or loses its connection, inspect exact target presence before
retrying. Do not assume rollback from a transport error or edit the checksum to
force stale backup data through. After reported success, run the read-only
preflight again: target references must be zero, owner counts unchanged, gates
still closed. Record source hash and result here. No app deployment/restart,
provider restart, mail action or Supabase hosted-project change is part of this task.

## Narrow recovery

`vocabulum-cleanup-restore.mjs` is a SQL generator with no CLI/live-execution path.
Use a private operator process to load the verified backup and generate SQL in
memory only after an explicit recovery decision. It requires all target rows to
be absent and refuses to overwrite a recreated identity. It restores exact Auth
users/identities, profiles, app access and Voc memberships in dependency order,
omitting generated columns. The inspected `core.handle_new_user()` insert trigger
creates a profile; restoration updates only that newly generated exact profile
with the backed-up fields. Existing app-access insert triggers provision other
apps only when their app matches; these targets have Voc-only access.

Restoration compares every restored row with the backup. It deliberately does
not restore sessions, refresh tokens or MFA session claims: require fresh login.
Never restore the whole shared database, overwrite owner/new product data, or
paste password hashes/token rows into SQL tools or transcripts. Conflicting IDs,
usernames, schema/trigger changes or other errors require reconciliation and a
fresh isolated rehearsal, not a force/overwrite option.

## Verification

Seven offline validation tests pass. The opt-in real PostgreSQL17 fixture passes
nine scenarios: successful exact deletion and owner preservation; new product
data refusal; new indirect FK-child refusal; changed snapshot/DELETE-trigger
refusal; default rollback; narrow recovery with an Auth profile trigger and no
revived sessions; recent-token refusal; reportable/extra-app refusal; and log
confidentiality on forced apply/restore guard failures. The last scenario starts
PostgreSQL with statement/error/duration logging enabled, proves a normal query
is logged, and proves random password/token markers and their hex encodings are
absent from captured database logs. A new connection still has the enabled
logging defaults. The fixture sets a pgaudit GUC but does not load the pgaudit
extension itself; its test proves the suppression command and PostgreSQL logging,
not extension-hook behavior. The fixture is a synthetic schema, not
a production snapshot restore. Its network-none, 256MB/0.5CPU labeled disposable
container and anonymous volume were removed after the tests; this removed only
generated fixture data and is not recoverable or needed.

```sh
node --test server/accounts/test/vocabulum-cleanup-backup.test.mjs \
  server/accounts/test/vocabulum-cleanup-apply.test.mjs
VOCABULUM_CLEANUP_SQL_TEST=1 node --test \
  server/accounts/test/vocabulum-cleanup-sql.test.mjs
```

Primary references: [Supabase user deletion](https://supabase.com/docs/guides/auth/managing-user-data)
and [Supabase session lifetime and revocation](https://supabase.com/docs/guides/auth/sessions).
