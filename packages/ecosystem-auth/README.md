# DevelopED OIDC relying-party adapter

Server-only Node.js 22 ESM package. Uses pinned `openid-client` and `jose`; it
does not implement an authorization server, identity database or custom SSO
handoff protocol. Provider tokens must stay in the application's encrypted
server-side session storage. Browsers receive opaque host-only cookies only.

Register confidential GoTrue clients with
`token_endpoint_auth_method: "client_secret_post"`, exact HTTPS callback URLs,
and `authorization_code` / `refresh_token` grants. Installed GoTrue v2.189.0
cannot decode the standards-compatible form-encoding used by the maintained
library's `client_secret_basic`; the qualification report explains this tested
interoperability limitation. Do not change the installed library to work around
the provider.

```js
import { createOidcClient } from '@developed/ecosystem-auth';

const oidc = createOidcClient({
  issuer: configuration.issuer,        // operator config, not request input
  clientId: configuration.clientId,
  clientSecret: configuration.clientSecret,
  redirectUri: configuration.callbackUrl,
  store: {
    create: (id, transaction) => saveLoginTransaction(id, transaction),
    consume: id => deleteLoginTransactionReturningRow(id),
  },
});

const start = await oidc.begin('/library');
// Set __Host-app_flow=start.flowCookie; Secure; HttpOnly; SameSite=Lax;
// Path=/; Max-Age=600, then redirect browser to start.url.

const result = await oidc.complete(configuredCallbackWithIncomingQuery, flowCookie);
// Always clear flow cookie, including on errors. Recheck central eligibility
// using result.tokens.access_token BEFORE making a local app session.
// Persist tokens encrypted; return only an opaque local session cookie.
```

Store requirements:

- `create(id, transaction)` stores a hash-derived identifier, a ten-minute expiry
  and `{ state, nonce, verifier, returnTo, expiresAt }`. Encrypt this transaction
  at rest if sharing a database role; the verifier is a credential.
- `consume(id)` atomically deletes and returns the row, e.g.
  `DELETE ... WHERE id=$1 RETURNING ...`. A read then delete is not sufficient.
- Periodically delete expired unused transactions. Limit login initiation per
  source/account so abandoned flows cannot fill the database.
- Concurrent tabs using one flow cookie invalidate the older tab. Re-starting
  login is safe; do not relax state or cookie matching to accommodate it.

`complete()` returns `{identity, accessClaims, tokens, returnTo}` after checking
exact callback location, single-use transaction, state, nonce, ID token
signature/issuer/audience/expiry, and the access JWT's signature/issuer,
`aud=authenticated`, subject, `client_id`, and UUID `session_id`.

`refresh(refreshToken, expectedSubject)` returns `{tokens, identity?,
accessClaims}`. Serialize refreshes per app session (a row lock or equivalent)
and atomically store the rotated refresh token. Do not retain a stale token on
an ambiguous rotation failure; require a new login. The provider does not return
an ID token on refresh; verified access claims still bind the subject/client.

`userInfo(accessToken, expectedSubject)` calls the standard UserInfo endpoint
and checks its subject. Neither UserInfo nor JWT verification alone establishes
current app eligibility or global revocation. Use the central access check on
protected requests; local logout should revoke the local session. Central
logout/security changes must increment the user's central security version and
reject sessions older than `revoked_before`, regardless of JWT expiry.

The default static metadata uses the existing Supabase issuer paths and ES256
ID signing. Metadata can be supplied by the operator, with HTTPS endpoints
restricted to that issuer's origin. Do not auto-discover a browser-supplied URL.
`allowLoopbackHttp` is an explicit test-only option, allowing HTTP loopback URLs
only. HTTPS remains mandatory elsewhere.

## Checks

```sh
npm ci --ignore-scripts
npm test
node test/provider-qualification.mjs --isolated-docker --gateway
```

The opt-in qualification creates brand-new capped Docker containers and a
loopback-only Caddy test listener; it never accepts existing database/provider
targets, live credentials, or real email recipients. Required local images are
`postgres:17-alpine` and `supabase/gotrue:v2.189.0`; `caddy` is required with
`--gateway`. Normally every resource is removed after the run. `--keep` is only
for coordinated isolated SQL checks; it prints exact resource names, not keys.
Clean those named containers/network explicitly afterward.

The Caddy template is a qualification fixture, **not a deployable replacement
for the shared gateway**. See
[provider qualification](../../docs/ecosystem-provider-qualification.md).
