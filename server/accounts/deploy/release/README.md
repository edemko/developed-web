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
developed-release prune  <app> [--keep=3] [--apply]
```

Run from a checkout (`node developed-release.mjs …`) or from the frozen installed copy
`/opt/developed-control/developed-release-<rev>/` that the poll unit uses.

## What a deploy does

1. `git fetch`; target = `origin/<branch>` (or a given commit, which must be on it).
2. Probe each **side** (`web`, `api`, `app`) for its live release and the commit it was built from
   (manifest `sourceCommit` → `DEPLOYMENT.json`/`REVISION` → `knownSources` → hex in the name).
3. Decide (`lib/gates.mjs`, unit-tested):
   - skip if the head subject has `[no deploy]` (automatic runs only), nothing in a side's
     `paths` changed, or the target already failed 3 automatic attempts;
   - **block** if a live commit is not contained in the target (live came from a release branch —
     deploying would drop live-only commits), the live commit is unknown, a changed side is
     `manual`, or `migrationPaths` changed (apply by hand, then `--migrations-applied`).
4. Build as `openclaw` from `git archive` (all `.env*` excluded) under the shared
   `~/.cache/developed-ecosystem-build.lock`, refusing below 2 GB `MemAvailable`. Public build
   values come only from an allowlist (`publicEnv.keys`). Tests run as part of `steps`.
5. Seal root-owned into `<releaseRoot>/<rev12>/` with `release-manifest.json` (v2: source commit,
   sides, previous live sources, patch hashes, file hashes). Web sides carry forward the live
   release's hashed bundles so open tabs keep working.
6. Switch sides in `switchOrder`; health-check each; on any failure **every completed side is
   rolled back in reverse**, so web and API never stay on mismatched releases.

Strategies: `web-symlink` (atomic symlink a Caddy root points at, + Cloudflare purge, no reload),
`instance-swap` (single owner: stop `x@old`, start `x@new`, health, hooks, enable/disable — never
two processes), `symlink-restart` (repoint `current`, restart one unit), `manual` (probe only).
Hooks (`hooks/`) handle app-specific pins, e.g. `kestrek-notifications` reinstalls the worker's
ownership guard pinned to the new API unit and points a drop-in at it.

## Automatic deploys

`install.sh [<developed-web commit>]` installs a frozen root-owned copy and the openclaw user
units (`systemd/`). The timer polls every ~3 min; `flock` keeps runs serial. It only acts on apps
with `"auto": true`. Pause everything without touching configs:
`sudo touch /etc/developed-apps/developed-release-paused`. Results/failures go to ntfy
(`http://127.0.0.1:8080/claude-sessions`, override with `DEVELOPED_RELEASE_NTFY`); history in
`~/.local/state/developed-release/history.log`; logs via `journalctl --user -u developed-release-poll`.

Legacy per-app autodeploys (`kestrek-autodeploy`, `screentime-autodeploy`, mega-music's Actions
hook) stay frozen behind their root guards; this tool never touches them.

## App status (2026-10-10 survey)

| App | Config | Why not auto yet |
|---|---|---|
| kestrek | **auto** (2026-10-10) | — |
| karak2 | not onboarded | no artifact definition; every restart drops sessions/games; weak health |
| mega-music | not onboarded | cleanup-guard pin hook + `zz-managed.conf` instance drop-in to port; legacy Actions hook |
| myclinic | not onboarded | **live web/API skew** (problem-reports 404); literal Caddy root; CSP hashes; cron reads checkout `.env` |
| otazkomat | not onboarded | Sections 3–4 need owner sign-off; blue-green 3166/3176 strategy not implemented |
| screentime | not onboarded | undeployed 8bd3dca must ship by hand before the APK; `-central` release suffix |
| airsoft | not onboarded | live is a release branch (memberships) not on main; dirty tree; hand-made units |
| vocabulum | not onboarded | live is a release branch not on main; dirty tree; per-feature units |
| developed-accounts | manual-only by policy | identity provider; coordinated releases |

`status` re-derives the live/behind/blocked picture at any time; the blockers live in each
`apps/<app>.json`. To onboard an app: fill `steps`/`artifacts`/`health`, set `"onboarded": true`,
run `deploy <app>` by hand at least once, then set `"auto": true` in a reviewed commit and reinstall.

## Not yet supported

Blue-green port swaps with Caddy upstream edits (otazkomat, airsoft, vocabulum) — these must go
through `/usr/local/bin/reload-public-sites` under `/var/lock/caddy-config.lock`. Automatic pruning
(`prune` is manual). Migrations are never applied by this tool.
