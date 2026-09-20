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

## Packaging and later publication review

Only after a separate coordinator GO, prepare a new private temporary directory
and copy this exact JSON to `.vercel/output/config.json`. Add an exact local
`.vercel/project.json` for project `prj_Nqg32imlxVxBkRoeeAUpAdkz8Hfk` and team
`team_8zEVzukOohffhNKgSDSiDveC`; never run a project import/create flow. There must
be no other output files or `.env` files. Do not upload this repository or the
Vocabulum application tree. Use a reviewed prebuilt deployment path without
building or pulling environment values into the temporary directory.

Vercel project variables currently remain configured; they are outside this
source artifact. Their future-build configuration removal and remote deployment
metadata checks need separate GO. A prebuilt, function-free artifact cannot
execute them, but "no secrets in this source file" is not proof that Vercel
stored no environment metadata for its new deployment.

After staging, verify actual 303/410 behavior through an authorized protected
preview without logging bypass credentials, source queries or cookies. Check
the literal Location including `#`, no query propagation, no Set-Cookie, no
functions/middleware/cron, exact project/team, no alias promotion and no Git
reconnection. Then request the coordinator's reviewed alias/domain and old-ID
retirement action. Do not remove protection to run a test.

Follow [the complete inventory and closure runbook](../../../../docs/ecosystem-vocabulum-vercel-closure-20260920.md).
Promotion of this routing artifact only neutralizes aliases assigned to it.
The 26 old credential-bearing immutable runtimes remain active until separately
retired. Vercel Authentication is access protection, not runtime retirement;
deleting project environment variables does not remove old runtime credentials.
