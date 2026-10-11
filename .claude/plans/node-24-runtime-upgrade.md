# Node 24 runtime upgrade (DevelopED platform)

**Status:** planned 2026-10-11 — not started. Update the checkboxes and the "Execution log" as you go.

## Goal

Move every DevelopED service on sam from `/opt/developed-runtimes/node-v22.23.2` to a new
root-owned Node 24 LTS runtime, one app at a time, with a tested rollback at every step.
Node 22 leaves security support on **2027-04-30**; Node 24 is supported until ~April 2028.

The goal is not to remove Node 22 the same day. Remove it only when nothing active references it
(Phase 7).

## Ground rules for the executing session

- This is a live production host. Read `~/.claude/CLAUDE.md` and
  `server/accounts/deploy/release/README.md` first.
- **Pause automatic deploys for the whole job:**
  `sudo touch /etc/developed-apps/developed-release-paused`. Remove the file at the end.
- Work on **one app at a time**. Verify it (see "Per-app verification") before starting the next.
- Before editing any file under `/etc/systemd/system`, copy it to
  `/var/backups/node24/<date>/` with the same relative path. Rollback means restoring that copy,
  then `systemctl daemon-reload` and restarting the unit.
- Never print secrets. `EnvironmentFile`s and `/etc/developed-accounts/host-env-staging/*` are
  off-limits for `cat`.
- Check `free -h` before builds or test runs. Run test suites one at a time, because RAM is the
  scarce resource.
- Commit or push only when the user says so. Kestrek and myclinic pushes auto-deploy, but the
  pause file holds them.

## Facts established on 2026-10-11 (re-verify; they drift)

### Runtimes in use

| Path | Used by |
|---|---|
| `/opt/developed-runtimes/node-v22.23.2` (root, 0755) | every isolated app unit, boundaries, guards |
| `/opt/node-v22.23.2` (root, **0775**) | `/usr/local/sbin/mega-music-deploy` (PATH), `/usr/local/sbin/developed-disk-maintenance` (npm cache clean) |
| `~/.nvm/versions/node/v22.23.2` | developed-release builds (`lib/build.mjs` `BUILD_NODE_BIN`), `install.sh` test run |
| `/etc/jasom/worker.env` | `JASOM_YOUTUBE_JS_RUNTIME=` points at a Node 22 binary |

### Guards pin the exact binary path, and symlinks are rejected

- `assertTrusted` / `trusted()` in the guards walks every path component. Each component must be
  root-owned, not group- or other-writable, and **not a symlink**. A `node-current` symlink is
  therefore impossible. Every reference must name the real versioned directory.
- `kestrek-notifications-*/notifications-owner-check.mjs`:
  - `export const nodePath = '/opt/developed-runtimes/node-v22.23.2/bin/node'`.
  - It requires the **API process exe** to equal `nodePath` (line ~53) and its own
    `process.execPath` to equal `nodePath` (line ~95).
  - So the kestrek API and the worker's guard must switch together.
  - The source is `deploy/notifications-owner-check.mjs` in the kestrek repo. The developed-release
    hook copies it from the commit being deployed.
- `mega-music-session-cleanup-v11/session-cleanup-owner-check.mjs` has the same `nodePath` pin. The
  next version must be `-v12`.
- `tailscale-socket-seal-28b6e47/seal-tailscale-runtime-sockets.mjs` has `export const NODE = …`.
- `network/bind-boundary.mjs` runs `assertTrusted(process.execPath)`. The new runtime must pass the
  trusted-path check.
- `central-runtime-v1/install-central-runtime-guards.mjs` generates
  `ExecStartPre=/opt/developed-runtimes/node-v22.23.2/bin/node …assert-central-runtime.mjs <slug>`
  into the `central-production.conf` drop-ins for mega-music, screentime, kestrek, otazkomat,
  airsoft and vocabulum. That installer refuses to overwrite existing targets (`absent()`), so
  edit the existing drop-ins in place rather than re-running it.

### Units that reference Node 22 (`sudo grep -rl node-v22.23.2 /etc/systemd/system`)

Units in the first list are **active**:
`bind-boundary`, `developed-uid-boundary` (+ `managed-music.conf`), `developed-data-boundary`,
`green-provider-boundary`, `developed-accounts`, `developed-accounts-mail-worker`
(+ `browser-family-release.conf`), `developed-auth-green`, `developed-airsoft-sms-status`,
`developed-karak2`, `developed-kestrek@` (+ `central-production.conf`),
`developed-kestrek-notifications` (+ `api-release.conf`), `developed-myclinic@`,
`developed-otazkomat@` (+ conf), `developed-screentime@` (+ conf), `developed-vocabulum-word-types`,
`download-relay`, `mega-music-accounts-isolated@` (+ conf), `mega-youtube-front`,
`mega-youtube-isolated`.

Plus the `mega-music-session-cleanup.service` timer job, and the user unit drop-in
`~/.config/systemd/user/myclinic-cron@.service.d/runtime-target.conf`.

These units are **inactive, disabled or static candidates** and do not need to move:
- the `developed-airsoft-*` units other than `sms-status`
- the `developed-accounts-*-candidate` units
- `developed-accounts-airsoft-sms`
- the `developed-vocabulum-{green,favicon,footer,native,showcase}` units

They keep Node 22 alive until they are updated or retired (see
`docs/app-retirement-2026-10-02.md`). Decide them in Phase 7. Do not start them.

### Native modules: low risk

The live releases contain `sharp` (kestrek, myclinic, screentime) and `bcrypt` prebuilds (kestrek).
Both are N-API, so the ABI is stable across Node majors. The swc, lightningcss, tailwind oxide and
unrs-resolver binaries are build-time only. Builds run `npm ci` anyway, so each Node 24 release is
built fresh.

### Node 24 changes to check (read the official v22→v24 release notes)

- It bundles npm 11.
- It uses OpenSSL 3.5, which applies stricter default TLS security levels to outbound calls (SMS
  providers, Mailjet, ntfy).
- `AsyncLocalStorage` is now built on AsyncContextFrame. This matters to NestJS and Next.js request
  context.
- It uses undici 7 for `fetch`.
- More APIs carry deprecation warnings. Warnings in the journal are acceptable. Crashes are not.

## Phase 0: Preflight

- [ ] Pause auto deploys (see Ground rules). Confirm with
  `node …/developed-release.mjs status`.
- [ ] Back up the unit tree:
  `sudo mkdir -p /var/backups/node24/$(date +%F) && sudo cp -a /etc/systemd/system /var/backups/node24/$(date +%F)/`.
  Also copy the user unit dir.
- [ ] Record the current state:
  - `systemctl list-units --state=active 'developed-*' 'mega-*' bind-boundary download-relay green-provider-boundary`
  - every `readlink /proc/<MainPID>/exe`
  - the health endpoint of each app (see "Per-app verification")
  - Save all of it to this file's Execution log.
- [ ] Check `df -h /`. It was 83% / 26 GB free. One Node runtime is ~200 MB, so that is fine.

## Phase 1: Install the Node 24 runtime alongside 22 (no service changes)

1. Pick the latest v24 LTS from https://nodejs.org/dist/latest-v24.x/ and record `v24.X.Y` here.
2. Download into a fresh empty directory under the session scratchpad:
   - `node-v24.X.Y-linux-x64.tar.xz`
   - `SHASUMS256.txt`
   - `SHASUMS256.txt.sig`
3. Verify:
   - Import the Node release signing keys listed in the nodejs/node README ("Release keys").
   - Run `gpg --verify SHASUMS256.txt.sig SHASUMS256.txt`.
   - Run `sha256sum -c --ignore-missing SHASUMS256.txt`.
   - Stop if either check fails.
4. Install:
   ```bash
   sudo tar -xJf node-v24.X.Y-linux-x64.tar.xz -C /opt/developed-runtimes/
   sudo chown -R root:root /opt/developed-runtimes/node-v24.X.Y-linux-x64
   sudo chmod -R go-w /opt/developed-runtimes/node-v24.X.Y-linux-x64
   sudo mv /opt/developed-runtimes/node-v24.X.Y-linux-x64 /opt/developed-runtimes/node-v24.X.Y
   ```
   Match the existing naming `node-v22.23.2`.
5. Verify the install:
   - `/opt/developed-runtimes/node-v24.X.Y/bin/node -v`.
   - Check the trust rules for every path component with `stat -c '%U %a %F'`: root, no `w` for
     group or other, no symlinks. The `bin/npm` and `bin/npx` symlinks are fine because only
     `bin/node` is pinned.
6. Install the build toolchain: `source ~/.nvm/nvm.sh && nvm install 24.X.Y`. Do **not** change
   the nvm default yet.

## Phase 2: Test every app on Node 24 (no production impact)

For each active app repo, test its current `origin/main` on Node 24:
- Archive the commit into the scratchpad with `git archive origin/main | tar -x -C <dir>`.
- Run `npm ci`, then build, then the tests, all with `~/.nvm/versions/node/v24.X.Y/bin` first in
  `PATH`.
- Record pass/fail per app here.

| App | Repo | Commands |
|---|---|---|
| kestrek | `~/Dev/kestrek` | `npm run install:all`; backend `npm test`, `npm run build`; frontend `npm test` (needs `CHROME_BIN`, see kestrek CLAUDE.md), `npm run build` |
| myclinic | `~/Dev/my-clinic` | see its CLAUDE.md / package.json scripts |
| otazkomat, screentime, karak2, mega-music, vocabulum | `~/Dev/<repo>` | each repo's CLAUDE.md |
| developed-accounts + boundaries | `~/Dev/developed-web` | `server/accounts` tests; `node --test` the release tool |

If a test fails only on 24, fix it in that app's repo first. The fix must also pass on 22, because
production still runs 22. Do not continue that app until it is green.

## Phase 3: developed-release learns per-app runtimes

Code in `server/accounts/deploy/release/`:

1. `apps/<app>.json`: add `"node": "22.23.2"` (the default when absent) or `"24.X.Y"`.
2. `lib/build.mjs`: derive `BUILD_NODE_BIN` from `config.node`
   (`~/.nvm/versions/node/v${config.node}/bin`). Fail clearly if it is missing.
3. Add a helper `runtimeNode(config)` that returns `/opt/developed-runtimes/node-v${config.node}/bin/node`.
   Check that it exists.
4. `hooks/kestrek-notifications.mjs`: replace the `RUNTIME_NODE` constant with
   `runtimeNode(config)`. `dropinFor` needs it as a parameter, so update the test.
5. Add tests for the default and the explicit runtime, then run `node --test`.
6. Run `install.sh` to freeze the new copy under `/opt/developed-control/developed-release-<sha12>`,
   and point the poll unit at it, as `install.sh` already does.

The tool does **not** rewrite unit files. The runtime path inside units is changed by hand in
Phase 4, once per app. Releases stay pure code switches.

## Phase 4: Migrate apps one at a time

The pattern for each app:
1. Back up its unit file(s) (done in Phase 0, but re-check).
2. In exactly that app's unit files, replace
   `/opt/developed-runtimes/node-v22.23.2/` with `/opt/developed-runtimes/node-v24.X.Y/`
   (sed on the named files only). This includes `ExecStart`, `ExecStartPre` and `Environment=PATH=`.
3. Run `sudo systemctl daemon-reload`.
4. Restart the running instance.
5. Run "Per-app verification".
6. If verification fails, roll back: restore the files, `daemon-reload`, restart, verify again
   on 22.

Order, from lowest to highest blast radius:

### 4a. myclinic
- [ ] `developed-myclinic@.service`, then restart `developed-myclinic@<live>.service`.
- [ ] `~/.config/systemd/user/myclinic-cron@.service.d/runtime-target.conf`, then
  `systemctl --user daemon-reload`. Do not trigger the jobs. Check the next 08:00 UTC run in the
  journal.
- [ ] `apps/myclinic.json` `"node": "24.X.Y"`.
- [ ] In the myclinic repo: `.nvmrc` `24`, `engines` `"24.x"` in both package.json files, and
  update the docs that say 22 (CLAUDE.md, AGENTS.md, README.md, deploy/README.md).
- [ ] Commit, then unpause **only after** all apps are done. Alternatively, run
  `deploy myclinic` by hand while paused, to prove a Node 24 build.

### 4b. kestrek (API + notification worker together)

The worker guard requires the API exe to equal its `nodePath`, so do this in order:
- [ ] Kestrek repo: change `deploy/notifications-owner-check.mjs` `nodePath` to v24, and bump
  `backend/package.json` engines to `>=24`. Check which developed-release side owns `deploy/`
  (`apps/kestrek.json` paths). The commit must trigger an **api** deploy. If `deploy/` is not an
  api path, also touch something under `backend/`. Commit, and push only with the user's OK.
- [ ] `apps/kestrek.json` `"node": "24.X.Y"`. Install the tool (Phase 3 step 6).
- [ ] Edit `developed-kestrek@.service` and `developed-kestrek@.service.d/central-production.conf`
  to v24, then `daemon-reload`. The running instance keeps its old binary until it stops.
- [ ] `node …/developed-release.mjs deploy kestrek`. This is a manual deploy while paused. The
  instance swap starts the new release on 24, and the hook installs the v24-pinned guard plus a
  drop-in run by v24 node. Expect `ownershipVerified: true`.
- [ ] **Rollback caveat:** the tool's automatic rollback restarts the old instance from the edited
  template, so it also runs on 24. The old guard expects 22, so the worker would refuse to start.
  If the deploy fails:
  1. Restore both unit files from backup.
  2. `daemon-reload`.
  3. `systemctl restart` the previous instance.
  4. Confirm that `api-release.conf` points at the previous `kestrek-notifications-<rev>` guard.
  5. Restart the worker.

### 4c. otazkomat, screentime, karak2, vocabulum-word-types, airsoft-sms-status

These are not onboarded to the tool.
- [ ] Do each one separately: template or unit + `central-production.conf`, then restart the live
  instance, then verify.

### 4d. mega-music
- [ ] `mega-music-accounts-isolated@.service` + conf, `mega-youtube-front`, `mega-youtube-isolated`,
  then restart and verify.
- [ ] Session cleanup:
  - Make `mega-music-session-cleanup-v12` as a copy of v11 with `nodePath` set to v24, and keep
    it root-owned and read-only.
  - Point `mega-music-session-cleanup.service` at v12 and v24.
  - Run it once with `systemctl start` and check the journal.
- [ ] `/usr/local/sbin/mega-music-deploy` PATH: switch from `/opt/node-v22.23.2` to
  `/opt/developed-runtimes/node-v24.X.Y`. Read the script first.
- [ ] `/etc/jasom/worker.env` `JASOM_YOUTUBE_JS_RUNTIME`: point it at the v24 binary, then restart
  its consumer. Find the consumer with `grep -rl jasom /etc/systemd/system`.

### 4e. Central identity (highest user impact: every app's sign-in)

Use a quiet window.
- [ ] `developed-accounts`, `developed-accounts-mail-worker` (+ `browser-family-release.conf`),
  `developed-auth-green`. Restart one at a time.
- [ ] After each restart, sign in to one app (kestrek is easiest) and send one mail flow
  (password reset to the owner's own address) to prove the mail worker works.

### 4f. Boundaries and host plumbing (can cut network to apps if broken)

Do these one at a time. Read each unit's `ExecReload` and `Type` first, because some are oneshot
loaders.
- [ ] `developed-data-boundary`, `green-provider-boundary`, `download-relay`.
- [ ] `bind-boundary` (it runs `assertTrusted(process.execPath)`), then
  `developed-uid-boundary` + `managed-music.conf`. Use `systemctl reload` if that is the documented
  path. After each one, every app's health endpoint must still answer.
- [ ] `tailscale-socket-seal`:
  - Make a new `/opt/developed-control/tailscale-socket-seal-<rev>` copy with `NODE` set to v24.
  - Find its caller first with `grep -rl tailscale-socket-seal /etc /usr/local`.

### 4g. Build and operator side
- [ ] `nvm alias default 24.X.Y`.
- [ ] `install.sh` test node: use v24.
- [ ] `/usr/local/sbin/developed-disk-maintenance` npm path: use `/opt/developed-runtimes/node-v24.X.Y/bin/npm`.
- [ ] Mark the central-runtime installer (`install-central-runtime-guards.mjs`) as historical: it
  hardcodes 22 but is single-use.

## Per-app verification (after every restart)

- `systemctl is-active <unit>`, and `NRestarts` has not increased over 2 minutes.
- `sudo readlink /proc/$(systemctl show -p MainPID --value <unit>)/exe` shows the v24 path.
- The health endpoint answers. Kestrek: `curl -fsS http://127.0.0.1:3164/api/...health`. The
  other apps use their port from the unit or Caddy config. Also load the public site in a browser
  or with `curl -I`.
- `journalctl -u <unit> --since -5min` shows no errors. Deprecation warnings are only noted.
- Kestrek: `developed-kestrek-notifications` is active.
- Central identity: an end-to-end sign-in works.

## Phase 5: Unpause and prove auto-deploy on 24

- [ ] `sudo rm /etc/developed-apps/developed-release-paused`.
- [ ] Push a trivial real change to kestrek or myclinic. Check that the poll builds with v24 and
  the new instance runs v24.

## Phase 6: Docs

- [ ] `server/accounts/deploy/central-runtime.md` (Node line), `server/accounts/README.md`, and
  the other files `grep -rl developed-runtimes/node --include=*.md` finds: current-state docs only.
  Dated checkpoints are history, so leave them.
- [ ] `~/workspace/docs/config/developed-release-tool.md`: per-app `node` field.
- [ ] Add a new recipe `~/workspace/docs/config/node-24-runtime-upgrade.md` (Problem · Steps ·
  Verification · Related files). Run `ws-backup`.
- [ ] Mark this plan done, and move it to `docs/` with a pointer.

## Phase 7: Retire Node 22 (after ≥2 weeks with no rollback)

- [ ] `sudo grep -rl node-v22.23.2 /etc/systemd/system ~/.config/systemd /usr/local /etc/jasom`
  should return only inactive or retired units. Decide with the user, for each remaining inactive
  unit: update it to v24, or delete it (via the retirement process).
- [ ] Then remove `/opt/developed-runtimes/node-v22.23.2`, `/opt/node-v22.23.2` and the nvm 22
  versions. Old `/opt/developed-control/*` guard copies that pin 22 are history, and prune them
  only if nothing references them.

## Execution log

(append dated entries: what was changed, verification output summary, any rollback)
