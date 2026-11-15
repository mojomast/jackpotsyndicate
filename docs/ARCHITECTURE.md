# Architecture

This document describes the code that exists in this checkout. `docs/SPEC.md` is the
design intent; when the two disagree, the code and `packages/contracts` win.

## Stack

- TypeScript, strict, Node 22+, pnpm workspace.
- Vite for the game build; React + Zustand for the UI shell.
- GSAP timelines and a clock-free tick-synced player in `packages/anim`.
- PixiJS in `packages/board-render`; the Table screen also has a deterministic SVG
  adapter so board output is testable without WebGL.
- Custom deterministic 2D circle-body physics; no third-party physics engine.
- Zod schemas for content, commands, events, and saves.
- `node:test` via `tsx` for package unit tests; Playwright is present as a dependency
  but a completed three-browser suite is not claimed.
- WebAudio synthesis; no audio files are required.
- GitHub Actions: CI on push/PR to `main`; a separate manual-only artifact workflow.

## Repository map

```
apps/game/                 React shell, store, Table, meta screens, test API
packages/contracts/        C-1..C-9 types, schemas, constants, fixtures
packages/physics/          deterministic SimWorld, pinfield, pusher
packages/engine/           slot, scoring, wirings, shop, effects, bosses, run, save
packages/core/             GameCore composition, event bus, replay, browser loop
packages/content/          ContentBundle data (symbols, items, floors, bosses, balance)
packages/anim/             GSAP factories, cabinet, player, compositions, trailer
packages/audio/            synthesized event voices
packages/board-render/     draw plan, shelf/projectShelf rendering, particles
tools/sim/                 bots, rake/hit-rate/balance/replay CLI, reports
tools/assets/              C-7 key resolver, atlases/manifest, placeholders
tools/physics-harness/     fast physics rake/perf/fixture utilities
tools/physics-viewer/      single-file debug viewer
e2e/                       hardening/E2E material and fixtures
fixtures/                  golden replay fixture
artifacts/                 generated reports, physics viewer output, optional release zip
docs/                      spec and this documentation set
```

## Component boundaries

```
UI (React)
   | Command
   v
GameCore (packages/core)
   | tick
   +--> engine (pure rules, scoring, run state)
   +--> physics SimWorld (pure deterministic bodies)
   |
   +--> Snapshot + GameEvent
          |--> anim (GSAP timelines, never mutates game state)
          |--> board-render (draws SimSnapshot)
          +--> audio (voices from events)
```

Rules that keep the boundaries clean:

- `engine` and `physics` never import each other. Both import `contracts`.
- `core` is the only package that composes engine and physics.
- `content` is data, validated against the C-1 schema; it does not own runtime logic.
- `anim`, `audio`, and `board-render` consume events/snapshots. They do not award
  payouts, spawn bodies, or change run state.
- `apps/game` talks to the simulation only through `GameCore` commands and snapshots.
- React components are a read-only mirror of core state plus dispatched commands.

## Contracts

`packages/contracts` is the single source of shared shapes:

| Contract | Main file | Contents |
|---|---|---|
| C-1 | `content.ts`, `schemas.ts` | symbols, items, floors, bosses, balance; Zod schemas |
| C-2 | `protocol.ts`, `schemas.ts` | `Command`, `GameEvent`, `Phase`, `GameCore` |
| C-3 | `sim.ts` | `SimWorld`, physics events, `SimSnapshot`, directives |
| C-4 | `protocol.ts` | hook names and the closed `Effect` union |
| C-5 | `protocol.ts`, `constants.ts` | `RunState`, `SaveFile`, `SAVE_VERSION` |
| C-6 | `constants.ts`, `presentation.ts` | tick schedule, animation params, `TimelineFactory` |
| C-7 | `presentation.ts` | `SPRITE_KEYS`, asset manifest shape |
| C-8 | `presentation.ts` | `TEST_IDS`, `window.__JS_TEST__` |
| C-9 | `presentation.ts` | design tokens |

`CONTRACTS_REV` in `packages/contracts/src/constants.ts` is bumped for contract changes.

## Tick and phase flow

The fixed logical tick is 1/60 s. `GameCore.tick()` applies queued commands, runs
scheduled engine work, steps the physics world, routes physics events through effect
hooks, applies effects, and emits stamped events.

Reel stops happen at `30 + 12 * column` ticks. Evaluation is six ticks after the last
stop; orbs launch from evaluation plus six ticks at six-tick intervals. Animation seeks
to the authoritative tick instead of owning time.

Phase machine:

```
TITLE -> PREP -> SPINNING -> RESOLVING
                 ^              |
                 +--------------+
RESOLVING -> ROUND_SETTLE -> ROUND_RESULT
ROUND_RESULT -> SHOP -> PREP
             -> BOSS_INTRO -> PREP
             -> RELIC_PICK / JUMPER_PICK / FLOOR_TRANSITION -> PREP
             -> GAME_OVER | VICTORY
```

The pusher runs during gameplay phases and is frozen in menus. A round is judged only
after physics settles (no orbs in flight and a 300-tick settle window).

## Determinism

Determinism is a product requirement, not only a test convenience.

- `engine`, `physics`, `core`, and `contracts` must not use `Math.random`, `Date.now`,
  `performance.now`, or the banned transcendental `Math` functions. ESLint enforces
  this for those source trees.
- Randomness comes from seeded PRNG streams: run, reels, shop, relics, jumpers.
- Physics uses fixed steps, index-order iteration, order-preserving removal, `Math.sqrt`,
  and a committed sine lookup table.
- The combined state hash is the engine's canonical run state hash plus the physics
  world hash.
- Replays are command logs with the tick each command was dispatched. Replaying the log
  must reproduce the hash.
- Existing evidence: `packages/anim` reports browser-backed tests and
  `docs/PHYSICS.md` reports Node/Chromium determinism. Firefox, WebKit, and a fresh
  this-task replay are **not** claimed here.

## Physics and rendering

The simulation is 2D and value-agnostic: orbs/tokens carry mass, shape, and behaviour
flags, not chips or cash. The engine maps physics events to value:

- `PegHit` adds chips to an orb.
- `OrbSplit` copies the parent's chips.
- `ChuteExit` computes token cash and attaches it to spawned tokens.
- `LipDrop` banks cash.
- `GutterLoss` discards it (a magnetic Skull has a drain).
- `TokenMerged` moves cash into the merge target when the shelf is full.

Rendering is 2.5D from that 2D state. `projectShelf()` in contracts is shared by the
board renderer and shelf VFX so perspective, stacks, shadows, and exits line up.

## Animation

`packages/anim` provides nine seekable factories (`reelSpin`, `lineWin`, `tumbleStep`,
`gridRelayout`, `fever`, `bossIntro`, `floorTransition`, `victory`, `gameOver`), a
responsive cabinet, and `TimelinePlayer`. Factories build paused timelines; the player
sets timeline time from `(tick - startTick) / 60`. Animation never drives simulation.
The Table screen imports the package's runtime directly and supplies the current grid,
win order, and reduced-motion flag.

## Persistence

- `js.save.v1` stores a versioned `SaveFile`: run state, serialized physics bytes,
  contract revision, and hash.
- `js.settings.v1` stores comfort settings.
- `js.compendium.v1` stores discovered content.
- Saves are taken at phase boundaries while the shelf is frozen. A save that fails
  schema/version validation is discarded with a notice rather than partially restored.

## Assets

C-7 logical keys are the only asset addresses. `tools/assets` resolves each key from a
pinned manifest with SHA-256, or emits a deterministic SVG placeholder, then writes
`asset-manifest.json`, placeholder files, byte copies, and a contact sheet. The game's
sprite resolver returns `null` for placeholders, so the animation package draws its own
vector fallback. At the time of this documentation, all 71 keys are placeholders.

## Build and delivery

- `pnpm build` runs each workspace package build that exists. The game build lands in
  `apps/game/dist`; the animation package build lands in `packages/anim/dist`.
- The game is static and works from a static host; no runtime server or network calls
  are required.
- `.github/workflows/ci.yml` runs lint, typecheck, unit tests, and build on `main`
  pushes and pull requests.
- `.github/workflows/deploy.yml` is `workflow_dispatch` only. It builds and uploads a
  downloadable artifact. It does not deploy or publish.
- Release zips are built locally or by that workflow without tags, pushes, or
  publishing. See `docs/DELIVERY.md`.

## Where to change what

| Goal | Start here |
|---|---|
| Add/tune content | `packages/content/src/data.ts`; see `docs/CONTENT_GUIDE.md` |
| Change a rule or scoring formula | `packages/engine/src/**`, then contract tests |
| Change physics feel | `packages/physics/src/**`; read `docs/PHYSICS.md` first |
| Change shared shape | `packages/contracts/src/**`; bump `CONTRACTS_REV` |
| Change UI or screens | `apps/game/src/**` |
| Change animation | `packages/anim/**` under its own merge rules |
| Add a simulator metric | `tools/sim/**` |
| Add or change art | `tools/assets/**`, `assets/**`; see `docs/ASSET_CREDITS.md` |
