# developed-release — per-app release tool for DevelopED apps

Builds, seals and switches isolated app releases (the model in `../runtime-isolation.md`),
by hand or on push to `main`, **each app independently**. Read `../AGENTS.md` first: this
tool is not permission to deploy an app; onboarding and `"auto": true` are owner decisions.

```
developed-release status [app...]          live vs origin/main + the next decision, per app
developed-release deploy <app> [commit] [--dry-run] [--migrations-applied] [--force]
developed-release build  <app> [commit] [--sides=web,api]   build + seal only
developed-release switch <app> <release>   switch an already sealed release
developed-release poll                     timer entry point: deploy every "auto" app
developed-release prune  <app> [--keep=0] [--apply]
```

Run from a checkout (`node developed-release.mjs …`) or from the frozen installed copy
`/opt/developed-control/developed-release-<rev>/` that the poll unit uses.

## What a deploy does

1. `git fetch`; target = `origin/<branch>` (or a given commit, which must be on it).
2. Probe each **side** (`web`, `api`, `app`) for its live release and the commit it was built from
   (manifest `sourceCommit` → `DEPLOYMENT.json`/`REVISION` → `knownSources` → hex in the name).
3. Decide (`lib/gates.mjs`, unit-tested):
   - skip if nothing in a side's `paths` changed, or if the target already failed 3 automatic
     attempts. There is no commit-message opt-out: a push to `main` means deploy. Work that must
     not ship stays on a local or feature branch until it is ready;
   - **block** if a live commit is not contained in the target (live came from a release branch —
     deploying would drop live-only commits), the live commit is unknown, a changed side is
     `manual`, or `migrationPaths` changed (apply by hand, then `--migrations-applied`).
4. Build as `openclaw` from `git archive` (all `.env*` excluded) under the shared
   `~/.cache/developed-ecosystem-build.lock`, refusing below 2 GB `MemAvailable`. Public build
   values come only from an allowlist (`publicEnv.keys`). Tests run as part of `steps`.
5. Seal root-owned into `<releaseRoot>/<rev12>/` with `release-manifest.json` (v2: source commit,
   sides, previous live sources, `builtAssets`, patch hashes, file hashes). Web sides carry forward
   the live release's **own** hashed bundles (one release back) so open tabs keep working.
6. Switch sides in `switchOrder`; health-check each; on any failure **every completed side is
   rolled back in reverse**, so web and API never stay on mismatched releases.
7. Prune: keep live releases and functional `protect` pins (kestrek's notification worker and
   mega-music's cleanup job load code from them); delete the rest under `releaseRoot`. The apps are in
   development, so no rollback copies are kept by default (`keepReleases: N` keeps N more plus each
   side's previous release). The switch-time automatic rollback on failed health checks still works:
   it runs before pruning.

Strategies: `web-symlink` (atomic symlink a Caddy root points at, + Cloudflare purge, no reload),
`instance-swap` (single owner: stop `x@old`, start `x@new`, health, hooks, enable/disable — never
two processes), `symlink-restart` (repoint `current`, restart one unit), `central-accounts`
(coordinated API and sole mail worker switch), `manual` (probe only).
Hooks (`hooks/`) handle app-specific pins, e.g. `kestrek-notifications` reinstalls the worker's
ownership guard pinned to the new API unit and points a drop-in at it.

## Automatic deploys

`install.sh [<developed-web commit>]` installs a frozen root-owned copy and the openclaw user
units (`systemd/`). The timer polls every ~3 min; `flock` keeps runs serial. It only acts on apps
with `"auto": true`. Pause everything without touching configs:
`sudo touch /etc/developed-apps/developed-release-paused`. Results/failures go to ntfy
(`http://127.0.0.1:8080/claude-sessions`, override with `DEVELOPED_RELEASE_NTFY`); history in
`~/.local/state/developed-release/history.log`; logs via `journalctl --user -u developed-release-poll`.

### Central accounts

The central identity service uses Node 24.21.0 and a root-owned API release plus a separately
pinned root-owned mail worker. Its config is currently `"auto": false`. A first reviewed release
must go through this tool while no other central release is in progress. Only then may a reviewed
config commit set `"auto": true` and reinstall the frozen tool. The poll timer already exists;
no second timer or webhook is needed.

Automatic central releases are limited to public UI changes. The tool refuses the existing
overlaid legacy release because its name does not prove a complete source commit; a first
reviewed, sealed release is a prerequisite. Changes in `src`, package files,
mail-worker files or migrations block the automatic path and require a coordinated manual release.
Even a manual release refuses to re-pin the worker if the compiled mail, database, security or
template modules, or its music logo, differ from the live API. Review and release such changes
with the central mail-worker procedure before using this strategy. The browser UI fixture runs
with the Node tests for every built central candidate. An automatic run also requires the live
source to be an ancestor of `origin/main`; reconcile live-only release commits first.

The switch writes `~/.local/state/developed-release/developed-accounts.pending.json` before
stopping the worker. A failed rollback or interrupted process leaves this receipt in place and
blocks all further central deploys. To recover, inspect the receipt, actual API symlink,
`systemctl` state, worker drop-in and worker process pins. Restore the receipt's `previousApi`,
`previousDropIn` and `previousBundle` with the same single-worker stop/restart order, check
loopback and public health, and only then remove the receipt. Preserve the previous API release
and worker bundle until recovery and rollback checks are complete. Never remove the receipt to
make a failed poll retry without reconciling the running processes.

Legacy per-app autodeploys (`kestrek-autodeploy`, `screentime-autodeploy`) stay frozen behind their
root guards; this tool never touches them. mega-music's GitHub SSH deploy was retired on 2026-10-11
(workflow is test-only; `mega-deploy`'s key backed up under `/var/backups/developed-release/`).

## Node runtime

Each app config may pin `"node": "<exact version>"` (default `22.23.2`). Builds run with
`~/.nvm/versions/node/v<node>/bin` first in `PATH`; services must run
`/opt/developed-runtimes/node-v<node>/bin/node` (root-owned, no symlinks — the guards reject them).
The tool never edits unit files. Before a deploy, `--dry-run` or build it checks with `systemctl cat`
that each switched unit (instance-swap template or symlink-restart unit, with drop-ins) names
exactly that runtime, and refuses otherwise. To move an app: switch its unit files by hand and
restart the live instance, then set `node` in a reviewed commit and reinstall. The
`kestrek-notifications` and `mega-music-cleanup` hooks pin their guard's `nodePath` and their
drop-ins to the same runtime. `install.sh` runs the tool itself on the Node in its `NODE` line.

## App status (2026-10-10 survey, updated 2026-10-11)

| App | Config | Why not auto yet |
|---|---|---|
| kestrek | **auto** (2026-10-10) | — |
| karak2 | **auto** (2026-10-11) | slim production-deps release a6ed1c50aa26 (760 MB vs 980 MB); a release restarts the one service (local sign-out, in-memory games dropped) |
| mega-music | **auto** (2026-10-11) | API + landing released by the tool (8ed1d6f); cleanup guard re-pinned by hook; YouTube service still manual |
| myclinic | **auto** (2026-10-10) | API e2e438a + web de58cea released by the tool; web on `web-current` with CSP-hash pre-check |
| otazkomat | **auto** (2026-10-11) | 90b7acb (school Sections 1–4, support widget) released by the tool; single-owner API on 3166, web on `web-current` |
| screentime | **auto** (2026-10-11) | 5c6e178 (8bd3dca reports + package-aware app-update, support widget) released by the tool; webpack build, both central flags baked true |
| airsoft | **auto** (2026-10-11) | release branches merged into main; template unit `developed-airsoft@<rev12>` on 3162 replaces the include chain; first tool release c7c48752edf5 |
| vocabulum | **auto** (2026-10-11) | release branches merged into main; template unit `developed-vocabulum@<rev12>` on 3161 replaces six per-feature units; first tool release 0bc488780106 |
| developed-accounts | onboarded, auto disabled | identity provider; first coordinated tool release and live-branch reconciliation pending |

`status` re-derives the live/behind/blocked picture at any time; the blockers live in each
`apps/<app>.json`. To onboard an app: fill `steps`/`artifacts`/`health`, set `"onboarded": true`,
run `deploy <app>` by hand at least once, then set `"auto": true` in a reviewed commit and reinstall.

## Not yet supported

Blue-green port swaps with Caddy upstream edits (formerly otazkomat, airsoft, vocabulum) — these must go
through `/usr/local/bin/reload-public-sites` under `/var/lock/caddy-config.lock`. Migrations are
never applied by this tool. Releases outside `releaseRoot` (e.g. My Clinic's pre-tool
`web/releases/`) are never pruned.
