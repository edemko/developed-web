# Managed Mega Music activation — 2026-09-21

The owner requested completion of the coordinated managed-library rollout.
This checkpoint supersedes the API/mail pins in the earlier portal/flag-dropdown
checkpoints, while preserving browser binding, invitation registration and the
single central sender.

- Central application release: `c00df8808ab6c1b25ad7409681eca943e23d9a45`, API
  PID902079, UID988, loopback3140, NRestarts0. `ACCOUNTS_MUSIC_ORIGIN` is the fixed
  `https://megamusic.developed.sk` product surface. API mail remains disabled.
- Mail release: the identical `c00df88` artifact, with immutable launcher
  `900856ca242bf0d40858f6efad311cfea13d18a1`, worker PID913071, NRestarts0.
  The original six-field private input is unchanged. Four imported mail module
  hashes and the inline music-logo hash are pinned by the guard.
- Music API: UID984, loopback3178, immutable
  `09bcf2eb2ee8a96c8b148ea929f45b32c7b819e5`, enabled. Old3168 is stopped/disabled.
  The existing Python UID995 worker now uses09bcf2e and only the exact managed
  callback tuple127.0.0.1:3178 was added to its network policy. Stable frontend,
  authoritative queue, Tailscale and unrelated applications are preserved.
- Scoped migration `20260921163940_mega_music_native_clients.sql` and the pending
  dependency `20260921141121_developed_mfa_remember_browser.sql` were applied with
  bounded transactions and the existing checksum ledger. The managed music catalog
  migration was separately scoped to that product. No broad database push occurred.
- Three public native clients were registered/attached for Android/macOS/iOS,
  method `none`, exact callback `sk.developed.megamusic://oauth/callback`.
  Existing web clients and other products' registrations were preserved.

The host boundary intentionally rejects unknown Hosts with421. Existing issuer
token/userinfo proxies now explicitly send `Host: www.developed.sk`; the music
identity allowlist sends the music Host. Internal/admin paths are not published
on the music origin. Caddy was gracefully reloaded without replacing its PID;
all other adapted routes match the reviewed current baseline.

The new mail guard initially failed because Node fetch did not preserve an
explicit canonical Host for its loopback probe. The guard now uses `node:http`
with that header; an actual loopback regression test passes. There was also a
temporary421 response on issuer broker routes before their Host fix. Do not
describe this rollout as uninterrupted. The guard, canonical login, music branded
assets, issuer negative probes, APIs, and single mail worker all pass final checks.

Qualification: central default131 passed/21 skipped; real isolated remembered MFA10
passed; Mega Music exact native OAuth/client binding6 passed; catalog and native
platform SQL fixtures passed. Boundary/loader13 and mail guard11 passed. Broker
routing5 passed/1 opt-in skipped. This task's disposable identity containers and
network were removed after qualification.

4,254 copied tracks/280 folders/135,823,095,182 bytes were verified before catalog
cutover at2026-09-21 18:39:55 UTC. Public Android1.0.8+2015 and both website/S4
release bytes match. Production range seeking and catalog owner isolation passed;
physical native acceptance remains outstanding. Importer health is good but its
pre-existing Erik-PC exit node is offline, preventing actual media retrieval.

Root0700 `/var/backups/mega-managed-rollout-20260921` holds schema/config backups,
artifact and migration receipts, original Caddy/units, and worker state. The full
music acceptance/recovery record is `mega-media-player/docs/managed-rollout-20260921.md`.
Retain original music source objects at least through2026-09-28 18:39:55 UTC and
until acceptance. Post-cutover rollback must pause/reconcile managed writes and
retain a compatible central/music pair; never restore shared identity schemas or
silently hide new managed uploads. The legacy restart guard remains installed.
