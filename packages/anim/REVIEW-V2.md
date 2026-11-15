# Reel animation v2 — review report

## Status

Implemented on `anim/reels-v2` for owner review. The original nine factory exports
remain available. Engine constants are unchanged. The branch is **not a claim that
every acceptance gate is closed**: CLUSTER hand-off sequencing, live relayout
lifecycle, and the largest-grid 4× performance stress case remain open below.

## Verification

| Check | Evidence / result |
| --- | --- |
| Root lint, typecheck, build | Passed; Vite retains the existing large-chunk advisory |
| Root tests | 258 passed |
| Animation tests | 113 Chromium-backed tests passed, including all original 93 |
| Composition lint | All eleven pass with zero errors; editor-organization advisories remain |
| Film runtime/layout/contrast | Both HyperFrames checks pass; contrast checks 24/24 trailer, 46/46 showcase |
| Film seeks | 32 trailer and 30 showcase samples, including cut ±1 frame; reverse/shuffled DOM equality and 19 exact PNG comparisons |
| Grid timing | All six 3–5 × 3–4 grids, both motion modes; exact stop and launch boundary checks |
| New effects | Tier × wiring seek tests; SVG/echo modes; each-frame t→0→t DOM checks; null orb-plan slots; seeded particle equality and variation |
| Reduced motion | Equal durations; opacity-only variants; no drums, particles or computed blur |
| Flash envelopes | Each local highlight has at most one rise/fall at 1×, 2× and 4×; no repeated strobe/repeat/yoyo effect |
| Network regression | Existing full-J1 network test passed in Chromium; zero requests after initial load |
| Production UI | Real seeded runs, normal Spin/speed/shop controls, no test API; desktop/mobile captures and continuous recording |

Commands are reproducible after the root and package-local frozen installs:

```sh
# repository root
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm preview --host 127.0.0.1 --port 4176
CHROME_BIN=/path/to/chromium pnpm exec playwright test --config packages/anim/scripts/network.config.ts

# packages/anim
pnpm lint
pnpm typecheck
pnpm test
pnpm contracts:check
node scripts/perf-reels.mjs
node scripts/capture-game.mjs
node scripts/capture-tumble.mjs
node scripts/render-v2.mjs
node scripts/qa-v2.mjs
```

## Production evidence

`artifacts/review/` contains PNG/MP4 only. For **both** `1440x900` and `390x844`:

- `<size>-mid-blur.png`: sampled from the actual velocity-blur state.
- `<size>-landing.png`: first column landed, three cells marked landed.
- `<size>-near-miss.png`: two columns landed, six cells marked landed.
- `<size>-small-win.png`: first spin of seed `REEL-V2-16`, equity 180.
- `<size>-mega-win.png`: first spin of seed `REEL-V2-7`, equity 1200.
- `<size>-tumble.png`: seed `REEL-V2-3`; play seven spins, continue to the first
  shop, reroll three times, buy CLUSTER Harness, leave, then play round-two spins.
  The third and fourth spins produced the desktop/mobile tumble captures.
- `production-spins-1x-4x.mp4`: continuous 1440×900 H.264/30 fps recording of three
  consecutive real spins at 1× and the next at 4×. Silent, 124 seconds,
  3,720 decoded frames, 8,792,922 bytes. It includes the board-resolution waits.

`artifacts/gameplay-evidence.json` records the observed landed/detached counts,
tier labels, absent production test API and zero external requests/page errors.
`artifacts/tumble-evidence.json` records the normal-UI acquisition path.
The recording uses CDP frame timestamps rather than a simulated animation clock.
The final recording passed a complete FFmpeg decode with no errors.

The production store's one-tick-per-timeout loop can stretch wall-clock time on
this headless host. The animation follows those simulation ticks exactly. These
captures do not establish that the host sustains 60 real-time simulation ticks/s.

## Performance

Measurement: Chromium 152.0.7977.30, Linux shared host, 1440×900, 620 px cabinet,
largest 5×4 grid, actual local game symbol PNGs. Three spin→20-cell jackpot/energy-
web cycles per strategy. Images are decoded before sampling; the same cabinet is
reused. The host seeks at 60 display samples/s (or four simulation ticks/sample).
`PerformanceObserver` counts long tasks, and CDP Performance metrics include
script, style, layout and total renderer task time. No CPU throttle is applied.
The benchmark includes synchronous construction; it excludes board rendering.

Source and raw results: `scripts/perf-reels.mjs`, `tests/harness.ts`,
`artifacts/perf-reels.json`.

| Strategy / speed | Samples | Seek JS mean | JS + forced style mean | CDP total task / frame | Construction max | >50 ms tasks |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Echo / 1× | 666 | 0.234 ms | 0.585 ms | 3.402 ms | 54.5 ms | 57, 70, 57, 51 ms |
| **SVG / 1× (selected)** | **666** | **0.215 ms** | **0.509 ms** | **3.015 ms** | **30.1 ms** | **None** |
| SVG / 4× stress | 168 | 0.230 ms | 0.488 ms | **4.485 ms** | 34.3 ms | None |

The requested 1× budget passes. **The 4× all-cells-jackpot stress result misses
the 4 ms target.** An earlier 4× run also recorded a 53 ms long task; the final
run recorded none. This remains an acceptance limitation, not a
passing result disguised as a JS-only measurement. The selected SVG path avoids
the duplicated symbol DOM of the echo strategy and shares blur/ghost work in one
filter per reel. Numeric particle renderers avoid CSSPlugin reads per particle.
Construction batches transform reads before eager initialization; seeking has no
application geometry reads or interleaved read/write loop.

## Encoded films

| File | Duration | Video | Frames | Bytes |
| --- | ---: | --- | ---: | ---: |
| `artifacts/trailer.mp4` | 24 s | 1920×1080, H.264/yuv420p, 60 fps | 1,440 | 5,751,737 |
| `artifacts/reelShowcase.mp4` | 18 s | 1920×1080, H.264/yuv420p, 60 fps | 1,080 | 9,686,432 |

Both are intentionally silent, fully decoded with FFmpeg and below 25 MB.
`artifacts/media-v2.json` records the probe/decode results;
`artifacts/composition-qa-v2.json` records bundle/export SHA-256 hashes, seek and
motion checks. Inspected encoded contact sheets spanning every scene plus the
full-resolution mega-win and ending frames. Real-time audiovisual playback review
was not performed by the agent; the delivered MP4s are ready for owner playback.

Pixel comparisons use the export's software-compositing path. The default GPU
path produced a six-pixel clip-edge raster difference at 14.65 s despite identical
DOM. Matching the export flags removed it without relaxing pixel equality.

`artifacts/framework-checks-v2.json` summarizes both HyperFrames checks. Trailer
has eight editor-organization advisories; showcase has fourteen (nested sections
and missing Studio `.clip` classes). Showcase also reports 26 informational
overflow findings from intentionally clipped sheen/drum layers. Runtime, layout
and contrast have zero errors/warnings. Automated craft/motion heuristics were
disabled; deterministic seek and non-frozen-motion checks are separate above.

## Visual review and tradeoffs

- Inspected actual production desktop/mobile captures, including blur, landing,
  near-miss, small/mega wins and shattering tumble faces.
- Corrected an SVG-filter placement that flattened the cylinder. Blur now wraps
  the projected drum; perspective and backface geometry remain intact.
- Reduced scanline contrast, tightened ghost offsets, removed an early near-miss
  glow, and separated the showcase eyebrow from its headline after frame review.
- Near-miss anticipation follows CLASSIC row/diagonal and HYPER rounded V geometry,
  ignores frozen cells, and uses unfrozen per-column membership for WAYS. It asks
  whether the already-landed prefix can extend, so a winning final symbol can also
  receive anticipation. CLUSTER has no final-reel anticipation.
- Small wins use a 120 ms per-symbol pop/sheen and no travelling particle burst.
  Larger tiers add bloom, seeded sparks, stronger paths and jackpot-only RGB edges.
  Symbol detaches remain in the authoritative launch-slot order.
- A single rising tension envelope replaces a repeated heartbeat strobe, preserving
  a restrained look and the flash policy at 4×. Local stop lights latch until the
  collective settle rather than flash repeatedly across the whole cabinet.
- Atlas art is used in both films. The compositions are explicitly labelled
  illustrative fixtures; production screenshots and recordings are separate.

## Contract additions and requests

See README **V2 merge notes** for the complete optional-param list, anchors,
sprite keys, thresholds and commands. `contracts-shim.ts` already re-exports the
shared declarations, so the new types have a single source of truth.

Only `packages/contracts/src/presentation.ts` (optional fields) and
`apps/game/src/screens/table/CabinetStage.tsx` (passing those fields) change outside
`packages/anim/**`. No engine, physics, board, content, theme, store, meta screen,
root fixture, lockfile or timing-constant changes.

Owner requests:

1. Separate the artwork lever into a movable anchor.
2. Provide per-tumble orb provenance/launch ticks and host sequencing for CLUSTER.
   Its existing engine schedule is evaluation+6+36×tumbles, and aggregated plans
   can repeat cells from different grids. The current host discards the win
   timeline when a tumble arrives. The requested continuous hand-off cannot be
   proven under that interface without changing orchestration.
3. Coordinate the grid-dimension effect with `gridRelayout` so the host preserves
   the 90-tick morph instead of rebuilding its DOM while it is playing.
4. Consider the core's elapsed-time browser loop for production clock ownership;
   the current store advances one tick per timeout and can run slowly under load.

Chromium is the verified browser. Cross-browser perceptual review is not claimed.
The flash checks validate the designed light envelopes; they are not a substitute
for a full-screen photosensitivity analyzer over arbitrary third-party sprite art.
