# Private runtime credential checkpoint — 2026-09-20

After explicit coordinator review and GO, all 17 bounded credential operations
completed at **16:21:40–16:21:45 UTC**. This issued four private database
passwords, five scoped data JWTs, one separate Odonto identity-store JWT, six
session-encryption keys and one Odonto BFF key. It did not configure or restart
an application, publish routes, activate SSO, create users or deliver mail.

The exact inventory and environment contracts remain in the
[credential runbook](../server/accounts/operators/runtime-credentials.md) and
[seven-app manifest](ecosystem-app-config-contracts.json). Mega's existing
database credential and entire staged environment, including its existing
`ENCRYPTION_KEY`, were preserved.

## Reviewed executable and signing identity

- Source revision: `1dfde16`, committed/pushed with `[no deploy]`.
- Root-owned dependency bundle: `/opt/developed-runtime-credentials-1dfde16`;
  directories0500, seven source/dependency files0400, no runtime secrets.
- `SHA256SUMS` SHA-256:
  `2e9545a4db8e5238a557ea1bb82a49fede41499a07d12f248b0d48729a859fbf`.
- `stage-runtime-credentials.mjs` SHA-256:
  `42cb0a2754ab51a64359be600421eb9c4bccdb65a1c16206e69f8ca4844b8ac1`.
- `issue-scoped-data-key.mjs` SHA-256:
  `e033804fbac49b0a2231162ccd6ec43e8a8d282a0a7eace61296bbd3208d14c9`.
- All manifest entries verified before use. Execution used the existing
  root-owned `/opt/developed-runtimes/node-v22.23.2/bin/node`.
- Existing protected green-provider HS256 identity was copied, without rotation,
  to exclusive root-owned0600 `/etc/developed-accounts/operator-signing.json`.
  It matched running green and blue Auth and the decoded PostgREST HS256 key.
  Independent WebCrypto verification of the existing public anon JWT succeeded.
  No secret value was placed in arguments, diagnostics, documentation or Git.

An initial strict raw-string comparison stopped before any credential issuance:
PostgREST's signing configuration is a JWK set containing ES256 and HS256 keys,
not a raw HS256 string. Read-only decoding proved the existing HS256 oct key
matched exactly. This was a verification representation mismatch, not signing
identity drift; no provider or PostgREST configuration changed.

## Durable protected artifacts

Primary `/etc/developed-accounts/runtime-staging` and backup
`/var/backups/developed-accounts/runtime-staging` are root-owned0700. Each operation
has exclusive root-owned0600 `.started.json`, `.credentials.json` and
`.verified.json` files. **All 51 corresponding primary/backup file pairs matched**;
single-link/non-symlink ownership and permissions were verified. Password copies
were fsynced in both locations before the corresponding database mutation.
These are on-host recovery copies, not an off-host secret backup.

The four password operations changed only each allowlisted role's password and,
where originally NOLOGIN, LOGIN attribute. No role, grant or membership was
created, and no existing credential was overwritten. Every operation completed
without a warning or ambiguous commit. The six JWT roles remain NOLOGIN with
NULL database passwords; the identity signer remains separate from the unchanged
five-data-role CLI allowlist.

## Verification

All 17 read-only SQL guards passed before the first credential write; all 17
operator `--check` calls also passed after protected storage/signing setup and
before any `--apply`. All 17 post-operation role/configuration guards passed.

Actual host-UID PostgreSQL tests used the saved password privately, cleared
supplementary groups, no-new-privileges and read-only transactions:

| Role | Host UID:GID | Verified route | Result |
| --- | --- | --- | --- |
| `kestrek_identity_web` | 982:975 | `172.18.0.12:5432/postgres` | Correct password accepted; wrong password rejected |
| `screentime_web` | 983:977 | `172.18.0.12:5432/postgres` | Correct password accepted; wrong password rejected |
| `airsoft_identity` | 986:980 | `172.18.0.12:5432/postgres` | Correct password accepted; wrong password rejected |
| `otazkomat_identity_web` | 981:976 | `172.18.0.12:5432/postgres` | Correct password accepted; wrong password rejected |

Each role could read its own private session table. All **20 permission-negative
checks passed**: Auth password-column, central sessions, core profiles, sibling
private sessions and impersonating postgres were denied for all four roles.
An initial verifier compared an address containing `/32` to a bare IP; the
successful query was reconciled using `host(inet_server_addr())`. It was not an
authentication/HBA failure and caused no reissuance or database change.

All six JWTs independently passed WebCrypto HS256 signature and exact role,
issuer, audience, bounded lifetime, no human subject/client and expiry checks.
All seven independent keys decoded to32 bytes with their specified encodings.
No user was provisioned or synthetic user-write test run against production.

Before/after evidence covered **198 tables and 205 aggregate groups**, with
**zero unintended drift**. Role comparisons exclude only the four authorized
password/LOGIN fields; all other role attributes and credentials, memberships,
table/schema/function ACLs, function definitions, RLS/policies, provider/central
client records, migration ledgers and affected product/identity/Storage rows
matched. Mega's environment file also matched byte-for-byte.

Final controls: provider clients8; central clients8; app settings7, all
published/reportable/enforce_oidc=false and join_policy=closed; registration
closed; outbox0; central sessions0; central ledger3; app ledger10. The earlier
two anonymous acceptance sessions were already absent before this credential
operation's baseline; this workflow did not delete sessions.

Protected evidence under the backup directory: `before-evidence.json`,
`after-evidence.json`, `verification.json`, `evidence-helper.mjs` and
`verification-helper.mjs`. Only counts and nonsecret results were reported.

## Expiry and next gates

Every issued JWT expires **2026-12-18 16:00:00 UTC**. Rotation is due
**2026-12-04 16:00:00 UTC**, with a further alert due December11. These deadlines
are recorded in all six verified artifacts. Monitoring/scheduler installation
was not part of this operation; the coordinator must carry the deadlines into
the deployment inventory and monitoring. The bootstrap cannot overwrite or
automatically rotate an existing credential: use the runbook's reviewed,
versioned-destination rotation process before the deadline.

The environment-staging agent was notified that the artifacts and actual-UID
authentication checks are ready. Runtime environment changes, service starts,
public route cutover, controlled end-to-end user acceptance and public SSO
activation remain separately authorized gates. The
[closed SQL checkpoint](ecosystem-app-sql-checkpoint-20260920.md) still excludes
KešTrek's final raw-token revocation migration.
