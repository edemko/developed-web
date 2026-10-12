# Central password management C2 — prepared, not deployed

Prepared 2026-10-12 from C1, then merged with live observation release
`44d932828a74edab10e72afa7fb6129a0c5e8106`,
on `release/central-password-c2-20261012`. This branch deliberately excludes unrelated
unreleased main changes. No runtime symlink, worker bundle, provider setting or database
is changed by this preparation.

The candidate removes the embedded registration CORS/session/register/SMS routes,
the embedded phone-proof consumption and the internal product password action.
Retired HTTP routes return 404 before session bootstrap, with no CORS or cookies.
Product email reauthentication and phone/profile functions remain available.
The shared policy and central/branded account pages remain unchanged.

Validation on Node 24.21.0: TypeScript build, 171 tests passed, 22 opt-in skips.
Tests cover all retired paths and methods, no cookie/CORS side effects, central
registration/invitations, and preserved e-mail reauthentication. No live mail sent.

## Gate before release

Earliest deployment is **2026-10-13 12:23:07 Europe/Bratislava** with a full
24-hour window containing zero `legacy_password_api_request` events in
`journalctl -u developed-accounts`. Observation release `44d9328` started at
2026-10-12 12:23:07+02:00. Earlier Caddy journals had no access entries, so they
cannot prove the original 11:30 gate. This preparation retains the observation
logger, which emits only fixed route-family/method values, never request details.

Example read-only count (full 24-hour window, with journal continuity checked):

```sh
sudo journalctl -u developed-accounts --since '2026-10-12 12:23:07' \
  --until '2026-10-13 12:23:07' --no-pager -o cat | \
  rg -c 'legacy_password_api_request'
```

`rg -c` exits 1 for zero matches. A truncated/rotated-away journal is not proof.
Any event needs investigation and a new clean observation window. No live
retired-endpoint probes were sent after observation began.

Recheck the live release before deployment; this candidate includes the observation release.
If SMS fixes or other releases ship meanwhile, reconcile this narrowly scoped
removal onto that live source so the candidate cannot restore old behavior.
The primary checkout has unrelated uncommitted SMS work, including
`test/product-profile.test.mjs`; do not stage or overwrite it to sync this branch.
Cherry-pick the C2 change onto main in a clean checkout after those edits are resolved.

Follow `central-password-c1-checkpoint-20261012.md` and the scoped deployment
instructions to build/seal a new release, determine whether mail-worker pinned
modules changed, switch safely, and record a new checkpoint. Then observe app
errors for the plan's additional 24 hours. C2 is not complete until that succeeds.
