# Contracts (rev 1)

Everything in `packages/contracts` is shared. One editor at a time (the integrator); bump
`CONTRACTS_REV` on any change.

| Spec id | File | Contents |
|---|---|---|
| C-1 | `content.ts`, `schemas.ts` | Content types: symbols, items, floors, bosses, balance. Zod schemas (`symbolDefSchema`, `itemDefSchema`, `floorDefSchema`, `bossDefSchema`, `balanceDefSchema`, `contentBundleSchema`) `satisfies z.ZodType<...>` the types. |
| C-2 | `protocol.ts`, `schemas.ts` | `Command`, `CommandResult`, `Phase`, `EngineEvent`, `GameEvent`, `GameCore`; `commandSchema` and `gameEventSchema`. |
| C-3 | `sim.ts` | `SimWorld`, specs, directives, `PhysicsEvent`, `SimSnapshot` (implemented by `packages/physics`) |
| C-4 | `protocol.ts` | `HookName`, `Effect` |
| C-5 | `protocol.ts`, `constants.ts`, `schemas.ts` | `RunState`, `SaveFile`, `SAVE_VERSION`; `runStateSchema` and `saveFileSchema` |
| C-6 | `constants.ts`, `presentation.ts` | Tick schedule, `ANIM_TICKS`, `TimelineFactory`, animation param types |
| C-7 | `presentation.ts` | `SPRITE_KEYS`, `AssetManifest` |
| C-8 | `presentation.ts` | `TEST_IDS`, `TestApi` |
| C-9 | `presentation.ts` | `DESIGN_TOKENS` |
| — | `presentation.ts` | `projectShelf` (shared 2.5D projection) |
| — | `testing/MockGameCore.ts` | `MockGameCore`: in-memory `GameCore` that replays `fixtures/events.sample.json` |

Fixtures:

- `fixtures/snapshot.static.json` — real sim output; regenerate with
  `tsx tools/physics-harness/make-fixture.ts`.
- `fixtures/content.min.json` — two symbols, two trinkets, one floor, one boss
  and balance; validates against `contentBundleSchema`.
- `fixtures/events.sample.json` — one spin's ordered `GameEvent` stream; every
  entry validates against `gameEventSchema`.
- `fixtures/grids/base-3x3.json` — a 3×3 CLASSIC grid in column-major order
  (`grid[col][row]`) plus its expected wins/chips/addMult/xMult; validates
  against `gridFixtureSchema`. Engine tasks add cases in their own subfolders.

## Using the schemas

```ts
import { contentBundleSchema, saveFileSchema, gameEventSchema } from '@jackpotsyndicate/contracts';

const content = contentBundleSchema.parse(json);
const save = saveFileSchema.parse(JSON.parse(localStorage.getItem('js.save.v1')!));
const events = rawEvents.map((event) => gameEventSchema.parse(event));
```

Every C-1 schema uses `satisfies z.ZodType<T>` so `z.infer` is exactly the
corresponding type in `content.ts`. `SaveFile`, `RunState`, `Command` and
`GameEvent` follow the same rule.

## Using MockGameCore

```ts
import { MockGameCore } from '@jackpotsyndicate/contracts/testing';

const core = MockGameCore.fromSample();
core.dispatch({ c: 'NewRun', seed: 'demo' });
const events = core.tick(); // events stamped for the current tick
```

`MockGameCore` implements the full `GameCore` surface (`dispatch`, `tick`,
`getState`, `getSimSnapshot`, `stateHash`, `save`, `load`, `getCommandLog`),
replays `events.sample.json` in tick order, and derives run state from the
events so UI tasks can render a real spin before `packages/core` exists.

## Differences from the first draft of the spec

- Physics is value-agnostic (no chips in `OrbSpec`); the engine tracks value from events.
- No `onGutterApproach` hook. Gutter bumpers are `PhysicsModifiers.gutterBounceChances`, rolled inside the sim.
- `gutterRisk` controls bevel width, not collision anisotropy.
- Overclocked Seven spawns one token with `stack: 3` (the engine gives it 3× cash), not three tokens.
- `SimWorld` gained `setModifiers`, `drainEvents`, `counts().queued`, and a `resetPegs` flag on `configure`.
- Added phases `RELIC_PICK`, `JUMPER_PICK`, `FLOOR_TRANSITION`; events `OrbValued`, `TokenValued`, `CashBanked`, `CellsFrozen`, `FeverChanged`, `JumpersOffered`, `RelicsOffered`, `DrinkActive`, `CoinLoaded`, `RunStarted`.
