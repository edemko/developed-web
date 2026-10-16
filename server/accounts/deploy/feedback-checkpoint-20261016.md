# Simplified feedback — 16 October 2026

The central API is live from `40ee1e50534e` at
`/opt/developed-accounts/releases/40ee1e50534e`, unit
`developed-accounts.service`, loopback 3140. Implementation commit `1f51c984fa66`
adds the form and validation; `40ee1e50534e` hides unused screenshot controls and
removes the duplicate feedback action while already on the feedback page.
Both commits were pushed to main from an isolated worktree based on the latest
remote sign-in fixes; unrelated local edits were excluded.

The existing release tool built immutable commit archives and coordinated each
API switch with the sole `developed-accounts-mail-worker.service`. The worker
launcher is `/opt/developed-accounts/mail-workers/40ee1e50534e`; its implementation
remains pinned to the retained `72e2fe9b69d5` release. Worker-imported modules and
logo remain byte-identical. API and worker are active with zero restarts at final
verification. Previous API `1f51c984fa66` remains available for coordinated rollback;
the prior functional release `d3c3b1b4f8ec` is also retained. No migration, credential,
identity, registration-policy or provider change was made.

Problem and Improvement tabs share mandatory email/description, optional screenshot,
and optional console text (last 1,000 characters). The signed-in email is prefilled
and server-authoritative. Existing app-specific links retain their preselection;
the modal card picker validates the chosen report source before accepting it.
Improvement type is stored in the existing summary and labeled in the support-email
body; logs use the existing steps field. No console interceptor is installed.

My Clinic's independent API and frontend are live from `20c9bb4aa2ce`, through the
same release tool. Its own identity and email transport remain independent. See
`my-clinic/deploy/README.md` for its unit and public verification. Connected apps
continue to use their existing central report links, so they do not need separate
application restarts to receive this form.

Validation: central suites passed 186 tests with 25 optional skips, plus the real
Chromium account/report flow. Tests cover invalid/missing email, blank description,
invalid type, oversized logs, improvement mail content, screenshot encryption,
retry identity, signed-in prefill, card selection, keyboard tabs and 320px layout.
My Clinic's release passed 934 backend and 320 browser tests, both lints with zero
errors, production build and the existing CSP-hash check.

Public Chromium checked DevelopED and all seven public catalog report routes:
source preselection, both tabs, required fields, tile picker and 320px containment.
My Clinic's live dialog passed equivalent checks, including nine app cards and
improvement/source context on links to central feedback. No production report,
email, registration or clinical write was submitted for testing. All 44 host health probes passed after both releases. The API, sole mail worker
and My Clinic API were active with zero restarts; the release poll timer remains
active.
