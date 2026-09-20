# Central database foundation checkpoint — 2026-09-20

The three reviewed central migrations were applied to `supabase-db` between
15:02:01 and 15:02:24 UTC. This establishes the database foundation only.
Central SSO, registration, publication, provider startup, mail and product
enforcement were not activated. No product/session/scoped-data migration was
included. The operator implementation used was `dbab405` (following the lock
timeout fix `7737941`); original migration files and source checksums are unchanged.

## Recoverable backup and isolated restore

Protected checkpoint directory:
`/home/openclaw/pg-backup/central-checkpoint-20260920T1645Z/`.
The suffix is an operator label, **not** the actual backup time. The fresh backup
completed at approximately **14:49 UTC**, before any production migration.

- `base/`: fresh physical PostgreSQL backup, plain format with streamed WAL,
  taken using the existing container-local `supabase_admin` replication identity.
  No backup-pruning script or existing-backup deletion was run.
- `wal/00000001000000290000000E.gz`: separately retained archive segment containing
  the named restore point `developed_central_preflight_20260920T1645Z`, LSN
  `29/E000648`. Existing WAL archiving reported zero failures.
- `pg_verifybackup` verified the original backup's complete manifest, file
  checksums and required WAL before recovery and again after production apply.
- Manifest SHA-256:
  `44b061472ffebfa8bb6d4f9782239a72664577af5099f673897f22eeb8f01f0d`.
- Retained archive segment SHA-256:
  `ef430b61db45a9b7d84eaedb45f95fecec7ba27eb22a4f36f5e2dff46a6a94be`.

Recovery used the exact running PostgreSQL image ID
`sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`
(`supabase/postgres:17.6.1.136`). It reached the named restore point and paused;
`pg_is_in_recovery()`, `pg_is_wal_replay_paused()` and the replay LSN confirmed
the target. Only the disposable clone then completed recovery for rehearsal.
The production data directory, timeline and running service were never replaced,
promoted, stopped or restored.

Both new containers are now **stopped**, with their private bind-mounted data
retained for operator review:

| Container | Retained data | Purpose |
| --- | --- | --- |
| `developed-central-migration-test-202609201445-db` | `restore-clean/` | Clean restore and successful final migration rehearsal |
| `developed-central-migration-test-202609201446-db` | `restore/` | Earlier rehearsal that exposed ownership/ACL defects; not an approved migrated state |

Both carry the central migration test label and checkpoint label, use Docker
network `none`, no TCP listener or published port, read-only root filesystem,
read-only archive mount, no capabilities, no-new-privileges, a 768 MiB memory
limit with no additional swap, one CPU, and 160-PID limit. PostgreSQL shared
buffers were 64 MiB. Recovery requires `max_connections=100`, matching the
primary: an initial attempt with 30 correctly refused recovery and was replaced
only inside the disposable fixture. Background preload workers were disabled.

The checkpoint parent is mode0700; backup, archive and protected evidence files
are mode0600. Total retained footprint after both rehearsals was approximately
507 MiB. The pre-existing qualification fixture
`developed-identity-test-2357912-{db,auth,rest,storage}` was not modified.

This is a database recovery checkpoint, not an off-host backup or a replacement
for separate signing/encryption configuration, filesystem state, and storage
object backups. Future rollback must reconcile affected records while preserving
new writes; do not restore the entire shared cluster to undo additive migrations.

## Exact committed migration history

Each source and its ledger row committed in the same transaction, using the
deployment advisory lock, effective 500ms lock timeout, and bounded statement
timeout (v1/MFA 30s; native 5s). Ledger:
`accounts.deployment_migrations`, owner `postgres`, forced RLS, no policies and
no runtime-role access.

| Version | Applied UTC | Source SHA-256 |
| --- | --- | --- |
| `20260920070607` | 15:02:01.280286 | `42aff1569d5bc410785d8f5339bc8c6bd1f8edfda0728819275e8f1275fbc823` |
| `20260920114956` | 15:02:13.762587 | `942e1f4dee7632f914642df221ca0c69025cc79224d330ffb47c33aeffbd164d` |
| `20260920125511` | 15:02:24.465567 | `06a25e25ea6319c7455450191d7d63ee10f8591ed2fe01e5d83f679427e35778` |

Fresh prechecks found no existing `accounts` schema/runtime role, no old or active
other database transaction, and Auth's latest version `20260302000000`. The exact
ledger was read after every apply. The runner rejects duplicate application,
unexpected source bytes, missing predecessors and unexpected owner graphs.

## Ownership lessons and verification

The production `postgres` role is not a superuser. `auth` belongs to
`supabase_admin`, its relevant tables belong to `supabase_auth_admin`, and `core`
belongs to `postgres`. Rehearsal caught failures hidden by the original generic
PostgreSQL fixture, including silent ineffective function ACL statements after
ownership transfer. Those attempts affected only the disconnected clone.

The reviewed runner now connects through the existing trusted container-local
`supabase_admin` identity, assumes `postgres` for ordinary DDL and ledger writes,
and switches only exact hash-pinned statements to their existing required owner.
Provider column grants/policies use `supabase_auth_admin`; Auth schema USAGE and
the gate function ownership/replacement use `supabase_admin`; the gate's final
EXECUTE grants/revokes use `developed_accounts`. Account objects stay owned by
`postgres`; the SECURITY DEFINER gate stays owned by `developed_accounts` with
an empty search path. No runtime/operator membership or privilege expansion
was used to bypass ownership checks.

Verification passed:

- Six operator tests, including real PostgreSQL with a nonsuperuser `postgres`
  and the actual ownership shape, ordered checksums, duplicate refusal, rollback
  when ledger insertion fails, and function ACL checks.
- Final rehearsal of all three migrations against a clean copy of the actual
  recovered production catalog, with no migration warnings.
- Twenty-five live checks covering ownership, closed policy, least-privilege
  grants, sensitive-column denial, actual permission errors under runtime/public
  roles, and authenticated execution of the unconfigured app gate returning false.
- Nine protected aggregate comparisons across backup/live/pre-apply/post-apply:
  Auth UUIDs, profile UUIDs/roles, SUPERADMIN UUIDs, memberships/roles, registry,
  existing Auth/core policy definitions, RLS flags, trigger/function definitions,
  and Auth migration ledger. All matched; no user row contents or UUIDs were
  printed. The five intended central core policies were additive; the five
  previous core policies and existing provisioning triggers remained intact.

Protected aggregate evidence and the checking scripts are retained in the
checkpoint directory (`before-live.json`, `restored.json`, `preapply.json`,
`postapply.json`, `rehearsed-clean.json`, `aggregate-check.mjs`,
`permission-check.mjs`). Verification queries do not create accounts or send mail.

Final scoped state: 13 `accounts` tables with RLS, registration `closed`, zero
app-settings rows, zero OAuth clients, zero central sessions and zero outbox
rows. `developed_accounts` remains NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
NOINHERIT, NOBYPASSRLS and has no inherited role memberships. It cannot read
password hashes, refresh secrets, factor secrets or the deployment ledger,
modify Auth records, or update the platform role. PUBLIC/anon cannot execute
the gate; anon/authenticated/service_role cannot read private account tables.

Remaining app configuration, provider/network setup and all activation gates
stay with the coordinated rollout in
[the activation checklist](ecosystem-activation-checklist.md).
