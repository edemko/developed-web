# Six private host environment artifacts — 2026-09-20

Status: **staged, independently verified, not installed or activated**.
The coordinator reviewed source `52117605e49a7cf87018245809b94276a1679ce3`
and authorized only its immutable bundle, private staging directories and
`--check`, `--stage`, `--verify` operations. No service restart, runtime-env
replacement, database/provider mutation, email or public routing change occurred.

The reviewed bundle is root-owned at
`/opt/developed-host-environments-5211760` (directories0555/files0444).
It contains only the operator, its two source dependencies, the runbook and
the pinned app/launch manifests. It contains no credential input or output.
The contract SHA256 is
`25382bd9ba67ae0ce4eadd7ace302e53f265a5b73c11c85f1786c65266f04480`.
See the [operator runbook](../server/accounts/operators/host-environments.md).

## Protected artifacts

Primary files are under `/etc/developed-accounts/host-env-staging`; identical
backup files are under `/var/backups/developed-accounts/host-env-staging`.
Both directories are root0700. Each contains exactly24 root0600, single-link
regular files: `.started.json`, `.legacy.env`, `.central.env`, `.verified.json`
for each of the following six slugs. Creation used exclusive/no-follow writes,
with file and directory fsync before proceeding to the next phase. Legacy
backups preserve the exact original file bytes, including removed credentials.

| Slug | Original runtime file (unchanged) | Session connection in staged copy |
| --- | --- | --- |
| mega-music | `/etc/developed-apps/mega-music.env` | Exact existing `mega_music_web.oc-prod` Supavisor tuple at127.0.0.1:5432/postgres retained |
| screentime | `/etc/developed-apps/screentime.env` | `screentime_web` at172.18.0.12:5432/postgres |
| kestrek | `/etc/developed-apps/kestrek.env` | `kestrek_identity_web` at172.18.0.12:5432/postgres |
| airsoft | `/etc/developed-apps/airsoft-green.env` | `airsoft_identity` at172.18.0.12:5432/postgres |
| vocabulum | `/etc/developed-apps/vocabulum-green.env` | Existing HTTPS PostgREST, scoped `vocabulum_backend`; no direct DSN added |
| otazkomat | `/etc/developed-apps/otazkomat.env` | `otazkomat_identity_web` at172.18.0.12:5432/postgres |

The four scoped data JWTs have valid HS256 signatures and exact app roles,
issuer `https://sam-api.developed162.bid/auth/v1`, audience `authenticated`,
and expiry **2026-12-18T16:00:00Z**. Their credential issuance markers record
rotation due **2026-12-04T16:00:00Z**; rotation monitoring remains a deployment
obligation. Existing public anon JWT roles and future expiry also passed.
Airsoft and Mega do not receive data JWTs. Odonto's remote environments are
outside this six-host-artifact operation.

Each staged copy has the exact central/app origins and private client/server
keys from protected registration files; callback tuples match the pinned
catalog. KešTrek also receives its independently registered native client ID.
All six staged runtime flags are true; ScreenTime's public flag is also true,
matching the independently built central-enabled a3df8a4 artifact. No secret
was supplied to a browser build. The original six runtime flags remain false.

Mega's saved-S4 encryption key and full original database URL are preserved.
KešTrek's existing encryption/MCP/ChatGPT settings, ScreenTime S4 keys,
Vocabulum NextAuth and AI encryption keys, Otázkomat settings encryption key,
and all other allowlisted product settings were retained. New central session
keys are independent. Single-owner cleanup/notification flags remain false.
Absent Mega managed-S4/import settings remain absent; this does not qualify
managed-storage or import functionality.

All provider administrator/service-role and Mailjet environment settings are
absent from the staged copies. The runbook records the exact source reasons
for Mailjet removal: only identity mail and admin diagnostics were found.
Database-stored encrypted mail settings were not changed. No removed credential
was revoked by this operation, and the old serving processes were unchanged.

## Verification and remaining boundary

The immutable operator's first complete `--check` passed with no output files.
`--stage` then completed once; `--verify` independently reloaded all inputs and
checked every staged value and marker. There was no failed/partial staging
attempt and no deleted marker or overwritten artifact.

A separate read-only checker compared all24 file pairs, verified both directory
modes and all48 file ownership/mode/link counts, compared every legacy backup
to its original runtime file, and checked the stored payload/source digests.
Independent before/after SHA256 inventory confirmed all six original files are
unchanged. It also checked flags, exact new DSN tuples, retained data keys,
absence of legacy credentials, and data JWT roles/signatures/expiry. All passed.
Only metadata was emitted; credential values stayed in protected memory/files.

Source verification:9 focused environment-operator tests passed. The complete
central account suite passed87 tests, with15 explicitly opt-in tests skipped
and zero failures. `git diff --check` passed. Fixtures cover wrong/expired/
future/tampered JWTs, wrong-role/tenant/database destinations, session-key reuse,
callback substitution, environment escaping, duplicate/symlink/Git-path refusal
and interrupted-backup ordering. No live acceptance test or email was sent.

These copies are reviewable deployment inputs, not live runtime configuration.
Do not point an old compiled ScreenTime candidate at the new true public flag.
Installing exact environments, selecting qualified immutable app/frontend
artifacts, coordinating single-owner jobs/MCP state, closing provider/data
bypasses, enabling enforcement/publication and real product acceptance remain
the coordinator's subsequent cutover work. Retain both private copies and
original files for reconciliation; off-host recovery remains separately scoped.
