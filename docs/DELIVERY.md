# Delivery and verification

This page describes how to build a release artifact without publishing and records the
evidence status for the T-092 documentation work. Nothing here creates a tag, pushes a
commit, publishes a package, or deploys the game.

## Verification status (2026-11-15)

These are the checks run for this docs task, in this checkout:

| Check | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | **PASS** with `COREPACK_HOME` pointed at a writable directory; the sandbox's default `/opt/corepack` was read-only |
| Lint | `pnpm lint` | **PASS** |
| Type check | `pnpm typecheck` | **PASS** |
| Build | `pnpm build` | **PASS**; `packages/anim` and `apps/game` built; Vite warned about a game chunk over 500 kB |

Not run in this docs task:

| Check | Command | Status |
|---|---|---|
| Package unit tests | `pnpm test` | **NOT RUN** |
| Engine simulation | `pnpm sim rake`, `sim hitrate`, `sim balance`, `sim replay` | **NOT RUN** |
| Physics harness | `pnpm sim:rake`, `pnpm sim:perf` | **NOT RUN** |
| Asset build/verify | `pnpm assets:build`, `pnpm assets:verify` | **NOT RUN** |
| Performance/bundle | `pnpm perf` | **PASS** — 1.90 MB gzip of 3.00 MB budget |
| Browser E2E / cross-browser | Playwright suite | **NOT RUN**; no completed three-browser result is claimed |
| Preview smoke | `pnpm preview` | **NOT RUN** |
| HyperFrames lint/render | `pnpm -F @jackpotsyndicate/anim lint` / render | **NOT RUN** |
| Image generation | `assets/imagegen-keys.json` batch | **NOT RUN**; no generated files exist |

The build passing means the TypeScript/Vite bundles were produced. It does **not** mean
the game was played in a browser, that the simulation acceptance bands were re-measured,
or that real art was verified.

## Prerequisites

- Node 22 or newer.
- pnpm 10.28 (pinned by `packageManager`).
- `zip` and `sha256sum` for the local zip recipe (Linux/macOS). On Windows, use
  `Compress-Archive` and `Get-FileHash` as noted below.

If pnpm uses a read-only corepack cache, point `COREPACK_HOME` at a writable directory
before installing. This is an environment workaround, not a repository requirement.

## Build the game

```sh
pnpm install --frozen-lockfile
pnpm build
```

Outputs:

- `apps/game/dist/` — static game build, including `atlas/` placeholders and the
  manifest.
- `packages/anim/dist/` — animation library build.

The game build is static. Serve it with any static file server; `pnpm preview` uses Vite
preview on <http://127.0.0.1:4173>. Do not open `index.html` through `file://`.

## Build a release zip locally

This creates a zip whose root contains the contents of `dist/`. It does not tag, push,
or publish anything.

```sh
pnpm build
rm -f artifacts/jackpotsyndicate-release.zip
(cd apps/game/dist && zip -qr ../../../artifacts/jackpotsyndicate-release.zip .)
unzip -l artifacts/jackpotsyndicate-release.zip
sha256sum artifacts/jackpotsyndicate-release.zip
```

The same build is available as:

```sh
pnpm release:zip
```

That script is POSIX-oriented and requires `zip` and `sha256sum`.

Windows equivalent:

```powershell
pnpm build
Remove-Item artifacts\jackpotsyndicate-release.zip -ErrorAction Ignore
Compress-Archive -Path apps\game\dist\* -DestinationPath artifacts\jackpotsyndicate-release.zip
Get-FileHash artifacts\jackpotsyndicate-release.zip -Algorithm SHA256
```

Before calling a zip releasable, run the full checks below and record their outputs. A
zip is an artifact, not a release approval.

## Manual deploy workflow

`.github/workflows/deploy.yml` is the only deploy workflow. It is:

- **manual dispatch only** (`workflow_dispatch`); there is no push, pull request, tag, or
  schedule trigger;
- read-only for repository contents;
- a build-and-upload job only; it has **no GitHub Pages, hosting, registry, or release
  publishing step**;
- configured to upload the zip as a downloadable Actions artifact.

To use it:

1. Open the repository's **Actions** tab.
2. Select **Deploy (manual artifact only)**.
3. Choose **Run workflow** and optionally provide a git ref (default `main`).
4. Download the artifact named `jackpotsyndicate-<sha>` from the run.

Downloading that artifact is the end of the workflow. Publishing to a host is a separate,
owner-approved action and is currently blocked by H-1 (deployment target/approval), H-2
(asset rights), and H-3 (public framing). This task did not run the workflow.

## Full pre-release checklist

Run these only when you intend to evaluate a release candidate, and record the results:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm assets:verify
pnpm build
pnpm sim replay
pnpm sim rake
pnpm sim hitrate
pnpm sim balance --runs 2000
pnpm perf
pnpm preview
```

Browser/Playwright checks are separate and must be run on Chromium, Firefox, and WebKit
where the suite supports them. They were **not run** here.

Release approval also requires:

- [ ] Real browser E2E results and cross-browser determinism evidence.
- [ ] Asset provenance and rights review (H-2).
- [ ] Final title/store wording and age guidance (H-3).
- [ ] A confirmed deployment target and explicit owner approval (H-1).
- [ ] A recorded release zip hash and a final smoke test of that exact artifact.

None of those approvals is implied by the docs task or by a green build.

## What not to do

- Do not tag or push a release from this task.
- Do not create a GitHub Release or publish to a host.
- Do not describe placeholders as final art.
- Do not claim browser E2E, three-browser determinism, or simulation bands passed
  without a fresh recorded run.
- Do not edit the golden replay hash by hand.
