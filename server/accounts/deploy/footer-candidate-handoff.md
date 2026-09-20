# Vocabulum/Airsoft footer follow-up — builds ready, no live handoff

This is a UI-only follow-up to the central-auth runtime cutover. The public
units, central environment files, bind/packet policies and Caddy remain unchanged.
Do not switch these routes until the coordinator finishes the separately staged
gateway/Odonto/human-portal work; a premature Caddy change invalidates its guards.

## Pinned source and local qualification

| App | Exact source | Future own-UID candidate | Current serving PID/port |
| --- | --- | --- | --- |
| Vocabulum | `5833953287ee51be6b35225e87b88dfef69d2d97` | UID985/GID979, 127.0.0.1:3171 | PID4056033 / 3161 |
| Airsoft | `1fcb452cf8bcb11505ad5250ac4d1ab55e06b57f` | UID986/GID980, 127.0.0.1:3172 | PID3542385 / 3162 |

Both source revisions were pushed using `[no deploy]`. Vocabulum unit tests:
418 passed, two opt-in skipped; Airsoft:22 passed, two opt-in skipped. Focused
ESLint checks passed. The logo addition's two footer tests also passed; the
approved local DevelopED wordmark is byte-identical to the existing Airsoft and
central assets (SHA256 `fbb0413f8291241a3d82a353ddb96b96932bb39ea92f7e568288e5dc36a591d3`).

Disposable build root: `/home/openclaw/ecosystem-footer-build-iZcGAh`.
`build.mjs` exports only pinned tracked source, excludes every `.env*`, verifies
the unchanged source/dependency locks and reuses the existing developer dependency
trees. TypeScript and webpack production builds passed for both apps, sequentially
under `/home/openclaw/.cache/developed-ecosystem-build.lock`, a1536MiB memory limit,
zero swap and1024MiB Node heap, with one build worker. Vocabulum received synthetic
server configuration only. Airsoft received only four existing public build
settings through a pipe; its public key's role was checked as `anon`. No private
runtime credential was supplied to either build or printed.

`browser.mjs` starts only disposable developer-UID fixtures with synthetic server
credentials. Five compiled pages passed: Vocabulum `/login` and `/`, Airsoft
`/sk/login`, `/cs/login`, `/uk/login`. Each rendered200 with no visible password
field and exactly one report/support/logo link. Report clicks from a synthetic
query+fragment page produced only the fixed central app-slug/platform URL with
no Referer. All external requests were intercepted/aborted; no live sign-in,
registration, mail, product write or end-to-end SSO acceptance is claimed.
The initial Vocabulum fixture used an invalid HTTP trusted origin and failed;
correcting that fixture to the application's required HTTPS origin passed without
changing application code.

Local artifact preparation retained39 old Vocabulum and47 old Airsoft static
files absent from the new build; every shared path had identical bytes. The
resulting browser-static inventories have159 and122 files, respectively. No
synthetic server-secret/issuer marker appeared in browser JavaScript. Each
`*-artifact-manifest.json` records the selected server/static/public payload
inventory and critical build/config files; it is not a complete installed-release
or dependency manifest. Installation still requires complete final-release
ownership/file hashing, including all Next runtime metadata and reused modules.

## Source-only preparation tool

`prepare-footer-candidates.mjs --stage` requires a separate coordinator GO and an
immutable root installation. It only prepares protected proposed files under
`/var/backups/developed-footer-candidates-20260920`; it does not install units,
apply a bind map, change packet rules, start services or touch Caddy. There is no
live-apply/start phase in this tool. Three fixture tests cover the exact bind-map
delta, preservation of existing unit content and disposable unit syntax.

The tool pins the observed old bind-config SHA256 and active serving PIDs,
checks3171/3172 free across both listener families, captures effective trusted
unit fragments and existing bind bytes, records network/Caddy hashes, and checks
the old files/PIDs again. Exclusive root0600 writes plus file/directory fsync
preserve partial evidence; do not overwrite/retry a partial stage automatically.

Exact proposed bind delta, and nothing else:

- Add3171 and3172 to `protectedPorts`.
- Add3171 only to Vocabulum UID985 `tcpLoopbackPorts` (keep3161).
- Add3172 only to Airsoft UID986 `tcpLoopbackPorts` (keep3162).

Removing those additions must reproduce every original config field. No nft
egress delta is needed: Caddy/root already reach loopback, replies are permitted,
and app-initiated sibling/private/control connections remain denied. The new
ports do not grant cross-UID or provider/database access. They were free at
read-only inventory; recheck immediately before any installation/start.

## Later reviewed handoff — not authorized by this document

1. Install exact new immutable releases, verifying source/build manifests and
   dependency-lock equality. Keep the old releases and non-conflicting old
   `.next/static` assets for in-flight pages; reject a same-path/different-byte
   collision. Use separate new cache directories/symlinks:
   `/var/cache/developed-vocabulum-footer` and
   `/var/cache/developed-airsoft-footer`; never share the running caches.
2. Review and apply only the exact bind delta with protected recovery copies;
   prove existing owners retain their listeners and unrelated UIDs cannot bind
   the new ports. No change to the nft packet policy is part of this handoff.
3. Install proposed `developed-{vocabulum,airsoft}-footer.service` units without
   enabling them. Each includes all current effective unit fragments (including
   the central-runtime startup guard, required boundary services and sandbox),
   followed only by fixed release/listener/cache overrides. Reuse the exact
   existing central EnvironmentFile; `Environment=PORT=3171/3172` adds no
   credential copy, but EnvironmentFile values take precedence over Environment
   assignments. The fixed CLI `--hostname 127.0.0.1 --port ...` is authoritative
   for the listener. Do not claim the process's PORT environment differs until
   it is checked; no secret-bearing EnvironmentFile needs modification.
4. With separate start approval, start each unrouted candidate, verify actual
   UID/GID, central-only credentials, isolated cache, denied private peers and
   unauthorized binds, no unexpected listener, UI/footer/registration behavior,
   and unchanged serving PIDs/health. Do not send real auth/mail/product requests.
5. After gateway/Odonto/portal readiness, capture the then-current Caddy config;
   replace only Voc3161→3171 and Air3162→3172, validate full-config equivalence for
   every unrelated route, and gracefully reload. Verify canonical HTTP and real
   browser footer outcomes before draining/stopping the old exact units.
6. Keep the already-enforcing old releases/units as recovery targets. Do not
   reopen legacy Docker/Vercel identity or remove old caches/data. Only enable
   the new units and retire old boot selections after the successful handoff.

A bind-update response or route reload with ambiguous status requires read-only
reconciliation, not an automatic retry or broad rollback. Neither staging nor
this footer change authorizes new users, registration, mail or data mutations.
