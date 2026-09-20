# Private Odonto CI bundle assembler

`stage-odonto-ci-bundle.mjs` is an offline, fixed-path operator for the exact
`scripts/identity-stage.mjs::validateBundle` schema in `odonto-ai`. It emits
the `{version:1, frontend, backend}` JSON expected by encrypted repository
secret **ODONTO_IDENTITY_ENV_JSON**:12 frontend keys and8 backend keys, with
both candidate central flags true. It contains no upload, GitHub/Vercel call,
deployment, alias, registry or database operation. Default invocation only
prints a metadata plan and reads no protected credential.

This source requires coordinator review before execution. Main review of the
six-host operator does not authorize running this separate assembler. The
Odonto workflow owner maintains remote gates and the authoritative schema;
repository-secret upload and workflow execution are separate operations.
GitHub environment reviewer features are not assumed or required by this tool.

## Exact protected inputs

- `client-staging/odonto-web.credentials.json` and attachment, matched with
  `/var/backups/developed-accounts/client-staging`, plus the verified marker.
- `runtime-staging/odonto-{session,bff,data,identity}.credentials.json` and
  verified markers, each matched byte-for-byte with its protected backup.
- The existing platform signing JSON, used only in protected operator memory
  to verify the data, identity and public-anon JWT signatures. It is never
  copied into the bundle or printed.
- `host-env-staging/mega-music.legacy.env` and its matching backup/verified
  source hash, used only to obtain the preserved existing public anon key.

All paths are fixed under `/etc/developed-accounts` and
`/var/backups/developed-accounts`; all inputs retain the root-private reader
and single-link/no-symlink checks from the reviewed host operator. No source
app `.env` in a repository or remote environment is read.

The exact Odonto launch/callback and origins come from the pinned seven-app
contract/catalog. The session key is32-byte hex and belongs only to frontend
server runtime. The independent BFF key is32-byte base64url and is shared only
between the two servers. The confidential client secret stays on the frontend
server; the central app-check key stays on the backend. The identity JWT has
only `odonto_identity_web`; the business-data JWT has only `odonto_backend`.
Both must have authentic HS256 signatures, exact issuer/audience and finite
future expiry over one hour away, with no human/client claims. The public anon
key also needs an authentic signature, exact anon role and over one hour of
remaining validity. No administrator/service-role/Mailjet key is included.

## Protected outputs and execution

After separate source review, create only these empty root0700 directories:

- `/etc/developed-accounts/odonto-ci-staging`
- `/var/backups/developed-accounts/odonto-ci-staging`

Build a root-owned immutable operator bundle from the reviewed commit, retaining
relative paths for this module, the host staging module, private-client/signer
dependencies, and both pinned JSON manifests. Run it with the reviewed root
Node22 binary and a clean environment:

```sh
node server/accounts/operators/stage-odonto-ci-bundle.mjs
node server/accounts/operators/stage-odonto-ci-bundle.mjs --check
node server/accounts/operators/stage-odonto-ci-bundle.mjs --stage
node server/accounts/operators/stage-odonto-ci-bundle.mjs --verify
```

The last three modes require root. Check validates all protected inputs, exact
schema and signatures and requires all output names absent, without writing.
Stage exclusive-creates/fsyncs `odonto.started.json` in both locations, then
`odonto-identity-env.json` in both, verifies both payloads, and finally writes
identical `odonto.verified.json` markers. Every file is root0600 and every file
and directory is fsynced. Existing files are never replaced. Verify reassembles
from protected inputs and checks the saved copies/metadata and current expiry.

An interrupted or failed write leaves recovery files in place. Do not delete
markers and retry automatically; reconcile the two copies. Errors are generic
and outputs contain only names, paths, hashes, expiry and status. The resulting
JSON is a credential file, never a public CI artifact, command argument, log,
source file or frontend build input. On-host backups do not replace separately
arranged off-host protection. Neither successful assembly nor remote deployment
would by itself establish coordinated public SSO activation.

## Source tests

```sh
node --test server/accounts/test/odonto-ci-bundle-operator.test.mjs
ODONTO_CI_SCHEMA_TEST=1 node --test server/accounts/test/odonto-ci-bundle-operator.test.mjs
npm test --prefix server/accounts
```

The explicit schema test imports only the validator from the sibling
`odonto-ai/scripts/identity-stage.mjs` and calls it on a synthetic bundle. It
does not invoke that script's CLI or perform any network work. Default tests
need no sibling checkout. Other fixtures prove exact frontend/backend key
separation, wrong-purpose/role/key reuse rejection, signature and expiry checks
for all three JWT types, callback binding, metadata secrecy and dual-copy
failure ordering. No live credential is required for the tests.
