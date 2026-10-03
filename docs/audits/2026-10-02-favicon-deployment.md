# Product favicon deployment — 2026-10-02

Deployed and publicly verified:

- AMP: `developed-airsoft-favicon.service`, loopback3162, source `4bb0407308`.
- Vocabulum: `developed-vocabulum-favicon.service`, loopback3171, source `fe5f9b5d2f`.
- OdontoAI frontend: Vercel `dpl_EqbrW2HpLK75yhDhRHW4ewiSpEvR`, source `6da3e0d444`.
- DevelopED: `assets/projects/airsoft.svg`, `assets/projects/odonto.svg` and
  favicon links in `/airsoft/`, `/en/airsoft/`, `/odonto-ai/`, `/en/odonto-ai/`.

Marketing publication applied only these six files, preserving all other live
HTML. The public-file scanner passed. Browser checks on all four showcase pages
verified the actual links and icon bytes. The published static directory remains
`/var/www/developed.sk`; no repository/server files were published.
Backup and file hashes: `/var/backups/favicons-20261002/marketing`.
Source edits remain in the working copy for integration; app release branches
are pushed as `release/favicons-20261002`. Keep these icons in later main releases.

Svet Pečenia is pending at the owner's explicit request. Its recorded Vercel URL
returned `DEPLOYMENT_NOT_FOUND`; both the local login and that repository's CI
credential returned403. Its release branch contains the prepared icons and an
inspect-only job. No Svet Pečenia deployment or promotion occurred.

Host release/rollback details are recorded in the individual application runbooks.
The old host processes are stopped/disabled and their immutable releases retained.
Only the two affected Caddy upstreams changed; other services and data were preserved.
