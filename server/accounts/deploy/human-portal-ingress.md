# Final canonical human portal ingress

Source preparation is not activation. This operator changes only the central
human ingress block in Caddy; it does not enable registration, mail, app policies,
provider routes, products, or Odonto aliases. Do not execute until the coordinator
has separately authorized this final step.

## Exact boundary

`install-human-portal.mjs` consumes the root-private **final** product-route
artifact `/var/backups/developed-product-routes-20260920/candidate.Caddyfile`,
SHA-256 `501bbc47de35e94a45c24b9281b1e88ac918ae75d02750fd70c8f13bb1c63946`.
This includes the current postgateway configuration and intended product routes;
it is not the historical pre-gateway ingress candidate or temporary MCP pause.
Any subsequent unrelated configuration change requires another source review,
not a hash override. Product-route files remain owned by their separate operator.

The merge replaces exactly one `DEVELOPED INTERNAL CHECKS` envelope immediately
inside the existing shared `www.developed.sk` / `test.developed.sk` site. It
expands the three hash-pinned portal snippets into one `DEVELOPED HUMAN PORTAL`
block. No import points into the checkout. Every other source byte is preserved.

Adapted JSON is compared too: the exact former internal subroute is removed and
the exact canonical human route is added. All other handler settings, listeners,
gateway policies, product upstreams, static roots, hooks, redirects and test hosts
must be equivalent. Only automatically generated group IDs are normalized.
The operator uses Caddy's explicit [route ordering](https://caddyserver.com/docs/caddyfile/directives/route)
and exact [host/path matchers](https://caddyserver.com/docs/caddyfile/matchers).

Only `www.developed.sk` receives the reviewed human paths and `/api/account/*`.
The existing app-key-authenticated internal checks continue upstream; this is
not an internal-auth bypass. `test.developed.sk` never receives central routes
or central-session root handling. Bare-domain redirect and all eight legal draft
routes remain unchanged, including their publication restrictions.

Anonymous `/` and `/en/` stay static marketing without session creation. Only
GET/HEAD with the exact central cookie name selects the account server. Cookie
presence is **not authentication**: `src/http.ts` validates it through bootstrap;
authenticated users get a private/no-store 303 to `/apps`, invalid/anonymous
sessions receive the configured exact curated marketing HTML. Production must
already have the correct immutable `marketingDir`; fixture tests do not prove
that runtime prerequisite. Other methods and other pages retain existing rules.

## Proof and gates

Infrastructure/coordinator prerequisites, not extra user choices:

- Finish Voc closure, six isolated VPS serving-route handoffs and old-runtime
  retirement; enforce seven-app policy and KešTrek ACL; finish gateway/tunnel
  closure on every reachable provider origin; promote the exact Odonto backend
  then frontend and verify their canonical bindings, protected old URLs and
  fail-closed behavior. Record all final checks before human ingress.
- Confirm central loopback service, scoped role/UID boundaries, private state and
  marketing files, session/key configuration, monitoring and backup/restore
  evidence. No cookie, token, database row or private environment values belong
  in the public proof/log.
- Finish the release acceptance matrix and support/privacy readiness described
  in `docs/ecosystem-identity-plan.md`, `docs/ecosystem-identity-api.md`,
  `docs/ecosystem-provider-qualification.md` and the account-service README.
  Do not silently treat routing fixtures as provider or real-browser acceptance.
- Verify the product operator's final `applied.json` and exact live source, not
  merely its staged candidate or paused phase. The human operator enforces both.

Human acceptance or independently scoped actions still needed when not already
recorded: owner-controlled real login/TOTP/recovery and signed-in root/picker
acceptance; approved recipient/scope for controlled Mailjet delivery; accurate
business/privacy/support disclosures (legal drafts require their existing review).
These cannot be fabricated by an ingress operator. Registration opening and mail
enablement are distinct decisions and are never inferred from approval to route.
The user has already accepted a brief login/re-login window while websites stay
online; that does not waive security gates or authorize an outage. A testable
owner-only/closed-registration phase is distinct from general-public admission.

For Odonto, `ODONTO_IDENTITY_SECURITY_CLOSURE_APPROVED` attests prerequisite
shared-credential/ingress security checks before its paired promotion; it does
not falsely claim that Odonto is already promoted. This human operator's final
`securityCutoverComplete` attestation is later, after the all-seven checks.

## Root immutable stage and apply

After source review/commit, the coordinator must copy the exact committed
operator and its three pinned `portal-*.Caddyfile` inputs into a new root-owned,
non-writable-by-runtime release outside `/home`. Verify their hashes against the
reviewed commit. Do not execute checkout files as root; do not install packages.
All path components must be root-owned, non-symlink and not group/world writable.
The operator does not copy itself or accept arbitrary source/output paths.

1. Run the immutable operator with `--stage`. The root-private product candidate
   must already exist. This creates only
   `/var/backups/developed-human-portal-20260920/` (0700), with exclusive 0600
   original/candidate/proof files, full adapted comparison and Caddy validation.
   It does not touch live routing or need human-activation approval. Stage output
   explicitly says `applied:false,humanPortalEnabled:false`.
2. Review the protected candidate and recorded gates. Only after explicit final
   approval, have the trusted coordinator create root-owned 0600 `approval.json`
   in that directory with exactly `candidateSha256` (the staged proof value),
   `humanPortalApproved:true`, and `securityCutoverComplete:true`. This file is an
   attestation to independently recorded evidence, not automatically generated
   proof. It contains no secrets. No script in this change writes this approval.
3. Run the same immutable operator with `--apply`. It revalidates all artifacts,
   product-final proof, approval and live bytes, writes an exclusive
   `apply-started.json`, atomically replaces only `/etc/caddy/Caddyfile`, then
   gracefully reloads only `caddy.service`. Success writes protected
   `applied.json`. No registration, mail, DB, product or protection changes occur.
4. Perform the separately approved public/signed-in acceptance checks without
   logging session material. A public GET `/api/account/session` can create an
   anonymous session; it is not a strictly nonmutating health check.

No automatic rollback, security relaxation or retry is implemented. If reload
or post-apply acceptance fails, inspect the active Caddy configuration and phase
proof privately: the source file may already be new even if reload failed.
`apply-started.json` blocks automatic repetition. Keep provider restrictions,
policy enforcement, isolated runtimes and central-required product auth intact.
Any recovery is separately reviewed; never restore legacy shared-key runtimes,
pre-gateway config, or pre-product routing. The saved original is the **secured
post-product** human-closed baseline, but restoring even that requires explicit
direction and would interrupt portal login. Never restore a shared database.

## Verification

From this repository:

```sh
HUMAN_PORTAL_FULL_SOURCE_TEST=1 HUMAN_PORTAL_CADDY_TEST=1 node --test server/accounts/deploy/install-human-portal.test.mjs
```

Five tests pass on the reviewed current source: snippet/source drift and exact
approval rejection; exact adapted delta and unrelated-field tampering; read-only
composition of the actual intended product artifact; and isolated ephemeral
Caddy/HTTP fixtures for canonical paths, cookie/root behavior, test isolation,
marketing, legal, hooks, bare redirect, forbidden provider paths and forwarding
header removal. No live route, real user, email or DB is touched. The full-source
test accepts only the original product input or exact final product output;
an intermediate pause or later drift deliberately fails. Default tests omit
the full live-source comparison and loopback listener fixture unless opted in.
