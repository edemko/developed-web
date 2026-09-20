# Closed app SQL staging operator — 2026-09-20

The separate [app operator](../server/accounts/operators/apply-app-migration.mjs)
has passed disconnected rehearsals against fresh copies of the verified
[physical checkpoint](ecosystem-db-checkpoint-20260920.md). This is source and
restore qualification, **not a record of production app SQL application**.
No production seed, app migration, role password, data JWT, user action or
publication change was performed by this work. The central runner still accepts
only its original three files.

## Exact staged order and state

The first operation is `closed-seven-app-prerequisites-v1`. Its SQL-body SHA-256
is `4509d8a4689f4d45331120ed4f4be5696a6c57774df870d10e03d2facaf5a3d6`.
It requires all seven existing core IDs and inserts exactly their reviewed
ID/slug/launch tuples from the launch catalog. It requires zero central app
settings and zero `accounts.oauth_clients`; provider OAuth registrations and
anonymous central sessions are permitted. It creates `kestrek_identity_web`
NOLOGIN/NOINHERIT without a password. All ten new app role names must be absent
before this seed, preventing an unnoticed pre-existing identity from being adopted.

Every row starts with publication, reporting and enforcement false; join policy
closed; OAuth ID, server-key hash and callback null. It changes no core registry,
membership, account status, entitlement or existing runtime role. Registration
must already be closed. Configuration tables are share-locked for each short
transaction so concurrent configuration cannot race the closed-state checks.

Apply one transaction at a time in this order, using the exact hashes already
pinned by [the offline inventory](../server/accounts/operators/review-app-migrations.mjs):

1. `closed-seven-app-prerequisites-v1`
2. `20260920070834_mega_music_ecosystem_sessions.sql`
3. `20260920071554_kestrek_ecosystem_sessions.sql`
4. `20260920071953_ecosystem_web_sessions.sql`
5. `20260920123109_airsoft_ecosystem_sessions.sql`
6. `20260920123043_ecosystem_oidc_sessions.sql`
7. `20260920123136_odonto_private_identity_sessions.sql`
8. `20260920123206_central_web_sessions.sql`
9. `20260920124145_ecosystem_scoped_data_roles.sql`
10. `20260920132100_odonto_identity_https_store.sql`

The destructive KešTrek `20260920071603_kestrek_ecosystem_raw_token_cutover.sql`
is explicitly rejected, including for the production target. It remains a
separate final-cutover operation after coordinated frontend/API/native/ingress
closure. The shared additive source does revoke PUBLIC execution of Otázkomat's
global-user-deleting `delete_organization_permanently(uuid,uuid)` while explicitly
preserving `service_role` execution. That reviewed exception is not represented
as preserving every old PUBLIC function permission.

## Owner and transaction boundaries

The existing trusted `supabase_admin` session assumes nonsuperuser `postgres`
for ordinary DDL. Exact source edits switch only the Airsoft Storage policy and
existing provisioning routine; Odonto schema/table/view operations; existing
routine ACLs under their checked owner; Storage grant/policy block; and Odonto
identity HTTPS functions to their required trusted context. The mixed-owner
shared loop dispatches Odonto to `supabase_admin`, other app schema work to
`postgres`, and existing routine ACLs to the observed `postgres` or
`supabase_admin` owner. No ownership transfer, runtime superuser/BYPASSRLS or
extra inherited membership is used. Only the original source's intended
PostgREST authenticator memberships are granted.

The operator checks the three central checksums, schema/table owners, existing
Mega role and all app role attributes/memberships. It rejects source changes,
out-of-order runs, repeated runs, changed closed settings, incompatible owners,
and unexpected history. Each source's complete versioned filename and SHA-256
are recorded in `accounts.app_deployment_migrations` in the same transaction.
This ledger is owned by postgres with forced RLS and no runtime/PUBLIC access.
The two source-owned Airsoft/ScreenTime ledger inserts remain untouched; other
historical per-app ledgers are not rewritten using a guessed common shape.

The shared deployment advisory lock is used, effective lock timeout is 500ms,
and statement/idle-transaction limits are 30s. Source timeout settings are
removed only after complete SHA-256 verification. The operator sends all SQL
without COMMIT, merges psql diagnostics and its completion marker into one
ordered stream inside the container, and rolls back on any warning or error.
Only a clean marker permits COMMIT. This matters: rehearsal caught a silently
ineffective Odonto schema grant and proved that no source DDL or ledger row
survived that warning. A final separate read verifies the committed checksum.
If connection/commit outcome is ambiguous, inspect the exact ledger before any
retry; a repeated invocation deliberately does not replay an existing entry.

Dry validation never connects:

```sh
node server/accounts/operators/apply-app-migration.mjs \
  --migration closed-seven-app-prerequisites-v1
```

Mutation additionally requires `--apply --container <exact-name>`. Allowed
targets are literal `supabase-db`, or a `developed-app-migration-test-<digits>-db`
container carrying `developed.app.migration.test=true` with network `none`.
Both require running image ID
`sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`.
The production target is implemented for subsequent reviewed operator use;
adding it did not execute it. Keep credentials/client attachment after the
complete closed staging sequence, because each staging step requires the
central client map to remain empty. Do not enable registration/publication/SSO
as part of this operator.

## Restore evidence

All clones used fresh copies of the checkpoint's `base/`, the exact image above,
network `none`, no TCP listener/published port, read-only root filesystem,
no capabilities, no-new-privileges, UID100:GID101, 768MiB memory without additional
swap, one CPU, 160 PIDs, 64MiB shared buffers, no preload workers and archive
mode off. The backup's included WAL reached consistent recovery; these clones
did not replay the separate named-restore-point archive. The three central
foundation migrations were then applied using their existing reviewed runner
before closed app staging. The original backup and prior central restore clones
were neither modified nor started.

New retained clone names and protected paths under the checkpoint directory:

| Container suffix | Data directory | Purpose |
| --- | --- | --- |
| `202609201555-db` | `app-rehearsal-d0S8yY/` | First owner-dispatch rehearsal; warning rollback caught and fixed |
| `202609201556-db` | `app-rehearsal-clean-oJftK0/` | Clean ordered proof and rollback-only provisioning/ownership checks |
| `202609201557-db` | `app-rehearsal-final-oz7y8o/` | Final effective locks, ordered checksums and preservation proof |

Use the full `developed-app-migration-test-` prefix. Data remains inside the
mode0700 checkpoint parent; no restored row values, UUIDs or credentials were
printed. Existing Auth/core/product tables were compared by counts and ordered
row hashes before/after staging, ignoring only Mega's new nullable token column.
Migration ledgers were checked separately. All existing rows matched.
All three new containers are stopped at handoff, with their private data retained.

The [operator tests](../server/accounts/test/app-migration-operator.test.mjs)
cover exact source rejection, seed/catalog equality, cutover rejection,
duplicate refusal, rollback on failed ledger insertion, actual warning rollback,
closed legacy gates, private identity-table and ledger denials, foreign schema
and password-column denials, and Odonto identity/data-role separation.
Rollback-only synthetic users verify existing KešTrek/Airsoft/Odonto provisioning
triggers, Vocabulum unassigned STUDENT defaults, idempotent Otázkomat member
creation, ScreenTime two-owner reads, Airsoft own-versus-foreign writes and
own/foreign Storage bucket access. These fixtures never create real accounts
or send email. Existing product HTTP/browser/native/device acceptance remains
part of the coordinated activation gates; SQL proof does not replace it.
The combined source/restore/provisioning run passed four tests with zero skips;
the complete account-service build/test suite passed 73 tests, with 14 opt-in
integration/browser tests skipped and zero failures. The final exact-image
guard was additionally exercised by a rejected duplicate on the final clone.

```sh
APP_OPERATOR_SOURCE_TEST=1 \
  node --test server/accounts/test/app-migration-operator.test.mjs
```

`APP_OPERATOR_RESTORE_CONTAINER` opts into the destructive-to-fixture ordered
test and requires a fresh labeled clone with central migrations and only the
closed seed already applied. `APP_OPERATOR_POST_CONTAINER` separately names an
already fully staged clone for rollback-only provisioning/ownership tests.
Never substitute production or another team's fixture for either variable.

## Existing outbound-network SQL surface

Read-only inventory found `authenticated` can execute SECURITY DEFINER
`net.http_get` and `net.http_post`. The five new backend roles and
`developed_accounts` have net schema USAGE but **cannot execute** those functions.
`supabase_functions.http_request()` is a trigger function with authenticated
EXECUTE; no trigger currently attaches it. Authenticated has no schema CREATE.

The live PostgREST exposed schemas were
`public,storage,graphql_public,core,kestrek,odonto,voc_builder,screentime,airsoft`;
neither `net` nor `supabase_functions` is exposed. A routine-body inventory found
no exposed application/public RPC wrapper calling net/http/curl/dblink/fetch.
This is catalog evidence, not proof against every possible dynamic SQL path.
An SQL foothold under authenticated could use existing net functions; database
network egress controls remain necessary. No global PUBLIC/schema/function
revocation or network change was performed by this app SQL work.

The Supabase skill informed owner-context, effective ACL and RLS checks. Current
[changelog](https://supabase.com/changelog),
[roles](https://supabase.com/docs/guides/database/postgres/roles),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), and
[self-hosted owner-context change](https://supabase.com/changelog/46081-self-hosted-supabase-switching-studio-from-supabase-admin-to-postgres-breaking-change)
were reviewed. No platform upgrade or broad ownership migration was performed.
