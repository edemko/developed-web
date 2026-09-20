# Public shared gateway acceptance — 2026-09-20

The reviewed immutable acceptance helper completed **50 passed, 0 failed** after
the scoped Otázkomat exposure correction. No product rows were returned or
written, no real user login was attempted, and no credentials were minted.

Command:

```sh
sudo env -i PATH=/usr/bin:/bin /opt/developed-runtimes/node-v22.23.2/bin/node \
  /opt/developed-control/gateway-acceptance-1c0502b/gateway-public-acceptance.mjs \
  --verify-after-tunnel /etc/developed-accounts/gateway-acceptance-input.json
```

The root-0600 input contains existing scoped credentials and must not be printed.
The helper checked the verified tunnel topology and Caddy hash before and after
the matrix. Results:

- Five scoped backend own-schema HEAD checks returned 200; all 20 cross-app
  checks returned 403. Each request selected only `id` with `limit=0`.
- All three actual old `service_role` credential combinations were blocked by
  the filter, with empty no-store responses.
- The public gateway sentinel, generic Auth/admin/factor/consent/functions and
  GraphQL routes were denied. Six empty unauthenticated mutation-shaped probes
  were denied before reaching Auth.
- OIDC discovery, JWKS, OAuth metadata and its RFC8414 alias returned 200, with
  validated issuer/endpoints and no private JWK fields.
- S3/vector paths were denied; Studio returned the protected Access redirect.

Otázkomat exposure was the only functional correction: append its schema to the
existing nine, with no grants changed, and enable RLS on its administrative
migration ledger. The SQL transaction committed once. A JavaScript object-key
ordering postcheck falsely failed; read-only semantic comparison confirmed the
commit and the corrected operator reconciled it without replay or notifications.

Immutable reconciliation bundle:
`/opt/developed-control/postgrest-exposure-92369ff`.
Operator SHA-256:
`48e524fdd332865f00c7635a7e8fa4f0e8ce041d08683203a7c188e05c9f9af9`.
Root evidence:
`/var/backups/developed-postgrest-exposure-20260920/verified.json`.
The REST PID remained `1016465`, with start time
`2026-09-18T10:06:08.581615814Z`; no shared REST restart occurred.
The original environment backup and exact single-line durable source delta were
verified privately. The application deployment ledger remains at 13 entries;
this one-off metadata operation has separate exact-migration-hash root evidence.

This proves the tested gateway boundary, not completion of remaining host socket,
owner MFA, mail-delivery or device acceptance work. Human central SSO remained OFF.
