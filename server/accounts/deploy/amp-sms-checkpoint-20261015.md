# AMP profile SMS sender release — 2026-10-15

The central API release `72e2fe9b69d5` sends Airsoft profile verification
codes through SMS Gate v1 JSON with `from=AMP`. Other central SMS sends keep the
account default identifier. The API health and public login returned HTTP 200;
183 unit tests and the browser fixture passed during the release build.

After the API switch, the release tool pruned the old API release
`7cf9d4100a9a`, which the sole mail worker still imported. Its guard passed,
but the worker failed during startup. A new immutable launcher bundle at
`/opt/developed-accounts/mail-workers/72e2fe9b69d5-amp-sms-mail` imports from
the live API release. All four imported mail modules and the logo matched the
prior guard hashes. The systemd WorkingDirectory was repinned to the same
release, and the worker restarted with its ownership guard and scoped database
role check passing. The old drop-in is backed up root-only under
`/var/backups/amp-sms-db-20261015/`.

The release tool now protects `72e2fe9b69d5`, the worker's immutable import
source, from future pruning. Re-evaluate that pin when changing the worker
implementation. The AMP app release is `0ab9993f61f7`; its SMS database uses
the scoped session-pooler route after the old direct container address became
unreachable. The user's authenticated OTP entry remains the final end-to-end
verification check.
