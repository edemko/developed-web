# Live closed app SQL checkpoint — 2026-09-20

The closed seven-app seed and nine reviewed additive app migrations were applied
to `supabase-db` at **15:50:33–15:50:35 UTC** using reviewed operator revision
`f7f9d5e`. Each exact source and checksum ledger row committed together in its own
transaction, with the 500ms lock bound and warning-before-COMMIT checks. Every
transaction succeeded without warnings. The source files/operator matched the
reviewed commit; no uncommitted source was applied.

This is closed database staging only. KešTrek's raw-token cutover was not run.
No OAuth client attachment, database password, data JWT, account action, mail,
publication, reporting, enforcement or registration activation was performed.
No service was restarted. The two original source `NOTIFY pgrst` statements
requested ordinary schema cache reloads after their transactions.

## Fresh recoverable backup

A new consistent physical backup was completed around **15:47 UTC**, capturing
the current central role credentials and eight provider OAuth registrations as
well as all shared identities and product data. Protected directory:

`/home/openclaw/pg-backup/app-staging-checkpoint-20260920-US2AEE/`

- `base/`: plain-format `pg_basebackup` with streamed WAL; verified in the source
  container and again from the copied read-only host backup using `pg_verifybackup`.
- Manifest SHA-256:
  `077a6f722f128ca7f991019f0220cc0dcf1b235b49712a4cba673117a19ccaad`.
- `restore/`: independent copy recovered under the exact installed image
  `sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`.
  Its initial catalog matched the live pre-apply catalog in all 169 comparison
  groups. The exact seed and nine migrations also passed there before live apply.
- Disposable container `developed-app-migration-test-202609201546-db` is stopped
  with its data retained. It used network `none`, no TCP listener/published port,
  read-only root filesystem, no capabilities, no-new-privileges, UID100:GID101,
  768MiB memory without extra swap, one CPU, 160 PIDs and disabled preload workers.
- The root-owned checkpoint directory permits owner access only; evidence files
  are mode0600. Its retained footprint was approximately 312MiB. The redundant
  temporary backup in the live container's `/tmp` was removed only after both
  copied-backup verification and restore proof; the complete host backup remains.
- The previous 14:49 physical backup, WAL archive and all earlier retained
  restore data were preserved. The live cluster was never restored, promoted,
  stopped or replaced. This remains an on-host database checkpoint, not an
  off-host backup or a substitute for separate encryption/signing/storage backups.

Protected evidence: `preapply.json`, `restored.json`, `postapply.json`,
`permissions.json`, `aggregate-check.mjs` and `permission-check.mjs`.
They contain aggregates and catalog evidence; no row contents, UUIDs, provider
credentials or role password hashes were printed to the terminal or committed.

## Exact committed app ledger

Ledger: `accounts.app_deployment_migrations`, owned by postgres, forced RLS,
without runtime/PUBLIC access. The central ledger still has its original three
unchanged rows. Versioned source filename and full source checksum are recorded
atomically; seed has its own fixed operation name and SQL-body checksum.

| Source | Applied UTC | SHA-256 |
| --- | --- | --- |
| `closed-seven-app-prerequisites-v1` | 15:50:33.487135 | `4509d8a4689f4d45331120ed4f4be5696a6c57774df870d10e03d2facaf5a3d6` |
| `20260920070834_mega_music_ecosystem_sessions.sql` | 15:50:33.753248 | `b99a2c7db6a65f847539fbef97981a8ad0bd506ca35ea72b4ed6562dff58ded8` |
| `20260920071554_kestrek_ecosystem_sessions.sql` | 15:50:34.016873 | `fbca5d59e6efee43ee138084341ee063452f1f9fc691ad26e79ab022b65faccc` |
| `20260920071953_ecosystem_web_sessions.sql` | 15:50:34.237759 | `4fdc1b98364d6e3061401e92375a1423e7c6e7d3b76e4e80e103abc3a2e603c6` |
| `20260920123109_airsoft_ecosystem_sessions.sql` | 15:50:34.487825 | `0ffb4a6a9d4bf274bb88e6cf42e2cd4644ab22488ba55265992ea27abe8247df` |
| `20260920123043_ecosystem_oidc_sessions.sql` | 15:50:34.705949 | `494ce8743fb07285af82eb8a11fa064c6f24365457f28f6f4ebb4f09edfdc431` |
| `20260920123136_odonto_private_identity_sessions.sql` | 15:50:34.967504 | `da84609251c7d74b2681f2f21b800b17fce6a52b71755eb21ed1129aa9511aca` |
| `20260920123206_central_web_sessions.sql` | 15:50:35.170534 | `2e8507fb29205ba524bcefd767fe7a61fc5d0285209bc547e63cda224847c0fb` |
| `20260920124145_ecosystem_scoped_data_roles.sql` | 15:50:35.486955 | `afdedec52b8c98b7db2bb8125d661f03a4f88b250698e5bb55a7c7732b6965c1` |
| `20260920132100_odonto_identity_https_store.sql` | 15:50:35.741447 | `16d900304deaf8a9893028a0e680a0ad573b143bcd7d8f4765646ef95410c51f` |

## Live verification and preserved state

All **169/169 aggregate groups matched**, covering **163 pre-existing tables**
across Auth, core, seven products and Storage, existing role attributes and
credential hashes, existing-role memberships, central migration history,
Auth/core policies and existing trigger definitions. Row comparisons ignore only
Mega's added nullable provider-token column. Product migration-history inserts,
new objects and intended grants/policies are checked separately. No pre-existing
row drift was detected; provider clients and Auth migration history were unchanged.

All **112 read-only checks passed**, using read-only transactions and actual
`SET LOCAL ROLE` queries where appropriate. No synthetic provisioning or user
write test was run against production. Evidence covers:

- Seven legacy request gates return true with enforcement off; anon cannot call
  the gate. Existing anon/authenticated KešTrek schema access remains present.
- Fifteen new private identity/session tables have RLS; browser/anon and, for
  the separately isolated stores, service-role reads fail. Runtime/public roles
  cannot read the app checksum ledger.
- All five backend roles fail foreign-product, Auth password-column and central
  session-table reads. They cannot execute `net.http_get`.
- Odonto's identity role can call its safe configuration RPC; browser/anon,
  service_role and Odonto's data backend cannot. Identity and data stores remain
  separate.
- Storage roles see their own approved buckets and no foreign bucket/object
  rows. New role attributes and memberships match the reviewed boundaries.
- Otázkomat's global-user-deleting routine remains callable by the legacy
  `service_role`, while authenticated and the new product backend cannot call
  it. This intentional source ACL change is separate from the still-unapplied
  KešTrek final cutover.

Observed controls immediately after apply:

| Control | State |
| --- | --- |
| App deployment ledger | 10 exact rows |
| Central deployment ledger | 3 unchanged rows |
| App settings | 7 existing core IDs; published/reportable/enforce all false; join closed |
| App OAuth ID/server-key hash/callback | All null |
| `auth.oauth_clients` | 8 unchanged provider registrations |
| `accounts.oauth_clients` | 0 |
| Registration | closed |
| Central sessions | 2 existing anonymous bootstrap sessions |
| Outbox | 0 |
| New app roles | 10; passwords null; no inherited memberships or privileged attributes |
| Authenticator impersonation | 6 intended non-admin memberships: five data roles plus Odonto identity |

The earlier [operator qualification](ecosystem-app-sql-operator-20260920.md)
records isolated first-use/two-owner tests and the existing outbound-network
function inventory. Network/provider closure, browser/native acceptance and
runtime credentials are separate rollout gates; these SQL results do not
activate SSO or establish complete application readiness.

## Credential/configuration work still pending

Attach the existing eight provider registrations through the reviewed central
configuration operators, preserving publication/enforcement/registration off.
Provision unique private credentials and approved connection paths for KešTrek,
ScreenTime, Airsoft and Otázkomat identity stores; preserve Mega's existing scoped
connection. The already-created ScreenTime/Airsoft LOGIN roles have no password;
KešTrek/Otázkomat identity roles remain NOLOGIN until that explicit provisioning.

The five backend roles stay NOLOGIN and require separately issued finite-lived
scoped data JWTs. Odonto's identity role stays NOLOGIN and requires its separate
identity-store JWT, never a data-backend or platform administrator credential.
Central app-check keys and provider client secrets remain protected server
configuration. None were issued or attached by this SQL checkpoint.

Never rerun this staging sequence after configuration: duplicate history and
changed closed prerequisites intentionally fail. Reconcile changes forward;
do not restore the shared cluster or reopen retired credential paths to undo an
additive schema step. KešTrek final raw-token revocation remains gated on the
coordinated product/native/public-ingress cutover.
