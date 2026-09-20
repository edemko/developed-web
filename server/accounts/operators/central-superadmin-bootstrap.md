# Fixed first central owner bootstrap

Status: production bootstrap applied once after coordinator approval; owner MFA
and human-login acceptance remain pending. Do not replay the bootstrap.

The user explicitly confirmed the existing central owner identity. Its exact
email and Auth/core UUID are pinned by the one-shot operator and protected
deployment evidence, not repeated here. Read-only inspection found the confirmed
identity's core role `USER` and no existing central `SUPERADMIN`.

`bootstrap-central-superadmin.mjs` accepts no target arguments. The only intended
writes are that exact profile's `role=SUPERADMIN` and one `accounts.audit` event,
with a null actor (VPS operator), exact target, previous/new role, and explicit
`mfa_bypass: false`. All other profile fields, including `updated_at`, stay intact.
Product-local roles, passwords, MFA factors/secrets, sessions, app grants,
registration, outbox and public ingress are untouched. No second identity is
created. The separately requested test recipient is outside this operation.

Live catalog inspection found zero non-internal triggers and zero rewrite rules
on both `core.profiles` and `accounts.audit`; the profile's seven columns are not
generated. No profile-update sync side effect needs suppression. The operator
rechecks the trigger/rule counts and table ownership/ACL metadata before and
inside the transaction. It never disables triggers.

## Guarded workflow; coordinator review required

1. Commit reviewed source with `[no deploy]`. Install the exact operator into a
   new root-owned immutable directory; never run developer-owned code as root.
2. Run `--stage` with the pinned Node 22 runtime. It only reads live SQL, verifies
   exact UUID/email/confirmed status, prior `USER`, no previous bootstrap audit
   and zero existing superadmins. It exclusively creates root-0700
   `/var/backups/developed-central-superadmin-20260920`, containing root-0600
   `before.json` and `proof.json`. The private snapshot includes owner profile
   data and must not be printed. The proof pins the operator and snapshot hashes.
3. Only after explicit coordinator GO, run the same immutable operator `--apply`.
   It requires unchanged private proof and current state and writes an exclusive
   attempt marker before the transaction. Short lock/statement timeouts, fixed
   superuser/database identity and `pg_catalog` search path apply. A brief
   `SHARE ROW EXCLUSIVE` lock on profiles/audit prevents concurrent role changes
   or trigger DDL while reads continue; the exact Auth identity row is share-locked.
4. The transaction compares staged state, changes exactly one role, inserts one
   audit event, and verifies the complete expected after-state before commit.
   Post-commit semantic comparison and a root-0600 verified record follow.
   Any ambiguous attempt must be reconciled read-only, never replayed.

## Mandatory first-login MFA is already implemented

`Accounts.newSession` creates a restricted enrollment session for a password-only
SUPERADMIN without a verified factor, or a challenge session when a factor
already exists. `Accounts.context` also restricts previously established sessions
after the live role changes. `requireAdmin` independently requires both a verified
factor and provider AAL2; sensitive admin actions require recent authentication.
The bootstrap does not enroll, read, remove or bypass MFA. The owner must complete
the existing reviewed central flow when the coordinator later opens it; this
operation does not open any human routes or send email.

Verification:

```sh
CENTRAL_BOOTSTRAP_SQL_TEST=1 node --test \
  server/accounts/operators/bootstrap-central-superadmin.test.mjs \
  server/accounts/test/mfa.test.mjs
```

The disposable PostgreSQL fixture is network-none with synthetic rows only. It
checks one role change/one audit, unchanged profile and synthetic password,
replay rejection, and fail-closed trigger drift. Existing MFA tests establish
restricted first login and AAL2 enforcement without any real login or factor.

## Production checkpoint — 2026-09-20

Reviewed source commit `1966d5d` was pushed with `[no deploy]`. The exact operator
was installed root-owned, mode0444 at
`/opt/developed-control/central-superadmin-1966d5d/bootstrap-central-superadmin.mjs`,
SHA-256 `bccd1ce80feb587c44499b1df9d87b8e713f1263cea26f1364e558351fb26528`.
The pinned Node22 runtime completed `--stage`; the coordinator subsequently
executed `--apply` exactly once after the socket-boundary closure passed.

The transaction and semantic postcheck succeeded: one exact owner profile changed
from `USER` to `SUPERADMIN`, and one audit entry was added. Passwords, MFA factors,
sessions, product-local roles, mail, registration and human ingress were unchanged.
All other profile fields were preserved. Mandatory MFA still applies to the first
owner login; promotion is not evidence of enrollment or authenticated access.

Protected evidence is in root-0700
`/var/backups/developed-central-superadmin-20260920/`, with root-0600
`before.json`, `proof.json`, `attempt.json` and `verified.json`. Do not print the
private owner snapshot or rerun the one-shot apply. Isolated SQL plus existing
MFA tests passed13/13 before installation. No test account or confirmation email
was created by this operation.
