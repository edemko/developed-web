# Registration password controls — 16 October 2026

Live API: `developed-accounts.service`, loopback 3140, immutable release
`/opt/developed-accounts/releases/1f18edd3e6f2`. The existing release tool deployed
source `1f18edd3e6f2` through its automatic UI path. It coordinated the API and
sole `developed-accounts-mail-worker.service`; both are active with zero restarts
at verification. The worker implementation working directory remains
`/opt/developed-accounts/releases/72e2fe9b69d5`. Runtime configuration, database
schema, account/session data and app access policies were preserved.

All shared registration routes, including app destinations, invitation signup
and the Mega Music branded surface, now require matching password and confirmation
fields. Every central password field has a keyboard-accessible reveal/hide eye
button with translated labels and state. Fields start masked; reset hides them
again. Confirmation is checked locally and is not sent to the account API.
Passwords retain whitespace exactly and follow the existing server password
policy. Open registration and ordinary email confirmation remain in effect.

Validation on the current production baseline: 185 account tests passed, 24
optional checks skipped, and both Chromium UI/branded-registration suites passed.
The browser tests cover mismatch rejection before a request, editing either
field, reveal/hide by mouse and keyboard, preserved whitespace, invitation-bound
email and successful retry behavior. Public Chromium checks confirmed the new
confirmation field, mismatch validation and both eye controls for DevelopED and
all eight app signup destinations. The 320px form fits without horizontal overflow.
No production registration or test email was submitted.

The previous API release was `3345ab5daa08`. Any rollback must use the coordinated
release tool to preserve the sole worker's API pin; it must preserve the current
open registration policy and existing account data.
