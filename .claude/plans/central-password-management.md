# One DevelopED password: shared rule, managed only on developed.sk

**Status:** in progress (started 2026-10-12). Phases C0 and C1 done; A, V and O next.

## Context

Every DevelopED app signs in with the same central account (`developed-accounts`, source
`server/accounts/`, live at https://www.developed.sk). Erik's rule (2026-10-12):

1. One password serves all apps, so there is **one password rule**, and it lives only in central.
2. **Password management happens only on the developed site.** That covers choosing a password at
   signup, changing it, forgot/reset, admins setting a password, and invitations. Apps only link or
   redirect there; login itself is already central OIDC everywhere.

Erik's decisions, given in the session:

- **AMP signup moves to developed.sk.** AMP's Sign up and its invitation links go to central
  `/register?app=airsoft`. The embedded registration API and the app-hosted password change are
  removed afterwards.
- **myclinic is exempt.** It keeps its own Supabase accounts, signup, invites and patient logins.
  It is not part of this project. Record the exemption in docs (Phase D).
- **Admins bring people in through central invitations.** Central's invitation flow (airsoft-only
  today) is extended so Vocabulum teachers and otazkomat organisation admins invite by email from
  the app. The invitee sets the password on developed.sk.
- **The branded Mega Music pages stay.** `megamusic.developed.sk` serves central's own password
  pages; that counts as the developed site. Only Mega Music's legacy password code is deleted.

### Audit findings (2026-10-12, origin/main of every repo)

- **Central rule:** `src/security.ts:55` `password()`. 6–128 characters since release `ae87c89`
  (checkpoint `deploy/password-policy-checkpoint-20261012.md`). Copies in `public/app.js`
  (`minLength: 6` ×3) and `public/i18n.js` `passwordHelp` ×4. Login uses `passwordInput` (1–128).
  The rule is not exposed to clients.
- **GoTrue v2.189.0** (`developed-auth-green`) rejects passwords over **72 bytes** ("bcrypt:
  password length exceeds 72 bytes"). The central maximum of 128 characters is therefore wrong.
- **Central password surfaces:**
  - `/register`, `/forgot-password`, `/reset-password`, profile change, admin set-password and
    send-reset, admin invitations;
  - the embedded registration API `/api/account/registration/*` (CORS, used by AMP);
  - the app-hosted `/internal/profile/password` (`product-profile.ts`, airsoft only).
- **Invitations** (`accounts.ts` `credential()`): an invitation without an app links to central
  `/register#invitation=`. An airsoft invitation links to AMP `/{lang}/signup#invitation=`. Admin
  invitations accept only `app=airsoft`.
- **After email verification**, `consumeCredential` returns `/login?app=<slug>`, and login then
  launches the app. Central `/register` (UI and API) does **not** accept an app today; only the
  embedded API passes one.
- **Airsoft needs no SMS step at signup:** `register()` notes that phone verification happens later
  in AMP.
- **Production gate:** `deploy/assert-central-runtime.mjs` refuses to start mega-music, screentime,
  kestrek, otazkomat, airsoft and vocabulum unless `ECOSYSTEM_AUTH_ENABLED=true` and the legacy
  secrets are absent. Legacy password code in those apps is therefore dead in production. AMP and
  Vocabulum env files were checked: both `"true"`.
- **App status:**

  | App | Status |
  |---|---|
  | AMP | **Violates.** Own signup form (`central-signup-form.tsx`, min 15) through the embedded API, and own change-password (`account-details.tsx:173-178`, `lib/account-schema.ts:8` min 15) through `/internal/profile/password`. Messages sk/cs/uk say 15. Legacy Supabase forms are dead code. |
  | Vocabulum | **Violates.** `/forgot-password` falsely reports "email sent", `/reset-password` errors, and `/change-password` crashes (`adminUpdateUser` throws). `/api/v1/auth/change-password` returns 502. The admin set-password dialog, create-user and CSV import are visible and fail. `mustChangePassword` would lock users out; there are 2 memberships, both `false`, but the column defaults to true. |
  | otazkomat | Legacy routes return 409 under central. The admin "Zmeniť heslo" button and the invite form are still shown and fail. |
  | kestrek | Every legacy route returns 403 under central. The central-mode login has no "forgot password" link, and `/forgot-password` goes to central *login*. Dead legacy code remains (backend, web, Flutter). |
  | screentime | Compliant; a dead legacy `signInWithPassword` branch remains. |
  | mega-music | Legacy handlers return 409 under central. Dead legacy UI and code remain. Branded central pages are kept. |
  | karak2 | Compliant. |
  | myclinic | Exempt. |

## Ground rules

- Read `~/.claude/CLAUDE.md`, `server/accounts/deploy/AGENTS.md`, and each app repo's
  `AGENTS.md`/`CLAUDE.md` before editing it.
- **Central releases** follow `deploy/password-policy-checkpoint-20261012.md`:
  - Branch from the **live** release, not `main`; `main` has about 750 lines of unreleased central
    work. Name it `release/<topic>-<yyyymmdd>`, then cherry-pick each commit onto `main` from a
    separate worktree. The main checkout has another session's uncommitted SMS files; never stage
    them.
  - Build and test on Node 24 (`npm ci && npm test` in `server/accounts`).
  - Stage the release as a copy of the live release with only the changed `dist/` and `public/`
    files replaced. Prove that `diff -r` against the build is empty.
  - Make a new mail-worker bundle when any hashed module changes (`mail.js`, `db.js`,
    `security.js`, `mail-templates.js`). For the API release, update `API_RELEASE` and the
    override hash.
  - Cut over in this order: stop the worker → switch `current` → restart the API → repoint the
    worker drop-in → start the worker.
  - Write a checkpoint doc.
- **App repos:** a push to `main` deploys (developed-release, auto, Node 24.21.0). Migrations under
  `supabase/migrations` block the deploy until applied by hand. Apply them only through the Supabase
  reference procedure (`~/workspace/docs/features/supabase-platform-reference.md`), one schema,
  inside a transaction.
- **Order matters.** Central must accept the new flows before any app depends on them (C1 before A,
  V, O), and the old central APIs are removed only after no app calls them (C2 after A).
- Never print secrets; check flags with `grep -c`.

---

## Phase C0: Shorter minimum (done 2026-10-12)

Release `ae87c89` sets the minimum to 6, live since 11:06. See its checkpoint.

## Phase C1: Central accepts the new flows (additive; old APIs keep working)

Branch `release/central-password-<date>` from the live release (`ae87c89…`). Work in a worktree
under `~/.cache/`.

1. **`src/security.ts`: one rule, byte-capped.** Export it and use it everywhere.
   ```ts
   export const PASSWORD_POLICY = Object.freeze({ minLength: 6, maxBytes: 72 });
   export function password(value: unknown): string {
     if (typeof value !== 'string' || value.length < PASSWORD_POLICY.minLength
       || Buffer.byteLength(value, 'utf8') > PASSWORD_POLICY.maxBytes) return fail(400, 'weak_password');
     return value;
   }
   ```
   Keep `passwordInput` (1–128) for login.
2. **Expose the rule.** Add `passwordPolicy: PASSWORD_POLICY` to the JSON of `GET /session` and
   `GET /registration/session` (http.ts).
3. **`public/app.js` reads the rule.**
   - `newPasswordFields` and the register and admin password fields use
     `minLength: session.passwordPolicy.minLength, maxLength: session.passwordPolicy.maxBytes`.
   - `passwordHelp` in `public/i18n.js` (four locales) becomes a template with `{min}`, e.g. "Use at
     least {min} characters…". Fill it where it is shown.
   - Add i18n `weakPassword` text if missing: "Use {min} to 72 bytes (about 72 letters; fewer with
     accents or emoji)."
4. **`/register` accepts an app.**
   - In http.ts, `if (path === '/register')` becomes
     `accounts.register(data, data.app ? (await accounts.registrationApp(data.app)).app_id : null)`.
   - In `registerPage()` (app.js:442), read
     `const appSlug = new URLSearchParams(location.search).get('app')`. Validate it with
     `/^[a-z0-9-]{1,64}$/` and send `app: appSlug` in the POST body.
   - When an app is given, `loginUrl` becomes `/login?app=<slug>`. The invited-complete link and
     the verification path already return `/login?app=` from `consumeCredential`.
5. **Invitations go to central and may target any open app.**
   - In `accounts.ts` `credential()`:
     - delete the airsoft-only check and the AMP route;
     - for an invitation with `returnAppId`, look the app up as today (published, not closed,
       ACTIVE);
     - the link is always `${this.config.origin}/register?app=${slug}#invitation=${raw}` (no
       `?app=` without an app);
     - drop the `invitationOrigin`/`invitationPath` mail override.
   - In `http.ts` `/admin/invitations`, remove `target.slug !== 'airsoft'`.
   - In `app.js:798`, list every published, non-closed app as an invitation target.
6. **Accepting an invitation grants access to its app.**
   - In `register()`, make the invitation `update … returning token_hash` also return
     `return_app_id`.
   - After the account is created, inside the final transaction, when the invitation had an app,
     insert:
     ```sql
     insert into core.app_access(id,user_id,app_id,role) values($1,$2,$3,'USER') on conflict(user_id,app_id) do nothing;
     insert into accounts.entitlements(user_id,app_id,plan,source) select $2,$3,a.free_plan,'invitation'
       from accounts.app_settings a where a.app_id=$3 on conflict(user_id,app_id) do nothing;
     ```
     Check the `source` values the `entitlements` table allows first; add a migration only if
     `'invitation'` is rejected.
7. **App-initiated invitations:** `POST /api/account/internal/invitations` in `http.ts`, next to
   `/internal/profile/*`.
   - The header is `Authorization: Bearer <app server key>` and the body is
     `{ accessToken, email, language? }`. `accessToken` is the inviting admin's central access token.
   - Implement it in a new `src/app-invitations.ts`:
     ```ts
     export async function appInvitation(a: Accounts, serverKey: string, body: Row) {
       const checked = await a.internalCheck(serverKey, body.accessToken);   // app + acting user
       if (checked.client.kind !== 'web') return fail(403, 'forbidden');
       const address = email(body.email), lang = language(body.language);
       await a.db.limit(`app-invitations:${checked.app.id}:${checked.user!.id}`, 100, 3600);
       await a.db.limit(`app-invitations:${checked.app.id}`, 500, 86400);
       const app = await a.registrationAppById(checked.app.id);               // published, not closed, ACTIVE
       const [existing] = await a.db.query('select id from auth.users where lower(email)=$1', [address]);
       await a.db.tx(async q => {
         if (existing) await a.grantAppAccess(q, existing.id, app.app_id, 'invitation');
         else await a.credential(q, null, address, 'invitation', lang, app.app_id);
         await a.db.audit(q, checked.user!.id, existing?.id ?? null, 'app_invitation', 'succeeded', { appId: app.app_id });
       });
       return { accepted: true };   // same answer for new and existing addresses: no account enumeration
     }
     ```
     Factor `grantAppAccess(q, userId, appId, source)` out of step 6, and `registrationAppById` out
     of `registrationApp`.
   - The app decides who may invite (teacher, org admin) before calling. Central only
     authenticates the app and the actor.
8. **Tests** (`test/`, node:test against `dist/`):
   - extend `password-policy.test.mjs`: 72 bytes passes, 73 fails, and so does
     `'é'.repeat(37)` (74 bytes);
   - invitation link: any open app gives central `/register?app=<slug>#invitation=`, and a
     closed app gives `invalid_invitation_target`;
   - invited registration grants `core.app_access` and an entitlement;
   - `/register` with an `app` from `registrationApp`;
   - `appInvitation`: existing vs new address, same response, and rate limits.

   Follow the existing patterns in `test/invitation.test.mjs` and `test/database.test.mjs`. Update
   `music-browser.test.mjs` if the `minlength` source changes, and the browser test that drives
   `/register`.
9. **Release:**
   - Commit, build, test (all pass, same skips), and stage as in the ground rules.
   - The changed artifact files are expected to be `dist/{security,accounts,http,app-invitations}.js`
     and `public/{app,i18n}.js`.
   - Make a mail-worker bundle with the new `security.js` hash. If `mail-templates.js` changed,
     add its override too; it should not change.
   - Cut over, then verify:
     - health is 200;
     - `/session` shows `passwordPolicy`;
     - `/register?app=airsoft` renders;
     - the AMP embedded signup still works (`OPTIONS`/`GET /api/account/registration/session?app=airsoft`
       with Origin `https://amp.developed.sk` → 200/204).
   - Cherry-pick onto `main`, push, and write `deploy/central-password-c1-checkpoint-<date>.md`.

## Phase A: AMP stops handling passwords (repo `~/Dev/airsoft-marketplace`, deploys on push)

Prerequisite: C1 is live.

1. **Signup:**
   - `app/[locale]/(auth)/signup/page.tsx` renders a small client component that runs
     `location.replace(`${ECOSYSTEM_ORIGIN}/register?app=airsoft${location.hash}`)`. The
     `#invitation=` fragment never reaches the server, so this must be client-side. Show a
     link with the same target for no-JS.
   - Delete `central-signup-form.tsx` and `lib/ecosystem-registration.ts`'s
     `centralRegistrationEndpoint` (keep the flag check if other code needs it).
2. **Change password:**
   - In `components/dashboard/account-details.tsx:173-178`, replace the password form with a link
     "Change password on DevelopED" → `/api/auth/ecosystem/profile` (it already redirects to
     central `/profile`).
   - Remove `password` from `lib/account-schema.ts`, from `app/api/account/[action]/route.ts`, and
     from the `lib/ecosystem-core.mjs` action allow-list (`:134`).
   - Keep the email change for now; it only re-confirms the current password.
3. **Delete dead legacy password code:**
   - `legacy-signup-form.tsx`, `app/api/auth/signup/route.ts`, `createAirsoftUser` and
     `assertLocalSignupAllowed` (`lib/supabase-admin.ts`) if they are unused afterwards;
   - `legacy-login-form.tsx`, `legacy-forgot-password-form.tsx`,
     `legacy-reset-password-form.tsx`;
   - the legacy password block of `components/dashboard/settings-form.tsx:49-66,97-110`.

   `forgot-password/page.tsx` and `reset-password/page.tsx` keep only their central redirect.
4. **i18n** (`messages/{sk,cs,uk,en}`): delete `auth.passwordHelp`, `auth.errors.weak_password` and
   `dashboard.passwordHint`/`passwordTooShort`/change-form labels. Add `dashboard.changePasswordOnDeveloped`.
5. **Tests:**
   - update `tests/account-schema.test.mjs`, `tests/ecosystem-registration.test.mjs` (assert the
     redirect and the kept `#invitation`), `tests/ecosystem-browser.test.mjs:145-164,202` and
     `tests/ecosystem-auth.test.mjs:160-188`;
   - run the repo's full test and build steps (see `apps/airsoft.json` `steps`) on Node 24.
6. Commit on `main` and push; this deploys. It is also the **first real Node 24 auto-deploy**
   (Node 24 plan, Phase 5), so watch `journalctl --user -u developed-release-poll -f`. Verify:
   - `/sk/signup` lands on central register with `?app=airsoft`;
   - an invitation link carries its fragment;
   - account settings show the central link.

## Phase C2: Central removes the old app password APIs

Prerequisite: Phase A is live, and AMP's access log shows no `/api/account/registration/*` or
`/internal/profile/password` calls for 24 h:
`sudo journalctl -u developed-accounts --since -24h | grep -c registration/` should be 0, or Caddy
logs if the API does not log paths.

1. **`http.ts`:** delete the `registrationPath` block and `registrationCors`, along with
   `accounts.registrationSurface` and the `sms/start|verify` registration handlers if unused
   elsewhere. Check `accounts.sms` users first: `register()` still consumes `body.phoneChallenge`
   only from the embedded API. Delete that branch too.
2. **`product-profile.ts`:** remove the `password` action; `email` stays. Drop `password` from the
   `/internal/profile/(…)` route regex.
3. Update or delete the tests for the removed paths, then release as in C1 and write a checkpoint.

## Phase V: Vocabulum (repo `~/Dev/vocabulary-builder`, deploys on push; has migrations)

Prerequisite: C1 is live.

1. **Redirects:**
   - `/forgot-password` and `/reset-password` → central `/forgot-password`;
   - `/change-password` → central `/profile`.

   Do this in `middleware` or in the pages. Delete their server actions and the Mailjet reset path.
2. **`mustChangePassword`:** when central auth is on, ignore it. That means the JWT callback in
   `lib/auth.ts:259` and the redirect at `:190-198`, `lib/permissions.ts:13`, and
   `lib/api-v1/principal.ts:76`. Add a migration that sets the column default to `false` and
   updates existing rows to false. There were 2 rows, both false, on 2026-10-12.
3. **API:** `app/api/v1/auth/change-password/route.ts` returns 410
   `{ error: 'CENTRAL_ACCOUNT_REQUIRED', url: '<central>/profile' }`; remove it from `openapi.ts`.
4. **Admin onboarding through central invitations:**
   - Add a migration for `voc_builder.pending_memberships(email citext primary key, role text,
     organisation_id uuid null, invited_by uuid, created_at timestamptz default now())` with the
     same grants and RLS style as `memberships`.
   - Replace `createUser` / the create-user form and the CSV import confirm with:
     1. upsert the pending membership;
     2. call central `POST /api/account/internal/invitations` with the teacher's access token
        (the server-side session already holds it for OIDC).
   - Delete the generated-password code paths and the admin set-password dialog
     (`components/users/user-details-tab.tsx:130,384-511`). Link to central `/admin/users` for
     superadmins.
   - In the OIDC membership claim (`voc_builder.claim_oidc_refresh` /
     `20260920123043_ecosystem_oidc_sessions.sql:56`), when a pending membership matches the
     verified email, use its role and organisation, then delete it. Do this in a new migration
     replacing the function body.
   - Students without a real email (`…@voc-builder.local`) cannot be invited. A superadmin uses
     central admin set-password or sets a real email. Document this.
5. Delete the legacy register and login forms, `MIN_PASSWORD_LENGTH`/`MAX_PASSWORD_BYTES`, and the
   admin-mutation helpers in `lib/supabase-auth.ts` that become unused.
6. **Flutter** (`apps/flutter`): `change_password_screen.dart` already links out. Remove the local
   form and `< 8` check in a later app release. Older builds get the 410.
7. Run the tests (`vitest`, `tsc`) and the deploy steps on Node 24, then apply the migrations by
   hand, then push.

## Phase O: otazkomat (repo `~/Dev/otazkomat`, deploys on push)

Prerequisite: C1 is live.

1. **Frontend:**
   - in central mode, remove the admin "Zmeniť heslo" (`UserList.js:237`,
     `UserDetailsModal.js:261`, `ChangePasswordModal.js`, `UserManagement.js:120,546`);
   - rewire `AddMemberModal.js:96` to the new backend invite route.
2. **Backend:**
   - `routes/organizations.js:818-822,974-991`: the invite stores a pending org membership (an
     existing table, or a migration like V.4) and calls central
     `POST /api/account/internal/invitations` with the admin's access token;
   - on OIDC login, claim pending memberships by verified email;
   - delete the legacy password routes (`routes/auth.js:258,377,739-743,844,923`,
     `routes/users.js:17,485`), their validation and the `user_password_resets` usage.
3. Update the tests (`ecosystemRegistration`, `contentValidation:165-180`,
   `frontend/test/ecosystem.browser.mjs`) and `CLAUDE.md`/`AGENTS.md`, which still describe
   Supabase password login.

## Phase K: kestrek (repo `~/Dev/kestrek`, deploys on push)

1. **Web:**
   - in central mode, add "Forgot password?" on the login screen →
     `/api/auth/ecosystem/recovery`, or central `/forgot-password` directly;
   - `/forgot-password` and `/reset-password` routes → central `/forgot-password`, not login.
2. **Backend:** delete the `AuthController` legacy routes (`register`, `password-reset/*`,
   `verify-email/*`), `PUT users/password`, `changePassword`/`changeOwnPassword`, the reset mail
   template and its toggle, and `NEW_PASSWORD_MIN_LENGTH`. Keep `ecosystem/*`, `me`, `check` and
   `logout`.
3. **Web:** delete the register, forgot-password, reset-password and verify-email pages, the profile
   password card, and their i18n keys.
4. **Flutter:**
   - default `ECOSYSTEM_AUTH_ENABLED` to true (`app_config.dart:25`);
   - delete the register, forgot and reset screens.

   Ship it with the next app build; a backend push does not need it.
5. **Tests:** remove or rewrite the reset and register specs; add redirect tests.

## Phase S and M: screentime and mega-music cleanup (deploy on push)

- **screentime:** delete the legacy `signInWithPassword` branch (`web/app/page.tsx:200-290`) and its
  test assertion (`web/tests/ecosystem.test.mjs:23`).
- **mega-music:**
  - delete the legacy handlers `server/accounts/index.mjs:262-330`, `strongPassword`
    (`security.mjs:47-52`), the legacy UI tabs and reset panel (`public/index.html:46-58`,
    `public/app.js:128,262-277`), `passwordHint`, and their tests;
  - keep the branded central routes in the Caddyfiles;
  - fix `CLAUDE.md:9` ("Central SSO remains off").

## Phase D: Docs

- `server/accounts/README.md`: one password rule, `PASSWORD_POLICY`, app invitations API, and the
  myclinic exemption.
- Each app's `AGENTS.md`/`CLAUDE.md` gets: "Password management only on developed.sk; never add
  password forms."
- `~/workspace/docs/`: a recipe for the policy, then run `ws-backup`.

## Verification (definition of done)

- `git grep` across the seven repos finds no password form, password-setting API call or length rule
  outside central. myclinic is exempt.
- Central `/session` exposes `passwordPolicy`; its UI uses it; 73-byte passwords are refused with
  `weak_password`.
- AMP signup and invitations end on central `/register?app=airsoft`. A new AMP account returns to
  AMP after verification, and an invited one after login.
- A Vocabulum teacher and an otazkomat admin can invite by email. The invitee registers on
  developed.sk and lands in the class or organisation with the right role.
- The C2 removal is live with no app errors in 24 h.

## Execution log

### 2026-10-12

- **C0:**
  - central `ae87c89` is live, minimum 6, mail-worker bundle `mail-workers/ae87c89…`;
  - `main` eb1389c and a549730 (checkpoint);
  - Erik's decisions recorded above.
- Three read-only audits (AMP and Vocabulum; kestrek and myclinic; the rest plus central) give the
  findings above. Central auth flags were confirmed on for AMP and Vocabulum.
- **C1** live at 11:21:55 as release `9fde1f13808d…` (branch `release/central-password-20261012`).
  See `deploy/central-password-c1-checkpoint-20261012.md`.
  - **Deviation:** invitation links stay `/register#invitation=…` with no `?app=`. The mail
    templates reject a query string in credential links, and changing `mail-templates.js` would
    move a mail-worker pin. The invitation preview returns the app instead.
  - Entitlement source is `manual`, because the check constraint has no `invitation`.
  - Verified after cutover: `passwordPolicy` in both session payloads; the UI reads it;
    `/register?app=airsoft` returns 200; the AMP embedded session still returns 200; the internal
    invitations route returns 401 without a valid app key; ALL-HEALTH matched.

