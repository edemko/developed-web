# Central password management C2 — prepared, not deployed

Prepared 2026-10-12 from live C1 release `9fde1f13808d760935c60af9ff5880486396eb0e`,
on `release/central-password-c2-20261012`. This branch deliberately excludes unrelated
unreleased main changes. No runtime symlink, worker bundle, provider setting or database
is changed by this preparation.

The candidate removes the embedded registration CORS/session/register/SMS routes,
the embedded phone-proof consumption and the internal product password action.
Retired HTTP routes return 404 before session bootstrap, with no CORS or cookies.
Product email reauthentication and phone/profile functions remain available.
The shared policy and central/branded account pages remain unchanged.

Validation on Node 24.21.0: TypeScript build, 170 tests passed, 22 opt-in skips.
Tests cover all retired paths and methods, no cookie/CORS side effects, central
registration/invitations, and preserved e-mail reauthentication. No live mail sent.

## Gate before release

Do not deploy before **2026-10-13 11:30 Europe/Bratislava**, and require a full
24-hour window with zero application calls to `/api/account/registration/*` and
`/api/account/internal/profile/password`. AMP stopped its old calls at 11:30:34
on October 12, so conservatively use 11:31 or later on October 13.
A grep yielding zero is only useful when the selected access log actually records
these paths. Use Caddy access logs if the API journal does not record requests.
Document the exact window and source, excluding intentional operator probes.

Recheck the live release before deployment; this candidate was based on C1.
If SMS fixes or other releases ship meanwhile, reconcile this narrowly scoped
removal onto that live source so the candidate cannot restore old behavior.
The primary checkout has unrelated uncommitted SMS work, including
`test/product-profile.test.mjs`; do not stage or overwrite it to sync this branch.
Cherry-pick the C2 change onto main in a clean checkout after those edits are resolved.

Follow `central-password-c1-checkpoint-20261012.md` and the scoped deployment
instructions to build/seal a new release, determine whether mail-worker pinned
modules changed, switch safely, and record a new checkpoint. Then observe app
errors for the plan's additional 24 hours. C2 is not complete until that succeeds.
