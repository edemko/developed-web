# Private central runtime — 2026-09-20

The approved stage keeps registration closed, every app unpublished and
`enforce_oidc=false`, and mail disabled. No Caddy/public route, identity,
OAuth-client registration or product activation belongs to this operation.

## Fixed deployment inputs

- Runtime UID/GID: `developed-accounts`, UID988; no login shell, sudo or Docker.
- Node: `/opt/developed-runtimes/node-v22.23.2/bin/node`, root-owned.
- Application: `/opt/developed-accounts/releases/<reviewed-commit>/`; only
  `dist`, `public`, `package.json`, `package-lock.json`, production `node_modules`.
- Environment: `/etc/developed-accounts/accounts.env`, root-owned0600.
- Independent initial encryption-key backup:
  `/var/backups/developed-accounts-keys/initial-20260920.key`, root-owned0600,
  in its own root-only0700 directory. This is separate from database backups;
  an off-host recovery copy remains an operator responsibility.
- Provider: protected `http://127.0.0.1:3141`; public issuer unchanged.
- Database: `172.18.0.12:5432/postgres`, exact role `developed_accounts`.
- Marketing fallback: root-owned immutable copy of the existing public HTML at
  `/opt/developed-accounts/marketing/initial-20260920`, containing only
  `index.html` and `en/index.html`. Public assets remain with the static ingress.
- Browser origin: `https://www.developed.sk`; private listener `127.0.0.1:3140`.

Build from an explicitly pinned committed revision in a disposable developer
checkout under `flock /home/openclaw/.cache/developed-ecosystem-build.lock`.
Run `npm ci --ignore-scripts`, the ordinary account suite, and install production
dependencies in the staged application-only artifact as the developer. Only
then copy the artifact to its root-owned release, leaving no group/other writes.
Never install dependencies as root or run from the writable checkout.

## One-time credential provisioning

`central-runtime-provision.mjs --apply` is an explicit root-only operation after
review. It copies only the existing Mega backend's provider administrator and
Mailjet credentials in memory; it never rotates them or sends mail. It verifies
the retained private provider credential with one bounded read, creates a fresh
32-byte database password and independent 32-byte encryption key, and writes
the protected environment/key files with exclusive creation before changing
the database. Mail is hardcoded disabled and the sender/reply addresses remain
the source-defined `noreply@developed.sk` / `info@developed.sk`.

The database operation uses existing trusted `supabase_admin`, guards the
NOLOGIN/no-password role, absence of privileged flags/memberships, three-entry
ledger and closed policy state, and changes only `LOGIN PASSWORD`. It supplies a
client-derived SCRAM verifier, suppresses statement diagnostics and captures all
child output. It adds no grants or memberships. Re-running is refused; on a
failure, reconcile the exact protected files and role before doing anything.
Do not remove those files or create another encryption key as an automatic retry.

Before provisioning, inspect actual HBA and grants: the reviewed Docker route
uses SCRAM, the role has no schema CREATE, product-table SELECT, password-hash
SELECT or privileged-role membership. Existing `postgres` membership *in* this
role remains unchanged. `net`/`extensions` retain their existing PUBLIC grants;
this operation is not a platform-wide permissions remediation.

## Private startup and verification

Install the reviewed `developed-accounts.service`. It requires the persistent
UID boundary, root-cgroup bind boundary and private green provider, blocks home,
Docker/Tailscale control sockets and writable executables, and has no persistent
writable runtime directory. The UID-boundary trusted-central route permits
the exact database/provider destinations; no product exception is added here.

First validate the unit, runtime file permissions, release ownership and direct
database login. Verify the actual role and denial of password hashes and other
private product data without printing credentials or row contents. Start only
this unit. Check private health, login HTML, absent-auth rejection and the two
stale-cookie marketing roots; do not create users, log in as the owner or enqueue
mail for a startup test. Recheck closed policy, ledger, central-session/outbox
counts, and a narrowly filtered error count. Then enable this one service at boot.

Rollback stops/disables only this service and retains credentials, encryption-key
backup, DB schemas and all network gates. No shared provider/database restore or
public route reversal is part of private staging. Public launch and real user,
MFA, mail, native and all seven product acceptance remain separately gated.

Preparation checks: provisioning unit tests and `systemd-analyze verify` passed.
The application build and actual private runtime checkpoint will be recorded
after verification; these instructions alone do not claim startup happened.
