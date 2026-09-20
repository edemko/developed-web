# Private provider client staging

`register-private-clients.mjs` creates only the seven exact web clients from the
hash-pinned `launch-catalog.json`, plus KešTrek Android. Vocabulum native is not
included. Registration is separate from central attachment and product rollout.
It never updates users, central policies, application configuration or public routes.

The exact GoTrue v2.189.0 [registration handler](https://github.com/supabase/auth/blob/v2.189.0/internal/api/oauthserver/handlers.go)
returns a confidential secret only on creation. Each web registration has its
sole exact manifest callback, confidential `client_secret_post` authentication,
authorization-code and refresh grants, and code responses. Android is public,
uses `none`, has no secret or server-check key, and accepts only
`sk.kestrek://oauth/callback`. All registrations are manual. Keep provider dynamic
registration disabled.

The tagged [authorization handler](https://github.com/supabase/auth/blob/v2.189.0/internal/api/oauthserver/authorize.go)
requires PKCE but accepts both S256 and plain. There is no per-client S256 flag.
Our adapters send S256 and `src/accounts.ts` rejects non-S256 authorizations before
calling provider consent/details. Public provider consent must remain inaccessible.
Client registration is not proof of browser/device acceptance or full cutover.

Default `--client mega-music-web` validates offline without files or network.
`--check` performs read-only private preflight. `--apply` creates just that client.
Other allowed names are `kestrek-web`, `screentime-web`, `airsoft-web`,
`vocabulum-web`, `odonto-web`, `otazkomat-web`, and `kestrek-android`.

Both connected modes require root, existing root0700 directories
`/etc/developed-accounts/client-staging` and
`/var/backups/developed-accounts/client-staging`, and the existing root0600
`/etc/developed-accounts/accounts.env`. Only the fixed private provider
`http://127.0.0.1:3141` is accepted. No credentials go in argv or stdout. The backup
directory is separate from DB backups and repository/release artifacts; it remains
on-host and does not establish an off-host disaster-recovery copy.

Before the single POST, primary and backup `.started.json` markers are exclusive
created and fsynced along with their directories. Any marker/existing output
blocks another apply. The one-time provider response and independently random
32-byte web server-check key are immediately written into exclusive0600
`.credentials.json` files at both locations, before validation and GET read-back.
Successful validation then writes `.attach.json` inputs and a primary
`.verified.json` checkpoint. Existing provider names/callbacks are refused.
There is no retry, update, regeneration, delete or automatic rollback mode.

After an interruption, inspect protected markers, credentials and provider
metadata. A network error can mean creation succeeded. Never delete the marker
and repeat POST blindly. If the secret response was lost, coordinate explicit
reconciliation/rotation; the operator intentionally provides no implicit recovery.

After the closed catalog seed is ready, the coordinator can supply each web
`.attach.json` to the existing `dist/operator.js --input ...` (validate first,
then `--apply --replace` only for the reviewed empty closed seed rows).
KešTrek native `.attach.json` goes to `dist/native-operator.js --input ...`, validate
then `--apply` after the web mapping exists. Load the existing private central
environment without printing it, use the scoped DB role, and keep publication,
join policy, mail, registration and enforcement off. Attachments contain no web
client secret; app runtime staging must privately read each corresponding
`.credentials.json` later. Neither file is an APK/browser build input. Only the
public native client ID may be put in the Android build.

Tests use mock provider responses and temporary synthetic files only:
`node --test server/accounts/test/private-client-operator.test.mjs`.
