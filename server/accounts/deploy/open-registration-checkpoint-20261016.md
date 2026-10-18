# Public registration — 16 October 2026

The owner requested open registration for DevelopED and its subapps, removing
invitation-only admission. At 10:39:00 UTC, a short transaction under the scoped
`developed_accounts` role changed the singleton `accounts.settings.registration_mode`
from `invitation` to `open`. The transaction locked the settings row, checked the
previous mode and all eight app policies, required exactly one updated row, and
recorded a `registration_policy` audit entry with the reason, operator, previous
mode and unchanged app-policy snapshot.

All eight active, published central apps already had `join_policy=free` and
`enforce_oidc=true`: Airsoft Marketplace, Karak II, KešTrek, Mega Music, Odonto AI,
Otázkomat, Screen Time and Vocabulum. Their policies were preserved. My Clinic
and JASOM retain their independent identity systems.

Ordinary signup continues to require email confirmation. Existing invitation
links remain supported. Browser-family enforcement and registration/mail rate
limits remain active. The API's in-process sender remains disabled; the existing
sole mail worker is active. No synthetic signup or test email was submitted.

At verification, `developed-accounts.service` served release
`/opt/developed-accounts/releases/3345ab5daa08` on loopback 3140, PID 1546013.
`developed-accounts-mail-worker.service` was active, PID 1546194, with working
directory `/opt/developed-accounts/releases/72e2fe9b69d5`. Both had zero restarts.
No code release, environment change, migration, proxy change or restart was needed.

Read-back confirmed `registration_mode=open`, browser binding required, eight
published/free/OIDC-enforced apps, the audit entry, and zero pending/failed mail.
Chromium checked the public HTTPS `/register` page and `/register?app=<slug>`
for every app listed above: all nine returned 200, reported registration open,
and rendered email/password inputs without an invitation input. These checks
did not submit the forms or verify a newly delivered confirmation email.

Rollback, if explicitly requested, is a similarly scoped and audited policy
change from `open` to `invitation`; preserve existing accounts and app policies.
