# Vocabulum Vercel inventory and closure plan — 2026-09-20

This records a read-only inventory, the authorized Git-link freeze, and the
remaining proposed operation sequence. It supplements
`ecosystem-ingress-inventory-20260920.md`. Public central SSO
must remain closed until the coordinator completes the full ingress boundary.

## Applied Git-link freeze

At `2026-09-20T18:28:00.717Z`, the coordinator-authorized exact Git-link DELETE
below returned HTTP 200. Fresh preflight asserted the team/project/repository,
`main` production branch, latest revision/target and complete lists. At
`18:28:01.708Z`, the project GET confirmed `link` absent. Before/after comparisons
confirmed identical deployment IDs/URLs/states, alias bindings, project domains,
all seven environment-entry IDs/names/targets/types/update timestamps, production
targets and SSO protection. Both snapshots contained 26 READY deployments, five
aliases, two domains and no queued/building deployment.

This operation only prevents future repository pushes from deploying through
that Git link. Existing Vercel websites, aliases, credentials and executable
deployments remain unchanged. No environment deletion, alias/domain update,
deployment publication/deletion, VPS, database, user or mail change was made.

## Exact scope and observed exposure

- Team: `team_8zEVzukOohffhNKgSDSiDveC`.
- Project: `prj_Nqg32imlxVxBkRoeeAUpAdkz8Hfk`, `vocabulary-builder`.
- Before freeze: connected GitHub `edemko/vocabulary-builder`, production `main`.
- Before freeze: `gitProviderOptions.createDeployments=enabled`; zero hooks.
- Framework `nextjs`; root directory null.
- Vercel Authentication: `all_except_custom_domains`; password protection absent.
- Project and inventoried deployment/alias protection-bypass maps have zero
  entries. This does not establish absence of all trusted-user access grants.
- The project currently has 26 READY production deployments, five aliases and
  two project domains. Each list returned one complete page with no next cursor.
  No building/queued deployment or preview deployment appeared.
- The latest production target is `dpl_HhX4LtiZxYGtbf7G38AsF5iPqVSZ`, revision
  `64c975e1dfade01f46b1ce9884c6596dda83aee3`.

Unauthenticated GET requests, without following redirects or sending cookies,
returned Vercel SSO 302 on `/api/auth/providers` and `/api/auth/session` for all
26 immutable deployment URLs and the three protected aliases below. The public
project domain `vocabulary-builder-plum.vercel.app` returned 200 and advertised
the `credentials` provider. The canonical domain also advertised `credentials`.

Critically, an HTTPS connection directly to Vercel, with TLS SNI and Host set to
`vocabulum.developed.sk`, returned 200 with the credentials provider and Vercel
response headers. Its public DNS resolves through Cloudflare to the VPS, but
the retained Vercel custom-domain mapping is an independently reachable origin.
Changing DNS or switching the VPS origin does not close that route.

| Current alias/domain | Target | Anonymous provider/session probe |
| --- | --- | --- |
| `vocabulum.developed.sk` (project custom domain) | `dpl_HhX4LtiZxYGtbf7G38AsF5iPqVSZ` | 200; direct Vercel Host/SNI bypass also 200 |
| `vocabulary-builder-plum.vercel.app` (project production domain) | `dpl_HhX4LtiZxYGtbf7G38AsF5iPqVSZ` | 200 |
| `vocabulary-builder-erik-demkos-projects.vercel.app` | `dpl_HhX4LtiZxYGtbf7G38AsF5iPqVSZ` | Vercel SSO 302 |
| `vocabulary-builder-git-main-erik-demkos-projects.vercel.app` | `dpl_HhX4LtiZxYGtbf7G38AsF5iPqVSZ` | Vercel SSO 302 |
| `vocabulary-builder-erikdemko-4215-erik-demkos-projects.vercel.app` | `dpl_GLDnhFKPqnoyVhLNZ9cJcEMbyX1A` | Vercel SSO 302 |

Existing project environment names, covering production/preview/development,
include `NEXTAUTH_URL`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXTAUTH_SECRET`, `OPENAI_ENCRYPTION_SECRET`.
Values were not printed. The deployment detail API did not expose a usable
environment-name map, so this inventory does not claim a per-deployment secret
diff. All 26 detail responses had zero cron configurations. The app is a remote
Vercel runtime, outside the VPS dedicated-UID boundary, with legacy identity
entry points and a project-level shared administrator credential configured.

[Vercel documents that environment changes affect new deployments only](https://vercel.com/docs/environment-variables/managing-environment-variables).
Deleting a project variable, moving an alias, or protecting a URL does not erase
credentials from previous immutable runtimes. Vercel-authenticated members or
previously authorized visitors can still invoke protected deployments. Never
declare runtime retirement solely from anonymous 302 responses.

## Complete immutable deployment inventory

Every URL in this table has the form
`https://vocabulary-builder-<suffix>-erik-demkos-projects.vercel.app`.
All were READY with target `production` at inspection.

| Deployment ID | URL suffix | Source |
| --- | --- | --- |
| `dpl_HhX4LtiZxYGtbf7G38AsF5iPqVSZ` | `8aipptq1s` | git |
| `dpl_5K2vrBjQJW6AsSWKx9mrG5wWyk2W` | `mf77x9awz` | git |
| `dpl_7F2mDGFL9bfg44G4PSLvgN3fLZth` | `edchbeu9o` | git |
| `dpl_G1Xyh1LR1irc6M3rKuXKmALuh9no` | `9pnqjljsd` | git |
| `dpl_61XBs6MQDFdRzv656sTMWfpuPcm7` | `mp32byq6t` | git |
| `dpl_ECeGfCz93MkEDrvp8DU8DMiWmgQM` | `j7whwxkrt` | git |
| `dpl_GXuwtAd8n5n9fbUtVwZpNgbAvc3G` | `4prucfqgy` | git |
| `dpl_GLDnhFKPqnoyVhLNZ9cJcEMbyX1A` | `oem10e89g` | cli |
| `dpl_AURd1QtpP3BeyC4sTRyRWzSsBNAk` | `edzjvyk4j` | git |
| `dpl_9gtyWGAqRgFebUvhyKDqBY6BoKG1` | `gys86esbs` | git |
| `dpl_5duSA2DZoVJSDTJahrxwtxoLSxdX` | `65fkvvc15` | git |
| `dpl_8GjvWfNEHQqLFThamgjpmPujna5u` | `nxfve9od5` | git |
| `dpl_6mDECyWYrZZ32msTnDiKBYuYt1TL` | `a1ga867cr` | redeploy |
| `dpl_9rf3fBUaRpR2StuzFy11sJDqVN8L` | `3kgyfrg37` | git |
| `dpl_HNFDkX8X5b4FEHhrUxrTs3Qxjec8` | `mm869i82i` | git |
| `dpl_8QZ1i5kMpbTTDnmkg7ek2K2p8mGB` | `d0txy93gp` | git |
| `dpl_12QcUqFXLBshCF5c2sxsj2wAXLGv` | `mcx520zlx` | git |
| `dpl_FMzrGr5DTzR493PDV4gLxc2eb1fv` | `mv2bxkqwg` | git |
| `dpl_AMy2gv489TnU72jx4FkW5evEvPSE` | `2xad18lgx` | git |
| `dpl_7fq3rvWPp4GgPWMYnJN3QXEPabUV` | `mejm033um` | redeploy |
| `dpl_4bJ8Z1J39UT3CYrYQfqPiqC22U6i` | `l6j8p7yii` | redeploy |
| `dpl_58jz9aNvFXXKCZf3TBBfEGsD1HMp` | `gogcqhg08` | git |
| `dpl_5ty88a8tV1ttnTjzT2cknd6y5dH9` | `fbaooei3n` | git |
| `dpl_G9HevjWqdKib9iAt8huxSPmPvVVP` | `qp02agk59` | git |
| `dpl_E5QAK7P551Xx8cDQ9h6mwvQWZbsb` | `p8zgr4dkz` | git |
| `dpl_5e46BbZXAzZCuZUH4MmnZsgTqwaz` | `oksw9xdw9` | git |

## Narrow freeze, before another source push

Re-read and assert the exact team, project, Git repository and latest deployment
before writing. The recommended operation removes only this project's Git link:

```text
DELETE https://api.vercel.com/v9/projects/prj_Nqg32imlxVxBkRoeeAUpAdkz8Hfk/link?teamId=team_8zEVzukOohffhNKgSDSiDveC
```

No body is needed. Read the operator CLI credential in process memory, send it
only in the HTTPS Authorization header to `api.vercel.com`, disable redirects,
and emit selected status fields only. Never put credentials in argv or output.

This is the API used by the officially documented
[`vercel git disconnect`](https://vercel.com/docs/cli/git), verified against
[Vercel's own CLI implementation](https://github.com/vercel/vercel/blob/main/packages/cli/src/util/git/connect-git-provider.ts).
It preserves the Git repository, integration, Vercel project, existing deployments,
domains and current website. Verify with a fresh project GET that `link` is
absent, and re-enumerate deployments to detect an in-flight race before pushing.
The observed deployment-creation flag occurs in the public API response schema,
but is absent from the current PATCH request schema; do not rely on an unverified
`gitProviderOptions` PATCH as the freeze mechanism.

Reconnection is an intentional future operation, not automatic rollback:
`POST` to the same `/link` URL with
`{"type":"github","repo":"edemko/vocabulary-builder"}`. Reconnection restores
push deployment risk. Also commit `git.deploymentEnabled=false` in Vocabulum's
`vercel.json` after the freeze as a source-level guard; [Vercel documents that
setting](https://vercel.com/docs/project-configuration/git-configuration).

## Proposed runtime closure, separately coordinated

1. Keep the canonical VPS website available. Freeze Git as above and verify no
   in-flight Vercel build. Do not push the dirty Vocabulum tree as a deployment.
2. Prepare a tiny reviewed, static-only Vercel artifact in an isolated directory:
   no application functions, no dependencies, no environment variables, no
   credentials. Browser GET/HEAD legacy entry URLs should point to the canonical
   VPS application. Obsolete identity/API requests must terminate locally and
   must not forward a POST body, cookie, callback code or credential query to the
   new login flow. Verify actual route behavior before alias promotion.
3. Remove unneeded credential variables from this exact project's future build
   configuration, with a protected rollback record if required. This is separate
   from revoking shared backend credentials and does not cleanse old deployments.
4. Publish the static artifact manually to this existing project, then move the
   intended legacy Vercel production alias to it. Keep protection enabled. Detach
   the obsolete `vocabulum.developed.sk` Vercel project-domain mapping after
   confirming canonical public traffic continues to the VPS. Do not delete DNS
   or the registered domain. Alternatively, neutralizing its Vercel target must
   be verified with the direct Host/SNI probe as well as normal DNS resolution.
5. Re-enumerate and retire the exact 26 old executable deployments with the
   [deployment deletion API](https://vercel.com/docs/rest-api/deployments/delete-a-deployment),
   after the coordinator approves the concrete old-ID set and static replacement.
   This discards old build artifacts; they cannot be instantly rolled back, and
   source redeployment is not a byte-identical restoration. Preserve source and
   reviewed release evidence. Do not delete the project, repository or unrelated
   deployments. Reassign or remove the one old custom alias still bound to
   `dpl_GLDnhFKPqnoyVhLNZ9cJcEMbyX1A` so it cannot retain a legacy entry point.
6. Verify all old immutable URLs are retired, all retained aliases target only
   the static artifact, no credential-bearing functions remain, the direct
   canonical Host/SNI path cannot execute old auth, and the normal canonical
   website remains online. Freshly verify Git is still disconnected.

Project-wide Vercel Authentication `all` is a possible temporary ingress fence,
subject to plan availability, but it does not retire the old privileged runtime.
Project pause is reversible and [documented to return 503 for production](https://vercel.com/docs/projects/managing-projects),
so it is not the preferred preserving final state. Removing only aliases also
leaves immutable deployment URLs active.

The freeze needs only project Git-link write permission and no site outage.
Static publication, environment removal, alias/domain updates and old deployment
deletion are separate mutations requiring the coordinator's exact GO. No
database/user cleanup, shared-key rotation or mail action belongs to this slice.
