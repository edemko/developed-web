# Vocabulum native SSO production checkpoint — 29 September 2026

Central API: immutable release `9f53cabe5428115f245bc8f90d6ff01e79bd4f84`,
`developed-accounts.service`, UID988, loopback3140, enabled and active.
Source branch `release/vocabulum-native-20260929` starts at the actual previous
serving `ec2da85`, not development main. Only four runtime modules changed:
HTTP routing, exact native callback validation, native registration operator,
and the new verified native-session logout. Unrelated dirty account changes
were excluded. Scoped release tests:149 passed,22 optional suites skipped.

Vocabulum: immutable `8df509586fdfc3aa4058f9b101be71a834183889`,
`developed-vocabulum-native.service`, UID985/GID979, loopback3161, boot-enabled.
Its source branch starts at actual serving `5833953`; all431 tests passed with
two opt-in suites skipped. Production build, type checking and scoped lint passed.
All nonconflicting previous browser assets were retained. Previous footer service
on3171 is stopped/disabled and retained. No other product service was restarted.
The old green unit's pre-existing failed state was not involved.

## Identity and data

Applied only `20260929054409_vocabulum_native_clients.sql`, with short lock and
statement limits, deployment advisory lock and atomic SHA256 ledger entry.
The first scoped attempt failed because `oauth_clients` is owned by `postgres`,
not `developed_accounts`; its transaction rolled back and ledger absence was
verified. The successful attempt used the actual table owner for DDL, then the
trusted operator for the ledger. Existing registry rows and user data remain.
Separate public/no-secret Android and iOS clients were created, provider metadata
validated, and bound by the existing native operator to `app_voc_builder` and
exact `sk.developed.vocabulum://oauth/callback`. Their IDs are allowlisted in the
existing protected Vocabulum environment; no confidential key is in mobile code.

## Handoff and boundaries

An HTTP-only central candidate on3180 carried requests while the permanent API
and its PartOf mail worker moved to the new API pin. Only that temporary central
bind permission was added and then removed. Caddy's complete candidate/final
configuration validated, publication scans passed, and each reload was graceful.
Final route changes affect only Vocabulum3171→3161; central is back on3140.
Candidate is stopped and not enabled. New services show no restart loops.

The sole mail worker still imports immutable implementation `502a7048...`.
Its new launcher bundle is `mail-workers/9f53cabe...`; only the API pin and the
expected API security-module hash differ. The worker's security/mail/database/
template modules and branded logo are unchanged. Both pinned module sets were
verified. ExecStartPre succeeded and the worker is active. A later direct guard
invocation while the worker was already running correctly refused the existing
worker; that guard is a startup-only check, not a running health probe.

Actual Vocabulum UID/mount probes confirmed private upstream, Docker, Tailscale,
secret-file and immutable release-write denial, with only its own cache writable.
Central runtime guards and scoped credentials remain in force.

## Acceptance and remaining limits

Both public login pages return200. Missing/invalid mobile bearer returns401;
legacy password login remains409. A real registered Android S256 OAuth request
was accepted and redirected to the DevelopED authorization page. No real user
password, consent, MFA or account mutation was exercised. Both native clients
are enabled. Full installed-phone login, callback, refresh and logout remain
owner acceptance. Android release-mode APK with real public configuration was
built and signature-verified, preserving the project's existing debug signing;
no app-store publication is claimed. iOS was not built on Linux.

## Recovery

Root0700 `/var/backups/vocabulum-native-20260929` holds the full custom database
dump, roles without passwords, original routes/env/bind/unit/mail-guard inputs,
registration phase receipts and applied SQL. A complete restore was verified
inside a disconnected temporary container. The image's GraphQL bootstrap wrapper
needed to be restored from its existing definition before replaying its archive
ACL; this adjustment and logs are recorded. The native migration then passed on
the restored data. The exact temporary container and volumes were removed.

Rollback application code without restoring the shared database. To revert
Vocabulum, start/verify retained footer3171 and switch only its route back with
full validation/graceful reload. To revert central, retain the additive migration
and registrations, switch traffic to a separately checked candidate, then restore
both `ec2da85` API and its matching mail-worker launcher override before a
coordinated restart. Old code cannot support the new native clients; account for
mobile availability. Never reopen legacy password-grant access as rollback.
