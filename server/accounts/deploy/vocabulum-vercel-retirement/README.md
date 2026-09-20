# Local Vocabulum Vercel retirement artifact

**Private preview staged; no production promotion or old-runtime retirement.**
The authorized Git-link disconnect, environment backup/removal and static
preview creation are complete. The checkpoint below supersedes the earlier
read-only inventory for those operations only.

## Private staging checkpoint

Source/operator revision `64db2c2` was tested (9/9 checks) and pushed with
`[no deploy]`. A root-owned read-only copy and the pinned routing JSON were
installed at `/opt/developed-operators/vocabulum-vercel-64db2c2/`, with source and
installed SHA256 matches. The operator SHA256 is
`0b2a309a4ae2cf788ff48048cd0e68c200a54a01175d173d26fc60a8d12b6081`.

All seven exact project environment entries were backed up to
`/root/vocabulum-vercel-env-recovery-20260920.json`, root:root0600, one hard link,
file and parent-directory fsync plus private read-back verification. Their
unchanged values/IDs were checked privately before deleting only those seven
future-build entries. Zero project entries and zero linked shared entries were
then verified. The old deployments' embedded credentials remain unchanged.

The new static preview is `dpl_J2es9uhrzdS1fcxo7gAV1U4rRpZr`, URL
`vocabulary-builder-cev55ut27-erik-demkos-projects.vercel.app`. The root-only
stage record is `/root/vocabulum-vercel-static-stage-20260920.json`. Inspection
asserted READY, target null (preview), alias list empty, builds empty, functions
absent and no cron metadata. All 26 old READY deployment IDs, the production
target, five existing alias bindings, two domains, protection setting and
disconnected Git link were preserved. No promotion/domain/deployment deletion
occurred.

Deployment file enumeration contained only `src/index.txt` and
`src/vercel.json`. Both fetched file contents, decoded from the API's base64
envelope, exactly matched the submitted static files. Their SHA256 values were
`ea08691d51a814e4385b826c44d56502ead6b3ad82abc1e5522c63eb6bc0f507` and
`dd9458aa4ce756a8284f3b122122ade6c4928f1884f4fdaa5ece1d6adc3eaaae`
respectively. Deployment `env` and `build.env` are arrays of environment names;
none of the seven legacy app names appeared in either. No values were printed.

Anonymous preview `/api/auth/providers` returned Vercel authentication 302.
Normal canonical `/api/auth/providers` remained 200 with `credentials`, confirming
the existing VPS serving path was not switched. The detail response still
reports the project's `nextjs` framework metadata despite the submitted null
framework and empty install/build commands, and its `routes` field is null.
Consequently this checkpoint proves the exact submitted source, READY preview,
absence of reported executable output and legacy environment names, and unchanged
serving routes; it does **not** claim actual Vercel 303/410 behavior. That remains
the next reviewed public-alias smoke check, without a new protection bypass.

`config.json` is a complete Vercel Build Output API v3 routing artifact. It has
no application source, functions, middleware, build dependencies, files to serve,
environment variables or secrets. [Vercel's documented route format](https://vercel.com/docs/build-output-api/configuration)
permits status responses with a fixed `Location` header and method/host matches.

Behavior, in order:

1. Requests reaching Vercel with `Host: vocabulum.developed.sk` receive 410. The
   real public canonical site remains on the VPS. This closes the stale origin
   and avoids redirect loops while its Vercel domain attachment is removed.
2. GET/HEAD navigation to legacy login/recovery/registration pages receives a
   303 to the canonical browser login. No recovery/reset credential is consumed.
3. All old `/api`, `/auth`, `/oauth` and `/.well-known` protocol routes receive
   410, including NextAuth, native login/refresh and callbacks.
4. Other GET/HEAD page requests receive the same canonical-login 303.
5. Every other method receives 410, with no redirect or upstream request.

Redirects have a literal destination, omit incoming paths/query parameters,
and explicitly include an empty fragment `#` so browsers do not inherit a token
fragment. `Referrer-Policy: no-referrer` prevents the old credential URL becoming
a Referer on navigation; `Cache-Control: no-store` avoids cached migration
responses. The artifact never forwards cookies, Authorization headers or bodies.
Method restrictions mean an old Next.js action or password POST cannot become
a POST against the canonical application. There is no external rewrite.

## Local checks and their limits

From the DevelopED repository root:

```sh
node --test server/accounts/deploy/vocabulum-vercel-retirement.test.mjs
```

Tests validate the source artifact's restricted structure and exercise a local
HTTP interpreter of this small documented route subset. They check methods,
protocol paths, fixed query-free redirects, host-origin denial and headers.
They do **not** execute Vercel's production router, establish deployment
protection or prove a remote artifact is credential-free. A future privately
staged deployment needs actual Vercel responses and metadata inspection before
promotion. Do not mistake an SSO 302 for the artifact's intended 303/410.

## Staging operator contract

The sibling `vocabulum-vercel-operator.mjs` stages this artifact through the
[documented create-deployment API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)
as exactly two inline source files: `vercel.json` containing these same routes,
and an inert `index.txt`. It pins this JSON's SHA256 and sets framework to null,
install/build commands to empty strings, and Git deployment creation to false.
There is no package manifest, executable build, function or dependency. It
uploads no repository, app source, credential or local environment file.

The deployment request omits `target`, which the API documents as a preview,
and contains no Git source, existing deployment ID, alias or environment values.
Project build defaults may become the explicitly submitted static defaults;
existing deployment routing and credentials are unaffected. The operator checks
the exact production target and all alias/domain bindings after staging. A
Vercel-generated protected preview alias may appear; it must not replace any
existing alias. The original production target remains selected.

Each phase requires the coordinator's GO before executing it. The default
`plan` performs metadata GETs only. These are phase names, not an instruction to
run all phases now:

| Phase | Exact operation and postcondition |
| --- | --- |
| `plan` | Verify exact project/team, disconnected Git, the 26 old READY deployment IDs, five aliases and two domains; print environment names only. |
| `backup-env` | Root-only `GET /v10/projects/{project}/env?decrypt=true`, exclusive-create `/root/vocabulum-vercel-env-recovery-20260920.json` as root:root0600, fsync file and `/root` directory, then read-back verification including single hard link. No remote mutation. |
| `clear-env` | Verify that all seven backed-up entries and privately re-read values remain identical, then `DELETE /v9/projects/{project}/env/{id}` for those seven exact IDs; verify zero project entries and unchanged serving metadata. |
| `stage` | Require zero project environment entries and a protected recovery file; `POST /v13/deployments?skipAutoDetectionConfirmation=1` with exactly the two static files and no production target. Save the new ID to exclusive root:root0600 `/root/vocabulum-vercel-static-stage-20260920.json`. |
| `inspect-stage` | Require READY and non-production target, absent/empty functions/builds/crons metadata, exact project, original serving fingerprint, zero project/shared environment entries, disconnected Git and all 26 old deployments still READY. Report selected routing/build state only. |

All requests include the exact team ID; authentication is read into memory from
the existing CLI file and sent only in the HTTPS Authorization header to
`api.vercel.com`. No redirects are followed. Errors suppress assertion diffs and
upstream bodies because either can contain secrets. No account/project deletion,
DNS change, public protection change, alias mutation, promotion or old-runtime
deletion is implemented in this staging-only operator.

Every phase also requests `GET /v1/env?projectId={exactProject}`, the documented
shared-environment project filter in Vercel's [OpenAPI definition](https://openapi.vercel.sh/),
and requires an empty complete response. The pre-execution read returned HTTP200,
`data=[]`, `pagination.count=0` and no next cursor. Thus no currently linked shared
team variable can supply an application credential when the seven project
entries have been cleared. This is checked again before and after staging; it
does not claim Vercel generates no platform/system environment metadata.
No team-wide variables or integrations are removed.

Do not automatically retry an ambiguous stage POST or a partially completed
environment deletion. Reconcile exact deployment metadata and remaining
environment IDs read-only first. Exclusive recovery/state files prevent silent
overwrite or an unnoticed second deployment on normal reruns.

The recovery file preserves each entry's key, value, targets and metadata for
an operator-controlled restoration through Vercel's project-environment API.
It is never copied into this repository, served, or supplied to the new static
deployment. It does not revoke shared backend/OpenAI credentials, and it does
not alter the existing VPS application's independent runtime configuration.

Project variables were removed only after the authorized protected backup.
The new deployment still has Vercel-generated system environment names; zero
application credentials does not mean zero platform environment metadata.

No new Vocabulum protection-bypass authority exists. Therefore first qualify
the protected stage through deployment metadata and its exact file/routing
output. Anonymous 302 proves the protection boundary only. After the coordinator
reviews those results, the separately approved production promotion can use
`POST /v10/projects/{project}/promote/{newDeploymentId}`. Actual public 303/410
checks then use `vocabulary-builder-plum.vercel.app`, while normal canonical DNS
continues to the VPS. Check the literal Location including `#`, no query
propagation, no Set-Cookie, no functions/middleware/cron and unchanged protection.
Do not remove protection or create a bypass secret for testing.

Subsequent separately reviewed operations bind all four legacy Vercel aliases
to the static deployment, detach only the stale canonical project-domain
attachment with `DELETE /v9/projects/{project}/domains/vocabulum.developed.sk`,
and delete only the inventoried 26 old deployment IDs. Project-domain detachment
is not DNS or registered-domain deletion. It is safe only after verifying normal
canonical traffic continues to the VPS. No old deployment can be retired before
the static target/legacy aliases and canonical preservation checks pass.

## Second-phase operator awaiting review and GO

`vocabulum-vercel-close.mjs` pins the exact staged deployment ID above and the
two submitted-file SHA256 values. Every phase rechecks READY state, zero
function/build/cron metadata, absence of the seven old application environment
names, and re-fetches both uploaded files for byte-hash verification. It does
not treat the inherited `nextjs` framework label or Vercel-authentication 302 as
evidence that the routes work.

The operator accepts one phase per invocation. No phase runs another mutation
phase automatically:

| Phase | Operation and gate |
| --- | --- |
| `capture` | Read current state and canonical VPS root/provider behavior; exclusively create root:root0600 `/root/vocabulum-vercel-closure-before-20260920.json` containing the original target/mappings, the exact 26-ID list and nonsecret canonical response signature. |
| `promote` | Require unchanged captured serving state and VPS behavior, then POST the exact static deployment to the project's promotion endpoint. No old deletion. |
| `verify-public` | Require the static production target and run actual `vocabulary-builder-plum.vercel.app` navigation 303 and API/POST/OPTIONS 410 checks, literal query-free Location ending `#`, no-store, no-referrer, no Set-Cookie, canonical Host directly at Vercel 410, and unchanged normal VPS behavior. Write a root-only success receipt only if all pass. |
| `aliases` | Repeat the public smoke; require the receipt, then bind exactly the four legacy Vercel aliases to the static deployment. |
| `detach` | Require all four bindings to the static target, repeat smoke, then DELETE only the canonical Vercel project-domain attachment with `removeRedirects=false`. |
| `retire` | Require all four static alias bindings, absent canonical domain/alias, all 26 old READY deployments, no extra deployments, zero project/shared env, unchanged Git/protection and static production target. Repeat public smoke with direct stale-origin 404/410/421 accepted after detachment. Only then DELETE the exact 26 old deployment IDs, rechecking each deployment's project ownership immediately before deletion. |

Each retirement success is fsynced to an exclusive root:root0600
`/root/vocabulum-vercel-retirement-journal-20260920.jsonl`. The original snapshot
and public-verification receipt are separately retained. There is no project,
DNS, registered-domain or shared-key deletion path. API or smoke failure stops
execution before the next mutation. Do not retry partial retirement or ambiguous
promotion automatically; reconcile read-only. A failing public smoke leaves all
old deployments intact and requires an explicit repair decision, not a broad
rollback to an executable legacy identity endpoint.

Tests use fixture-only requests and cover the source/credential gate, real-smoke
assertions, alias/domain/protection preconditions, exact deletion targets and
wrong-project refusal.

### Promotion attempt and read-only reconciliation

The original-state capture completed at `2026-09-20T19:12:16.341Z` and remains
protected in `/root/vocabulum-vercel-closure-before-20260920.json`. The subsequent
direct promotion request returned HTTP422. It was not retried. Read-only
reconciliation found the original production target unchanged, while
`dpl_J2es9uhrzdS1fcxo7gAV1U4rRpZr` remained READY with a null target and no aliases.
No public-verification receipt, alias reassignment, domain detachment or old
deployment deletion followed. The safe error handler discarded the upstream
body, so no specific upstream error code/message was retained.

Vercel's [promotion implementation](https://github.com/vercel/vercel/blob/main/packages/cli/src/commands/promote/request-promote.ts)
requires an existing production deployment for direct promotion, including an
empty JSON request object. A preview promotion instead creates a new production
deployment. The original request used a preview ID and omitted that object;
these are supported-flow mismatches, not proof of the discarded error message.
The next reviewed option is to submit the same two static files with
`target=production` and `autoAssignCustomDomains=false`, corresponding to
[deploy --prod --skip-domain](https://vercel.com/docs/cli/deploy#skip-domain),
and qualify its new ID before any separate promotion. Do not retry the old
preview-promotion phase.

The corrective `stage-production` phase reuses the exact two-file payload and
changes only the production target and disabled automatic domain assignment.
It requires the original capture fingerprint, all 27 existing IDs, empty project
and linked shared environment, unchanged canonical VPS behavior, and no existing
production-stage record. The returned ID is saved exclusively to root:root0600
`/root/vocabulum-vercel-static-production-stage-20260920.json` with file/directory
fsync. `inspect-production` requires READY/production, no aliases, the exact
28-ID set, matching submitted-file hashes, no application environment names or
function/build/cron metadata, and unchanged serving state and canonical VPS.
The safe preview artifact remains separately retained, outside the 26 approved
credential-bearing retirement targets. Neither corrective phase promotes or
changes aliases/domains. A new reviewed revision must pin the qualified
production ID before direct promotion with JSON body `{}`.

### Production candidate qualification and default-alias exception

Production candidate `dpl_JAKKv2iPuQdbh53NDeMtLZACwFiu`
(`vocabulary-builder-7xyhq91tz-erik-demkos-projects.vercel.app`) reached READY.
The initial post-create check preceded build completion and saw no serving
change. Once READY, Vercel automatically advanced only
`vocabulary-builder-erik-demkos-projects.vercel.app` to this candidate despite
`autoAssignCustomDomains=false`. The original strict inspection stopped. A
complete read-only reconciliation then confirmed all 28 deployments READY,
unchanged original production target, both custom domains and the other four
alias bindings unchanged, Git disconnected, protection unchanged and zero
project/shared environment entries. The moved default alias remains protected:
anonymous `/api/auth/providers` returns 302 to `vercel.com`.

The coordinator accepted this early advance of one intended static alias. The
revised inspection compares the original captured serving fingerprint with
exactly this one named mapping substituted; any other mapping, production,
domain or protection drift fails. It does not restore the old credential-bearing
alias. Both uploaded hashes match the preview, and metadata has no application
environment names or functions/builds/crons. The inherited framework label is
still `nextjs`; actual public 303/410 remains unproven until separate promotion.

The closure now pins this production ID for promotion (JSON body `{}`), public
verification, alias reassignment and eventual exact-26 retirement. The safe
preview ID remains retained and is not a retirement target. At this checkpoint
the corrected production promotion has not been executed; it requires the
coordinator's next GO after source review.

### Static browser handoff repair

The corrected production promotion succeeded at `2026-09-20T19:26:03.291Z`.
Public verification then stopped: Vercel's edge appended the incoming query to
the configured 303 Location. API requests correctly returned 410, but the strict
query-free redirect requirement failed. No verification receipt was created and
no old deployment was deleted. The normal canonical VPS remained unchanged.

`vocabulum-vercel-browser-handoff.mjs` replaces only navigation responses with a
static 200 HTML document. It contains a literal meta refresh to
`https://vocabulum.developed.sk/auth/login#` and a matching no-referrer manual link.
There is no JavaScript, HTTP Location header, external asset, function, middleware
or application environment. Existing protocol/non-navigation and canonical Host
410 routes are unchanged. Headers remain no-store, no-referrer and restrictive
CSP. The generated production payload contains exactly `vercel.json` and
`handoff.html`, with automatic custom-domain assignment disabled.

Local real-Chromium tests intercept and record every request, testing incoming
query and fragment fixtures on three paths. Only the initial fixture navigation
and a query-free, fragment-cleared canonical navigation occur; the canonical
request has no Referer. This establishes browser semantics, not the new Vercel
runtime, which must be tested again after separately approved promotion.

The repair operator supports only `stage` and `inspect`. It requires the exact
28 READY IDs and post-promotion five bindings, empty project/shared environment,
original Git/protection boundary and unchanged normal VPS responses. It saves an
exclusive root:root0600/fsynced
`/root/vocabulum-vercel-browser-handoff-stage-20260920.json`. Inspection permits
only the known automatic default protected-alias advance, requires 29 IDs, exact
uploaded file hashes, READY production state and no credential/function metadata.
Neither phase promotes, deletes old deployments, detaches a domain or reopens a
legacy alias. Any ambiguous POST or unexpected state stops for reconciliation.

The qualified browser-handoff candidate is `dpl_FUDnzBVCZ2FPNHceyC8TuYbSiCpZ`
(`vocabulary-builder-5j102456o-erik-demkos-projects.vercel.app`). Its metadata/file
qualification passed, including exactly the expected default-alias advance and
preservation of all 28 prior artifacts and canonical VPS behavior. The inherited
framework label remains `nextjs`, despite function-free metadata and source.

The next reviewed operator revision adds only `promote` and `verify-public`:
promotion repeats the qualified-record/full-state/file guards and POSTs this
exact production ID with `{}`. Public verification requires its production
target and exact three promoted bindings, actual static HTML 200 without
Location/Set-Cookie, eight protocol/non-navigation 410 cases, direct canonical
Vercel Host 410 and unchanged normal VPS responses. It writes a root-only HTTP
receipt, explicitly marked as still requiring browser verification. No alias,
domain or deletion operation is present in this repair operator.

After HTTP qualification, run the same browser test with
`VOCABULUM_LIVE_HANDOFF=1` and the reviewed Playwright module path. It loads the
actual public handoff HTML; only the fixed canonical destination is intercepted
with a fixture page to record the generated request without sending fixture
tokens or creating a VPS session. Query-free destination, cleared fragment and
absent Referer are asserted. Do not run this live-browser check against the
known-bad 303 predecessor, and do not mistake local fixture success for remote
qualification.

### Public repair qualification completed

The browser-handoff production promotion succeeded from reviewed immutable
operator commit `41415f8`. All 13 actual HTTP checks passed: four navigation
responses returned 200 with byte-identical static HTML and no Location or
Set-Cookie; eight API/protocol/non-navigation checks returned 410; direct
canonical Host at Vercel returned 410. No-store/no-referrer headers matched.
The normal VPS root and credentials-provider response remained unchanged.

The first receipt attempt stopped on deployment `alias` metadata still listing
only its original default alias. Read-only reconciliation established that this
field is not the live-binding inventory: the authoritative v4 alias list and
project production target correctly point canonical/plum/default to the new
artifact. The check now keeps the original deployment metadata expectation and
independently enforces the exact live mappings; no promotion retry was made.

Live Chromium verification then passed against the actual plum HTML for all
three query/fragment fixtures. Every canonical request was exactly
`https://vocabulum.developed.sk/auth/login`, with empty browser fragment and no
Referer. There were no external asset requests. Only that destination request
was intercepted with a fixture response, so the tests created no VPS session.
All 26 credential-bearing old runtimes remain intact pending the separately
reviewed final alias/domain/retirement phases. The two prior safe static artifacts
are not included in the exact-26 deletion authorization.

### Final exact-scope closure operator (separate GO required)

`vocabulum-vercel-retire.mjs` pins the successful HTML handoff. Each phase requires
the exact 29 READY IDs, zero project/shared app environment, unchanged Git and
Vercel Authentication, expected production target/domains and exact live alias
mappings. It re-hashes both uploaded files, rejects functions/builds/crons and
old app environment, repeats all public 200/410 checks and verifies the normal
VPS remains unchanged. It never promotes or deploys another artifact.

`capture` creates an exclusive root600/fsynced final recovery checkpoint that
references the reviewed live-browser evidence in commit `28476ab` and the
existing protected HTTP receipt. This is an explicit operator acknowledgement of
already observed browser evidence, not a claim that the capture phase launches
a browser. The coordinator must review that evidence before authorizing capture.

`aliases` moves only the two remaining historical bindings to the handoff ID;
already-correct bindings are not rewritten. It verifies all four legacy aliases
afterward. `detach` removes only the canonical project-domain attachment, not DNS
or its registered domain; it requires those four bindings and confirms the VPS
and public handoff afterward. Following detachment, direct stale-origin 404, 410,
421 or strict TLS hostname rejection establish a closed canonical mapping. TLS
verification is never disabled, and only that direct-origin check accepts the
specific hostname-rejection error.

`retire` requires the canonical project domain/alias absent and repeats all gates
before deleting exactly the original 26 credential-bearing IDs. Each deletion
rechecks project ownership and is fsynced to an exclusive root600 journal. The
three static artifacts remain. Final metadata and public checks verify their
preservation and the continued VPS/handoff behavior. No automatic retry follows
ambiguous alias/domain/delete results or a partial journal; reconcile read-only.

### Final closure completed — 2026-09-20 19:48 UTC

Reviewed immutable operator `accc69d` completed capture at 19:47:13Z, the two
remaining alias assignments at 19:47:25Z, canonical project-domain detachment at
19:47:35Z, and exact-26 retirement at `2026-09-20T19:48:13.732Z`. Every phase
passed its fresh source, environment, scope, public HTTP and VPS checks.

Independent read-only checks after deletion established:

- All 26 deployment metadata GETs return 404, and all 26 inventoried immutable
  `/api/auth/providers` URLs return 404 anonymously.
- The fsynced deletion journal contains exactly the approved 26 IDs, in order.
- Only three READY static artifacts remain: current HTML handoff `dpl_FUDnzBVCZ2FPNHceyC8TuYbSiCpZ`,
  prior static production `dpl_JAKKv2iPuQdbh53NDeMtLZACwFiu`, and static preview
  `dpl_J2es9uhrzdS1fcxo7gAV1U4rRpZr`.
- All four legacy aliases point to the HTML handoff. The only project domain is
  `vocabulary-builder-plum.vercel.app`; canonical Vercel domain/alias are absent.
- Normal public handoff tests still pass (four navigation200, eight protocol410),
  while direct stale canonical Host at Vercel returns 404. Normal VPS root and
  provider responses were unchanged at handoff to the coordinated VPS cutover.
- Git remains disconnected, Vercel Authentication remains
  `all_except_custom_domains`, and project/linked shared environment lists are empty.

The retired immutable deployment artifacts/URLs are not restored by this runbook;
do not assume their IDs can be recovered. Git repository/source and application
data were not deleted. The protected environment backup, original/final metadata
captures, HTTP receipt and exact deletion journal remain under `/root` for
operator-controlled recovery/audit. Recreating any runtime would be a new,
separately reviewed deployment, not rollback of these deletions. No project,
DNS, registered domain, database record or shared credential was deleted/rotated.

Follow [the complete inventory and closure runbook](../../../../docs/ecosystem-vocabulum-vercel-closure-20260920.md).
Promotion of this routing artifact only neutralizes aliases assigned to it.
The 26 old credential-bearing immutable runtimes remain active until separately
retired. Vercel Authentication is access protection, not runtime retirement;
deleting project environment variables does not remove old runtime credentials.
