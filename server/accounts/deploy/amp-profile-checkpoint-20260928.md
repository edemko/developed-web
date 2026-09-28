# AMP profile production checkpoint — 2026-09-28

The central API is live on `developed-accounts.service`, UID988/GID982, loopback
3140. `/opt/developed-accounts/current` points to immutable root-owned release
`/opt/developed-accounts/releases/ec2da85d00be54dc7c58a8710ee153388c0e95df`.
Both the API and sole `developed-accounts-mail-worker.service` are boot-enabled.
The API in-process sender remains disabled. Existing admission, browser-family
and app authentication settings were preserved.

Source: `release/amp-profile-20260928`, commit `ec2da85`, based on the actual
previous serving revision `eda0addfb2ee05368ed9055654fb00d9a7536e22`. Main contains
the implementation in `9be842b` and housekeeping placement in `dac7707`.
The scoped release excludes unrelated main features and uncommitted audit work.
AMP runs `b945943` via `developed-airsoft-profile.service`, UID986/GID980,
loopback 3172, release `/opt/developed-apps/airsoft/releases/profile-b945943`.

The mail worker implementation remains pinned to
`/opt/developed-accounts/releases/502a7048ac639fe61ba8b95b0834fdaeafe0cc8b`.
The launcher/guard bundle is now
`/opt/developed-accounts/mail-workers/ec2da85d00be54dc7c58a8710ee153388c0e95df`:
only its API release pin changed. Compiled mail, DB, security and template modules
match the previous serving API byte for byte. Restarting the permanent API drained
and restarted the PartOf worker while an HTTP-only candidate carried traffic.
Never enable an additional sender.

## Data and delivery

The exact `20260924194706_account_profile_contacts.sql` migration is recorded in
`accounts.deployment_migrations` with SHA256
`25f6ced7bf27ba0d2b0b88375c33e315ba5a83663a8ffb0d988c6e89d2435353`.
AMP applied `20260924194706_airsoft_profile_photos.sql`, SHA256
`d36952c7380e10bfe27974082a5f8f66564957ffdaa208646b7ace567f7a7d36`.
Both were rehearsed with rollback and applied under advisory/timeout guards;
no generic shared migration push was used. The private challenges table has RLS.
The public `developed` image bucket uses the `amp/` owner prefix.

Only `SMS_GATE_FROM=DevelopED` was added to central's protected environment;
the existing effective gateway key matched AMP and passed read-only authentication.
New profile challenges use the v2 gateway with explicit sender, bounded timeout,
no retries and a positive message identifier requirement. Existing registration
transport was not changed. Email still uses central confirmation and the outbox.
No real SMS/email or real account mutation was performed during this deployment.
Historical AMP-only phone proofs keep posting eligibility and require explicit
verification to become central contacts.

## Validation and cutover

The scoped central build and tests passed: 145 passes, 22 optional skips.
AMP production build, 54 tests (2 optional skips), both isolated SQL suites,
three-locale mobile browser checks and protected-route redirects passed.
Foreign-origin AMP writes returned 403; unauthenticated central profile returned
401. The actual AMP runtime UID reached central with its app credential and was
denied for an invalid user token; raw gateway access was blocked. Runtime mount
namespace checks denied Tailscale/Docker/sibling credentials and release writes.
Browser bundles contained no live confidential server settings.

Caddy's complete adapted config was compared and validated before each graceful
switch. Final upstreams are central 3140 and AMP 3172. Temporary central candidate
`developed-accounts-profile-candidate.service` on 3180 is stopped, not enabled;
its temporary UID bind permission was removed. No sibling service was restarted.
Old AMP `developed-airsoft-amp.service` on 3162 is stopped and disabled. Its
intentional SIGTERM exit 143 was cleared from historical failed state after drain.
No new live-service restarts or runtime errors were observed in acceptance checks.

## Backup and rollback

Root-only `/var/backups/amp-profile-20260928` holds the consistent full database
custom dump, roles without passwords, previous Caddy configuration, central env,
AMP unit, mail-worker drop-in, bind policy, applied SQL/checksums and release pins.
The backup was fully restored successfully in a network-disabled disposable
container using the live PostgreSQL image. An initial restore under `postgres`
reported two ownership/permission errors; a fresh restore as `supabase_admin`
completed without errors. The disposable container was removed.

Application rollback retains the additive migrations and current user data.
For central, stage the previous `eda0addfb2ee05368ed9055654fb00d9a7536e22` release
and restore the matching previous mail launcher API pin/drop-in from backup;
coordinate API/sole-worker drain and preserve the mail implementation pin.
Do not point the API symlink backward without matching the worker guard. For AMP,
start and health-check the retained `developed-airsoft-amp.service` on 3162, then
switch only its Caddy upstream with full config validation/graceful reload.
Do not restore a shared database backup as an application rollback. One-shot
baseline-pinned deployment scripts must not be replayed against the new state.
