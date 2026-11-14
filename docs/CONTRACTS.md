# Contracts (rev 1)

Everything in `packages/contracts` is shared. One editor at a time (the integrator); bump
`CONTRACTS_REV` on any change.

| Spec id | File | Contents |
|---|---|---|
| C-1 | `content.ts` | Content types: symbols, items, floors, bosses, balance. **To add:** Zod schemas that `satisfies z.ZodType<...>` these types |
| C-2 | `protocol.ts` | `Command`, `CommandResult`, `Phase`, `EngineEvent`, `GameEvent`, `GameCore` |
| C-3 | `sim.ts` | `SimWorld`, specs, directives, `PhysicsEvent`, `SimSnapshot` (implemented by `packages/physics`) |
| C-4 | `protocol.ts` | `HookName`, `Effect` |
| C-5 | `protocol.ts`, `constants.ts` | `RunState`, `SaveFile`, `SAVE_VERSION` |
| C-6 | `constants.ts`, `presentation.ts` | Tick schedule, `ANIM_TICKS`, `TimelineFactory`, animation param types |
| C-7 | `presentation.ts` | `SPRITE_KEYS`, `AssetManifest` |
| C-8 | `presentation.ts` | `TEST_IDS`, `TestApi` |
| C-9 | `presentation.ts` | `DESIGN_TOKENS` |
| — | `presentation.ts` | `projectShelf` (shared 2.5D projection) |

Fixtures: `fixtures/snapshot.static.json` (real sim output; regenerate with
`tsx tools/physics-harness/make-fixture.ts`).

## Still to do in this package

1. Zod schemas for C-1 and `SaveFile`.
2. `fixtures/events.sample.json` (one spin's `GameEvent` stream) and `fixtures/content.min.json`.
3. `testing/MockGameCore` replaying the sample events.

## Differences from the first draft of the spec

- Physics is value-agnostic (no chips in `OrbSpec`); the engine tracks value from events.
- No `onGutterApproach` hook. Gutter bumpers are `PhysicsModifiers.gutterBounceChances`, rolled inside the sim.
- `gutterRisk` controls bevel width, not collision anisotropy.
- Overclocked Seven spawns one token with `stack: 3` (the engine gives it 3× cash), not three tokens.
- `SimWorld` gained `setModifiers`, `drainEvents`, `counts().queued`, and a `resetPegs` flag on `configure`.
- Added phases `RELIC_PICK`, `JUMPER_PICK`, `FLOOR_TRANSITION`; events `OrbValued`, `TokenValued`, `CashBanked`, `CellsFrozen`, `FeverChanged`, `JumpersOffered`, `RelicsOffered`, `DrinkActive`, `CoinLoaded`, `RunStarted`.
