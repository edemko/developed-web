# Fixed Otázkomat PostgREST schema exposure correction

The gateway acceptance matrix found `PGRST106` / HTTP 406 for both the scoped
Otázkomat backend and a cross-app backend: the running PostgREST schema list
omitted `otazkomat`. This is a configuration correction, not additional grants.
Human central SSO remains unexposed throughout this operation.

## Reviewed scope

`append-otazkomat-postgrest.mjs` adds only `otazkomat` to the exact existing nine
schemas through the database-scoped `authenticator` role setting, preserving
unrelated role settings. PostgREST v14.12 uses in-database configuration by
default. Both `reload config` and `reload schema` notifications are required;
neither restarts the shared REST process.

The CLI-generated migration
`20260920202204_otazkomat_schema_migrations_rls.sql` enables RLS only on the
administrative ledger. Its exact SHA-256 is pinned in the operator. The ledger
has no app/anon/authenticated grants, triggers or policies. Owner and BYPASSRLS
administration remain available; non-BYPASS broad administrative roles no longer
bypass that ledger's RLS. No grants, policies, app rows, functions or provider
flags change. The existing 13 deployment-ledger entries are not replayed or
modified. Traceability is the exclusive root before/attempt/verified record with
the exact migration filename and hash, rather than an unrelated app-ledger insert.

The preflight checks all 34 Otázkomat relations and scoped role schema privileges.
The transaction compares complete selected catalog metadata before changing it,
and compares the exact expected result before commit. It uses short lock and
statement timeouts, a scoped advisory lock, a pinned superuser session/database,
`pg_catalog` search path and suppressed SQL/parameter logging.

## Reviewed operator sequence; coordinator approval required

1. Install the committed operator and adjacent pinned migration into a new,
   root-owned immutable directory under `/opt/developed-control/`. Never execute
   the developer-owned source as root. Run its `--stage` using the pinned Node 22
   runtime. Staging is read-only for the database and source environment file.
2. Staging exclusively creates
   `/var/backups/developed-postgrest-exposure-20260920/` (root 0700) and protected
   `before.json` / `proof.json` files (0600). They can include private unrelated
   role settings and must not be printed.
3. The coordinator preserves the original complete environment file as
   `source.env` in that backup directory, root 0600, fsynced. As its existing
   developer owner, use `apply_patch` on
   `/home/openclaw/Dev/supabase/docker/.env`, changing only the exact unquoted
   `PGRST_DB_SCHEMAS` line by appending `,otazkomat`. Do not print the environment,
   change its owner/mode, or commit this ignored file. The operator independently
   checks both full-file hashes and exact byte preservation of every other line.
4. Run the same immutable operator with `--apply`. It requires the original
   container ID/PID/start time and unchanged staged metadata. It creates the
   exclusive attempt proof before the transaction and verified proof afterward.
   A failed or ambiguous attempt must be reconciled, never blindly replayed or
   rolled back to a legacy public backend.
5. Repeat the existing read-only public gateway matrix:

   ```sh
   sudo env -i PATH=/usr/bin:/bin /opt/developed-runtimes/node-v22.23.2/bin/node \
     /opt/developed-control/gateway-acceptance-1c0502b/gateway-public-acceptance.mjs \
     --verify-after-tunnel /etc/developed-accounts/gateway-acceptance-input.json
   ```

   All 50 checks must pass: scoped own-data HEAD 200, cross-app HEAD 403, generic
   Auth and old service-role denials, public metadata/JWKS positives and protected
   Studio redirect. No product data writes or real-user login are involved.
   Confirm the shared REST PID/start time is unchanged and human SSO is still off.

The durable source change aligns future container recreation with the database
setting; the current process intentionally retains its original environment.
The operator's `verified.json` establishes committed metadata, not asynchronous
HTTP propagation; the gateway matrix establishes the latter.

## Verification

Run `node --test server/accounts/deploy/append-otazkomat-postgrest.test.mjs`.
The opt-in `POSTGREST_EXPOSURE_SQL_TEST=1` fixture uses only two explicitly labelled
network-none disposable containers with synthetic credentials and shared Unix
sockets, never the live database or a host TCP listener. It tests atomic catalog
preservation, replay refusal, unchanged synthetic rows, and actual PostgREST
v14.12 reload from own-schema 406 to own 200 / cross-app 403 without a PID change.
Supabase security advisors are attempted against only this disposable fixture;
unavailable full-stack catalog checks are reported without broadening scope.

References: [PostgREST v14 configuration](https://docs.postgrest.org/en/v14/references/configuration.html)
and [schema cache reload](https://docs.postgrest.org/en/v14/references/schema_cache.html).
