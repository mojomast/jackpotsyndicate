# Balance

Balance data currently lives in TypeScript, not a separate `balance.json`:
`packages/content/src/data.ts` (`balance` plus per-floor `quotaScale`, `lipMult`,
`physics`, `pegChips`, `chuteMults`, and shop weights). The spec's intended
`content/balance.json` is not present in this checkout; the code is authoritative.

No balance measurement was re-run for this documentation task. The bands and commands
below are the ones to use, not results claimed as passing here.

## Run structure

- Start bankroll: **500**.
- Each floor: **3 normal rounds × 7 spins**, then a **boss round** (round 4) with no
  quota.
- Normal-round quota rule (D-03): at `ROUND_SETTLE` the quota is deducted from bankroll;
  if bankroll is below quota the run ends.
- Boss rule (D-04): the player passes if cash banked during the boss round is at least
  the boss score after the final settle.
- Shelf persists across rounds within a floor and is re-seeded with 20 tokens on a new
  floor.
- Fever: +20 per spin; at 100 it resets to 20, adds 8 bonus orbs to the next spin, and
  triggers a dozer surge.

## Quotas

Base quota for normal round `n` (1..9) is:

```
baseQuota[n] = balance.quotas[n - 1]
quota        = round(baseQuota[n] * floor.quotaScale)
```

The global normal-round index across floors is:

```
normalRoundIndex = (floor.order - 1) * 3 + round
```

Both Floor 2 branches (`FLOOR_CRYO`, `FLOOR_FOUNDRY`) use `order: 2`, so both use quota
entries 4–6.

Committed base quotas:

| Global round | Base quota |
|---:|---:|
| 1 | 1,000 |
| 2 | 2,100 |
| 3 | 4,410 |
| 4 | 9,261 |
| 5 | 19,448 |
| 6 | 40,841 |
| 7 | 85,766 |
| 8 | 180,109 |
| 9 | 378,229 |

`FLOOR_NEON`, `FLOOR_CRYO`, and `FLOOR_FOUNDRY` use `quotaScale: 1`.
`FLOOR_PENTHOUSE` uses `quotaScale: 2.2`.

## Payout formula

Per spin, over all winning evaluations:

```
A = 1 + Σ additive mult
X = Π x-mult
scoring cell chips_i = symbolChips × Σ lineMult for evaluations containing it
chute tokenCash = round(chips_i × A × X × chuteMult × coinPayoutMult × CASH_PER_CHIP)
lip bankroll += round(tokenCash × floor.lipMult × lipModifiers) + flat bonuses
```

`CASH_PER_CHIP` is currently **1.0**. Chute multipliers are
`[0.8, 1.5, 3.0, 1.5, 2.0]` on all floors. A dead spin launches one Scrap Copper orb
worth **15%** of the cheapest symbol's chips.

## Floor tuning

| Floor | friction | gutterRisk | dozerSpeed | lipMult | quotaScale |
|---|---:|---:|---:|---:|---:|
| `FLOOR_NEON` | 0.90 | 1.00 | 0.050 | 1.0 | 1.0 |
| `FLOOR_CRYO` | 0.96 | 1.35 | 0.075 | 1.0 | 1.0 |
| `FLOOR_FOUNDRY` | 0.84 | 0.65 | 0.045 | 1.0 | 1.0 |
| `FLOOR_PENTHOUSE` | 0.91 | 1.15 | 0.065 | 1.5 | 2.2 |

`gutterRisk` sets the bevel width beside each gutter (`26 × gutterRisk²` board units).
Higher values make more tokens leave through gutters. Any change here requires a new
rake measurement.

Shop archetype weights are per floor:

| Floor | DRINKS | TRINKETS | REELS | MIXED |
|---|---:|---:|---:|---:|
| Neon | 25 | 25 | 25 | 25 |
| Cryo | 60 | 15 | 15 | 10 |
| Foundry | 10 | 65 | 10 | 15 |
| Penthouse | 10 | 20 | 55 | 15 |

## Shop economy

- Starting capacity: **4**; maximum **10**.
- Expand: starts at **150**, then **×1.6** per purchase.
- Reroll: starts at **25**, then **×1.45** per reroll, reset each floor.
- Boss relic reward: choose 1 of 3 random trinkets, free (D-09).
- Madame Zero's reward adds +2 shop capacity.
- Drinks occupy a 3-slot tray; at most one active drink per spin; Lubricant Oil Shot is
  instant.
- No trinket cap; duplicates stack.

## Symbols and items

The normative slot, orb, and token stats are in `docs/SPEC.md` §2.6 and are asserted by
`packages/content/tests/content.test.ts`. Initial item prices and effects are in
`docs/SPEC.md` §2.7 and `packages/content/src/data.ts`.

Balance-sensitive warning: the content tests pin the current item counts and several
prices. Intentional content changes must update those tests; silently deleting
assertions hides balance drift.

## Acceptance bands

| ID | Measurement | Band |
|---|---|---|
| AC-5 | Gutter rake, no trinkets, 10,000 bot spins | Neon 18% ±4, Cryo 24% ±5, Foundry 12% ±4, Penthouse 21% ±5 |
| AC-6 | 2,000 seeded runs per bot | Random buyer clears Floor 1 in 35–65%, wins run in 2–15%; greedy synergy wins 25–60%; no run over 1e12 bankroll |
| AC-7 | Base 3×3 CLASSIC hit rate | 30–45% of evaluations have at least one win |

Simulator bands are defined in `tools/sim/src/reports.ts`; rake bands are also encoded
there for the engine-level measurement.

## Measurement commands

```sh
# AC-5, engine + physics, no trinkets, 10,000 spins per floor
pnpm sim rake

# AC-7, base 3x3 CLASSIC
pnpm sim hitrate

# AC-6, 2,000 runs per bot (default is lower; pass --runs 2000)
pnpm sim balance --runs 2000

# Golden replay against the committed fixture
pnpm sim replay
```

The fast physics-only harness remains available:

```sh
pnpm sim:rake [spinsPerSeed] [seeds]
pnpm sim:perf
```

Reports are written under `artifacts/sim/` (git-ignored). A failing band is a tuning task,
not a simulator failure; the report is still written.

## Tuning workflow

1. Change only content data for a first pass: prices, strip weights, quotas, floor
   physics, shop weights, rarity weights.
2. Run the three simulator commands at their acceptance sample sizes.
3. Compare reports, not one-off runs. Look at both floor-1 clear rate and full win rate.
4. Re-run the golden replay. If a rule/content change intentionally alters it, record
   the new fixture hash deliberately; never edit the hash by hand to force a pass.
5. Update `docs/PHYSICS.md` if the physics harness numbers change.
6. Re-run browser/performance checks outside this docs task.

## Evidence status

- `docs/PHYSICS.md` records physics-harness rake numbers from earlier work. Those are
  harness measurements, not a fresh engine-level AC-5 run.
- `fixtures/replay.golden.json` records a `victory` run with expected hash
  `bade5e3091c269a205ccace5`. It was **not replayed** during this docs task.
- AC-5, AC-6, AC-7, and the three-browser determinism claim are **not re-verified**
  here. Run the commands above and record the output before claiming them.
