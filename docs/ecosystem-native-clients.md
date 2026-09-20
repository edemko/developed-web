# KešTrek Android central-login staging

The additive migration `20260920114956_developed_native_clients.sql` introduces
`accounts.oauth_clients`. Web and native clients have independent IDs, exact
callbacks, and enable switches while sharing one product entitlement. Existing
web mappings are seeded once. Runtime authorization and restrictive RLS consult
this registry, not the old single-client mirror in `app_settings`.

The web operator now writes both its compatibility fields and the canonical
registry. Replacing a client disables the old registry entry. Existing sessions
for that client are consequently denied by the central check and RLS. Client IDs
cannot be reassigned to another app or platform through either operator.

For Android, privately register a **public** GoTrue client with
`token_endpoint_auth_method=none` and only `sk.kestrek://oauth/callback` as its
redirect URI. Never put a web secret or an app server-check key in the APK.
Prepare a protected JSON file containing `appId: "app_kestrek"`, the actual
`clientId`, and `callbackUrl: "sk.kestrek://oauth/callback"`. With the scoped
central runtime configuration, run:

```sh
node dist/native-operator.js --input /protected/native-client.json
node dist/native-operator.js --input /protected/native-client.json --apply
```

The dry run makes no connection. Apply verifies the live private provider's
client type, authentication method, and exact sole callback before writing.
`--replace` is required to replace existing native configuration. No mode
publishes the app or activates its auth flags.

`POST /api/account/internal/session/check` returns the authenticated
`client: { id, kind }` in addition to user/app/security version. Native APIs must
require the exact configured native ID and `kind: "native"`. A valid token for
the web client, another product, or an unbound legacy session is not sufficient.

The browser authorization route alone permits the exact native callback scheme;
ordinary app tiles, registration redirects and profile links remain HTTPS-only.
State, nonce, S256 and single-use code checks still apply. Physical Android
browser return, signing compatibility and installed-app acceptance remain release
gates; protocol tests do not establish device behavior.
