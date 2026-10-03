# Problem reports and profile avatars

Source implementation across DevelopED and the seven connected web app repositories.
Not deployed; no production data or mail delivery was used during validation.

My Clinic now has a separate implementation in `my-clinic`, with the same
description, screenshot and source-page reporting flow to `info@developed.sk`.
It uses My Clinic's API and existing mail transport, works without login, and
does not connect to DevelopED identity or change My Clinic profile ownership.
No central report database entry is created. See that repository's
`.claude/plans/problem-reporting.md` for its implementation and release notes.

Odonto Feedback was [decommissioned](app-retirement-2026-10-02.md); it is distinct
from the OdontoAI source implementation below.

The shared reporting entry point uses a header slot at desktop widths, and a
floating button on smaller screens or pages without a shared header. Existing
footer links also capture the current route when activated. The central form
accepts a description, page URL and optional screenshot and queues email to
`info@developed.sk`. URLs omit query strings/fragments to avoid including login
credentials. Screenshots are JPEG re-encoded, encrypted at rest and attached to
the support email; only authenticated superadmins can view the stored screenshot.

`assets/support/report.js` and `report.css` are the shared widget source. Identical
copies live in each app's public assets (KešTrek: `frontend/src/assets`; Mega Music:
`server/accounts/public` plus hashed assets in `website/dist`). Root layouts load
them once. Update the copies together; Mega Music landing assets require new
SHA-256 filenames. `data-developed-app` must use the launch catalog's report slug,
and `data-developed-support-slot` marks an available shared header position.

## Avatar precedence

| App | Existing local avatar | Result |
| --- | --- | --- |
| Mega Music | `mega_music.profiles.avatar` | Local image first, then central; local editor works with SSO |
| KešTrek | `kestrek.users.avatar_url` | Local image first, then central; upload uses the scoped avatars bucket |
| Airsoft | `airsoft.profiles.avatar_url` | Local image first, then central; header now renders it |
| Vocabulum | No product-local image field | Current central image is passed through the session to the sidebar |
| Screen Time | No product-local image field | Central image in the parent account badge |
| OdontoAI | No product-local image field | Central image passed through the backend/BFF to navigation |
| Otázkomat | No product-local image field | Central image in the profile response and navigation |

New images uploaded through DevelopED, Mega Music, KešTrek and Airsoft are decoded
server-side, orientation-corrected, center-cropped to 256×256, JPEG-compressed and
stripped of metadata. Outputs are capped at 128 KiB; oversized, malformed and
animated inputs are rejected. Existing stored pictures are preserved and are
normalized when replaced. Displayed images use square/circular containers and
`object-fit: cover`.

## Release requirements

1. Apply only `20261002090301_report_screenshots_and_profile_avatars.sql` with the
   repository's normal reviewed migration procedure. It adds report fields and a
   private/RLS-protected central avatar table, with scoped service privileges.
2. Release the central API, account UI and the existing sole mail worker together.
   Include the pinned Sharp dependency/native binaries. The worker must understand
   attachments before queued screenshot reports are delivered.
3. Release the curated marketing assets and changed app backends/frontends. Do not
   serve the repository as a web root. Mega Music and Airsoft/KešTrek backends also
   need their updated Sharp dependencies.
4. Verify the public edge admits the bounded image JSON/multipart requests and
   serves each app's local support assets; check signed-in/out and mobile pages.

## Validation

- Central service tests cover image format/size rejection, 256×256 crop,
  screenshot aspect ratio, URL stripping, encrypted attachment storage, retry
  idempotency, mocked Mailjet attachment delivery and route authorization.
- Real Chromium tests with stubbed APIs cover report submission/retry and image
  previews, avatar upload/removal, and mobile/desktop marketing navigation.
- The new migration was executed in a disposable PostgreSQL 17 container with
  minimal fixture tables: scoped service insert/read/update/delete succeeded,
  empty images were rejected, RLS was enabled and public roles had no privileges.
- App checks cover central identity adapters, KešTrek local-avatar precedence and
  real image normalization, TypeScript/Angular template checks and Otázkomat's
  frontend build. Provider/database suites requiring separate opt-ins are skipped.

Public delivery, native mobile clients and production ingress are not qualified
by these local checks. No deployment, live test email or image backfill was done.
