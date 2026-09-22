# Publication security remediation — 2026-09-21

The owner authorized fixing the audit findings and confirmed that all MyClinic and Kestrek landing screenshots contain only demo data. No image replacement was needed.

## Applied host changes

- `/etc/caddy/publication-security.caddy` is imported by all ten website blocks (four test aliases included). It adds anti-framing CSP, denies object embeds, constrains base URLs, supplies missing HSTS/nosniff/referrer headers, and consistently sets `X-Frame-Options: DENY`. Existing stricter application CSPs are preserved as additional policies. The shared policy deliberately does not add a blanket script allowlist to the other applications; their logged-in functionality was not redesigned.
- Sensitive published filenames, environment files, repository metadata, private keys, backups, logs and source maps return 404 before SPA fallback. Application API and webhook routes retain their existing handlers. Legitimate `.well-known` endpoints remain available.
- The public MEGA Music download allowlist contains Android 1.0.8 and macOS 1.0.5-2012. Older installers return 410 with a link to the current download page. Three retired binaries were moved intact to root-only `/var/lib/developed-retired-downloads/2026-09-21/`, outside every web root; their hashes were checked before and after the move. A root-only manifest records them.
- `/usr/local/bin/check-publication` enforces an extension allowlist, rejects sensitive/hidden files and symlinks, and scans text/selected archive members for private keys, provider credentials, credential URLs, privileged JWTs, embedded source maps, and nonempty MEGA personal title indexes. It prints finding classes and paths, never secret values.
- `/etc/systemd/system/caddy.service.d/publication-check.conf` runs the scanner before Caddy startup; `/usr/local/bin/reload-public-sites` runs it before reload. Caddy's five static roots are derived from the candidate configuration, not a stale hardcoded release list. This guard covers the Caddy static roots; application-server build outputs can be checked explicitly with the same command.
- The installed marketing deployment hook and its repository source now run the scanner before rsync. Other retired/guarded deployment mechanisms were not re-enabled.

## Odonto Feedback CSP release

`/opt/odonto-feedback/app/apps/web/proxy.ts` generates a fresh random nonce per page response, overwrites caller-supplied nonce/CSP headers, and supplies the policy to Next.js rendering. The root layout waits for a request so nonce-bearing pages are never statically prerendered. Responses are private/no-store. The old `script-src ... unsafe-inline` policy was removed from `next.config.ts`; inline styles remain supported for layout compatibility.

The existing locked dependency set was built as `odonto-feedback-web:security-20260921`; production build/typechecking passed. The Dockerfile's Node 24 base tag resolved to its current image during the build. The resulting web image is pinned by the local tag in `/opt/odonto-feedback/compose.override.yaml`. Only the web service was replaced; the seven-day-running API container, its environment, database and stored submissions were untouched.

The replacement was tested on loopback3180, then Caddy temporarily sent Odonto requests to it while Compose replaced web3100. After health checks, Caddy returned to the normal loopback3100 target. No shared service restart or database migration was used.

## Validation recorded so far

- Four regression-test methods covering clean releases, hidden/environment/backup/map files, symlinks, embedded provider credentials, archive signing material and personal indexes passed.
- Scanner passed on all five active Caddy roots, including under the real `caddy` user.
- 116 candidate HTTP checks passed after correcting directive ordering during staging. The rejected initial candidate was never deployed.
- 159 public HTTPS checks passed after deployment: 14 hostnames, sensitive/encoded paths, and the five current/retired download URLs.
- Odonto candidate browser checks passed in Slovak, English and Ukrainian. Pages hydrated with no browser errors/CSP violations. A script inserted into intercepted HTML without a nonce was blocked. No form was submitted.
- Final public browser checks passed on all ten website homepages and the MEGA Music app. No new JavaScript errors or CSP violations were observed. MEGA's background traffic kept the first `networkidle` wait open; a retry using document readiness confirmed normal rendering.
- Actual cross-origin iframe attempts were blocked on Kestrek, Vocabulum, Airsoft and ScreenTime.
- Live Odonto requests confirmed unique nonces, rejection of caller-supplied nonce/CSP headers, matching script nonces, and private/no-store caching. Its public page also blocked the injected script.
- Both current installer URLs returned valid HTTP 206 byte ranges matching the local files. The three retired URLs returned 410.
- The OpenAI mirror returned login-required status again after remediation.
- Temporary Caddy listeners and the side-by-side Odonto test container were stopped and removed. Production Caddy is active; Odonto is back on its original port3100; its API was not restarted.
- Scanner source, installed executable and deployment documentation are retained under `developed-web/server/accounts/deploy/`. The initial remediation was deployed before its source was committed; the files and patches in this directory preserve that work.

## Rollback and maintenance

The original Caddyfile is saved root-only as `/etc/caddy/Caddyfile.before-security-20260921`, with an audit copy in `Caddyfile.before`. To roll back routing, restore that file and reload Caddy. The publication guard can remain installed if restoring the original site roots; it checks files independently of header policy.

The prior Odonto web image is retained as `odonto-feedback-web:before-security-20260921`. For an Odonto rollback, change the image in `compose.override.yaml` to this tag and replace only the web service with `docker compose up -d --no-deps --no-build web`; use the same side-by-side route switch if uninterrupted service is required. Restoring source separately is needed before a future rebuild. No rollback action was performed.

Future installer publication must update the explicit Caddy download allowlist after the new artifact passes `/usr/local/bin/check-publication`. Do not silently replace content at an existing versioned URL. Keep retired files outside web roots. Future static releases are checked at startup/reload; any other script that copies into a live web root should call the scanner on its staged output **before** copying.

The OpenAI mirror remains owner-only (not deleted): the available Sites tools have no delete/unpublish operation. It is independent of the main site. No source credential or bypass token was generated or used during this remediation.

These changes address the published-files audit; they do not constitute a new authenticated application/database penetration test.

## Versioned host and Odonto changes

`publication-host.patch` records the reviewed Caddy imports and download
allowlist against the pre-remediation host configuration. It is a dated change
record, not an automatic deployment script; rebase it against current routing
before applying it to another host.

Odonto Feedback's deployed directory is not a Git checkout and has no matching
repository among this account's listed repositories. `odonto-feedback-csp.patch`
preserves its complete source changes against the pre-remediation source,
including the nonce proxy, dynamic root layout, header change, and deployment
notes. Apply it from the Odonto source root only after checking the baseline.
`odonto-feedback-compose.override.yaml` is the corresponding reviewed web image
selection. Neither patch contains environment files or credentials.
