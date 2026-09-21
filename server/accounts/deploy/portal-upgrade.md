# Central portal upgrade: source-only bounded procedure

This runbook does **not** deploy itself. The coordinator approves each phase,
pins the final tested application commit, and executes one reviewed pipeline.
No release SHA in an earlier draft or mail guard is implicit deployment approval.
Use `portal-upgrade-input.mjs` for strict nonsecret input and pure transformations;
it has no install, service, migration or network mutation functions.

## Exact scope and prerequisites

- Existing API: `developed-accounts.service`, PID3197193, UID988/GID982,
  loopback3140; `/opt/developed-accounts/current` resolves to `releases/c561a81`.
- Existing sender: `developed-accounts-mail-worker.service`, PID700440,
  UID988/GID982, no listener; existing six protected inputs retained unchanged.
- Caddy: PID862, active/running, NRestarts0. Config SHA256
  `aa28db0fdd4c64a5c398e5c7e045ef59e19fae2e53e3e28dc437742ba072fdcc`.
- Only additive browser-family migration is in scope. The coordinator applies
  the CLI-created migration and exact ledger entry **separately**, after backup,
  disposable-provider rehearsal and SQL review. This pipeline contains no SQL.
  Require its verified checksum/ledger evidence before starting the new API.
- Owner accepted a brief login interruption. Native/device/integration identity,
  all existing product data, provider keys, encryption key and session rows stay
  intact. The owner explicitly accepted one-time web-app re-login. Enforce it
  through the binding gate, not by deleting provider or application sessions.
- Admission remains invitation-only. Do not change registration or app publication
  settings, issue invitations, activate `browser_binding_required`, or send test
  messages as deployment smoke checks. Binding enforcement is a separate reviewed
  activation only after API and broker routing both qualify.

## Check and prepare, with no live changes

1. Build the exact **40-character committed revision** as the developer in a
   disposable checkout under the existing ecosystem build lock. No dirty-tree
   packaging. Run account/unit, real-provider family, browser, mail and routing
   tests. Install production dependencies with the lockfile and scripts disabled;
   never run package installers as root. Keep the source checkout untouched.
2. Prepare application-only `dist/`, `public/`, `package.json`,
   `package-lock.json`, production `node_modules/`. Record a full path/hash/mode
   manifest, including dependencies. There must be no credentials, source tree,
   tests, repository metadata or unrelated product files in the release.
3. Prepare exactly `index.html`, `en/index.html`, `styles.css`, `script.js` from
   the same committed revision for marketing. Prepare a separate fallback
   directory containing **only the two HTML files**. Hash all four public files.
   Existing assets, favicon, legal pages, sitemap and other static files remain
   unchanged; do not use the broader `deploy-marketing.sh` hook or `rsync --delete`.
4. Prepare the three reviewed worker launcher/input/guard modules. Guard
   `API_RELEASE` must pin this exact new application path; `RELEASE` and worker
   imports/WorkingDirectory stay at `c561a81`. Check all four pinned mail module
   hashes in both old and new application releases. Record all three worker
   module hashes and their full artifact-manifest digest. No input regeneration.
5. Use `pathsForRevision(revision)` for new paths, never arbitrary manifest paths:
   `releases/<revision>`, `marketing/<revision>`, `mail-workers/<revision>`, all
   under `/opt/developed-accounts/`. Existing targets must be absent, or handled
   by an explicit read-only reconciliation with exact manifests—not overwritten.
6. Snapshot service metadata and effective hardening, unit/drop-in byte hashes,
   actual UID/GID, executables/cwd, central-only listener and relevant process
   counts. Capture the current symlink target, exact Caddy hash/PID and four
   marketing file hashes. Inspect the actual loaded mail commands privately:
   require exactly one reviewed ExecStartPre and ExecStart before replacing
   their lists. Preserve strict `/run/tailscale` masking and every other drop-in.

## Stage immutable artifacts and protected evidence

This phase installs **inactive files only**; it must not change `current`, the
environment, loaded service configuration, Caddy or public marketing files.

1. Create an exclusive root0700 evidence directory such as
   `/var/backups/developed-portal-upgrade-20260921`. Do not reuse/empty an existing
   directory or silently repeat an attempted deployment. Store root0600 copies of
   the exact environment, current Caddyfile, unit files/drop-ins, symlink metadata,
   and four old marketing files. Backup directory fsync and private readback are
   required. **Never print or diff the environment**; it contains live secrets.
2. Install only the reviewed artifacts to the three new root-owned locations,
   without group/other write, symlink escapes or runtime-owned executable files.
   Verify all staged manifests after installation and UID988 read access.
   Keep the old application, worker modules and marketing fallback untouched.
3. Create root0600 `manifest.json` with exactly the fields validated by
   `validateManifest`: version1, revision, sourceCaddySha256,
   applicationManifestSha256, mailBundleManifestSha256 and marketingSha256 with
   precisely the four public filenames. This manifest contains no credentials.
4. Build the candidate environment **in memory** with
   `rewriteMarketingEnvironment(oldBytes, revision)`: exactly one
   `ACCOUNTS_MARKETING_DIR` line changes from `marketing/initial-20260920` to the
   new two-HTML fallback. All other bytes, especially mail=false and all keys,
   must be identical. Save candidate root0600 only inside private evidence.
5. Generate `mailWorkerDropIn(revision)`, validate the combined unit in a
   disposable fixture, and prove the effective change is only the two command
   paths. The list-clearing directives must not remove a newly discovered guard.
   Preserve `PartOf`, `After`, timeouts, credentials, UID, cwd and hardening.
6. Compute candidate Caddy with `browser-session-broker-routes.mjs` `merge`;
   compare complete before/after adapted configs using `verifyAdapted`, and run
   `caddy validate`. Token POST and userinfo GET/HEAD alone now strip `/auth/v1`
   and proxy to3140. All other provider, data, marketing, human, native and
   product routes remain unchanged. Record the candidate hash and proof.
7. Record the final reviewed manifest, operator/module hashes, additive migration
   evidence and owner compatibility choice in a root-private approval receipt.
   Recheck all initial live hashes/PIDs before proceeding. Stage is not apply.

## Apply once, stop immediately on unexpected state

Create an exclusive durable `apply-attempt.json` **before the first live change**.
Do not replay a phase after an ambiguous error; inspect exact files/processes
and reconcile first. There is no automatic rollback or retry.

1. Recheck evidence/artifact hashes and live baselines. Atomically install the
   exact candidate environment using a same-directory root0600 temporary file,
   fsync, rename and directory fsync. Replace `current` with a newly created
   same-directory symlink to the approved absolute release path and atomic rename.
   Do not edit running release files or rely on unresolved relative paths.
2. Install only the reviewed worker command-path drop-in. Run `daemon-reload`,
   verify effective service configuration and preserved hardening. A daemon reload
   is not permission to start any unrelated service or modify boot selections.
3. Restart **only** `developed-accounts.service`. Existing mail `PartOf`/`After`
   ordering propagates the coordinated restart: the old worker drains its
   in-flight tick before API shutdown, then the new worker starts behind the API.
   Do not manually launch a concurrent sender. Confirm old PIDs have exited and
   exactly one new API and one new sender exist. Any stop timeout, failed guard,
   restart-loop or partial start requires reconciliation, not another restart.
4. Before routing broker traffic, require central `/health`200; exact new cwd,
   executable, UID/GID and listener; unchanged protected settings/key bytes;
   actual API mail=false; worker role/guard readiness, one sender/no listener;
   namespace Tailscale denial. Verify central login/catalog/icons and exact
   private `/oauth/token` malformed400 and `/oauth/userinfo` unauthorized401
   behavior without a login/token/mail side effect. Wait boundedly for readiness:
   systemd Type=simple alone is not application readiness.
5. Recheck Caddy PID/source hash and full adapted comparison. Atomically install
   only the reviewed candidate Caddyfile, then `systemctl reload caddy.service`
   (not restart). Verify exact file hash, unchanged Caddy PID, broker deny/protocol
   positive probes and all gateway security negatives. If reload result is
   ambiguous, stop and determine the actual loaded config before any next action.
6. Publish only the four reviewed marketing files via exact per-file temporary
   write/fsync/rename. Publish CSS/JS first, then HTML; the query-version bump in
   HTML invalidates stale browser assets. Do not replace/reorganize directories.
   Verify only these four public hashes changed; all prior assets/favicon/legal
   inventory hashes stay identical. Stale-cookie fallback HTML must equal the
   new immutable two-HTML copy, with canonical routes and CSP intact.
7. Record `applied.json` only after all checks pass, with revision, artifact
   hashes, new API/worker PIDs, stable Caddy PID and exact routing proof. Report
   actual login interruption honestly. Keep backups and prior artifacts.

## Acceptance and recovery boundary

Verify marketing and account favicon equality, seven decoded picker/dropdown
images, both marketing languages/mobile layouts, invitation readonly mailbox,
and local/global logout presentation. Browser-family behavior requires the
separate real-provider acceptance (two browser families plus native isolation,
refresh and userinfo denial after logout) and separate binding activation.
Do not use owner credentials, decrypt invitation/outbox tokens, or claim live
email delivery/native installation based on fixture tests.

Never roll back to routes/code that bypass family checks after enforcement is
active. A rollback is a newly reviewed forward repair/recovery decision, not a
replay of old Caddy/operators or a shared database restore. Preserve all account,
product, device, integration and mail-outbox data throughout.
