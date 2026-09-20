# Private runtime credential bootstrap

`stage-runtime-credentials.mjs` is a source-qualified, root-only operator for
the already staged roles. Its development and tests issue no live credential,
change no production role, write no runtime environment, and activate no app.
Use it only after coordinator review of the exact immutable dependency bundle.

The [live SQL checkpoint](../../../docs/ecosystem-app-sql-checkpoint-20260920.md)
and separately attached seven web/one native clients are prerequisites. Before
every operation it checks the exact three central/ten app checksum rows and
protected ledger ownership/RLS; all seven expected app IDs, slugs, launch and
callback URLs; eight enabled central clients referencing eight existing provider
clients; publication/reporting/enforcement false; and closed join/registration.
It checks the selected role's attributes, memberships and grants, and rejects
effective foreign-app/core data, Auth password-column, central-session and
outbound HTTP access. Missing any one required session CRUD grant fails.

## Fixed credential inventory

| Product | Password operation / role | JWT operation / role | Independent key operation / encoding |
| --- | --- | --- | --- |
| Mega | Preserve existing `mega_music_web` credential | None | Preserve existing `ENCRYPTION_KEY` |
| KešTrek | `kestrek-db` / `kestrek_identity_web` | `kestrek-data` / `kestrek_backend` | `kestrek-session` / 32-byte hex |
| ScreenTime | `screentime-db` / `screentime_web` | `screentime-data` / `screentime_backend` | `screentime-session` / 32-byte base64 |
| Airsoft | `airsoft-db` / `airsoft_identity` | None; user OAuth bearer accesses data | `airsoft-session` / 32-byte hex |
| Vocabulum | None | `vocabulum-data` / `vocabulum_backend` | `vocabulum-session` / 32-byte base64url |
| Odonto frontend | None; identity role stays NOLOGIN | `odonto-identity` / `odonto_identity_web` | `odonto-session` / 32-byte hex; `odonto-bff` / 32-byte base64url |
| Odonto API | None | `odonto-data` / `odonto_backend` | Reuse the new `odonto-bff` value, independently from every other secret |
| Otázkomat | `otazkomat-db` / `otazkomat_identity_web` | `otazkomat-data` / `otazkomat_backend` | `otazkomat-session` / 32-byte base64 |

These are exactly 17 bootstrap operations: four database passwords, five data
JWTs, one identity JWT, six session keys and one BFF key. No arbitrary role,
database target, credential value, output path or platform/admin key is accepted.
Mega's existing encryption key also protects existing account/S4 material;
replacing it with a newly generated key would prevent decryption. It is not an
operation in this tool. Preserve its database credential too.

The five-role `issue-scoped-data-key.mjs` CLI remains unchanged in scope and
still rejects identity-store roles. Its new separate `signIdentityStoreKey`
operator API accepts only `odonto_identity_web`; that API is used solely by
the explicitly named `odonto-identity` operation. Both use the existing reviewed
HS256 signing identity, issuer and audience, never a human subject or client ID.
JWT expiry is explicit, at least five minutes and at most ninety days away.

Exact environment names and origin/callback/build-flag contracts are in the
[seven-app manifest](../../../docs/ecosystem-app-config-contracts.json).
Passwords are emitted as role/password/database fields, not a guessed connection
URL: private host/port/HBA/network paths need their own reviewed configuration.
The five data JWTs map to `SUPABASE_DATA_API_KEY`; Odonto frontend identity maps
to `ECOSYSTEM_SESSION_API_KEY`. OIDC client secrets and central app-check keys
come from the existing private client staging files, not this operator.

## Protected storage and invocation

Default invocation validates the plan offline without Docker, secret input or
file creation:

```sh
node server/accounts/operators/stage-runtime-credentials.mjs --credential kestrek-db
node server/accounts/operators/stage-runtime-credentials.mjs \
  --credential odonto-identity --expires-at 2026-10-20T15:00:00Z
```

The example expiry is illustrative and must be deliberately selected at actual
issuance. `--check` adds a read-only live preflight; `--apply` performs the single
named operation. Both require root, literal `supabase-db` with the reviewed exact
PostgreSQL image, and these existing root-owned0700 directories:

- `/etc/developed-accounts/runtime-staging`
- `/var/backups/developed-accounts/runtime-staging`

JWT operations additionally require root-owned0600, single-link, non-symlink
`/etc/developed-accounts/operator-signing.json` in the existing private parent.
Its schema is the existing signing JSON contract in [README](README.md). Obtain
the current signing material privately through the trusted operator channel;
never put it in argv, the app runtime, repository, bundle, CI artifact or logs.
The operator does not discover or copy platform secrets automatically.

All three phase files for an operation must be absent in both locations.
The operator exclusive-creates and fsyncs primary/backup `.started.json` files
and their directories, then generates the credential and fsyncs identical
`.credentials.json` copies **before any database password mutation**. Successful
verification writes identical `.verified.json` files to both locations. Every
file is mode0600, and paths reject symlinks, hardlinks, Git ancestors and unsafe
permissions. These are on-host backups; arrange off-host secret recovery separately.

On failed backup writes, no password change is attempted. On any ambiguous DB
result the two saved credential copies remain available and no automatic retry
or rotation occurs. Existing markers/files refuse another apply. Never delete
the markers merely to try again: inspect the protected files and role state,
verify authentication using the saved password, and reconcile deliberately.

## Database password behavior

Only the four named existing identity roles can receive LOGIN/password. They
must have their expected initial LOGIN state, NULL password, no inherited role
memberships, no superuser/BYPASSRLS/role creation/database creation/replication,
and the reviewed session privileges. No role or schema is created, no grant is
added, and other role attributes remain unchanged.

A new 32-byte base64url password is generated privately. The operator derives a
PostgreSQL SCRAM-SHA-256 verifier locally; only that verifier travels to PostgreSQL
over stdin, never the cleartext password or a secret command-line argument.
Session-local statement/duration/error-statement/pgaudit logging is suppressed
before the verifier is sent. No global logging configuration is changed.
Trusted PostgreSQL catalog/activity inspection remains privileged access.

The password transaction rechecks the entire preflight, takes the deployment
advisory lock, uses 500ms lock/5s statement limits, and share-locks configuration.
Merged psql output/diagnostics precede a completion marker; a warning/error
causes rollback before COMMIT. After commit the stored verifier's digest and
LOGIN state are checked without returning credential values. Reapplying a
password refuses even if files were manually removed because the role password
is no longer NULL. Session-key checks intentionally permit the safe private role
state before or after this password bootstrap; JWT roles stay NOLOGIN/password-null.

Before staging or starting a real runtime, independently prove correct-password
authentication and wrong-password rejection over its actual private route,
then verify role-specific data denial and preserve closed flags. Setting a role
password alone does not prove network/HBA reachability or authorize a service start.

## Expiry and rotation obligations

JWT `.verified.json` records both `expiresAt` and `rotationDueAt` (14 days before
expiry, or immediately for a shorter-lived key). Include these dates in deployment
inventory and operator monitoring; alert again seven days before expiry. Complete
rotation of all replicas before expiry to avoid a predictable outage. The tool
does not install a scheduler or silently renew keys.

This bootstrap tool uses fixed exclusive names and intentionally has no overwrite
or automatic rotation mode. A subsequent rotation needs reviewed versioned
destinations and the same durable primary/backup, scoped-role and access checks.
The five-role offline signer already supports distinct output files; its output
alone does not supply this workflow's dual backup. Odonto identity rotations
must retain the separate identity signer, never broaden the data-role allowlist.
Keep this as an explicit maintenance task before the recorded deadline. Issuing
a replacement JWT does not revoke the old JWT; `jti` is inventory, not revocation.
Do not rotate the shared provider secret to rotate one application's credential.

## Qualification

On 2026-09-20 the focused credential/signer suite passed all 15 tests with the
isolated PostgreSQL fixture enabled (no skips). The account suite passed 78 tests,
with 15 explicitly opt-in checks skipped and no failures. The fixture checks all
17 plans and rejects a missing individual CRUD grant or identity RPC grant.

Tests use synthetic signing material, private temporary files and a newly created
network-disabled PostgreSQL17 fixture; they neither read live signing material
nor run credential operations against a retained/shared database. They verify
durability ordering, backup failure, ambiguous DB recovery copies, exact allowlists,
separate identity signing, all key encodings, closed/client/grant preconditions,
SCRAM authentication and wrong-password rejection, unchanged safe attributes,
duplicate refusal and warning rollback. Even with fixture statement/duration
logging enabled, neither generated password nor stored verifier appears in logs.

```sh
RUNTIME_CREDENTIAL_SQL_TEST=1 node --test \
  server/accounts/test/runtime-credential-operator.test.mjs \
  server/accounts/test/scoped-key-operator.test.mjs
npm test --prefix server/accounts
```

Primary references: [PostgreSQL17 password authentication](https://www.postgresql.org/docs/17/auth-password.html)
and [SCRAM-SHA-256](https://www.rfc-editor.org/rfc/rfc7677). Existing Supabase owner,
ACL and RLS requirements from the app SQL qualification also apply. This source
qualification is not approval to issue production credentials or activate SSO.
