# Central accounts sealed baseline and automatic UI releases — 12 October 2026

The full committed `main` account release `7cf9d4100a9ac7f7f2ed58977a1e5e15366d13fa`
is live at `/opt/developed-accounts/releases/7cf9d4100a9a`. It replaces the
unsealed `44d9328…-vocabulum-14f381f` overlay. The sole mail worker uses
`/opt/developed-accounts/mail-workers/7cf9d4100a9a`, imports the new sealed
release's mail, database, security and template modules, and pins that same API.
The protected six-field worker input and central account environment were not
changed. The API's own mail sender remains disabled; the worker guard verified
the actual API, mail input parity and sole sender before startup.

The build came from a commit archive under the release tool with Node 24.21.0.
Its 207 account tests had 183 passes, 24 documented optional skips and no
failures; the Chromium account/report flow passed. The new worker module hashes
and report-attachment send behavior passed an isolated fixture. An HTTP-only
candidate served health, login, UI assets and the authorization-app endpoint on
loopback 3180. It was stopped before the live worker started, and the temporary
3180 bind permission was restored to its original bytes. No database migration,
Caddy change, provider restart, account reset or mail test send was made.

The first coordinated switch stopped at an immediate API health check while the
new process was still starting. Rollback restored the old API and worker drop-in;
the old API became healthy and the old worker was explicitly started. The
pending receipt was cleared only after verifying both old processes, exact pins,
environment and bind policy. The coordinator was amended to wait a bounded
15 seconds for API readiness, its preflight passed, and the second coordinated
switch succeeded. The live API and sole worker were active with PIDs 633403 and
633538 and NRestarts 0 at verification. Their executable was the root-owned
Node 24.21.0 runtime and cwd was the sealed release. Loopback health, login,
assets and authorization-app returned 200; public Chromium showed the shared
DevelopED account explanation and KešTrek destination. Both services logged
readiness, with the mail guard passing. There is no pending switch receipt.

Rollback evidence is root-private under
`/var/backups/developed-accounts-auto-20261012-7cf9d4100a9a`: previous API
symlink, protected environment and bind policy copies, previous worker drop-in,
staged worker hashes, exact bootstrap coordinator and first-attempt account.
The previous release and worker bundle must remain available through the first
automatic release. This baseline now has a tool manifest, so the poll can compare
later `origin/main` commits to a verified source rather than an overlay name.

Automatic mode is deliberately limited to public UI changes. Source,
dependencies, migrations and worker files block the poll for a coordinated
manual release. The generic switch also requires byte-identical worker-imported
modules and logo before it drains/re-pins the sole worker. The first controlled
automatic UI release is recorded below.

## First automatic release

Commit `f2c1811702e3` changed only a comment in the public account CSS to
exercise the automatic path without changing appearance. The installed frozen
tool at `/opt/developed-control/developed-release-b7267913023e` ran through
the existing enabled poll service. It fetched `origin/main`, built from a clean
archive, passed account and Chromium browser tests, sealed 306 files, switched
the API, re-pinned the sole worker and completed with status 0. The worker-imported
mail, database, security and template modules and logo are byte-identical to
the baseline. The active API is
`/opt/developed-accounts/releases/f2c1811702e3`; the worker launcher is
`/opt/developed-accounts/mail-workers/f2c1811702e3`, with the implementation
still pinned to the retained sealed baseline. Verification found both services
active, NRestarts 0, guard/readiness logs, no pending switch receipt, and the
poll timer active. The public mobile browser showed the account explanation,
KešTrek destination and login form. The temporary candidate service and its
port permission were removed after the release.
