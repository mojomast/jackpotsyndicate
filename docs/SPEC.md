# JACKPOT SYNDICATE — Execution Spec for Hermes (rizzstack)

**Source:** `jackpot_syndicate_design_blueprint_simulator.html` (v6.1 MVP Master). Blueprint anchors such as `[SPEC-PSH-01]` are cited so bees can look up the original intent.
**Status:** Execution-ready. Four scope decisions were confirmed by the owner (see 0). Everything else is a recorded default Hermes may proceed on.
**How to read this:** Section 2 contracts are frozen by task T-002 before any parallel work starts. Section 3 is the dependency graph. This document does not define any rizzstack configuration; Hermes maps the task table into its own workflow.

---

## 0. Confirmed decisions and recorded defaults

### Confirmed by owner

| ID | Decision |
|---|---|
| K-1 | **HyperFrames role:** animations are authored as HyperFrames-compatible, seekable GSAP compositions. The game plays the same timelines live in the browser; HyperFrames renders them to video for a trailer. HyperFrames is not the game runtime. |
| K-2 | **Scope:** full Mode 1 run (3 floors, 3 bosses, branching elevator, archetype shop, trinkets/coins/drinks, fever) **plus** reel/payline mutations (3–5 columns, 3–4 rows, Hyper/Ways/Cluster wirings, jumper wires, overvolt). |
| K-3 | **Physics:** the simulation is 2D top-down, deterministic, fixed-timestep, seeded. **Rendering of the pusher is 2.5D** (perspective shelf, coin thickness, stacks, shadows, tumbling exits) drawn from the 2D state. No 3D physics. |
| K-4 | **Backend:** none. Static client, localStorage saves, shareable seeds. Play money only. |
| K-5 | **Animation is built externally.** A separate HyperFrames agent is already building `packages/anim/` (reel and scene timelines, cabinet DOM, tick-synced player, compositions, trailer) from its own prompt. Hermes does **not** dispatch bees for that work. Hermes merges the folder, swaps its shim for the shared contracts, and wires it in (tasks X-ANIM and T-052, and 2.11). |

### 0.1 Already built (do not redo)

The owner had the highest-risk foundation built before handing this spec to Hermes. It is in the repo and tested.

| Task | State | What exists | What is left for Hermes |
|---|---|---|---|
| T-001 | Partly done | Root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` (path aliases), `.gitignore`, README, `node:test` runner via `tsx` | Lockfile and installs, ESLint incl. the banned-API rule for sim packages, CI workflow, remaining package stubs. Keep the existing test command working (or migrate those tests to Vitest unchanged). |
| T-002 | Mostly done | `packages/contracts`: constants and tick schedule, sine table, C-1 content **types**, C-2, C-3, C-4, C-5, C-6, C-7, C-8, C-9, `projectShelf`, `fixtures/snapshot.static.json`, tests. See `docs/CONTRACTS.md` | Zod schemas matching the C-1 types and `SaveFile`; `events.sample.json`; `content.min.json`; `MockGameCore`; grid fixtures |
| T-020 | **Done** | Physics kernel: seeded PRNG, binary serialize, hash, deterministic sine | Nothing |
| T-021 | **Done** | Pinfield chamber with all symbol behaviours | Nothing |
| T-022 | **Done** | Coin pusher with all symbol/boss behaviours; rake within AC-5 on all four floors | Re-measure rake through the real engine once T-080 exists (`docs/PHYSICS.md`) |

Where the code and this spec disagree on an interface, **the code in `packages/contracts` wins**; the differences are listed in `docs/CONTRACTS.md` and summarised here:

- Physics is value-agnostic. Orbs and tokens carry no chips or cash; the engine tracks `orbId → chips` and `tokenId → cash` from physics events (`PegHit`, `OrbSplit`, `ChuteExit`, `TokenMerged`, `LipDrop`, `GutterLoss`).
- There is no `onGutterApproach` hook. Gutter bumper trinkets set `PhysicsModifiers.gutterBounceChances`; the sim rolls them.
- `gutterRisk` sets the width of a bevelled strip beside each gutter (`26 × gutterRisk²` units). The board renderer must draw it.
- Overclocked Seven spawns one token with `stack: 3` and 3× cash, not three tokens.
- `SimWorld` also has `setModifiers`, `drainEvents`, and `configure(floor, mods, resetPegs)`.
- Determinism is verified in Node and Chromium only. Firefox and WebKit remain to be checked in T-090.

### Recorded defaults (Hermes proceeds; owner may flip later)

| ID | Default | Why |
|---|---|---|
| D-01 | Symbol stats follow the blueprint's Parity Matrix text `[SPEC-PAR-01..05]`, not the prototype's `slotPool` array, where the two disagree (e.g. Diamond mass 1.6 vs 1.5). | Matrix is the stated design; the array is demo code. |
| D-02 | Floor graph: Floor 1 Neon → choice of 2A Cryo or 2B Foundry → Floor 3 Penthouse. One branching point. | The blueprint only defines these four floors. |
| D-03 | Quota rule: at the end of each normal round the quota ("tribute") is deducted from bankroll; bankroll below quota ends the run. The remainder is shop money. | Makes shop spending a real trade-off; matches the debt theme. |
| D-04 | Boss rounds have no quota. Player wins if cash banked during the boss round ≥ boss score after the final spin settles. | Matches the tug-of-war bar `[SPEC-BOS-01]`. |
| D-05 | Pusher shelf persists across rounds within a floor and is re-seeded with 20 tokens on each new floor. | Keeps "loaded shelf tension"; floors change shelf physics. |
| D-06 | Deferred to roadmap: Persistence Pots, Lock 'N Link, Seals/Curse stamps, Toroidal wiring, 5-row grids, Uranium decay/mutation. Symbol text that references these is trimmed (see 2.6). | Not exercised by the prototype loop; each adds a system. |
| D-07 | The prototype's "+0.15 X-Mult per mounted trinket" and "45% forced row match" are demo scaffolding and are **not** carried over. Hit rate comes from reel-strip weights. | They would break balance. |
| D-08 | Drinks go to a 3-slot bar tray and are consumed in the prep phase (max 1 active per spin). Lubricant Oil Shot is instant. | Blueprint Phase 01 describes pre-spin chugging. |
| D-09 | Boss relic reward = pick 1 of 3 random trinkets, free. | Blueprint names no specific relics. |
| D-10 | Audio is synthesized with WebAudio (as in the prototype). No audio files. | assetrizz has no audio. |
| D-11 | assetrizz has no casino-specific category. Sprites are chosen from its `icons`, `ui`, `vfx`, `props`, `backgrounds` categories by search; any logical key with no acceptable match gets a generated vector placeholder. | Keeps the build unblocked. |
| D-12 | Desktop-first, responsive down to 360 px portrait. Latest Chrome, Firefox, Safari. | |
| D-13 | Repo is `mojomast/jackpotsyndicate`, **public** (owner decision; no LICENSE file, all rights reserved for now). It **already exists** when Hermes starts and contains the foundation described in 0.1 (workspace root, `packages/contracts`, `packages/physics`, harness, docs). The animation agent adds `packages/anim/` to it (tag `anim-v1`). Hermes builds on what is there and does not recreate or rewrite it. | Owner decision. |
| D-14 | All numeric tuning (prices, quotas, strip weights, cash-per-chip) is initial; task T-082 owns final values within the acceptance bands in 1.7. | |

---

## 1. PROJECT CONTRACT

### 1.1 Goal

Ship a browser-playable roguelike in which every slot spin cascades through three coupled stages: **slot reels → pachinko pinfield → coin pusher shelf**. Cash is banked only when a token physically crosses the pusher's front lip. The player climbs three casino floors of escalating quotas, beats a head-to-head boss on each floor, and builds a machine from trinkets, coins, drinks, reel glyphs and chassis mutations.

### 1.2 Users

- **Player:** roguelike/deckbuilder fan on desktop or phone browser. No account, no install, no payment.
- **Owner/designer:** needs seeded reproducibility, a headless balance simulator, and data-driven content to tune.
- **Hermes and bees:** need frozen contracts, non-overlapping write scopes, and commands that verify each task.

### 1.3 Key journeys

| ID | Journey |
|---|---|
| J1 | First spin: Title → New Run → spin → orbs fall → tokens land → a token crosses the lip → bankroll rises. |
| J2 | Round loop: finish 7 spins → quota deducted → shop → buy a trinket → it appears on the cabinet bezel and changes the next round. |
| J3 | Boss and branch: enter round 4 → tug-of-war vs boss with its sabotage active → win → elevator → pick Cryo or Foundry → floor physics change. |
| J4 | Fail and retry: miss a quota → Game Over with run summary and seed → restart the same seed and see the same first spin. |
| J5 | Resume: close the tab mid-run → reopen → continue from the last phase boundary. |
| J6 | Mutate: buy a reel column and a wiring harness → grid becomes 4×3 with the new evaluation → more orbs per spin. |
| J7 | Full clear: defeat the Iron Auditor on Floor 3 → Victory screen. |
| J8 | Comfort: mute audio, enable reduced motion, change sim speed, play on a 390×844 viewport. |

### 1.4 Requirements

**Core cascade**

| ID | Requirement |
|---|---|
| R-CORE-01 | Every scoring reel cell launches exactly one orb into the pinfield; every orb leaving a chute spawns its token(s) on the shelf at the same X; bankroll increases only on lip-drop events. `[SPEC-CORE-01]` |
| R-CORE-02 | A spin with no winning evaluation launches one Scrap Copper orb worth 15% of base equity. `[SPEC-BAL-S1]` |
| R-CORE-03 | Determinism: the same seed and the same command log produce a bit-identical state hash on Chrome, Firefox, Safari and Node. |
| R-CORE-04 | Phases follow the state machine in 2.5; illegal commands are rejected with a typed error and no state change. |
| R-CORE-05 | The simulation runs headless (no DOM) at ≥ 200× real time for tests and balance runs. |

**Stage 1: slot**

| ID | Requirement |
|---|---|
| R-SLOT-01 | Grid of C×R cells (C 3–5, R 3–4), one weighted reel strip per column, stops drawn from the seeded RNG. |
| R-SLOT-02 | CLASSIC wiring: all rows plus both diagonals, left-anchored, minimum match length from config (initial 3). 3×3 has 5 lines. |
| R-SLOT-03 | Scoring follows 2.6 exactly: Chips × additive Mult × X-Mult, per-orb equity V₀. |
| R-SLOT-04 | Five symbols with the slot-stage behaviours in 2.6. |
| R-SLOT-05 | Reel glyph purchases add a stop of that symbol to a player-chosen reel strip for the rest of the run. |

**Mutations** `[SPEC-MUT-01]`

| ID | Requirement |
|---|---|
| R-MUT-01 | Chassis items add a column (to max 5) or a row (to max 4); the grid, strips and line set regenerate deterministically. |
| R-MUT-02 | HYPER wiring: CLASSIC lines plus V and inverted-V zigzags. |
| R-MUT-03 | WAYS wiring: a symbol wins when present on ≥ 3 consecutive reels from the left; ways = product of matching cells per reel. |
| R-MUT-04 | CLUSTER wiring: orthogonally connected groups of ≥ 4 same symbols win; winning cells clear, symbols tumble, re-evaluate, max 5 tumbles. |
| R-MUT-05 | Jumper wire: adds one extra payline, chosen from 3 offered non-standard paths (max 3 jumpers). CLASSIC/HYPER only. |
| R-MUT-06 | Overvolt: one player-chosen payline has line multiplier ×3. CLASSIC/HYPER only. |

**Stage 2: pachinko** `[SPEC-BAL-S2]`

| ID | Requirement |
|---|---|
| R-PCH-01 | Pinfield of 5 staggered rows (7/6 pegs) with gold, splitter and bumper pegs; layout comes from floor content. |
| R-PCH-02 | Orbs carry symbol mass and elasticity modified by the loaded coin type. |
| R-PCH-03 | Peg hits add chips; splitter gates clone orbs that have `canSplit`; five chutes multiply (0.8, 1.5, 3.0, 1.5, 2.0). |
| R-PCH-04 | Max 48 orbs in flight; extra orbs wait in a launch queue. An orb alive > 1800 ticks is forced down. |
| R-PCH-05 | Symbol pinfield behaviours per 2.6. |

**Stage 3: coin pusher** `[SPEC-PSH-01]`, `[SPEC-BAL-S3]`

| ID | Requirement |
|---|---|
| R-PSH-01 | Reciprocating dozer blade, token–token collision, per-floor friction, left/right rake gutters, front payout lip. |
| R-PSH-02 | Dozer surge: extended stroke and speed for 45 ticks. |
| R-PSH-03 | Max 150 tokens; at the cap a new token's cash merges into the nearest token. |
| R-PSH-04 | Symbol shelf behaviours per 2.6 (weld, micro-medals, shockwave, magnet, bullion stack). |
| R-PSH-06 | The shelf is rendered in 2.5D from the 2D simulation (K-3). |
| R-PSH-05 | Measured gutter rake matches floor targets (1.7, AC-5). |

**Run structure**

| ID | Requirement |
|---|---|
| R-RUN-01 | A floor is 3 normal rounds of 7 spins, each followed by a shop, then a round-4 boss duel. `[SPEC-LOOP-01]` |
| R-RUN-02 | Quota rule D-03; quotas come from `balance.json`, scaled by the floor's `quotaScale`. |
| R-RUN-03 | After the last spin of a round the sim settles (no orbs in flight and 300 further ticks) before the round is judged. |
| R-RUN-04 | Fever gauge: +20 per spin; at 100 it launches an 8-orb barrage plus a dozer surge and resets to 20. |
| R-RUN-05 | Elevator after a boss win offers the next floor options (D-02); the chosen floor's physics and shop bias apply. `[SPEC-MAP-01]` |
| R-RUN-06 | Runs start from a seed (random or typed). The seed is shown on Game Over and Victory and is copyable. |
| R-RUN-07 | Autosave at every phase boundary to localStorage, including the full shelf state; resume restores it exactly. A versioned save that fails validation is discarded with a notice. |

**Bosses** `[SPEC-BOS-01]`

| ID | Requirement |
|---|---|
| R-BOS-01 | Head-to-head: the boss scores once per player spin; a tug-of-war bar shows player round cash vs boss score; D-04 decides the round. |
| R-BOS-02 | Don "The Vacuum" Valenti (Floor 1): adds a seeded 450–900 per spin (× floor scale); outward lateral suction on shelf tokens; Lead Slug tokens and magnetic tokens resist it. Reward: D-09. |
| R-BOS-03 | Madame Zero (Floor 2): each spin freezes 1–2 random player cells for 2 spins (frozen cells keep their symbol, cannot score); her score gains +0.5 X per currently frozen cell; every 2nd spin drops 2 zero-value ice blocks (3× mass) near the lip. Reward: +2 shop capacity. |
| R-BOS-04 | The Iron Auditor (Floor 3): deterministic score, base × 1.35^spin; every 3rd dozer reciprocation removes the 2 centre-most non-welded tokens. Reward: run victory. |

**Shop and items** `[SPEC-SHP-01]`, `[SPEC-TRK-01]`, `[SPEC-CMP-01]`

| ID | Requirement |
|---|---|
| R-SHP-01 | Each shop visit rolls a vendor archetype (DRINKS, TRINKETS, REELS, MIXED) using the floor's weights, then fills the shelf from that pool. |
| R-SHP-02 | Shelf capacity starts at 4, max 10. Expand costs 150, ×1.6 per purchase. Reroll costs 25, ×1.45 per reroll, reset each floor. |
| R-SHP-03 | Categories: TRINKET, DRINK, REEL (glyphs), COIN, CHASSIS (mutations). Chassis and coins appear in REELS and MIXED. |
| R-TRK-01 | No trinket cap. Every mounted trinket is visible on the cabinet bezel rail with name and effect on hover/tap. Duplicates stack additively. |
| R-TRK-02 | The 15 trinkets in 2.7 work as specified through the effect-hook system. |
| R-ITM-01 | The 5 drinks and 4 coin types in 2.7 work as specified. |

**Presentation**

| ID | Requirement |
|---|---|
| R-UI-01 | Screens: Title, Table (cabinet, board, HUD, log), Shop, Elevator, Boss Intro, Game Over, Victory, Compendium, Settings. |
| R-UI-02 | HUD shows bankroll vs quota, spins left, fever, floor, and the live cascade equation (Chips × +Mult × X-Mult × Drop × Lip Drops). |
| R-UI-03 | Responsive: side-by-side cabinet and board at ≥ 1024 px; stacked at < 1024 px down to 360 px. |
| R-UI-04 | Keyboard: Space spins, Tab reaches every control, visible focus. Settings: mute, volume, reduced motion, sim speed 1×/2×/4×. |
| R-UI-05 | Play-money notice on Title and Settings. No purchases, ads, accounts or network calls at runtime. |
| R-ANI-01 | Reel spin, reel stop, line win, tumble step, grid re-layout, fever, boss intro, floor transition, victory and game over are seekable GSAP timelines with no wall-clock or unseeded randomness. |
| R-ANI-02 | The same timeline modules are wrapped as HyperFrames compositions; `hyperframes lint` passes and one ≥ 20 s trailer MP4 is rendered. |
| R-ANI-03 | Animation never drives simulation: orb launches happen at fixed tick offsets from the spin command (2.5), and timelines are fitted to those ticks. |
| R-AUD-01 | Synthesized SFX for spin, reel stop, peg hit, split, chute, lip drop, gutter loss, surge, fever, buy, error, boss; pitch varies by seeded-independent UI RNG; respects mute. |
| R-AST-01 | Sprites come from a pinned assetrizz commit, hash-verified, packed into atlases, addressed only by logical keys (2.8). Every key resolves (asset or placeholder). |

**Non-functional**

| ID | Requirement |
|---|---|
| R-NFR-01 | Static build (`dist/`) runs from any static host and from `file://`-free local preview; zero runtime network requests. |
| R-NFR-02 | 60 fps render and < 4 ms average sim tick with 150 tokens + 48 orbs on a mid-range laptop; ≥ 30 fps on a mid-range phone. |
| R-NFR-03 | Initial load ≤ 3 MB gzip including atlases. |
| R-NFR-04 | Unit coverage ≥ 85% lines on `engine`, `physics`, `core`. |
| R-NFR-05 | All content is data (JSON validated by schema); adding a trinket that uses existing hooks needs no engine code change. |

### 1.5 Non-goals

Modes 2–6 (Dungeon, Architect and others), turf wars, contraband market, goons/crew, real-money or purchasable currency, accounts, leaderboards, multiplayer, 3D rendering or physics, items listed in D-06, localization, native apps.

### 1.6 Constraints

- TypeScript strict; Node 22+ (HyperFrames tooling requires it); pnpm workspace.
- No `Math.random`, `Date.now`, `performance.now`, `Math.sin/cos/pow/exp/hypot` inside `engine`, `physics`, `core` (lint-enforced). Use the seeded RNG, tick counts, `Math.sqrt`, and committed lookup tables.
- Sim uses a fixed logical board of **600 × 510** units regardless of viewport (the prototype used canvas pixels; that is not carried over).
- Bees write only inside their task's owned paths. New npm dependencies are requested through Hermes, who applies them to the root lockfile.
- HyperFrames attribute names and CLI flags must be taken from the current HyperFrames docs/skills at build time, not from this document.

### 1.7 Completion criteria

| ID | Criterion | Check |
|---|---|---|
| AC-1 | `pnpm install && pnpm build && pnpm preview` serves a playable game. | T-093 |
| AC-2 | `pnpm lint && pnpm typecheck && pnpm test` pass; coverage per R-NFR-04. | CI |
| AC-3 | Golden replay: fixture seed + command log reaches Victory with the committed state hash in Node and in all three browsers. | `pnpm test:replay`, `pnpm e2e` |
| AC-4 | Playwright journeys J1–J8 pass on Chromium, Firefox, WebKit; J8 also at 390×844. | `pnpm e2e` |
| AC-5 | Gutter rake over 10,000 bot spins with no trinkets: Neon 18% ± 4, Cryo 24% ± 5, Foundry 12% ± 4, Penthouse 21% ± 5 (share of tokens leaving the shelf via gutters). | `pnpm sim rake` |
| AC-6 | Balance bands over 2,000 seeded runs each: random-buyer bot clears Floor 1 in 35–65% of runs and wins the run in 2–15%; greedy-synergy bot wins 25–60%. No run exceeds 1e12 bankroll. | `pnpm sim balance` |
| AC-7 | Hit rate (spins with ≥ 1 winning evaluation) on base 3×3 CLASSIC: 30–45%. | `pnpm sim hitrate` |
| AC-8 | Performance per R-NFR-02 measured by the stress scene; bundle per R-NFR-03. | `pnpm perf`, build report |
| AC-9 | `hyperframes lint` passes on all compositions; trailer MP4 exists in `artifacts/`. | X-ANIM, T-052 |
| AC-10 | README lets a new person run, test, simulate and build in ≤ 5 commands. | T-092 |

---

## 2. ARCHITECTURE AND SHARED CONTRACTS

### 2.1 Stack

| Concern | Choice | Note |
|---|---|---|
| Language/build | TypeScript, Vite, pnpm workspaces | Versions: latest stable at provisioning, pinned by lockfile. |
| UI shell | React + Zustand | Screens, HUD, shop. State store mirrors `GameCore` snapshots. |
| Slot cabinet | DOM + GSAP | DOM so the same markup is a HyperFrames composition. |
| Board render | PixiJS (WebGL, canvas fallback) | Draws pinfield and shelf from `SimSnapshot`. |
| Simulation | Custom circle-body solver | Ported from the prototype's model, made deterministic. No third-party physics. |
| Animation/video | GSAP timelines; HyperFrames CLI for lint/preview/render | Render needs FFmpeg. |
| Schemas | Zod (types inferred) | Content, save files, commands. |
| Tests | Vitest, Playwright | |
| Audio | WebAudio API | |
| CI | GitHub Actions | lint, typecheck, test, build, e2e. |

### 2.2 Repository layout and ownership

```
jackpotsyndicate/
  package.json, pnpm-workspace.yaml, tsconfig.base.json,
  eslint.config.js, vitest.workspace.ts, .github/workflows/ci.yml   # T-001
  packages/
    contracts/        # T-002  types, zod schemas, constants, tick schedule, fixtures
    content/          # T-030  JSON data + validation   (balance.json: T-082 after T-030)
    engine/src/
      rng/ slot/core/ scoring/          # T-010
      slot/wirings/ mutations/          # T-011
      run/ save/                        # T-012
      effects/ items/                   # T-013
      shop/                             # T-014
      boss/                             # T-015
    physics/src/
      kernel/                           # T-020
      pachinko/                         # T-021
      pusher/                           # T-022
    core/             # T-080  GameCore: composes engine + physics, command log, replay, hash
    anim/             # X-ANIM  delivered by the external HyperFrames agent; do not dispatch bees here
                      #         T-052 edits only: src/contracts-shim.ts, package.json, sprite wiring, trailer re-render
    audio/            # T-060
    board-render/     # T-071
  apps/game/src/
    app/ theme/ components/ store/ screens/_stubs   # T-070
    screens/table/                      # T-072
    screens/meta/                       # T-073  shop, elevator, boss, gameover, victory, compendium
  tools/
    assets/           # T-040  assetrizz ingest -> apps/game/public/atlas/, asset-manifest.json
    sim/              # T-081  headless bots and reports
  e2e/                # T-090
  docs/, README.md, .github/workflows/deploy.yml    # T-092
  artifacts/          # trailer, sim reports (generated)
```

Single-owner shared files: root config and lockfile (T-001, then Hermes), `packages/contracts/**` (T-002, then Hermes only), `content/balance.json` (T-082), `asset-manifest.json` (T-040), `apps/game/src/app/routes.tsx` (T-070; T-072/T-073 only replace their own stub screen modules).

### 2.3 Component boundaries

```
 UI (React)  --Command-->  GameCore  --tick-->  engine (rules, pure)
     ^                        |                 physics (SimWorld, pure)
     |<-- Snapshot + Events --+
 anim (GSAP)  <- Events       board-render (Pixi) <- SimSnapshot       audio <- Events
```

- `engine` and `physics` never import each other; both import only `contracts`. `core` is the only place they meet.
- `anim`, `audio`, `board-render` are event/snapshot consumers. They never mutate game state.
- `apps/game` talks to `core` only through `GameCore`.

### 2.4 Contracts frozen by T-002 (must exist before group G1 starts)

| ID | Contract | Contents |
|---|---|---|
| C-1 | Content schemas | Zod schemas for symbols, trinkets, drinks, coins, chassis items, floors, bosses, shop archetypes, balance. |
| C-2 | Commands and events | Discriminated unions below. |
| C-3 | `SimWorld` | Physics interface, body types, `SimSnapshot`, physics event types. |
| C-4 | Effect hooks | Hook names, payloads, and the modifier-bag shape trinkets write to. |
| C-5 | `RunState` and save format | Serializable run state, `SAVE_VERSION`, state-hash definition. |
| C-6 | Animation contract | `TimelineFactory` signature, tick schedule constants, DOM anchor attributes. |
| C-7 | Asset manifest | Logical key list and manifest JSON shape. |
| C-8 | Test surface | `data-testid` list and the `window.__JS_TEST__` API. |
| C-9 | Design tokens | Colors, fonts, spacing from the blueprint theme (obsidian `#07090e`, gold `#fbbf24`, cyan `#06b6d4`, crimson `#f43f5e`, emerald `#10b981`; Inter, JetBrains Mono, Outfit, self-hosted). |

**C-2 Commands** (UI → core): `NewRun{seed}`, `LoadCoin{coinId}`, `Drink{slot}`, `Spin`, `ContinueAfterRound`, `ShopBuy{offerId, target?}`, `ShopReroll`, `ShopExpand`, `ShopLeave`, `ChooseFloor{floorId}`, `ChooseRelic{index}`, `ChooseJumper{index}`, `SetOvervolt{lineId}`, `AbandonRun`.

**C-2 Events** (core → consumers, each stamped with `tick`): `SpinStarted`, `ReelStopped{col, symbols}`, `SpinEvaluated{wins, chips, addMult, xMult, orbPlan}`, `TumbleStep`, `OrbLaunched`, `PegHit{pegId, kind}`, `OrbSplit`, `ChuteExit{chute, mult}`, `TokenSpawned`, `TokenMerged`, `LipDrop{cash}`, `GutterLoss`, `DozerFullExtension`, `SurgeStarted`, `FeverTriggered`, `BossScored{delta, total}`, `BossSabotage{kind}`, `RoundSettled{result}`, `PhaseChanged{from, to}`, `ShopRolled{archetype, offers}`, `ItemBought`, `TrinketMounted`, `GridMutated`, `BankrollChanged{delta, reason}`, `RunEnded{outcome}`.

**C-3 SimWorld:** implemented and frozen. The interface is `packages/contracts/src/sim.ts`; usage, the event-to-engine mapping and the determinism rules are in `docs/PHYSICS.md`. Board geometry constants are in `packages/contracts/src/constants.ts` (`BOARD`, `SIM`).

**C-4 Effect hooks:** `onRunStart`, `onSpinStart`, `onCellScored`, `onSpinEvaluated`, `onOrbLaunch`, `onPegHit`, `onChuteExit`, `onTokenSpawn`, `onDozerFullExtension`, `onGutterLoss`, `onLipDrop`, `onRoundEnd`, `onShopEnter`, `physicsModifiers`. The exact unions are in `packages/contracts/src/protocol.ts`. Handlers are pure functions `(ctx, payload) => Effect[]` where `Effect` is a closed union (`addChips`, `addMult`, `mulX`, `addNextSpinX`, `addCash`, `spawnToken`, `simDirective`, `setPhysicsMod`, `flagOrb`). Content items reference handlers by id plus params.

**C-5 State hash:** FNV-1a of `canonicalJSON(RunState without UI fields)` concatenated with `SimWorld.hash()`.

**C-6 Animation**

This contract is **already in use by the external animation agent** (K-5). T-002 must export exactly these names and values; they are not open for redesign.

```ts
export const TICKS_PER_SECOND = 60;
export const REEL_STOP_TICK = (col: number) => 30 + 12 * col;   // 0-based col, ticks after Spin
export const EVAL_DELAY_TICKS = 6;          // evaluation at last reel stop + 6
export const ORB_LAUNCH_DELAY_TICKS = 6;    // first orb at evaluation + 6
export const ORB_LAUNCH_INTERVAL_TICKS = 6;

export type SymbolId = 'diamond' | 'cherry' | 'uranium' | 'skull' | 'seven';
export type BossId = 'valenti' | 'zero' | 'auditor';
export type FloorId = 'FLOOR_NEON' | 'FLOOR_CRYO' | 'FLOOR_FOUNDRY' | 'FLOOR_PENTHOUSE';
export type SpriteResolver = (logicalKey: string) => { url: string; x: number; y: number; w: number; h: number } | null;
export type TimelineFactory<P> =
  (root: HTMLElement, params: P, tokens: DesignTokens, sprites: SpriteResolver) => gsap.core.Timeline; // returned paused
```

`DesignTokens` is the C-9 object (colors and fonts as listed there). Content ids for symbols, bosses and floors must equal these string literals.

Rules: built entirely at creation; no callbacks that change game state; any variation comes from `params`; elements are found by `data-anim="<anchor>"`; every factory takes `reducedMotion: boolean`. The live player sets timeline time from the sim tick (`(tick − startTick) / 60`) so 2×/4× speed stays in sync.

Fixed durations the engine schedules against (ticks): `reelSpin` = last reel stop + 6; `tumbleStep` 36; `gridRelayout` 90; `fever` 60; `bossIntro` 180; `floorTransition` 150; `victory` 240; `gameOver` 180. `GameCore` holds the phase for these durations (tumble steps delay the orb plan by 36 ticks each; scenes are skippable in the UI, which only fast-forwards the timeline).

**C-8 Test API** (present only with `?test=1`): `newRun(seed)`, `dispatch(cmd)`, `runUntil(phase|predicate, maxTicks)`, `getState()`, `stateHash()`, `setSpeed(n)`. Required test ids include `spin-btn`, `bankroll`, `quota`, `spins-left`, `fever`, `floor-badge`, `trinket-rail`, `trinket-<id>`, `shop-offer-<n>`, `shop-reroll`, `shop-expand`, `shop-leave`, `elevator-<floorId>`, `boss-bar`, `seed-display`, `gameover`, `victory`, `settings-mute`, `settings-motion`.

### 2.5 Phase machine and tick loop

`TITLE → PREP → SPINNING → RESOLVING → (PREP | ROUND_SETTLE) → ROUND_RESULT → (SHOP → PREP | BOSS_INTRO → PREP | ELEVATOR → PREP | GAME_OVER | VICTORY)`

- `PREP`: `LoadCoin`, `Drink`, `SetOvervolt`, `Spin` allowed. `Spin` is accepted when no orbs are in flight or queued.
- `SPINNING`: reels stop on schedule. `RESOLVING`: orbs fall; the pusher always runs. Returns to `PREP` when orb count is 0.
- The pusher simulates only during `PREP`, `SPINNING`, `RESOLVING`, `ROUND_SETTLE`; it is frozen in menus (saves are taken while frozen).
- `GameCore.tick()` order: apply queued commands → engine scheduled actions for this tick → `SimWorld.step()` → route physics events through effect hooks → apply resulting effects → emit events. The browser loop uses a fixed-step accumulator; render interpolates.

### 2.6 Scoring and symbol rules (normative)

Per spin, over all winning evaluations:

- `A = 1 + Σ additive mult` (each winning line/way/cluster contributes its symbol's +Mult once, plus drink/trinket additions)
- `X = Π x-mult` (symbol, drink, trinket and carried "next spin" bonuses)
- Each scoring cell `i` yields one orb with `chips_i = symbolChips × Σ lineMult of evaluations containing it` (lineMult is 1, or 3 on the overvolted line; for WAYS it is the way count for that symbol; CLUSTER uses cluster size ÷ 4).
- In the pinfield `chips_i` grows by peg bonuses (gold +5, bumper +15, plus modifiers). A cloned orb copies the chips at split time.
- On chute exit: `tokenCash = round(chips_i × A × X × chuteMult × coinPayoutMult × CASH_PER_CHIP)`.
- On lip drop: `bankroll += round(tokenCash × floor.lipMult × lipModifiers) + flat bonuses`.
- HUD "Spin Equity" = `Σ chips × A × X × CASH_PER_CHIP` at evaluation time.

| Symbol | Slot | Pachinko | Pusher |
|---|---|---|---|
| Blood Diamond (rare) | 45 chips, +4 Mult; +0.2 X per orthogonally adjacent Magnet Skull | mass 1.6, elasticity 0.60; hitting a gold peg also triggers gold pegs within 45 units | radius 11, friction 0.35; on landing welds to the 2 nearest tokens (weld group resists lateral separation ×0.25) |
| Splitter Cherry (common) | 20 chips, +2 Mult; reel-1 strip places cherries in adjacent pairs | mass 0.75, elasticity 0.88; always `canSplit`; also splits on its first peg hit of any kind | spawns 2 micro-medals, radius 6.5, friction 0.50, each half the cash |
| Uranium-235 (epic) | 65 chips, ×1.8 X | mass 1.3, elasticity 0.96; +12% speed per peg hit (cap ×2); each hit adds +15 chips to every other orb in flight | radius 10, friction 0.25; at each dozer full extension pushes tokens within 45 units 6 units toward the lip |
| Magnet Skull (cursed) | 30 chips, +5 Mult; drains 25 if visible and not scoring | mass 1.25, elasticity 0.70; pulls itself and orbs within 60 units toward centre X | radius 9.5; pulls tokens within 60 units toward centre X; drains 50 if it falls in a gutter |
| Overclocked Seven (legendary) | 77 chips, +7 Mult, ×1.5 X (×5.0 instead when it fills a whole line); 3+ visible sevens trigger Fever immediately | mass 1.1, elasticity 0.82; upgrades a struck gold peg to a 2× golden bumper for the rest of the floor | spawns a bullion tower: radius 12; one token drawn as a 3-high bullion tower (`stack: 3`) worth 3× cash |

Scrap Copper orb: 15% of the cheapest symbol's chips, mass 1.0, elasticity 0.8, radius-10 token, no behaviours.

### 2.7 Items (initial content)

**Trinkets** (prices marked * are defaults; others from the blueprint shop pool)

| Trinket | Price | Effect |
|---|---|---|
| Quantum Splitter Coil | 200* | Every 2nd orb launched gains `canSplit`. |
| Electromagnetic Hopper | 220* | Constant pull toward centre X on all orbs and tokens. |
| Vampiric Stepper Motor | 300* | ×1.5 X every spin. |
| Vampiric Rake Collector | 310 | Each token lost to a gutter adds +0.25 X to the next spin (cap +2.0). |
| Gold Peg Alchemist | 250* | Peg hits +15 chips; every token +40 cash. |
| Turbo Dozer Cam | 200* | Dozer speed and push +30%. |
| Hydraulic Dozer Piston | 240 | Dozer stroke +25%. |
| Rubber Gutter Bumper | 200* | 50% of tokens reaching a gutter bounce back (seeded roll). |
| Gutter Guard Bumper | 180 | 35% of tokens reaching a gutter bounce back; rolls independently of other bumpers. |
| Ouroboros Capacitor | 280* | Each lip drop adds +0.25 X to the next spin (cap +3.0). |
| Loaded Platinum Die | 150* | +20 chips per scoring cell. |
| Overvolted Solenoid | 180* | +1 extra copper token spawned on the shelf each spin. |
| VIP Bullion Stamp | 260* | Lip payouts +25%. |
| Tesla Peg Capacitor | 260 | Every 3rd peg hit nudges all shelf tokens 4 units toward the lip. |
| Midas Lip Sensor | 390 | +75 cash per lip drop. |

**Drinks:** Dirty Syndicate Martini 110 (+2 bonus orbs, +1.0 Mult next spin); Alchemist Absinthe 160 (+1.0 X next spin, spawns a 3-bullion stack); Green Fairy Absinthe 140* (×1.5 X next spin, dozer surge); Nitrous Espresso 120* (+4 bonus orbs next spin); Lubricant Oil Shot 95 (instant dozer surge).

**Coins:** Copper Token (owned; mass ×1.0, bounce ×1.0); Heavy Lead Slug 150* (×1.6, ×0.7, resists suction); Polymer Superball 150* (×0.7, ×1.35); Blood Doubloon 200* (×1.15, ×1.1, payout ×2, costs 50 per spin).

**Reel glyphs:** Blood Diamond 220 (+2 diamond tokens on shelf); Lucky Seven 350 (+1 bullion stack); Uranium 290 (+1 uranium token); Cherry 90*; Magnet Skull 60*.

**Chassis*:** +Reel column 400 then 900; +Row 600; HYPER harness 300; WAYS harness 500; CLUSTER harness 500; Jumper wire 200 each; Overvolt 350.

**Floors** `[SPEC-MAP-F1..F3]`

| Floor | friction | gutterRisk | dozerSpeed | Extra | Shop weights |
|---|---|---|---|---|---|
| 1 Neon Vault | 0.90 | 1.00 | 0.050 | baseline | drinks/trinkets/reels/coins 25 each |
| 2A Cryo-Freezer Lounge | 0.96 | 1.35 | 0.075 | ice shelf | 60% drinks |
| 2B Smuggler's Blast Foundry | 0.84 | 0.65 | 0.045 | pegs +25 chips per hit | 65% trinkets and lead/uranium items |
| 3 Velvet Penthouse | 0.91 | 1.15 | 0.065 | lipMult 1.5; quotaScale and boss scale 2.2 | rare/legendary glyphs weighted up |

`gutterRisk` sets the width of the bevelled strip beside each gutter (`26 × gutterRisk²` units). Measured rake over 10,000 bot spins per floor: Neon 19.1%, Cryo 23.1%, Foundry 11.6%, Penthouse 22.6%, all inside AC-5.

**Balance (initial):** start bankroll 500; quota for normal round `n` (1–9) = `round(1000 × 2.1^(n−1)) × floor.quotaScale`; `CASH_PER_CHIP` 1.0; 7 spins per round.

### 2.8 Assets

`tools/assets` reads a config mapping each logical key to assetrizz search terms, preferred style pack and category. It resolves against `assets/manifest.jsonl` at a pinned commit, records the chosen path and SHA-256, downloads only those PNGs, and emits atlases plus `asset-manifest.json` (`{key: {atlas, frame, pivot, source, sha256} | {placeholder: true}}`). One style pack is used for all gameplay sprites for visual consistency. Logical keys: `symbol.{diamond,cherry,uranium,skull,seven,scrap}`, `token.<same>`, `token.bullion`, `token.ice`, `peg.{gold,splitter,bumper,golden}`, `trinket.<id>` ×15, `drink.<id>` ×5, `coin.<id>` ×4, `chassis.<id>`, `boss.{valenti,zero,auditor}`, `floor.<id>.bg` ×4, `ui.{cabinet,bezel,dozer,lip,gutter,panel,button}`, `vfx.{spark,coinburst,shock,freeze}`. Boss portraits use assetrizz portraits (invented faces only).

### 2.9 Configuration

Build-time env only: `VITE_BUILD_SHA`, `VITE_BASE_PATH` (for sub-path hosting), `VITE_ENABLE_TEST_API` (default off in production builds, on via `?test=1` in preview/e2e builds). localStorage keys: `js.save.v1`, `js.settings.v1`, `js.compendium.v1`.

### 2.10 Test fixtures (owned by T-002 unless noted)

- `fixtures/content.min.json`: 2 symbols, 2 trinkets, 1 floor; used by unit tests.
- `fixtures/snapshot.static.json`: hand-authored `SimSnapshot` with pegs, 6 orbs, 30 tokens; lets T-071 start before physics exists.
- `fixtures/events.sample.json`: one spin's event stream; lets T-060 and T-070 start before core exists.
- `fixtures/grids/*.json`: grids with expected wins per wiring (T-010 and T-011 add cases in their own subfolders).
- `fixtures/replay.golden.json`: seed + command log + expected hash to Victory (created by T-081, hash updated only by T-082).
- `MockGameCore` in `contracts/testing`: replays `events.sample.json`; used by UI tasks.

### 2.11 External animation package (`packages/anim`)

Built by a separate HyperFrames agent, in parallel, outside Hermes's task dispatch.

**What arrives:** a self-contained package (`@jackpot-syndicate/anim`, renamable) containing:

- `src/contracts-shim.ts`: its local copy of the C-6 types and constants.
- `src/runtime/`: `createCabinet(root, {cols, rows}, tokens, sprites)`, `TimelinePlayer` (`play`, `syncToTick`, `stop`, `onComplete`), default sprite resolver with vector placeholders.
- `src/reels/`: `reelSpin`, `lineWin`, `tumbleStep`, `gridRelayout`.
- `src/scenes/`: `fever`, `bossIntro`, `floorTransition`, `victory`, `gameOver`.
- `compositions/` (one per factory plus `trailer/`), `fixtures/`, tests, a demo page, `artifacts/trailer.mp4`, and a README "Merge notes" section listing exports, `data-anim` anchors, sprite keys and deviations.

**Factory params Hermes's code must supply** (from events and state):

| Factory | Params |
|---|---|
| `reelSpin` | `cols`, `rows`, `finalGrid: SymbolId[][]` (by column), `frozenCells?`, `seed`, `reducedMotion` |
| `lineWin` | `cols`, `rows`, `wins: {cells, kind: 'line'\|'ways'\|'cluster', overvolt?}[]` in orb-launch order, `reducedMotion` |
| `tumbleStep` | `cols`, `rows`, `cleared`, `gridAfter` |
| `gridRelayout` | `from {cols, rows}`, `to {cols, rows}` |
| `bossIntro` | `bossId`, `bossName`, `tagline` |
| `floorTransition` | `fromFloor`, `toFloor`, `floorName` |
| `victory` / `gameOver` | `seedText`, plus `bankroll` / `floorName`, `round` |

`SpinEvaluated.orbPlan` order must equal the `lineWin` cell order, so symbols visibly detach in the order orbs launch.

**Rules for Hermes:**

1. T-002 copies C-6 verbatim from this spec. If the delivered shim differs from C-6, the **shim wins** for names and values already used by animation code; Hermes updates `contracts` and notes it in `CONTRACTS.md`.
2. Early sync: as soon as the animation agent pushes its interface-only commit (shim + empty factory signatures), Hermes diffs it against `contracts` and resolves differences before G1 finishes.
3. No bee edits `packages/anim` except T-052, and T-052 does not change animation behaviour. Animation bugs go back to the animation agent or the owner.
4. Until the package lands, UI work (T-070) codes against the C-6 types with a no-op stub factory, so nothing waits on it except T-052.
5. Sprite keys the animation uses (`symbol.<id>`, `boss.<id>`, `floor.<FloorId>.bg`) are already in C-7; T-040 must cover them.

---

## 3. EXECUTABLE TASK GRAPH

Groups run in order; tasks inside a group run concurrently. Every task's verification includes `pnpm lint && pnpm typecheck` on its scope.

| Task | Reqs | Deliverable | Acceptance criteria | Depends on | Owns | Verify | Group |
|---|---|---|---|---|---|---|---|
| **T-001** Repo and CI *(partly done, see 0.1)* | delivery | In the existing `mojomast/jackpotsyndicate` (D-13): keep the existing root files and passing tests; if `packages/anim/` is present, leave it untouched and remove its package-local lockfile in favour of the root one. Remaining workspace scaffold, all package stubs with `package.json`, all planned dependencies installed, lint rules incl. banned-API rule for sim packages, CI workflow. | Fresh clone: `pnpm install && pnpm build && pnpm test` green on empty stubs; CI green; banned-API rule fails a planted `Math.random` in `engine`. | — | root config, lockfile, `.github/workflows/ci.yml`, package stubs | CI run | G0 |
| **T-002** Contracts *(mostly done, see 0.1; finish the remaining items only)* | all (C-1..C-9) | `packages/contracts`: schemas, types, constants, tick schedule, sine table, hook and event unions, test-id list, design tokens, fixtures, `MockGameCore`. | Compiles; schema round-trip tests pass on fixtures; every contract in 2.4 exported; a `CONTRACTS.md` lists each with examples. | T-001 | `packages/contracts/**` | `pnpm -F contracts test` | G0 |
| **T-010** Slot core and scoring | R-SLOT-01..03, R-CORE-02, R-CORE-03 | Seeded RNG (splittable streams), reel strips, grid draw, CLASSIC evaluator, scoring per 2.6, orb plan. | Golden grids produce expected wins/chips/A/X; RNG sequence test fixed; dead spin yields one scrap orb; 1e6-spin property test has no NaN/negative. | T-002 | `engine/src/{rng,slot/core,scoring}` | `pnpm -F engine test slot scoring` | G1 |
| **T-011** Wirings and mutations | R-MUT-01..06 | HYPER, WAYS, CLUSTER (with tumble) evaluators behind the `WiringEvaluator` contract; grid resize; jumper generation; overvolt. | Golden grids per wiring for 3×3, 4×3, 5×4; WAYS count matches brute force on 500 random grids; tumble stops at 5; jumper offers are deterministic per seed. | T-002 | `engine/src/{slot/wirings,mutations}` | `pnpm -F engine test wirings` | G1 |
| **T-014** Shop | R-SHP-01..03, R-SLOT-05 | Archetype roll, offer generation with floor weights, reroll/expand pricing, purchase validation returning effects. | Distribution test: archetype and category frequencies within 2% of weights over 100k rolls; price curves exact; cannot overspend; capacity cap 10. | T-002 | `engine/src/shop` | `pnpm -F engine test shop` | G1 |
| **T-020** Physics kernel *(DONE, see 0.1; do not dispatch)* | R-CORE-03, R-CORE-05 | Body store, fixed-step integrator, circle–circle and circle–wall resolution, serialize/deserialize, hash, `SimWorld` skeleton with chamber plug-in points. | Serialize → deserialize → 1,000 steps equals uninterrupted run (hash); same result in Node and headless Chromium/Firefox/WebKit; 200 bodies step < 1 ms in Node. | T-002 | `physics/src/kernel` | `pnpm -F physics test kernel` | G1 |
| **T-030** Content data | R-NFR-05, R-TRK-02, R-ITM-01, R-BOS-02..04 | All JSON from 2.6–2.7: symbols, strips, 15 trinkets, 5 drinks, 4 coins, glyphs, chassis, 4 floors with peg layouts, 3 bosses, shop archetypes, initial `balance.json`, compendium text. | Validates against C-1; every handler id exists in the C-4 list; every sprite key exists in C-7; ids unique. | T-002 | `packages/content/**` | `pnpm -F content test` | G1 |
| **T-040** Asset pipeline | R-AST-01, R-NFR-03 | `tools/assets` CLI; chosen-asset lockfile with hashes; atlases; `asset-manifest.json`; placeholder generator; contact sheet of chosen sprites for owner review. | All C-7 keys resolve; hashes verify on re-run; re-run is byte-identical; atlases ≤ 1.5 MB total; report lists placeholder keys. | T-002 | `tools/assets/**`, `apps/game/public/atlas/**` | `pnpm assets:build && pnpm assets:verify` | G1 |
| **X-ANIM** External animation package *(not dispatched by Hermes)* | R-ANI-01..03 | `packages/anim` as described in 2.11, delivered by the external HyperFrames agent. | Its own suite passes: seek idempotence, timing equals C-6, all 6 grid sizes, reduced motion, banned-API check, `hyperframes lint`, trailer MP4 (or documented gap). | — (external; runs from day 0) | `packages/anim/**` | package's own `pnpm test`, hyperframes lint | external |
| **T-052** Anim merge and wiring | R-ANI-01..03, R-AST-01, AC-9 | Merge `packages/anim` into the workspace; replace `contracts-shim.ts` contents with re-exports from `contracts`; align package name, tsconfig, lint; provide an atlas-backed `SpriteResolver` from `asset-manifest.json`; re-render the trailer with real sprites; copy it to `artifacts/`. | Package's own tests still pass unchanged after the shim swap; workspace `pnpm build` green; no type duplicated between shim and `contracts`; `hyperframes lint` clean; trailer shows real sprites (or placeholders listed); merge-notes deviations are each resolved or recorded. | X-ANIM, T-002, T-040 | `packages/anim/src/contracts-shim.ts`, `packages/anim/package.json`, `packages/anim/tsconfig.json`, `apps/game/src/store/spriteResolver.ts`, `artifacts/trailer.mp4` | `pnpm -F anim test`, hyperframes lint/render | G2 (or on arrival) |
| **T-060** Audio | R-AUD-01 | Event-driven WebAudio synth with voice limiting, mute/volume, unlock on first gesture. | Each mapped event triggers its voice (mock AudioContext test); ≤ 16 simultaneous voices under a 200-event burst; mute is silent. | T-002 | `packages/audio/**` | `pnpm -F audio test` | G1 |
| **T-070** UI shell | R-UI-01..05 | No-op stub `TimelineFactory` and cabinet mount point typed against C-6 (2.11 rule 4). App scaffold, theme from C-9, router with stub screens, Zustand store bound to a `GameCore` interface, HUD, cascade equation, trinket rail, log, settings, Title, all test ids, test API bridge; runs on `MockGameCore`. | Storybook-free demo route plays the sample event stream; all C-8 ids present; keyboard and focus checks pass; layouts correct at 1440, 1024, 390 widths. | T-002 | `apps/game/src/{app,theme,components,store,screens/_stubs}` | `pnpm -F game test`, component tests | G1 |
| **T-071** Board renderer | R-UI-01, R-NFR-02 | **2.5D** shelf per K-3 using `projectShelf` from contracts: perspective, coin thickness, `stack` towers, `lift`, shadows, the gutter bevel, coins tumbling over the lip and into gutters from exit events; `tools/physics-viewer` is the visual reference. Pixi renderer for pinfield, chutes, dozer, shelf, gutters, lip, orbs, tokens, particles, floor skins; interpolation; event-driven VFX. | Renders `snapshot.static.json` matching a reference screenshot (tolerance 1%); stress scene 150 tokens + 48 orbs ≥ 60 fps on CI's software-GL budget equivalent (frame work < 6 ms); placeholder-safe. | T-002 | `packages/board-render/**` | `pnpm -F board-render test`, screenshot test | G1 |
| **T-012** Run machine and saves | R-CORE-04, R-RUN-01..07 | Phase machine, round/floor progression, quota rule, fever, floor graph, seed handling, save/load with versioning. | Table-driven transition tests incl. every illegal command; quota deduction exact; save → load → continue equals uninterrupted (engine hash); corrupt save rejected. | T-010 | `engine/src/{run,save}` | `pnpm -F engine test run save` | G2 |
| **T-013** Effects and items | R-TRK-01..02, R-ITM-01, R-SLOT-04 | Hook dispatcher, modifier bag, all trinket/drink/coin handlers, slot-stage symbol behaviours, stacking rules, caps. | One unit test per item proving its effect and its stacking; caps enforced; handlers pure (no state mutation outside returned effects). | T-010, T-030 | `engine/src/{effects,items}` | `pnpm -F engine test effects items` | G2 |
| **T-021** Pachinko chamber *(DONE; do not dispatch)* | R-PCH-01..05, R-CORE-01 | Pegs, splitters, bumpers, chutes, launch queue, stuck-orb failsafe, symbol pinfield behaviours, peg upgrade persistence. | 10k seeded orbs: all exit, chute histogram snapshot fixed; in-flight never > 48; split only with `canSplit`; exit X equals reported X; deterministic hash. | T-020 | `physics/src/pachinko` | `pnpm -F physics test pachinko` | G2 |
| **T-022** Pusher chamber *(DONE; do not dispatch)* | R-PSH-01..05, R-CORE-01 | Dozer, shelf, friction, gutters, lip, surge, weld groups, magnet, shockwave, micro-medals, bullion, ice blocks, suction, sweep, merge-at-cap, gutter bounce hook. | Conservation test: tokens in = lip + gutter + on shelf + merged; rake harness within AC-5 bands for all 4 floors; 150 tokens stable (no tunnelling, no jitter energy gain over 10k ticks); deterministic hash. | T-020 | `physics/src/pusher` | `pnpm -F physics test pusher` | G2 |
| **T-015** Bosses | R-BOS-01..04 | Boss score functions, sabotage schedules as `SimDirective`s and grid freezes, rewards, tug-of-war value. | Score sequences fixed per seed; freeze never targets an already-frozen cell; Auditor curve exact; reward effects applied once. | T-012 | `engine/src/boss` | `pnpm -F engine test boss` | G2 |
| **T-080** GameCore integration | R-CORE-01..05, R-RUN-03, R-ANI-03 | `packages/core`: tick loop per 2.5, command queue and log, event bus, effect routing between engine and physics, replay runner, combined hash, browser loop driver with speed control. | A scripted run plays to `RoundSettled` headless; replay of its log reproduces the hash; cross-browser hash test passes; ≥ 200× real time in Node; all C-2 events emitted at least once in an integration test. | T-012, T-013, T-014, T-015, T-021, T-022, T-011 | `packages/core/**` | `pnpm -F core test`, `pnpm test:replay` | G3 |
| **T-081** Sim CLI and bots | R-CORE-05, AC-5..7 | `pnpm sim {rake,hitrate,balance,replay}`; random-buyer and greedy-synergy bots; CSV/Markdown reports; creates `replay.golden.json`. | Commands run and write reports to `artifacts/sim/`; 2,000 runs finish < 10 min on CI; golden replay reaches Victory or, if unreachable with initial balance, the best run is recorded and flagged for T-082. | T-080 | `tools/sim/**`, `fixtures/replay.golden.json` (create) | `pnpm sim balance --runs 200` | G4 |
| **T-072** Table screen | R-UI-01..04, R-CORE-01, J1, J6 | Real Table screen: cabinet DOM + anim player + board renderer + HUD + audio wired to `GameCore`; prep controls (coin, drinks, overvolt); grid mutation re-layout; speed control. | J1 manually and via test API; grid re-layout after mutation without reload; no state mutation outside commands (store is read-only mirror); 60 fps in the stress scene. | T-080, T-052, T-070, T-071, T-060, T-040 | `apps/game/src/screens/table/**` | `pnpm -F game test`, local e2e smoke | G4 |
| **T-073** Meta screens | R-UI-01, R-SHP-01..03, R-RUN-05..07, R-BOS-01, J2–J5, J7 | Shop (with reel/jumper target pickers), Elevator, Boss Intro, Boss tug-of-war bar, Round Result, Game Over, Victory, Compendium, resume prompt, seed entry. | J2–J5 via test API; every purchase type usable; relic pick works; seed copy works; resume restores mid-run. | T-080, T-070, T-052, T-040 | `apps/game/src/screens/meta/**` | `pnpm -F game test`, local e2e smoke | G4 |
| **T-082** Balance tuning | AC-5..7, D-14 | Tuned `balance.json`, strip weights, prices; balance report; updated golden replay hash. | AC-5, AC-6, AC-7 all in band; report committed; golden replay reaches Victory. Only data files change. | T-081 | `content/balance.json`, `content/strips.json`, price fields, golden hash | `pnpm sim rake && pnpm sim hitrate && pnpm sim balance` | G5 |
| **T-090** E2E suite | AC-3, AC-4, J1–J8 | Playwright tests for J1–J8 on three engines plus mobile viewport; cross-browser golden replay; zero-network assertion. | All green in CI; flake rate 0 over 5 consecutive runs. | T-072, T-073 | `e2e/**` | `pnpm e2e` | G5 |
| **T-091** Hardening | R-NFR-01..03, R-UI-03..04, AC-8 | Perf script and fixes, bundle budget check, a11y pass (axe), reduced-motion audit, touch targets, error boundary with save-safe recovery. | `pnpm perf` meets R-NFR-02; bundle report ≤ 3 MB gzip; axe has no serious/critical issues; J8 passes. | T-072, T-073 | may edit `apps/game/**` and `packages/board-render/**` (no other UI task is active) | `pnpm perf`, `pnpm e2e -g J8` | G5 |
| **T-092** Docs and delivery | AC-1, AC-10 | README, `docs/ARCHITECTURE.md`, `docs/CONTENT_GUIDE.md` (add a trinket/floor), `docs/BALANCE.md`, asset credits, `deploy.yml` (manual-dispatch only), release zip of `dist/`. | New-clone walkthrough works verbatim; deploy workflow builds an artifact but publishes nothing without manual approval. | T-080 (draft), final after T-090 | `README.md`, `docs/**`, `.github/workflows/deploy.yml` | follow README on a clean checkout | G5 |
| **T-093** Final acceptance | AC-1..10 | Hermes runs every completion check on the integrated main branch and produces an acceptance report with traceability (requirement → test). | All AC rows pass or are listed with an owner-facing explanation. | all | `artifacts/acceptance.md` | full command list in 4.5 | G6 |

**Parallelism summary:** with the physics already built, G1 runs 8 bees at once on disjoint paths and G2 runs 4 (including T-052 when the animation package has arrived). The only narrow point is T-080. X-ANIM runs outside the graph from day 0; only T-052, T-072 and T-073 wait on it, and T-080, the sim and balance work do not.

---

## 4. INTEGRATION AND VERIFICATION

### 4.1 Critical path

`T-001 → T-002 → T-010 → T-012/T-013 → T-080 → T-081 → T-082 → T-093`

The physics leg (T-020 → T-022) is already complete. T-080 (integration) now carries the most risk; give it the strongest bee, and have it read `docs/PHYSICS.md` first.

### 4.2 Early interface checks (before a group's work is accepted)

1. **After T-002:** Hermes compiles a throwaway file per G1 task that imports only the contract symbols that task needs. Missing symbols are fixed in `contracts` now, not later.
2. **Mid-G1 (first commit of each bee):** each bee pushes an interface-only commit (exported signatures, no bodies). Hermes type-checks `core`'s planned imports against them.
3. **T-020 hand-off:** T-021/T-022 start from the kernel's interface commit, not its completion.
4. **Animation shim sync:** when the external agent pushes its interface-only commit, Hermes diffs `contracts-shim.ts` against `contracts` C-6 and reconciles (2.11 rules 1–2). Target: before B1c.
5. **Contract changes:** a bee that needs a contract change files a request; Hermes edits `contracts`, bumps `CONTRACTS_REV`, and notifies affected tasks. Bees never edit `contracts`.

### 4.3 Integration order and batch checks

| Batch | Merge | Consolidated check |
|---|---|---|
| B0 | T-001, T-002 | CI green; fixtures validate. |
| B1a | T-010, T-011, T-014, T-030 | All golden grids pass with real content; shop rolls from real content. |
| B1b | T-020, T-040, T-060 | Cross-browser kernel hash; asset verify. |
| B1c | T-070, T-071 | Demo route: `MockGameCore` drives HUD, board renderer and audio together from `events.sample.json`; cabinet area uses the stub factory. First visible milestone. |
| B2 | T-012, T-013, T-015, T-021, T-022 | Engine-only scripted run (physics stubbed) reaches boss; physics-only harness passes rake bands. |
| B2x | X-ANIM + T-052 (whenever the package arrives, not later than B4) | Package tests pass after shim swap; demo route now plays real reel spin and line win from `events.sample.json` in tick sync at 1×/2×/4×; compositions lint. |
| B3 | T-080 | Headless full round; replay hash stable across Node and three browsers. |
| B4 | T-072, T-073, T-081 | Human-playable build; J1–J5 smoke via test API; sim reports generated. |
| B5 | T-082, T-090, T-091, T-092 | Merge T-082 first (it changes the golden hash), then T-090, T-091, T-092. Full AC run. |

### 4.4 End-to-end tests (Playwright, `?test=1`)

| Test | Steps and assertions |
|---|---|
| J1 | New run with fixed seed → click `spin-btn` → await `LipDrop` → `bankroll` increased by the event's cash; orb and token counts were > 0. |
| J2 | `runUntil(SHOP)` → buy first affordable trinket → `trinket-<id>` visible on rail → bankroll reduced by price → leave → next round's first spin shows the trinket's effect in the event log. |
| J3 | Scripted log to Floor 1 boss → `boss-bar` visible, suction directive active → `runUntil(ELEVATOR)` → click `elevator-FLOOR_CRYO` → `floor-badge` shows Cryo and `getState().floor.friction === 0.96`. |
| J4 | Seed known to fail round 1 with no spins skipped → `gameover` visible with seed → restart same seed → first `SpinEvaluated` identical. |
| J5 | Reach shop → reload page → resume → `stateHash()` equals pre-reload hash. |
| J6 | Grant funds via test API → buy +Reel and WAYS harness → grid has 4 columns, `getState().wiring === 'WAYS'`, next spin launches ≥ 1 orb and evaluates by ways. |
| J7 | Play `replay.golden.json` at max speed → `victory` visible → hash equals fixture. Runs on all three engines. |
| J8 | 390×844 viewport: no horizontal scroll, spin reachable; mute silences (audio graph gain 0); reduced motion swaps to short timelines; speed 4× finishes a spin in ≤ 30% of 1× wall time. |
| NET | Whole J1 run with request interception: zero requests after initial load. |

### 4.5 Final command list (T-093)

`pnpm install` · `pnpm lint` · `pnpm typecheck` · `pnpm test -- --coverage` · `pnpm assets:verify` · `pnpm build` · `pnpm test:replay` · `pnpm sim rake` · `pnpm sim hitrate` · `pnpm sim balance` · `pnpm e2e` · `pnpm perf` · hyperframes lint on `packages/anim/compositions`.

---

## 5. EXECUTION BOUNDARIES

### 5.1 Credentials and external services

| Item | Needed for | Status |
|---|---|---|
| GitHub access to run Actions on `mojomast/jackpotsyndicate` | T-001 onward | Required. Uses whatever Hermes already holds for the owner's account. |
| Read access to `github.com/mojomast/assetrizz` | T-040 | Public; no credential. Pin a commit SHA. |
| npm registry | all | Public. |
| HyperFrames CLI/skills, Node 22+, FFmpeg, headless Chrome | X-ANIM, T-052 | Local tooling; no account. Cloud rendering is not used. |
| `packages/anim` on `main` of `mojomast/jackpotsyndicate`, tag `anim-v1` | T-001, T-052, T-072, T-073 | Expected to be in place before Hermes starts. See D-13 and 5.2 H-4. |
| Push access to `mojomast/jackpotsyndicate` | all | Required. |
| Playwright browsers | T-090 | Installed in CI. |

No API keys, databases, analytics, or hosting accounts are required to reach completion.

### 5.2 Genuine blockers (need the owner)

| ID | Blocker | Blocks |
|---|---|---|
| H-1 | **Public deployment approval and target** (GitHub Pages, Netlify, itch.io, other). The deploy workflow stays manual until then. | Publishing only; not completion. |
| H-2 | **Asset rights for public release:** confirm the assetrizz license note (`pipeline/LICENSE.txt`) permits public distribution in a game. | Publishing only. |
| H-3 | **Public framing:** the game simulates slot, pachinko and pusher machines with play money. Owner confirms the public title/store wording and any age guidance before release. | Publishing only. |

| H-4 | **Animation defects after merge:** the package is expected on `main` at tag `anim-v1` before Hermes starts (D-13). The owner decides who fixes animation behaviour bugs found later (animation agent or a Hermes bee). | Only such fixes. If the tag is missing at start, Hermes reports it and proceeds per the note below. |

Nothing else blocks development, integration, or acceptance. If `packages/anim` has not arrived by the time B4 is otherwise ready, Hermes reports it and waits on T-052/T-072/T-073 rather than writing a replacement; engine, physics, core, sim and balance work continue to completion.

### 5.3 Decisions Hermes may make autonomously

- Exact library versions; minor library swaps that respect the contracts (e.g. state store).
- Which assetrizz sprites and style pack map to each logical key; when to use a placeholder (report the list).
- All balance numbers within AC-5..7 bands.
- Peg layouts per floor, VFX, SFX timbres, copy text, layout details within the design tokens.
- Splitting a task further or reassigning it, provided write scopes stay disjoint and `contracts` keeps a single editor.
- If FFmpeg is unavailable for the T-052 re-render: keep the externally rendered trailer, confirm lint and preview, and report that the trailer still shows placeholder sprites.
- How to reconcile small shim/contract differences (2.11 rule 1), as long as animation behaviour is unchanged.
- If an AC band proves unreachable without rule changes: ship the closest tuning, document the gap in `artifacts/acceptance.md`, and propose the rule change rather than altering 2.6 silently.

### 5.4 Assumptions

- The owner controls `mojomast/assetrizz` and its assets may be used in this project during development.
- GSAP's current standard license permits this use; T-001 records the license text in `docs/THIRD_PARTY.md` and flags any restriction.
- Mid-range targets: 4-core laptop with integrated graphics; 2022-class mid-tier phone.
- English only. No telemetry.
- The prototype HTML is reference material for feel and constants; it is not ported line by line.

### 5.5 Traceability

Every task row lists its requirement IDs; T-093 emits the inverse map (requirement → tasks → tests). Requirements with no dedicated task row are covered as follows: R-NFR-04 by CI coverage gate (T-001), R-NFR-05 by T-030 + T-013 tests, R-UI-05 by T-070 + the NET e2e test.
