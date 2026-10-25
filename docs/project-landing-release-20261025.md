# Project landing pages — 25 October 2026

All seven product websites now show the DevelopED logo directly on a dark
publisher footer, without a white panel. The SVG keeps the original paths and
purple ED with white lettering. Product-specific page themes remain in place.

Marketing source `7d976966ae9b40781535e3c3195115d2119e65d7` changes the SK/EN
showcase buttons and `scripts/showcase/products.json` to public landing URLs:

| Product | Public entry | Released source |
| --- | --- | --- |
| KešTrek | `https://kestrek.sk/` | `6e19e7cad2bf` web |
| Vocabulum | `https://vocabulum.developed.sk/` | `af48a2f828fc` app |
| Mega Music | `https://megamusic.developed.sk/` | `c32c7aab9a23` web |
| Otázkomat / Educatio | `https://educatio.sk/` | `211e58592c19` web |
| Screen Time | `https://screentime.developed.sk/` | `38ea5a3be901` app |
| Airsoft Marketplace | `https://amp.developed.sk/sk` | `c1a0d776b481` app |
| Odonto AI | `https://frontend-jet-rho-66.vercel.app/` | `28e14a7632b90` frontend |

KešTrek and Otázkomat previously linked to OIDC-start endpoints, Vocabulum to
login, Mega Music to its player, and Odonto to a protected dashboard. Odonto's
root now renders a public product introduction instead of redirecting to login.
Screen Time's signed-out home explains the product before offering sign-in.
Existing authentication, signed-in navigation and access controls are preserved.

## Deployment

Marketing uses the installed curated static hook and passed its publication
guard. The six VPS apps use the shared release tool and its checked commit
archives. Static sides remain at each app's `/opt/developed-apps/<app>/web-current`.
Airsoft, Vocabulum and Screen Time use `developed-<app>@<source12>.service`, on
loopback ports 3162, 3161 and 3167 respectively. Their release health checks passed.
KešTrek API `8c02d7aa42ff`/3164, Otázkomat API `34293fcc6751`/3166 and Mega Music
API `d683f0ebdb32`/3178 were not replaced. No database or native-app release occurred.

Odonto's source-pinned frontend workflow ran from operator `87a9c311c20d`:
[preflight](https://github.com/edemko/odonto-ai/actions/runs/40224834493) and
[build/promotion](https://github.com/edemko/odonto-ai/actions/runs/40224920717).
Frontend deployment `dpl_HWVy8zhkN5FVyY3XVkbUccyc4Uwp` is live; backend
`dpl_4AoNCk6jJ22j7TjSZBXu3euUEDV9` and deployment protection are unchanged.

## Verification and recovery

Public browser checks passed for every landing page at 320, 390 and 1440 pixels:
loaded transparent logo, dark footer, no horizontal overflow and no forced login.
Actual clicks from all fourteen SK/EN showcase buttons reached the intended
product landing. Mobile and desktop screenshots were visually inspected.
KešTrek additionally passed footer report-button contrast checks in light/dark mode.

Release checks passed: KešTrek 231 browser tests and Angular build; Vocabulum
959 tests, typecheck and Next build; Airsoft 94 tests, typecheck and Next build;
Screen Time 51 tests, lint/typecheck and Next build; Otázkomat 77 frontend tests
and Vite build; Mega Music 13 landing tests; Odonto 27 release-guard tests,
focused lint/typecheck, protected production build and canonical health checks.
Existing opt-in skips and build warnings remain.

The initial KešTrek build was stopped by a stale header test from the preceding
report-button move; the test now verifies the shared footer across routes.
Visual review also caught and corrected its report-button contrast in light mode.
A manual Otázkomat invocation encountered the automatic deployment lock; the
automatic release completed successfully and its final source was verified.

Prior source references: marketing `d24614c`, KešTrek web `805704205f14`,
Vocabulum `a75e61993d4b`, Airsoft `870bbca22a88`, Screen Time `491855d9d84a`,
Otázkomat web `92cc13d2477f`, Mega Music web `d683f0ebdb32`. The release tool may
prune old artifacts; recover through reviewed reverts/rebuilds, preserving auth
and data. Odonto's previous secure frontend is `dpl_GWDfmXXHXkApqmJzyTCjXBkf74C5`.
No work remains pending for this release.
