# Central password policy checkpoint — 12 October 2026

One password serves every DevelopED app, so the rule lives only in central
`src/security.ts` `password()`: 6 to 128 characters (was 15 to 128). The account UI
mirrors it (`minLength: 6` on the three new-password fields, `passwordHelp` in four
locales). Apps must not keep their own copy of the rule or their own password forms;
password management happens only on www.developed.sk.

`/opt/developed-accounts/current` selects immutable release
`ae87c89d3b854cc14df6e1d9df532cbab72eee25`, branch `release/password-min6-20261012`,
a one-commit hotfix on the previous live release `d1c3358ccbf7…`. Main carries the same
change. A clean build of ae87c89 differs from d1c3358 only in `dist/security.js`,
`public/app.js` and `public/i18n.js`; the staged release is a copy of d1c3358 with
exactly those three files replaced and was compared with the build. 187 tests
passed (22 opt-in skips); main with the change: 198 tests passed (23 skips).

The sole mail worker runs launcher bundle `mail-workers/ae87c89…`, a copy of the
Node 24 bundle `mail-workers/d1c3358…-node24` with two lines changed: `API_RELEASE`
and the API release's `security.js` hash (`dffb4ebf…`). mail.js, db.js and
mail-templates.js hashes are unchanged. Order used: stop (drain) the worker, switch
`current`, restart the API (healthy after 2 s), repoint the worker drop-in, start the
worker (guard passed). Node 24.21.0 throughout.

Rollback: the same order with `current` → `releases/d1c3358ccbf7b9dedb51011b32e9e1f3eb457a06`
and the worker drop-in → `mail-workers/d1c3358ccbf7b9dedb51011b32e9e1f3eb457a06-node24`.
Backups of the previous drop-in and symlink are in root 0700
`/var/backups/password-min6-20261012`. No migration or data change was involved;
existing passwords stay valid whatever their length.
