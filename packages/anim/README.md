# @jackpotsyndicate/anim

## Reel animation v2

The `anim/reels-v2` branch replaces the four reel factories with cylindrical CSS
3D drums, velocity-linked SVG blur/ghosts, brass landing lights, near-miss tension,
tiered line/ways/cluster wins, analytical seeded particles, and folding relayouts.
All engine timing constants are unchanged. See `REVIEW-V2.md` for current evidence
and limitations; the original anim-v1 handoff below is retained as history.

### V2 merge notes

- Existing factory exports and required params are unchanged. The shim now
  re-exports shared contracts, including these additive optional fields:
  - `ReelSpinParams`: `floorId`, `grain`, `wiring`, `blurMode: 'svg' | 'echo'`.
  - `LineWinParams`: `seed`, `equity`, `winTier`, `launchOrder`, `floorId`, `grain`,
    `exitEdge: 'bottom' | 'right'`.
  - `TumbleStepParams` / `GridRelayoutParams`: `seed`, `floorId`, `grain`.
    `gridRelayout` currently uses deterministic geometry and reserves `seed` for
    optional future variation.
- Tier thresholds use equity: small <250, big >=250, mega >=1000, jackpot >=5000.
  An explicit `winTier` overrides this. Small symbol celebrations last 120 ms;
  the complete timeline still reserves every engine-required launch slot.
- `launchOrder` accepts the authoritative orb-plan cells. Null entries reserve
  scrap/bonus launch slots. A cell detaches once at its first occurrence.
- Default blur is SVG, applied outside the projected drum to preserve CSS 3D.
  The cheaper path was selected by measuring both strategies. At most five reel
  filters plus one ambient-light filter run during spinning. Wins allocate one
  shared bloom, at most one overvolt filter, and jackpot-only RGB groups.
- Particles are capped at 48. Their positions are closed-form functions of
  tween progress; numeric property setters render identically with callbacks
  suppressed. No clocks, simulation stepping, or random draws during seeking.
- V2 styles are installed once by `createCabinet` from `reels.styles.ts`, keeping
  direct factory imports compatible with the game's Node-based test runner.
  Existing `data-testid`, cabinet, grid, symbol, payline and bezel anchors survive.
  New anchors include `reel-drum`, `velocity-blur`, `near-miss`, `light-rig`,
  `reel-divider`, `win-tier`, `beam-core`, `particle` and `scanlines`.
- `grain: false` disables scanlines. Reduced motion omits drums, blur, particles,
  RGB separation, sheen travel and all transform animation. Stop/detach times and
  timeline durations are unchanged. Lighting uses one envelope, not strobing.
- `symbol.<id>` still resolves through the supplied atlas resolver; null keeps
  vector fallbacks. Compositions use unmodified local copies of the game's five
  symbol PNGs. Provenance: `assets/reels/README.md`.
- New composition: `reelShowcase`, 18 seconds at 1080p60. It explicitly identifies
  editorial fixtures and covers all tiers, CLASSIC, both HYPER paths, WAYS,
  CLUSTER, overvolt, near-miss, tumble and relayout using the live factories.
- Additional commands: `node scripts/perf-reels.mjs`,
  `node scripts/capture-game.mjs`, `node scripts/capture-tumble.mjs`,
  `node scripts/render-v2.mjs`, and `node scripts/qa-v2.mjs`.
  Capture scripts exercise the production preview through normal UI controls.
  Tool versions and dependency pins remain those listed below.

### V2 requests and integration limitations

1. **Lever anchor:** the lever is baked into the host cabinet artwork. Supply a
   separate lever element/art layer to animate it with the four-tick wind-up.
2. **CLUSTER scheduling:** `core.ts` schedules the first orb at evaluation + 6 +
   `36 * tumbleCount`, while `CabinetStage` replaces `lineWin` with each tumble.
   Its aggregated orb plan can also repeat a cell across different tumble grids.
   Supply per-tumble launch provenance/ticks and host timeline sequencing for a
   continuous hand-off. V2 preserves the existing engine schedule; it cannot
   satisfy the brief's evaluation+6 launch rule for CLUSTER under current contracts.
3. **Relayout host lifecycle:** the host's grid-dimension effect rebuilds the
   cabinet on size changes, potentially replacing an in-progress relayout.
   The 90-tick morph is verified independently; preserving it in the live host
   requires coordination beyond additive parameter/anchor wiring.
4. **Clock ownership:** the production store currently advances one simulation
   tick per `setTimeout`; it does not use the core's elapsed-time fixed-step loop.
   Animation remains tick-exact, but a busy host can stretch wall-clock playback.

Only the two explicitly permitted integration files are changed outside this
package. The remaining Merge notes describe the historical anim-v1 delivery.

Simulation-driven, seekable GSAP animations for JACKPOT SYNDICATE. Nine factories, a clock-free player, responsive cabinet, vector placeholders, local fonts, ten HyperFrames compositions, a tick-scrubber demo, and a **24-second 1080p60 silent trailer**.

## Install and use

Run these **inside `packages/anim/`**, with Node 22+. No root install is needed. The package-local `pnpm-workspace.yaml` establishes a separate install boundary and preserves its own lockfile. It does not change the parent workspace.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm demo
```

The demo is at <http://127.0.0.1:5180/>; its trailer player is at <http://127.0.0.1:5180/artifacts/>. Select a factory, scrub in either direction, choose reduced motion, or play at 1×/2×/4×. Only the demo host owns a browser frame loop.

```ts
import {
  createCabinet, reelSpin, TimelinePlayer, DESIGN_TOKENS,
  defaultSpriteResolver, prefersReducedMotion,
} from '@jackpotsyndicate/anim';
import '@jackpotsyndicate/anim/style.css';

const root = document.querySelector<HTMLElement>('#slot-animation')!;
createCabinet(root, { cols: 3, rows: 3 }, DESIGN_TOKENS, defaultSpriteResolver);
const timeline = reelSpin(root, {
  cols: 3, rows: 3, seed: 42, reducedMotion: prefersReducedMotion(),
  finalGrid: [
    ['diamond', 'seven', 'uranium'],
    ['cherry', 'seven', 'diamond'],
    ['skull', 'seven', 'cherry'],
  ],
}, DESIGN_TOKENS, defaultSpriteResolver);
const player = new TimelinePlayer();
player.play(timeline, 120); // Spin command tick.
player.syncToTick(150);    // Called by the game's simulation; seeks to 0.5s.
```

`TimelinePlayer` has no internal clock. `play` resets and pauses the timeline; `syncToTick` sets `(currentTick - startTick) / 60`, clamped to its duration, with GSAP callbacks suppressed. `onComplete` fires once per `play`, including a jump past the end. Backward seeking does not re-arm it. `stop()` detaches and pauses without killing or reverting the timeline. The game must never use animation completion to award payouts or create orbs.

Use one active factory per dedicated root; stop/kill its timeline before constructing another. Separate roots allow overlapping scenes. Construction is synchronous and prepares all DOM/tweens. The host may fill `bezel-rail`; its children are preserved when rebuilding the cabinet, and are never animated. Avoid editing factory-owned children during playback.

Cabinets accept widths from 280–720 px and keep square cells for all six 3–5-column, 3–4-row grids. Full-screen scene roots need a positioned, sized container, e.g. `position:absolute; inset:0`. The package does not render the pachinko board or pusher.

### Timing and state

Grids are **column-major**, top row zero; cells are `[col, row]`. Numeric dimensions match the real contracts and are validated at runtime.

- `reelSpin`: final symbols at `30 + 12*col` ticks, with a 5-tick overshoot settle. Duration: last stop + 6 ticks. Frozen cells stay fixed; include their authoritative symbols in `finalGrid`. The seed varies filler artwork only, never outcomes.
- `lineWin`: start at the evaluation tick (Spin tick + last reel stop + 6). Flatten wins in given order, deduplicate by first occurrence, then detach cell i at `6 + 6*i` local ticks. Each drop lasts 18 ticks. Duration: final launch + 18 ticks, or 6 with no wins. Only `line` wins draw connecting paths; all kinds highlight cells. The host's `SpinEvaluated.orbPlan` must use this same first-occurrence order.
- `tumbleStep`: 36 ticks (pop 0–6, fall/refill 6–30, hold 30–36). `gridAfter` must preserve the existing survivors' order. `setCabinetGrid` sets a known starting grid before constructing it.
- `gridRelayout`: 90 ticks. Preserves overlapping symbols, crossfades the cabinet geometry, and introduces the new cells with a weld sweep.
- Scene durations: fever 60, boss intro 180, floor transition 150, victory 240, game over 180 ticks.

Every params type requires `reducedMotion`, matching `packages/contracts`. Reduced variants have the same duration, use opacity changes, and animate no transforms. `prefersReducedMotion()` reads the preference once; the host can override the flag or rebuild if settings change. `data-detached` is presentation metadata, not a game event.

### Assets and rendering

`defaultSpriteResolver` returns null for every key. Missing sprites render original SVG shapes: no emoji or external requests. A real resolver returns `{url, x, y, w, h}` in natural atlas pixels; the SVG viewport crops that region. Coordinates must be nonnegative and finite; dimensions positive. Preload host atlas URLs for live use, and use accessible local files when rendering.

Inter, JetBrains Mono and Outfit variable fonts and their SIL OFL licence files ship in `assets/fonts/`. Vite embeds those local files into `dist/style.css`; import the CSS once. GSAP remains external in the JS library.

Each `compositions/<factory>/` adapter imports the same factory and a JSON fixture. The trailer nests those timelines into a paused master: title 0–3s, 3×3 spin 3–5.5s, seven line win 5.5–6.5s, 5×4 weld 6.5–9s, fever 9–10s, Valenti 10–14s, Cryo elevator 14–18s, victory 18–24s. Extra holds do not change factory durations.

`artifacts/trailer.mp4` is committed directly (no LFS): **4,134,775 bytes**, 1,440 frames, H.264 yuv420p, no audio. SHA-256: `b47e7336d43cfc82557150a044c08bc31e79780fefaddc3c753b9faed0b1b2ca`. Full decoding and encoded-frame review passed; see `REVIEW.md`.

## Merge notes

The package mirrors C-6/C-9 contracts from foundation commit `cf27769ee90f2a108697c8734fd60e31bfe1d9b5` (`CONTRACTS_REV = 1`). **No imports from `@jackpotsyndicate/contracts` are used.** `src/contracts-shim.ts` is the single declaration source. The integrator can replace its mirrored declarations with re-exports, retaining the package-only helper types/aliases listed below.

### Every public export and params type

All factories take `(root: HTMLElement, params: P, tokens: DesignTokens, sprites: SpriteResolver)` and return `gsap.core.Timeline`. Their annotation specializes the shared generic as `TimelineFactory<P, gsap.core.Timeline>`.

| Export | P / arguments |
| --- | --- |
| `reelSpin` | `ReelSpinParams`: cols, rows, finalGrid, frozenCells?, seed, reducedMotion |
| `lineWin` | `LineWinParams`: cols, rows, wins, reducedMotion |
| `tumbleStep` | `TumbleStepParams`: cols, rows, cleared, gridAfter, reducedMotion |
| `gridRelayout` | `GridRelayoutParams`: from, to, reducedMotion |
| `fever` | `FeverParams`: reducedMotion |
| `bossIntro` | `BossIntroParams`: bossId, bossName, tagline, reducedMotion |
| `floorTransition` | `FloorTransitionParams`: fromFloor, toFloor, floorName, reducedMotion |
| `victory` | `VictoryParams`: seedText, bankroll, reducedMotion |
| `gameOver` | `GameOverParams`: seedText, floorName, round, reducedMotion |
| `createCabinet` | `(root: HTMLElement, size: GridSize, tokens: DesignTokens, sprites: SpriteResolver): void` |
| `setCabinetGrid` | `(root: HTMLElement, grid: SymbolId[][], tokens: DesignTokens, sprites: SpriteResolver): void` |
| `TimelinePlayer` | `new (onComplete?: CompletionHook)`; `play(timeline: gsap.core.Timeline, startTick: number)`, `syncToTick(currentTick: number)`, `stop()`, public `onComplete` |
| `defaultSpriteResolver` | `SpriteResolver`: `(logicalKey: string) => null` |
| `prefersReducedMotion` | `(): boolean` |

Every value and type in the shim table below is also publicly re-exported. `@jackpotsyndicate/anim/style.css` is the CSS export. Internal DOM and sprite drawing helpers are not public exports.

### Shim contents and comparison

`pnpm contracts:check` reads the adjacent real contracts, compares all seven mirrored value/function exports, and compiles exact equality assertions for all 18 mirrored types (including generic `TimelineFactory`). It is an optional repository integration check; build, lint and tests remain self-contained.

“Helper” means an additional package-only name, not a conflict with a real-contract export.

| Name | Value or type | Matches `packages/contracts`? |
| --- | --- | --- |
| `TICKS_PER_SECOND` | `60` | Yes |
| `REEL_STOP_TICK` | `(col: number): number => 30 + 12 * col` | Yes |
| `EVAL_DELAY_TICKS` | `6` | Yes |
| `ORB_LAUNCH_DELAY_TICKS` | `6` | Yes |
| `ORB_LAUNCH_INTERVAL_TICKS` | `6` | Yes |
| `ANIM_TICKS` | `{tumbleStep:36, gridRelayout:90, fever:60, bossIntro:180, floorTransition:150, victory:240, gameOver:180} as const` | Yes |
| `SymbolId` | `'diamond' \| 'cherry' \| 'uranium' \| 'skull' \| 'seven'` | Yes |
| `BossId` | `'valenti' \| 'zero' \| 'auditor'` | Yes |
| `FloorId` | `'FLOOR_NEON' \| 'FLOOR_CRYO' \| 'FLOOR_FOUNDRY' \| 'FLOOR_PENTHOUSE'` | Yes |
| `DESIGN_TOKENS` | Colors: obsidian `#07090e`, slateDark `#0f1420`, panel `#121826`, gold `#fbbf24`, cyan `#06b6d4`, crimson `#f43f5e`, emerald `#10b981`; fonts sans `Inter`, mono `JetBrains Mono`, display `Outfit`; readonly | Yes |
| `DesignTokens` | `typeof DESIGN_TOKENS` | Yes |
| `SpriteFrame` | `{url:string; x:number; y:number; w:number; h:number}` | Yes |
| `SpriteResolver` | `(logicalKey:string) => SpriteFrame \| null` | Yes |
| `SeekableTimeline` | `time():number; time(seconds:number):unknown; duration():number; pause():unknown; kill():unknown` | Yes |
| `TimelineFactory<P,T extends SeekableTimeline = SeekableTimeline>` | `(root:HTMLElement, params:P, tokens:DesignTokens, sprites:SpriteResolver) => T` | Yes |
| `AnimCell` | `[col:number, row:number]` | Yes |
| `ReelSpinParams` | `{cols:number; rows:number; finalGrid:SymbolId[][]; frozenCells?:AnimCell[]; seed:number; reducedMotion:boolean}` | Yes |
| `LineWinParams` | `{cols:number; rows:number; wins:{cells:AnimCell[]; kind:'line'\|'ways'\|'cluster'; overvolt?:boolean}[]; reducedMotion:boolean}` | Yes |
| `TumbleStepParams` | `{cols:number; rows:number; cleared:AnimCell[]; gridAfter:SymbolId[][]; reducedMotion:boolean}` | Yes |
| `GridRelayoutParams` | `{from:{cols:number; rows:number}; to:{cols:number; rows:number}; reducedMotion:boolean}` | Yes |
| `FeverParams` | `{reducedMotion:boolean}` | Yes |
| `BossIntroParams` | `{bossId:BossId; bossName:string; tagline:string; reducedMotion:boolean}` | Yes |
| `FloorTransitionParams` | `{fromFloor:FloorId; toFloor:FloorId; floorName:string; reducedMotion:boolean}` | Yes |
| `VictoryParams` | `{seedText:string; bankroll:number; reducedMotion:boolean}` | Yes |
| `GameOverParams` | `{seedText:string; floorName:string; round:number; reducedMotion:boolean}` | Yes |
| `GridCols` | `3 \| 4 \| 5` | Helper; valid supported range |
| `GridRows` | `3 \| 4` | Helper; valid supported range |
| `Cell` | Alias of `AnimCell` | Helper; exact alias |
| `GridSize` | `{cols:number; rows:number}` | Helper; same shape as shared grid fields |
| `MotionParams` | `{reducedMotion:boolean}` | Helper; same shape as the shared private `Motion` |
| `Win` | `{cells:Cell[]; kind:'line'\|'ways'\|'cluster'; overvolt?:boolean}` | Helper; same shape as `LineWinParams['wins'][number]` |
| `FactoryParams` | Map from each of the nine factory names to its params type | Helper |
| `FactoryName` | `keyof FactoryParams` | Helper |
| `CompletionHook` | `() => void` | Helper |
| `DEFAULT_TOKENS` | Alias of `DESIGN_TOKENS` | Helper; exact alias for earlier callers |
| `SYMBOL_IDS` | readonly `['diamond','cherry','uranium','skull','seven']` | Helper; same five IDs |
| `SCENE_TICKS` | Scene-only subset of `ANIM_TICKS` | Helper; values match |
| `TUMBLE_TICKS` | `ANIM_TICKS.tumbleStep` (`36`) | Helper; exact alias |
| `RELAYOUT_TICKS` | `ANIM_TICKS.gridRelayout` (`90`) | Helper; exact alias |
| `REEL_SETTLE_TICKS` | `5` | Helper; visual settle length, inside the shared timing envelope |
| `SYMBOL_DROP_TICKS` | `18` | Helper; visual travel length after the shared launch tick |

### Every `data-anim` anchor and its users

All selectors are scoped inside the supplied root. “Reels” below means `reelSpin`, `lineWin`, `tumbleStep`, `gridRelayout` (also built by `createCabinet`). “Scenes” means `fever`, `bossIntro`, `floorTransition`, `victory`, `gameOver`. Repeated names denote arrays.

| Anchor(s) | Factory users | Purpose |
| --- | --- | --- |
| `cabinet`, `cabinet-header`, `cabinet-title`, `cabinet-serial` | Reels | Shell, name and size engraving |
| `reel-window`, `grid`, `cell`, `symbol` | Reels | Aperture, persistent grid and faces; cells carry `data-col`, `data-row`, `data-symbol` |
| `cell-glow` | Reels | Landing/win/weld illumination (initially hidden) |
| `reel-streams` | Reels | Prebuilt strip container |
| `reel-stream`, `stream-symbol` | `reelSpin` | Moving column strips and their tiles |
| `payline-overlay` | Reels | Prebuilt SVG layer |
| `win-path` | `lineWin` | Line-win polylines |
| `cell-effects` | Reels | Prebuilt visual copy container |
| `drop-symbol` | `lineWin` | Detached symbol copy |
| `tumble-symbol` | `tumbleStep` | Survivor, cleared and incoming copies |
| `drop-layer` | Reels | Reserved transparent outer effects plane |
| `bezel-rail` | Reels | **Host-owned children**; moved intact across rebuilds |
| `relayout-previous`, `weld-spark` | `gridRelayout` | Old cabinet plate and welding sweep |
| `scene`, `scene-grid`, `scene-orbit`, `scene-edge` | Scenes | Full-viewport background/decorations |
| `scene-content`, `scene-eyebrow`, `scene-title`, `scene-detail` | Scenes | Content groups and typography |
| `fever-bars`, `fever-bar` | `fever` | Burst strips |
| `boss-portrait`, `boss-copy`, `boss-stamp`, `boss-slash` | `bossIntro` | Dossier art, copy, stamp and scan |
| `floor-from`, `floor-to`, `elevator-doors`, `elevator-door` | `floorTransition` | Floor plates and shutters |
| `victory-rays`, `victory-ray`, `bankroll` | `victory` | Accent rays and supplied bankroll |
| `gameover-line` | `gameOver` | Strike line |
| `seed-text` | `victory`, `gameOver` | Supplied run seed |
| `sprite`, `atlas-image` | Reels, `bossIntro`, `floorTransition` | SVG placeholder or atlas crop; `data-key` stores its logical key |
| `duration` | All nine factories | Invisible finite-duration/hold marker |
| `factory-root` | Individual compositions only | Factory mount |
| `shot`, `title`, `subtitle`, `mark` | Trailer only | Shot visibility and title art |
| `spin-root`, `win-root`, `weld-root`, `fever-root`, `boss-root`, `floor-root`, `victory-root` | Trailer only | Separate live-factory roots |

### Every logical sprite key

| Keys | Factory users |
| --- | --- |
| `symbol.diamond`, `symbol.cherry`, `symbol.uranium`, `symbol.skull`, `symbol.seven` | All four reel factories / cabinet |
| `boss.valenti`, `boss.zero`, `boss.auditor` | `bossIntro` |
| `floor.FLOOR_NEON.bg`, `floor.FLOOR_CRYO.bg`, `floor.FLOOR_FOUNDRY.bg`, `floor.FLOOR_PENTHOUSE.bg` | `floorTransition` |

All twelve are already present in the real `SPRITE_KEYS` registry. No scrap, token, board or UI sprite keys are requested by this package.

### Exact commands

From `packages/anim/`:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm demo                 # localhost:5180; scrubber and speed controls
pnpm compositions:build  # standalone local projects in .render/<name>/
pnpm preview             # builds, then HyperFrames preview on localhost:5181
pnpm render              # builds, then artifacts/trailer.mp4 at 1080p60
pnpm contracts:check     # optional: compare with adjacent ../contracts
```

Explicit HyperFrames lint for **every** composition (`pnpm lint` already runs these):

```sh
pnpm compositions:build
for name in reelSpin lineWin tumbleStep gridRelayout fever bossIntro floorTransition victory gameOver trailer; do
  pnpm exec hyperframes lint ".render/$name" || exit 1
done
```

Direct preview/render equivalents:

```sh
pnpm exec hyperframes preview .render/trailer --port 5181 --foreground --no-open
pnpm exec hyperframes render .render/trailer --output "$PWD/artifacts/trailer.mp4" --fps 60 --workers 2 --quality delivery --strict --no-browser-gpu
```

Replace `trailer` with a factory name to preview one composition. The editor opens at `http://localhost:5181/#project/trailer`. Optional extra checks, with the demo running:

```sh
DEMO_URL=http://127.0.0.1:5180 pnpm qa
DEMO_URL=http://127.0.0.1:5180 node scripts/verify-media.mjs
pnpm exec hyperframes check .render/trailer --json --no-craft --no-browser-gpu
ffmpeg -v error -i artifacts/trailer.mp4 -f null -
```

Tests use real Chromium through HyperFrames' locked Puppeteer tooling. Set `CHROME_BIN=/absolute/path/to/chrome` if it is not in the standard system locations or HyperFrames/Puppeteer cache. Rendering additionally requires FFmpeg. The package's runtime has no Chrome, FFmpeg or Node requirement; those are development tools.

### Tool versions

| Tool | Version used |
| --- | --- |
| Node | 22.19.0 (package requires 22+) |
| pnpm | 10.28.0 for repository integration / clean-clone checks; original production used 10.15.0 |
| GSAP | 3.15.1 |
| HyperFrames | 0.9.47 |
| FFmpeg | 7.1.5-0+deb13u1 |
| TypeScript / Vite / Vitest | 7.0.2 / 8.3.8 / 5.1.0 |
| Puppeteer Core / Chromium | 25.17.0 / 152.0.7977.30 |

Dependencies and transitive versions are pinned in the package-local `pnpm-lock.yaml`. Only GSAP is a runtime dependency. Fonts include their upstream licences and provenance notes.

Before authoring, installed the current `hyperframes` / `hyperframes-cli` agent skills with `npx skills add heygen-com/hyperframes --skill hyperframes hyperframes-cli --agent opencode --yes`; read their embedded GSAP references and CLI `docs gsap`. That release recommends no separate external GSAP skill. Sources: [GSAP](https://hyperframes.heygen.com/guides/gsap-animation), [HTML schema](https://hyperframes.heygen.com/reference/html-schema), installed CLI help. No installed agent-skill cache is committed.

### Deviations

**From the repository's mirrored contracts: no deviations.** All matching names, values, readonly tokens, type shapes and generic defaults pass `pnpm contracts:check`. Additional helper exports are documented above.

Changes from the original animation task / first standalone delivery:

1. Package renamed to `@jackpotsyndicate/anim`, as requested for this repository.
2. The original GSAP-only `TimelineFactory<P>` became the shared generic `TimelineFactory<P,T>`; concrete factories specialize T to GSAP, preserving their usable return type.
3. Params accept `number` grid dimensions like the real contracts; runtime still validates 3–5 cols and 3–4 rows. Tumble/relayout now require `reducedMotion` rather than the first delivery's optional flag, matching the real contracts.
4. `DESIGN_TOKENS` / `ANIM_TICKS`, `SpriteFrame`, `SeekableTimeline` and `AnimCell` now match the shared names. Previous aliases remain for compatibility.
5. Intersecting wins launch a symbol once, in first-occurrence order. The original prompt did not define duplicate-cell semantics; this avoids visual duplication and matches the spec's one-orb-per-scoring-cell rule.
6. Compositions construct the same DOM as the game rather than duplicate it as editor-authored per-symbol tags. HyperFrames emits editor-organization advisories; see Known issues.
7. The original interface-only commit was made locally before a remote existed. Its shim/signatures are available in the initial standalone history; this PR delivers the complete package to the supplied repository.

### Requests for the integrator

**No changes outside `packages/anim/` are required for this delivery.** During the planned T-052 integration, swap the mirrored shim declarations for shared re-exports while retaining the helper exports; import the stylesheet once; supply `reducedMotion` to every factory; provide the atlas resolver and host-owned bezel children; and ensure `SpinEvaluated.orbPlan` uses the same deduplicated cell order as `lineWin`.

If folding this package into the parent's single install/lockfile later, intentionally reconcile its nested workspace boundary and package-local lockfile as an integration change. No root configuration or root lockfile was modified here.

### Known issues

- HyperFrames lint succeeds with zero errors but reports `nested_structure_needs_subcomposition`: one editor-organization advisory per factory composition, eight in the trailer. This is the documented shared-DOM choice; runtime, layout and contrast checks pass.
- Sprite art is intentionally placeholder vector artwork until the host atlas exists.
- Full deterministic browser checks were run in Chromium. Cross-browser manual watch-throughs are not claimed. Original encoded playback reached the end with no errors/waits; it reported four dropped presentation frames under concurrent build/test load, while the encoded file contains every frame.
- A matching Chrome/Chromium executable and FFmpeg are development prerequisites for browser tests and rendering. They are not bundled binaries.

Clean-clone verification results and the public-file review are recorded in `INTEGRATION.md`.
