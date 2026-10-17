# AMP watch emails through the existing central worker

Source preparation only. No production pin, credential, process, or sender
ownership has changed.

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
Retain the current protected mail input unchanged. No central API release is
required. Rollback restores the previous worker pin/wrapper; the additive AMP
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
