# Repository integration

Target: `mojomast/jackpotsyndicate`, branch `anim/initial`, package scope only.
Foundation reviewed: `cf27769ee90f2a108697c8734fd60e31bfe1d9b5`, CONTRACTS_REV 1.

Read before editing: root README, docs/CONTRACTS.md, docs/SPEC.md §2.11,
packages/contracts/src/constants.ts, presentation.ts and content.ts.

Pre-push integration checks pass: package-local frozen install, exact shared-contract
comparison (seven value/function exports, 18 types), strict typecheck, 93 Chromium
tests and Vite/declaration build. No root install or root configuration changes.

The next gate is a fresh remote clone of anim/initial, followed by all required package
commands, explicit HyperFrames lint for every composition, demo interaction review,
and a package-only diff against origin/main. Results will be added before the PR is merged.
