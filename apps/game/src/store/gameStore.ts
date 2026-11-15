import { create } from 'zustand';
import {
  BOARD,
  CONTRACTS_REV,
  DEFAULT_CHUTE_MULTS,
  SAVE_VERSION,
  STORAGE_KEYS,
  type Command,
  type CommandResult,
  type FloorId,
  type GameCore,
  type GameEvent,
  type RunState,
  type SaveFile,
  type SimSnapshot,
  type SymbolId,
} from '@jackpotsyndicate/contracts';

/**
 * The shared MockGameCore normally lives in packages/contracts/testing. That
 * package is not present in this checkout, so this file ships the same
 * GameCore-shaped mock and drives it from an events.sample-style spin stream.
 * The UI only ever reads `getState()` / listens to events; it never mutates
 * core state directly.
 */

export const FLOOR_LABELS: Record<FloorId, string> = {
  FLOOR_NEON: 'Neon Vault',
  FLOOR_CRYO: 'Cryo-Freezer Lounge',
  FLOOR_FOUNDRY: "Smuggler's Blast Foundry",
  FLOOR_PENTHOUSE: 'Velvet Penthouse',
};

const FLOOR_QUOTA_SCALE: Record<FloorId, number> = {
  FLOOR_NEON: 1,
  FLOOR_CRYO: 1,
  FLOOR_FOUNDRY: 1,
  FLOOR_PENTHOUSE: 2.2,
};

export const STARTER_TRINKETS = [
  'quantum-splitter-coil',
  'vampiric-stepper-motor',
  'gold-peg-alchemist',
] as const;

export function quotaForRound(round: number, floorId: FloorId = 'FLOOR_NEON'): number {
  const normalRound = Math.min(9, Math.max(1, round));
  return Math.round(1000 * Math.pow(2.1, normalRound - 1) * FLOOR_QUOTA_SCALE[floorId]);
}

export function formatCash(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}$${Math.abs(rounded).toLocaleString('en-US')}`;
}

export function formatSymbol(symbolId: string): string {
  return symbolId.charAt(0).toUpperCase() + symbolId.slice(1);
}

const GRID_ROWS: SymbolId[][] = [
  ['cherry', 'seven', 'cherry'],
  ['diamond', 'cherry', 'uranium'],
  ['skull', 'cherry', 'seven'],
];

const SAMPLE_OFFERS = [
  { offerId: 'offer-1', itemId: 'turbo-dozer-cam', category: 'TRINKET' as const, price: 200, sold: false },
  { offerId: 'offer-2', itemId: 'hydraulic-dozer-piston', category: 'TRINKET' as const, price: 240, sold: false },
  { offerId: 'offer-3', itemId: 'ouroboros-capacitor', category: 'TRINKET' as const, price: 280, sold: false },
  { offerId: 'offer-4', itemId: 'vip-bullion-stamp', category: 'TRINKET' as const, price: 260, sold: false },
];

function createRunState(seed: string): RunState {
  const gridRows = GRID_ROWS.map((row) => [...row]);
  const gridCols = [0, 1, 2].map((col) => GRID_ROWS.map((row) => row[col]!));

  return {
    saveVersion: SAVE_VERSION,
    seed,
    rng: {},
    tick: 0,
    phase: 'PREP',
    floorId: 'FLOOR_NEON',
    floorsCleared: [],
    round: 1,
    spinsLeft: 7,
    bankroll: 500,
    roundCash: 0,
    fever: 40,
    grid: {
      cols: 3,
      rows: 3,
      wiring: 'CLASSIC',
      strips: gridCols,
      visible: gridRows,
      frozen: [],
    },
    jumpers: [],
    overvoltLineId: null,
    trinkets: [...STARTER_TRINKETS],
    drinkTray: [null, null, null],
    activeDrink: null,
    ownedCoins: ['copper-token'],
    loadedCoin: 'copper-token',
    nextSpin: { xBonus: {}, addMult: 0, bonusOrbs: 0 },
    shop: {
      capacity: 4,
      rerollCost: 25,
      expandCost: 150,
      archetype: null,
      offers: [],
    },
    boss: null,
    orbChips: {},
    tokenCash: {},
    stats: {
      spins: 0,
      lipDrops: 0,
      gutterLosses: 0,
      cashBanked: 0,
      bestSpinEquity: 0,
    },
  };
}

function cloneState(state: RunState): RunState {
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as RunState;
}

function fnv64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

type ScheduledEvent = { at: number; event: GameEvent };
type SpinEvalEvent = Extract<GameEvent, { t: 'SpinEvaluated' }>;

export class MockGameCore implements GameCore {
  private state: RunState;
  private tickCount = 0;
  private pending: GameEvent[] = [];
  private schedule: ScheduledEvent[] = [];
  private commandLog: { tick: number; cmd: Command }[] = [];
  private spinIndex = 0;
  private lastRoundPassed = false;

  constructor(seed = 'SHELL-DEMO') {
    this.state = createRunState(seed);
    this.pending.push(
      { t: 'RunStarted', seed, tick: 0 },
      ...STARTER_TRINKETS.map((itemId) => ({ t: 'TrinketMounted' as const, itemId, count: 1, tick: 0 })),
      { t: 'PhaseChanged', from: 'TITLE', to: 'PREP', tick: 0 },
    );
  }

  dispatch(cmd: Command): CommandResult {
    this.commandLog.push({ tick: this.tickCount, cmd });
    switch (cmd.c) {
      case 'NewRun':
        return this.newRun(cmd.seed);
      case 'Spin':
        return this.startSpin();
      case 'ContinueAfterRound':
        return this.continueAfterRound();
      case 'ShopBuy':
        return this.shopBuy(cmd.offerId);
      case 'ShopReroll':
        return this.shopReroll();
      case 'ShopExpand':
        return this.shopExpand();
      case 'ShopLeave':
        return this.shopLeave();
      case 'ChooseFloor':
        return this.chooseFloor(cmd.floorId);
      case 'LoadCoin':
        if (!this.state.ownedCoins.includes(cmd.coinId)) return { ok: false, error: 'NOT_OWNED' };
        this.state.loadedCoin = cmd.coinId;
        this.pending.push({ t: 'CoinLoaded', coinId: cmd.coinId, tick: this.tickCount });
        return { ok: true };
      case 'Drink':
        if (this.state.phase !== 'PREP') return { ok: false, error: 'WRONG_PHASE' };
        this.state.drinkTray[cmd.slot] = 'dirty-syndicate-martini';
        this.state.activeDrink = 'dirty-syndicate-martini';
        this.pending.push({ t: 'DrinkActive', itemId: 'dirty-syndicate-martini', tick: this.tickCount });
        return { ok: true };
      case 'SetOvervolt':
        if (this.state.phase !== 'PREP') return { ok: false, error: 'WRONG_PHASE' };
        this.state.overvoltLineId = cmd.lineId;
        return { ok: true };
      case 'AbandonRun': {
        if (this.state.phase === 'TITLE') return { ok: false, error: 'WRONG_PHASE' };
        const from = this.state.phase;
        this.state.phase = 'GAME_OVER';
        this.pending.push(
          { t: 'PhaseChanged', from, to: 'GAME_OVER', tick: this.tickCount },
          { t: 'RunEnded', outcome: 'abandoned', tick: this.tickCount },
        );
        return { ok: true };
      }
      default:
        return { ok: false, error: 'WRONG_PHASE' };
    }
  }

  tick(): GameEvent[] {
    this.tickCount += 1;
    this.state.tick = this.tickCount;

    const due: GameEvent[] = [];
    const remaining: ScheduledEvent[] = [];
    for (const item of this.schedule) {
      if (item.at <= this.tickCount) due.push(item.event);
      else remaining.push(item);
    }
    this.schedule = remaining;

    const events = [...this.pending, ...due];
    this.pending = [];
    for (const event of events) this.applyEvent(event);
    this.state.tick = this.tickCount;
    return events;
  }

  getState(): Readonly<RunState> {
    return cloneState(this.state);
  }

  getSimSnapshot(): SimSnapshot {
    return {
      tick: this.tickCount,
      dozer: {
        frontY: BOARD.DOZER_BACK_Y,
        stroke: BOARD.DOZER_STROKE,
        surging: false,
        reciprocations: 0,
      },
      suction: 0,
      pegs: [],
      orbs: [],
      tokens: [],
      queuedOrbs: 0,
    };
  }

  stateHash(): string {
    return fnv64(JSON.stringify(this.state));
  }

  save(): SaveFile {
    return {
      saveVersion: SAVE_VERSION,
      contractsRev: CONTRACTS_REV,
      run: cloneState(this.state),
      simBase64: '',
      stateHash: this.stateHash(),
    };
  }

  load(save: SaveFile): CommandResult {
    if (save.saveVersion !== SAVE_VERSION) return { ok: false, error: 'UNKNOWN_ID' };
    this.state = cloneState(save.run);
    this.tickCount = this.state.tick;
    this.schedule = [];
    this.pending = [];
    return { ok: true };
  }

  getCommandLog(): { tick: number; cmd: Command }[] {
    return this.commandLog.map((entry) => ({ tick: entry.tick, cmd: entry.cmd }));
  }

  /** C-8 TestApi helper; not part of the frozen GameCore interface. */
  grantCash(amount: number): void {
    this.state.bankroll += amount;
    this.pending.push({
      t: 'BankrollChanged',
      delta: amount,
      total: this.state.bankroll,
      reason: 'bonus',
      tick: this.tickCount,
    });
  }

  // ------------------------------------------------------------- commands
  private newRun(seed: string): CommandResult {
    this.state = createRunState(seed);
    this.tickCount = 0;
    this.schedule = [];
    this.spinIndex = 0;
    this.lastRoundPassed = false;
    this.commandLog = [{ tick: 0, cmd: { c: 'NewRun', seed } }];
    this.pending = [
      { t: 'RunStarted', seed, tick: 0 },
      ...STARTER_TRINKETS.map((itemId) => ({ t: 'TrinketMounted' as const, itemId, count: 1, tick: 0 })),
      { t: 'PhaseChanged', from: 'TITLE', to: 'PREP', tick: 0 },
    ];
    return { ok: true };
  }

  private startSpin(): CommandResult {
    if (this.state.phase !== 'PREP') return { ok: false, error: 'WRONG_PHASE' };
    if (this.state.spinsLeft <= 0) return { ok: false, error: 'WRONG_PHASE' };

    const start = this.tickCount;
    const spinIndex = this.spinIndex++;
    const bankrollAtStart = this.state.bankroll;
    const roundCashAtStart = this.state.roundCash;
    const willEndRound = this.state.spinsLeft === 1;
    const quota = quotaForRound(this.state.round, this.state.floorId);
    const projectedRoundCash = roundCashAtStart + 936;
    const passed = projectedRoundCash >= quota;

    this.state.phase = 'SPINNING';
    this.state.spinsLeft -= 1;
    this.state.stats.spins += 1;
    this.state.grid.visible = GRID_ROWS.map((row) => [...row]);

    this.pending.push(
      { t: 'PhaseChanged', from: 'PREP', to: 'SPINNING', tick: start },
      { t: 'SpinStarted', spinIndex, cols: 3, rows: 3, tick: start },
    );

    const rowMajor = GRID_ROWS.map((row) => [...row]);
    const orbPlan = rowMajor.flatMap((row, rowIndex) =>
      row.map((symbolId, colIndex) => ({
        cell: [colIndex, rowIndex] as [number, number],
        symbolId,
        chips: 20,
      })),
    );

    const chips = 180;
    const addMult = 6;
    const xMult = 1.8;
    const equity = Math.round(chips * addMult * xMult);

    this.schedule.push(
      { at: start + 30, event: { t: 'ReelStopped', col: 0, symbols: [rowMajor[0]![0]!, rowMajor[1]![0]!, rowMajor[2]![0]!], tick: start + 30 } },
      { at: start + 42, event: { t: 'ReelStopped', col: 1, symbols: [rowMajor[0]![1]!, rowMajor[1]![1]!, rowMajor[2]![1]!], tick: start + 42 } },
      { at: start + 54, event: { t: 'ReelStopped', col: 2, symbols: [rowMajor[0]![2]!, rowMajor[1]![2]!, rowMajor[2]![2]!], tick: start + 54 } },
      {
        at: start + 60,
        event: {
          t: 'SpinEvaluated',
          grid: rowMajor,
          wins: [
            {
              kind: 'line',
              symbolId: 'cherry',
              cells: [
                [0, 1],
                [1, 1],
                [2, 1],
              ],
              lineId: 'line-2',
              lineMult: 1,
            },
          ],
          chips,
          addMult,
          xMult,
          equity,
          orbPlan,
          tick: start + 60,
        },
      },
      { at: start + 60, event: { t: 'PhaseChanged', from: 'SPINNING', to: 'RESOLVING', tick: start + 60 } },
      { at: start + 66, event: { t: 'OrbLaunched', orbId: 1, x: 180, symbolId: 'cherry', tick: start + 66 } },
      { at: start + 66, event: { t: 'OrbValued', orbId: 1, chips: 60, tick: start + 66 } },
      { at: start + 72, event: { t: 'OrbLaunched', orbId: 2, x: 300, symbolId: 'seven', tick: start + 72 } },
      { at: start + 72, event: { t: 'OrbValued', orbId: 2, chips: 60, tick: start + 72 } },
      { at: start + 78, event: { t: 'OrbLaunched', orbId: 3, x: 420, symbolId: 'diamond', tick: start + 78 } },
      { at: start + 78, event: { t: 'OrbValued', orbId: 3, chips: 60, tick: start + 78 } },
      { at: start + 84, event: { t: 'PegHit', orbId: 1, pegId: 7, kind: 'gold', hitIndex: 0, chained: false, tick: start + 84 } },
      { at: start + 90, event: { t: 'ChuteExit', orbId: 1, symbolId: 'cherry', chute: 2, x: 300, tokenIds: [101], mergedInto: [], tick: start + 90 } },
      { at: start + 96, event: { t: 'TokenSpawned', tokenId: 101, x: 300, y: 313, symbolId: 'cherry', tick: start + 96 } },
      { at: start + 102, event: { t: 'ChuteExit', orbId: 2, symbolId: 'seven', chute: 3, x: 380, tokenIds: [102], mergedInto: [], tick: start + 102 } },
      { at: start + 108, event: { t: 'TokenSpawned', tokenId: 102, x: 380, y: 313, symbolId: 'seven', tick: start + 108 } },
      { at: start + 120, event: { t: 'TokenValued', tokenId: 101, cash: 624, tick: start + 120 } },
      {
        at: start + 120,
        event: {
          t: 'LipDrop',
          tokenId: 101,
          symbolId: 'cherry',
          skin: 'cherry',
          x: 300,
          y: 484,
          vx: 0,
          vy: 2.2,
          radius: 11,
          stack: 1,
          magnetic: false,
          tick: start + 120,
        },
      },
      { at: start + 120, event: { t: 'CashBanked', tokenId: 101, cash: 624, x: 300, tick: start + 120 } },
      { at: start + 120, event: { t: 'BankrollChanged', delta: 624, total: bankrollAtStart + 624, reason: 'lip', tick: start + 120 } },
      { at: start + 140, event: { t: 'DozerFullExtension', count: 12, tick: start + 140 } },
      { at: start + 150, event: { t: 'TokenValued', tokenId: 102, cash: 312, tick: start + 150 } },
      {
        at: start + 150,
        event: {
          t: 'LipDrop',
          tokenId: 102,
          symbolId: 'seven',
          skin: 'seven',
          x: 380,
          y: 484,
          vx: 0,
          vy: 2,
          radius: 12,
          stack: 3,
          magnetic: false,
          tick: start + 150,
        },
      },
      { at: start + 150, event: { t: 'CashBanked', tokenId: 102, cash: 312, x: 380, tick: start + 150 } },
      { at: start + 150, event: { t: 'BankrollChanged', delta: 312, total: bankrollAtStart + 936, reason: 'lip', tick: start + 150 } },
    );

    if (willEndRound) {
      this.schedule.push(
        { at: start + 200, event: { t: 'RoundSettled', result: { kind: 'normal', passed, quota, bankrollBefore: bankrollAtStart, bankrollAfter: bankrollAtStart + 936 }, tick: start + 200 } },
        { at: start + 200, event: { t: 'PhaseChanged', from: 'RESOLVING', to: 'ROUND_RESULT', tick: start + 200 } },
      );
    } else {
      this.schedule.push(
        { at: start + 200, event: { t: 'PhaseChanged', from: 'RESOLVING', to: 'PREP', tick: start + 200 } },
        { at: start + 200, event: { t: 'FeverChanged', value: Math.min(100, this.state.fever + 20), tick: start + 200 } },
      );
    }

    return { ok: true };
  }

  private continueAfterRound(): CommandResult {
    if (this.state.phase !== 'ROUND_RESULT') return { ok: false, error: 'WRONG_PHASE' };
    if (!this.lastRoundPassed) {
      this.state.phase = 'GAME_OVER';
      this.pending.push(
        { t: 'PhaseChanged', from: 'ROUND_RESULT', to: 'GAME_OVER', tick: this.tickCount },
        { t: 'RunEnded', outcome: 'defeat', tick: this.tickCount },
      );
      return { ok: true };
    }

    this.state.phase = 'SHOP';
    this.state.round += 1;
    this.state.spinsLeft = 7;
    this.state.roundCash = 0;
    this.state.shop.archetype = 'TRINKETS';
    this.state.shop.offers = SAMPLE_OFFERS.map((offer) => ({ ...offer }));
    this.pending.push(
      { t: 'PhaseChanged', from: 'ROUND_RESULT', to: 'SHOP', tick: this.tickCount },
      {
        t: 'ShopRolled',
        archetype: 'TRINKETS',
        offers: this.state.shop.offers,
        rerollCost: this.state.shop.rerollCost,
        expandCost: this.state.shop.expandCost,
        tick: this.tickCount,
      },
    );
    return { ok: true };
  }

  private shopBuy(offerId: string): CommandResult {
    if (this.state.phase !== 'SHOP') return { ok: false, error: 'WRONG_PHASE' };
    const offer = this.state.shop.offers.find((entry) => entry.offerId === offerId);
    if (!offer) return { ok: false, error: 'UNKNOWN_ID' };
    if (offer.sold) return { ok: false, error: 'NOT_OWNED' };
    if (this.state.bankroll < offer.price) return { ok: false, error: 'INSUFFICIENT_FUNDS' };

    offer.sold = true;
    this.state.bankroll -= offer.price;
    this.state.trinkets.push(offer.itemId);
    this.pending.push(
      { t: 'ItemBought', offerId, itemId: offer.itemId, price: offer.price, tick: this.tickCount },
      { t: 'TrinketMounted', itemId: offer.itemId, count: 1, tick: this.tickCount },
      { t: 'BankrollChanged', delta: -offer.price, total: this.state.bankroll, reason: 'shop', tick: this.tickCount },
    );
    return { ok: true };
  }

  private shopReroll(): CommandResult {
    if (this.state.phase !== 'SHOP') return { ok: false, error: 'WRONG_PHASE' };
    if (this.state.bankroll < this.state.shop.rerollCost) return { ok: false, error: 'INSUFFICIENT_FUNDS' };
    const price = this.state.shop.rerollCost;
    this.state.bankroll -= price;
    this.state.shop.offers = SAMPLE_OFFERS.map((offer, index) => ({
      ...offer,
      offerId: `offer-${this.tickCount}-${index + 1}`,
    }));
    this.pending.push(
      { t: 'BankrollChanged', delta: -price, total: this.state.bankroll, reason: 'shop', tick: this.tickCount },
      {
        t: 'ShopRolled',
        archetype: 'TRINKETS',
        offers: this.state.shop.offers,
        rerollCost: this.state.shop.rerollCost,
        expandCost: this.state.shop.expandCost,
        tick: this.tickCount,
      },
    );
    return { ok: true };
  }

  private shopExpand(): CommandResult {
    if (this.state.phase !== 'SHOP') return { ok: false, error: 'WRONG_PHASE' };
    if (this.state.shop.capacity >= 10) return { ok: false, error: 'AT_LIMIT' };
    if (this.state.bankroll < this.state.shop.expandCost) return { ok: false, error: 'INSUFFICIENT_FUNDS' };
    const price = this.state.shop.expandCost;
    this.state.bankroll -= price;
    this.state.shop.capacity += 1;
    this.state.shop.expandCost = Math.round(price * 1.6);
    this.pending.push({ t: 'BankrollChanged', delta: -price, total: this.state.bankroll, reason: 'shop', tick: this.tickCount });
    return { ok: true };
  }

  private shopLeave(): CommandResult {
    if (this.state.phase !== 'SHOP') return { ok: false, error: 'WRONG_PHASE' };
    this.state.phase = 'PREP';
    this.state.shop.offers = [];
    this.pending.push({ t: 'PhaseChanged', from: 'SHOP', to: 'PREP', tick: this.tickCount });
    return { ok: true };
  }

  private chooseFloor(floorId: FloorId): CommandResult {
    if (this.state.phase !== 'ELEVATOR') return { ok: false, error: 'WRONG_PHASE' };
    this.state.floorId = floorId;
    this.state.phase = 'PREP';
    this.state.spinsLeft = 7;
    this.state.roundCash = 0;
    this.pending.push({ t: 'PhaseChanged', from: 'ELEVATOR', to: 'PREP', tick: this.tickCount });
    return { ok: true };
  }

  // --------------------------------------------------------------- events
  private applyEvent(event: GameEvent): void {
    switch (event.t) {
      case 'PhaseChanged':
        this.state.phase = event.to;
        break;
      case 'LipDrop':
        this.state.stats.lipDrops += 1;
        break;
      case 'BankrollChanged':
        this.state.bankroll = event.total;
        if (event.reason === 'lip') {
          this.state.roundCash += event.delta;
          this.state.stats.cashBanked += event.delta;
        }
        break;
      case 'FeverChanged':
        this.state.fever = event.value;
        break;
      case 'SpinEvaluated':
        this.state.stats.bestSpinEquity = Math.max(this.state.stats.bestSpinEquity, event.equity);
        break;
      case 'RoundSettled':
        this.lastRoundPassed = event.result.passed;
        break;
      case 'RunEnded':
        this.state.phase = event.outcome === 'victory' ? 'VICTORY' : 'GAME_OVER';
        break;
      case 'GridMutated':
        this.state.grid.cols = event.to.cols;
        this.state.grid.rows = event.to.rows;
        this.state.grid.wiring = event.wiring;
        break;
      default:
        break;
    }
  }
}

// ------------------------------------------------------------------ store
export type Speed = 1 | 2 | 4;

export interface Settings {
  mute: boolean;
  volume: number;
  reducedMotion: boolean;
  speed: Speed;
}

const DEFAULT_SETTINGS: Settings = {
  mute: false,
  volume: 0.6,
  reducedMotion: false,
  speed: 1,
};

function systemPrefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

function readSettings(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEYS.settings);
    if (!raw) return { ...DEFAULT_SETTINGS, reducedMotion: systemPrefersReducedMotion() };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      mute: Boolean(parsed.mute),
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_SETTINGS.volume,
      reducedMotion: Boolean(parsed.reducedMotion),
      speed: parsed.speed === 4 ? 4 : parsed.speed === 2 ? 2 : 1,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(settings: Settings): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode, file://); settings stay in memory.
  }
}

export interface GameStore {
  core: GameCore;
  state: RunState;
  events: GameEvent[];
  lastSpin: SpinEvalEvent | null;
  lastDropMult: number;
  settings: Settings;
  attachCore(core: GameCore): void;
  newRun(seed: string): void;
  dispatch(cmd: Command): CommandResult;
  tick(): GameEvent[];
  setSettings(patch: Partial<Settings>): void;
  toggleMute(): void;
  toggleMotion(): void;
  setSpeed(speed: number): void;
}

const initialCore = new MockGameCore();
initialCore.dispatch({ c: 'NewRun', seed: 'SHELL-DEMO' });
const initialEvents = initialCore.tick();

export const useGameStore = create<GameStore>((set, get) => ({
  core: initialCore,
  state: initialCore.getState(),
  events: initialEvents,
  lastSpin: null,
  lastDropMult: 1,
  settings: readSettings(),

  attachCore(core) {
    set({ core, state: core.getState(), events: [], lastSpin: null, lastDropMult: 1 });
  },

  newRun(seed) {
    const core = get().core;
    const result = core.dispatch({ c: 'NewRun', seed });
    if (!result.ok) return;
    const events = core.tick();
    set({
      state: core.getState(),
      events,
      lastSpin: null,
      lastDropMult: 1,
    });
  },

  dispatch(cmd) {
    const core = get().core;
    const result = core.dispatch(cmd);
    if (cmd.c === 'NewRun' && result.ok) {
      const events = core.tick();
      set({ state: core.getState(), events, lastSpin: null, lastDropMult: 1 });
      return result;
    }
    set({ state: core.getState() });
    return result;
  },

  tick() {
    const core = get().core;
    const incoming = core.tick();
    const previous = get();
    let lastSpin = previous.lastSpin;
    let lastDropMult = previous.lastDropMult;

    for (const event of incoming) {
      if (event.t === 'SpinEvaluated') lastSpin = event;
      if (event.t === 'ChuteExit') lastDropMult = DEFAULT_CHUTE_MULTS[event.chute] ?? 1;
    }

    const events = incoming.length > 0
      ? [...previous.events, ...incoming].slice(-250)
      : previous.events;

    set({ state: core.getState(), events, lastSpin, lastDropMult });
    return incoming;
  },

  setSettings(patch) {
    const settings: Settings = {
      ...get().settings,
      ...patch,
      volume: Math.min(1, Math.max(0, patch.volume ?? get().settings.volume)),
      speed: patch.speed === 4 ? 4 : patch.speed === 2 ? 2 : patch.speed === 1 ? 1 : get().settings.speed,
    };
    persistSettings(settings);
    set({ settings });
  },

  toggleMute() {
    get().setSettings({ mute: !get().settings.mute });
  },

  toggleMotion() {
    get().setSettings({ reducedMotion: !get().settings.reducedMotion });
  },

  setSpeed(speed) {
    get().setSettings({ speed: speed >= 4 ? 4 : speed >= 2 ? 2 : 1 });
  },
}));

export function startGameLoop(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let cancelled = false;
  let timer = 0;

  const loop = () => {
    if (cancelled) return;
    const speed = useGameStore.getState().settings.speed;
    useGameStore.getState().tick();
    timer = window.setTimeout(loop, Math.max(4, 1000 / (60 * speed)));
  };

  timer = window.setTimeout(loop, 16);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
