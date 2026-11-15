# Content guide

All gameplay content is data in `packages/content/src/data.ts`. The bundle is exported
as `CONTENT_BUNDLE`, `content`, and `contentBundle`, and is validated by the C-1 Zod
schemas in `packages/contracts/src/schemas.ts`.

The goal is to add content that uses existing hooks without engine changes. New hook
actions or new effect kinds do require engine/contract work.

## Read these first

- `packages/contracts/src/content.ts` — the content types.
- `packages/contracts/src/protocol.ts` — `HookName` and the closed `Effect` union.
- `packages/engine/src/effects/index.ts` — the actual action ids and stacking rules.
- `packages/content/tests/content.test.ts` — counts, ids, sprite keys, and handler checks.

## Content rules

- Every id is unique across symbols, items, floors, and bosses.
- Every item `spriteKey` follows its category:
  - trinket: `trinket.<item id>`
  - drink: `drink.<item id>`
  - coin: `coin.<item id>`
  - glyph: `glyph.<item id>`
  - chassis: `chassis.<item id>`
- A handler reference names a C-4 hook (`handler`) and an action id (`params.action`).
  `params.action` must exist in `EFFECT_HANDLERS`.
- Handler params may be numbers, strings, or booleans only.
- Duplicate trinkets stack additively: additive effects multiply by copy count,
  multiplier effects use `1 + (factor - 1) * copies`, and gutter-bounce chances remain
  independent entries in the physics modifier bag.
- Floors and bosses reference existing `FloorId` / `BossId` string unions. A genuinely
  new floor id or boss id is a contract change, not only a data edit.

## Add a trinket

Add one `TrinketDef` to the `trinkets` array in `packages/content/src/data.ts`.

Example: a trinket that makes every third launched orb splittable.

```ts
{
  id: 'tripleSplitterValve',
  name: 'Triple Splitter Valve',
  desc: 'Every 3rd orb launched gains canSplit.',
  price: 210,
  spriteKey: 'trinket.tripleSplitterValve',
  rarity: 'rare',
  category: 'TRINKET',
  effects: [
    { handler: 'onOrbLaunch', params: { action: 'everyNthCanSplit', every: 3 } },
  ],
},
```

Why this works without engine changes:

- `onOrbLaunch` is a C-4 hook already dispatched for launched orbs.
- `everyNthCanSplit` is an existing handler.
- `every` is an allowed scalar param.
- The returned `flagOrb` effect is already applied by the core.

### Useful handlers

| Action | Hook | Key params |
|---|---|---|
| `addChips` | `onCellScored`, `onPegHit` | `amount` |
| `addChipsAllOrbs` | any orb hook | `amount` |
| `addMult` | `onSpinEvaluated`, `onCellScored` | `amount` |
| `mulX` | `onSpinEvaluated` | `factor` |
| `addNextSpinX` | `onGutterLoss`, `onLipDrop` | `amount`, `cap`, `key` |
| `addNextSpinMult` | `onSpinEvaluated` | `amount` |
| `mulNextSpinX` | `onSpinEvaluated` | `factor`, `cap`, `key` |
| `addBonusOrbs` | `onSpinStart` | `count` |
| `addCash` | `onLipDrop`, `onGutterLoss` | `amount`, `drain` |
| `addTokenCash` | `onChuteExit` | `amount` |
| `mulTokenCash` | `onChuteExit` | `factor` |
| `mulLipPayout` | `onLipDrop` | `factor` |
| `spawnCopper` | `onSpinStart`, `onTokenSpawn` | `count` |
| `spawnBullionStack` | `onSpinStart` | `stack`, `count` |
| `simDirective` | any hook | `directive`:`surge`, `clearShelf`, `clearOrbs`, `nudgeForward`, `dropIceBlocks`, `sweepCenter` |
| `everyNthCanSplit` | `onOrbLaunch` | `every` |
| `nudgeEveryNthPeg` | `onPegHit` | `every`, `distance` |
| `centerPull` | `physicsModifiers` | `orbs`, `tokens` |
| `dozerBoost` | `physicsModifiers` | `speedMul`, `strokeMul` |
| `gutterBounce` | `physicsModifiers` | `chance`, `independent` |
| `suction` | `physicsModifiers` | `amount` |

The authoritative list is `EFFECT_HANDLERS` in `packages/engine/src/effects/index.ts`.

### Test and asset follow-up

`packages/content/tests/content.test.ts` asserts exact counts (15 trinkets, 5 drinks,
4 coins, 5 glyphs, 7 chassis). Adding a trinket changes those expectations; update the
test deliberately rather than deleting the assertion.

The asset pipeline's default item catalog is separate from `content`. It currently uses
kebab-case ids such as `quantum-splitter-coil`, while existing content uses camelCase
ids such as `quantumSplitterCoil`. A new item will still resolve to a placeholder unless
the catalog/manifest and content sprite key are aligned. Do not claim real art exists
until `pnpm assets:verify` has been run against locked files.

## Add a floor

A new floor touches both contracts and content because `FloorId` is a closed union.

1. Extend `FloorId` in `packages/contracts/src/content.ts`.
2. Bump `CONTRACTS_REV` in `packages/contracts/src/constants.ts`.
3. Add a `FloorDef` to the `floors` array in `packages/content/src/data.ts`.
4. Update any `Record<FloorId, ...>` maps (for example simulator rake bands) so the new
   id is handled.
5. Add or update tests and any floor-specific sprite/boss wiring.
6. Re-run contract, content, core, and simulator checks.

A `FloorDef` variant using the existing shape looks like this:

```ts
{
  id: 'FLOOR_VAULT',
  name: 'The Sub-Level Vault',
  order: 2,
  next: ['FLOOR_PENTHOUSE'],
  bossId: 'zero',
  physics: { friction: 0.88, gutterRisk: 1.1, dozerSpeed: 0.06, pegs: standardPegs() },
  chuteMults: [0.8, 1.5, 3, 1.5, 2],
  pegChips: { gold: 30, bumper: 60, golden: 90, splitter: 30 },
  lipMult: 1,
  quotaScale: 1,
  shop: floorShop(
    { DRINKS: 20, TRINKETS: 40, REELS: 20, MIXED: 20 },
    { TRINKET: 40, DRINK: 20, REEL: 20, COIN: 15, CHASSIS: 5 },
    { common: 50, rare: 25, epic: 15, legendary: 7, cursed: 3 },
  ),
  bgSpriteKey: 'floor.FLOOR_VAULT.bg',
},
```

Important details:

- `order` is the act used for quota indexing: `(order - 1) * 3 + round`.
- `next` controls the elevator options after the boss.
- `quotaScale` multiplies the base quota for every normal round on that floor.
- `lipMult` multiplies every lip payout on that floor.
- `physics.gutterRisk` controls the bevel width, so it changes rake. Re-measure it.
- `shop` weights must sum sensibly per group; shop tests and distribution checks matter.
- `bgSpriteKey` must exist in the asset resolution path or remain an honest placeholder.

Adding a floor is a balance change. Run `pnpm sim rake`, `pnpm sim hitrate`, and
`pnpm sim balance`; update the golden replay hash only when the intended rule/content
change alters the recorded run.

## Add a drink, coin, glyph, or chassis

Use the existing union member in `packages/content/src/content.ts`:

| Kind | Required extras |
|---|---|
| Drink | `instant`, `effects` |
| Coin | `massMul`, `bounceMul`, `payoutMul`, `costPerSpin`, `resistSuction` |
| Glyph | `symbolId`, `bonusTokens` |
| Chassis | `kind`, optional `repeatPrices` |

Drinks and trinkets use handler references. Coins and glyphs are consumed directly by
the run machine. Chassis kinds are a closed union; a new mutation kind is engine work.

## Add a new effect

Only do this when no existing action expresses the behaviour:

1. Add a new `Effect` variant in `packages/contracts/src/protocol.ts` if needed.
2. Add an `EFFECT_HANDLERS` entry in `packages/engine/src/effects/index.ts`.
3. Apply the new effect in the core/effect resolver.
4. Add unit tests for the handler, stacking, caps, and serialization.
5. Bump `CONTRACTS_REV` if a shared type changed.
6. Then add content that references it.

Never make a handler mutate state directly. Handlers return `Effect[]`; the core applies
them in a deterministic order.

## Validation checklist

Before claiming content is finished:

```sh
pnpm typecheck
pnpm test
pnpm sim rake
pnpm sim hitrate
pnpm sim balance
pnpm assets:verify
```

Also run the relevant browser/E2E suite when it exists for the build. This docs task did
not run those checks; see `docs/DELIVERY.md` for the current evidence status.
