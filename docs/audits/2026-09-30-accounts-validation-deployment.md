# Central accounts validation-policy deployment — 2026-09-30

Main commit `4c18e5c` (canonical email policy, single-line 100-char names) is
live in central accounts. It was cherry-picked onto the actual serving revision
`75674fc` as release commit `f6cd40f7e6effcaabaa6d5fae1a6ded0f084395d`
(branch `release/validation-20260930`, tag `deploy/validation-20260930`), not
built from development main: main lacks the committed Vocabulum native routes
that production serves and carries undeployed registration-notification work.
The only conflict was the `accounts.ts` import line (kept the serving mail
imports, added `line`); the shared docs hunk was left as on the serving line.
Uncommitted WIP in the development checkout was not used.

## Release

`developed-accounts.service`, UID988, loopback3140, now selects
`/opt/developed-accounts/releases/f6cd40f7e6effcaabaa6d5fae1a6ded0f084395d`,
a sealed copy of the `75674fc` release in which only compiled `accounts.js`,
`http.js`, `product-profile.js` and `security.js` differ. `db.js`, `mail.js`
and `mail-templates.js` are byte-identical. Scoped release tests: **162 passed,
22 optional skipped**, TypeScript build. No schema, credential, admission or
configuration change; no migration.

The sole mail worker still imports implementation `502a7048...`. Its new
launcher `mail-workers/f6cd40f7...` differs from `mail-workers/75674fc7...` only
in the API pin and the expected API `security.js` hash (`8c60e9c8...`). The
worker was stopped (drained), the API restarted, and the worker's startup guard
passed before it started again. No test mail was sent.

Handoff followed the previous checkpoints: HTTP-only candidate
`developed-accounts-validation-candidate.service` on3180 (mail disabled, scoped
role, control file `/opt/developed-control/accounts-validation-20260930`),
temporary central bind permission for3180 (`--check`, then reload), validated
Caddy switch of exactly the five central dial targets, promotion, switch back,
candidate stopped (static, not enabled), bind policy restored and reloaded.

**Incident:** a concurrent Mega Music/AMP deployment installed a whole Caddyfile
it had derived while central still pointed at the candidate, reverting central
to3180 after the candidate had stopped. Central public routes returned502 for
about one minute (13:53:40–13:54:44 CEST, 11 logged failed requests) until the
central targets were restored to3140; that session's own3172 change was kept.
Lesson: concurrent deployments must re-read and patch the live Caddyfile
immediately before install, never install a stale whole-file copy.

## Verification

- Permanent API `/health` (canonical Host) 200; public `/login` 200; no restarts.
- Zero-write module probe of the deployed `security.js`: `a..b@example.com`,
  `a@example.123`, `a@exämple.com` → `invalid_email`; `  Mixed@Example.COM  `
  → `mixed@example.com`. The previous release accepted `a..b@example.com`.
- Public `POST /api/account/register` with `a..b@example.com` → 400
  `invalid_email`. `register()` validates password, name and email before any
  account/invitation/limit write; the request path itself creates only the
  usual anonymous 30-minute session and rate-limit bucket rows.

## Rollback

Root-only originals (Caddyfile, bind policy, mail-worker drop-in, release
metadata) are in `/var/backups/accounts-validation-20260930`. To roll back,
repeat the candidate handoff, then restore `current` →
`releases/75674fc7e255d8bf21445cceeafa09a8e0247f1e` together with the matching
launcher `mail-workers/75674fc7...` in the worker drop-in; drain the sole worker
and verify health/guard before routing back. Never run duplicate mail senders.
No DB rollback is needed.
