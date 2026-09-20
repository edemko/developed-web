# Private Odonto CI input — 2026-09-20

Status: **assembled and independently verified locally; not uploaded or deployed**.
The coordinator reviewed/authorized assembler source
`33e3a08a4a464d113437ac8499877a62a2935c8d` for immutable packaging and its
fixed `--check`, `--stage`, `--verify` operations only.

The root-owned bundle `/opt/developed-odonto-ci-bundle-33e3a08` has
directories0555/files0444. It contains the assembler, reviewed host/private-input
dependencies, two pinned manifests, runbook, and a separate immutable copy of
the Odonto validator from reviewed commit
`87f118757c31a5090e1202896c65d8adc6093697`. It contains no credential values.
The Odonto owner confirmed that validator's12/8 key schema was unchanged in
their concurrent gate-only work. No mutable checkout code was imported while
reading the actual credential bundle.

The protected credential file is:
`/etc/developed-accounts/odonto-ci-staging/odonto-identity-env.json`.
Its identical backup is:
`/var/backups/developed-accounts/odonto-ci-staging/odonto-identity-env.json`.
Each directory is root0700 and contains exactly three root0600 single-link
regular files: the JSON and matching `odonto.started.json`/`odonto.verified.json`.
All writes were exclusive, with file and parent-directory fsync. No existing
file was replaced. Payload SHA256:
`542cb19326a90f57037ed233b0f28148d82aa32e952e43242f1f2cba2dacd627`.

The exact envelope has `version:1`, twelve frontend settings and eight backend
settings, suitable for the separately managed encrypted repository secret
`ODONTO_IDENTITY_ENV_JSON`. Private frontend/backend keys stay in their exact
server-side fields; only the existing anon key has a public variable name.
Both candidate flags are true, with canonical origins and the registered exact
Odonto callback/client binding. There are no Mailjet, provider administrator,
service-role, shared signing or unrelated app credentials in this JSON.

Inputs were the existing protected Odonto web client/attachment and four issued
runtime credentials with their verified markers and matching backup copies.
The public anon key came from Mega's preserved private legacy env backup and
its verified source hash. No repository `.env` or remote project environment
was read. The existing signing input was used only for in-memory verification.
Scoped identity/data and anon JWT signatures, exact roles and future expiry
passed. Both scoped keys expire **2026-12-18T16:00:00Z**; their issuance records
set rotation due **2026-12-04T16:00:00Z**.

All three operator modes passed. An independent read-only check compared all
three primary/backup pairs and verified all six ownership/mode/link counts,
payload hash, no legacy credential fields and private-key separation. The
actual bundle passed the immutable Odonto `validateBundle` function without
printing values. The check independently verified all three JWT signatures,
roles and expiry. No partial artifact or deleted marker was involved.

Source checks: six focused tests passed, including the authoritative validator
on synthetic data. Full central account suite:92 passed,16 opt-in skipped,
zero failures; `git diff --check` passed. See the
[assembler runbook](../server/accounts/operators/odonto-ci-bundle.md).

No GitHub secret/variable upload, workflow dispatch, Vercel write, deployment,
alias promotion, database mutation, service restart or email occurred here.
The coordinator owns any subsequent remote handoff. This local credential
artifact does not establish public SSO activation or the remote pair's
no-downtime handoff. Preserve both private copies; off-host protection remains
separately scoped.
