/**
 * Headless run driver. The bot only supplies public commands; the driver owns
 * the phase machine bookkeeping (ticking timed phases and dispatching the
 * command the human UI would dispatch).
 */
import type {
  Command,
  ContentBundle,
  FloorId,
  GameEvent,
  Phase,
  RunState,
} from '../../../packages/contracts/src/index';
import { createGameCore, type Core } from '../../../packages/core/src/index';
import { CONTENT_BUNDLE } from '../../../packages/content/src/index';
import { BOTS, type Bot, type BotId } from './bots';
import { SimRng } from './rng';

export interface RunStats {
  spins: number;
  evaluations: number;
  winningEvaluations: number;
  lipDrops: number;
  gutterLosses: number;
  cashBanked: number;
  maxBankroll: number;
  itemsBought: string[];
}

export type RunOutcome = 'victory' | 'defeat' | 'abandoned' | 'timeout';

export interface RunResult {
  bot: BotId;
  seed: string;
  outcome: RunOutcome;
  finalPhase: Phase;
  floorId: FloorId;
  round: number;
  floorsCleared: FloorId[];
  clearedFloor1: boolean;
  won: boolean;
  bankroll: number;
  maxBankroll: number;
  ticks: number;
  commandLog: { tick: number; cmd: Command }[];
  finalHash: string;
  stats: RunStats;
}

function isSpinPhase(phase: Phase): boolean {
  return phase === 'SPINNING' || phase === 'RESOLVING';
}

export interface RunOptions {
  seed: string;
  bot: BotId | Bot;
  maxTicks?: number;
  /** Optional hook for every emitted event (reporting/observability). */
  onEvent?: (event: GameEvent, core: Core) => void;
  /**
   * Content override for balance experiments (variants). Defaults to the
   * committed CONTENT_BUNDLE, so golden replays are unaffected.
   */
  content?: ContentBundle;
}

interface Observation {
  stats: RunStats;
  outcome: RunOutcome | null;
  relicOptions: string[];
}

function makeObservation(): Observation {
  return {
    stats: {
      spins: 0,
      evaluations: 0,
      winningEvaluations: 0,
      lipDrops: 0,
      gutterLosses: 0,
      cashBanked: 0,
      maxBankroll: 0,
      itemsBought: [],
    },
    outcome: null,
    relicOptions: [],
  };
}

function observe(observation: Observation, event: GameEvent): void {
  const stats = observation.stats;
  switch (event.t) {
    case 'SpinStarted':
      stats.spins += 1;
      break;
    case 'SpinEvaluated':
      stats.evaluations += 1;
      if (event.wins.length > 0) stats.winningEvaluations += 1;
      break;
    case 'LipDrop':
      stats.lipDrops += 1;
      break;
    case 'GutterLoss':
      stats.gutterLosses += 1;
      break;
    case 'CashBanked':
      stats.cashBanked += event.cash;
      break;
    case 'BankrollChanged':
      stats.maxBankroll = Math.max(stats.maxBankroll, event.total);
      break;
    case 'ItemBought':
      stats.itemsBought.push(event.itemId);
      break;
    case 'RelicsOffered':
      observation.relicOptions = [...event.itemIds];
      break;
    case 'RunEnded':
      observation.outcome = event.outcome;
      break;
    default:
      break;
  }
}

function floorOptions(state: Readonly<RunState>, content: ContentBundle): FloorId[] {
  const floor = content.floors.find((candidate) => candidate.id === state.floorId);
  return floor === undefined ? [] : [...floor.next];
}

function dispatchSafe(core: Core, command: Command): boolean {
  return core.dispatch(command).ok;
}

function handleShop(core: Core, bot: Bot, rng: SimRng, owned: Set<string>): void {
  let rerolls = 0;
  for (;;) {
    if (core.phase !== 'SHOP') return;
    const plan = bot.shop(core.getState(), rng);
    if (plan.reroll && rerolls < 2) {
      if (dispatchSafe(core, { c: 'ShopReroll' })) {
        rerolls += 1;
        continue;
      }
    }

    for (const command of plan.buy) {
      if (core.phase !== 'SHOP') break;
      if (command.c !== 'ShopBuy') continue;
      const offer = core
        .getState()
        .shop.offers.find((candidate) => candidate.offerId === command.offerId);
      if (offer === undefined) continue;
      if (dispatchSafe(core, command)) owned.add(offer.itemId);
    }
    break;
  }

  if (core.phase === 'SHOP') dispatchSafe(core, { c: 'ShopLeave' });
}

function handlePrep(core: Core, bot: Bot, rng: SimRng, owned: Set<string>): void {
  const state = core.getState();
  for (const command of bot.prep(state, owned, rng)) {
    if (core.phase !== 'PREP') break;
    dispatchSafe(core, command);
  }
  if (core.phase === 'PREP' && core.getState().spinsLeft > 0) {
    if (!dispatchSafe(core, { c: 'Spin' })) core.tick();
  } else {
    core.tick();
  }
}

function handleRelic(core: Core, bot: Bot, rng: SimRng, observation: Observation): void {
  const options = observation.relicOptions;
  const index = options.length === 0 ? 0 : bot.relic(options, rng);
  if (!dispatchSafe(core, { c: 'ChooseRelic', index })) core.tick();
  observation.relicOptions = [];
}

function handleElevator(core: Core, bot: Bot, rng: SimRng, content: ContentBundle): void {
  const options = floorOptions(core.getState(), content);
  if (options.length === 0) {
    core.tick();
    return;
  }
  const choice = bot.floor(options, rng);
  if (choice === undefined || !dispatchSafe(core, { c: 'ChooseFloor', floorId: choice })) {
    core.tick();
  }
}

/** Play one complete run to Victory/Game Over, or until `maxTicks`. */
export function playRun(options: RunOptions): RunResult {
  const bot = typeof options.bot === 'string' ? BOTS[options.bot] : options.bot;
  const content = options.content ?? CONTENT_BUNDLE;
  const core = options.content === undefined ? createGameCore() : createGameCore({ content });
  const observation = makeObservation();
  const rng = new SimRng(`${options.seed}:${bot.id}`);
  const owned = new Set<string>();
  const maxTicks = options.maxTicks ?? 250_000;
  const unsubscribe = core.subscribe((event) => {
    observe(observation, event);
    options.onEvent?.(event, core);
  });

  core.dispatch({ c: 'NewRun', seed: options.seed });

  let guard = 0;
  while (core.phase !== 'VICTORY' && core.phase !== 'GAME_OVER') {
    if (core.tickCount >= maxTicks) break;
    if (guard++ > 2_000_000) break;

    const phase = core.phase;
    if (phase === 'PREP') {
      handlePrep(core, bot, rng, owned);
    } else if (phase === 'SHOP') {
      handleShop(core, bot, rng, owned);
    } else if (phase === 'ROUND_RESULT' || phase === 'BOSS_INTRO') {
      if (!dispatchSafe(core, { c: 'ContinueAfterRound' })) core.tick();
    } else if (phase === 'RELIC_PICK') {
      handleRelic(core, bot, rng, observation);
    } else if (phase === 'ELEVATOR') {
      handleElevator(core, bot, rng, content);
    } else if (phase === 'JUMPER_PICK') {
      if (!dispatchSafe(core, { c: 'ChooseJumper', index: 0 })) core.tick();
    } else if (phase === 'TITLE') {
      core.dispatch({ c: 'NewRun', seed: options.seed });
    } else {
      core.tick();
    }
  }

  unsubscribe();
  const state = core.getState();
  const outcome: RunOutcome =
    observation.outcome ??
    (state.phase === 'VICTORY' ? 'victory' : state.phase === 'GAME_OVER' ? 'defeat' : 'timeout');

  return {
    bot: bot.id,
    seed: options.seed,
    outcome,
    finalPhase: state.phase,
    floorId: state.floorId,
    round: state.round,
    floorsCleared: [...state.floorsCleared],
    clearedFloor1: state.floorsCleared.includes('FLOOR_NEON'),
    won: outcome === 'victory',
    bankroll: state.bankroll,
    maxBankroll: Math.max(observation.stats.maxBankroll, state.bankroll),
    ticks: core.tickCount,
    commandLog: core.getCommandLog(),
    finalHash: core.stateHash(),
    stats: observation.stats,
  };
}

/**
 * Play up to `spins` spins with no shopping (used by hit-rate measurement).
 * A fresh run is seeded at every 7-spin round boundary.
 */
export function playSpins(
  seedBase: string,
  spins: number,
  onEvent?: (event: GameEvent) => void,
): { spins: number; evaluations: number; winningEvaluations: number; ticks: number } {
  const core = createGameCore();
  let played = 0;
  let evaluations = 0;
  let winning = 0;
  const unsubscribe = core.subscribe((event) => {
    onEvent?.(event);
    if (event.t === 'SpinEvaluated') {
      evaluations += 1;
      if (event.wins.length > 0) winning += 1;
    }
  });

  let batch = 0;
  while (played < spins) {
    core.dispatch({ c: 'NewRun', seed: `${seedBase}:${batch}` });
    for (let spin = 0; spin < 7 && played < spins; spin++) {
      if (core.phase !== 'PREP') break;
      if (!core.dispatch({ c: 'Spin' }).ok) break;
      played += 1;
      let guard = 0;
      while (isSpinPhase(core.phase) && guard++ < 20_000) {
        core.tick();
      }
    }
    batch += 1;
  }

  unsubscribe();
  return { spins: played, evaluations, winningEvaluations: winning, ticks: core.tickCount };
}
