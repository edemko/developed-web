# Supabase optimization deployment — 2026-09-30

All five optimization commits were pushed on existing main branches. Main was
current with each remote, so no rebase or force push was needed. Unrelated dirty
changes remain in place. The host releases below were tested and published;
Odonto's separate Vercel release is recorded in its repository.

| App | Main optimization | Serving source / artifact |
| --- | --- | --- |
| Central accounts | `5fb6790` | `75674fc7e255d8bf21445cceeafa09a8e0247f1e` |
| JASOM | `48fddc4` | v9 / `16140481492ef2c54e1ccb8f38378be38b21420c` |
| KešTrek frontend | `ad0577d` | `d280d1eab82042c0727e3c4d73d175e81a691494` |
| Airsoft | `8e325c1` | `8e325c1123faeed4419635c7a8ec0d6f3320bb65` |
| Odonto backend | `75f9406` | see Odonto deployment checkpoint |

Central/JASOM/KešTrek source tags `deploy/supabase-20260930` are scoped patches on
their serving revisions, avoiding unrelated undeployed main features. Airsoft's
current main application already matched the live profile release. KešTrek's
serving static `09236ab` frontend tree was verified identical to its `1c10267`
base; the build explicitly retained central authentication.

## Central production

`developed-accounts.service`, UID988, loopback3140, active/enabled, now selects
`/opt/developed-accounts/releases/75674fc7e255d8bf21445cceeafa09a8e0247f1e`.
Only compiled `accounts.js` changed relative to the actual previous `9f53cab`
release. Current native, profile, browser-family, security and provider behavior
was preserved. No account/schema/credential or admission configuration changed.

An HTTP-only candidate on3180 carried requests during handoff. It used the same
scoped DB role, disabled API mail and no background worker/housekeeping loops.
The sole mail worker drained, then restarted with a new immutable launcher
`mail-workers/75674fc7e255d8bf21445cceeafa09a8e0247f1e`; its guard's API path is
repinned. Mail implementation remains `502a7048...`, with its existing protected
input and unchanged mail/db/security/template bytes. No test mail was sent.
Permanent API health and mail startup guard passed; routing returned to3140.
Candidate is stopped/not enabled and its temporary3180 bind permission removed.

Whole Caddy configurations were adapted and structurally compared: only four
reviewed app targets/root changed, then central returned to3140. Both reloads
were graceful. Other routes, production units, previews, data, keys and workers
were preserved. Original config, mail override and bind policy plus release
metadata are root-only in `/var/backups/supabase-optimizations-20260930`.

## Verification

- Scoped accounts: **159 tests passed,22 optional skipped**, TypeScript build.
- Airsoft: **62 passed,3 optional skipped**, plus **1 actual disposable
  PostgREST/RLS test**; production Next/TypeScript build.
- KešTrek: **7 Chrome/Karma notification tests**, production Angular build.
- JASOM: **7 polling +5 disposable PG tests**, production Vite/TypeScript build;
  scoped index applied and selected by live EXPLAIN (no ANALYZE).
- Public mobile Chromium on central, Airsoft, KešTrek and JASOM: HTTP200,
  zero page errors/broken assets/overflow. Candidate runtime probes denied
  protected files/control sockets and release writes. No privileged keys entered
  public builds. New API/mail/Airsoft/JASOM services showed zero restart loops.
- Bounded retained journals since07:00UTC contained no error-pattern lines for
  those four services at the check. Coverage is limited; this is not a production
  error-rate measurement. User login/account changes and delivered mail were not
  exercised. Existing lint issues and baseline limitations remain in the audit.

Initial direct central health probe without canonical Host returned421 as
expected from host enforcement; the canonical-Host probe passed. Public `/health`
is not routed (404); `/login` and application/guard probes were used instead.
No bypass was added to make either probe pass.

## Recovery and measurement

Central rollback retains `9f53cab` API and its matching mail launcher. Use a
qualified HTTP candidate while restoring both pins, drain the sole worker, then
verify health/guard before routing back; never run duplicate mail senders. No DB
rollback is required. Other apps' exact prior targets are in their checkpoints.
JASOM's additive index may remain on rollback.

No comparable post-release hour has yet been collected. Follow the September27
before/after plan; do not claim measured CPU, log-volume or billing savings from
fixture request counts or the selected query plan.
