/**
 * Feel telemetry: per-spin, per-round, per-shop and per-item observations
 * gathered from the public GameCore event stream while a bot plays a run.
 *
 * Everything here is read-only observation. The run itself is driven by
 * `playRun`, so a telemetry run is bit-identical to a plain balance run with
 * the same seed, bot and content.
 */
import type {
  ContentBundle,
  FloorId,
  GameEvent,
} from '../../../packages/contracts/src/index';
import { CONTENT_BUNDLE } from '../../../packages/content/src/index';
import type { BotId } from './bots';
import { playRun, type RunOutcome } from './runner';

/** Stage = (floorOrder - 1) * 4 + round, 1..12. Round 4 is the boss. */
export const STAGE_LABELS = [
  'F1R1', 'F1R2', 'F1R3', 'F1 boss',
  'F2R1', 'F2R2', 'F2R3', 'F2 boss',
  'F3R1', 'F3R2', 'F3R3', 'F3 boss',
] as const;

export function stageOf(floorOrder: number, round: number): number {
  return (floorOrder - 1) * 4 + round;
}

/** Compact per-spin record (arrays keep the cross-process JSON small). */
export interface SpinRecord {
  /** 1..12 */
  stage: number;
  /** 1..7 inside the round */
  spinInRound: number;
  /** Cash banked from this spin's start until the next spin (or round settle). */
  cash: number;
  /** Slot evaluation had at least one winning line/way/cluster. */
  win: boolean;
  /** HUD spin equity at evaluation time. */
  equity: number;
  /** Orbs that entered the pinfield (launches, incl. scrap/bonus). */
  orbs: number;
  /** Extra orbs created by splits. */
  splits: number;
  peg: number;
  tokens: number;
  lips: number;
  gutters: number;
  /** Ticks from Spin command until the board is idle again. */
  ticks: number;
  fever: boolean;
}

export interface RoundRecord {
  stage: number;
  floorId: FloorId;
  kind: 'normal' | 'boss';
  passed: boolean;
  /** Normal: quota. Boss: boss score. */
  target: number;
  /** Bankroll at round start (after the previous shop). */
  bankrollStart: number;
  /** Normal: bankroll before deduction. Boss: player round score. */
  achieved: number;
  /** Net non-shop bankroll change during the round (lip + bonus - drains - coin costs). */
  income: number;
  ticks: number;
  bossId: string | null;
}

export interface ShopRecord {
  stage: number;
  bankroll: number;
  offered: string[];
  bought: string[];
  rerolls: number;
  spent: number;
}

export interface TelemetryRun {
  bot: BotId;
  seed: string;
  outcome: RunOutcome;
  won: boolean;
  clearedFloor1: boolean;
  floorsCleared: number;
  /** Stage the run ended on (1..12). */
  lastStage: number;
  /** Stage label of the failed round, or 'victory' / 'timeout'. */
  death: string;
  maxBankroll: number;
  finalBankroll: number;
  ticks: number;
  spins: SpinRecord[];
  rounds: RoundRecord[];
  shops: ShopRecord[];
  /** itemId -> stage at which it was first acquired (purchase or relic). */
  acquired: Record<string, number>;
  /** itemId -> shop index (0-based) at which it was first bought. */
  boughtAtShop: Record<string, number>;
  relicsChosen: string[];
  floorPath: FloorId[];
}

interface Collector {
  run: TelemetryRun;
  spin: (SpinRecord & { startTick: number; open: boolean }) | null;
  round: { stage: number; floorId: FloorId; bankrollStart: number; income: number; startTick: number } | null;
  shop: ShopRecord | null;
  shopIndex: number;
  floorOrder: Map<FloorId, number>;
  bossIds: Map<FloorId, string>;
  pendingRelics: string[];
}

function floorOrderOf(content: ContentBundle): Map<FloorId, number> {
  return new Map(content.floors.map((floor) => [floor.id, floor.order]));
}

function closeSpin(c: Collector, tick: number): void {
  const spin = c.spin;
  if (spin === null) return;
  if (spin.open) {
    spin.ticks = tick - spin.startTick;
    spin.open = false;
  }
}

function finishSpin(c: Collector): void {
  const spin = c.spin;
  if (spin === null) return;
  const { startTick: _s, open: _o, ...record } = spin;
  c.run.spins.push(record);
  c.spin = null;
}

function onEvent(c: Collector, event: GameEvent, state: { tick: number; floorId: FloorId; round: number; bankroll: number; spinsLeft: number; trinkets: readonly string[] }): void {
  const stage = stageOf(c.floorOrder.get(state.floorId) ?? 1, state.round);
  switch (event.t) {
    case 'SpinStarted': {
      finishSpin(c);
      if (c.round === null || c.round.stage !== stage) {
        c.round = { stage, floorId: state.floorId, bankrollStart: state.bankroll, income: 0, startTick: state.tick };
      }
      c.spin = {
        stage,
        spinInRound: 7 - state.spinsLeft,
        cash: 0,
        win: false,
        equity: 0,
        orbs: 0,
        splits: 0,
        peg: 0,
        tokens: 0,
        lips: 0,
        gutters: 0,
        ticks: 0,
        fever: false,
        startTick: state.tick,
        open: true,
      };
      return;
    }
    case 'SpinEvaluated':
      if (c.spin !== null) {
        c.spin.win = event.wins.length > 0;
        c.spin.equity = event.equity;
      }
      return;
    case 'FeverTriggered':
      if (c.spin !== null) c.spin.fever = true;
      return;
    case 'OrbLaunched':
      if (c.spin !== null) c.spin.orbs += 1;
      return;
    case 'OrbSplit':
      if (c.spin !== null) c.spin.splits += 1;
      return;
    case 'PegHit':
      if (c.spin !== null) c.spin.peg += 1;
      return;
    case 'TokenSpawned':
      if (c.spin !== null) c.spin.tokens += 1;
      return;
    case 'LipDrop':
      if (c.spin !== null) c.spin.lips += 1;
      return;
    case 'GutterLoss':
      if (c.spin !== null) c.spin.gutters += 1;
      return;
    case 'CashBanked':
      if (c.spin !== null) c.spin.cash += event.cash;
      return;
    case 'BankrollChanged':
      if (event.reason !== 'shop' && event.reason !== 'quota' && c.round !== null) {
        c.round.income += event.delta;
      }
      if (event.reason === 'shop' && c.shop !== null) c.shop.spent += -event.delta;
      return;
    case 'PhaseChanged':
      if ((event.from === 'RESOLVING' || event.from === 'SPINNING') && (event.to === 'PREP' || event.to === 'ROUND_SETTLE')) {
        closeSpin(c, state.tick);
      }
      if (event.to === 'SHOP') {
        c.shop = { stage, bankroll: state.bankroll, offered: [], bought: [], rerolls: -1, spent: 0 };
      }
      if (event.from === 'SHOP' && c.shop !== null) {
        c.run.shops.push(c.shop);
        c.shop = null;
        c.shopIndex += 1;
      }
      return;
    case 'ShopRolled':
      if (c.shop !== null) {
        c.shop.rerolls += 1;
        for (const offer of event.offers) c.shop.offered.push(offer.itemId);
      }
      return;
    case 'ItemBought':
      if (c.shop !== null) c.shop.bought.push(event.itemId);
      if (c.run.acquired[event.itemId] === undefined) c.run.acquired[event.itemId] = stage;
      if (c.run.boughtAtShop[event.itemId] === undefined) c.run.boughtAtShop[event.itemId] = c.shopIndex;
      return;
    case 'RelicsOffered':
      c.pendingRelics = [...event.itemIds];
      return;
    case 'TrinketMounted':
      if (c.pendingRelics.includes(event.itemId) && c.shop === null) {
        c.run.relicsChosen.push(event.itemId);
        c.pendingRelics = [];
      }
      if (c.run.acquired[event.itemId] === undefined) c.run.acquired[event.itemId] = stage;
      return;
    case 'RoundSettled': {
      closeSpin(c, state.tick);
      finishSpin(c);
      const result = event.result;
      const round = c.round ?? { stage, floorId: state.floorId, bankrollStart: state.bankroll, income: 0, startTick: state.tick };
      c.run.rounds.push({
        stage,
        floorId: state.floorId,
        kind: result.kind,
        passed: result.passed,
        target: result.kind === 'normal' ? result.quota : result.bossScore,
        bankrollStart: round.bankrollStart,
        achieved: result.kind === 'normal' ? result.bankrollBefore : result.playerScore,
        income: round.income,
        ticks: state.tick - round.startTick,
        bossId: result.kind === 'boss' ? (c.bossIds.get(state.floorId) ?? null) : null,
      });
      c.round = null;
      if (!result.passed) c.run.death = `${STAGE_LABELS[stage - 1] ?? `S${stage}`}`;
      return;
    }
    default:
      return;
  }
}

export interface TelemetryOptions {
  seed: string;
  bot: BotId;
  content?: ContentBundle;
}

/** Play one run with telemetry attached. */
export function playTelemetryRun(options: TelemetryOptions): TelemetryRun {
  const content = options.content ?? CONTENT_BUNDLE;
  const c: Collector = {
    run: {
      bot: options.bot,
      seed: options.seed,
      outcome: 'timeout',
      won: false,
      clearedFloor1: false,
      floorsCleared: 0,
      lastStage: 1,
      death: 'timeout',
      maxBankroll: 0,
      finalBankroll: 0,
      ticks: 0,
      spins: [],
      rounds: [],
      shops: [],
      acquired: {},
      boughtAtShop: {},
      relicsChosen: [],
      floorPath: [],
    },
    spin: null,
    round: null,
    shop: null,
    shopIndex: 0,
    floorOrder: floorOrderOf(content),
    bossIds: new Map(content.floors.map((floor) => [floor.id, floor.bossId])),
    pendingRelics: [],
  };

  const result = playRun({
    seed: options.seed,
    bot: options.bot,
    ...(options.content === undefined ? {} : { content: options.content }),
    onEvent: (event, core) => {
      const state = core.getState();
      onEvent(c, event, state);
      if (event.t === 'PhaseChanged' && event.to === 'PREP' && !c.run.floorPath.includes(state.floorId)) {
        c.run.floorPath.push(state.floorId);
      }
    },
  });
  finishSpin(c);

  const run = c.run;
  run.outcome = result.outcome;
  run.won = result.won;
  run.clearedFloor1 = result.clearedFloor1;
  run.floorsCleared = result.floorsCleared.length;
  run.lastStage = stageOf(c.floorOrder.get(result.floorId) ?? 1, result.round);
  if (result.won) run.death = 'victory';
  else if (result.outcome === 'timeout') run.death = 'timeout';
  run.maxBankroll = result.maxBankroll;
  run.finalBankroll = result.bankroll;
  run.ticks = result.ticks;
  return run;
}
