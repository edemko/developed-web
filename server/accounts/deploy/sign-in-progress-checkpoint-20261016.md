# Automatic sign-in progress and stale-token recovery — 16 October 2026

The owner authorized committing, pushing and deploying the two sign-in UI fixes.
Source `d3c3b1b4f8ecbc1570e188bf255f6a1dfc539702` was pushed to `main` and
deployed through the installed release tool at 11:25:54 UTC. The central API
`developed-accounts.service` serves immutable release
`/opt/developed-accounts/releases/d3c3b1b4f8ec` on loopback 3140. The coordinated
switch drained and re-pinned the sole `developed-accounts-mail-worker.service`;
its implementation directory remains `/opt/developed-accounts/releases/72e2fe9b69d5`.
Both services are active with zero restarts, and no pending switch receipt remains.

Authorization now displays translated automatic sign-in progress instead of a
Continue/Cancel form that was already auto-submitted. It sends one POST, whose
existing backend checks resolve the client, verify current access and approve
the grant. Language changes reuse the same in-flight request. The consumed
authorization page is replaced in browser history. Invalid or expired grants
offer a fresh start through the app picker rather than retrying the old link.

Login retries once after fetching a fresh session only when the server rejects
the request with `403 invalid_csrf`. Other errors are not replayed. This repairs
a login tab whose CSRF token became stale after another tab changed the cookie.

Validation: all 185 default account checks passed, with 25 optional checks skipped;
the release browser suite passed. Before release, all 12 focused checks passed,
including delayed authorization, language changes, expired grants, native callbacks,
bounded CSRF recovery and refusal to retry other 403 responses. Public JS assets
match the committed source byte-for-byte. Chromium loaded the actual public
assets with intercepted fixture API responses and confirmed one authorization
POST, automatic redirect after changing language, no Continue button and stale
login-token recovery. These fixture checks do not claim a new real-account login.

The read-only critical monitor reported no failures across its 44 health probes.
API readiness and the mail worker ownership guard passed. No schema, runtime
configuration, provider, app policy or user data was changed by the release;
no test account or mail was created. Unrelated dirty work in the original
checkout was excluded.

The previous API release `1f18edd3e6f2` is retained. If rollback is required,
use the installed release tool's coordinated central switch to preserve the
sole worker's API pin; do not restore the shared database or earlier invitation
policy. The checkpoint commit changes documentation only.
