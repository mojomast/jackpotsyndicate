# Jackpot Syndicate

Browser roguelike: slot reels → pachinko pinfield → coin pusher. Play money only.

The full build plan is `docs/SPEC.md`. This repository currently contains the foundation
the rest is built on:

| Path | What | State |
|---|---|---|
| `packages/contracts` | Shared types, constants and interfaces every other package builds against | Built. Zod schemas, event fixture and `MockGameCore` still to add (see `docs/CONTRACTS.md`) |
| `packages/physics` | Deterministic 2D simulation: pinfield and coin pusher | Built and tested |
| `tools/physics-harness` | Bot runs: gutter-rake report, performance, fixture generator | Built |
| `tools/physics-viewer` | Single-file debug viewer with a 2.5D sketch of the shelf | Built |
| `packages/anim` | Reel and scene animations (HyperFrames) | Delivered separately by the animation agent |

## Commands

```
pnpm install
pnpm typecheck
pnpm test          # ~1 minute; includes the per-floor rake bands
pnpm sim:rake      # 10,000 spins per floor, prints rake vs target, non-zero exit if out of band
pnpm sim:perf      # worst-case tick cost (150 tokens + 48 orbs)
node tools/physics-viewer/build.mjs   # writes artifacts/physics-viewer.html (needs esbuild)
```

Read `docs/PHYSICS.md` before changing anything under `packages/physics`.
