# Private frontend qualification — 2026-09-20

No live configuration, service, route, public assets or Android source changed.
The configuration contract is in `ecosystem-app-config-contracts.json`.

## KešTrek

Clean committed frontend source: `09236ab464e4477a4cfb1212ed0d201181c3c4db`.
Disposable build root: `/home/openclaw/kestrek-central-build-cQnJvz`.
Artifact: `frontend/dist/kestrek-frontend/` (95 files).
Per-file SHA-256 manifest: `artifact-manifest.json` at that build root;
manifest SHA-256:
`09aea9777d6f8940b328c343d4d9e5d877583f2be90d87ee01ef39701cc672c8`.
Artifact tree SHA-256:
`71995697e98755484440c11e84917fc46bf0ef1ded172c0b1315ae86a9cbf323`.

Recipe: archive only committed `frontend/`, excluding every `.env*`, preexisting
output and dependencies. With Node 22.23.2, serialize under
`/home/openclaw/.cache/developed-ecosystem-build.lock`; run
`npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund`, then
`npm run build`. Use `NG_BUILD_MAX_WORKERS=1` and
`NODE_OPTIONS=--max-old-space-size=1536` on this shared host.
The retained `build.cjs` records exact install/test/build commands and validates
the generated configuration. The first launcher attempt found the immutable
runtime contains Node only; the successful recipe invokes the installed npm CLI
using that Node binary. No dependency lock or application source was changed.

Only public build inputs were admitted: canonical public Supabase URL, its
existing public **anon-role** key (validated before use), canonical
`API_URL=https://kestrek.sk/api`, and `ECOSYSTEM_AUTH_ENABLED=true`. The generator
correctly emits `production=true`, `ecosystemAuth=true`, `apiUrl=/api`.
No private central/client/data/session key enters this build.

Nine focused Chromium tests passed: ecosystem bootstrap/token secrecy,
server-flag mismatch, local logout CSRF, same-origin interceptor bearer removal,
central identity guards, and support/footer localization. The final production
bundle additionally passed a real Chromium fixture (`bundle-smoke.mjs` retained
at build root): central login rendered, no password form, no provider Auth or
refresh request, and no obsolete bearer transmitted. All external requests
were blocked; this is compiled frontend behavior, not a live OIDC acceptance.
Legacy source strings can remain in lazy chunks; their literal absence is not
claimed as a security test.

Production build passed with existing budget warnings: 961.74 kB initial bundle
against a 500 kB warning budget, plus five component/style warnings reported in
the retained build log. No error budget was exceeded. Build and focused-test
logs remain at the disposable build root.

## Otázkomat

Reused the already-built private candidate rather than rebuilding unchanged
frontend source. Candidate revision: `7393f6b095f0`; current source revision
`993208ea83f380106642e05bfc6acde601c68971` has no frontend diff from it.
The four files under
`/opt/developed-apps/otazkomat/releases/7393f6b095f0/web/` match every recorded
SHA-256 in that candidate's root-owned `release-manifest.json`.
The production bundle includes canonical `https://educatio.sk`.

Copied those exact files to
`/home/openclaw/otazkomat-central-check-H2Yno1/frontend/build/`, beside the clean
committed frontend test source. Artifact tree SHA-256:
`58f012ddca3413df863d21bebac5b275439f468137de37ec24fbad9febe83aa9`.
The existing `frontend/test/ecosystem.browser.mjs` passed all five actual-bundle
fixture scenarios: central login, recovery, profile, registration, and retained
legacy login. Central scenarios assert no password form, clearing the obsolete
localStorage token, no Authorization header and no legacy refresh request.
The test blocks external traffic and supplies stubbed account/data responses.

Test invocation uses Node 22.23.2 with
`PLAYWRIGHT_MODULE=/tmp/screentime-browser/node_modules/playwright/index.mjs`
and
`CHROME_BIN=/home/openclaw/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`.
Run `node frontend/test/ecosystem.browser.mjs` from that disposable root.
Otázkomat discovers central mode through runtime API responses, so there is no
compiled SSO boolean to flip. Changing its compiled `VITE_API_URL` would require
a rebuild; that was unnecessary for this canonical candidate.

Tree hashes above are SHA-256 of JSON-serialized `[relativePath, fileSha256]`
pairs, sorted by relative path using JavaScript `localeCompare(other, 'en')`.
These private artifacts still require coordinated backend/credential/enforcement
readiness and public routing approval/evidence; they are not a deployment.
