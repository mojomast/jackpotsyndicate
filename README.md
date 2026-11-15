# Jackpot Syndicate

A browser-playable, play-money roguelike: slot reels feed a pachinko pinfield, whose
orbs spawn tokens on a coin-pusher shelf. Cash is banked only when a token crosses the
pusher lip. No accounts, purchases, ads, or runtime network calls.

The execution plan and acceptance criteria are in [`docs/SPEC.md`](docs/SPEC.md).

## Quick start: five commands

Requires Node 22+ and pnpm 10.28 (the version pinned in `packageManager`).

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm sim:rake
pnpm build
pnpm preview
```

`pnpm preview` serves the production build at <http://127.0.0.1:4173>. Use
`pnpm dev` instead of `pnpm preview` for the Vite dev server at
<http://127.0.0.1:5173>.

What the five commands do:

| Command | Purpose |
|---|---|
| `pnpm install --frozen-lockfile` | Installs the exact workspace lockfile |
| `pnpm test` | Runs the package unit suites (`packages/*/tests`) |
| `pnpm sim:rake` | Runs the no-trinket physics rake harness |
| `pnpm build` | Builds `packages/anim` and `apps/game` (`apps/game/dist`) |
| `pnpm preview` | Serves the built game from `apps/game/dist` |

## Current verification status

This table is deliberately conservative. It records what was run for the T-092 docs
work on 2026-11-15, not what the project is expected to pass later.

| Area | Status |
|---|---|
| `pnpm install --frozen-lockfile` | **PASS** for this checkout; the sandbox needed `COREPACK_HOME` pointed at a writable directory because `/opt/corepack` was read-only |
| `pnpm lint` | **PASS** |
| `pnpm typecheck` | **PASS** |
| `pnpm build` | **PASS**; Vite reports a >500 kB game chunk warning |
| `pnpm test` | **NOT RUN** in this docs task |
| `pnpm sim rake`, `sim hitrate`, `sim balance`, `sim replay` | **NOT RUN** in this docs task |
| `pnpm assets:build`, `assets:verify` | **PASS** for the working imagegen batch: 71 keys, 67 locked, 4 placeholders; verify checked 73 files |
| Browser E2E / Playwright / cross-browser determinism | **NOT RUN**; no completed three-browser E2E result is claimed |
| Image generation | **Working batch imported**: 67/71 PNGs locked; four placeholders remain. Not final art |
| HyperFrames lint / trailer re-render | **NOT RUN** in this docs task |

The committed asset manifest currently resolves **67 of 71** logical keys to locked
imagegen derivatives and **4** to generated vector placeholders. See
[`docs/ASSET_CREDITS.md`](docs/ASSET_CREDITS.md). The committed golden replay fixture
records a Victory run at the current hash. See [`docs/DELIVERY.md`](docs/DELIVERY.md)
for the full evidence log.

## Common commands

These scripts exist in the root `package.json`; run only the ones you need.

| Command | What it does |
|---|---|
| `pnpm dev` | Start the game dev server |
| `pnpm build` | Build the animation package and game |
| `pnpm preview` | Preview the built game |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm test` | Package unit tests |
| `pnpm sim rake` | Engine-level gutter rake report (AC-5) |
| `pnpm sim hitrate` | Base 3×3 CLASSIC hit-rate report (AC-7) |
| `pnpm sim balance` | Random-buyer and greedy-synergy bot reports (AC-6) |
| `pnpm sim replay` | Verify `fixtures/replay.golden.json` |
| `pnpm sim:rake` | Fast physics-harness rake check |
| `pnpm sim:perf` | Physics worst-case tick check |
| `pnpm assets:build` / `assets:verify` | Resolve or verify the C-7 sprite manifest |
| `pnpm perf` | Game stress/perf and bundle budget report |
| `pnpm release:zip` | Build and zip `apps/game/dist` into `artifacts/` without tagging or publishing |

`pnpm test` currently covers `packages/*/tests` only; app-shell tests, the simulation
CLIs, asset verification, and browser E2E are separate commands. None of those extra
checks are claimed as run here.

## What is in the repository

| Path | Role |
|---|---|
| `packages/contracts` | Frozen shared types, Zod schemas, constants, test ids, design tokens |
| `packages/physics` | Deterministic 2D pinfield and pusher simulation |
| `packages/engine` | Slot, scoring, wirings, shop, items, bosses, run machine, saves |
| `packages/core` | `GameCore`: composes engine + physics, command log, replay, browser loop |
| `packages/content` | Data-driven symbols, items, floors, bosses, balance |
| `packages/anim` | Seekable GSAP timelines, cabinet, fixtures, compositions, trailer |
| `packages/board-render` | Deterministic draw plan and Pixi/SVG board rendering |
| `packages/audio` | Event-driven WebAudio synthesis |
| `apps/game` | React UI, store, table/meta screens, test API |
| `tools/sim` | Headless bots, rake/hit-rate/balance/replay reports |
| `tools/assets` | C-7 asset resolver and placeholder generator |
| `tools/physics-harness` | Fast physics rake, perf, and fixture tools |
| `e2e` | Hardening/E2E test material; not a verified browser suite here |

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — packages, data flow, tick loop, determinism
- [`docs/CONTENT_GUIDE.md`](docs/CONTENT_GUIDE.md) — add a trinket, floor, or other content
- [`docs/BALANCE.md`](docs/BALANCE.md) — quota, economy, floor tuning, measurement bands
- [`docs/ASSET_CREDITS.md`](docs/ASSET_CREDITS.md) — art/font/licence provenance and gaps
- [`docs/DELIVERY.md`](docs/DELIVERY.md) — release zip, manual deploy artifact, release checklist
- [`docs/CONTRACTS.md`](docs/CONTRACTS.md) — shared contract map
- [`docs/PHYSICS.md`](docs/PHYSICS.md) — physics invariants and measured rake harness results

## Delivery

The repository does **not** publish or deploy anything automatically. The only deploy
workflow is manual dispatch and uploads a downloadable build artifact; it has no Pages
or hosting deploy step. Release zip instructions likewise build a file locally without
tagging, pushing, or publishing. See [`docs/DELIVERY.md`](docs/DELIVERY.md).

Play money only. There is no real-money wagering, purchase flow, account system,
leaderboard, or runtime telemetry.
