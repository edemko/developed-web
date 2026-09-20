# Final seven-app policy and KešTrek token cutover

Status: **source reviewed by tests; not installed, staged or applied** by this
task. Public human SSO remains off. Read-only live preflight passed against the
closed seven-app configuration, eight OAuth clients, three central ledger rows
and ten app ledger rows. No account, session, app data or mail was changed.

## Three deliberately separate steps

### Coordinator publication checkpoint — 2026-09-20

The coordinator subsequently reviewed `f1eaab5` and installed its five-file
root-owned/read-only bundle at `/opt/developed-operators/final-policy-f1eaab5`.
Only `publish --stage` and `publish --apply` were executed, successfully. The
protected snapshot SHA256 is
`3ff1d804f0ad676df95f39db5a7c7c61eba24afda66a9b7c47d29a1596cb5fd2`.
The exact ledger record was verified after commit. Independent fresh reads
confirmed seven published/reportable/free apps, all still unenforced,
registration closed and zero outbox rows. Public `/login` remained404.

Actual runtime-UID HTTPS owner checks passed for the one distinct existing
ScreenTime device owner (UID983 caller) and KešTrek's configured integration owner
(UID982 caller). These used each running process's private app key without
printing keys, tokens, user responses or email. Normal central checks can lazily
create the existing member's legacy entitlement; they do not create browser
sessions, device samples or new product memberships. No fabricated ingestion was
sent. Final product ingestion/MCP behavior still requires routed verification.

`enforce` and `kestrek-raw-token` remain **unapplied**. The source-only status
at the top describes preparation, not this subsequent coordinator operation.

### Phase contracts

| Phase | Only intended change | Required external checkpoint |
| --- | --- | --- |
| `publish` | Seven `published=true`, `reportable=true`, `join_policy='free'` | Human login/consent remains publicly unavailable; authenticated internal checks work over canonical HTTPS. |
| `enforce` | Seven `enforce_oidc=true` | Reviewed central runtimes/static clients are ready and affected legacy traffic has migrated; preserved device/MCP checks pass. |
| `kestrek-raw-token` | Exact existing Ke migration removes legacy schema/object/default grants | Ke central backend and Android replacement are ready; legacy browser/native direct JWT data access is no longer expected. |

The exact apps are `app_mega_music`, `app_kestrek`, `app_screentime`,
`app_airsoft`, `app_voc_builder`, `app_odonto` and `app_otazkomat`.
No profile role, credential, membership, entitlement, free-plan value, OAuth
registration, user UUID, child-device/MCP credential or product row is changed.
Even `updated_at` is preserved: only the listed policy columns change. The
operator rejects unexpected app-settings or ledger triggers.

Publication is necessary **before** routing device/MCP requests to new adapters:
`ensureAccess()` rejects a closed/unpublished app before inspecting membership.
ScreenTime interprets that central 403 as denied ownership, and its existing
Android sync clears queued samples on 401/403. Do not use a closed app as a
temporary device maintenance response. Central-check unavailability must remain
retryable. Verify real owner checks with each app's private key without printing
the key or user response. Never send fabricated device ingestion to test this.

`enforce_oidc` governs delegated user-token RLS. It does not turn backend scoped
roles into per-user roles; explicit backend owner checks and network/public-data
credential filtering remain mandatory. SQL cannot prove proxy routing, legacy
process retirement, remote alias closure, APK installation, mail readiness or
MFA acceptance. The coordinator must verify those gates independently.

Keep public human SSO off throughout incomplete security closure, even after
`publish`. Once full provider/data/host/remote closure is verified, complete the
controlled owner acceptance and enable registration/mail in separately reviewed
operations. This tool cannot enable registration or sending. Every phase
requires registration still `closed` and outbox empty; if that changes, stop and
review rather than bypass the guard.

## Packaging and explicit invocation

Use a reviewed root-owned immutable directory under `/opt/developed-operators/`.
Copy only these five files, preserving filenames, owner root and mode 0444:

- `final-policy-operator.mjs`
- `final-policy-operator-kestrek.sql`
- `apply-central-migration.mjs`
- `apply-app-migration.mjs`
- `review-app-migrations.mjs`

The last three supply existing fixed source hashes and ledger expectations;
none performs an operation when imported. All path components are checked for
root ownership, symlinks and group/world writability. No root package install,
runtime env file, dependency tree or arbitrary SQL path is required. The raw
SQL copy is byte-identical to Ke's already-reviewed migration
`20260920071603_kestrek_ecosystem_raw_token_cutover.sql`, SHA256
`6448e02bf4462e69390a7023c0a73baada1d0ea5348072f265ce1ba9f1936bd4`.
This is a packaging copy, not a new migration or a renamed migration history.

From that immutable directory, use the reviewed root Node22 binary:

```sh
/opt/developed-runtimes/node-v22.23.2/bin/node final-policy-operator.mjs --phase publish
sudo -n env -i PATH=/usr/bin:/bin /opt/developed-runtimes/node-v22.23.2/bin/node final-policy-operator.mjs --phase publish --stage
sudo -n env -i PATH=/usr/bin:/bin /opt/developed-runtimes/node-v22.23.2/bin/node final-policy-operator.mjs --phase publish --apply
```

The first command is offline, never connecting to Docker or a database. Replace
`publish` with `enforce`, then `kestrek-raw-token` only after the respective
checkpoint above; there is deliberately no `all` option.

`--stage` uses a read-only repeatable-read snapshot and creates a new mode-0700
directory under `/var/backups/developed-final-policy-20260920/<phase>/` with
mode-0600 `snapshot.json` and `proof.json`. It refuses existing phase directories.
Snapshot contents are exact selected policies, app/client configuration digests,
ledger records and Ke ownership/ACL metadata, including column ACLs. User/session
rows and secrets are not captured. The proof binds phase, pinned change hash,
operator bytes, snapshot bytes and prepared SQL. Keep the existing verified
physical backup separately; this metadata backup is not a full database backup.

`--apply` requires exact unchanged snapshot and proof, pinned production DB image,
trusted `supabase_admin` session, known owners/roles, enabled exact seven web
client mirrors and one Ke native client, and expected protected ledgers.
Transaction-local advisory locking, 500ms lock timeout, 30s statement/idle
timeouts and policy/config table locks keep changes bounded. No HTTP operation
occurs while the transaction is open. COMMIT is sent only after the SQL success
marker and no warnings/errors on the ordered diagnostics pipe.

Ke's actual `schema_migrations` table and one function are owned by
`supabase_admin`; remaining reviewed Ke relations are postgres-owned and
functions have those two trusted owners. Therefore only the exact Ke ACL body
executes as the existing trusted session role, not an ineffective postgres
REVOKE or an ownership transfer. Backend and every non-retired principal's
normalized grants are compared before/after. Legacy schema/table/sequence/
function and postgres per-schema default ACLs must be absent afterward.

Postgres global default function EXECUTE is distinct from per-schema defaults.
This existing migration does not change global defaults or grant schema USAGE;
future migrations must retain revoked schema access and explicitly grant only
reviewed backend routines. Never reintroduce public schema USAGE as a fix for a
backend access problem.

Each step records its exact source/action hash atomically in
`accounts.app_deployment_migrations`: 10→11 (`publish`)→12 (`enforce`)→13
(the existing Ke filename/hash). No shared provider migration ledger changes.
After commit, a fresh read verifies the exact ledger entry and an exclusive
`applied.json` marker is written. Repeated apply is refused.

## Failure and recovery

After connection loss, do not infer rollback and do not delete backups/markers
to retry. Read the exact ledger entry plus the seven policy fields and inspect
Ke ACLs. A failed pre-commit SQL guard rolls the transaction back; a lost reply
after COMMIT may mean the change succeeded. Reconcile that distinction first.

There is no automatic rollback. Before enforcement, restoring publication
settings can also break already-migrated devices, so reroute/drain safely first.
After enforcement, reverting `enforce_oidc` or restoring old Ke ACLs reopens a
security boundary and needs an explicit, separately reviewed operator decision.
The private snapshot has the exact prior policies/ACL grantors/options for that
review; do not restore the shared database or resurrect legacy sessions.

## Verification

```sh
node --test server/accounts/operators/final-policy-operator.test.mjs
FINAL_POLICY_SQL_TEST=1 node --test server/accounts/operators/final-policy-operator.test.mjs
```

The opt-in suite creates one uniquely named, labeled, network-disconnected
PG17 container (256MiB, half CPU) from an existing local image. It never connects
to production. It removes only that exact verified disposable container/volume.
Tests cover all three commits, admin-owned Ke routines, retained backend/data
access, direct legacy schema denial, wrong phase/changed config/open registration/
outbox/extra-app/trigger refusal, rollback rehearsal and late ledger failure.
All nine tests passed. An initial fixture-only catalog cast error was fixed;
a read-only live guard then identified the already-known admin-owned Ke schema
ledger, which is now matched explicitly. Live preflight subsequently passed.

Actual post-cutover HTTP/data/device/native/MFA/mail acceptance is still required;
this suite is not a claim that central login is testable in production.
