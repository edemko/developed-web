# Two footer routes — guarded handoff

Applied checkpoint: 2026-09-20 21:28:50 UTC. The human portal was already enabled;
the required pre-switch Caddy SHA-256 was
`3f49a9a881a51683a787d103d191911bb9bb842c058116fb2d846b04751b8a9c`.
The only changes are Vocabulum `127.0.0.1:3161` → `127.0.0.1:3171` and Airsoft
`127.0.0.1:3162` → `127.0.0.1:3172`. Do not use the old `501bbc…` human-portal
input or rerun its installer.

The reviewed operator from source commit `a2eb961` was installed root-owned0444,
staged once and applied once following the coordinator's separate protected
approval. Current Caddy SHA-256 is
`aa28db0fdd4c64a5c398e5c7e045ef59e19fae2e53e3e28dc437742ba072fdcc`.
The complete adapted-config proof and full candidate validation passed. The
atomic installation and graceful Caddy reload completed; both public and loopback
login pages passed the footer/branding checks. At completion all seven monitored
PIDs remained unchanged and active with zero restarts: old Voc4056033/Air3542385,
candidate Voc723605/Air767388, central3197193, mail700440 and Caddy862.

Protected evidence remains under `/var/backups/developed-footer-routes-20260920`
(root0700, files root0600). Its exact SHA-256 records are:

| Artifact | SHA-256 |
| --- | --- |
| Installed operator | `fbd0150bd9f3e4b59681d14f7f5406f598f3a21cb5331ab7096f04fddc8f000b` |
| `before.Caddyfile` | `3f49a9a881a51683a787d103d191911bb9bb842c058116fb2d846b04751b8a9c` |
| `candidate.Caddyfile` | `aa28db0fdd4c64a5c398e5c7e045ef59e19fae2e53e3e28dc437742ba072fdcc` |
| `prepared.json` | `8b1dc1f814964ab09c846c7818cd462185c35ec5284297124c2b72af5e8b92ad` |
| `approval.json` | `3556c2cbddc10cdb14251f124457575f6db81d0e3bc1bd5cbe37c72eb247e8c8` |
| `apply-attempt.json` | `041132bcf15f6ec9496a227f20abb08fb513d11ef5285730b1b3e8d0e381d10e` |
| `applied.json` | `e0d3cc6986d63c087f87dc7f84056a4c022b1baa22f47ff3b596c51466a92b5e` |

The applied proof records `twoDialsOnly=true`, `humanPortalPreserved=true` and
`oldUnitsStillRunning=true`. This checkpoint covers the route switch and anonymous
HTTP checks; it does not establish authenticated browser acceptance or retire the
old units. Public Chromium checks and the separately coordinated boot/drain work
have their own evidence. No database, authentication policy, registration or mail
setting was changed by this operator.

The procedure below documents the completed handoff. Do not rerun stage/apply;
the one-shot receipt and changed source hash intentionally prevent repetition.

The coordinator installs the reviewed self-contained `route-footer-candidates.mjs`
at `/opt/developed-control/footer-routes-v1/route-footer-candidates.mjs`, root-owned
mode0444, with root-owned non-writable-by-others ancestors and no symlinks. Source
checkout execution is refused. Use the reviewed Node runtime at
`/opt/developed-runtimes/node-v22.23.2/bin/node`. Check source tests first:

```sh
node --test server/accounts/deploy/route-footer-candidates.test.mjs
```

Optional exact live-source proof (only sudo read and in-memory adaptation, no
stage/apply or files written):

```sh
FOOTER_ROUTE_LIVE_READONLY=1 node --test server/accounts/deploy/route-footer-candidates.test.mjs
```

Both private completion receipts must exist in
`/var/backups/developed-footer-candidates-20260920`. Each must bind the candidate's
UID/GID, loopback port, PID and exact revision. The operator also checks the
installed/start-attempt receipts, installed manifest and unit hashes, process cwd,
actual UID/GID, listener ownership, active/running state, and zero restarts.
The old serving units (Voc PID4056033, Air PID3542385), central PID3197193,
mail worker PID700440 and Caddy PID862 must remain active with zero restarts.
The supplied candidate receipts are expected to identify Voc PID723605/revision
`5833953287ee51be6b35225e87b88dfef69d2d97` and Air PID767388/revision
`1fcb452cf8bcb11505ad5250ac4d1ab55e06b57f`.

Invoke `--stage` once under root after candidate qualification. It creates the
new mode0700 directory `/var/backups/developed-footer-routes-20260920` with
mode0600 `before.Caddyfile`, `candidate.Caddyfile` and `prepared.json`. It checks
the source hash, reversible two-string replacement, complete adapted JSON
equality except the two host-scoped dial fields, and full candidate validation.
Both adaptations use stdin so no hide-path filtering weakens the proof. Stage
also checks loopback login pages for the new report links and branding. It does
not install the Caddyfile or reload Caddy.

The coordinator reviews that protected evidence and separately creates root-owned
mode0600 `approval.json` in the same directory with exactly these fields:

```json
{
  "sourceSha256": "3f49a9a881a51683a787d103d191911bb9bb842c058116fb2d846b04751b8a9c",
  "candidateSha256": "<prepared.json candidateSha256>",
  "operatorSha256": "<prepared.json operatorSha256>",
  "proofSha256": "<SHA-256 of exact prepared.json bytes including trailing newline>",
  "twoRouteSwitchApproved": true
}
```

Then invoke `--apply` once under root. It repeats artifact, process, readiness,
approval and complete-config checks. Before any live-file write it exclusively
creates and fsyncs `apply-attempt.json`, then writes the exact fixed temporary
file `/etc/caddy/Caddyfile.developed-footer-next`, atomically renames it over the
live Caddyfile, and calls only `systemctl reload caddy.service`. It verifies the
installed hash, unchanged PIDs/restarts, and both public and loopback footer pages
before writing `applied.json`. All command output and response bodies stay private.

Any failure stops the phase. Never delete an attempt receipt or rerun apply to
recover. After an ambiguous reload, reconcile the protected artifacts and actual
serving state read-only with the coordinator. There is no automatic retry,
rollback, unit stop/start/enable, database, mail, registration or policy mutation.
Keep old units for the separately reviewed drain and secure rollback decision;
this route operation does not retire them or change boot selection.
