# Local Vocabulum Vercel retirement artifact

**Unpublished candidate.** The only authorized live Vercel change so far was
the project Git-link disconnect. This directory does not change a deployment.

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

## Reviewed staging operator, not yet executed

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

Vercel project variables currently remain configured; they are outside this
source artifact. Their future-build configuration removal and remote deployment
metadata checks need separate GO. A prebuilt, function-free artifact cannot
execute them, but "no secrets in this source file" is not proof that Vercel
stored no environment metadata for its new deployment.

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

Follow [the complete inventory and closure runbook](../../../../docs/ecosystem-vocabulum-vercel-closure-20260920.md).
Promotion of this routing artifact only neutralizes aliases assigned to it.
The 26 old credential-bearing immutable runtimes remain active until separately
retired. Vercel Authentication is access protection, not runtime retirement;
deleting project environment variables does not remove old runtime credentials.
