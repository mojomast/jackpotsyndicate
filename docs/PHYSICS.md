# Physics package

`createSimWorld(seed)` returns a `SimWorld` (interface in `packages/contracts/src/sim.ts`).
One `step()` is one 1/60 s tick. The board is a fixed 600 × 510 logical space.

## What it does and does not know

The simulation knows shapes, masses and behaviour flags. It does **not** know chips or cash.
The engine keeps `orbId → chips` and `tokenId → cash` and updates them from events:

| Event | Engine action |
|---|---|
| `PegHit` | add peg chips to that orb (`chained: true` hits are Diamond's extra gold pegs) |
| `OrbSplit` | copy the parent's chips to the child |
| `ChuteExit` | compute token cash; assign to `tokenIds`, or add to `mergedInto` if the shelf was full |
| `TokenMerged` | (already covered by `ChuteExit.mergedInto`; for direct spawns add the cash to `intoId`) |
| `LipDrop` | bank that token's cash |
| `GutterLoss` | discard it; `magnetic: true` means a Skull fell (drain 50) |
| `DozerFullExtension` | boss/trinket timing (`count` is the reciprocation number) |

Spawns and directives made outside `step()` (shop purchases, boss sabotage) queue their events;
read them with `drainEvents()` or receive them from the next `step()`.

## Rules that keep it deterministic

- No `Math.random`, `Date`, `performance.now`, `Math.sin/cos/pow/exp/hypot` in `packages/physics/src`.
  Use `Prng`, tick counts, `Math.sqrt`, and `sinLookup` (committed table).
- Iterate arrays in index order. Remove with `splice` (order-preserving), never swap-remove.
- Every random draw must be unconditional with respect to its own outcome (see the gutter-bounce loop).
- All state is in `serialize()`. If you add a field, write and read it, and bump `FORMAT_VERSION`.
- The `golden hash` test pins behaviour. If it changes, old saves and replays are invalid.

Verified: identical hash in Node 22 and Chromium (both V8). **Not yet verified on Firefox
(SpiderMonkey) or Safari (JavaScriptCore)**; the e2e task must run `window.__sim.goldenHash()`
style checks there. The design avoids every operation known to differ between engines.

## Pusher model

Position-based dynamics, top-down. Per tick: forces → advect → 4 relaxation passes (blade as an
immovable back wall, mass-weighted token separation, weld constraints) → velocity re-derived from
displacement and damped by floor friction. A shoved coin keeps sliding briefly; a squeezed pile
settles and sleeps.

**Rake is set by the bevel.** The outer strip of the shelf beside each gutter slopes outward.
Its width is `EDGE_ZONE × gutterRisk²`. Measured over 10,000 bot spins per floor, no trinkets:

| Floor | gutterRisk | Rake | Target |
|---|---|---|---|
| Neon | 1.00 | 19.1% | 18 ± 4 |
| Cryo | 1.35 | 23.1% | 24 ± 5 |
| Foundry | 0.65 | 11.6% | 12 ± 4 |
| Penthouse | 1.15 | 22.6% | 21 ± 5 |

All tunables are in `src/kernel/tuning.ts`. Change them only with `pnpm sim:rake` open; the
renderer should draw the bevel (width = `26 × gutterRisk²` board units) so players can read the risk.

Rake also depends on how many orbs arrive and where. The harness bot (`tools/physics-harness/lib.ts`)
approximates no-trinket play; when the real engine exists, re-run the measurement through it.

## Rendering is 2.5D, simulation is 2D

The snapshot carries what a perspective renderer needs: `stack` (tower height; Seven bullion = 3,
merged tokens grow up to 5), `lift` (0..1 crowding, raise or tilt crowded coins), `welded`,
velocities, and exit events with position and velocity for tumbling over the lip or into a gutter.
Use `projectShelf()` from contracts so shelf sprites and VFX line up. `tools/physics-viewer`
shows the intended look.

## Performance

About 0.04 ms per tick in typical play and 0.11 ms worst case (150 tokens + 48 orbs) on the build
machine, against a 4 ms budget.
