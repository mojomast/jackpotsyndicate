/**
 * Measurement commands. Rake and hit rate drive a real `GameCore` through
 * public commands; no physics or engine internals are touched.
 */
import type { FloorDef, FloorId } from '../../../packages/contracts/src/index';
import { CONTENT_BUNDLE } from '../../../packages/content/src/index';
import { createGameCore } from '../../../packages/core/src/index';
import type { BotId } from './bots';
import { playRun, playSpins, type RunResult } from './runner';
import {
  HITRATE_BAND,
  RAKE_BANDS,
  type HitRateResult,
  type RakeFloorResult,
} from './reports';

function rakeContent(floor: FloorDef) {
  return {
    ...CONTENT_BUNDLE,
    // AC-5 measures with no trinkets, so the shop has nothing to sell.
    items: [],
    floors: [{ ...floor, order: 1 as const, next: [] }],
    // A no-trinket bot cannot meet the retail quota without purchases. Rake is
    // a physics measurement, so remove that pressure to let each sample play
    // its three normal rounds instead of dying after round one.
    balance: { ...CONTENT_BUNDLE.balance, quotas: CONTENT_BUNDLE.balance.quotas.map(() => 0) },
  };
}

/** Gutter share of tokens leaving the shelf, for one floor and no trinkets. */
export function measureFloorRake(
  floor: FloorDef,
  spins: number,
  seedBase = 'rake',
): RakeFloorResult {
  const core = createGameCore({ content: rakeContent(floor), seedShelf: true });
  let lipDrops = 0;
  let gutterLosses = 0;
  const unsubscribe = core.subscribe((event) => {
    if (event.t === 'LipDrop') lipDrops += 1;
    else if (event.t === 'GutterLoss') gutterLosses += 1;
  });

  let played = 0;
  let runs = 0;
  while (played < spins) {
    core.dispatch({ c: 'NewRun', seed: `${seedBase}:${floor.id}:${runs}` });
    let runSpins = 0;
    let guard = 0;
    while (runSpins < 21 && played < spins && guard++ < 60_000) {
      const phase = core.phase;
      if (phase === 'PREP') {
        if (core.getState().spinsLeft <= 0) break;
        if (core.dispatch({ c: 'Spin' }).ok) {
          runSpins += 1;
          played += 1;
          let spinGuard = 0;
          while (
            (core.phase === 'SPINNING' || core.phase === 'RESOLVING') &&
            spinGuard++ < 20_000
          ) {
            core.tick();
          }
        } else {
          core.tick();
        }
      } else if (phase === 'ROUND_RESULT') {
        if (!core.dispatch({ c: 'ContinueAfterRound' }).ok) core.tick();
      } else if (phase === 'SHOP') {
        if (!core.dispatch({ c: 'ShopLeave' }).ok) core.tick();
      } else if (phase === 'BOSS_INTRO' || phase === 'VICTORY' || phase === 'GAME_OVER') {
        break;
      } else {
        core.tick();
      }
    }
    runs += 1;
  }

  unsubscribe();
  const total = lipDrops + gutterLosses;
  const band = RAKE_BANDS[floor.id];
  const rake = total === 0 ? 0 : gutterLosses / total;
  return {
    floorId: floor.id,
    floorName: floor.name,
    spins: played,
    runs,
    lipDrops,
    gutterLosses,
    rake,
    target: band.target,
    tolerance: band.tolerance,
    inBand: Math.abs(rake - band.target) <= band.tolerance,
  };
}

export function measureRake(
  spinsPerFloor: number,
  seedBase = 'rake',
): RakeFloorResult[] {
  return CONTENT_BUNDLE.floors.map((floor) =>
    measureFloorRake(floor, spinsPerFloor, seedBase),
  );
}

/** AC-7 hit rate on the base 3x3 CLASSIC grid. */
export function measureHitRate(spins: number, seedBase = 'hitrate'): HitRateResult {
  const result = playSpins(seedBase, spins);
  const hitRate = result.evaluations === 0 ? 0 : result.winningEvaluations / result.evaluations;
  return {
    spins: result.spins,
    evaluations: result.evaluations,
    winningEvaluations: result.winningEvaluations,
    hitRate,
    targetLow: HITRATE_BAND[0],
    targetHigh: HITRATE_BAND[1],
    inBand: hitRate >= HITRATE_BAND[0] && hitRate <= HITRATE_BAND[1],
    ticks: result.ticks,
  };
}

export interface BalanceOptions {
  runsPerBot: number;
  bots?: readonly BotId[];
  seedBase?: string;
  onRun?: (done: number, total: number, result: RunResult) => void;
}

export function runBalance(options: BalanceOptions): RunResult[] {
  const bots = options.bots ?? (['random-buyer', 'greedy-synergy'] as const);
  const seedBase = options.seedBase ?? 'sim';
  const results: RunResult[] = [];
  const total = bots.length * options.runsPerBot;
  for (const bot of bots) {
    for (let run = 0; run < options.runsPerBot; run++) {
      const result = playRun({ seed: `${seedBase}:${bot}:${run}`, bot });
      results.push(result);
      options.onRun?.(results.length, total, result);
    }
  }
  return results;
}

export const FLOOR_IDS: readonly FloorId[] = CONTENT_BUNDLE.floors.map((floor) => floor.id);
