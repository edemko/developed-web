# SMS Gate v1 audit — 2026-10-11

Scope: DevelopED Accounts, Airsoft Marketplace, Svet pečenia and My Clinic
in `/home/openclaw/Dev`. Central registration and profile verification are
separate sending paths and were both checked.

Promile Club is a customer-owned application and is excluded from this work.
All changes made to Promile Club during the initial audit were reverted at the
owner's request; its working tree was verified clean. No changes were deployed.

## Reference and sender policy

Reviewed the local provider manual `~/Downloads/sms-gate-api.zip`, entry
`sms-gate-api/sms-gate-api-v1.html`, particularly JSON sections 1.1 (auth),
1.3 (send_message), 1.4 (check_message) and 1.5 (callbacks).
Archive SHA-256: `4f7d5a92a76cea67ac8d3c7e11c06581f4aa4b8bcf58de57a066cf6427c1327e`.
The archive itself is not copied into the repository because it includes
account-specific portal content.

Only `https://api.smsgate.sk/json/...` is approved. Contrary to the old repository
notes, v1 documents an optional **`from`** parameter. Omitting it selects the
provider account default. Per the owner's instruction, the in-scope applications leave
it omitted and use **MyClinic** for now. `sender` is not a documented parameter.
No request to the deprecated v2 API is introduced or retained in application
sending paths. Airsoft's existing inbound legacy callback parser remains for
receipts; it makes no v2 API calls.

## Corrections

| Application | Changes |
| --- | --- |
| DevelopED Accounts | Profile status polling uses a form POST. Profile and registration sends require individual acceptance and a usable message ID, rejecting contradictory results. Provider `ERROR` remains pending because SMS Gate retries it. |
| Airsoft Marketplace | Send, auth and status calls use form POSTs. Per-message acceptance is required; explicit errors cannot be overridden by `OK`. Auth requires a session ID. No automatic send retries. |
| Svet pečenia | Send/auth use bounded form POSTs, validate individual message results and return sanitized failures. `callback=true` replaces the unsupported per-send callback URL. Admin help in EN/SK/UK explains that the saved URL is only a reference and must also be configured in the provider portal. |
| My Clinic | Existing form POST and safe retry classification retained. Redirects are rejected. Missing/unsafe accepted message IDs are ambiguous, explicit errors win over conflicting codes, auth requires a successful result plus session ID, and status parsing includes documented `PROCESSING`/`READ`. |

POST bodies are UTF-8 `application/x-www-form-urlencoded`, not JSON bodies.
GET is only available when enabled on the API key and was removed from outgoing
application requests. Credentials, recipients and SMS bodies stay out of URLs.

A successful `result` alone does not prove message acceptance: `messages[]`
can contain individual errors. Accepted is not delivered. Only `DELIVERED`
proves SMS delivery; `SENT` means submitted to the SMS centre. A delivery timestamp
alone is insufficient. `ERROR` is retried by SMS Gate up to five times in
60 minutes. The callback example's numeric `status=4` has no documented mapping
and is never interpreted as delivered.

The callback parameter is a boolean. Its destination must be configured in the
SMS Gate portal for the relevant API credentials. These changes do not modify
provider portal configuration. My Clinic retains bounded retries for definite
rejections such as HTTP 429; ambiguous sends are never automatically retried.

## Verification

All provider requests and database operations in the tests use fixtures/mocks.
No live SMS was sent, no credentials were changed and no database migration or
production deployment was performed.

- DevelopED Accounts: full suite, 175 passed, 23 opt-in integration tests skipped;
  TypeScript build passed. After the final parser tightening, all 11 focused
  profile/registration tests passed again.
- Airsoft Marketplace: SMS transport and callback tests passed (11 transport,
  5 callback); callbacks retain their existing inbound compatibility.
- Svet pečenia: full suite, 50 passed; TypeScript check and ESLint on changed
  TypeScript files passed.
- My Clinic: full backend suite, 905 passed; complete headless frontend suite,
  317 passed. Backend lint has zero errors and its recorded 205 legacy warnings.
- Whitespace validation passed in all four in-scope repositories.

The DevelopED Accounts changes were committed and pushed to `main` on
12 October 2026. Before committing, its TypeScript build and full suite passed
again: 183 tests passed, 24 optional tests skipped. This commit/push did not
deploy the SMS changes; central releases are manual. The other repositories'
commit/deployment status was not rechecked in this follow-up. Actual live
delivery has not been established by this source audit.
