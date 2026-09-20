# Exact shared API tunnel handoff

Coordinator read-only inspection subsequently bound the actual running connector
account/tunnel to the existing private management credential. Remote version1,
four entries, config SHA256
`01b8dd6febbcda7bbebef5165002f924e1f7b97ca116873746a79d8eee9c09a1`
and desired SHA256
`2f378fa47324d1dc073a284132b6b5a033c1ebcc21803418fd4e2065af1f6894`
were verified. No remote write occurred. The real configurations response omits
`account_id`; the operator now binds account through its fixed authenticated URL
and independently verified connector, still rejecting any conflicting returned
account. A regression test covers the actual shape.

`prepare-api-tunnel-input.mjs` assembles the root-only input without printing or
passing credential values in arguments. It requires the reviewed final product
route proof to match the current Caddy bytes before writing anything. Install it
with the matching reviewed tunnel operator in a root-owned immutable directory.
Only the two named Cloudflare environment variables need preservation through
sudo; the existing connector secret is read privately to bind the target, never
used as the management credential or copied into the input.

Source-only preparation. No Cloudflare management request or remote change was
performed to prepare this operator. Use this phase only after the coordinator's
matching product/policy/data and legacy-runtime prerequisites are satisfied.
Installing the gateway site alone is not permission to switch live API traffic.
The complete order is in [final-cutover-sequence.md](final-cutover-sequence.md).

`switch-api-tunnel.mjs` changes only the existing remote-managed tunnel's exact
`sam-api.developed162.bid` ingress pair. The legacy prefix route to8000 and its
same-host404 become one hostname-only route to Caddy80, preserving the original
Host. Studio, final404, all other entries and all origin/warp options survive.
Unexpected structure, API priority or Host overrides fail closed. It neither
reloads Caddy nor changes human portal admission, services, credentials or data.

The current [Cloudflare GET API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/subresources/configurations/methods/get/)
returns the configuration/version. The [PUT API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/subresources/configurations/methods/update/)
replaces configuration using the `config` envelope. These official schemas were
checked during preparation. There is no documented compare-and-swap parameter
here: a fresh version/digest check reduces races but is not an atomic lock.
Coordinate other tunnel writers during this operation.

## Protected inputs and stages

Use a committed immutable root-owned operator outside home and a root0600 JSON
input under trusted root-owned directories. Input fields are `accountId`,
`tunnelId`, `apiToken`, `expectedVersion`, `expectedConfigSha256` and
`expectedCaddySha256`. Supply only the actual running tunnel and existing private
management API credential, never its connector token. Populate values through
the protected operator mechanism; do not paste them into shell argv, logs or Git.
The actual account/tunnel IDs and API token are not hardcoded in source.

- `--inspect /protected/input.json`: one GET, selected version/config digest and
  entry count only. Only account/tunnel/token fields are needed. No file or remote
  state is written. Independently bind these IDs to the intended running tunnel.
- `--stage /protected/input.json`: require reviewed version/config/Caddy pins;
  probe the installed gateway and confirm human login remains unavailable; GET
  the exact current remote config and generate the scoped candidate. Exclusively
  create protected original/desired/proof files under
  `/var/backups/developed-api-tunnel-20260920`. No PUT is issued. The proof never
  contains the management token.
- `--apply /protected/input.json`: require the same staged pins and no prior
  attempt, repeat local gateway preflight, GET the same remote configuration and
  require unchanged version/digest. Persist a root-private attempt record, issue
  exactly one PUT, then GET and verify the intended config and increased version.

The reviewed Caddy pin must describe the actual post-product-switch config,
not the earlier gateway-only hash. Local probes check existing gateway metadata,
generic Auth denial, malformed data credential denial and closed human login.
These are implementation preconditions; they do not substitute for the
coordinator's seven-product/device/MCP acceptance or runtime retirement checks.

Any timeout, drift, rejection or post-write mismatch stops without an automatic
retry or reverse PUT. A recorded attempt prevents a second apply, including
after an ambiguous response. Use fresh `--inspect`, preserved files and public
probes to reconcile. Do not remove the marker or re-stage as a retry shortcut.
Reopening direct-Kong traffic after enforcement is a security rollback, not
ordinary error recovery. No operator rollback command is supplied.

## Verification boundary

The successful result deliberately reports `effectivePropagationVerified=false`.
Check the running connector's effective config/version and public issuer metadata,
JWKS, RFC8414 alias, blocked generic Auth/factors/consent/admin, denied privileged
data and positive scoped data/Storage behavior. Verify Studio still requires
Access using redirects-disabled requests, then preserved tablet and MCP traffic.
API update success does not establish connector propagation. Closed human
login and registration remain separate until the security boundary is complete.

Tests use in-memory fake APIs and make no network calls:

```sh
node --test server/accounts/deploy/switch-api-tunnel.test.mjs
```
