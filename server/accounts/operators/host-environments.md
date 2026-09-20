# Private host central-mode environment staging

`stage-host-environments.mjs` prepares six root-private environment artifacts
without installing them, connecting to a database/provider, restarting a service,
changing a route, sending mail or enabling registry/public access. Its default
invocation is an offline plan. There is deliberately no live `--apply` operation.

The exact source/runtime paths, origins, callback paths, encodings and data roles
come from the SHA256-pinned
[`ecosystem-app-config-contracts.json`](../../../docs/ecosystem-app-config-contracts.json).
Changes to that manifest require reviewing this operator's pin and tests. Read
each product's linked evidence and deployment runbook before subsequent use.

## Required protected inputs

The coordinator must first finish and verify the private client and runtime
credential operators. This operator reads only the six manifest runtime paths,
the fixed client/runtime staging files, their protected backup copies and the
existing operator signing JSON. It never prints or stores that signing key in
an application artifact. Runtime credential copies and verified markers must
agree; client registration/attachment tuples must exactly match the pinned
catalog. Source app environments must still have the runtime central flag false.

Existing `/etc/developed-apps` is root0755 and each source file is root0600.
Only these six exact read paths allow that directory mode; all secret staging
inputs/outputs use root0700 parents and root0600 single-link regular files.
Symlinks, unsafe ancestors, unknown environment settings and changed source
inputs are rejected. Environment parsing is a strict single-line subset of
systemd `EnvironmentFile`, preserving literal dollar signs, quotes, backticks,
backslashes, spaces and Unicode. Ambiguous syntax fails closed.

Credential contracts are in [runtime-credentials.md](runtime-credentials.md).
Four new direct DSNs use the coordinator-reviewed exact target
`172.18.0.12:5432/postgres`, with the existing named roles
`kestrek_identity_web`, `screentime_web`, `airsoft_identity` and
`otazkomat_identity_web`. No arbitrary host/port/role argument is accepted.
The network coordinator's positive/negative actual-UID password probes remain
separate evidence; constructing a DSN is not an authentication test.

Mega's exact existing `DATABASE_URL` and `ENCRYPTION_KEY` values are preserved.
Its observed Supavisor tuple is `mega_music_web.oc-prod` at
`127.0.0.1:5432/postgres`; the tenant-qualified login resolves the existing
`mega_music_web` database role. This exact old tuple is validated separately
from the four new direct database connections.
The key protects existing saved S4 credentials, so it is never regenerated.
KešTrek's MCP path, ChatGPT credentials, existing encryption key and email-token
key remain unchanged; central sessions get their independent new key.
ScreenTime's S4 update credentials, Vocabulum's existing NextAuth and AI keys,
Otázkomat's data-settings encryption key, and other allowlisted application
settings are preserved. This does not configure absent managed-S4/import keys.

All shared provider administrator/service-role/signing environment names are
removed. Unknown aliases fail the allowlist; preserved JWT values must be anon
or the exact new app data role and must have finite future expiry. New session
keys cannot reuse existing application encryption or session keys. Scoped data JWTs additionally require valid
HS256 signatures, exact issuer/audience/role, no human/client claims, finite
future expiry (over five minutes remaining), and a lifetime at most ninety days.
New confidential credentials must be distinct and cannot enter public variables.

Mailjet env settings are removed from all six artifacts after source inventory:

- Mega `server/accounts/README.md` explicitly retires its identity mail keys.
- KešTrek `backend/src/mailjet/email.service.ts` implements welcome, verification
  and password-reset messages; its only production callers are in auth. No
  Mailjet caller exists in notification/report modules. Admin diagnostics alone
  do not require retaining identity sender credentials.
- Vocabulum `lib/email.ts` exports only password-reset email.
- Otázkomat `backend/routes/auth.js` sends identity mail. Its organization invite
  mail is behind `localRegistrationGuard`, disabled in central mode; remaining
  mail routes are admin diagnostics. No separate business-report sender was found.
- Airsoft and ScreenTime source runtime inventories have no Mailjet settings.

Existing database-stored encrypted mail settings are not changed or revoked.
If an additional business mail use is evidenced, review that exact app's
allowlist and document the reason before staging; do not silently preserve a
shared sender key. The byte-for-byte legacy backups retain all old env values.

## Invocation and recovery

Use a reviewed immutable operator bundle containing this file, the signer and
private-client modules, and both pinned manifests at their relative paths.
The operator imports no app runtime or mutable credential-generation module.
Create only the following new empty root0700 directories after review:

- `/etc/developed-accounts/host-env-staging`
- `/var/backups/developed-accounts/host-env-staging`

Run with the reviewed root-owned Node22 binary and a clean environment:

```sh
node server/accounts/operators/stage-host-environments.mjs
node server/accounts/operators/stage-host-environments.mjs --check
node server/accounts/operators/stage-host-environments.mjs --stage
node server/accounts/operators/stage-host-environments.mjs --verify
```

The last three modes require root. `--check` validates all six complete payloads
and requires every output absent, writing nothing. `--stage` completes the same
preflight before the first write. For each slug it exclusively creates and
fsyncs `.started.json` in both directories, then byte-identical `.legacy.env`
backups, then identical `.central.env` payloads, then read-verifies both copies
before writing `.verified.json` metadata. Files and containing directories are
fsynced before the next phase; existing names are never overwritten.

Any failure leaves recovery material in place. Never delete markers and retry
automatically. Reconcile the two protected directories and source file hashes;
no partial artifact is permission to install an environment. `--verify` checks
all payloads, backups, metadata, protected permissions and current JWT validity
again. Standard output contains only status, names, paths, hashes, roles and
expiry metadata; errors are generic, without credential-bearing exception text.
Backups are on-host recovery copies; off-host protection is separately required.

All six artifacts set `ECOSYSTEM_AUTH_ENABLED=true`; ScreenTime also sets
`NEXT_PUBLIC_ECOSYSTEM_AUTH_ENABLED=true`. This matches the independently built
central-enabled `a3df8a458169bc145bde6bc61e26b5010da36cbd` ScreenTime artifact,
not the old private candidate's compiled flag. KešTrek also requires its central
frontend build; this operator supplies no secret to any build. Mega cleanup,
KešTrek notification cron and Otázkomat unverified cleanup remain false until
their single-owner handoffs are separately completed.

These files are not installed by this operator. Serving services, original env
files, registry flags, database state and network routes remain untouched.
Activation requires the coordinator's complete review and product acceptance.

## Checks

```sh
node --test server/accounts/test/host-environment-operator.test.mjs
npm test --prefix server/accounts
git diff --check
```

Fixtures cover all six contracts, existing data-key preservation, exact database
tuples, callback/client mapping, public flags, secret-free metadata, wrong-role/
expired/future/tampered JWT rejection, duplicate/symlink/Git-path refusal,
backup failure ordering and no-live-apply CLI behavior. Tests use synthetic
credentials and temporary private directories only.
