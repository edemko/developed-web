# Vocabulum native callback repair — 12 October 2026

The portal rejected `sk.developed.vocabulum://oauth/callback` after successful
authorization, showing the generic error instead of opening the app. The server
already allowed it; the browser allowlist was missing the scheme. Main commit
`14f381f` adds it with all exact host/path, state, code-or-error, parameter and
credential restrictions preserved. Positive/negative fixtures cover all three
native schemes; Chromium observes the actual native navigation request.

Live API artifact:
`/opt/developed-accounts/releases/44d932828a74edab10e72afa7fb6129a0c5e8106-vocabulum-14f381f`.
This is the previous immutable release plus only the two-line `public/app.js`
patch from main. Every compiled backend and dependency file is byte-identical
with `44d932828a74edab10e72afa7fb6129a0c5e8106`; newer unrelated main changes were
not deployed. Public JS SHA-256:
`9eb8f0a2357fafa10b5b581ec7de455ec022005a84a227806cb8db4aa74e8e19`.

The worker launcher bundle uses the same suffix, changing only `API_RELEASE`.
Its imported implementation remains `502a7048ac639fe61ba8b95b0834fdaeafe0cc8b`.
The worker drained before the API switch/restart and then passed its normal
startup guard. API PID539024 and worker539102 are active with NRestarts0, on
Node24.21.0/loopback3140. Caddy PID4532/configuration, hardening, protected
account environment and worker input bytes were unchanged. No SQL, OAuth
registration, account/session reset or provider restart occurred. The existing
password-retirement observation logger remains intact; C2 was not activated.

Validation: 9 UI unit tests, the native browser regression against main and the
staged immutable public assets, and 11 mail-worker/guard tests pass. Both pinned
mail module sets and publication scan pass. The live login returns200 in
Chromium and serves the exact fixed JS with `private, no-store`; its exported
callback check now accepts Vocabulum. API/worker readiness logs are present with
no error-pattern entries. A raw Python HTTP probe received403 from the edge;
normal browser verification succeeded. Device login/MFA needs the user's retry.

Protected rollback evidence: `/var/backups/vocabulum-native-callback-20261012`.
It records inventories, prior/new worker drop-ins, configuration hashes,
service metadata and apply state. Rollback drains the worker, restores the
previous API symlink and saved worker drop-in, reloads units, restarts and
health-checks the API, then starts the guarded worker. Preserve account data
and the observation logger. Initial staging stopped before artifact copying
because a mode check treated internal dependency symlinks as writable files;
the empty evidence directory was removed, target validation corrected and the
subsequent staging passed. There was one coordinated live API restart.
