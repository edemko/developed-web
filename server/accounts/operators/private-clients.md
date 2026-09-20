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

## Private checkpoint — 2026-09-20 15:41 UTC

Following coordinated authorization, source operator commit `5185fff` created
eight clients through the protected green provider: seven confidential web
clients and one public KešTrek Android client. Each creation passed exact GET
read-back. All eight IDs, seven confidential secrets and seven random server-check
keys are distinct. Primary/backup credential copies match; every file is
root-owned0600 in its root0700 directory. All eight `.attach.json` inputs passed
the existing central operators' offline validation. Client IDs/keys remain in
those private files; no credential values are recorded in Git.

Provider dynamic registration is false and issuer remains
`https://sam-api.developed162.bid/auth/v1`. At this checkpoint the canonical
central client registry still has zero rows; attachment is coordinated separately
after the closed catalog seed. Published, enforce-OIDC and non-closed app-policy
counts are zero, and registration remains closed. No app/browser configuration,
public route, APK, identity user or mail operation was changed by this staging.

Verification: TypeScript build and default account suite passed (73 passed,
14 opt-in skips, zero failures). This includes 11 focused registration/durability
and central authorization tests. The latter explicitly reject plain/missing PKCE,
wrong user/callback, unregistered clients, missing nonce/openid and unapproved
scopes before any provider consent/token call. No retained qualification fixture
or user identity was mutated by the tests.

## Central attachment checkpoint — 2026-09-20 15:55 UTC

After the seven closed catalog rows and nine reviewed app migrations were
applied, the coordinator authorized private attachment. Fresh preflight confirmed
all seven rows had the exact catalog slug/launch URL, null client ID, null key
hash and null callback, with publication/reporting/enforcement false and join
policy closed. The central registry was empty; all eight private provider
registrations matched their protected inputs. Registration remained closed and
mail disabled.

The immutable release `/opt/developed-accounts/releases/c561a81` supplied both
existing attachment operators; their bytes matched the reviewed built source.
The root Node22.23.2 process loaded `/etc/developed-accounts/accounts.env` privately
and each operator used the required `developed_accounts` database role. All eight
inputs were validated first. Each exact empty web seed was rechecked and attached
using `--apply --replace`, then the KešTrek public native mapping was attached
using `--apply`. No existing client or nonempty credential configuration was replaced.

Read-only verification confirmed eight enabled central mappings (seven web, one
native), exact app/kind/callback bindings, and all seven compatibility client IDs,
launch URLs and server-key hashes matching the protected files. The provider still
has exactly eight clients. The existing operators recorded seven successful
`operator_app_configuration` and one successful `operator_native_configuration`
audit entries. An initial audit-count query used the nonexistent name
`accounts.audit_events`; the corrected query against implemented `accounts.audit`
succeeded without any write or retry of attachment.

All seven apps remain unpublished, unreportable, unenforced and join-closed;
registration remains closed and mail disabled. This did not change product env
files, browser bundles, public routes, identity users or APKs. Protected credential
and backup paths above remain the inputs for separately coordinated app staging.
The earlier `.verified.json` registration records intentionally retain their
historical `centralAttached:false` value; this checkpoint and the live central
registry record the subsequent attachment. Do not rerun registration or attachment
as a status check.
