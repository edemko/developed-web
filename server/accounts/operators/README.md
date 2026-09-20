# Offline credential and migration operators

These tools prepare reviewed operations; they do not enable SSO. Keep central
publication, registration and every product integration off until the full
security cutover. Do not place signing configuration or generated credentials
in a repository, release, public root, app runtime or CI artifact.

## Scoped data JWT issuance

`issue-scoped-data-key.mjs` issues only the five reviewed data roles:
`kestrek_backend`, `screentime_backend`, `vocabulum_backend`, `odonto_backend`,
`otazkomat_backend`. It rejects administrator, browser and identity-store roles.
Odonto's separate `odonto_identity_web` session key is deliberately outside this
allowlist and requires its own reviewed operator workflow.

The existing production configuration was inspected without printing keys on
2026-09-20: GoTrue has ES256 and HS256 signing material; PostgREST has the matching
EC public key and HS256 oct key; Storage's symmetric verification secret matches
that HS256 key. The application's scoped-key validators also require HS256.
This operator therefore uses the existing HS256 secret, with the fixed issuer
`https://sam-api.developed162.bid/auth/v1`, audience `authenticated`, and an
explicit expiry. It does not rotate provider keys, modify JWKS or change signing
identity. A future algorithm/issuer migration requires separate source review.

Prepare an operator-only JSON configuration in an existing private directory,
outside Git. The containing directory must be owned by root or the invoking
operator and mode0700; the file must be mode0600 with one hard link. Ancestor
directories must not be writable by other users (a sticky temporary ancestor is
accepted for offline tests). Symlink components and existing output files fail.
The configuration has exactly these fields:

```json
{
  "version": 1,
  "algorithm": "HS256",
  "issuer": "https://sam-api.developed162.bid/auth/v1",
  "audience": "authenticated",
  "jwtSecret": "<existing platform HS256 secret, inserted privately>"
}
```

The operator must obtain the existing secret through a protected local channel.
Never put it on the command line, paste it into a transcript, export it to app
runtimes, or print Docker environment values. This tool does not auto-discover
or copy live secrets. It must run only under the trusted deployment identity.

Validation is the default and creates no credential or output file:

```sh
node server/accounts/operators/issue-scoped-data-key.mjs \
  --config /protected/operator/signing.json \
  --role kestrek_backend \
  --expires-at 2026-10-20T12:00:00Z \
  --output /protected/operator/kestrek-key-20261020.json
```

The example expiry is illustrative; choose an explicit current UTC expiry.
Minimum remaining lifetime is five minutes, maximum ninety days. Add `--write`
only for issuance. The exclusive-created mode0600 JSON output contains the token
and non-secret role/algorithm/issuer/audience/issue-time/expiry metadata. Only
status, role and expiry appear on stdout; errors never echo arguments or files.
The tool makes no network request and performs no database or service mutation.

Supply the output's token privately as the app's `SUPABASE_DATA_API_KEY`. Keep
the existing public anon key as Kong's `apikey`; the role JWT is Authorization.
Do not give an app the signing configuration. The token has no human `sub`,
client ID or provider session; it is a machine data credential, not user login.
Upstream PostgREST/Storage verifies its signature, while grants and RLS enforce
scope. The public data filter is an additional denial boundary, not verification.

For rotation, generate a new file, stage it into a fresh protected runtime
configuration, test own-data/storage access and forbidden-schema/bucket/RPC
denial, then switch the affected app gracefully. Retain the old credential only
for its bounded rollback window. Monitor expiry well before the deadline (for
example 14 and 7 days) and roll all replicas before expiry. Issuing a new JWT
does **not** revoke an old one: both remain valid until expiry unless an explicit
role/network/ingress revocation is performed. `jti` is inventory metadata, not a
revocation list. Do not rotate the shared signing secret to rotate one app key.
Retired key files are sensitive; dispose of their exact paths through the
operator's existing credential-retention procedure, never repository cleanup.

Tests use synthetic signing material and temporary private files only:

```sh
node --test server/accounts/test/scoped-key-operator.test.mjs
```

## Private staging: migration and backup prerequisites

Live catalog metadata at 2026-09-20 14:38 UTC showed no `accounts` schema or
`developed_accounts` role, all seven core app IDs present, Auth's latest migration
`20260302000000`, and no central Supabase CLI migration ledger. Product ledgers
exist in each product schema and have differing columns. None of the new product
identity versions appeared in the inspected per-app histories. Do not run
`supabase db push`, replay a platform baseline, or assume that a migration's
absence from a nonexistent CLI ledger makes it safe to apply twice.

WAL archiving was enabled, `failed_count=0`, with latest success
`2026-09-20T14:30:17Z`; latest named base backup was `base_20260920T003001Z`.
These observations establish backup activity, not a fresh successful restore.
Read `/home/openclaw/pg-backup/RESTORE.md`, but do not follow its whole-cluster
promotion/down commands for this additive change. Use a newly allocated,
labelled disposable restore directory/container, exact current Postgres image,
read-only archive mounts, no network listener, and bounded CPU/memory. Verify
the manifest/WAL chain, recover to an explicit recent target, and compare only
schema/migration metadata and non-sensitive counts. Keep storage objects and
configuration/signing/encryption material in separately protected backups.
Never overwrite the live data directory or restore over new production writes.

For the central three migrations, `apply-central-migration.mjs` uses the atomic ledger
`accounts.deployment_migrations(version, source_sha256, applied_at)`, owned by
postgres and unavailable to runtime roles. The original source SQL remains
unchanged and checked against an exact SHA-256 allowlist in the runner. It inserts its ledger row immediately
before that exact migration's final COMMIT, inside the same transaction, and
takes a deployment advisory lock. The first migration creates the ledger after
creating `accounts`; later ones require their predecessor's recorded checksum.
Existing `accounts` without a matching ledger must stop for explicit catalog
reconciliation, never auto-adopt or replay. Changed hashes and duplicate applies
fail. The ledger has forced RLS, no policies and explicit revokes from PUBLIC,
anon, authenticated, service_role and developed_accounts. Only the trusted
container-local `supabase_admin` operator session can apply, normally acting as
`postgres`. The runner verifies provider/core ownership before DDL. `psql --single-transaction` around these already transaction-wrapped
files is insufficient: their own COMMIT ends that outer transaction.

Apply only these three initially: central v1, native clients, TOTP sessions.
The shared scoped-data migration must wait for every app session/provisioning
prerequisite. Record app migrations in their existing ledgers according to the
app runbooks; Airsoft's new file already records its own version. Replaying a
non-idempotent migration to repair missing history is unsafe.

Default local-only validation reads the hash-pinned source and makes no Docker
or database connection:

```sh
node server/accounts/operators/apply-central-migration.mjs \
  --migration 20260920070607_developed_accounts_v1.sql
```

After backup/restore and the remaining preflight gates are proved, the explicit
production apply form adds `--container supabase-db --apply`. Run one file at a
time in the listed order, inspect the protected ledger after each successful
operation, and stop on any failure. The runner accepts no database URL, arbitrary
SQL/file path, unlisted migration, checksum override or automatic history repair.
It rejects existing central objects without its ledger, repeats, changed source,
missing/mismatched predecessors and concurrent runner work. Database error details
are captured but never printed. If a connection is lost around COMMIT, inspect
the exact ledger/checksum before retrying; do not infer rollback from an ambiguous
transport error. It preserves each source's transaction and lock/statement
timeouts, adding bounded defaults for the MFA migration that lacked them.
The operator reasserts its 500ms lock limit **after** the exact known source
timeout prefix, so v1's original 5s value cannot override it. It retains the
native migration's 5s statement limit and uses 30s for v1/MFA. Unexpected timeout
statements are rejected; the original migration files and ledger hashes do not change.

The production `postgres` role is not a superuser or Auth table owner. Exact
source-hash-checked boundaries use existing `supabase_auth_admin` only for Auth
column grants and policies. Existing `supabase_admin` handles only the Auth
schema USAGE grant and the exact account gate function ownership/replacement.
All ordinary account DDL and ledger work runs as `postgres`; the gate function
ends owned by `developed_accounts`, with its empty search path and public revoke
preserved. Its exact EXECUTE grant/revoke statements run as that function owner;
otherwise PostgreSQL can warn and leave PUBLIC execution intact. No role memberships or extra privileges are added to operator/runtime
roles to make this work. Rehearse against the actual restored ownership graph;
a fixture where `postgres` is the bootstrap superuser misses these failures.

The only alternate target accepted is a matching
`developed-central-migration-test-<digits>-db` container with the exact test
label. The opt-in SQL test creates its own bounded network-disabled PostgreSQL17
container, then removes only that validated container and its anonymous volumes.
It does not use the retained provider fixture or production data. Its minimal
schema tests the operator's transactional behavior, not provider compatibility
or backup restoration:

```sh
node --test server/accounts/test/central-migration-operator.test.mjs
CENTRAL_MIGRATION_RUNNER_SQL_TEST=1 \
  node --test server/accounts/test/central-migration-operator.test.mjs
```

The real SQL test proves ordered application and checksum recording, runtime
ledger/factor-secret denial, unchanged closed registration, duplicate refusal,
and rollback of the actual native-client DDL when the ledger insert fails.
No central migration was applied live by development or these tests.
The later explicit production operator apply and isolated restore evidence are
recorded in the [2026-09-20 database checkpoint](../../../docs/ecosystem-db-checkpoint-20260920.md).

## Minimal green-provider preparation contract

The coordinator owns the concrete green-provider config and network changes.
The metadata below specifies its inputs, not executable placeholder deployment
commands:

- Existing Auth image ID:
  `sha256:385184459f57569c54c25209f51f3b2be99ddd7c4ce9e3555b5d3eea8447b7cf`
  (`supabase/gotrue:v2.189.0`); migrations path
  `/usr/local/etc/auth/migrations`, latest bundled version `20260302000000`,
  matching the inspected live Auth ledger. Recheck parity before startup.
- Existing provider DB connection uses `supabase_auth_admin`, host `db`,
  port5432, database `postgres`. Preserve its password and query/search-path
  parameters privately. Do not substitute postgres or add privileges.
- Allocate an unused dedicated bridge/subnet and fixed green Auth IP. Attach
  only green Auth and the existing database's additional interface, with alias
  `db`, or use a separately reviewed DB-only proxy. Do not add green Auth to
  `supabase_default`. Adding a DB interface requires fresh route/ACL validation.
  Do not blindly use Docker `--internal`: its host-port reachability differed
  from the tested non-internal qualification network and requires qualification.
- Prepare a root-owned0600 green env file from the reviewed private blue
  configuration without printing it. Preserve issuer, signing keys, audience,
  DB identity, disabled public signup and relevant provider compatibility flags.
  Change only OAuth enabled=true, dynamic registration=false, central Site URL
  `https://www.developed.sk`, authorization path `/account/authorize`, and exact
  reviewed redirect allowlist. Do not copy the fixture's auto-confirm, fake keys,
  postgres connection or `/account/oauth/consent` test path.
- Create (do not start) the capped green container with exact image, non-root
  runtime, no capabilities/new privileges, dedicated network, explicit DB route,
  and host binding `127.0.0.1:3141:9999`. Install the reviewed UID and container
  network boundary first. The root/central/Caddy exceptions must cover both
  loopback3141 and the exact private green IP9999.
- Start green only after the gate/health prerequisites; check `/health` and
  migration-version parity without users, tokens or secret log output. Keep
  blue serving. Root-only private probes may inspect discovery metadata; no
  public OAuth/portal route or app flag changes belong to this private stage.

Do not use `docker compose down`, force-recreate blue, rotate keys, send mail,
create identities, register clients, or activate SSO merely to validate startup.
