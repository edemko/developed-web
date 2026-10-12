# Central password management (C1) checkpoint — 12 October 2026

Plan: `.claude/plans/central-password-management.md`, phase C1. Every DevelopED password
is chosen, changed and reset only on this service; apps link here.

`/opt/developed-accounts/current` selects immutable release `9fde1f13808d760935c60af9ff5880486396eb0e`, branch
`release/central-password-20261012` (one commit on `ae87c89`). Main carries the same change.

- `PASSWORD_POLICY` in `src/security.ts`: 6 characters to 72 UTF-8 bytes. GoTrue v2.189.0
  (bcrypt) refuses more than 72 bytes, so the former 128-character maximum could fail.
  `/session` and `/registration/session` return `passwordPolicy`; the account UI reads it.
- `/register` accepts `app` (`?app=<slug>` in the page) and returns to that app after sign-in.
- Invitations for any published, non-closed app link to central `/register#invitation=…`
  (no longer AMP's `/{lang}/signup`). The preview returns the app; accepting grants
  `core.app_access` and a `manual` entitlement. Admin invitations accept any open app.
- `POST /api/account/internal/invitations` (app server key + inviting admin's access
  token, body `{accessToken,email,language}`): new addresses get an invitation for the
  calling app, existing accounts are granted it; the answer is always `{accepted:true}`.
- AMP's embedded registration API and app-hosted password change still work; they are
  removed in phase C2 after AMP stops calling them.

The artifact is a copy of `ae87c89` with `dist/{accounts,http,security,app-invitations}.js`
and `public/{app,i18n}.js` from a clean build (`diff -r` empty). Release branch: 190 tests,
0 fail, 22 opt-in skips; main: 204, 0 fail, 23 skips. Browser suites: the
`ui.browser` "Launch fixture" step times out identically on `ae87c89` (pre-existing).

Mail-worker launcher `mail-workers/9fde1f13808d760935c60af9ff5880486396eb0e`: `API_RELEASE` and the API's `security.js` hash
changed; mail.js, db.js and mail-templates.js are unchanged. Cut over at 11:21:55 in the
usual order (drain worker, switch `current`, restart API — healthy after 2 s — repoint
the worker drop-in, start; guard passed). Backups: root 0700
`/var/backups/central-password-c1-20261012`. Rollback: the same order back to
`releases/ae87c89d3b854cc14df6e1d9df532cbab72eee25` and `mail-workers/ae87c89…`.
