# AMP watch emails through the existing central worker

Live on 2026-10-17: API and mail implementation release `e51b271b962a`,
launcher `/opt/developed-accounts/mail-workers/e51b271b962a-amp-mail`.
The sole sender uses the existing protected six-field input unchanged. The
companion AMP migration `20261016175909_amp_shared_watch_email` is applied.

The AMP companion branch `feat/amp-shared-email` provides migration
`20261016175909_amp_shared_watch_email.sql` and removes its legacy direct Mailjet
sender. Apply that migration before releasing this worker. The wrapper detects
the private claim function at startup; ordinary API configurations leave AMP
polling disabled. The API's in-process mail sender stays disabled in production.

Each tick processes one account job and at most one AMP watch notification,
using the same Mailjet credentials and aggregate daily cap. AMP sends as
`AMP <noreply@developed.sk>`, replies go to `info@developed.sk`, and AMP templates
use SK/CS/UK copy and AMP colors. Account mail templates remain unchanged.

The private database functions resolve eligibility/current verified email,
claim with SKIP LOCKED and a five-minute lease, and acknowledge with a matching
lease UUID. No product-table grant or service-role key is required. Delivery
failure and daily-cap handling preserve bounded retries; skipped recipients
are not recorded as sent. Ambiguous provider acceptance may cause a duplicate.

Use the current central-mail-worker runbook for a single-owner release. Generate
a fresh immutable worker pin and complete module manifest including
`amp-watch-mail.js`, `mail.js`, and `mail-templates.js`; existing source pin/hash
constants describe previous releases and must not be relabeled as this build.
Preserve the installed pooler, boot-readiness and network guard updates; this
isolated worktree intentionally does not include unrelated local operator edits.
Retain the current protected mail input unchanged. Deploy the API and worker
together when the guard requires their imported mail modules to match. Rollback restores the previous worker pin/wrapper; the additive AMP
migration can remain in place without affecting the old sender.

Validation: build the account package; run mail, mail-template, AMP watch-mail,
and worker tests. The AMP SQL fixture applies all migrations in a disposable
network-disabled database and checks recipient gates, privileges, lease recovery,
stale acknowledgements and retries. Never point those fixtures at production.

Local verification on 2026-10-16: account TypeScript build and all 30 selected
mail/template tests passed (one optional browser test skipped). A manual
Playwright preview passed at 390px and 1024px. Ten portable worker tests passed;
the host-pinned worker test could not load the historical
`/opt/developed-accounts/releases/c00df88` path on this development host.
The production module manifest must be validated during the worker release.

## 17 October production checkpoint

Source commit `e51b271b962a4035b3dec049e023cfc3a860c7ff` was rebased on the latest
main and pushed. The normal release builder sealed the exact Git archive. Only
`dist/mail.js` and the new `dist/amp-watch-mail.js` differ from the prior API
artifact `40ee1e50534e`; all other artifact hashes match. Because the existing
worker guard checks the API and worker mail-module hashes against one manifest,
the coordinated rollout selected this build for both processes. The API's
in-process sender remains disabled.

The launcher copied the live `40ee1e50534e` bundle, preserving its session-pooler
validation. Its only behavioral change is the committed AMP function-detection
step. RELEASE and API_RELEASE now point to the sealed build and the module
manifest includes `amp-watch-mail.js`. The independent boot-readiness and
Tailscale-denial drop-ins remain installed. The central API and sole worker are
active with zero automatic restarts; the full startup guard and actual UID/role
probe passed. No HTTP listener was added to the worker.

Validation: 197 account tests passed (25 environment-dependent tests skipped),
the account browser test passed, and all 11 worker tests passed against the new
immutable modules. Worker fixtures used the installed pooler contract and the
coordinated API/worker pins. The AMP suite passed 93 tests, including all migrations
and recipient/lease/privilege checks in disposable PostgreSQL. Production
migration rehearsal rolled back successfully before application. An actual
UID988/GID982, `developed_accounts` claim/ack probe also rolled back without
sending mail. The initial attempt to SET ROLE from the restricted operator
connection was rejected; the rehearsal used the function owner and runtime
access was verified separately under the actual scoped credential.

All 44 host health probes pass. The central maintenance window is cleared.
AMP and central outboxes have no pending or failed messages at verification;
no synthetic message was sent, so inbox receipt is not claimed.

Rollback evidence and the exact migration/coordinator/probe/test fixture are
root-only under `/var/backups/amp-shared-email-20261017-r2`. Previous API:
`/opt/developed-accounts/releases/40ee1e50534e`; previous launcher:
`/opt/developed-accounts/mail-workers/40ee1e50534e`; previous worker implementation:
`/opt/developed-accounts/releases/72e2fe9b69d5`. A pending-switch receipt was written
before the cutover and cleared only after both processes passed health checks.
Restore the saved drop-in and previous API using the same stop-worker, switch,
restart-API, then start-worker order. The additive migration can remain.
