# Two footer routes — guarded handoff

Source preparation only. The human portal is already enabled; the required live
Caddy SHA-256 is `3f49a9a881a51683a787d103d191911bb9bb842c058116fb2d846b04751b8a9c`.
The only changes are Vocabulum `127.0.0.1:3161` → `127.0.0.1:3171` and Airsoft
`127.0.0.1:3162` → `127.0.0.1:3172`. Do not use the old `501bbc…` human-portal
input or rerun its installer.

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
