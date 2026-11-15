# Balance

Balance data lives in TypeScript: `packages/content/src/data.ts` (`balance`, per-floor
`quotaScale`, `lipMult`, `physics`, `pegChips`, `chuteMults`, shop weights, boss score
params) plus numeric rules in `packages/contracts/src/constants.ts` (`RULES`). The code is
authoritative.

Tuning pass T-082 (branch `polish/balance`) was measured on the merged `polish/engine`
rules (working drinks, Magnet Skull idle drain, Uranium chip spray, boss-specific rewards,
per-floor reroll pricing, unusable shop items filtered).

## Design targets and why

| Target | Value | Why |
|---|---|---|
| AC-6 random F1 clear | 35–65% (aim ~55%) | Spec band. |
| AC-6 random win | 2–15% (aim 3–8%) | A random shopper should rarely win. |
| AC-6 greedy win | 25–60% (aim 25–35%) | Spec band; upper half would make the run trivial for a planner. |
| AC-6 bankroll ceiling | < 1e12 | Spec. Also: no single runaway exponent (aim < 1e8). |
| F1R1 pass | 85–95% | R1 has no shop before it, so death there is pure luck with no agency. |
| Rising tension | Pass rate per stage falls from F1 to F3 for random; deaths spread over the run | Instead of 40% of runs dying in R1. |
| Boss pass (greedy / random) | ~85–95% / ~60–75% | Bosses are a check, not a wall or a formality. |
| Shop decisions | Bankroll after tribute ≈ 1–4 item prices on Floor 1 | Pinned item prices (100–600) must be meaningful. |
| Item power | No item above ~+30pp matched lift with n ≥ 30; every item bought somewhere | No auto-win, no dead items. |
| AC-7 hit rate | 30–45% | Spec. |
| AC-5 rake | Spec bands | `SHELF_SEED_TOKENS` changed, so it was re-measured. |

## Final numbers

| Lever | Before | After |
|---|---|---|
| Start bankroll | 500 | **1,000** |
| Quotas (global normal round 1..9) | 1000, 2100, 4410, 9261, 19448, 40841, 85766, 180109, 378229 | **450, 1800, 4500, 8000, 16000, 32000, 27300, 45500, 72700** (×2.2 on Penthouse = 60,060 / 100,100 / 159,940) |
| `lipMult` Neon / Cryo / Foundry / Penthouse | 1 / 1 / 1 / 1.5 | **0.4 / 0.4 / 0.4 / 0.6** |
| `cashPerChip` | 1 | 1 (unchanged; core tests pin glyph token cash at cashPerChip 1, so scaling lives in `lipMult`) |
| Neon pegs gold/bumper/golden/splitter | 50/160/260/50 | **10/30/50/10** (same as Cryo/Penthouse) |
| Foundry pegs | 60/80/100/60 | **25/50/75/25** (SPEC "+25 per hit") |
| `RULES.SHELF_SEED_TOKENS` | 20 | **60** |
| Valenti score / spin | 450–900 | **180–320** × floor scale |
| Madame Zero | base 600 (engine default) | **base 700**, +0.5 X per frozen cell |
| Iron Auditor | 600 × 1.35^spin | **700** × 1.35^spin × 2.2 |
| Neon category weights | CHASSIS 0, COIN 25 | **CHASSIS 5, COIN 20** (J6 mutations reachable on floor 1) |
| Alchemist Absinthe bullion | 0 cash | **150 cash** |
| WAYS / CLUSTER harness | 500 / 500 | **600 / 350** |

Unchanged on purpose: reel strips (see "Findings"), symbol stats (SPEC 2.6 normative),
trinket/drink/coin prices and params (pinned by `packages/engine/tests/items.test.ts`),
shop reroll/expand costs (pinned by engine shop tests), spins per round, fever.

## Measured results

`sim feel --runs 1000` per bot (seed base `sim`), merged engine. Brackets are Wilson 95% CIs.

| Metric | Before (merged engine) | After | Target | Met |
|---|---|---|---|---|
| Random F1 clear | 50.8% [47.7–53.9] | **54.3% [51.2–57.4]** | 35–65% | yes |
| Random win | 5.9% [4.6–7.5] | **4.1% [3.0–5.5]** | 2–15% | yes |
| Greedy win | 38.7% [35.7–41.8] | **32.1% [29.3–35.1]** | 25–60% (aim 25–35) | yes |
| Greedy F1 clear | 53.9% | **59.1% [56.0–62.1]** | ~75% | **no** (see risks) |
| Max bankroll random / greedy | 8.7M / 45.0M | **3.0M / 15.3M** | < 1e12 | yes |
| F1R1 pass random / greedy | 57.5% / 58.4% | **93.6% / 94.3%** | 85–95% | yes |
| Share of runs dying in F1R1 | ~40% | **6% / 6%** | low | yes |
| Boss pass Valenti / Zero / Auditor (greedy) | 92.5 / 99.1 / 98.5% | **84.7 / 92.2 / 86.5%** | 85–95% | yes |
| Boss pass (random) | 88.3 / 84.8 / 88.1% | **74.8 / 58.7 / 62.1%** | 60–75% | ~yes |
| F1R2 round income / quota (p50, greedy) | 68k / 2.1k (32×) | **5.2k / 1.8k (2.9×)** | 1.5–4× | yes |
| Shop spend share of bankroll (random / greedy) | 1.3% / 2.0% | **11% / 14%** | meaningful | yes |
| Zero-cash spins (all) | 33% / 31% | 34% / 29% | ≤ 15% after R1 | R2+ ~10–15%; R1 ~80% (engine request 1) |
| Hit rate (AC-7) | 38.8% | **40.6%** (5,000 evals) | 30–45% | yes |
| Run length p50 (spins; sim minutes) | 56 / 77 | 42 / 56 spins; 2.9 / 4.2 min | — | — |
| Ticks per spin p50 (p10–p90) | 217 | 217 (135–340) | — | engine request 2 |

Per-stage pass rates (random / greedy):

| Stage | R1 | R2 | R3 | Boss |
|---|---|---|---|---|
| Floor 1 | 94 / 94 | 83 / 82 | 93 / 91 | 75 / 85 |
| Floor 2 | 94 / 95 | 80 / 95 | 72 / 96 | 59 / 92 |
| Floor 3 | 82 / 97 | 70 / 92 | 67 / 88 | 62 / 87 |

Deaths are now spread: random dies at F1 boss 18%, F1R2 16%, F2 boss 12%, F2R3 12%,
F2R2 10%, F1R1 6% ...; greedy at F1R2 17%, F1 boss 11%, F1R3 7%, F1R1 6%, F3R3 5%, F3 boss 5%.

Item power (matched control: runs that reached the same shop without the item). Random
buyer, n ≥ 30 owners: best Ouroboros Capacitor (22% win when owned, +18pp), Lucky Seven Glyph
(22%, +10pp), Midas (18%, +8pp); worst are the one-shot drinks (4–6%, −4..0pp). Greedy:
WAYS harness 86% (n=90, +30pp), Electromagnetic Hopper (+28pp), HYPER (+19pp). Every item
is bought by both bots. WAYS is the strongest pick and was made pricier (600) rather than
weaker.

## Findings worth knowing

- **Magnet Skull tokens are the shelf's conveyor.** Strips with fewer skulls (8–10 instead
  of 15–20 per 40) cut idle drain but dropped R1 lip drops from 3.7 to 0.85 per spin,
  because skull tokens pull the shelf to the centre where the dozer pushes it over the lip.
  The original strips stay.
- **Seeded shelf tokens carry $0**, so R1 spins mostly push worthless seeds over the lip;
  R1 income median is ~$0 and idle drains make p15 about −$525. R1 is therefore a cushioned
  opener (start 1000 vs quota 450) rather than a scoring round.
- **Shelf lag**: a token's value is fixed at chute exit and usually banks a round later, so
  purchases pay off the round after. This is why F1R2 is the hardest early round.

## Requests for the engine owner

1. **Seed tokens carry cash.** In `Core.shelfSeedTokens()/configureFloor`, set
   `tokenCash[id] = balance.seedTokenCash` (proposed 10 × floor `quotaScale`) for each seeded
   token. Why: R1 currently banks nothing visible for ~4 spins. Prototype (sim variant
   monkeypatching `configureFloor`, 25 cash/seed, 250 runs/bot, pre-merge engine): zero-cash
   spins 31.5% → 24.7% (random), F1R1 income p50 940 → 1,501; win rates unchanged within CI.
   With it, start bankroll can drop to ~700 and R1 becomes a real scoring round.
2. **Dead spins launch 2 scrap orbs instead of 1** (R-CORE-02 text change). 44% of spins are
   single-orb spins that resolve in ~135 ticks with little to watch.
3. **`packages/core/tests/drift.test.ts` "reel glyphs drop their bonus tokens…"** asserts token
   cash `45` (= diamond chips × cashPerChip 1). Derive it from `content.balance.cashPerChip`
   so balance can use `cashPerChip` again.
4. **Greedy bot reserve** (tools/sim, balance-owned, not done): the greedy bot spends to ~$0
   after shop 1, which drives most F1R2 deaths. A competent player keeps ~quota/2.

## Remaining risks

- Greedy F1 clear (59%) sits below the ~75% feel target; the gap to random is mainly made on
  floors 2–3. Raising it means a smarter bot (request 4) or more Floor-1 item power.
- 7 greedy runs (0.7%) hit the 250k-tick timeout; longer runs at high orb counts.
- The golden replay (`fixtures/replay.golden.json`) no longer matches: content changes alter
  deterministic play. The lead re-records it at integration.
- Rake (AC-5) moved toward the low edge with 60 seed tokens (Neon 15.2% vs 18 ±4); all in band
  at 4,000 spins/floor. Re-run at 10,000 before release.

## How to re-run

```sh
export NODE_PATH=/tmp/vendor/nm   # sandbox only
# Feel + balance telemetry (per stage, bosses, deaths, shop, item power, CIs)
tsx tools/sim/src/index.ts feel --runs 1000 --workers 2 --out artifacts/sim
# Experiment without editing content: a module whose default export transforms a content clone
tsx tools/sim/src/index.ts feel --runs 300 --variant path/to/variant.ts
# AC-5, AC-6, AC-7
pnpm sim rake && pnpm sim balance --runs 2000 && pnpm sim hitrate
```

A variant folder must contain `{"type":"module"}` in a `package.json`, or tsx loads it as CJS
and its engine imports become a separate module instance (patches then silently do nothing).

## AC-5 rake after the change (4,000 no-trinket spins per floor)

| Floor | Rake | Band | Status |
|---|---:|---|---|
| Neon | 15.2% | 18 ±4 | PASS |
| Cryo | 23.5% | 24 ±5 | PASS |
| Foundry | 10.4% | 12 ±4 | PASS |
| Penthouse | 19.1% | 21 ±5 | PASS |

## Acceptance bands

| ID | Measurement | Band |
|---|---|---|
| AC-5 | Gutter rake, no trinkets, 10,000 bot spins | Neon 18% ±4, Cryo 24% ±5, Foundry 12% ±4, Penthouse 21% ±5 |
| AC-6 | 2,000 seeded runs per bot | Random F1 35–65%, random win 2–15%, greedy win 25–60%, no run over 1e12 |
| AC-7 | Base 3×3 CLASSIC hit rate | 30–45% |
