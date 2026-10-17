# Profile layout release — 17 October 2026

The scheduled automatic release deployed `2248f5d6bbb2` at 11:14 CEST.
`developed-accounts.service` serves the immutable release on loopback 3140;
`developed-accounts-mail-worker.service` was re-pinned by the existing release
coordinator. Both services are active with NRestarts=0. No pending switch receipt
remains. Previous release `7fb4f2fe0cee` is retained for rollback through the
coordinated release tool.

Profile settings now use two independently stacked columns on desktop and one
column below 900px. Profile details and email share one stack; picture and
password share the other. Buttons fit their labels, picture actions share a row
when space permits, and email verification status sits alongside the address.
The required-password notice appears above the settings.

The source merge preserves the already-live email-confirmation release and the
remote AMP mail documentation. Compared with the previous live application,
only `public/app.js` and `public/app.css` changed; compiled backend files were
verified byte-identical. Existing unrelated dirty work in the original checkout
was preserved using a separate worktree.

Validation: 204 account tests passed, 26 opt-in tests skipped; the isolated
Chromium account/report flow passed, including avatar upload/removal. Temporary
browser checks covered EN/SK/CS/UK at 320, 375, 768, 900 and 1440px with a long
email address, plus MFA fields at 320, 900 and 1440px. No horizontal overflow was
observed; desktop/mobile screenshots were reviewed. Tests used fixture accounts.

The public HTTPS JavaScript/CSS match the deployed files exactly. Public login
and canonical-Host loopback health return 200. The initial Python urllib HTTPS
probe received 403; curl subsequently verified both assets and login successfully.
The release status reports no deployable changes remaining. No account mutation,
production password change or mail delivery was performed for verification.
