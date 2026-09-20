# KešTrek MCP state handoff without pausing finance/data requests

Source-only preparation, 2026-09-20. No live pause, INPUT fence, UID-policy update,
state copy or candidate restart was performed by this preparation. The owner has
approved the coordinated deployment and separately approved the completed
development-preview suspension. Follow this reviewed sequence before the six
product routes switch; human central SSO remains unrouted throughout.

## Why these phases are required

KešTrek's OAuth client/token store is one process's in-memory map saved as JSON.
Dynamic registration, token issue/refresh and revocation synchronously save it;
access-token verification does not write. A candidate started from an earlier
snapshot can forget new grants or revive later-revoked grants. Sharing the file
between both running processes is unsafe. Pending consent and authorization
codes are memory-only: an in-flight authorization can require restarting after
handoff, while persistent clients and access/refresh grants are preserved.

The old API PID1282853 listens wildcard3124. Existing UFW permits the tailnet, so
the Caddy pause alone does not stop raw OAuth requests to that listener. The
temporary INPUT fence blocks only non-loopback traffic to3124, both IP families.
There is deliberately no OUTPUT rule: UID1000 old MCP tools make internal API
calls to3124, so an OUTPUT rule allowing only root/Caddy would break ordinary MCP
data calls. Local trusted operator/root access remains; remaining UID1000 legacy
processes also retain that localhost access until retired. Other dedicated app
UIDs retain their existing loopback denial. This is a handoff control, not the
completed legacy-runtime security closure.

The private UID982 candidate also calls its own API for MCP tools. An actual UID
probe during preparation returned EHOSTUNREACH for127.0.0.1:3164/api. The reviewed
UID generator therefore adds optional `selfMcpApi:true`, permitted only on the
`kestrek` app entry, allowing exactly IPv4 loopback TCP3164 before its local
destination denial. No sibling, IPv6-loopback, old3124 or broad local exception
is added. This permits the app to call its own existing API; ordinary API auth
and central integration-owner checks still apply.

## Reviewed runtime/state pins

- Old user unit `kestrek-prod.service`, PID1282853, UID1000, cwd
  `/home/openclaw/Dev/kestrek/backend`, port3124 remains serving during copying.
- Private system unit `developed-kestrek@1c102674a293.service`, UID982/GID975,
  cwd `/opt/developed-apps/kestrek/releases/1c102674a293/backend`, port3164.
- Old file `/home/openclaw/.config/kestrek/chatgpt-personal/mcp-oauth.json`;
  private target `/var/lib/developed-kestrek/mcp-oauth.json`.
- Identity parity compares effective old dotenv+initial-process environment to
  the private process: API-key hash, owner ID, encryption key, public resource,
  timezone and exact old/new store/port/self-API choices. Values are never printed.
  Candidate central mode must be true and notification cron false. The effective
  legacy dotenv precedence matches ConfigModule's `.env` then process environment;
  old development mode is rejected.
- Both old development units must remain inactive, PID0 and disabled.

## Exact execution order after coordinator review

1. Commit the reviewed source with `[no deploy]` and stage immutable root-owned
   operator copies. `install-product-routes.mjs` now imports
   `kestrek-handoff-fence.mjs`; the copy operator imports that same module. Include
   it beside both operators. No package installation or writable executable is
   needed. `--inspect` on the state operator is read-only and does not require an
   OAuth pause; it reports selected parity, hashes, self-API readiness and drain
   metadata without secrets.
2. Preserve the root-controlled UID policy and old generator root-private. In
   `/etc/developed-accounts/uid-network-boundary.json`, assert exactly one
   `name=kestrek, uid=982` entry and add only `selfMcpApi:true`. Verify removing
   that field recreates the prior JSON. Install the reviewed updated generator
   at `/opt/developed-control/network/uid-network-boundary.mjs`; preserve its
   root ownership and all other loader files. Use the existing scoped loader's
   `--check`, then reload only `developed-uid-boundary.service`. Verify actual
   UID982 self3164/API200 and continued denial of3124, siblings, private Auth,
   control sockets and IPv6 loopback. Do not use another accept-only table as a
   shortcut: it cannot override the existing UID-chain rejection.
3. Run `kestrek-handoff-fence.mjs --stage`, then its separately reviewed `--apply`.
   It requires its named `inet developed_kestrek_handoff` table to be absent,
   stages root0600 rules/proof under
   `/var/backups/developed-kestrek-handoff-fence-20260920`, checks nft syntax and
   creates only that INPUT table. It never flushes, replaces or removes another
   table. Verify Caddy UID999 can still read old3124/API200, existing dedicated
   runtimes cannot reach old3124, and canonical finance/MCP data remain served.
   Non-loopback interface behavior is proven in the disconnected fixture;
   independently verify the intended live tailnet path when available.
4. Run `install-product-routes.mjs --stage` while the source still has the exact
   gateway-only hash `9b25d5d170f901c8be78cecab23fcf64a672b4a41c52f0cce15df8af69dca33c`.
   It stores original, OAuth-paused and final six-product/static configurations
   plus hashes under `/var/backups/developed-product-routes-20260920`. It validates
   both candidates and verifies every unrelated adapted route. The static
   targets must already be immutable and present, and the coordinated product
   policy/device prerequisites must be ready before final apply.
5. Run only `install-product-routes.mjs --pause-mcp`. It wraps the exact
   canonical/test KešTrek site's existing handlers in one ordered route and puts
   case-insensitive `^/api/integrations/mcp/oauth(?:/|$)` denial first. All methods
   return503 with Retry-After60 and no-store; other paths retain their old routing.
   A separate top-level route would be sorted after existing handle directives
   and fail to pause OAuth; the real-Caddy tests explicitly caught and corrected
   that implementation error. Normal and percent-escaped/case variants are tested.
6. Run `kestrek-mcp-handoff.mjs --apply`. It requires the exact paused Caddy hash,
   public503 headers on canonical and test hosts, the exact INPUT fence, runtime
   identity parity and working UID982 self API. Before any service change it
   requires stable old-store bytes and no active TCP connections involving3124
   across repeated samples. LISTEN and TIME_WAIT are the only allowed states;
   ESTABLISHED, SYN/FIN/CLOSE states, including idle keepalive connections, block
   copying. The bounded drain waits up to30 seconds and fails without stopping
   anything if no quiet interval exists. Do not dismiss a failed drain as idle
   traffic or manufacture a credential-denial response to clients.
7. The state operator creates exclusive root0600 backups of the old and existing
   private store plus an attempt record under
   `/var/backups/developed-kestrek-mcp-handoff-20260920`. It stops only the unrouted
   private unit, confirms3164 drained, rechecks source/env/pause/fence stability,
   writes an exclusive UID982/GID975 mode0600 temporary file, fsyncs and atomically
   renames it over the private store, then fsyncs its directory. It restarts only
   the private unit, checks self API/readiness/parity and both store hashes, and
   writes the completion proof. Old production is never stopped by this operator.
8. After all seven policies and final route prerequisites pass, run
   `install-product-routes.mjs --apply`. It accepts only the exact paused source,
   staged final configuration and completed matching MCP handoff proof. It
   rechecks the fence, private PID and old/private file hashes. One atomic Caddy
   replacement/graceful reload removes the pause while selecting all six new
   upstreams and matching static roots. A failed final reload restores the paused
   source, not the old OAuth writer. A successful switch must promptly be followed
   by retirement of the superseded old unit and the remaining privileged runtimes.

No fence-removal mode is supplied. Retain it until the exact old unit is stopped
and disabled and3124 no longer listens; later remove only this named table under
reviewed cleanup. A host reboot during handoff is not covered by this temporary
nonpersistent table: stop progression and re-establish/verify the fence and
pause before copying or switching. Do not enable a global nftables service.

## Failure and recovery

On any ambiguous state/copy/reload result, retain the OAuth pause and inspect the
root-private attempt/proof files, actual PIDs, hashes and effective route. The
state operator refuses an existing backup directory; it never silently retries
or overwrites recovery evidence. If it stopped the candidate before failing,
reconcile the exact store before restarting that private unit. Do not restart
old production or restore the shared database as cleanup. The old and private
store backups remain recoverable; no credential grant is intentionally removed.

The pause bounds interactive MCP authorization interruption; established MCP
data calls and financial API requests keep their ordinary behavior. Physical
client acceptance still follows the coordinated cutover. Do not claim a complete
security boundary merely because this state handoff succeeds.

## Checks

```sh
PRODUCT_ROUTES_CURRENT_TEST=1 PRODUCT_ROUTES_CADDY_TEST=1 node --test server/accounts/deploy/install-product-routes.test.mjs
node --test server/accounts/deploy/kestrek-mcp-handoff.test.mjs server/accounts/deploy/uid-network-boundary.test.mjs
node server/accounts/deploy/kestrek-handoff-namespace-test.mjs --run
```

The last command creates disconnected network namespaces, verifies namespace
identity before every fixture entrypoint and never changes the host network.
It proves IPv4/IPv6 non-loopback3124 rejection, unrelated-port continuity, retained
root/Caddy/legacy local calls, KešTrek's exact self3164 allowance, other-UID denial
and preservation of the independent temporary INPUT table. Source/unit tests do
not exercise the real production state-copy mutation before approval.
# Narrow self-MCP policy preparation (reviewed separately)

`kestrek-self-mcp-policy.mjs` changes only the installed KešTrek UID982 policy:
IPv4 `127.0.0.1:3164` becomes reachable by that UID. Old3124, sibling services,
control3141, filter3143, IPv6 and other app UIDs remain denied. The existing full
policy inventory and loader are preserved; the generator change is checked to
produce byte-identical original rules when the new option is absent.

Install this operator and the reviewed `uid-network-boundary.mjs` together in a
new root-owned immutable directory. The current installed config/generator/loader
hashes are pinned in the operator. After a separate approval, use the fixed
root-owned Node22 executable to run `--stage`, review the root-private proof in
`/var/backups/developed-kestrek-self-mcp-20260920`, and then run `--apply` once.
Staging calls the existing loader implementation with the staged generator and
config in check-only mode; apply calls the installed loader `--check`, then the
existing `developed-uid-boundary.service` reload. The loader continues to use its
existing lock and replaces only its named nft table. It does not restart apps.
`--verify` repeats the real UID982 positive and negative socket probes, including
the UID985 negative control. A failed apply restores the exact original generator
and config then reloads the original policy; its attempt marker prevents blind
replay. Do not remove any other UID or exception to obtain a passing probe.

Legacy `.env` and OAuth-store ancestry is allowed to retain group-writable
directories only for UID1000/GID1000 after checking that the complete NSS group
and passwd inventories give that group exclusively to `openclaw`. Files remain
single-link mode0600; world-write, symlinks and all broader exceptions are rejected.
This does not relax the root-owned operator or UID982 private-store checks.
