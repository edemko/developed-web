# Transitional central app-check ingress

Source-only until the checkpoint below records an applied result. This phase
forwards only POST `/api/account/internal/session/check` and
`/api/account/internal/user/check` on `www.developed.sk` to the existing private
central service. Both require each product's existing private app key. No human
login, registration, consent, session UI, test-host or provider route is exposed.
App publication/enforcement, registration and mail settings are unchanged.

This is a prerequisite for a device-preserving handoff, not an SSO pilot.
ScreenTime and KešTrek device/integration checks must have usable app policies
before their public traffic switches; exposing these authenticated endpoints
alone does not make closed policies usable.

`install-internal-ingress.mjs` accepts only root `--stage` and `--apply`, with
pinned original Caddy and snippet hashes. Run only an immutable root-owned copy
of the reviewed committed operator and snippet. Staging creates exclusive
root0700/0600 recovery/proof files under
`/var/backups/developed-internal-ingress-20260920`; reruns refuse an existing
directory. It validates Caddy without printing configuration. Apply verifies
the same source, proof and bytes, validates again, installs atomically and
gracefully reloads Caddy. No process restart or app/container lifecycle change.
On a reported reload failure it restores the exact old source and reloads it;
transport loss requires checking effective routes before deciding recovery.

The generated source inserts only the tested snippet into the exact canonical/
test host block. Every other source byte is preserved. Later full-portal merging
may retain this exact narrow handler or explicitly replace its marked block;
do not delete a broad route section or overwrite a drifted current config.

Verification: real-Caddy fixture covers the two exact POSTs, upstream credential
denial, forwarding-header removal, other methods, human routes and test-host
denial. An opt-in read-only merge check uses the current source; no default test
can deploy. After apply verify canonical unauthenticated401 on the two APIs,
unchanged human-route behavior, unchanged public sites and Caddy PID, and closed
registration/mail/app policies. Do not invoke valid user checks merely as a
health probe: they may lazily insert an entitlement after policy activation.
