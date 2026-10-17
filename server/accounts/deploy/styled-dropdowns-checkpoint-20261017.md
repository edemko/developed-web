# Account dropdown styling — 17 October 2026

Automatic release `10121ac509ac` is live on `developed-accounts.service`,
loopback 3140, since 11:29 CEST. Public HTTPS app.js/app.css match the deployed
files; login and canonical-Host loopback health return 200. Compiled backend
files match previous release `2248f5d6bbb2` exactly. There is no pending switch
receipt. That previous API release remains available for coordinated rollback.

The shared account form selector now renders an app-styled combobox/listbox.
Profile language choices reuse the header flags and native language names;
MFA authenticator and administration selectors share the same control. Native
form values, input/change events and reset behavior remain available internally.
Popovers sit above clipping containers and dialogs, adjust to viewport space,
and follow the field when scrolling. Unsupported popover browsers use a fixed
panel attached to the enclosing dialog or document.

Keyboard interaction follows the [WAI select-only combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/):
arrows, Home/End, Page Up/Down and type-ahead navigate; Enter/Space/Tab commit;
Escape cancels tentative selection. Focus stays on the labeled control, with
active-option and selected-value semantics. Only one form dropdown opens at once.

Validation: 204 account tests passed with 26 optional skips. The expanded
isolated Chromium account/report flow and branded-registration flow both pass.
Regression checks cover language selection without accidental submit, Escape,
type-ahead, Tab, form reset, outside dismissal, saved-language request values,
independent MFA selectors and selected factor payloads, and a selector inside
the reauthentication dialog. Mobile/desktop popup bounds were checked at
320/375/1440px and screenshots reviewed. A separate touch-emulated run also
passed the full flow using taps on the language control and options. The fixtures exposed selected-checkmark
labeling and scrolling-dismissal issues; both were corrected before release.
No live account changes or messages are used by these tests.

## Mail worker recovery and cleanup protection

The automatic cleanup removed `releases/e51b271b962a`, the AMP mail worker's
independent implementation pin. The worker guard passed immediately before the
cleanup, but the worker then failed startup at 11:29:15 CEST. The API and public
UI stayed healthy; the poll's successful exit did not reflect this worker failure.

The normal release builder rebuilt and sealed the exact `e51b271b962a` Git archive
without switching the API. The installed worker guard verified the restored
module hashes, API pin, disabled API sender, protected input parity and absence
of another worker. The existing sole worker was started at 11:30:34 CEST and
logged its scoped-role readiness. Its launcher remains
`mail-workers/10121ac509ac`; implementation and working directory remain
`releases/e51b271b962a`. No credentials, mail templates or database state were
manually changed. Both services are active with NRestarts=0.

Commit `54b09ce9399a` adds the missing implementation pin to the release config's
protected releases. All 22 release-tool tests pass. The standard installer
installed the frozen tool `/opt/developed-control/developed-release-54b09ce9399a`
and updated the existing enabled poll; the previous `90abaa8752d2` tool remains.
Only the protection list differs from that tool's source. A dry-run prune
explicitly retains `e51b271b962a`; status reports nothing further to deploy.
Future mail implementation moves must also update this protected pin before
automatic cleanup can age out the previous API retention window.
