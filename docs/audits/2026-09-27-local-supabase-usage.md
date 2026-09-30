# Other local Supabase applications — 2026-09-27

## Scope and evidence

Follow-up to the [JASOM audit](../../../jasom/docs/audits/2026-09-27-local-supabase-usage.md).
The user restricted work to apps using the local containers. Repository connection
configuration, runtime documentation and Docker/schema metadata identify the shared
self-hosted **live production** stack in `supabase/docker`, PostgreSQL `supabase-db`,
Kong on loopback 8000 and the session pooler on 5432. No hosted project was accessed.
All changes remain on the existing branches; unrelated work was preserved. Nothing
was committed, pushed, deployed, restarted or migrated on the shared instance.

The retained gateway baseline is **2026-09-27 [09:00,10:00) UTC**, or
**[11:00,12:00) Europe/Bratislava**, the latest complete hour when collected.
`docker logs` used explicit boundaries, no tail/sample limit or pagination.

| Data API shape | Method | Status | Entries |
| --- | --- | --- | ---: |
| devices: selected auth/device fields; token_hash = ? | GET | 200 | 25 |
| rpc/report_presence | POST | 204 | 23 |
| rpc/ingest_batch | POST | 200 | 2 |
| reminders: selected due fields; active, unfired, due, not deleted | GET | 200 | 6 |
| Total | GET 31 / POST 25 | 200: 33 / 204: 23 | 56 |

One distinct device-token hash, aggregated without retaining its value; all user
agents were Node-family. Presence cadence was about 30.5 seconds with idle gaps;
reminders about 600 seconds. No non-2xx entries or demonstrated retry bursts.
Request latency and bodies were unavailable. Other selected service/container and
application journals returned no entries; proxy log files were unavailable/empty.
Retention completeness is unknown. Zero entries do not establish zero activity.
No fresh supplied log exports existed. See the first audit for exact query fields,
services and the separate JASOM cumulative statistics.

Read-only `pg_stat_statements` inspection on September 27 additionally found the
conditional accounts activity UPDATE had **156 calls, 11 affected rows, 7.42 ms total
execution time**: 145 calls updated no row. Statistics reset at
**2026-09-03 15:03:06.682094 UTC**; these are cumulative, not the one-hour baseline.
The initial selection used top 25 by execution time, top 12 by calls and targeted
statement matches, without pagination or customer-table scans. No live ANALYZE or
expensive scans were run. Counters are neither unique HTTP requests nor CPU/billing.
The other new optimizations below are supported by code and local tests, not by
measured high production traffic. No monthly extrapolation or production savings
claim is made.

## Findings and implementation

| App/schema | Decision |
| --- | --- |
| DevelopED accounts (`accounts`/`core`) | Skip redundant session activity UPDATEs using the existing fresh session read; all authorization checks remain fresh. |
| Odonto AI (`odonto`) | Batch central identity-directory lookups in groups of 100, preserving profile order, missing emails and admin enforcement. |
| KešTrek (`kestrek`) | Pause unread-count polling in hidden tabs; cancel in-flight work and refresh immediately on return. |
| Airsoft (`airsoft`) | Batch latest-message previews using the verified FK and one ordered child per conversation. Keep unread counts and best-effort fallback. |
| JASOM (`jasom_private`) | Connection reuse and pending-embedding index already prepared in the first audit. |
| Screen Time (`screentime`) | Retain fresh device/owner checks and the Android heartbeat contract. Existing parent pollers have visibility/overlap guards. |
| Otázkomat (`otazkomat`) | Access context already batches related reads with bounded stable pagination; no unsafe authorization caching. |
| Vocabulum (`voc_builder`, repository `vocabulary-builder`) | Audio cache touch writes affect LRU eviction; no measured benefit justifies changing that ordering here. |
| Mega Music (`mega_music`, repository `mega-media-player`) | Owner-scoped reads and bounded listings already exist. Cleanup/lease loops were not shown to be redundant. |

The unchanged-app decisions are limited investigations, not an assertion of optimal
performance. Relevant paths include Screen Time `web/lib/device-auth.ts`,
Vocabulum `lib/data/tts.ts` and Mega Music `server/accounts/library.mjs`.
Per-app implementation, test evidence and risks:
[Odonto](../../../odonto-ai/docs/audits/2026-09-27-local-supabase-usage.md),
[KešTrek](../../../kestrek/docs/audits/2026-09-27-local-supabase-usage.md),
[Airsoft](../../../airsoft-marketplace/docs/audits/2026-09-27-local-supabase-usage.md).

### Accounts change

`server/accounts/src/accounts.ts:29` previously sent a conditional activity UPDATE
on every valid bootstrap, even when the five-minute condition could not match.
The existing session SELECT now also computes `activity_due` with the database
clock. Only a false result skips the UPDATE; missing/null hints conservatively
retain it. The UPDATE keeps its original conditional predicate, so concurrent
requests across processes/instances cannot all stamp the same fresh row. A burst
crossing the boundary may still submit several conditional writes; no exactly-once
claim is made. The internal hint is removed before returning the session.

The pre-existing five-minute activity timestamp granularity is retained (an
individual request can cross the boundary between read and write). No timer or
shared cache is introduced. Session expiry/revocation, browser trust, user lock,
security version, verified email, pending operation, provider session and MFA
checks still execute on every request. Application response shapes and useful
error/security/audit logs are unchanged. Expected benefit: one fewer SQL round trip
for fresh activity; the observed no-op history demonstrates the opportunity but
is not a measured post-release saving. Incoming client polling remains unchanged.

## Validation and limitations

- Accounts: `npm test --prefix server/accounts` passed **157 tests**, with **22
  opt-in tests skipped**, including the TypeScript build. Ten new mock-DB tests
  cover actual query counts/construction and security state changes; 20 fresh
  bootstraps make 60 authorization queries and zero activity UPDATEs. The
  cross-instance test verifies the retained SQL predicate, not a live concurrency
  race. No lint script is configured for this service.
- Odonto: 75 Jest tests and production Nest/TypeScript build passed.
- KešTrek: seven focused Chrome/Karma tests and production Angular build passed.
- Airsoft: 62 default tests passed, three opt-in skipped; the new opt-in disposable
  PostgREST/RLS test also passed. Next production build and TypeScript passed.
- Changed-file lint passes where configured, except the existing large Odonto
  service has pre-existing lint failures (compared with HEAD). Full Airsoft and
  KešTrek lint remain blocked by existing errors outside the patch; details in
  per-app reports. Builds emitted existing budget/module warnings.
- No production browser flows or post-deployment comparisons were run. Airsoft
  integration used newly created synthetic PostgreSQL/PostgREST containers;
  containers, volumes and network were removed. No customer data was copied.

## Release and measurement plan

No database migration or production configuration change is needed for these four
new patches. A later authorized release is required; JASOM's separate migration
remains unapplied. Unread-count aggregation for Airsoft is a possible future DB
change, requiring separate correctness/RLS tests and workload evidence.

Before release, collect a comparable complete-hour gateway/application sample and
two read-only statistics snapshots an hour apart. Record timezone, retained-line
limits, reset/eviction counters and coverage; do not reset shared statistics.
After release repeat with similar active users, inbox sizes and hidden-tab time.
Compare accounts bootstrap/activity-UPDATE deltas, Odonto directory requests per
admin load, Airsoft previews per inbox load, and KešTrek unread requests per visible
and hidden minute. Track endpoint latency/error rates where instrumentation exists,
and check session revocation, role changes, empty inboxes and visibility catch-up.
Database execution-time deltas and HTTP log deltas must be reported separately.
Reduced requests can reduce associated access logs; no logging has been suppressed.

The observed Screen Time Android client produces the incoming heartbeat traffic.
Changing that requires a coordinated client release and the existing 90-second
staleness contract; server changes here do not eliminate it. No change to its
cadence is justified by this sample. Other production DB/index work, deployments
and expanded diagnostics remain outside this local implementation.
