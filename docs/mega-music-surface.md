# Mega Music identity surface (opt-in source)

`ACCOUNTS_MUSIC_ORIGIN=https://megamusic.developed.sk` activates a fixed secondary
origin in the central account process. Deploy only with the coordinated music
release documented in `mega-media-player/docs/managed-libraries.md`. It is not
currently an activation record.

Apply the additive `20260921163940_mega_music_native_clients.sql` first. Existing
KešTrek native clients become platform `android`; existing web clients remain
unchanged. The operator now accepts `platform=android|macos|ios`; replacement is
scoped to that product/platform. Register public music clients with exact callback
`sk.developed.megamusic://oauth/callback`. Platform-specific identifiers can share
that callback, but a different app cannot claim it. Generic native-callback
validation permits the two reviewed schemes; the registry additionally binds each
to its intended product.

The surface exposes account forms, session/CSRF bootstrap, confirmation/recovery,
profile/security and MFA. Central administrator/internal/token-broker routes are
not exposed there. Exact Host selection and Origin/CSRF checks remain mandatory.
Product cookies additionally encrypt the opaque central cookie using surface- and
purpose-specific AAD; neither portal nor trust-cookie parsing accepts them.
Provider tokens and administrative credentials remain server-side. The approved
music Caddy route fragment is in the music repository; do not proxy all portal
routes into a product domain.

The OAuth authorization facade validates the registered music client/callback,
creates the provider authorization transaction and displays consent on the music
origin. The issuer/token broker remain canonical. Portal launches use existing
OIDC browser-family binding, selected by `portal=1` in the fixed music launch URL;
direct product login stays on the music origin.

Registration continues to use `accounts.settings.registration_mode`; do not add
an independent product switch. A verified app-origin signup records
`accounts.product_registrations` and the server-only gate exposes
`app.activationRequested` for music. Login and the gate still enforce verification,
MFA, locks, app policy and provider session binding before the app can provision.
A portal signup has no music activation intent; the product requests first-entry
confirmation. Product activation is separate from central membership.

The gate also returns `app.unlimitedStorage` from protected core `SUPERADMIN`
status. This is the shared entitlement contract for future apps: use `null` for an
unlimited quota, continue counting usage, and preserve operational per-file limits.
No user metadata, submitted email or first-user rule grants this entitlement.
Existing apps must adopt it explicitly; this source change does not silently
rewrite their databases or app-local administrator roles.

The mail worker must be upgraded with the API: branded outbox entries carry the
embedded music logo and product sender display name. Existing central HTML/plain
text templates, four languages, expiry and no-tracking policies remain shared.
Account security and recovery still affect the whole ecosystem, which the copy
makes explicit. No second mail worker is started.

Verification: `npm test --prefix server/accounts`; additionally run
`ACCOUNTS_SQL_ISOLATED=1 node --test server/accounts/test/music-migration.test.mjs`
against its automatically created/disposed PostgreSQL container. Complete real
browser/OIDC/MFA and signed native-device callback acceptance before enabling the
surface on production. Neither unit tests nor a green health endpoint establish
that end-to-end cutover.
