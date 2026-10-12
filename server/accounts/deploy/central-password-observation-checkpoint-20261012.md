# Central password retirement observation — 12 October 2026

Live API release and worker launcher pin:
`44d932828a74edab10e72afa7fb6129a0c5e8106` on Node 24.21.0.
Source branch: `release/central-password-observation-20261012`; main equivalent
`0077e31`. This is a narrow release from C1, not a deployment of main.

The two retiring API families emit `legacy_password_api_request` into the
`developed-accounts` journal. Fields are fixed event/route/method values; query
strings, headers, cookies, IPs, bodies and credentials are never recorded.
All legacy handlers remain live until the observation gate passes.

There were no usable access records in Caddy's journal or access-log directory.
Therefore the earlier 11:30 cutoff cannot establish zero traffic. The verifiable
window begins **2026-10-12 12:23:07+02:00**. Earliest C2 cutover is **2026-10-13
12:23:07 Europe/Bratislava**, with zero retiring-route events over the full window
and continuous journal coverage. Persistent journal storage exists. No intentional
live probes of retiring endpoints were sent after the window began.

Validation: 172 unit tests pass, 22 opt-in skips; the logging regression includes
private query/header/body fixture values and verifies only fixed fields are emitted.
`dist/http.js` is the only compiled file changed from C1. All dist/public files in
the staged immutable release match the clean build. All worker-imported and API
mail module hash checks pass. The worker retains its original mail implementation
and restricted input; only its API release pin changed.

Cutover: drained the worker, atomically selected the staged API, restarted and
health-checked it, installed the new launcher drop-in, reloaded units, and started
the worker. Actual API executable/cwd match the new Node/release pins; both units
are active. Worker guard confirmed one sender and API mail disabled, and its
ready message was observed. Caddy, the database and provider were not restarted.

Root-only rollback metadata: `/var/backups/central-password-observation-20261012`.
Rollback restores C1 `9fde1f13808d760935c60af9ff5880486396eb0e` and its saved worker
drop-in in the same drain/switch/restart order. Losing this observation logger
invalidates the continuous 24-hour evidence window.

C2 is prepared separately on `release/central-password-c2-20261012` (code merge
`8ad4278`, instructions `c4f2a35`), with 171 tests passing and 22 skips. Read that
branch's `central-password-c2-prepared-20261012.md` before release. After C2,
observe app errors for an additional 24 hours before marking the plan complete.
