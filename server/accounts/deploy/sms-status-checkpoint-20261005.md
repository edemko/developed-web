# AMP SMS status production checkpoint — 5 October 2026

Central `developed-accounts.service` is enabled on loopback3140, UID988/GID982.
`/opt/developed-accounts/current` selects immutable release
`d1c3358ccbf7b9dedb51011b32e9e1f3eb457a06`, branch
`release/amp-sms-status-20261005`; main implementation is `96222f4`.
Only `dist/http.js`, `dist/product-profile.js` and new `dist/profile-sms.js` differ
from serving artifact `8a476978a2875503af7438a6b7fa7aaef9e57cec`. The catalog
visibility filter and all other backend/public/dependency bytes are preserved;
pending screenshots/avatars features remain undeployed.

Migration `20261005160242_account_profile_sms_delivery.sql`, SHA256
`f446c1da2328a9b8ee003c79c7bde4dc6246c34627df0e1e37c2536f935da0e6`, is atomically
recorded in `accounts.deployment_migrations`. Four columns retain private gateway
message IDs, delivery states, safe error codes and polling timestamps. Existing
challenge ownership, RLS, grants and resend quotas remain. Failed/uncertain sends
return status and cooldown metadata; authenticated `phone-status` checks only the
caller's own challenge. `details.pendingPhone` restores the latest attempt.
Gateway acceptance never verifies a phone or proves handset delivery.

The sole mail worker is enabled with launcher bundle `mail-workers/d1c3358...`;
its implementation remains `502a7048ac639fe61ba8b95b0834fdaeafe0cc8b`. Only the
API guard pin changed; module hashes, credential inputs and API mail-disabled
setting remain. It was drained before the permanent API restart and resumed
once ready. A temporary HTTP-only candidate on3180 carried central traffic;
it is now stopped and its temporary bind permission removed. Final Caddy
upstreams are central3140 and AMP3162. No sibling application was restarted.

AMP source `102ed8b87f4a92a6e2b041671d0329a76105804c`, branch
`release/sms-status-20261005`, runs in `developed-airsoft-sms-status.service`
with build ID `oKq-lZk8-rt9zwjTaWiX5`. It adds localized delivery feedback,
resend countdown, expiry and recovery after refresh. Its prior memberships
service on3172 is stopped/disabled and retained for rollback.

Backup/evidence: root0700 `/var/backups/amp-sms-20261005`, containing full database
dump, password-free roles, prior configuration, exact migration and release pins.
The full backup restored successfully into a disposable network-disabled database.
The migration passed a live transaction/rollback rehearsal before application.
Complete adapted Caddy comparisons and source-equality checks preceded graceful
switches; original secrets/admission/account state were not modified.

Exact central release:164 tests passed,22 opt-in skips; isolated PostgreSQL SMS
lifecycle passed. AMP clean production build,74 unit tests, scoped lint and prior
browser lifecycle acceptance passed. Public browser/mobile checks in three
locales, live build/asset equality, invalid-user/app-key and foreign-origin denial,
private catalog filtering and actual runtime filesystem/network restrictions
passed. API, AMP and sole mail worker have zero automatic restarts. An initial
Python public probe received403; curl/Node/Chromium acceptance subsequently passed.
No real SMS was sent and handset delivery remains unverified. Historical failed
submissions lack provider diagnostics and cannot be retrospectively explained.

Rollback retains the additive migration and current data. Coordinate restoring
central artifact `8a476978a2875503af7438a6b7fa7aaef9e57cec` and its matching
mail-worker API pin through the same candidate/drain procedure. Roll AMP back to
the memberships service too, since the new UI expects the new status contract.
Never run duplicate mail senders, restore the shared DB as an application rollback,
or overwrite newer complete proxy/bind configuration with historical backups.
