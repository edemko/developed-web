# Central avatar upload repair — 12 October 2026

Vocabulum's profile link opens the central account editor. Its avatar PUT returned
503 because the newly serving central release included avatar/report code without
the required `20261002090301_report_screenshots_and_profile_avatars.sql` migration.
`accounts.avatars` and both new report columns were absent from the live database.

Applied only that existing additive migration and recorded it in
`accounts.deployment_migrations`, with source SHA-256
`4723c40ff1602ef68429f80e63285414bbbbb363af4a9d02cf24d46307e8da49`.
The apply and ledger write were one transaction, with a 3-second lock timeout and
15-second statement timeout. The central service retains its scoped grants and
RLS; `anon` and `authenticated` have no avatar-table grants.

The API remains `/opt/developed-accounts/releases/f2c1811702e3` on loopback 3140,
unit `developed-accounts.service`; the sole mail worker retains its existing
pin. Neither service restarted (PIDs 641338/641593, started 21:00:42/43 CEST,
NRestarts 0 at verification). No provider, proxy, account/session or password
retirement changes were made. Preserve the additive migration and uploaded data
on any future application rollback.

## Verification and recovery evidence

- Protected backup: `/var/backups/vocabulum-avatar-20261012/identity.dump`
  contains `auth`, `core` and `accounts`, mode 0600 inside a root 0700 directory.
  Restored to a labeled PostgreSQL 17 container with no network and tmpfs storage.
  The three `core.app_access` triggers into unrelated product schemas were
  omitted from that scoped restore; all identity data and constraints restored.
- The exact migration applied to the restored schema. The actual serving
  account code, using a real scoped PostgreSQL connection and fixture session,
  passed upload, replacement/rotating URL, JPEG download, profile persistence and
  removal; bad CSRF and anonymous upload were rejected. Images were 256×256,
  empty bytes were rejected, and RLS/public-role denial checks passed. This did
  not send mail or use a real user's live session.
- A live transaction rehearsal exercised the service role's avatar/profile
  writes and rolled back completely before the migration was committed.
  `postgres` cannot SET ROLE to the service role; the initial rehearsal stopped
  and rolled back at that check. The successful rehearsal used the existing
  `supabase_admin` operator, without changing any role memberships; the final
  migration was applied as `postgres`.
- Central `/health` returned 200. Public Chromium loaded the profile and
  Vocabulum login; a nonexistent avatar URL returned 404 `not_found`, not 503.
  No further generic account request errors were recorded during verification.
- The temporary restore container was removed. Production users' photos were
  not changed by testing; the owner can retry their original upload.

## Vocabulum sidebar

Vocabulum release `726836167be71c2558c163b624d0b4368c3c20ca` is live under
`/opt/developed-apps/vocabulum/releases/726836167be7`, unit
`developed-vocabulum@726836167be7.service`, loopback 3161.
The profile image and handle now share one row. Images keep their 36px width,
long names truncate, the fallback uses a name/username initial instead of `@`,
and failed image downloads fall back to the initial. Collapsed mode centers the
avatar; the open mobile drawer shows the full profile row.

Validation: 635 tests passed, 2 skipped; TypeScript, production build and scoped
ESLint passed. Chromium used the actual component and sealed release CSS to
check expanded/collapsed/mobile states, long and prefixed handles, image loading
and broken-image fallback. Public release health checks passed.
