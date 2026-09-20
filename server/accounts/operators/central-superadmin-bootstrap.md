# Fixed first central owner bootstrap

Status: prepared and isolated-tested; no production staging or promotion yet.

The user explicitly confirmed the existing central owner email
`erik.demko162@gmail.com`, Auth/core UUID
`4c3e497a-511d-49dc-85fe-60f3cc37c3ae`. Read-only inspection found the confirmed
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
