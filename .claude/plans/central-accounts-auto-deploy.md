# Central account automatic releases

Status: sealed baseline live; automatic UI mode being activated and verified.

## Objective

Release central account changes from committed source with the same immutable API and single mail-worker boundaries used by manual releases. Routine changes should deploy from `origin/main` through the existing poll timer. Migrations and worker/security implementation changes must stop for manual review.

## Gates

1. Reconcile the currently live release branch into `main`, including any new live hotfixes, and verify the resulting account code. The release tool requires the live source commit to be an ancestor of the target.
2. Keep the automatic path disabled while other sessions are deploying, while C2's observation gate is pending, and until a first release has succeeded through this tool.
3. Build from a clean commit archive with Node 24.21.0. Run account tests and seal only `dist`, `public`, package metadata and production dependencies into a root-owned release. Exclude credentials and development source.
4. Block automatic deployment when migrations, worker launcher/guard, mail, database, security, dependency, or service configuration paths change. Those changes require a coordinated manual release.
5. For an eligible release, stage a new root-owned mail launcher based on the verified live bundle. Re-pin only the API release and compare worker-imported module hashes. The release switch must drain the sole worker, atomically change the API symlink, restart/health-check the API, re-pin the worker drop-in, start/verify the worker, and restore both on failure.
6. Preserve the previous API release and worker bundle for rollback. Record the target, previous pins and outcome. An interrupted switch must halt future automatic attempts until an operator reconciles live state.
7. First deploy manually through the new tool, inspect public login and product redirect, then enable automatic polling and observe a second harmless change end to end.

## Verification

- Pure tests for commit ancestry, protected-path gates, pinning, rollback order and interrupted-switch handling.
- Isolated build and browser tests for the central login, including KešTrek destination context at mobile and desktop widths.
- Live candidate health, sole sender, API mail disabled, exact release/Node pins, public login and OAuth negative probes before enabling automatic mode.
