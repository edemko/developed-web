# Shared footer reporting — 25 October 2026

The owned project sites use one footer entry point with the same red bug icon,
short translated label (Report / Nahlásiť / Nahlásit / Повідомити), transparent
background, no border and a 44px minimum target height. Header, sidebar and floating
duplicates were removed. Existing reporting forms, authentication and destinations
are preserved; My Clinic continues to use its independent reporting dialog.

Mega Music's landing, player and branded account headers match the logo's measured
background, `#060606`. The player now reserves a footer row instead of hiding its
footer; its scrolling content and playback controls remain available at mobile sizes.
The DevelopED footer logo uses the existing transparent artwork.

The shared marketing script waits for a footer, follows SPA footer replacement,
updates localized labels and records the current origin/path on activation without
query strings or fragments. Asset versions refresh previously cached floating widgets.
The project-page generator retains the shared imports. Legal-page grid items can
shrink so wide privacy tables scroll inside their wrapper. My Clinic's login page
stays in document flow so it cannot cover the footer.

## Source revisions

| Site / service | Reviewed application revision |
| --- | --- |
| DevelopED marketing / accounts | `a690c05099c0` |
| KešTrek web | `e631e4931522` |
| Vocabulum | `1a3f9170f5f9` |
| Airsoft Marketplace | `6cc1997557ee` |
| ScreenTime | `79346c23d00a` |
| My Clinic web | `95ab79734ce6` |
| Mega Music landing / player | `d3541a1fe5c7` |
| Otázkomat web | `83d5b519c5f2` |
| Odonto AI frontend | `726cf344860b` (operator `3e4ce7d16a4f`) |
| JASOM web | `2350221c3418` |
| Karak II | `93dd2eccb650` |
| 3D PrintED | `339e1ab02cee` |

Unrelated KešTrek, Vocabulum, JASOM and original dirty worktree changes were preserved.
Customer projects excluded by the workspace instructions were not included.

## Validation

- Shared browser regression covers footer-only mounting, no premature floating link,
  duplicate suppression, SPA replacement/current route, localization, safe URL context,
  transparent styling and 1440/390/320px layouts.
- Release builds passed their configured suites: KešTrek 231; Vocabulum 959;
  Airsoft 94; ScreenTime 51; My Clinic 406; central accounts 208 plus browser flows;
  Otázkomat 77; Mega Music accounts 145 and landing 13; Karak II 201 across packages.
  Existing opt-in skips remain. JASOM build/lint and Odonto's 27 release guards passed.
  3D PrintED's Vercel build completed successfully.
- Public browser checks cover the main site, all 14 SK/EN product pages, all eight
  legal pages, project landing pages and representative login/app routes at
  1440/390/320px. They check one visible footer control, icon, label, red text,
  transparent background, focus/hover target and no page overflow.
- Marketing report links open the existing central form. My Clinic's footer opens
  its existing dialog without submitting a report. The Mega Music signed-in layout
  was checked with synthetic fixture data at desktop and phone sizes. Karak's live
  server-rendered footer and anonymous access gate were checked without a user session.

## Deployment and recovery

Releases use the existing shared tool and immutable artifacts. JASOM web v55 was
installed through the frozen blue/green helper after reviewing the live-to-source
diff: only frontend files and deployment documentation differed. Its submission
and summary workers stayed pinned. The temporary maintenance window was resumed.

Odonto frontend deployment `dpl_7Ha8rznLQz7SA9VazJgCKryYbJNr` was promoted through
the source-pinned workflow; backend `dpl_4AoNCk6jJ22j7TjSZBXu3euUEDV9` and deployment
protection remained unchanged. 3D PrintED used its existing Vercel Git integration.
No database migration, credential change, report submission or customer notification
was performed for testing. Routine central mail-worker and Mega Music cleanup pins
were handled by the established release tool.

For rollback, revert the affected UI source and rebuild through its existing release
workflow. Retained artifacts are subject to normal pruning; do not assume every old
release directory remains available. Preserve current data and independent identities.

Final release status reported no pending deployable changes for all nine managed
services. Both Mega Music production headers matched the logo's sampled RGB
`6,6,6` at 1440/390/320px. My Clinic's production login footer passed pointer and
layout checks at those widths. The final monitor check passed all 50 health probes
with no failures and no remaining deployment maintenance windows.
