# AMP guest prerequisite — 18 October 2026

Central API source `dfcc8ebe5901` is live at
`/opt/developed-accounts/releases/dfcc8ebe5901`, switched at09:45:23 UTC using
`developed-release deploy developed-accounts dfcc8eb`. The sole mail worker
was drained and repinned by the coordinated release process; mail implementation,
protected sender input and the independent boot-readiness drop-in were preserved.
API and worker are active with zero restarts. No central migration was required.

`/api/account/internal/phone/linked` authenticates only the active AMP service
credential and returns a boolean indicating whether a normalized SK/CZ mobile
number is registered. No identity or stored phone ciphertext is returned.
A production read-only lookup passed; an invalid service key was rejected401.
No SMS/account mutation was performed.

The offline scoped-key operator and public-data denial filter also admit
`airsoft_guest_storage`, a separate machine role with only guest-media paths.
Its database migration and runtime credential are owned by the AMP deployment.
The credential expires15 January2027 at00:00 UTC and must be rotated beforehand.
No global service-role/signing key was added to the AMP runtime.

The deployed boundary code is pinned under
`/opt/developed-control/data-boundary-dfcc8ebe5901` by the independent
`/etc/systemd/system/developed-data-boundary.service.d/guest-storage.conf`.
The previous file/unit and credential issuance metadata are protected under
`/var/backups/amp-guest-20261018`. Only the new role is added to the filter;
all upstream signatures, RLS, privileged-key/S3/vector denials remain enforced.
The boundary is active with zero restarts; no Caddy or shared DB restart occurred.

Validation: central release208 passed/26 optional skips plus its browser test;
focused phone lookup, offline signing and data-boundary suite27 passed.
Production guest-path upload/delete succeeded; account-path and sibling-bucket
uploads failed, and the test image was removed. AMP source `ef524d4f585a` was
activated at09:48:58 UTC after both guest migrations and scoped role verification.
Its public guest/account chooser, locale forms and account login passed checks.
Unrelated developer workspace edits remain separate from these releases.
