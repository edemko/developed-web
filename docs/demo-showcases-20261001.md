# Demo accounts and product showcases — 1 October 2026

The dedicated `demo@developed.sk` / **DevelopED Demo** identity has central UUID
`1c10d8f6-2689-4ac3-947c-3b10777844e8`. Its central role remains `USER`.
Credentials and browser sessions are kept privately outside this repository.
The password was changed through the normal central profile API and a fresh
login verified it. Do not put the password in documentation or public assets.

## Delivery state

Seven product pages, each in Slovak and English, are **published** on
`https://www.developed.sk/` from marketing commit `e1a4b61`. Homepage project cards route to the corresponding
product page; the product page links to the existing app. Airsoft and Odonto AI
cards were added to both homepages. Existing unrelated projects remain intact.

| Product | Slovak path | English path | Screenshots |
| --- | --- | --- | --- |
| Vocabulum | `/vocabulum/` | `/en/vocabulum/` | Results, languages, mistakes |
| Mega Music | `/mega-music/` | `/en/mega-music/` | Playing library, Good Songs folder |
| KešTrek | `/kestrek/` | `/en/kestrek/` | Dashboard, transactions |
| Screen Time | `/screen-time/` | `/en/screen-time/` | Daily overview, app activity |
| Airsoft Marketplace | `/airsoft/` | `/en/airsoft/` | Saved searches, profile settings |
| Odonto AI | `/odonto-ai/` | `/en/odonto-ai/` | Isolated sample catalog and topic |
| Otázkomat | `/otazkomat/` | `/en/otazkomat/` | Private module, available tests |

All screenshots are actual application rendering. Odonto's screenshots use
browser-intercepted sample catalog responses because its study catalog is shared;
no fake topics, medical answers or documents were written into that catalog.
Captions identify demo data. No personal customer data is included.

## Persisted demo data

- **Vocabulum:** six private folders; 120 words, 24 sentences in English, German
  and Spanish; six private tests; twelve synthetic attempts with 120 consistent
  answer rows; seventeen mistake records, four still uncorrected. The account
  remains an unassigned `STUDENT`, with no school administration privilege.
- **Mega Music:** activated the ordinary 500 MB private managed library. Copied
  twelve explicitly authorized tracks from the owner's verified account into
  new private objects under the demo UUID. The `Good Songs` folder uses cleaned
  artist/title names, categories, tags and sample ratings. Total copied size:
  96,306,305 bytes. Every object was checked before and after copy. Playback of
  the copied `One Kiss` track was verified. No source objects, titles, ratings
  or account settings were changed. Audio files are not published with the pages.
- **KešTrek:** two folders, six categories and twenty-four synthetic EUR
  transactions, including three future payments. Writes used the authenticated
  demo session and normal CSRF-protected API. No personal finance account was used.
- **Screen Time:** two fictional children, two demo tablets with no issued device
  tokens, fourteen days and 112 activity sessions. App identifiers use a dedicated
  `sk.developed.demo.*` namespace. The existing ingest function produced daily
  totals, keeping session and aggregate data consistent. No actual device was
  enrolled, contacted or reconfigured.
- **Airsoft:** two private saved searches created through the actual UI.
  No fake listings or conversations were published and phone verification was
  not bypassed.
- **Otázkomat:** private `Akadémia Horizont · Demo` organization, UUID
  `9feac7cf-f80c-5b26-997c-9b0310e42942`; three modules, three submodules, six tests,
  thirty questions and ninety options. The demo remains a `member`; its previous
  automatically assigned default-organization membership was deactivated only
  for this demo UUID. No other memberships were changed.

## Source and maintenance

`assets/showcases/` contains fifteen JPEG screenshots and shared CSS/JavaScript.
The screenshots total about 1.6 MB across all seven apps; each page loads only its
own two or three images. Screenshot enlargement uses an accessible native dialog
and restores focus after closing. Reduced-motion preferences are respected.

Page copy lives in `scripts/showcase/products.json`. Regenerate checked-in HTML:

```sh
python3 scripts/showcase/build-pages.py
```

The resulting pages are ordinary static HTML; production requires no build step.
The sitemap includes both languages with canonical and alternate-language links.
`server/accounts/deploy/deploy-marketing.sh` has an explicit allowlist addition for
these seven directories. The root-owned installed deployment hook now includes the same allowlist.
Publishing must use the curated static artifact, never the repository root.

The fixture scripts are one-time operators, not startup jobs. Database seed
scripts default to preview and require `--apply`. They refuse an already-populated
demo target rather than resetting or duplicating data. Do not delete or recreate
the central identity to refresh screenshots. Music copying reads protected runtime
configuration and writes a private receipt; inspect that receipt before any retry.

## Verification and known application issues

- Verified persisted counts with read-only SQL scoped to the demo identity.
- All fourteen product pages tested at 1440 px and 390 px: no horizontal overflow,
  valid heading/language, images loaded, working zoom/escape/focus restoration,
  FAQ expansion and both homepages' fourteen project links.
- Curated preview artifact passed `/usr/local/bin/check-publication`.
- JavaScript and deployment shell syntax checks passed; `git diff --check` passed.
- Reviewed desktop and mobile rendered previews under
  `/tmp/developed-showcase-review/`. These are review artifacts, not public files.

While creating the Vocabulum demo, populated folder, word and test lists exposed
an existing central-auth regression: nested PostgREST joins still selected the
legacy `app_users` view, which the scoped backend is correctly forbidden to read.
The fix is committed as `57c1610` in the sibling `vocabulary-builder` checkout. It routes
embedded joins to `ecosystem_app_users`, preserving aliases, counts and FK hints,
without granting additional database permissions. All 514 tests and TypeScript
passed. **The fix is deployed** as immutable release `5cf0b47669da2475b0922522339b01f6b002afb9`
on `developed-vocabulum-native.service`, loopback3161. The release contains the
previous serving revision plus this fix, preserving native mobile login.
The marketing screenshots use the working
results, language overview and mistake screens.

Two other observed differences are not hidden by these screenshots: the running
Vocabulum dashboard displays the raw correct-answer average as a percentage
(8% versus 83% on the correctly calculated results page), and Screen Time's
running release does not expose the `/report` route found in its newer checkout.
The pages therefore show working daily views and do not advertise the absent
report route. No schemas or credentials were changed. Vocabulum was released through a
side-by-side3171 candidate; the original Caddy configuration was restored after
returning traffic to the permanent3161 service. The temporary candidate is stopped.


## Deployment verification — 1 October 2026

- Both source main branches and `release/showcase-20261001` were pushed.
- All fourteen published pages passed the same 28 desktop/mobile checks,
  including loaded screenshots, links, FAQ and accessible image zoom.
- The immutable Vocabulum release passed 514 tests (two optional skipped),
  standalone TypeScript and production webpack build. Authenticated demo folders,
  words, tests and results returned200 on candidate, permanent loopback and public
  routing. Native session without bearer returns401; legacy password login409.
- UID985 candidate probes denied credentials, developer home, Docker/Tailscale,
  release writes and private gateway access. Native service is active/enabled,
  zero restarts, with no error-pattern journal lines since the release started.
- The old release's authenticated folder request still returned500 before
  cutover, confirming the regression; the corresponding new-release probe passed.
- Root-only proxy/unit backups and rollback notes:
  `/var/backups/showcases-20261001`. Previous app release: `6f9ba60`.
  Previous marketing source: `05b7fdd`. Keep the expanded publication allowlist when
  deploying future marketing commits. Only remove the new Vocabulum release
  drop-in to select the prior app pin; use the candidate for a graceful handoff.
- No demo seed or music-copy script was rerun during deployment.
