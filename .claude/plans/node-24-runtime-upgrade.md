# Node 24 runtime upgrade (DevelopED platform): implementation plan

**Status:** in progress — Phases P, 0, 1 done; Phase 2 running; Phase 3 code committed on branch
`node24-runtime` (2026-10-11). Prepared and reviewed against the live host; refreshed 22:54
against the release tool at origin/main 6052e4e. It replaces the draft committed in f5fe96c
(`.claude/plans/node-24-runtime-upgrade.md`). Tick the boxes and fill in the Execution log as you
go.

## Context

Every DevelopED service on sam runs `/opt/developed-runtimes/node-v22.23.2/bin/node`. Builds, the
release tool and some host scripts use nvm 22.23.2 or `/opt/node-v22.23.2`. Node 22 loses
security support on **2027-04-30**; Node 24 LTS "Krypton" is supported until April 2028.

**Goal:** move every live service, one at a time, to a root-owned
`/opt/developed-runtimes/node-v24.21.0`. Each step has a rollback and leaves nothing inconsistent.
The release tool learns per-app runtimes and refuses deploys when a unit and its config disagree.
Node 22 is removed only after 14 days with no rollback.

v24.21.0 (2026-09-07, npm 11.19.0, OpenSSL 3.5.8) is the newest v24 today. If a newer v24 exists
at execution time, use it and replace `24.21.0` everywhere below.

### Findings that shape this plan (verified read-only 2026-10-11)

1. **Eight apps are tool-managed with auto-deploy:** kestrek, myclinic, screentime, mega-music,
   otazkomat, karak2, airsoft and vocabulum. All but kestrek and myclinic were onboarded on
   2026-10-11. developed-accounts stays manual-only.
   - airsoft and vocabulum moved from hand-made unit chains to templates:
     `developed-airsoft@<rel>` and `developed-vocabulum@<rel>`.
   - screentime, airsoft and vocabulum now run Next standalone (`node server.js`).
   - karak2 is `symlink-restart` on `developed-karak2.service`, with health on unix sockets.
   - Every live unit names the runtime only in `ExecStart` / `ExecStartPre` lines, which
     Procedure U and the gate both handle.
   - **Pushing to `main` deploys.** `[no deploy]` was removed in 8822071, and `~/.claude/CLAUDE.md`
     now forbids opt-out markers. Work that must not ship yet stays on a branch, and Erik decides
     when to merge.
2. **Three guards check that another service runs their exact pinned Node binary:**
   - The kestrek notifications guard (`nodePath`) checks the kestrek API.
   - The mega-music session-cleanup guard (`nodePath`) checks the mega-music API. The tool's
     `mega-music-cleanup` hook installs it per release as
     `/opt/developed-control/mega-music-session-cleanup-<release>/`.
   - The central mail-worker guard (`NODE`) checks developed-accounts.

   Each guard and its API must switch together. The two tool hooks hardcode or inherit v22 today
   (`RUNTIME_NODE` constants; `nodePath` is not pinned).
3. **Not every unit can be restarted plainly, because restarts cascade:**
   - Most app units `Requires=` `bind-boundary` and `developed-uid-boundary`.
   - `developed-auth-green` is `RequiredBy` developed-accounts.
   - `green-provider-boundary` is `RequiredBy` auth-green.
   - The mail worker is `PartOf` developed-accounts.

   So boundaries are switched with `systemctl reload` only, which re-runs an atomic `--apply`.
   auth-green is never restarted; its `--check` is run by hand. For the mail worker, the
   documented drain → API restart → approved start order applies.
4. **Every service is switched in place by hand first** (Procedure U, with a pre-switch copy for
   rollback). Only then does the release config follow. The draft's deploy-driven kestrek switch
   would have rolled back to an old instance on 24 with a guard pinned to 22.
5. **The live mail-worker guard is not the git source.** Its pins differ from HEAD, so the new
   bundle is a copy of the **live** bundle with only the `NODE` line changed.
6. **The runtime layout is minimal.** v22 holds only `bin/node`, root:root 0755, nlink 1. The trust
   checks reject symlinks, group or world write bits, and nlink above 1, and the guards compare
   `/proc/<pid>/exe` literally. v24 is installed the same way.
   - `/opt/jasom/runtime-node` is a symlink to the v22 directory. JASOM's units only use it in
     `PATH`, so swapping it is safe (**in scope**, per Erik).
7. **No app needs code changes for Node 24:**
   - No risky Node flags are in use.
   - No removed APIs are used.
   - Native modules are N-API (sharp, bcrypt).
   - There is no Prisma.

   The remaining risks are checked in Phase 1/2:
   - npm 11;
   - OpenSSL 3.5 (TLS security level 2);
   - AsyncLocalStorage on AsyncContextFrame;
   - yt-dlp, which treats any Node stderr output as an error.
8. **The tool still runs on nvm 22.23.2.** Its poll unit and `install.sh` both pin that path.
   `/usr/local/bin/{node,npm,claude}` point at nvm **22.22.2**, and `developed-disk-maintenance`
   uses `/opt/node-v22.23.2/bin/npm`.
9. **Some files pin v22 but need no change.** The tailscale socket seal and
   `install-central-runtime-guards.mjs` are one-time operators that nothing calls, and
   `assert-central-runtime.mjs` has no Node pin. The `central-production.conf` drop-ins that run it
   do name the runtime, and Procedure U switches them.

## Ground rules for the executing session

- This is a live production host. Read these first:
  - `~/.claude/CLAUDE.md`
  - `server/accounts/deploy/AGENTS.md`
  - `server/accounts/deploy/release/README.md`
  - before 4i, also `deploy/central-mail-worker.md` and `deploy/portal-upgrade-checkpoint-20260921.md`
  - before editing any app repo, that repo's `AGENTS.md` / `CLAUDE.md`
- **Ask Erik to stop other deploy and onboarding sessions for the job's duration.** The tool
  changed more than a dozen times on 2026-10-11 alone. Before Phase 3, run
  `git log origin/main -- server/accounts/deploy/release` and apply Phase 3 on top of whatever is
  current.
- **Keep auto deploys paused for the whole job:**
  `sudo touch /etc/developed-apps/developed-release-paused`. Manual deploys still work.
- Work on one unit or coupled pair at a time. Verify it before starting the next. Never bulk-restart.
- **Never print secrets:**
  - Do not `cat` EnvironmentFiles, `/etc/jasom/worker.env`, `/etc/developed-accounts/host-env-staging/*`,
    `/etc/developed-apps/*/*.env` or `/proc/<pid>/environ|cmdline`.
  - Use `grep -c` or a targeted `sed -i` only. Guard `.mjs` files and unit files are fine to read.
- Check `free -h` before every build or test (the tool refuses below 2 GB available). Run them one
  at a time.
- **Git:**
  - Never put `[no deploy]` in a message.
  - Stage only the named files. developed-web has an unrelated uncommitted `AGENTS.md`, and several
    app repos have dirty trees.
  - developed-web pushes do not deploy any app (developed-accounts is manual-only) but still
    **(ask)**.
  - **App-repo changes go on a branch `node24-runtime`**, and Erik merges at the marked step. For
    tool-managed apps, that merge is a deploy.
- **Host maintenance.** A peer session scheduled a one-shot apt full-upgrade + reboot (reported
  for 05:00 on 2026-10-12, but not visible in `systemctl list-timers` at 22:57). Before each work
  block, check `systemctl list-timers --all` for upgrade or reboot jobs. Never leave a coupled
  pair (4d, 4e, 4i) or a boundary half-switched across one. To hold it, run
  `sudo touch /etc/vps-maintenance-skip`, and remove the file afterwards.
- Bash tool shell state does not persist. Steps that span calls save their variables in
  `~/.cache/node24/<step>.env` and start with `source …; : "${VAR:?}"`.

## Shared tooling (create in Phase 0)

### `~/.cache/node24/n24`

This persists across sessions. Mode 0755, run with bash.

```bash
#!/usr/bin/env bash
# Helper for the Node 24 runtime switch (DevelopED). Never prints file contents.
set -euo pipefail
N24_VERSION=24.21.0
OLD=/opt/developed-runtimes/node-v22.23.2/
NEW=/opt/developed-runtimes/node-v${N24_VERSION}/
B=$(cat "$HOME/.cache/node24/backup-dir")

# Files systemd actually loads for one system unit: fragment + drop-ins (not comment lines).
files() { systemctl show -p FragmentPath -p DropInPaths --value -- "$1" | tr ' ' '\n' | grep '^/' || true; }

case ${1:-} in
  files) files "$2" ;;
  switch)   # v22 -> v24 in every file of one unit that names it; keeps the pre-switch copy under $B/switch/
    n=0
    for f in $(files "$2"); do
      sudo grep -qF "$OLD" "$f" || continue
      if ! sudo test -e "$B/switch$f"; then sudo mkdir -p "$(dirname "$B/switch$f")"; sudo cp -a "$f" "$B/switch$f"; fi
      sudo sed -i "s#$OLD#$NEW#g" "$f"; echo "switched $f"; n=$((n+1))
    done
    [ "$n" -gt 0 ] || { echo "nothing to switch for $2" >&2; exit 1; } ;;
  restore)  # put back the pre-switch copy of every file of one unit that `switch` changed
    for f in $(files "$2"); do
      sudo test -e "$B/switch$f" || continue
      sudo cmp -s "$B/switch$f" "$f" || { sudo cp -a "$B/switch$f" "$f"; echo "restored $f"; }
    done ;;
  deps)     # units a restart of $2 propagates to
    d=$(systemctl show -p RequiredBy -p BoundBy -p ConsistsOf --value "$2" | tr -s '\n ' ' ' | sed 's/^ *//; s/ *$//')
    echo "${d:-(none)}" ;;
  live) systemctl list-units --plain --no-legend --state=active "$2@*.service" | awk '{print $1}' ;;
  verify)   # n24 verify <unit> [url | host|url | unix:/socket|url] ...
    u=$2; shift 2
    pid=$(systemctl show -p MainPID --value "$u")
    echo "$u: $(systemctl is-active "$u" || true) NRestarts=$(systemctl show -p NRestarts --value "$u") exe=$(sudo readlink "/proc/$pid/exe" 2>/dev/null || echo -)"
    for spec in "$@"; do
      host=; url=$spec
      if [[ $spec == *'|'* ]]; then host=${spec%%|*}; url=${spec#*|}; fi
      opt=()
      if [[ $host == unix:* ]]; then opt=(--unix-socket "${host#unix:}"); elif [[ -n $host ]]; then opt=(-H "Host: $host"); fi
      code=$(sudo curl -s -o /dev/null -m 10 -w '%{http_code}' "${opt[@]}" "$url" || true)
      echo "  $code $url${host:+ ($host)}"
    done
    sudo journalctl -u "$u" --since -5min -p warning --no-pager -q | tail -n 15 || true ;;
  test)     # n24 test <repo> <commit> "<archive paths>" <subdir> "<commands>"   (NODE_BIN overrides the Node)
    w="$HOME/.cache/node24/t-$(basename "$2")"; rm -rf "$w"; mkdir -p "$w"
    git -C "$2" archive "$3" $4 | tar -x -C "$w"
    bin=${NODE_BIN:-/home/openclaw/.nvm/versions/node/v${N24_VERSION}/bin}
    (cd "$w/$5" && env PATH="$bin:/usr/local/bin:/usr/bin:/bin" CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
       flock -w 1800 "$HOME/.cache/developed-ecosystem-build.lock" bash -o pipefail -ec "$6")
    rm -rf "$w" ;;
  *) echo "usage: n24 files|switch|restore|deps <unit> | live <template> | verify <unit> [url|host|url|unix:/sock|url]... | test ..." >&2; exit 2 ;;
esac
```

### Procedure U: switch one service in place

1. Run `~/.cache/node24/n24 deps <unit>`. It must print `(none)`; otherwise follow the unit's own
   section.
2. Run `~/.cache/node24/n24 switch <unit or live instance>`. It prints each file changed.
3. Run `sudo systemctl daemon-reload && sudo systemctl restart <unit>`.
4. Wait about 5 s, then run `~/.cache/node24/n24 verify <unit> <health args from the table>`.
   - The exe must be `/opt/developed-runtimes/node-v24.21.0/bin/node`.
   - The HTTP codes must match the table.
   - There must be no new errors. Deprecation warnings are noted in the log, not fatal. A
     `status=143`/"Failed" line from the old next-server process during a restart is expected
     noise.
5. After 2 minutes, run `verify` again. `NRestarts` must be unchanged.
6. **If anything fails, roll back:**
   - `~/.cache/node24/n24 restore <unit>`
   - `sudo systemctl daemon-reload && sudo systemctl restart <unit>`
   - re-run `verify`; it should be back on v22
   - log the failure and stop for that unit

**When `restore` is valid.** `restore` puts back the exact pre-switch files, including any extra
`sed` made in the same step (guard and bundle paths). It is valid only until the release tool
deploys that app again (4g / Phase 5), because the hooks rewrite the `api-release.conf` drop-ins.
After such a deploy, a return to 22 means:

1. `n24 restore` the template files only.
2. Set `"node"` back to `22.23.2` and reinstall the tool.
3. For kestrek or mega-music, redo the guard-copy step in reverse: copy the live release's guard
   dir with `nodePath` set to v22, and point `api-release.conf` back at it.

The Phase 0 snapshot is for disaster recovery only.

### Health table

These rows mirror each app's `health` list in `apps/<app>.json`, which is authoritative if they
differ. All rows were probed and matching on 2026-10-11 at 22:54.

| Unit | `n24 verify` arguments → expected codes |
|---|---|
| myclinic instance | `http://127.0.0.1:3155/health http://127.0.0.1:3155/api/v1/config http://127.0.0.1:3155/api/v1/patients https://myclinic.sk/api/v1/config` → 200 200 401 200 |
| screentime instance | `http://127.0.0.1:3167/ http://127.0.0.1:3167/api/v1/app-update https://screentime.developed.sk/` → 200 200 200 |
| kestrek instance | `http://127.0.0.1:3164/api http://127.0.0.1:3164/api/folders https://kestrek.sk/api/folders` → 200 401 401 |
| mega-music instance | `http://127.0.0.1:3178/api/music/health https://megamusic.developed.sk/app/` → 200 200 |
| otazkomat instance | `http://127.0.0.1:3166/health https://educatio.sk/health` → 200 200 |
| airsoft instance | `http://127.0.0.1:3162/sk http://127.0.0.1:3162/sk/listings https://amp.developed.sk/sk` → 200 200 200 |
| vocabulum instance | `http://127.0.0.1:3161/login http://127.0.0.1:3161/words https://vocabulum.developed.sk/login` → 200 307 200 |
| developed-karak2 | `'unix:/run/karak2/api.sock\|http://localhost/health' 'unix:/run/karak2/web.sock\|http://localhost/' https://karak2.developed.sk/api/heroes` → 200 200 401 |
| developed-accounts | `'www.developed.sk\|http://127.0.0.1:3140/health'` → 200 |
| developed-data-boundary | `http://127.0.0.1:3143/healthz` → 200 |
| mega-youtube-front | `'unix:/run/mega-youtube-front/control.sock\|http://localhost/status'` → 200 |
| download-relay | no URL. Run `timeout 3 bash -c '</dev/tcp/127.0.0.1/1088' && echo open` → open |

**ALL-HEALTH** means running every row above. Use it after each boundary reload and at the end of
each phase.

---

## Phase P: Publish this plan

- [ ] Replace `~/Dev/developed-web/.claude/plans/node-24-runtime-upgrade.md` with this file.
- [ ] `git add` only that path, then commit `Node 24 runtime upgrade: implementation plan`.
- [ ] Push only after asking **(ask)**.

## Phase 0: Preflight (no service changes)

- [ ] Ask Erik to stop other deploy sessions.
- [ ] Run `sudo touch /etc/developed-apps/developed-release-paused`. The poll unit's
  `ConditionPathExists` then skips every run.
- [ ] **Working dir, backup, helper:**
  ```bash
  mkdir -p ~/.cache/node24 && B=/var/backups/node24/$(date +%F)
  sudo install -d -o root -g root -m 0700 "$B" "$B/etc/systemd" "$B/etc/jasom" "$B/usr/local/sbin" "$B/home/openclaw/.config/systemd"
  sudo cp -a /etc/systemd/system "$B/etc/systemd/"
  sudo cp -a /home/openclaw/.config/systemd/user "$B/home/openclaw/.config/systemd/"
  sudo cp -a /etc/jasom/worker.env "$B/etc/jasom/"
  sudo cp -a /usr/local/sbin/developed-disk-maintenance /usr/local/sbin/mega-music-deploy "$B/usr/local/sbin/"
  echo "$B" > ~/.cache/node24/backup-dir
  ```
  Then write `~/.cache/node24/n24` (above) and `chmod 0755` it.
- [ ] **Baseline.** Save it to `~/.cache/node24/baseline.txt` and summarise it in the Execution log:
  ```bash
  { for u in $(systemctl list-units --type=service --state=active --plain --no-legend | awk '{print $1}'); do
      pid=$(systemctl show -p MainPID --value "$u"); [ "$pid" -gt 0 ] 2>/dev/null || continue
      exe=$(sudo readlink "/proc/$pid/exe" 2>/dev/null) || continue
      [[ $exe == *node* ]] && echo "$u $exe NRestarts=$(systemctl show -p NRestarts --value "$u")"
    done
    sudo grep -rlF node-v22.23.2 /etc/systemd/system ~/.config/systemd /usr/local /etc/jasom
    ~/.nvm/versions/node/v22.23.2/bin/node ~/Dev/developed-web/server/accounts/deploy/release/developed-release.mjs status 2>&1
  } | tee ~/.cache/node24/baseline.txt
  ```
  `status` gives each app's **live source commit**, which Phase 2 uses. Run ALL-HEALTH once and
  record the codes.
- [ ] Check `df -h /` (26 GB free on 2026-10-11) and `free -h`.

## Phase 1: Install Node 24 next to 22 (no service changes)

1. **Download and verify:**
   ```bash
   D=~/.cache/node24/dl-v24.21.0; rm -rf "$D"; mkdir -p "$D"; cd "$D"
   for f in node-v24.21.0-linux-x64.tar.xz SHASUMS256.txt SHASUMS256.txt.sig; do curl -fsSLO "https://nodejs.org/dist/v24.21.0/$f"; done
   curl -fsSLo nodejs-keyring.kbx https://github.com/nodejs/release-keys/raw/HEAD/gpg-only-active-keys/pubring.kbx
   gpgv --keyring="$D/nodejs-keyring.kbx" SHASUMS256.txt.sig SHASUMS256.txt     # must report "Good signature"
   grep ' node-v24.21.0-linux-x64.tar.xz$' SHASUMS256.txt | sha256sum -c -       # must report OK
   tar -xJf node-v24.21.0-linux-x64.tar.xz node-v24.21.0-linux-x64/bin/node
   ```
   Stop if either check fails.
2. **Install** with the same minimal layout as v22:
   ```bash
   R=/opt/developed-runtimes/node-v24.21.0
   sudo install -d -o root -g root -m 0755 "$R" "$R/bin"
   sudo install -o root -g root -m 0755 "$D/node-v24.21.0-linux-x64/bin/node" "$R/bin/node"
   sudo find "$R" -printf '%M %u:%g %n %p\n'   # 2 dirs drwxr-xr-x root:root + bin/node -rwxr-xr-x root:root nlink 1
   cmp "$D/node-v24.21.0-linux-x64/bin/node" "$R/bin/node" && "$R/bin/node" -v   # v24.21.0
   ```
3. **Trust check.** This is read-only and verifier-loads only. It runs
   `assertTrusted(process.execPath)`:
   `sudo /opt/developed-runtimes/node-v24.21.0/bin/node /opt/developed-control/network/bind-boundary.mjs --check`
   It must exit 0.
4. **Build toolchain** (the default stays on 22):
   ```bash
   bash -c 'source ~/.nvm/nvm.sh && nvm install 24.21.0 && nvm alias default 22.23.2'
   cat ~/.nvm/alias/default; ~/.nvm/versions/node/v24.21.0/bin/npm -v     # 22.23.2 / 11.x
   N24=/home/openclaw/.nvm/versions/node/v24.21.0/bin                    # pnpm shim: karak2's steps call bare `pnpm`
   env PATH="$N24:/usr/local/bin:/usr/bin:/bin" "$N24/corepack" enable --install-directory "$N24"
   env PATH="$N24:/usr/local/bin:/usr/bin:/bin" bash -c 'command -v pnpm'   # …/v24.21.0/bin/pnpm
   ```
5. **yt-dlp stderr check.** yt-dlp passes `--permission` to Node ≥ 23.5 and fails on any stderr.
   This must print `clean`:
   `out=$(/opt/developed-runtimes/node-v24.21.0/bin/node --permission -e 'console.log(1)' 2>&1 >/dev/null); [ -z "$out" ] && echo clean`
6. **Outbound TLS under OpenSSL 3.5:**
   ```bash
   for u in https://api.mailjet.com/ https://api.smsgate.sk/ https://www.smsgate.sk/ https://challenges.cloudflare.com/ https://www.google.com/ https://api.cloudflare.com/ https://supabase.com/; do
     /opt/developed-runtimes/node-v24.21.0/bin/node -e "fetch(process.argv[1],{method:'HEAD'}).then(r=>console.log(r.status,process.argv[1])).catch(e=>{console.log('FAIL',e.cause?.code??e.message,process.argv[1]);process.exitCode=1})" "$u"; done
   ```
   Any HTTP status passes. A `FAIL ERR_SSL_*` blocks the apps that use that host (smsgate:
   myclinic, airsoft, accounts), so investigate before Phase 4.

## Phase 2: Test every live app on Node 24 (no production impact)

Run one row at a time and check `free -h` first. Record pass/fail per row in the Execution log. If
a row fails, rerun it with `NODE_BIN=/home/openclaw/.nvm/versions/node/v22.23.2/bin`.
- **Fails on 22 too:** it is pre-existing; note it and continue.
- **Fails only on 24:** fix it in that app's repo on its `node24-runtime` branch. The fix must stay
  green on 22. Do not switch that app until it is fixed.

**Tool-managed apps** run their exact release `steps` against `origin/main`. Write the runner
`~/.cache/node24/n24-steps.mjs`:

```js
// n24-steps.mjs <app>: run every side's release steps from apps/<app>.json against origin/<branch>
// in a scratch dir with Node 24 first in PATH (NODE_BIN overrides). Writes nothing outside ~/.cache.
import { mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadApp } from '/home/openclaw/Dev/developed-web/server/accounts/deploy/release/lib/config.mjs';
import { publicEnv } from '/home/openclaw/Dev/developed-web/server/accounts/deploy/release/lib/build.mjs';

const app = process.argv[2];
const bin = process.env.NODE_BIN ?? '/home/openclaw/.nvm/versions/node/v24.21.0/bin';
const config = loadApp(app);
const work = `/home/openclaw/.cache/node24/s-${app}`;
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) { console.error(`FAILED: ${cmd} ${String(args.at(-1)).split('\n')[0]}`); process.exit(1); }
};
rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
run('bash', ['-o', 'pipefail', '-ec', `git -C '${config.repo}' fetch -q origin '${config.branch}' && git -C '${config.repo}' archive 'origin/${config.branch}' ${config.archivePaths.join(' ')} | tar -x -C '${work}'`]);
for (const patch of config.patches ?? []) run('patch', ['-p1', '-F0', '--no-backup-if-mismatch', '-i', patch.path], { cwd: work });
for (const [name, side] of Object.entries(config.sides)) {
  const env = { PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`, HOME: '/home/openclaw', LANG: 'C.UTF-8', CI: 'true',
    NG_CLI_ANALYTICS: 'false', NEXT_TELEMETRY_DISABLED: '1', ...(side.env ?? {}), ...publicEnv(config, side.publicEnv) };
  console.error(`== ${app} ${name} with ${bin}`);
  run('flock', ['-w', '1800', '/home/openclaw/.cache/developed-ecosystem-build.lock', 'bash', '-o', 'pipefail', '-ec', side.steps.join('\n')], { cwd: work, env });
}
rmSync(work, { recursive: true, force: true });
console.error(`== ${app}: every step passed`);
```

Run it as `~/.nvm/versions/node/v24.21.0/bin/node ~/.cache/node24/n24-steps.mjs <app>`. It never
prints `publicEnv` values.

`LIVE` below is the live source commit from the Phase 0 `status`.

| # | Row | Command |
|---|---|---|
| 1–8 | every tool-managed app: kestrek, myclinic, screentime, mega-music, otazkomat, karak2, airsoft, vocabulum | `n24-steps.mjs <app>`, one app per run |
| 10 | developed-accounts (live **d1c3358ccbf7**, branch release/amp-sms-status-20261005) | `n24 test ~/Dev/developed-web d1c3358ccbf7 "server/accounts packages" server/accounts "npm ci --no-audit --no-fund && npm test"` |
| 11 | central deploy tooling + release tool | `n24 test ~/Dev/developed-web origin/main server/accounts server/accounts "node --test deploy/*.test.mjs deploy/release/*.test.mjs"`. Run it on 22 too and compare the failing sets; some fixtures are host-specific. If tests need `dist/`, prefix `npm ci --no-audit --no-fund && npm run build &&`. |
| 12 | kestrek guard | `n24 test ~/Dev/kestrek origin/main deploy deploy "node --test *.test.mjs"` |

Where a step needs a database or browser it cannot reach, note it and rely on the post-switch
verification. These old code paths run on 24 untested until their post-switch run:
- the kestrek worker (`releases/1c102674a293`);
- the cleanup module (pg from `4ca877f89a3d`);
- the mail worker (`502a7048…/dist`).

The worker-active, `Result=success` and mail-delivered checks in Phase 4 cover them.

---

## Phase 3: Release tool: per-app Node runtime, runtime gate, hooks pin Node

All paths are under `~/Dev/developed-web/server/accounts/deploy/release/`. Re-read every file first;
line anchors are from origin/main 6052e4e. `deploy()` is now a per-app lock wrapper (lock at
`~/.cache/developed-release/<app>.deploy.lock`) around `deployUnlocked()`, which holds the
`--dry-run` line and the `try {` block. Follow the existing style: ESM, 2-space indent, terse
comments.

1. **New `lib/runtime.mjs`:**
   ```js
   // Node runtime per app ("node" in apps/<app>.json, default DEFAULT_NODE). Builds put the
   // operator's nvm copy first in PATH; services run the root-owned /opt/developed-runtimes copy
   // their unit files name. This tool never edits unit files: an app moves to a new runtime by
   // hand (README "Node runtime"), and deploys refuse while a unit disagrees with the config.
   import { existsSync } from 'node:fs';
   import { ReleaseError, sudo } from './sh.mjs';

   export const DEFAULT_NODE = '22.23.2';
   export const NODE_VERSION = /^\d+\.\d+\.\d+$/;
   const RUNTIME = /\/opt\/developed-runtimes\/node-v[0-9.]+\/bin\/node/g;

   export const nodeVersion = (config) => config.node ?? DEFAULT_NODE;
   export const buildNodeBin = (config) => `/home/openclaw/.nvm/versions/node/v${nodeVersion(config)}/bin`;
   export const runtimeNode = (config) => `/opt/developed-runtimes/node-v${nodeVersion(config)}/bin/node`;

   // The unit a side's switch starts or restarts (a template without instance), if any.
   export function switchUnit(side) {
     if (side.switch?.type === 'instance-swap') return side.switch.unit.replace('{release}', '');
     if (side.switch?.type === 'symlink-restart') return side.switch.unit;
     return null;
   }

   // Why `systemctl cat` text of a unit does not run exactly `expected`, or null when it does.
   export function runtimeProblem(unitText, expected) {
     const named = [...new Set(unitText.match(RUNTIME) ?? [])];
     if (!named.includes(expected)) return `does not name ${expected}`;
     const others = named.filter((path) => path !== expected);
     return others.length ? `also names ${others.join(', ')}` : null;
   }

   export function assertRuntime(config, sides) {
     const build = `${buildNodeBin(config)}/node`;
     if (!existsSync(build)) throw new ReleaseError(`${config.app}: build Node ${build} is missing (nvm install ${nodeVersion(config)})`);
     const runtime = runtimeNode(config);
     if (!existsSync(runtime)) throw new ReleaseError(`${config.app}: runtime ${runtime} is missing`);
     for (const name of sides) {
       const unit = switchUnit(config.sides[name]);
       if (!unit) continue;
       const problem = runtimeProblem(sudo('systemctl', ['cat', '--', unit]).out, runtime);
       if (problem) throw new ReleaseError(`${config.app}: ${unit} ${problem}; switch its unit files by hand first or fix "node" (README "Node runtime")`);
     }
   }
   ```
   The gate matches `…/bin/node` only. A stale `Environment=PATH=…/node-v22.23.2/bin:` line
   (myclinic) is not caught by it, but `n24 switch` replaces that line together with `ExecStart`.
2. **`lib/config.mjs`:**
   - Add `import { NODE_VERSION } from './runtime.mjs';`.
   - In `validate()`, after the `releaseRoot` check, add:
     `need(config.node === undefined || NODE_VERSION.test(config.node), 'node must be an exact version such as 24.21.0');`
3. **`lib/build.mjs`:**
   - Delete `export const BUILD_NODE_BIN = …`. It is used only in this file.
   - Add `import { buildNodeBin, nodeVersion } from './runtime.mjs';`.
   - Change `baseEnv()` to `baseEnv(config)`, with
     `PATH: \`${buildNodeBin(config)}:/usr/local/bin:/usr/bin:/bin\``. The call becomes
     `...baseEnv(config)`.
   - Change the build log line to
     `log(\`${config.app}: building ${name} on Node ${nodeVersion(config)} (waiting for the shared build lock)\`);`.
   - Add `node: nodeVersion(config),` to the manifest after `builtBy`. The field is additive, so it
     stays version 2.
4. **`hooks/kestrek-notifications.mjs`:**
   - Delete `RUNTIME_NODE` and import `runtimeNode` from `../lib/runtime.mjs`.
   - Update the header comment to "…installs a guard copy pinned to the new unit and the app's Node
     runtime (config.node)…".
   - Replace `pinGuard` and `dropinFor` with:
     ```js
     export function pinGuard(source, guardPath, apiUnit, nodePath) {
       let pinned = source;
       for (const [name, value] of Object.entries({ guardPath, apiUnit, nodePath })) {
         const line = `export const ${name} = '${value}';`;
         pinned = pinned.replace(new RegExp(`^export const ${name} = .*$`, 'm'), line);
         if (!pinned.includes(line)) throw new ReleaseError('notification guard changed shape — cannot pin it');
       }
       return pinned;
     }

     export const dropinFor = (apiUnit, guardPath, nodePath) => [
       '# Managed by developed-release — pins the worker guard to the live API release.',
       '[Unit]',
       `After=${apiUnit}`,
       '[Service]',
       'ExecStartPre=',
       `ExecStartPre=+${nodePath} ${guardPath}`,
       '',
     ].join('\n');
     ```
   - In `after()`:
     - add `const nodePath = runtimeNode(config);`
     - call `pinGuard(showFile(…), guardPath, newUnit, nodePath)`
     - call `sudoWrite(DROPIN, dropinFor(newUnit, guardPath, nodePath))`
5. **`hooks/mega-music-cleanup.mjs`:**
   - Delete `RUNTIME_NODE` and import `runtimeNode` from `../lib/runtime.mjs`.
   - Mention the runtime pin in the header comment.
   - `pinCleanup({ guardSource, moduleSource, dir, apiUnit, nodePath })` also pins the guard's
     `nodePath`:
     `const guard = pinLine(pinLine(pinLine(guardSource, 'guardPath', guardPath), 'apiUnit', apiUnit), 'nodePath', nodePath);`
   - Change `cleanupDropin = (apiUnit, guardPath, modulePath, nodePath)` to use `${nodePath}` in
     both the `ExecStartPre=+` and `ExecStart=` lines.
   - In `after()`:
     - add `const nodePath = runtimeNode(config);`
     - pass it to `pinCleanup({ …, nodePath })`
     - call `cleanupDropin(newUnit, pinned.guardPath, pinned.modulePath, nodePath)`
6. **`developed-release.mjs`:**
   - Add `import { assertRuntime, nodeVersion } from './lib/runtime.mjs';`.
   - Replace the `--dry-run` line in `deployUnlocked()` with:
     ```js
     if (flags['dry-run']) {
       assertRuntime(config, decision.sides);
       log(`${app}: would deploy ${decision.sides.join(' + ')} at ${short(target)} on Node ${nodeVersion(config)}`);
       return;
     }
     ```
   - Make `assertRuntime(config, decision.sides);` the **first statement inside the `try {`**, so
     automatic runs record, notify and count the failure.
   - In `buildOnly()`, add `assertRuntime(config, sides);` after `sides` is computed.
   - In `status()`, append `  node ${nodeVersion(config)}` to the per-app header line.
7. **`install.sh`:**
   - After `SUB=…`, add:
     ```bash
     # Node that runs the tool itself (tests + poll unit). App builds use each app's "node".
     NODE=/home/openclaw/.nvm/versions/node/v24.21.0/bin/node
     ```
   - The test line becomes `"$NODE" --test "$TMP/$SUB/developed-release.test.mjs" >/dev/null`.
   - The unit line becomes
     `sed -e "s#@TOOL@#$DEST#" -e "s#@NODE@#$NODE#" "$TMP/$SUB/systemd/developed-release-poll.service" > "$UNITS/developed-release-poll.service"`.
8. **`systemd/developed-release-poll.service`:**
   - The comment becomes `# install.sh replaces @TOOL@ with the frozen root-owned copy for one tool revision and @NODE@ with the Node that runs the tool.`
   - The command becomes
     `ExecStart=/usr/bin/flock -n %h/.cache/developed-release/poll.lock @NODE@ @TOOL@/developed-release.mjs poll`.
9. **`developed-release.test.mjs`:**
   - Add the import
     `import { buildNodeBin, DEFAULT_NODE, nodeVersion, runtimeNode, runtimeProblem, switchUnit } from './lib/runtime.mjs';`.
   - Replace the kestrek pinning test, and add two tests:
     ```js
     test('kestrek guard pinning rewrites exactly the three constants', () => {
       const n24 = '/opt/developed-runtimes/node-v24.21.0/bin/node';
       const src = "export const guardPath = '/old';\nexport const nodePath = '/n';\nexport const apiUnit = 'developed-kestrek@old.service';\nexport const workerUnit = 'w';\n";
       const out = pinGuard(src, '/opt/developed-control/kestrek-notifications-abc/g.mjs', 'developed-kestrek@abc.service', n24);
       assert.match(out, /guardPath = '\/opt\/developed-control\/kestrek-notifications-abc\/g\.mjs'/);
       assert.match(out, /apiUnit = 'developed-kestrek@abc\.service'/);
       assert.match(out, /nodePath = '\/opt\/developed-runtimes\/node-v24\.21\.0\/bin\/node'/);
       assert.match(out, /workerUnit = 'w'/);
       assert.throws(() => pinGuard('no constants here', '/g', 'u', n24), /changed shape/);
       assert.throws(() => pinGuard("export const guardPath = '/x';\nexport const apiUnit = 'u';\n", '/g', 'u', n24), /changed shape/);
       const dropin = dropinFor('developed-kestrek@abc.service', '/g', n24);
       assert.match(dropin, /^ExecStartPre=$/m);
       assert.match(dropin, /^ExecStartPre=\+\/opt\/developed-runtimes\/node-v24\.21\.0\/bin\/node \/g$/m);
     });

     test('node runtime defaults to 22.23.2 and follows config.node', () => {
       assert.equal(nodeVersion({}), DEFAULT_NODE);
       assert.equal(buildNodeBin({}), '/home/openclaw/.nvm/versions/node/v22.23.2/bin');
       assert.equal(runtimeNode({}), '/opt/developed-runtimes/node-v22.23.2/bin/node');
       assert.equal(buildNodeBin({ node: '24.21.0' }), '/home/openclaw/.nvm/versions/node/v24.21.0/bin');
       assert.equal(runtimeNode({ node: '24.21.0' }), '/opt/developed-runtimes/node-v24.21.0/bin/node');
     });

     test('unit runtime gate', () => {
       const v22 = '/opt/developed-runtimes/node-v22.23.2/bin/node', v24 = '/opt/developed-runtimes/node-v24.21.0/bin/node';
       const unit = `[Service]\nExecStart=${v24} dist/main.js\n# drop-in\nExecStartPre=${v24} /opt/x/assert.mjs kestrek\n`;
       assert.equal(runtimeProblem(unit, v24), null);
       assert.match(runtimeProblem(unit, v22), /does not name/);
       assert.match(runtimeProblem(`${unit}ExecStartPre=${v22} /g.mjs\n`, v24), /also names .*node-v22\.23\.2/);
       assert.equal(switchUnit({ switch: { type: 'instance-swap', unit: 'developed-kestrek@{release}.service' } }), 'developed-kestrek@.service');
       assert.equal(switchUnit({ switch: { type: 'symlink-restart', unit: 'developed-karak2.service', link: '/x' } }), 'developed-karak2.service');
       assert.equal(switchUnit({ switch: { type: 'web-symlink', link: '/x' } }), null);
     });
     ```
   - **mega-music cleanup test:**
     - Add `export const nodePath = '/n';\n` to `guardSource`.
     - Call `pinCleanup({ guardSource, moduleSource, dir, apiUnit: unit, nodePath: n24 })` with
       `const n24 = '/opt/developed-runtimes/node-v24.21.0/bin/node'`.
     - Add `assert.ok(p.guard.includes(\`export const nodePath = '${n24}';\`));`.
     - Call `cleanupDropin(unit, p.guardPath, p.modulePath, n24)`, and change the two `node-v22.23.2`
       assertions to `${n24}`.
   - **Config validation test:** add
     `assert.throws(() => validate({ ...structuredClone(base), node: '24' }), /exact version/);` and
     `assert.doesNotThrow(() => validate({ ...structuredClone(base), node: '24.21.0' }));`.
10. **`README.md`:** add a section after "## Automatic deploys":
    ```markdown
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
    ```
11. **Verify:**
    - Run `cd ~/Dev/developed-web/server/accounts/deploy/release && ~/.nvm/versions/node/v24.21.0/bin/node --test developed-release.test.mjs`.
      Every test must pass, and the same with the v22.23.2 node.
    - `node developed-release.mjs status` shows `node 22.23.2` for every app.
    - `node developed-release.mjs deploy myclinic --dry-run --force` passes the gate, because units
      are still on 22.
12. Commit only these files: `lib/runtime.mjs`, `lib/config.mjs`, `lib/build.mjs`, both hooks,
    `developed-release.mjs`, `install.sh`, the poll unit, the test and `README.md`.
    - Message: `developed-release: per-app Node runtime, unit runtime gate, hooks pin Node; tool runs on Node 24`.
    - Push **(ask)**, then run `server/accounts/deploy/release/install.sh`.
    - Check that `grep ExecStart ~/.config/systemd/user/developed-release-poll.service` shows
      `/home/openclaw/.nvm/versions/node/v24.21.0/bin/node` and the new copy.
    - Check that the timer is still enabled and the pause file is still present.

---

## Phase 4: Switch services (one at a time, in this order)

### 4a. Canary: Mega/JASOM helpers (no direct users)

- [ ] **mega-youtube-front:** Procedure U with the socket row.
- [ ] **download-relay:** Procedure U, then the TCP row.
- [ ] **mega-youtube-isolated** (Python; `Environment=YTDLP_JS_RUNTIME=node:/opt/…`):
  1. Check that it is idle: `sudo journalctl -u mega-youtube-isolated --since -10min -q | tail`.
  2. Run Procedure U. `verify` shows the python exe, so only `is-active` counts.
  3. **Ask Erik to run one YouTube import in Mega Music** and watch
     `sudo journalctl -u mega-youtube-isolated -f`. It must succeed with no JS-runtime error.
- [ ] **JASOM yt-dlp runtime** (`/etc/jasom/worker.env`):
  ```bash
  sudo grep -c 'node-v22.23.2' /etc/jasom/worker.env      # 1
  sudo sed -i 's#/opt/developed-runtimes/node-v22.23.2/#/opt/developed-runtimes/node-v24.21.0/#' /etc/jasom/worker.env
  ```
- [ ] **JASOM `PATH` runtime.** `/opt/jasom/runtime-node` is a root symlink to the v22 directory.
  Swap it atomically:
  ```bash
  readlink /opt/jasom/runtime-node        # /opt/developed-runtimes/node-v22.23.2
  sudo ln -sfn /opt/developed-runtimes/node-v24.21.0 /opt/jasom/runtime-node.tmp && sudo mv -T /opt/jasom/runtime-node.tmp /opt/jasom/runtime-node
  readlink /opt/jasom/runtime-node        # …node-v24.21.0
  ```
- [ ] Restart `jasom-submissions-isolated.service` after checking it is idle, then
  `jasom-web-isolated@green.service`. Both have `deps` (none). Check `is-active` and the journal.
  **Ask Erik for one JASOM YouTube submission.**
- **Rollback:**
  ```bash
  B=$(cat ~/.cache/node24/backup-dir)
  sudo cp -a "$B/etc/jasom/worker.env" /etc/jasom/worker.env
  sudo ln -sfn /opt/developed-runtimes/node-v22.23.2 /opt/jasom/runtime-node.tmp && sudo mv -T /opt/jasom/runtime-node.tmp /opt/jasom/runtime-node
  ```
  Then restart both units.
- **Repo:** in `~/Dev/jasom`, update `deploy/runtime-isolation.md:70` to name node-v24.21.0. JASOM
  is not a tool app, so commit on main and push **(ask)**.

### 4b. myclinic

- [ ] Run Procedure U on `$(~/.cache/node24/n24 live developed-myclinic)`. It switches the
  template's `Environment=PATH=` and `ExecStart`. Use the myclinic health row.
- [ ] **Cron user drop-in:**
  ```bash
  F=~/.config/systemd/user/myclinic-cron@.service.d/runtime-target.conf
  grep -c node-v22.23.2 "$F"     # 1
  sed -i 's#/opt/developed-runtimes/node-v22.23.2/#/opt/developed-runtimes/node-v24.21.0/#' "$F" && systemctl --user daemon-reload
  systemctl --user cat myclinic-cron@tick.service | grep '^ExecStart=/'      # v24
  /opt/developed-runtimes/node-v24.21.0/bin/node --check /opt/developed-apps/myclinic/operator/run-cron.mjs
  ```
  - Do not trigger the jobs. After the next 08:00 UTC run, check
    `journalctl --user -u 'myclinic-cron@*' --since today`.
  - Rollback:
    `sudo cp -a "$(cat ~/.cache/node24/backup-dir)/home/openclaw/.config/systemd/user/myclinic-cron@.service.d/runtime-target.conf" "$F"`,
    then `systemctl --user daemon-reload`.

### 4c. screentime

- [ ] Run Procedure U on `$(~/.cache/node24/n24 live developed-screentime)`. It covers the template
  `ExecStart` and `central-production.conf`. Use the screentime row. UID 983 may bind only 3167, so
  the restart has a sub-second gap.

### 4d. kestrek API + notification worker (guard-coupled)

This takes seconds of API downtime; pick a quiet moment. Run block 3 as one call. Between its
`daemon-reload` and the API restart, a worker restart would refuse, because its guard is already
on v24 while the API is still on 22.

**Block 1: derive and save the variables.**
```bash
LIVE=$(~/.cache/node24/n24 live developed-kestrek); echo "$LIVE"          # exactly one unit
REL=${LIVE#developed-kestrek@}; REL=${REL%.service}
DROPIN=/etc/systemd/system/developed-kestrek-notifications.service.d/api-release.conf
G_OLD=/opt/developed-control/kestrek-notifications-$REL; G_NEW=$G_OLD-node24
sudo grep -cF "$G_OLD/notifications-owner-check.mjs" "$DROPIN"             # must print 1, else STOP
sudo test ! -e "$G_NEW" && printf 'LIVE=%s\nDROPIN=%s\nG_OLD=%s\nG_NEW=%s\n' "$LIVE" "$DROPIN" "$G_OLD" "$G_NEW" > ~/.cache/node24/kestrek.env
```

**Block 2: guard copy pinned to v24.** Only `guardPath` and `nodePath` change.
```bash
source ~/.cache/node24/kestrek.env; : "${LIVE:?}" "${G_OLD:?}" "${G_NEW:?}" "${DROPIN:?}"
sudo install -d -o root -g root -m 0755 "$G_NEW"
sudo sed -e "s#^export const guardPath = .*#export const guardPath = '$G_NEW/notifications-owner-check.mjs';#" \
         -e "s#^export const nodePath = .*#export const nodePath = '/opt/developed-runtimes/node-v24.21.0/bin/node';#" \
         "$G_OLD/notifications-owner-check.mjs" | sudo tee "$G_NEW/notifications-owner-check.mjs" >/dev/null
sudo chown root:root "$G_NEW/notifications-owner-check.mjs"; sudo chmod 0644 "$G_NEW/notifications-owner-check.mjs"
sudo diff "$G_OLD/notifications-owner-check.mjs" "$G_NEW/notifications-owner-check.mjs"   # exactly the 2 lines
sudo /opt/developed-runtimes/node-v24.21.0/bin/node --check "$G_NEW/notifications-owner-check.mjs"
```

**Block 3: units, then restart the API and the worker.**
```bash
source ~/.cache/node24/kestrek.env; : "${LIVE:?}" "${G_OLD:?}" "${G_NEW:?}" "${DROPIN:?}"
~/.cache/node24/n24 switch "$LIVE"                                  # template + central-production.conf
~/.cache/node24/n24 switch developed-kestrek-notifications.service  # base unit + api-release.conf
sudo sed -i "s#$G_OLD/#$G_NEW/#" "$DROPIN"
sudo systemctl daemon-reload
sudo systemctl cat developed-kestrek-notifications.service | grep '^ExecStartPre=+' | tail -1   # v24 node + $G_NEW
sudo systemctl restart "$LIVE"
for i in $(seq 30); do [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:3164/api)" = 200 ] && break; sleep 1; done
sudo systemctl restart developed-kestrek-notifications.service; sleep 5
~/.cache/node24/n24 verify "$LIVE" http://127.0.0.1:3164/api http://127.0.0.1:3164/api/folders https://kestrek.sk/api/folders
~/.cache/node24/n24 verify developed-kestrek-notifications.service
sudo journalctl -u developed-kestrek-notifications.service --since -2min -q --no-pager | grep -c ownershipVerified   # ≥ 1
```

- Keep the legacy user units `kestrek-prod`, `kestrek-backend` and `kestrek-frontend` untouched.
  The guard requires them to stay loaded, inactive and disabled.
- **Rollback:**
  1. `n24 restore "$LIVE"` and `n24 restore developed-kestrek-notifications.service`
  2. `sudo systemctl daemon-reload`
  3. restart `$LIVE`, wait for 200, then restart the worker
  4. check for `ownershipVerified` again

### 4e. mega-music API + session cleanup (guard-coupled; hook-managed directory)

Start right after an hourly cleanup run:
`systemctl list-timers mega-music-session-cleanup.timer` should show ≥ 45 min until the next one.

**Block 1: derive and save the variables.**
```bash
LIVE=$(~/.cache/node24/n24 live mega-music-accounts-isolated); echo "$LIVE"      # exactly one
DROPIN=/etc/systemd/system/mega-music-session-cleanup.service.d/api-release.conf
C_OLD=$(sudo grep -o '/opt/developed-control/mega-music-session-cleanup-[^/ ]*' "$DROPIN" | sort -u); echo "$C_OLD"   # exactly one
sudo grep -c "^export const apiUnit = '$LIVE';" "$C_OLD/session-cleanup-owner-check.mjs"   # 1, else STOP
sudo ls -la "$C_OLD"        # exactly session-cleanup-owner-check.mjs + session-cleanup.mjs (root 0644, nlink 1), else STOP
C_NEW=$C_OLD-node24; sudo test ! -e "$C_NEW" && printf 'LIVE=%s\nDROPIN=%s\nC_OLD=%s\nC_NEW=%s\n' "$LIVE" "$DROPIN" "$C_OLD" "$C_NEW" > ~/.cache/node24/mega.env
```

**Block 2: copies.**
- Guard: `guardPath` and `nodePath` change.
- Module: `modulePath` changes.
- `release` and `apiUnit` stay.
```bash
source ~/.cache/node24/mega.env; : "${LIVE:?}" "${C_OLD:?}" "${C_NEW:?}" "${DROPIN:?}"
sudo install -d -o root -g root -m 0755 "$C_NEW"
sudo sed -e "s#^export const guardPath = .*#export const guardPath = '$C_NEW/session-cleanup-owner-check.mjs';#" \
         -e "s#^export const nodePath = .*#export const nodePath = '/opt/developed-runtimes/node-v24.21.0/bin/node';#" \
         "$C_OLD/session-cleanup-owner-check.mjs" | sudo tee "$C_NEW/session-cleanup-owner-check.mjs" >/dev/null
sudo sed -e "s#^export const modulePath = .*#export const modulePath = '$C_NEW/session-cleanup.mjs';#" \
         "$C_OLD/session-cleanup.mjs" | sudo tee "$C_NEW/session-cleanup.mjs" >/dev/null
for f in session-cleanup-owner-check.mjs session-cleanup.mjs; do sudo chown root:root "$C_NEW/$f"; sudo chmod 0644 "$C_NEW/$f"; done
sudo diff "$C_OLD/session-cleanup-owner-check.mjs" "$C_NEW/session-cleanup-owner-check.mjs"   # exactly guardPath + nodePath
sudo diff "$C_OLD/session-cleanup.mjs" "$C_NEW/session-cleanup.mjs"                           # exactly modulePath
sudo grep -c node-v22 "$C_NEW/session-cleanup.mjs" || true                                     # 0, else STOP
```

**Block 3: units, then restart the API and run the job once.**
```bash
source ~/.cache/node24/mega.env; : "${LIVE:?}" "${C_OLD:?}" "${C_NEW:?}" "${DROPIN:?}"
~/.cache/node24/n24 switch "$LIVE"                                  # template + central-production.conf
~/.cache/node24/n24 switch mega-music-session-cleanup.service       # base unit + api-release.conf
sudo sed -i "s#$C_OLD/#$C_NEW/#g" "$DROPIN"
sudo systemctl daemon-reload
sudo systemctl cat mega-music-session-cleanup.service | grep -E '^ExecStart(Pre)?=.+' | tail -2   # v24 + $C_NEW
sudo systemctl restart "$LIVE"
for i in $(seq 30); do [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:3178/api/music/health)" = 200 ] && break; sleep 1; done
~/.cache/node24/n24 verify "$LIVE" http://127.0.0.1:3178/api/music/health https://megamusic.developed.sk/app/
sudo systemctl start mega-music-session-cleanup.service
systemctl show -p Result --value mega-music-session-cleanup.service        # success
sudo journalctl -u mega-music-session-cleanup.service --since -5min -q --no-pager | tail
```

- Keep `mega-music-accounts.service` and `mega-music-accounts-green.service` as they are. The
  guard requires them to stay loaded, inactive and disabled.
- **Rollback:**
  1. `n24 restore "$LIVE"` and `n24 restore mega-music-session-cleanup.service`
  2. `sudo systemctl daemon-reload`
  3. restart `$LIVE`
  4. `systemctl start` the job

### 4f. Tool config follows the units

1. Set `"node": "24.21.0"` right after `"auto": true` in `apps/myclinic.json`,
   `apps/screentime.json`, `apps/kestrek.json` and `apps/mega-music.json`. The other four apps
   follow in 4h.
2. Run the tool tests, then commit `developed-release: kestrek, myclinic, screentime and mega-music run Node 24.21.0`.
3. Push **(ask)** and run `install.sh`.
4. Check:
   - `status` shows `node 24.21.0` for these four apps.
   - `deploy <app> --dry-run --force` passes the gate for each.
   - The gate refuses a mismatch: in a scratch clone, set one app back to `22.23.2` and run
     `--dry-run --force` from there.

### 4g. Prove build, switch and hooks on Node 24 (still paused; manual deploys)

For each repo:
1. Read its `AGENTS.md` / `CLAUDE.md`.
2. Run `git status`, `git switch main`, `git pull --ff-only`, then `git switch -c node24-runtime`.
3. Edit only the files listed below and run the tests on 24.
4. Commit on the branch.
5. **Ask Erik to merge to main.** That merge is the deploy commit; push **(ask)**.
6. Deploy manually while paused:
   `~/.nvm/versions/node/v24.21.0/bin/node /opt/developed-control/developed-release-<installed>/developed-release.mjs deploy <app>`.
7. Expect:
   - the log says "building … on Node 24.21.0";
   - the new instance exe is v24;
   - `sudo grep '"node"' <releaseRoot>/<rel>/release-manifest.json` gives `"24.21.0"`;
   - the health row passes.

   On failure, the tool rolls back by itself, 24↔24.

**myclinic** (`~/Dev/my-clinic`):
- Edit:
  - `.nvmrc` `22` → `24`
  - `engines.node` `"22.x"` → `"24.x"` in `backend/package.json` and `frontend/package.json`, plus
    `packages[""].engines` in each lock file by hand if present. Do not regenerate the locks.
  - `deploy/developed-myclinic@.service:18-19`
  - docs: `CLAUDE.md:15`, `AGENTS.md:19`, `README.md:16`, `deploy/README.md:30,39-41,82`. The
    39-41 paragraph should now say the platform moved to Node 24.21.0 on <date>.
- Test: `node --test deploy/*.test.mjs`.
- Both sides deploy.

**kestrek** (`~/Dev/kestrek`):
- Edit:
  - `deploy/notifications-owner-check.mjs:8` `nodePath` → v24
  - `deploy/developed-kestrek@.service:14` and `deploy/developed-kestrek-notifications.service:15-16`.
    The guard's test requires the unit to contain `nodePath`.
  - `backend/package.json` `engines.node` `>=22.12.0` → `>=24`, plus the lock root entry
  - docs: `docs/runtime-isolation.md:48`, `docs/ecosystem-identity.md:89`
- Test: `node --test deploy/*.test.mjs`.
- The api deploys. The hook writes `kestrek-notifications-<new rel>` with v24 `nodePath`, and the
  worker shows `ownershipVerified`.

**mega-music** (`~/Dev/mega-media-player`):
- Edit:
  - `server/accounts/deploy/session-cleanup-owner-check.mjs:7` `nodePath` → v24
  - `prepare-session-cleanup-env.mjs:80`
  - unit copies:
    - `server/accounts/deploy/mega-music-session-cleanup.service:14-15`
    - `server/accounts/deploy/mega-music-accounts-isolated@.service:15`
    - `server/deploy/download-relay.service:11`
    - `server/deploy/mega-youtube-front.service:12`
    - `server/deploy/mega-youtube-isolated.service:23`
  - current-state docs: `AGENTS.md:68`, `server/accounts/README.md:56,175`,
    `server/accounts/deploy/runtime-isolation.md:75,108,109`, `server/accounts/deploy/session-cleanup.md:114`
- Test: `npm test --prefix server/accounts` and `node --test server/accounts/deploy/*.test.mjs`.
- The api deploys. The hook writes `mega-music-session-cleanup-<new rel>` with v24 `nodePath` and
  a v24 drop-in, and the job runs `Result=success`.

**screentime** (`~/Dev/screentime`):
- Edit `deploy/developed-screentime@.service:14` and `deploy/runtime-isolation.md:6,32,33` only.
  The working tree is dirty in `web/`, so stage only these files.
- These are outside `paths: web`, so no deploy. Its first Node 24 build is Phase 2 row 3, then
  Phase 5.

### 4h. otazkomat, airsoft, vocabulum, karak2 (tool-managed; each separately), then their config

- [ ] **otazkomat:** Procedure U on `$(~/.cache/node24/n24 live developed-otazkomat)`. This covers
  the template and `central-production.conf`.
- [ ] **airsoft:** Procedure U on `$(~/.cache/node24/n24 live developed-airsoft)`. The template
  holds both the `ExecStartPre` and `node …/server.js` lines.
- [ ] **vocabulum:** Procedure U on `$(~/.cache/node24/n24 live developed-vocabulum)`, which has
  the same shape as airsoft.
- [ ] **karak2:** Procedure U on `developed-karak2.service`. Its children inherit
  `process.execPath`. **A restart drops every session and running game, so ask Erik for the
  time.**
- [ ] **Config:**
  1. Set `"node": "24.21.0"` in `apps/otazkomat.json`, `apps/airsoft.json`, `apps/vocabulum.json`
     and `apps/karak2.json`, and run the tool tests.
  2. Commit `developed-release: otazkomat, airsoft, vocabulum and karak2 run Node 24.21.0` and push
     **(ask)**.
  3. Run `install.sh`.
  4. `deploy <app> --dry-run --force` must pass the gate for each.
  5. Their first Node 24 builds are Phase 2 and then Phase 5.
- **Repos.** Use a `node24-runtime` branch per repo. Edit only the runtime mentions in `deploy/`
  unit copies and current-state docs:
  - otazkomat: `deploy/developed-otazkomat@.service`, `docs/runtime-isolation.md:22,54`
  - karak2: `deploy/developed-karak2.service`
  - airsoft and vocabulum: their `deploy/` unit copies and `deploy/host-runtime.md`

  Run `grep -rn node-v22 deploy docs *.md`, and skip any file already dirty with someone else's
  work. Log skipped files as follow-ups. Erik merges; a merge deploys only if it touches the app's
  side `paths`.

### 4i. Central identity: developed-accounts + mail worker, auth-green check

Use a quiet window. Read `deploy/central-mail-worker.md` and
`portal-upgrade-checkpoint-20260921.md` first.

1. **Source** (developed-web; source-only):
   - Edit:
     - `central-mail-worker-guard.mjs:13` `NODE` → v24
     - `portal-upgrade-input.mjs:12` `NODE` → v24, and its regex in `portal-upgrade-input.test.mjs:34`
     - unit copies in `server/accounts/deploy/`: `developed-accounts.service:15`,
       `developed-accounts-mail-worker.service:16-17`, `bind-boundary.service:12-13`,
       `developed-uid-boundary.service:13-14`, `developed-data-boundary.service:15`,
       `green-provider-boundary.service:14-15`, `green-provider-runtime.service:11`
   - Leave the one-time operators as they are: the dated 2026-09-20/21 scripts,
     `install-central-runtime-guards.mjs` and `seal-tailscale-runtime-sockets.mjs`.
   - `node --test server/accounts/deploy/*.test.mjs` on 24 must show no new failures compared with
     Phase 2 row 11.
   - Commit `Central mail worker guard and unit sources pin Node 24.21.0` and push **(ask)**.
2. **New bundle**, as a copy of the live bundle with only `NODE` changed:
   ```bash
   OLDB=$(sudo grep -o '/opt/developed-accounts/mail-workers/[0-9a-f]\{40\}' /etc/systemd/system/developed-accounts-mail-worker.service.d/browser-family-release.conf | sort -u); echo "$OLDB"   # exactly one
   sudo ls -la "$OLDB"      # exactly central-mail-worker{,-input,-guard}.mjs, 0444, dir 0555
   NEWB=$OLDB-node24; sudo test ! -e "$NEWB" && printf 'OLDB=%s\nNEWB=%s\n' "$OLDB" "$NEWB" > ~/.cache/node24/mail.env
   sudo install -d -o root -g root -m 0755 "$NEWB.tmp"
   for f in central-mail-worker.mjs central-mail-worker-input.mjs central-mail-worker-guard.mjs; do sudo install -o root -g root -m 0444 "$OLDB/$f" "$NEWB.tmp/$f"; done
   sudo sed -i "s#^export const NODE = .*#export const NODE = '/opt/developed-runtimes/node-v24.21.0/bin/node';#" "$NEWB.tmp/central-mail-worker-guard.mjs"
   sudo diff -r "$OLDB" "$NEWB.tmp"                     # exactly the NODE line
   sudo find "$NEWB.tmp" -printf '%M %u:%g %n %p\n'      # files -r--r--r-- root:root 1
   sudo chmod 0555 "$NEWB.tmp" && sudo mv -T "$NEWB.tmp" "$NEWB"
   ```
3. **Units:**
   ```bash
   source ~/.cache/node24/mail.env; : "${OLDB:?}" "${NEWB:?}"
   ~/.cache/node24/n24 switch developed-accounts.service
   ~/.cache/node24/n24 switch developed-accounts-mail-worker.service   # base + browser-family-release.conf
   sudo sed -i "s#$OLDB/#$NEWB/#g" /etc/systemd/system/developed-accounts-mail-worker.service.d/browser-family-release.conf
   sudo systemctl daemon-reload
   sudo systemctl cat developed-accounts-mail-worker.service | grep -E '^ExecStart(Pre)?=.+' | tail -2   # v24 + $NEWB
   ```
4. **Restart in the documented order: drain, API, approved start.**
   ```bash
   sudo systemctl stop developed-accounts-mail-worker.service          # drains the in-flight tick (≤ 100 s)
   sudo systemctl restart developed-accounts.service                   # PartOf does not start a stopped worker
   for i in $(seq 60); do [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' -H 'Host: www.developed.sk' http://127.0.0.1:3140/health)" = 200 ] && break; sleep 1; done
   ~/.cache/node24/n24 verify developed-accounts.service 'www.developed.sk|http://127.0.0.1:3140/health'   # 200, exe v24
   ```
   **Ask Erik to approve starting the mail worker**, then:
   `sudo systemctl start developed-accounts-mail-worker.service && ~/.cache/node24/n24 verify developed-accounts-mail-worker.service`
   It must be active with exe v24, and the guard must pass.
5. **End-to-end:** Erik signs in to kestrek.sk through central login, then requests a password
   reset to his own address. The mail must arrive.
6. **Rollback:**
   1. `n24 restore developed-accounts.service` and `n24 restore developed-accounts-mail-worker.service`
   2. `daemon-reload`
   3. stop the worker
   4. restart the API and wait for 200
   5. start the worker (ask)
7. **auth-green: no restart.** It is `RequiredBy` developed-accounts.
   - Run `n24 switch developed-auth-green.service` and `sudo systemctl daemon-reload`.
   - Confirm the script path with `systemctl cat`.
   - Run `sudo /opt/developed-runtimes/node-v24.21.0/bin/node /opt/developed-control/green-provider/green-provider-load-boundary.mjs --check`.
     It must exit 0; `--check` only runs `nft --check`.
8. Update the "Current checkpoint" line of `deploy/central-mail-worker.md` with `$NEWB` and Node
   24.21.0 (in Phase 6).

### 4j. Boundaries

**Never `restart` bind-boundary, developed-uid-boundary or green-provider-boundary.** Units
`Requires=` them, so a restart cascades. Use `reload` only: it re-runs `--apply` atomically,
through the switched `ExecReload` line.

- [ ] **developed-data-boundary:** `deps` is `(none)`, so Procedure U applies with the data
  boundary row. Then run ALL-HEALTH.
- [ ] **green-provider-boundary:**
  1. `n24 switch`, then `daemon-reload`.
  2. `sudo /opt/developed-runtimes/node-v24.21.0/bin/node /opt/developed-control/green-provider/green-provider-load-boundary.mjs --check`
  3. `sudo systemctl reload green-provider-boundary.service`
  4. `is-active`; the journal must be clean.
  5. A central sign-in still works.
- [ ] **bind-boundary:**
  1. `n24 switch`, then `daemon-reload`.
  2. `sudo /opt/developed-runtimes/node-v24.21.0/bin/node /opt/developed-control/network/bind-boundary.mjs --check`
  3. `sudo systemctl reload bind-boundary.service`
  4. Run ALL-HEALTH.
- [ ] **developed-uid-boundary:**
  1. `n24 switch` (the base unit + `managed-music.conf`; the effective lines use
     `network-music-e307109`), then `daemon-reload`.
  2. `sudo /usr/bin/flock --nonblock /run/developed-uid-boundary/loader.lock /opt/developed-runtimes/node-v24.21.0/bin/node /opt/developed-control/network-music-e307109/load-uid-boundary.mjs --check`
  3. `sudo systemctl reload developed-uid-boundary.service`
  4. Run ALL-HEALTH, and ask Erik for one Mega YouTube import (egress through the relay).
- Rollback for each boundary: `n24 restore <unit>`, `daemon-reload`, then `reload`.

### 4k. Operator side

- [ ] **`/usr/local/sbin/developed-disk-maintenance`** (the line with `/opt/node-v22.23.2/bin/npm`,
  line 84):
  - Replace it with `    /usr/bin/sudo -u openclaw /usr/bin/rm -rf -- /home/openclaw/.npm/_cacache`.
    That is what `npm cache clean --force` deletes, and it drops the Node dependency.
  - Check with `sudo bash -n /usr/local/sbin/developed-disk-maintenance`. It is backed up in Phase 0.
- [ ] **Interactive default:**
  `bash -c 'source ~/.nvm/nvm.sh && nvm use 24.21.0 && nvm reinstall-packages 22.23.2 && nvm alias default 24.21.0'`.
  This reinstalls the global packages (Claude Code, pnpm/corepack, playwright, pm2, vercel, …). In
  a new shell, check that `node -v` gives v24.21.0 and `claude --version` works.
- [ ] Leave `/usr/local/sbin/mega-music-deploy` (blocked by its guard; exits 3) and
  `/usr/local/bin/{node,npm,claude}` (→ nvm 22.22.2) for Phase 7.

---

## Phase 5: Unpause and prove auto-deploy on 24

- [ ] Run `sudo rm /etc/developed-apps/developed-release-paused`.
- [ ] On the next real merge to any tool-managed app, follow
  `journalctl --user -u developed-release-poll -f`. Check:
  - the log says "on Node 24.21.0";
  - the manifest has `"node": "24.21.0"`;
  - the new exe is v24;
  - health passes;
  - the hooks succeed (kestrek `ownershipVerified`; mega-music cleanup `Result=success`).
- [ ] After 24 h, run `grep -i fail ~/.local/state/developed-release/history.log | tail` and check
  the 08:00 UTC myclinic cron runs.
- [ ] **After the next host reboot** (planned maintenance or supervised), check that
  `bind-boundary`, `developed-uid-boundary` and `green-provider-boundary` are `active`. The
  oneshot loaders' `ExecStart` path, as opposed to `ExecReload`, only runs at boot. Then run
  ALL-HEALTH, and check that every unit in the baseline came back on the v24 exe.

## Phase 6: Docs

- [ ] **developed-web current-state docs.** Update:
  - `server/accounts/README.md:147,331-332`
  - `deploy/runtime-isolation.md:30,197` (line 30 is stale: Node is no longer under nvm home)
  - `deploy/central-runtime.md:11`
  - `operators/central-superadmin-bootstrap.md:29`
  - `deploy/central-mail-worker.md` (4i step 8)

  In `central-runtime.md`, add a note that `install-central-runtime-guards.mjs` and
  `seal-tailscale-runtime-sockets.mjs` are single-use operators pinned to 22, kept as history. Leave
  dated checkpoints and operator worksheets unchanged. Commit and push **(ask)**.
- [ ] **Workspace:**
  - Add a new recipe `~/workspace/docs/config/node-24-runtime-upgrade.md` (Problem/Goal · Steps ·
    Verification · Related files, dated, with the Node version), and link it from the README index.
  - Add the `node` field and the runtime gate to `config/developed-release-tool.md`.
  - Add the disk-maintenance change to `config/vps-maintenance-2026-09-12.md`.
  - Run `ws-backup`.
- [ ] Mark this plan **Completed** with the date, and finish the Execution log.

## Phase 7: Retire Node 22 (≥ 14 days after Phase 5 with no rollback; separate session)

- [ ] `sudo grep -rlF node-v22.23.2 /etc/systemd/system ~/.config/systemd /usr/local /etc/jasom` must
  list only inactive units. Check each with `systemctl is-active`.
  - On 2026-10-11 at 22:54, 34 files under `/etc/systemd/system` still named v22. Most are old
    airsoft, vocabulum and accounts candidate units.
  - Decide each **with Erik**: switch it to v24 (backup + `sed`, no start) or retire it via
    `docs/app-retirement-2026-10-02.md`.
- [ ] Also review the inactive or disabled user units on nvm 22: `kestrek-autodeploy`,
  `screentime-autodeploy`, `myclinic-prod`, `otazkomat-prod` and `screentime-prod`.
- [ ] **Never delete** these units; guards require them to stay loaded, and a missing nvm binary
  does not change their state:
  - user units `kestrek-prod`, `kestrek-backend`, `kestrek-frontend`;
  - system units `mega-music-accounts`, `mega-music-accounts-green`.
- [ ] Repoint `/usr/local/bin/{node,npm,claude}` from nvm 22.22.2 to the nvm 24.21.0 equivalents.
  Retire or repoint `/usr/local/sbin/mega-music-deploy`, which uses `/opt/node-v22.23.2`.
- [ ] Then remove:
  - `/opt/developed-runtimes/node-v22.23.2` (check first that `readlink /opt/jasom/runtime-node`
    no longer points at it);
  - `/opt/node-v22.23.2`;
  - nvm `v22.23.2` and `v22.22.2`.

  Leave old `/opt/developed-control/*` and `mail-workers/*` copies that pin 22 in place. Prune only
  those that no unit references (`sudo grep -rl <dir> /etc/systemd/system`).

## Verification summary (definition of done)

- The release tool tests pass on 22 and 24. The gate passes for all eight tool-managed apps on 24
  and refuses a deliberate mismatch.
- Every unit in the Phase 0 baseline runs exe `/opt/developed-runtimes/node-v24.21.0/bin/node`.
  The Python units' env and `PATH` symlink point at v24.
- ALL-HEALTH matches and `NRestarts` is stable.
- The guarded jobs are healthy: kestrek-notifications shows `ownershipVerified`, the mail worker is
  active, and the session cleanup has `Result=success`.
- These worked end to end:
  - a central sign-in;
  - a password-reset mail;
  - a Mega YouTube import;
  - a JASOM submission;
  - the next myclinic cron run.
- 4g's manual deploys and the first automatic deploy after unpause were built and running on
  24.21.0.

## Execution log

(Add dated entries: what changed, a summary of the verification output, any rollback, and
follow-ups such as the vocabulum and airsoft repo docs still saying Node 22.)

### 2026-10-11

- **Phase P:** plan committed as 90147f3 (local; not pushed yet).
- **Phase 0** (23:03–23:05):
  - Auto-deploys paused (`/etc/developed-apps/developed-release-paused`). The kestrek-69 session
    was told and acknowledged; its 05:00 apt upgrade and reboot skips itself while the pause file
    exists.
  - Backup at `/var/backups/node24/2026-10-11` (root 0700). Helper at `~/.cache/node24/n24`.
    Baseline in `~/.cache/node24/baseline.txt`.
  - 14 live Node services, all on v22.23.2:
    - accounts and its mail worker
    - airsoft@b5c63f84e8be, vocabulum@8eda31c52320, otazkomat@90b7acba840e,
      screentime@c23f1b00478b
    - kestrek@771023221bec and its notifications worker
    - myclinic@e24baea3c7dd, mega-music@8ed1d6f1fef9
    - karak2, data-boundary, download-relay, mega-youtube-front
  - 38 unit and script files name v22. mega-music already had `NRestarts=1` before the job.
  - ALL-HEALTH matched the table exactly. 5.1 GB RAM and 44 GB disk free.
- **Phase 1** (23:04–23:10):
  - Downloaded v24.21.0. `gpgv` reported a good signature (Antoine du Hamel, EDDSA
    5BE8A3F6…B168D356), and the sha256 matched.
  - Installed `/opt/developed-runtimes/node-v24.21.0/bin/node` with the same layout as v22
    (root:root 0755, nlink 1, `cmp`-identical to the tarball). It reports OpenSSL 3.5.8.
  - `bind-boundary.mjs --check` on v24 exited 0 ("no attachments or pins changed").
  - nvm 24.21.0 installed with npm 11.19.0; the default stays 22.23.2.
  - **Deviation:** plain `corepack enable` resolved through the v22 node first in `PATH` and
    created no v24 `pnpm` shim. Fixed with `--install-directory` and a v24-only `PATH`; pnpm
    10.30.3 now resolves from the v24 bin dir. Step 4 above is corrected.
  - yt-dlp stderr check: clean.
  - TLS: every probed host completed the handshake:
    - 200: Mailjet, smsgate www, Cloudflare challenges and API, Google, supabase.com, YouTube
    - 404 (an HTTP answer, so TLS is fine): `api.smsgate.sk/`
    - 401 (TLS fine): myclinic's hosted Supabase `/auth/v1/health`
- **Phase 3** (code, worktree `~/.cache/node24/dw-phase3`, branch `node24-runtime`):
  - Done as written. The `deploy()` lock wrapper means the gate sits in `deployUnlocked()`.
  - The tool tests pass 19/19 on both 24.21.0 and 22.23.2.
  - The pinning code accepts the real guard sources at kestrek and mega-music origin/main
    (`nodePath` rewritten to v24; the cleanup module names no Node).
  - Gate, called directly on all 8 onboarded apps: PASS with the current config, and refused
    with `node: 24.21.0` ("…@.service does not name …node-v24.21.0…").
  - `status` shows `node 22.23.2` for every app.
  - Not yet pushed or installed.
