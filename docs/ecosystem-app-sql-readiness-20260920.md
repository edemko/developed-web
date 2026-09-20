# Remaining app SQL readiness — 2026-09-20

This is the pre-operator inventory. Subsequent owner-aware closed staging and
physical-backup rehearsal are recorded in the
[app SQL operator qualification](ecosystem-app-sql-operator-20260920.md).
That qualification does not itself apply production app SQL.
The subsequent authorized apply and live verification are recorded in the
[closed app SQL checkpoint](ecosystem-app-sql-checkpoint-20260920.md).

The three central foundation migrations are applied, as recorded in the
[database checkpoint](ecosystem-db-checkpoint-20260920.md). The remaining app SQL
is **not ready for production application through the current operator**.
`apply-central-migration.mjs` intentionally accepts only those three central
files. Neither a successful source review nor the disconnected tests below
extend that allowlist. No app migration, registry seed, role credential, OAuth
registration or public route was applied by this review. SSO remains off.

## Exact next dependency order

First prepare a closed registry seed for the seven **existing** core IDs:
`app_mega_music`, `app_kestrek`, `app_screentime`, `app_airsoft`,
`app_voc_builder`, `app_odonto`, `app_otazkomat`. Use the exact launch URLs in
the [activation checklist](ecosystem-activation-checklist.md) and product docs.
Keep `published=false`, `reportable=false`, `enforce_oidc=false`,
`join_policy='closed'`, OAuth/client/key fields null, and registration closed.
The current web configuration operator requires real client/key input; it is
not a closed-seed operator. Prepare and qualify this seed separately, with an
exact existing-ID check and no replacement of existing configuration.

This is a compatibility prerequisite: the actual central gate returns false
when its app-settings row is missing. ScreenTime and Airsoft install restrictive
policies that invoke it even with legacy runtimes still serving. A hidden tile
or disabled app environment flag does not prevent those database checks.

Create and validate `kestrek_identity_web` privately before its migration;
NOLOGIN is sufficient to stage SQL. Do not issue a password during rehearsal.
Then apply one reviewed file/transaction at a time in this deterministic order:

| Order | Repository | Source filename |
| --- | --- | --- |
| 1 | mega-media-player | `20260920070834_mega_music_ecosystem_sessions.sql` |
| 2 | kestrek | `20260920071554_kestrek_ecosystem_sessions.sql` |
| 3 | screentime | `20260920071953_ecosystem_web_sessions.sql` |
| 4 | airsoft-marketplace | `20260920123109_airsoft_ecosystem_sessions.sql` |
| 5 | vocabulary-builder | `20260920123043_ecosystem_oidc_sessions.sql` |
| 6 | odonto-ai | `20260920123136_odonto_private_identity_sessions.sql` |
| 7 | otazkomat | `20260920123206_central_web_sessions.sql` |
| 8 | developed-web | `20260920124145_ecosystem_scoped_data_roles.sql` |
| 9 | odonto-ai | `20260920132100_odonto_identity_https_store.sql` |
| Final closure only | kestrek | `20260920071603_kestrek_ecosystem_raw_token_cutover.sql` |

The first seven are independent after their prerequisites; the chosen order
makes review/history deterministic. The shared grant loop operates on existing
relations/functions, so all seven must precede it. Odonto's HTTPS functions
follow the shared grant loop and explicitly deny the data-backend role access
to the identity store. KešTrek's raw-token revoke is not additive staging and
must wait for the coordinated frontend/API/native/ingress closure.

The offline [source inventory](../server/accounts/operators/review-app-migrations.mjs)
pins all ten complete SHA-256 values and rejects changed source bytes, arbitrary
paths, `--apply`, container/database inputs and credential-writing flags. Run
from the canonical sibling checkouts:

```sh
node server/accounts/operators/review-app-migrations.mjs
```

It reads files only and prints dependency metadata. It generates no executable
migration SQL and makes no Docker, network or database connection.

## Observed owner and history requirements

Read-only catalog checks after the central checkpoint found:

- `postgres` is nonsuperuser, with CREATEROLE/BYPASSRLS and existing
  `pg_read_all_data` membership. It has SELECT and REFERENCES on `auth.users`;
  FK creation is not the missing privilege. Preserve those existing attributes;
  do not promote it or give runtime roles its memberships.
- Core, Mega, KešTrek, ScreenTime, Airsoft, Vocabulum and Otázkomat schemas are
  owned by `postgres`. KešTrek's migration ledger is an exception: it is owned
  by `supabase_admin`.
- `odonto` and all nine existing relations are owned by `supabase_admin`.
  `postgres` has USAGE but no CREATE there. The shared migration's grants/RLS
  alterations and Odonto HTTPS functions cannot run unchanged as postgres.
- `storage` is owned by `supabase_admin`; its ten relations are owned by
  `supabase_storage_admin`. Neither postgres nor the storage table owner has
  USAGE WITH GRANT OPTION on the schema. The Airsoft storage policy and shared
  storage grants/policies require bounded existing-owner/operator contexts.
  Do not give storage's runtime role unrelated app-schema access to make policy
  installation work; the exact cross-schema policy can be installed through
  the trusted operator context.
- `extensions` is owned by `postgres`, which can grant schema USAGE. Do not
  treat it like the Auth/Storage schemas in the runner.

The next operator needs a distinct, reviewed app allowlist. Preserve the source
hashes, use the existing trusted `supabase_admin` session, assume postgres for
ordinary app DDL, and switch only reviewed boundaries to the required owner.
The shared SQL contains a mixed-owner dynamic DO loop; it cannot safely be
handled by assuming all app objects have one owner. Explicitly qualify role
creation/admin-option ownership, filtered identity-view owners and their
underlying SELECT rights, Odonto RLS changes, schema grants, Storage policies,
function ACLs, and the final identity-store denial.

Airsoft and ScreenTime already insert their own version strings inside their
transactions. KešTrek, Vocabulum and Otázkomat ledgers have
`version,name,applied_at,note`; Odonto/Airsoft/ScreenTime have
`version,applied_at`. Mega has no `schema_migrations` relation in its schema.
Do not guess one universal INSERT shape or record a duplicate version for the
two self-recording sources. A reviewed atomic checksum ledger/owner policy for
these app files is still required; the current central runner has no such app
history support. Record source hash and version in the same transaction, use
the deployment advisory lock, enforce a 500ms lock bound after source settings,
bound statements, reject repeated/unrecorded objects and stop on errors or
ineffective-GRANT warnings. Reconcile ambiguous commits by exact ledger lookup.

## Role and provisioning matrix

| Product | Required database/data identity | Provisioning status and checks |
| --- | --- | --- |
| Mega | Existing `mega_music_web` private connection; migration grants OAuth table SELECT/INSERT/DELETE and adds token column | Preserve existing profile roles, quotas, S4 identity. Verify first-use profile setup through the application; no new global trigger is needed. |
| KešTrek | Precreate `kestrek_identity_web`; private session/flow rights only. Shared migration creates `kestrek_backend`, finite-lived data JWT, `avatars` bucket | Existing enabled `core.app_access` trigger invokes `kestrek.provision_user_on_access`, owned by supabase_admin. Preserve user role/defaults and MCP credentials. |
| ScreenTime | Migration creates `screentime_web` LOGIN without password; private sessions/limits only. `screentime_backend` for device operations; parent uses its OAuth JWT | No automatic child/family assignment. Keep enrollment/device tokens and ownership. Seed gate row before restrictive policies. |
| Airsoft | Migration creates `airsoft_identity` LOGIN without password; private sessions/limits only. User OAuth JWT accesses app/Storage | Enabled `on_airsoft_access_granted` trigger already exists. Migration replaces its function, preserving existing profiles; do not add a duplicate trigger. Seed gate first. |
| Vocabulum | `vocabulum_backend` NOLOGIN and scoped data JWT; includes encrypted sessions and refresh RPCs | `ensure_oidc_membership` requires shared `identity_directory`; creates only unassigned STUDENT, preserving existing role/org/forced-change state. Test after shared grants. |
| Odonto | `odonto_backend` JWT for data/`study-materials`; separate `odonto_identity_web` JWT for HTTPS session RPCs, role stays NOLOGIN | Existing enabled core-access trigger invokes supabase_admin-owned provisioning. Preserve local profile/block/admin flags. Identity JWT remains outside the five-data-role issuance tool. |
| Otázkomat | `otazkomat_identity_web` created NOLOGIN, later private DB LOGIN; separate `otazkomat_backend` data JWT and three app buckets | Exactly one protected active `platform_default` organization exists. RPC requires shared `identity_directory`; new users become members, existing roles/status/org access persist. No global Auth deletion. |

All ten new role names in this table were absent during the live catalog check;
only Mega's pre-existing connection role was present. The simple create-if-absent
blocks in several sources do not fully reject an unsafe pre-existing role.
The production preflight must check LOGIN/INHERIT, superuser/BYPASSRLS,
CREATE-role/database, replication and all inherited memberships for every exact
runtime role, not rely on the role name or NOINHERIT alone.

Private database roles need separately protected credentials and approved
HBA/network paths before runtime startup. Odonto's identity-store role must
never get LOGIN for the HTTPS design. The five backend roles need authenticator
membership in the correct direction, no inherited parent roles, finite JWT
expiry/rotation and own-bucket versus foreign-bucket denial checks. The shared
migration grants current objects only, not automatic rights on future tables.

## Disconnected evidence and limits

```sh
APP_MIGRATION_READINESS_SOURCE_TEST=1 \
  node --test server/accounts/test/app-migration-readiness.test.mjs
APP_MIGRATION_READINESS_SQL_TEST=1 \
  node --test server/accounts/test/app-migration-readiness.test.mjs
```

The source checks opt in because clean central-only CI checkouts do not contain
all seven sibling repositories. The SQL test creates its own labeled,
network-disabled PostgreSQL17 container with 192MiB memory, no additional swap,
0.5 CPU and 100 PIDs; cleanup removes only that exact fixture and its anonymous
volumes. No shared/retained qualification fixture is used.

Three tests pass, including the disconnected SQL proof. They verify exact hashes,
central-runner rejection of all ten files, a Docker-free offline invocation,
missing-role rollback, missing-app-settings denial, Airsoft storage ownership
failure/rollback, mixed-owner shared migration failure/rollback, Odonto HTTPS
schema/role failure/rollback, and final scoped-role/identity-store separation.
The fixture applies the shared migration under its synthetic superuser only to
check final ACL behavior; **that is not an approved production execution plan**.
It preserves a nonsuperuser postgres role and grants no runtime bypass privilege.
The combined run with the central migration operator (including its separate
ownership/atomic-ledger PostgreSQL test) and scoped-key operator passed all
18 tests with zero skips. Key tests use synthetic material only.

This minimal catalog proof is not a full product-data/provider/HTTP test or a
restored-production-catalog rehearsal. Before any app apply, the next runner,
closed seed, exact role setup and checksum-ledger writes must pass on a new
disconnected restored catalog. Repeat existing product behavior tests there,
including new free provisioning, two-owner isolation, storage/RPC denial,
role/UUID/data preservation and legacy compatibility while enforcement is off.

The Supabase skill informed the owner/grant and RLS checks. Reviewed primary
references: [roles](https://supabase.com/docs/guides/database/postgres/roles),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
and the [self-hosted owner-context change](https://supabase.com/changelog/46081-self-hosted-supabase-switching-studio-from-supabase-admin-to-postgres-breaking-change).
No shared ownership migration or platform upgrade was performed.
