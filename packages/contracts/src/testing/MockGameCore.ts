import sampleEventsJson from '../../fixtures/events.sample.json';
import { CONTRACTS_REV, SAVE_VERSION } from '../constants';
import type { Command, CommandResult, GameCore, GameEvent, RunState, SaveFile } from '../protocol';
import type { SimSnapshot } from '../sim';
import { commandSchema, gameEventSchema, saveFileSchema } from '../schemas';

const sampleEvents = sampleEventsJson as unknown as GameEvent[];

function emptyRunState(seed = 'sample-seed-7'): RunState {
  return {
    saveVersion: SAVE_VERSION,
    seed,
    rng: {},
    tick: 0,
    phase: 'TITLE',
    floorId: 'FLOOR_NEON',
    floorsCleared: [],
    round: 1,
    spinsLeft: 7,
    bankroll: 500,
    roundCash: 0,
    fever: 0,
    grid: { cols: 3, rows: 3, wiring: 'CLASSIC', strips: [], visible: [], frozen: [] },
    jumpers: [],
    overvoltLineId: null,
    trinkets: [],
    drinkTray: [null, null, null],
    activeDrink: null,
    ownedCoins: ['copper'],
    loadedCoin: 'copper',
    nextSpin: { xBonus: {}, addMult: 0, bonusOrbs: 0 },
    shop: { capacity: 4, rerollCost: 25, expandCost: 150, archetype: null, offers: [] },
    boss: null,
    orbChips: {},
    tokenCash: {},
    stats: { spins: 0, lipDrops: 0, gutterLosses: 0, cashBanked: 0, bestSpinEquity: 0 },
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export class MockGameCore implements GameCore {
  private events: GameEvent[];
  private cursor = 0;
  private currentTick = 0;
  private state: RunState;
  private log: { tick: number; cmd: Command }[] = [];
  private snapshot: SimSnapshot = {
    tick: 0,
    dozer: { frontY: 328, stroke: 34, surging: false, reciprocations: 0 },
    suction: 0,
    pegs: [],
    orbs: [],
    tokens: [],
    queuedOrbs: 0,
  };

  constructor(events: GameEvent[] = sampleEvents, initialState?: RunState) {
    this.events = events.map((event) => gameEventSchema.parse(event));
    this.state = initialState ? structuredClone(initialState) : emptyRunState();
  }

  static fromSample(): MockGameCore {
    return new MockGameCore();
  }

  dispatch(cmd: Command): CommandResult {
    const parsed = commandSchema.safeParse(cmd);
    if (!parsed.success) return { ok: false, error: 'INVALID_TARGET' };
    const command = parsed.data;
    this.log.push({ tick: this.currentTick, cmd: command });

    if (command.c === 'NewRun') {
      this.cursor = 0;
      this.currentTick = 0;
      this.state = emptyRunState(command.seed);
      this.snapshot = { ...this.snapshot, tick: 0 };
      return { ok: true };
    }
    if (command.c === 'Spin' && this.state.phase !== 'PREP') {
      return { ok: false, error: 'WRONG_PHASE' };
    }
    if (command.c === 'LoadCoin') {
      this.state.loadedCoin = command.coinId;
      if (!this.state.ownedCoins.includes(command.coinId)) this.state.ownedCoins.push(command.coinId);
    }
    return { ok: true };
  }

  tick(): GameEvent[] {
    const tick = this.currentTick;
    const out: GameEvent[] = [];
    while (this.cursor < this.events.length && this.events[this.cursor]!.tick === tick) {
      const event = this.events[this.cursor++]!;
      out.push(event);
      this.apply(event);
    }
    this.state.tick = tick;
    this.snapshot.tick = tick;
    this.currentTick++;
    return out;
  }

  getState(): Readonly<RunState> {
    return this.state;
  }

  getSimSnapshot(): SimSnapshot {
    return this.snapshot;
  }

  stateHash(): string {
    return `${fnv1a(canonical(this.state))}${fnv1a(canonical(this.snapshot))}`;
  }

  save(): SaveFile {
    const save: SaveFile = {
      saveVersion: SAVE_VERSION,
      contractsRev: CONTRACTS_REV,
      run: structuredClone(this.state),
      simBase64: '',
      stateHash: this.stateHash(),
    };
    return saveFileSchema.parse(save);
  }

  load(save: SaveFile): CommandResult {
    const parsed = saveFileSchema.safeParse(save);
    if (!parsed.success) return { ok: false, error: 'INVALID_TARGET' };
    this.state = structuredClone(parsed.data.run);
    this.snapshot = { ...this.snapshot, tick: this.state.tick };
    return { ok: true };
  }

  getCommandLog(): { tick: number; cmd: Command }[] {
    return this.log.map((entry) => ({ tick: entry.tick, cmd: structuredClone(entry.cmd) }));
  }

  get isComplete(): boolean {
    return this.cursor >= this.events.length;
  }

  get remainingEvents(): number {
    return this.events.length - this.cursor;
  }

  private apply(event: GameEvent): void {
    switch (event.t) {
      case 'RunStarted':
        this.state.seed = event.seed;
        break;
      case 'PhaseChanged':
        this.state.phase = event.to;
        break;
      case 'SpinStarted':
        this.state.stats.spins = Math.max(this.state.stats.spins, event.spinIndex + 1);
        break;
      case 'SpinEvaluated':
        this.state.stats.bestSpinEquity = Math.max(this.state.stats.bestSpinEquity, event.equity);
        break;
      case 'OrbValued':
        this.state.orbChips[event.orbId] = event.chips;
        break;
      case 'TokenValued':
        this.state.tokenCash[event.tokenId] = event.cash;
        break;
      case 'CashBanked':
        this.state.stats.cashBanked += event.cash;
        break;
      case 'BankrollChanged':
        this.state.bankroll = event.total;
        break;
      case 'FeverChanged':
        this.state.fever = event.value;
        break;
      case 'LipDrop':
        this.state.stats.lipDrops++;
        break;
      case 'GutterLoss':
        this.state.stats.gutterLosses++;
        break;
      case 'GridMutated':
        this.state.grid.cols = event.to.cols;
        this.state.grid.rows = event.to.rows;
        this.state.grid.wiring = event.wiring;
        break;
      case 'ShopRolled':
        this.state.shop.archetype = event.archetype;
        this.state.shop.offers = event.offers;
        this.state.shop.rerollCost = event.rerollCost;
        if (event.expandCost !== null) this.state.shop.expandCost = event.expandCost;
        break;
      case 'TrinketMounted':
        this.state.trinkets.push(event.itemId);
        break;
      case 'DrinkActive':
        this.state.activeDrink = event.itemId;
        break;
      case 'CoinLoaded':
        this.state.loadedCoin = event.coinId;
        break;
      case 'BossScored':
        this.state.boss = { score: event.total, spin: (this.state.boss?.spin ?? 0) + 1 };
        break;
      case 'RoundSettled':
        break;
      case 'RunEnded':
        this.state.phase = event.outcome === 'victory' ? 'VICTORY' : 'GAME_OVER';
        break;
      default:
        break;
    }
  }
}
