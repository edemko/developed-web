# Six private central-mode candidates — reviewed operation

Prepared 2026-09-20 and executed after coordinator review; see the verified
private checkpoint below. This is not a public cutover. The installation
commands are one-time operations and now reject the existing drop-ins.
Keep registration closed, publication and `enforce_oidc` off, mail disabled,
public routes unchanged and legacy public services running. No schema, provider,
firewall, static-root or public deployment changes belong to this operation.

## Fixed targets

| Slug | UID / port | Exact private unit after activation | Release |
| --- | --- | --- | --- |
| mega-music | 984 / 3168 | `mega-music-accounts-isolated@4ca877f89a3d.service` | `/opt/developed-apps/mega-music/releases/4ca877f89a3d` |
| screentime | 983 / 3167 | `developed-screentime@a3df8a458169-central.service` | `/opt/developed-apps/screentime/releases/a3df8a458169-central` |
| kestrek | 982 / 3164 | `developed-kestrek@1c102674a293.service` | `/opt/developed-apps/kestrek/releases/1c102674a293/backend` |
| otazkomat | 981 / 3166 | `developed-otazkomat@7393f6b095f0.service` | `/opt/developed-apps/otazkomat/releases/7393f6b095f0/backend` |
| airsoft | 986 / 3162 | `developed-airsoft-green.service` | `/opt/developed-apps/airsoft/releases/9f6737af7a2f618514cb80a1bda1bdd33ddb8346` |
| vocabulum | 985 / 3161 | `developed-vocabulum-green.service` | `/opt/developed-apps/vocabulum/releases/9ad7b96e7f728e7be0ca589858b26086e329abd2` |

The old private ScreenTime unit is
`developed-screentime@717a71d550ac.service`; it alone must stop before the new
instance starts on the same port. Both instances share the existing cache
directory, so never run both concurrently. Its template expands the new
WorkingDirectory and cache bind destination using `%i`; ExecStart remains
`node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3167` using the
root-owned Node22 runtime. `systemd-analyze verify` passed for the new instance.

Only ScreenTime needs a backend artifact change for this operation. Airsoft and
Vocabulum have no application-code difference between their installed revisions
and the inspected current source (only deployment unit/docs additions). KešTrek's
separately built central frontend remains unpublished at
`/home/openclaw/kestrek-central-build-cQnJvz/frontend/dist/kestrek-frontend`;
this private API operation does not replace its old staged `web/` artifact or
`/var/www/kestrek.sk`. Do not claim frontend activation from API acceptance.

## Preflight and environment selection

Read each app's runtime runbook and
[host-environments.md](host-environments.md). Re-run the reviewed immutable
operator immediately before installing any override:

```sh
sudo env -i PATH=/usr/bin:/bin /opt/developed-runtimes/node-v22.23.2/bin/node /opt/developed-host-environments-5211760/server/accounts/operators/stage-host-environments.mjs --verify
```

This verifies protected paired artifacts, six unchanged source environments,
credential contracts and current JWT expiry. Keep the original
`/etc/developed-apps/*.env` files byte-for-byte intact. Each new instance-specific
drop-in resets `EnvironmentFile` and points directly to the verified root0600
`/etc/developed-accounts/host-env-staging/<slug>.central.env`. Systemd reads the
file before dropping privileges. Never source or print it. This preserves the
staging verifier's original-source invariant and avoids another secret copy.

Before proceeding, record private unit PIDs/start counts, public unit/container
PIDs, effective route configuration hashes (including imported Caddy files),
central policy flags, and loopback socket ownership. Check all six public apps
are healthy. The read-only baseline here observed:

| Unchanged public workload | PID |
| --- | --- |
| system `mega-music-accounts-green.service` | 1910545 |
| user `screentime-prod.service` | 401984 |
| user `kestrek-prod.service` | 1282853 |
| user `otazkomat-prod.service` | 1126 |
| container `airsoft-marketplace` | 2697486 |
| container `voc-builder` | 2391125 |
| system `caddy.service` | 862 |

The observed `/etc/caddy/Caddyfile` SHA256 was
`70f2334404e5bf29b1b5f3810f8cc32da3ee73178051cd055c4b1ecf3df43851`.
These values are observations to recheck, not permission to overwrite drift.
No public reload/restart is needed. Keep all legacy deployment guards/timer
freezes and candidate boot-enable state unchanged.

Verify installed release ownership, current UID/bind boundary services, exact
UID-to-port policy and actual-UID scoped DB credential probes. The four direct
roles use `172.18.0.12:5432`; Mega preserves the existing pooler DSN resolving
to `mega_music_web`; Vocabulum uses scoped HTTPS session RPCs. Require the
credential/network coordinator's successful role/denial evidence; an HTTP
registration redirect alone does not exercise a DB connection. Do not add a
private provider/Kong exception to make an OIDC probe work.

## Exact override installation (after GO)

The following bounded root invocation writes only six new nonsecret drop-ins.
It rejects an existing target, symlinks and unsafe directory ownership; it
does not touch source environments or invoke systemctl. All six target paths
are preflighted before the first write. If a write fails, inspect the exact
partial set; never delete-and-retry automatically.

```sh
sudo env -i PATH=/usr/bin:/bin /opt/developed-runtimes/node-v22.23.2/bin/node --input-type=module <<'JS'
import { constants, lstatSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
const targets = [
  ['mega-music', 'mega-music-accounts-isolated@4ca877f89a3d.service'],
  ['screentime', 'developed-screentime@a3df8a458169-central.service'],
  ['kestrek', 'developed-kestrek@1c102674a293.service'],
  ['otazkomat', 'developed-otazkomat@7393f6b095f0.service'],
  ['airsoft', 'developed-airsoft-green.service'],
  ['vocabulum', 'developed-vocabulum-green.service'],
];
if (process.getuid() !== 0) throw Error('Root required');
function directory(path) {
  const s = lstatSync(path);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== 0 || (s.mode & 0o022)) throw Error('Unsafe directory');
}
function absent(path) {
  try { lstatSync(path); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  throw Error('Target already exists');
}
for (const p of ['/', '/etc', '/etc/systemd', '/etc/systemd/system']) directory(p);
for (const [, unit] of targets) {
  const dir = `/etc/systemd/system/${unit}.d`;
  try { directory(dir); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  absent(`${dir}/central-private.conf`);
}
for (const [slug, unit] of targets) {
  const dir = `/etc/systemd/system/${unit}.d`;
  try { mkdirSync(dir, { mode: 0o755 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  directory(dir);
  const fd = openSync(`${dir}/central-private.conf`, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
  try {
    writeFileSync(fd, `[Service]\nEnvironmentFile=\nEnvironmentFile=/etc/developed-accounts/host-env-staging/${slug}.central.env\n`);
    fsyncSync(fd);
  } finally { closeSync(fd); }
  const parent = openSync(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(parent); } finally { closeSync(parent); }
  console.log(`Prepared ${unit}`);
}
JS
```

Verify all six effective units and drop-in contents, then run
`sudo systemctl daemon-reload`. This reloads unit definitions; it does not restart
serving services. Confirm each effective `EnvironmentFiles` contains only its
exact central artifact and retains the bind-boundary drop-in. Recheck the three
single-owner flags in protected memory: Mega session cleanup, KešTrek notification
cron and Otázkomat unverified cleanup must remain false.

Perform these steps **one at a time**, accepting or rolling back each candidate
before proceeding. Never issue a combined multi-service restart:

```sh
sudo systemctl restart mega-music-accounts-isolated@4ca877f89a3d.service
sudo systemctl stop developed-screentime@717a71d550ac.service
sudo systemctl start developed-screentime@a3df8a458169-central.service
sudo systemctl restart developed-kestrek@1c102674a293.service
sudo systemctl restart developed-otazkomat@7393f6b095f0.service
sudo systemctl restart developed-airsoft-green.service
sudo systemctl restart developed-vocabulum-green.service
```

The ScreenTime stop/start pair is one operation; confirm old unit inactive and
3167 free before starting the new one. Every other port must belong to its exact
private unit before restart. Candidate interruption is confined to unrouted
private listeners; public availability must be measured separately throughout.

## Bounded acceptance, without live sign-in

Use loopback requests with redirects disabled, canonical Host and (for POST)
canonical Origin/JSON content type, no real cookie/token, and body `{}`.
Vocabulum's native `/api/v1` probes must omit Origin, matching native clients:
its separate Flutter-web CORS policy otherwise correctly returns 403 before the
central-credential guard. Do not configure a new allowed origin for this probe. Capture
only status and expected booleans/error codes; never raw response headers,
Set-Cookie values, OAuth query strings, provider bodies or credential-bearing
journal lines. Do not follow registration links to the public portal.

| App | Required private response |
| --- | --- |
| Mega | GET `/api/music/health` 200; GET `/api/music/auth/config` 200 with `central:true`; POST `/api/music/login` and `/api/music/register` 409 `centralLoginRequired`; `/app/` 200 |
| ScreenTime | GET `/` 200; GET `/api/auth/register` 303 to `https://www.developed.sk/register`; GET `/api/auth/session` 200 with null user/CSRF; POST `/api/v1/ingest` without bearer 401; GET `/api/parent/structure` without cookie 401 |
| KešTrek | GET `/api` 200; GET `/api/auth/ecosystem/register` 303 to central `/register`; POST `/api/auth/register` 403; GET `/api/transactions` without cookie/bearer 401 |
| Otázkomat | GET `/health` 200; GET `/api/auth/registration` 200 with `central:true` and exact central registration URL; POST `/api/auth/register` 409 `central_registration_required`; POST `/api/auth/login` 409 `central_identity_required`; GET `/api/organizations` without credentials 401 |
| Airsoft | GET `/sk/login` 200; GET `/api/auth/ecosystem/register` 303 to central `/register`; POST `/api/auth/signup` 409 `central_registration_required`; GET `/api/auth/ecosystem/session` without cookie 401 |
| Vocabulum | GET `/login` 200; GET `/register` redirects to central `/register`; GET `/api/auth/providers` contains `developed`; POST `/api/v1/auth/login` and `/api/v1/auth/refresh` 409 `CENTRAL_LOGIN_REQUIRED`; GET `/api/auth/session` without cookie contains no user |

Vocabulum intentionally still advertises a `credentials` provider; its authorize
handler returns null in central mode. Do not mistakenly require its absence.
The native 409 probes exercise the early legacy-credential guard without login
attempts. A browser credentials-flow test remains part of later acceptance.

Do not require successful `/start` or OIDC `/login` discovery now: the unchanged
public issuer routes to the old provider. Those routes may also create OAuth
transaction/rate-limit rows. Registration redirects, legacy rejection and
unauthenticated reads above avoid intentional identity/product-data writes.
No provider URL substitution or relaxed issuer validation is permitted.

For every candidate, check new PID, expected UID, only expected loopback listener,
stable restart count, effective central mode, protected environment/release
permissions and actual-UID denial of sibling secrets, Docker/control sockets,
unapproved private listeners and bind ports. Repeat scoped connectivity evidence
without printing secrets or data. Check public PIDs/routes/hash/health and closed
central flags after each operation and at the end. A startup/health result does
not establish cross-user RLS, real login, devices, uploads, MCP, or native readiness.

## Rollback scope

If a private candidate fails, stop only that exact private unit. Retain the
central artifact, credentials, backups, migrations and all network gates.
Verify its `central-private.conf` is exactly the newly installed file, then move
only that file to a new root-private backup name (exclusive destination); do not
remove the containing directory or any existing bind-boundary override. Run
daemon-reload. For the five unchanged releases, restart that same private unit;
it again uses its untouched original environment. For ScreenTime, leave the new
instance stopped and start only `developed-screentime@717a71d550ac.service`.
Recheck the prior private baseline and unchanged public service/routes.

This legacy-mode rollback is valid only because these candidates remain private
and public enforcement remains off. After security/public cutover, rollback must
retain central/data enforcement; this worksheet is not authority to reopen
legacy auth. Do not roll back the database or restore application data.

## Remaining release gates

All seven public products still need the coordinated security cutover. Outstanding
items include provider/public data ingress, real canonical OIDC and cross-app
denials, KešTrek development consumers and MCP single-owner final snapshot,
cron ownership, remote Vocabulum aliases, native acceptance, ScreenTime tablet
continuity, protected static publication and full application behavior. Mega's
managed-S4/import bridge credentials are absent in the staged contract; private
health does not make those features configured. Public owner MFA/mail/restore
requirements stay separate. No public SSO completion is implied by this runbook.

The instance-specific overrides deliberately leave the original template env
paths untouched. A future fresh instance would therefore still select the legacy
environment. Before public activation, the production deployment path must select
a stable central environment and guard templates/new instances against legacy
rollback. Do not generalize these private overrides or change the templates as
part of this checkpoint.

## Verified private checkpoint — 2026-09-20

Reviewed runbook commit `8e6bc6e` preceded all host writes. The immutable
`5211760` staging verifier passed immediately before and after activation;
all six original environments remain byte-identical to their protected backups.
Its output label `verified-not-installed` describes that staging operator's own
non-installing contract: it does not inspect systemd drop-ins. This checkpoint
records the separate, approved private runtime activation.

Six root:root0644 `central-private.conf` files now reset EnvironmentFile to their
corresponding root:root0600 staged central artifacts. All effective units retained
their existing bind-boundary overrides. Unit verification and daemon-reload passed.
Five private units were restarted individually; only the old private ScreenTime
instance was stopped and replaced. No original environment, public unit/container,
route, firewall rule, static release, boot-enable state or deployment guard changed.

| App | Verified PID | UID | Loopback port | Drop-in SHA256 |
| --- | --- | --- | --- | --- |
| Mega | 3534993 | 984 | 3168 | `74321bc54e6065e4872daa838bd5abff702b2dec230094f1d23e5c898654912b` |
| ScreenTime | 3538874 | 983 | 3167 | `b9ea471341607cfb9c652ae600c5c2ad54d78a88a4fffbe2062fb96254ff9ab9` |
| KešTrek | 3539845 | 982 | 3164 | `370a9bc6291ded7c7945c01ba98afbd181bdd2d5c6628565442b5255d08f3078` |
| Otázkomat | 3540915 | 981 | 3166 | `99baa2fa5f88cdcb712bd5d586f070ebef6fd90a14d09c6521dad672335768c7` |
| Airsoft | 3542385 | 986 | 3162 | `215c79900bb24d6efa13bef382b03c81ad4041d4427963c3c86eb33a0dbee442` |
| Vocabulum | 3543092 | 985 | 3161 | `0a7287ee04bab9a3f1e3169547ebbaa97054f5f8ece9b36846a6fdbc2e862754` |

All six were active with NRestarts=0 at final verification and listened only on
their listed IPv4 loopback port. The four instance services remain disabled;
the two pre-existing standalone units retain `static` boot state. Actual process
environments report central=true, no legacy service-role/signing/Mailjet names,
ScreenTime's compiled/runtime central flag true, and all three maintenance flags
false. Environment SHA256 values match the staging checkpoint exactly.

After readiness, all 29 bounded private HTTP checks in the table passed. The old
ScreenTime process returned 143 after its requested SIGTERM, which systemd records
as failed/exit-code, with MainPID=0 and port3167 free. A strict inactive-state
assertion initially prevented the new start; the coordinator reviewed this benign
stop classification before continuation. The old failed state was not reset.
The new instance's first immediate requests raced startup; readiness plus repeat
acceptance passed without restart. Vocabulum native checks initially received the
expected CORS403 when sent an Origin; native-shaped no-Origin requests then
returned both required CENTRAL_LOGIN_REQUIRED409 responses. No application or
security configuration was relaxed to obtain these results.

Actual-UID probes inside each service's mount namespace denied its private env,
the Mega source env, developer SSH directory and Docker socket; all six denied
connections to loopback8000/3141/2019/9000 with EHOSTUNREACH and an unapproved
loopback3199 bind with EPERM. Five direct database probes ran as those same UIDs:
each connected as its exact scoped role and received permission denial for
`auth.users.encrypted_password`, within an explicitly read-only transaction.
No identity/session/product row was written. Vocabulum's scoped HTTPS credential
qualification remains the separate runtime-credential operator evidence; no
session RPC was invoked in this operation.

All seven public PIDs in the preflight table and the Caddyfile hash remained
unchanged. A continuous six-site HTTPS monitor observed 311 successful responses
and one Otázkomat transport failure across 312 requests. The monitor did not retain
the transport exception subtype, so its cause cannot be established. Ten immediate
follow-up public Otázkomat health requests returned200 (66–224ms), and ten old3126
local health requests returned200 (4–9ms); old PID1126 remained active with no
restart. This establishes recovery/current health, not a zero-interruption claim.
No public config/restart was used in response to that observation.

No real sign-in, OAuth start flow, mail, device ingestion, data mutation, migration,
MCP operation, static publication or public SSO switch was performed. Central
policy gates remain under the coordinator's separate read-only verification.
