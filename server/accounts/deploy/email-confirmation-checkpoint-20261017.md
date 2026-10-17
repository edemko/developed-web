# Email confirmation and automatic sign-in — 2026-10-17

Live API release: `7fb4f2fe0cee`, source commit on
`fix/email-confirmation-login`, deployed at approximately 09:06 UTC.
`developed-accounts.service` remains UID988 on loopback3140 with its API sender
disabled. The sole `developed-accounts-mail-worker.service` is active and its
launcher bundle is now `/opt/developed-accounts/mail-workers/7fb4f2fe0cee`;
the mail implementation and six-field protected input are unchanged.

The confirmation page submits one CSRF-protected POST when the email link opens,
removes the fragment from the address bar and redirects on successful sign-in.
Language rerenders reuse the same request. A new email link opened in the same
tab reloads the page instead of retaining the previous token's state.
Initial verification generates/exchanges a provider magic-link hash privately,
then issues the ordinary opaque central cookie with a fresh browser family.
Provider credentials stay server-side. No additional email is sent by that
exchange. MFA/admin accounts retain normal password authentication requirements.
Email changes and password recovery do not issue automatic login sessions.

A completed, unexpired verification may return confirmation success again only
while its email and security version still match the confirmed account state.
This never mints another session. An existing authenticated owner can continue
using their session; other browsers see the sign-in link. Expired, unknown,
superseded/unconfirmed, locked and security-invalidated credentials fail closed.
Provider/session failure after confirmation offers sign-in without presenting a
successful verification as a failed token. Plain HTTP GET does not consume proof.

Validation:

- 204 default tests passed; 26 explicitly opt-in tests skipped.
- Browser UI suite passed, including automatic POST, no confirmation button,
  language rerender deduplication, same-tab link replacement and redirect.
- New isolated real-provider/browser test passed against GoTrue v2.189.0 and
  PostgreSQL with central migrations: confirmation, actual opaque login cookie,
  no browser token storage, scanner GET, and replay in a separate browser with
  no extra provider session. Its exact labeled containers/network were removed.
- Sealed candidate differs from previous live artifacts only in
  `dist/accounts.js`, `dist/http.js`, `dist/provider.js`, and `public/app.js`.
- Public confirmation page HTTP200; served JS exactly matches sealed artifact.
- API and sole worker active; monitoring reported no failures and all44 health
  probes passed. The temporary maintenance window was removed.

The manual coordinator used the existing release builder and guarded central
switch with an exact previous-source assertion. No schema, provider settings,
proxy, signing key, product deployment or user account data was changed.
Previous API/worker bundle `e51b271b962a` remains the rollback target. No pending
central-switch receipt remains after the successful switch.

Source is retained in the isolated worktree
`/home/openclaw/Dev/developed-web-email-confirmation`; the original dirty checkout
was preserved. Reconcile `fix/email-confirmation-login` into main before the next
automatic central UI release; the normal ancestry guard protects this live fix
until then.
