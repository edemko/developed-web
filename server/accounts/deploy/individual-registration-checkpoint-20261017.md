# Individual registration — 17 October 2026

The existing automatic poll deployed central source `18caeaa1ea42` at 15:30 CEST.
The active API is `developed-accounts.service`, loopback 3140, with immutable
release `/opt/developed-accounts/releases/18caeaa1ea42`. The sole
`developed-accounts-mail-worker.service` is active and the coordinated switch
left no pending receipt. The previous API source was `10121ac509ac`; any rollback
must use the coordinated release tool to preserve the worker's API pin.

Registration now explains that individuals can create accounts without an
organisation and offers an organisation/user-management enquiry button linking
to `mailto:info@developed.sk`. Copy is translated into EN/SK/CS/UK. This is a
public UI change; identity, invitations, verification, database and worker
implementations were unchanged by this release.

Validation: 204 account tests passed, 26 optional tests skipped, and the account
and branded registration Chromium checks passed. The automatic build also ran
the account Chromium flow successfully. Public browser checks followed the
Vocabulum registration redirect, switched through all four languages, verified
the copy and mailto button, and found no horizontal overflow at 390px width.
No production registration or test email was submitted.

Vocabulum source `1498f6f09c9b` was independently deployed by the timer at
15:25 CEST, enabling private practice without an organisation. Both repositories
were pushed to main and both automatic paths completed without configuration
changes. The timer remains active; no deployment work is pending.
