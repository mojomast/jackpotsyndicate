# Spec drift audit (engine, core, contracts, physics)

Audit of `docs/SPEC.md` sections 1.4 (R-\*), 2.4 (C-2/C-3 events), 2.5 (phase machine),
2.6 (scoring and symbol rules, normative) and 2.7 (items) against `packages/engine`,
`packages/core`, `packages/contracts`, `packages/physics` and `packages/audio`, on branch
`polish/engine` (base `794318a`). Where SPEC and `packages/contracts` disagree on an
interface, contracts win (SPEC 0.1, `docs/CONTRACTS.md`).

Status: **OK** implemented as specified, **Partial**, **Missing**, **Contradicts**.
"Before" is `794318a`; "After" is this branch. Line numbers are for this branch.
Rows marked *other owner* were not changed here; their status is a spot check only.

## Summary of fixes (highest gameplay impact first)

1. **Drinks did nothing.** Martini +1 Mult, Alchemist Absinthe +1 X and Green Fairy x1.5 X were
   committed to `nextSpin` after scoring, then erased by the next-spin carry baseline, so they
   never applied to any spin. They now apply to the spin the drink is drunk for (D-08).
2. **Magnet Skull idle drain missing** (SPEC 2.6: "drains 25 if visible and not scoring").
3. **Uranium "+15 chips to every other orb per peg hit" missing.**
4. **Boss rewards ignored the boss.** Every boss win dealt a relic; Madame Zero's +2 shop
   capacity was never paid.
5. **CLUSTER never tumbled**; `TumbleStep` was never emitted (R-MUT-04, C-2).
6. **Overvolt was free and partly broken.** `SetOvervolt` worked without buying the chassis;
   buying it did nothing; HYPER rejected the UI's `row:N` ids (wirings used `row-N`); with a
   jumper wired, CLASSIC switched to the `row-N` evaluator so the selected line never matched.
   Seven's full-line x5 was lost on HYPER and whenever jumpers existed.
7. **Item rules missing:** glyph shelf bonus tokens, Blood Doubloon cost per spin, instant
   Lubricant Oil Shot, chassis repeat prices (column 400 then 900).
8. **Shop rules:** reroll price reset every visit (spec: escalates, resets per floor); expand did
   not stock the new slot; owned/free coins, maxed chassis and unusable jumpers/overvolt/harness
   were offered; buying a 4th jumper soft-locked `JUMPER_PICK`.
9. **Saves:** relic and jumper offers lived only in `RunMachine` private fields, so a save in a
   picker could not be completed. They now live in `RunState` and are re-announced on load.
10. Smaller: diamond adjacency counted diamonds instead of (diamond, skull) pairs; Valenti
    suction only started after the duel's first spin and vanished on resume; Gold Peg Alchemist's
    +40 per token was tripled on bullion; direct spawns at the token cap lost their cash; stale
    token cash survived floor changes; Tesla counted peg hits per orb; `bestSpinEquity` was never
    updated; WAYS ignored `minMatch`; `DrinkActive(null)` never announced a consumed drink.

## Core cascade

| ID | Before | After | Evidence / notes |
|---|---|---|---|
| R-CORE-01 | OK | OK | One orb per orb-plan entry, `core.ts:869` `launchPlanOrb`; token at chute X in physics; bankroll rises on `LipDrop` (`core.ts:1171`). Drains (skull, coin) and Midas flat bonus are the only other bankroll moves, all spec items. |
| R-CORE-02 | OK | OK | `scoring/index.ts:203` `scrapChips`; dead spins in every wiring use content chips (`aggregateWins`, `scoring/index.ts:331`). |
| R-CORE-03 | OK (Node/Chromium) | OK (Node/Chromium) | No `Math.random`/`Date` added; tumble refills use the seeded `reels` stream (`run/index.ts:426`). Firefox/WebKit still unverified (unchanged). |
| R-CORE-04 | OK | OK | `COMMAND_PHASES` table; every new refusal (`NOT_OWNED`, `INSUFFICIENT_FUNDS`, `AT_LIMIT`, `INVALID_TARGET`) returns before any state write (tests in `engine/tests/drift.test.ts`). |
| R-CORE-05 | OK | OK | Headless; 80 balance runs in ~18 s. |

## Stage 1: slot

| ID | Before | After | Evidence / notes |
|---|---|---|---|
| R-SLOT-01 | OK | OK | `slot/core/index.ts:136` `drawGrid`, one seeded stop per column. |
| R-SLOT-02 | OK | OK | `scoring/index.ts:97` `classicLines`; 3x3 has 5 lines. |
| R-SLOT-03 | Partial | OK | Was correct only for plain CLASSIC. `scoreWiring` (`scoring/index.ts:417`) applies the same A/X/chips rules to every wiring, keeps overvolt and full-line X with jumpers. |
| R-SLOT-04 | Partial | OK | See SPEC 2.6 table below. |
| R-SLOT-05 | OK | OK | `run/index.ts` `grantItem` REEL pushes onto the chosen strip. |

## Mutations

| ID | Before | After | Evidence / notes |
|---|---|---|---|
| R-MUT-01 | OK | OK | `run/index.ts:1031` `applyChassis`; `GridMutated` emitted. |
| R-MUT-02 | Partial | OK | V lines existed (`slot/wirings/index.ts:107`) but used `row-N` ids, so overvolt from the UI (`row:N`) was rejected on HYPER and Seven full-line X was skipped. Ids unified. |
| R-MUT-03 | Partial | OK | `evaluateWays` (`slot/wirings/index.ts:206`) now honours `minMatch`. |
| R-MUT-04 | Partial | OK | Tumbles existed only as a library function. Core now runs `tumbleCluster` (`core.ts:214`) with seeded refills, frozen cells held in place, and emits `TumbleStep` 36 ticks apart before the first orb (`core.ts:798`). Each step's cluster cells launch their own orbs. |
| R-MUT-05 | Contradicts | OK | Buying a jumper at the cap entered `JUMPER_PICK` that rejected every choice (soft lock); on WAYS/CLUSTER the money was taken for nothing. `purchaseBlock` (`run/index.ts:118`) refuses both and the shop no longer offers them. Repeat price applies (`offerPrice`, `run/index.ts:152`). |
| R-MUT-06 | Contradicts | OK | `SetOvervolt` needs `RunState.overvoltOwned` (`run/index.ts:1192`); buying arms the middle row (`run/index.ts:1094`); any CLASSIC/HYPER/jumper line id is accepted (`overvoltLineIds`). `OvervoltSet` event added. |

## Stage 2: pachinko

| ID | Before | After | Evidence / notes |
|---|---|---|---|
| R-PCH-01 | OK | OK | Layout from content (`standardPegs`), 5 rows 7/6. |
| R-PCH-02 | OK | OK | `items/index.ts` `applyCoinToOrbSpec`. |
| R-PCH-03 | OK | OK | Peg chips `core.ts` `handlePegHit`; split copies chips; chute mults from floor. |
| R-PCH-04 | OK | OK | `pachinko/chamber.ts:97` cap 48 + queue; age forced down. |
| R-PCH-05 | Partial | OK | Physics flags were all present. Missing engine half of Uranium (+15 chips to every other orb per hit): `DEFAULT_SYMBOL_EFFECTS` (`effects/index.ts:264`) dispatched for the hitting orb's symbol (`core.ts:1036`). |

## Stage 3: coin pusher

| ID | Before | After | Evidence / notes |
|---|---|---|---|
| R-PSH-01 | OK | OK | `pusher/chamber.ts`. |
| R-PSH-02 | OK | OK | `SURGE_TICKS` 45. |
| R-PSH-03 | Partial | OK | Physics merges at 150. Chute-exit merges kept cash, but direct spawns (glyph, drink, trinket tokens) at the cap lost theirs; `applySpawns` now credits the merge target (`core.ts:1319`). |
| R-PSH-04 | OK | OK | Weld, micro-medals, seismic, magnet, bullion in physics; values in core. |
| R-PSH-05 | OK | OK | Physics golden hash unchanged (`95279e711596312a`); rake bands per `docs/PHYSICS.md`. |
| R-PSH-06 | OK *(other owner)* | — | board-render. |

## Run structure

| ID | Before | After | Evidence / notes |
|---|---|---|---|
| R-RUN-01 | OK | OK | `shopLeave` → BOSS_INTRO after round 3 (`run/index.ts:932`). |
| R-RUN-02 | OK | OK | `quotaForNormalRound` (`run/index.ts:219`), `judgeRound` (`run/index.ts:775`). |
| R-RUN-03 | OK | OK | `spinResolved` → ROUND_SETTLE 300 ticks. |
| R-RUN-04 | OK | OK | `run/index.ts:686`; Seven trigger via `triggerFever` (`core.ts:1342`). |
| R-RUN-05 | OK | OK | `chooseFloor` (`run/index.ts:1109`), reconfigure + reseed at PREP (`core.ts:434`). Stale token cash from the old shelf is now dropped. |
| R-RUN-06 | OK *(UI)* | — | Seed in state; display/copy is UI. |
| R-RUN-07 | Partial | OK | Saves at RELIC_PICK/JUMPER_PICK could not be finished (offers in private fields). Offers are now `RunState.pendingRelics/pendingJumpers` and re-announced by `Core.load` (`core.ts:361`). Valenti suction is re-derived on load. The UI still skips saving in pickers (`apps/game/src/app/saveSafety.ts`); it may now include them. |

## Bosses

| ID | Before | After | Evidence / notes |
|---|---|---|---|
| R-BOS-01 | OK | OK | Boss scores at each spin start (`core.ts:546`), `BossScored.playerScore`; D-04 in `judgeRound`. |
| R-BOS-02 | Partial | OK | Score `boss/index.ts:612`. Suction now live from the duel's first PREP and after resume (`core.ts:619`), not only after the first spin. Lead Slug/magnetic resist in physics (`pusher/chamber.ts:293`). Reward relic pick (D-09). |
| R-BOS-03 | Contradicts | OK | Freeze/ice/score were right; reward was a relic. `claimBossReward` (`run/index.ts:727`) now pays +2 shop capacity, emits `BossRewarded`, then ELEVATOR. |
| R-BOS-04 | OK | OK | Curve score, sweep every 3rd reciprocation (`boss/index.ts:920`); reward victory (also via `BossRewarded`). |

## Shop and items

| ID | Before | After | Evidence / notes |
|---|---|---|---|
| R-SHP-01 | Partial | OK | Archetype roll OK; the pool now excludes items the player cannot use (`shopCatalog`, `purchaseBlock`). |
| R-SHP-02 | Contradicts | OK | Reroll price reset on every visit; now escalates across a floor and resets in `chooseFloor`/`NewRun` (`run/index.ts:843`). Expand now stocks the new slot at once (`run/index.ts:896`). |
| R-SHP-03 | OK | OK | `ARCHETYPE_CATEGORIES`. Note Neon content weights CHASSIS at 0 (balance owner). |
| R-TRK-01 | OK | OK | Duplicates fold into `copies` (`effects/index.ts:616`). Rail is UI. |
| R-TRK-02 | Partial | OK | 14/15 were wired. Gold Peg Alchemist's +40 is now per token (was multiplied by bullion stack); Tesla counts peg hits across the spin (`core.ts:1051`) rather than per orb. |
| R-ITM-01 | Partial | OK | Drinks: 3 of 5 had no effect (summary item 1); Lubricant Oil Shot is instant (`run/index.ts:635`, `core.ts:510`). Coins: Blood Doubloon's 50/spin was never charged (`run/index.ts:656`, refuses the spin when unaffordable). Glyph shelf bonus tokens were never spawned (`core.ts:525`; each worth one base orb of its symbol). Chassis repeat prices applied (`offerPrice`). The free Copper Token can always be loaded. |

## SPEC 2.5 phase machine

| Rule | Before | After | Evidence / notes |
|---|---|---|---|
| Phase graph | OK | OK | `COMMAND_PHASES`; extra RELIC_PICK/JUMPER_PICK/FLOOR_TRANSITION per CONTRACTS.md. |
| Spin only with no orbs in flight/queued | OK | OK | `setOrbsInFlight(orbs + queued)`. |
| Pusher runs only in PREP/SPINNING/RESOLVING/ROUND_SETTLE | OK | OK | `core.ts:307`. |
| Tick order | OK | OK | `Core.tick`. |
| Tumble steps delay the orb plan 36 ticks each | Missing | OK | `core.ts:798`. |

## SPEC 2.6 scoring and symbols (normative)

| Rule | Before | After | Evidence / notes |
|---|---|---|---|
| A = 1 + Σ +Mult per winning evaluation (+ drink/trinket) | Partial | OK | Drink additions were lost (summary item 1). |
| X = Π x-mult incl. drink, trinket, carried bonuses | Partial | OK | Same; trinket next-spin bonuses earned at evaluation now carry to the next spin. |
| chips_i = symbolChips × Σ lineMult (overvolt 3, WAYS ways, CLUSTER size/4) | Partial | OK | Overvolt failed on HYPER / with jumpers. |
| Peg bonuses; clone copies chips | OK | OK | |
| tokenCash and lip payout formulas | OK | OK | `core.ts:1108`, `core.ts:1171`. |
| HUD Spin Equity | OK | OK | `SpinEvaluated.equity`; `stats.bestSpinEquity` now tracked (`core.ts:762`). |
| Diamond: +0.2 X per adjacent Skull | Partial | OK | Counted diamonds, not pairs, and paid idle diamonds. Now per (scoring diamond, skull) pair (`effects/index.ts:320`). |
| Diamond pinfield chain / shelf weld | OK | OK | physics. |
| Cherry: adjacent pairs on reel 1; canSplit + first-peg split; 2 micro-medals at half cash | OK | OK | |
| Uranium: x1.8; accel; +15 chips to other orbs; seismic | Partial | OK | +15 chips added (above). |
| Skull: drains 25 if visible and not scoring | Missing | OK | `core.ts:842`, emits `IdleDrain` + `BankrollChanged(drain)`. Frozen cells are out of play and do not drain. |
| Skull: pull; drains 50 in a gutter | OK | OK | `core.ts:1201`. |
| Seven: x1.5, x5 on a full line | Partial | OK | Full line now recognised on any wiring's paylines. |
| Seven: 3+ visible → Fever | OK | OK | `feverOnVisibleSevens`. |
| Seven: golden bumper upgrade; bullion stack 3x cash | OK | OK | |
| Scrap orb: 15% of cheapest chips | OK | OK | |

## SPEC 2.7 items

| Item | Before | After | Notes |
|---|---|---|---|
| 15 trinkets | 13 OK, 2 Partial | OK | Gold Peg Alchemist, Tesla (above). |
| Dirty Syndicate Martini | Partial (bonus orbs only) | OK | |
| Alchemist Absinthe | Partial (bullion only) | OK | Its bullion carries 0 cash in content (balance owner). |
| Green Fairy Absinthe | Partial (surge only) | OK | |
| Nitrous Espresso | OK | OK | |
| Lubricant Oil Shot | Partial (surged at next spin) | OK | Surges on drink. |
| Copper / Lead Slug / Superball | OK | OK | |
| Blood Doubloon | Partial (no cost) | OK | |
| Reel glyphs (+tokens) | Partial (no tokens) | OK | |
| Chassis prices | Partial (no repeat price) | OK | |

## C-2 / C-3 events

| Event | Before | After | Notes |
|---|---|---|---|
| SpinStarted, ReelStopped, SpinEvaluated, OrbLaunched, PegHit, OrbSplit, ChuteExit, TokenSpawned, TokenMerged, LipDrop, GutterLoss, DozerFullExtension, SurgeStarted, FeverTriggered, BossScored, BossSabotage, RoundSettled, PhaseChanged, ShopRolled, ItemBought, TrinketMounted, GridMutated, BankrollChanged, RunEnded | OK | OK | |
| TumbleStep | Missing | OK | |
| BankrollChanged reason `coin` | Never emitted | OK | Blood Doubloon. |
| DrinkActive(null) | Never emitted | OK | When the active drink is consumed. |
| ShopRolled on expand | Missing | OK | |
| RelicsOffered / JumpersOffered on resume | Missing | OK | |
| New: `BossRewarded`, `IdleDrain`, `OvervoltSet` | — | Added | Additive contract variants. |

## Presentation and non-functional (other owners, spot check only)

R-UI-01..05, R-ANI-01..03, R-AUD-01, R-AST-01, R-NFR-01..05 belong to the shell, table, anim and
asset owners and were not re-audited. Spot checks: screens and keyboard handling exist in
`apps/game/src`; HyperFrames compositions are in `packages/anim/compositions`; audio maps the
R-AUD-01 events (`packages/audio/src/index.ts`, `EVENT_VOICE_MAP`; `SurgeEnded` reuses the surge
voice, left as is). R-NFR-04 coverage was not measured in this sandbox.

## Contract changes (all additive)

- `RunState.overvoltOwned?: boolean`, `RunState.pendingRelics?: string[]`,
  `RunState.pendingJumpers?: Cell[][]` (+ `runStateSchema`). Absent by default, so hashes of states
  without them are unchanged.
- `EngineEvent` variants `BossRewarded`, `IdleDrain`, `OvervoltSet` (+ `engineEventSchema`).
- Payline ids are now one format everywhere: `row:N`, `diag:down`, `diag:up`, `hyper:v`,
  `hyper:inverted-v`, `jumper:N` (the wirings module used `row-N`/`hyper-v`/`jumper-N`).
- `CONTRACTS_REV` not bumped (integrator's call per `docs/CONTRACTS.md`).

## Remaining gaps

- **Determinism / golden:** these fixes change deterministic play; `fixtures/replay.golden.json`
  no longer replays to its hash (`tools/sim` golden test). Re-record at integration.
- **Balance:** Skull idle drain, working drinks, glyph tokens, Zero's reward change and the
  Doubloon cost all move the AC-6 numbers. A 40-run check on this branch: random-buyer floor-1
  55%, win 5%; greedy win 35% (inside bands, small sample). The balance owner should re-run 2,000.
- **UI:** the overvolt selector is always enabled and lists only rows/diagonals; it should be
  gated on `state.overvoltOwned` and list HYPER zigzags and jumpers (ids above). Drink buttons
  are disabled while a drink is active, but an instant drink can still be drunk then.
- **Spec ambiguity resolved by judgement:** frozen Skulls do not drain; glyph bonus tokens are
  worth one base orb of their symbol (chips x cashPerChip x stack); drinks' "next spin" means the
  spin they are drunk for.
- **Not verified:** Firefox/WebKit determinism (R-CORE-03), as before.
