/**
 * T-012: run machine (SPEC 2.5, R-RUN-01..07, R-CORE-04).
 *
 * The machine owns the serialisable `RunState` and every legal phase
 * transition. Tick-driven phases (round settle, boss intro, floor transition)
 * advance from `tick()`; the spin lifecycle is driven by the integrator through
 * `beginResolving()` / `spinResolved()` because only the core knows when the
 * physics world has drained.
 *
 * Every rejected command leaves the state byte-for-byte untouched.
 */
import {
  ANIM_TICKS,
  RULES,
  SAVE_VERSION,
  SIM,
  type BalanceDef,
  type BossDef,
  type Cell,
  type Command,
  type CommandError,
  type CommandResult,
  type EngineEvent,
  type FloorDef,
  type FloorId,
  type ItemDef,
  type Phase,
  type RoundResult,
  type RunState,
  type ShopOffer,
  type SimDirective,
  type SymbolId,
} from '@jackpotsyndicate/contracts';
import { createRng, deriveRng, type RngStream } from '../rng/index';
import { drawGrid, makeReelStrips } from '../slot/core/index';
import {
  nextExpandCost,
  nextRerollCost,
  rollShop,
  type ShopRoll,
} from '../shop/index';
import {
  chooseJumper,
  generateJumperOffers,
  jumpersAllowed,
  overvoltAllowed,
  selectOvervolt,
} from '../mutations/index';
import { paylinesForWiring } from '../slot/wirings/index';
import { selectBossForRun } from '../boss/index';

export type CommandName = Command['c'];

type Unstamped<T> = T extends unknown ? Omit<T, 'tick'> : never;
type EmittedEvent = Unstamped<EngineEvent>;

export const ALL_PHASES: readonly Phase[] = [
  'TITLE',
  'PREP',
  'SPINNING',
  'RESOLVING',
  'ROUND_SETTLE',
  'ROUND_RESULT',
  'SHOP',
  'RELIC_PICK',
  'JUMPER_PICK',
  'BOSS_INTRO',
  'ELEVATOR',
  'FLOOR_TRANSITION',
  'GAME_OVER',
  'VICTORY',
];

export const ACTIVE_PHASES: readonly Phase[] = [
  'PREP',
  'SPINNING',
  'RESOLVING',
  'ROUND_SETTLE',
  'ROUND_RESULT',
  'SHOP',
  'RELIC_PICK',
  'JUMPER_PICK',
  'BOSS_INTRO',
  'ELEVATOR',
  'FLOOR_TRANSITION',
];

/** The phase machine from SPEC 2.5, as data. `NewRun` restarts from anywhere. */
export const COMMAND_PHASES: Readonly<Record<CommandName, readonly Phase[]>> = {
  NewRun: ALL_PHASES,
  AbandonRun: ACTIVE_PHASES,
  LoadCoin: ['PREP'],
  Drink: ['PREP'],
  Spin: ['PREP'],
  SetOvervolt: ['PREP'],
  ContinueAfterRound: ['ROUND_RESULT', 'BOSS_INTRO'],
  ShopBuy: ['SHOP'],
  ShopReroll: ['SHOP'],
  ShopExpand: ['SHOP'],
  ShopLeave: ['SHOP'],
  ChooseFloor: ['ELEVATOR'],
  ChooseRelic: ['RELIC_PICK'],
  ChooseJumper: ['JUMPER_PICK'],
};

export interface RunContent {
  floors: readonly FloorDef[];
  balance: BalanceDef;
  items?: readonly ItemDef[];
  /** Boss definitions; the boss module's defaults are used when absent. */
  bosses?: readonly BossDef[];
}

/** A shop item the player can no longer use is never offered or sold (R-SHP-01, R-MUT-*). */
export type PurchaseBlock = 'AT_LIMIT' | 'INVALID_TARGET' | null;

/** Why `item` cannot be bought right now, or null when it can. */
export function purchaseBlock(state: RunState, item: ItemDef | undefined): PurchaseBlock {
  if (item === undefined) return null;
  const grid = state.grid;
  if (item.category === 'COIN') {
    return item.price <= 0 || state.ownedCoins.includes(item.id) ? 'AT_LIMIT' : null;
  }
  if (item.category !== 'CHASSIS') return null;
  switch (item.kind) {
    case 'ADD_COLUMN':
      return grid.cols >= RULES.MAX_COLS ? 'AT_LIMIT' : null;
    case 'ADD_ROW':
      return grid.rows >= RULES.MAX_ROWS ? 'AT_LIMIT' : null;
    case 'HARNESS_HYPER':
      return grid.wiring === 'HYPER' ? 'INVALID_TARGET' : null;
    case 'HARNESS_WAYS':
      return grid.wiring === 'WAYS' ? 'INVALID_TARGET' : null;
    case 'HARNESS_CLUSTER':
      return grid.wiring === 'CLUSTER' ? 'INVALID_TARGET' : null;
    case 'JUMPER':
      if (!jumpersAllowed(grid.wiring)) return 'INVALID_TARGET';
      return state.jumpers.length >= RULES.MAX_JUMPERS ? 'AT_LIMIT' : null;
    case 'OVERVOLT':
      if (state.overvoltOwned === true) return 'AT_LIMIT';
      return overvoltAllowed(grid.wiring) ? null : 'INVALID_TARGET';
  }
}

/**
 * Price of an offer given what the player already owns: chassis with
 * `repeatPrices` charge the entry for the next copy (+Reel column 400 then 900;
 * jumper wires 200 each), falling back to the last entry, then `price`.
 */
export function offerPrice(state: RunState, item: ItemDef): number {
  if (item.category !== 'CHASSIS' || item.repeatPrices === undefined || item.repeatPrices.length === 0) {
    return item.price;
  }
  const owned =
    item.kind === 'ADD_COLUMN'
      ? state.grid.cols - RULES.MIN_COLS
      : item.kind === 'ADD_ROW'
        ? state.grid.rows - RULES.MIN_ROWS
        : item.kind === 'JUMPER'
          ? state.jumpers.length
          : 0;
  const prices = item.repeatPrices;
  return prices[Math.min(Math.max(0, owned), prices.length - 1)] ?? item.price;
}

/** All overvolt-eligible payline ids for the current grid (rows, diagonals, zigzags, jumpers). */
export function overvoltLineIds(state: RunState): string[] {
  const { wiring, cols, rows } = state.grid;
  if (!overvoltAllowed(wiring)) return [];
  return paylinesForWiring(wiring, cols, rows, state.jumpers).map((line) => line.id);
}

/** A glyph purchase that should drop bonus tokens on the shelf (SPEC 2.7). */
export interface GlyphBonus {
  symbolId: SymbolId;
  count: number;
}

export interface CreateRunOptions {
  seed: string;
  content: RunContent;
}

const BOSS_ROUND = RULES.NORMAL_ROUNDS_PER_FLOOR + 1;

const OK: CommandResult = { ok: true };

function fail(error: CommandError): CommandResult {
  return { ok: false, error };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function firstFloor(content: RunContent): FloorDef {
  if (content.floors.length === 0) throw new Error('run content has no floors');
  return content.floors.find((floor) => floor.order === 1) ?? content.floors[0]!;
}

function floorById(content: RunContent, id: FloorId): FloorDef {
  const floor = content.floors.find((candidate) => candidate.id === id);
  if (floor === undefined) throw new Error(`unknown floor ${id}`);
  return floor;
}

function defaultStrips(balance: BalanceDef, cols: number): SymbolId[][] {
  const base = balance.baseStrip.length > 0 ? balance.baseStrip : undefined;
  const first = balance.firstReelStrip.length > 0 ? balance.firstReelStrip : undefined;
  return makeReelStrips(cols, base, first);
}

/**
 * Quota for a normal round `n` (1..9 across the run).
 * `balance.quotas[n - 1] * floor.quotaScale`, rounded to whole cash.
 */
export function quotaForNormalRound(
  balance: BalanceDef,
  roundIndex: number,
  quotaScale = 1,
): number {
  if (!Number.isInteger(roundIndex) || roundIndex < 1) {
    throw new RangeError('normal round index must be a positive integer');
  }
  if (!Number.isFinite(quotaScale) || quotaScale < 0) {
    throw new RangeError('quotaScale must be finite and non-negative');
  }
  const base = balance.quotas[roundIndex - 1];
  if (base === undefined) {
    throw new RangeError(`balance.quotas has no entry for normal round ${roundIndex}`);
  }
  return Math.round(base * quotaScale);
}

/** Global normal-round index for a floor/round pair (branch floors both count). */
export function normalRoundIndex(floor: FloorDef, round: number): number {
  if (!Number.isInteger(round) || round < 1 || round > RULES.NORMAL_ROUNDS_PER_FLOOR) {
    throw new RangeError('normal rounds are 1..3');
  }
  return (floor.order - 1) * RULES.NORMAL_ROUNDS_PER_FLOOR + round;
}

function initialRng(seed: string): Record<string, number[]> {
  return {
    run: deriveRng(seed, 'run').getState(),
    reels: deriveRng(seed, 'reels').getState(),
    shop: deriveRng(seed, 'shop').getState(),
    relics: deriveRng(seed, 'relics').getState(),
    jumpers: deriveRng(seed, 'jumpers').getState(),
  };
}

/** Fresh serialisable run state. `phase` is TITLE until `NewRun` starts it. */
export function createRunState(content: RunContent, seed: string): RunState {
  const floor = firstFloor(content);
  const balance = content.balance;
  const rng = initialRng(seed);
  const strips = defaultStrips(balance, RULES.MIN_COLS);
  const reels = createRng(`${seed}:reels`);
  reels.setState(rng.reels!);
  const drawn = drawGrid(reels, { strips, rows: RULES.MIN_ROWS });
  const state: RunState = {
    saveVersion: SAVE_VERSION,
    seed,
    rng,
    tick: 0,
    phase: 'TITLE',
    floorId: floor.id,
    floorsCleared: [],
    round: 1,
    spinsLeft: RULES.SPINS_PER_ROUND,
    bankroll: balance.startBankroll,
    roundCash: 0,
    fever: 0,
    grid: {
      cols: RULES.MIN_COLS,
      rows: RULES.MIN_ROWS,
      wiring: 'CLASSIC',
      strips: drawn.strips,
      visible: drawn.grid,
      frozen: [],
    },
    jumpers: [],
    overvoltLineId: null,
    trinkets: [],
    drinkTray: Array.from({ length: RULES.DRINK_TRAY_SLOTS }, () => null),
    activeDrink: null,
    ownedCoins: ['copper'],
    loadedCoin: 'copper',
    nextSpin: { xBonus: {}, addMult: 0, bonusOrbs: 0 },
    shop: {
      capacity: RULES.SHOP_START_CAPACITY,
      rerollCost: RULES.SHOP_REROLL_BASE,
      expandCost: RULES.SHOP_EXPAND_BASE,
      archetype: null,
      offers: [],
    },
    boss: null,
    orbChips: {},
    tokenCash: {},
    stats: { spins: 0, lipDrops: 0, gutterLosses: 0, cashBanked: 0, bestSpinEquity: 0 },
  };
  rng.reels = reels.getState();
  return state;
}

export interface RunMachineOptions {
  content: RunContent;
  state: RunState;
  lastResult?: RoundResult | null;
}

/**
 * Event source + command sink for one run. `dispatch` records nothing on a
 * rejection; events are drained by `drainEvents()` (or returned by `tick()`).
 */
export class RunMachine {
  private readonly content: RunContent;
  private state: RunState;
  private events: EngineEvent[] = [];
  private directives: SimDirective[] = [];
  private settleRemaining = 0;
  private phaseRemaining = 0;
  private lastResult: RoundResult | null = null;
  private returnPhase: Phase | null = null;
  /** Instant drinks consumed this command; the core applies their effects now. */
  private instantDrinks: string[] = [];
  /** Glyph shelf bonuses bought this command; the core spawns the tokens. */
  private glyphBonuses: GlyphBonus[] = [];
  private orbsInFlight = 0;
  /** Visible grid from before the current spin draw, used to keep frozen cells. */
  private preSpinVisible: SymbolId[][] | null = null;

  constructor(options: RunMachineOptions) {
    this.content = options.content;
    this.state = clone(options.state);
    this.lastResult = options.lastResult ?? null;
    this.resumeTimers();
  }

  static newRun(content: RunContent, seed: string): RunMachine {
    return new RunMachine({ content, state: createRunState(content, seed) });
  }

  static fromState(content: RunContent, state: RunState): RunMachine {
    return new RunMachine({ content, state });
  }

  private resumeTimers(): void {
    // A JUMPER_PICK is only ever entered from the shop.
    if (this.state.phase === 'JUMPER_PICK') this.returnPhase = 'SHOP';
    if (this.state.phase === 'ROUND_SETTLE') this.settleRemaining = SIM.ROUND_SETTLE_TICKS;
    if (this.state.phase === 'BOSS_INTRO') this.phaseRemaining = ANIM_TICKS.bossIntro;
    if (this.state.phase === 'FLOOR_TRANSITION') {
      this.phaseRemaining = ANIM_TICKS.floorTransition;
    }
  }

  getState(): RunState {
    return this.state;
  }

  getLastResult(): RoundResult | null {
    return this.lastResult === null ? null : clone(this.lastResult);
  }

  setLastResult(result: RoundResult | null): void {
    this.lastResult = result === null ? null : clone(result);
  }

  /** Snapshot used by Core's boss-freeze pass; null outside a spin draw. */
  getPreSpinVisible(): SymbolId[][] | null {
    return this.preSpinVisible === null
      ? null
      : this.preSpinVisible.map((column) => column.slice());
  }

  clearPreSpinVisible(): void {
    this.preSpinVisible = null;
  }

  getContent(): RunContent {
    return this.content;
  }

  getPhase(): Phase {
    return this.state.phase;
  }

  /** Set by the integrator when the physics world reports orbs in flight. */
  setOrbsInFlight(count: number): void {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError('orbsInFlight must be a non-negative integer');
    }
    this.orbsInFlight = count;
  }

  drainEvents(): EngineEvent[] {
    return this.events.splice(0, this.events.length);
  }

  takeEvents(): EngineEvent[] {
    return this.drainEvents();
  }

  drainDirectives(): SimDirective[] {
    return this.directives.splice(0, this.directives.length);
  }

  /** Instant drinks (Lubricant Oil Shot) drunk since the last drain (D-08). */
  drainInstantDrinks(): string[] {
    return this.instantDrinks.splice(0, this.instantDrinks.length);
  }

  /** Glyph shelf-token bonuses bought since the last drain. */
  drainGlyphBonuses(): GlyphBonus[] {
    return this.glyphBonuses.splice(0, this.glyphBonuses.length);
  }

  /**
   * Draw one refill symbol for a CLUSTER tumble from `col`'s reel strip, using
   * the seeded `reels` stream (R-MUT-04).
   */
  drawRefill(col: number): SymbolId {
    const strip = this.state.grid.strips[col] ?? this.state.grid.strips[0]!;
    const reels = this.stream('reels');
    const symbol = strip[reels.int(strip.length)]!;
    this.saveStream('reels', reels);
    return symbol;
  }

  /** The current offer for a picker phase, re-sent after a resume. */
  pendingOfferEvent(): EngineEvent | null {
    if (this.state.phase === 'RELIC_PICK' && this.state.pendingRelics !== undefined) {
      return { t: 'RelicsOffered', itemIds: [...this.state.pendingRelics] };
    }
    if (this.state.phase === 'JUMPER_PICK' && this.state.pendingJumpers !== undefined) {
      return {
        t: 'JumpersOffered',
        options: this.state.pendingJumpers.map((line) => line.map((cell) => [cell[0], cell[1]] as Cell)),
      };
    }
    return null;
  }

  currentFloor(): FloorDef {
    return floorById(this.content, this.state.floorId);
  }

  currentQuota(): number {
    const floor = this.currentFloor();
    return quotaForNormalRound(
      this.content.balance,
      normalRoundIndex(floor, this.state.round),
      floor.quotaScale,
    );
  }

  dispatch(command: Command): CommandResult {
    const allowed = COMMAND_PHASES[command.c];
    if (allowed === undefined || !allowed.includes(this.state.phase)) {
      return fail('WRONG_PHASE');
    }

    switch (command.c) {
      case 'NewRun':
        return this.newRun(command.seed);
      case 'AbandonRun':
        return this.abandon();
      case 'LoadCoin':
        return this.loadCoin(command.coinId);
      case 'Drink':
        return this.drink(command.slot);
      case 'Spin':
        return this.spin();
      case 'ContinueAfterRound':
        return this.continueAfterRound();
      case 'ShopBuy':
        return this.shopBuy(command.offerId, command.target);
      case 'ShopReroll':
        return this.shopReroll();
      case 'ShopExpand':
        return this.shopExpand();
      case 'ShopLeave':
        return this.shopLeave();
      case 'ChooseFloor':
        return this.chooseFloor(command.floorId);
      case 'ChooseRelic':
        return this.chooseRelic(command.index);
      case 'ChooseJumper':
        return this.chooseJumper(command.index);
      case 'SetOvervolt':
        return this.setOvervolt(command.lineId);
    }
  }

  /** Advance one run tick; returns this tick's events. */
  tick(): EngineEvent[] {
    this.state.tick += 1;
    if (this.state.phase === 'ROUND_SETTLE') {
      if (this.settleRemaining > 0) this.settleRemaining -= 1;
      if (this.settleRemaining === 0) this.judgeRound();
    } else if (this.state.phase === 'BOSS_INTRO' || this.state.phase === 'FLOOR_TRANSITION') {
      if (this.phaseRemaining > 0) this.phaseRemaining -= 1;
      if (this.phaseRemaining === 0) {
        this.returnPhase = null;
        this.transition('PREP');
      }
    }
    return this.drainEvents();
  }

  /** SPINNING -> RESOLVING. */
  beginResolving(): CommandResult {
    if (this.state.phase !== 'SPINNING') return fail('WRONG_PHASE');
    this.transition('RESOLVING');
    return OK;
  }

  /** All orbs are gone: return to PREP or start the 300-tick round settle. */
  spinResolved(): CommandResult {
    if (this.state.phase !== 'SPINNING' && this.state.phase !== 'RESOLVING') {
      return fail('WRONG_PHASE');
    }
    if (this.state.activeDrink !== null) {
      this.state.activeDrink = null;
      this.emit({ t: 'DrinkActive', itemId: null });
    }
    this.state.nextSpin = { xBonus: {}, addMult: 0, bonusOrbs: 0 };
    if (this.state.spinsLeft > 0) {
      this.transition('PREP');
    } else {
      this.settleRemaining = SIM.ROUND_SETTLE_TICKS;
      this.transition('ROUND_SETTLE');
    }
    return OK;
  }

  /** Bank a lip drop. Round cash feeds the boss tug-of-war; bankroll only moves here. */
  bank(cash: number): CommandResult {
    if (!Number.isFinite(cash) || cash < 0) return fail('INVALID_TARGET');
    this.state.bankroll += cash;
    this.state.roundCash += cash;
    this.state.stats.cashBanked += cash;
    this.state.stats.lipDrops += 1;
    this.emit({
      t: 'BankrollChanged',
      delta: cash,
      total: this.state.bankroll,
      reason: 'lip',
    });
    return OK;
  }

  /** Boss score for the current spin (R-BOS-01); no quota in boss rounds (D-04). */
  recordBossScore(delta: number): CommandResult {
    if (this.state.round !== BOSS_ROUND || this.state.boss === null) {
      return fail('WRONG_PHASE');
    }
    if (!Number.isFinite(delta)) return fail('INVALID_TARGET');
    this.state.boss.score += delta;
    this.emit({
      t: 'BossScored',
      delta,
      total: this.state.boss.score,
      playerScore: this.state.roundCash,
    });
    return OK;
  }

  // ------------------------------------------------------------- private

  private emit(event: EmittedEvent): void {
    this.events.push({ ...event, tick: this.state.tick } as unknown as EngineEvent);
  }

  private transition(to: Phase): void {
    const from = this.state.phase;
    if (from === to) return;
    this.state.phase = to;
    this.emit({ t: 'PhaseChanged', from, to });
  }

  private stream(name: string): RngStream {
    const rng = deriveRng(this.state.seed, name);
    const saved = this.state.rng[name];
    if (saved !== undefined && saved.length === 4) rng.setState(saved);
    return rng;
  }

  private saveStream(name: string, rng: RngStream): void {
    this.state.rng[name] = rng.getState();
  }

  private newRun(seed: string): CommandResult {
    if (typeof seed !== 'string') return fail('INVALID_TARGET');
    this.state = createRunState(this.content, seed);
    this.lastResult = null;
    this.returnPhase = null;
    this.instantDrinks = [];
    this.glyphBonuses = [];
    this.settleRemaining = 0;
    this.phaseRemaining = 0;
    this.emit({ t: 'RunStarted', seed });
    this.transition('PREP');
    return OK;
  }

  private abandon(): CommandResult {
    this.transition('GAME_OVER');
    this.emit({ t: 'RunEnded', outcome: 'abandoned' });
    return OK;
  }

  private loadCoin(coinId: string): CommandResult {
    const coin = this.findItem(coinId);
    // A free coin (the starter Copper Token) is always owned.
    const free = coin?.category === 'COIN' && coin.price <= 0;
    if (!this.state.ownedCoins.includes(coinId) && !free) return fail('NOT_OWNED');
    this.state.loadedCoin = coinId;
    this.emit({ t: 'CoinLoaded', coinId });
    return OK;
  }

  private drink(slot: number): CommandResult {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.state.drinkTray.length) {
      return fail('INVALID_TARGET');
    }
    const itemId = this.state.drinkTray[slot] ?? null;
    if (itemId === null) return fail('INVALID_TARGET');
    const item = this.findItem(itemId);
    if (item?.category === 'DRINK' && item.instant) {
      // D-08: an instant drink acts now and never occupies the active slot.
      this.state.drinkTray[slot] = null;
      this.instantDrinks.push(itemId);
      this.emit({ t: 'DrinkActive', itemId });
      this.emit({ t: 'DrinkActive', itemId: this.state.activeDrink });
      return OK;
    }
    if (this.state.activeDrink !== null) return fail('AT_LIMIT');
    this.state.drinkTray[slot] = null;
    this.state.activeDrink = itemId;
    this.emit({ t: 'DrinkActive', itemId });
    return OK;
  }

  private spin(): CommandResult {
    if (this.state.spinsLeft <= 0) return fail('AT_LIMIT');
    if (this.orbsInFlight > 0) return fail('ORBS_IN_FLIGHT');
    const coin = this.findItem(this.state.loadedCoin);
    const coinCost = coin?.category === 'COIN' ? Math.max(0, coin.costPerSpin) : 0;
    if (coinCost > this.state.bankroll) return fail('INSUFFICIENT_FUNDS');
    if (coinCost > 0) {
      // Blood Doubloon: the loaded coin charges per spin (SPEC 2.7).
      this.state.bankroll -= coinCost;
      this.emit({ t: 'BankrollChanged', delta: -coinCost, total: this.state.bankroll, reason: 'coin' });
    }

    const preSpinVisible = this.state.grid.visible.map((column) => column.slice());
    const reels = this.stream('reels');
    const drawn = drawGrid(reels, {
      strips: this.state.grid.strips,
      rows: this.state.grid.rows,
    });
    this.saveStream('reels', reels);
    this.preSpinVisible = preSpinVisible;
    this.state.grid.visible = drawn.grid;

    const spinIndex = this.state.stats.spins;
    this.state.stats.spins += 1;
    this.state.spinsLeft -= 1;
    if (this.state.round === BOSS_ROUND && this.state.boss !== null) {
      this.state.boss.spin += 1;
    }

    this.transition('SPINNING');
    this.emit({
      t: 'SpinStarted',
      spinIndex,
      cols: this.state.grid.cols,
      rows: this.state.grid.rows,
    });

    this.state.fever += RULES.FEVER_PER_SPIN;
    if (this.state.fever >= 100) {
      this.state.fever = RULES.FEVER_RESET;
      this.state.nextSpin.bonusOrbs += RULES.FEVER_ORBS;
      this.directives.push({ t: 'surge' });
      this.emit({ t: 'FeverTriggered' });
    }
    this.emit({ t: 'FeverChanged', value: this.state.fever });
    return OK;
  }

  private continueAfterRound(): CommandResult {
    if (this.state.phase === 'BOSS_INTRO') {
      this.phaseRemaining = 0;
      this.transition('PREP');
      return OK;
    }

    const result = this.lastResult;
    if (result === null) {
      // A pre-lastResult save carries no normal verdict, and the tribute has
      // already been deducted, so a passed and a missed round are not
      // distinguishable from bankroll alone. Fail closed instead of granting
      // a free shop visit. Boss verdicts are exact because no tribute is paid.
      if (this.state.round === BOSS_ROUND && this.state.boss !== null) {
        if (this.state.roundCash < this.state.boss.score) return this.gameOver('defeat');
        return this.claimBossReward();
      }
      return this.gameOver('defeat');
    }

    if (!result.passed) return this.gameOver('defeat');
    if (result.kind === 'boss') return this.claimBossReward();
    return this.enterShop();
  }

  /**
   * Pay out the beaten boss's own reward (R-BOS-02..04): Valenti deals a relic
   * pick (D-09), Madame Zero adds shop capacity, the Iron Auditor ends the run
   * in victory. A floor with no exits always ends in victory.
   */
  private claimBossReward(): CommandResult {
    this.markFloorCleared();
    const boss = selectBossForRun(
      {
        floors: this.content.floors,
        ...(this.content.bosses === undefined ? {} : { bosses: this.content.bosses }),
      },
      { floorId: this.state.floorId, seed: this.state.seed },
    );
    const reward = boss.reward;
    if (reward.kind === 'victory' || this.currentFloor().next.length === 0) {
      this.emit({ t: 'BossRewarded', bossId: boss.id, reward: 'victory', amount: 0 });
      return this.victory();
    }
    if (reward.kind === 'shopCapacity') {
      const before = this.state.shop.capacity;
      this.state.shop.capacity = Math.min(RULES.SHOP_MAX_CAPACITY, before + reward.amount);
      this.emit({
        t: 'BossRewarded',
        bossId: boss.id,
        reward: 'shopCapacity',
        amount: this.state.shop.capacity - before,
      });
      this.transition('ELEVATOR');
      return OK;
    }
    this.emit({ t: 'BossRewarded', bossId: boss.id, reward: 'relicChoice', amount: reward.count });
    return this.offerRelics(reward.count);
  }

  private findItem(id: string): ItemDef | undefined {
    return (this.content.items ?? []).find((item) => item.id === id);
  }

  /** Items the shop may offer right now: nothing already maxed out or unusable. */
  private shopCatalog(exclude: readonly string[] = []): ItemDef[] {
    return (this.content.items ?? []).filter(
      (item) => !exclude.includes(item.id) && purchaseBlock(this.state, item) === null,
    );
  }

  private priceOffers(offers: readonly ShopOffer[]): ShopOffer[] {
    return offers.map((offer) => {
      const item = this.findItem(offer.itemId);
      return { ...offer, price: item === undefined ? offer.price : offerPrice(this.state, item) };
    });
  }

  private judgeRound(): void {
    let result: RoundResult;

    if (this.state.round === BOSS_ROUND) {
      const playerScore = this.state.roundCash;
      const bossScore = this.state.boss?.score ?? 0;
      result = {
        kind: 'boss',
        passed: playerScore >= bossScore,
        playerScore,
        bossScore,
      };
    } else {
      const quota = this.currentQuota();
      const before = this.state.bankroll;
      const passed = before >= quota;
      const after = passed ? before - quota : before;
      if (passed) {
        this.state.bankroll = after;
        this.emit({
          t: 'BankrollChanged',
          delta: -quota,
          total: after,
          reason: 'quota',
        });
      }
      result = { kind: 'normal', passed, quota, bankrollBefore: before, bankrollAfter: after };
    }

    if (result.kind === 'boss' && result.passed) this.markFloorCleared();
    this.lastResult = result;
    this.emit({ t: 'RoundSettled', result });
    this.transition('ROUND_RESULT');
  }

  private gameOver(outcome: 'defeat' | 'abandoned'): CommandResult {
    this.transition('GAME_OVER');
    this.emit({ t: 'RunEnded', outcome });
    return OK;
  }

  private markFloorCleared(): void {
    if (!this.state.floorsCleared.includes(this.state.floorId)) {
      this.state.floorsCleared.push(this.state.floorId);
    }
  }

  private victory(): CommandResult {
    this.markFloorCleared();
    this.transition('VICTORY');
    this.emit({ t: 'RunEnded', outcome: 'victory' });
    return OK;
  }

  private enterShop(): CommandResult {
    const floor = this.currentFloor();
    const shop = this.state.shop;
    const rng = this.stream('shop');
    const rolled = rollShop({
      floor,
      items: this.shopCatalog(),
      rng,
      capacity: shop.capacity,
      count: shop.capacity,
      expansions: 0,
    });
    this.saveStream('shop', rng);

    // R-SHP-02: the reroll price escalates across a floor's shops and resets
    // only on a new floor (chooseFloor / newRun).
    shop.expandCost = Math.max(shop.expandCost, RULES.SHOP_EXPAND_BASE);
    shop.archetype = rolled.archetype;
    shop.offers = this.priceOffers(rolled.offers);
    this.transition('SHOP');
    this.emitShopRolled(rolled.archetype);
    return OK;
  }

  private emitShopRolled(archetype: ShopRoll['archetype']): void {
    this.emit({
      t: 'ShopRolled',
      archetype,
      offers: this.state.shop.offers.map((offer) => ({ ...offer })),
      rerollCost: this.state.shop.rerollCost,
      expandCost:
        this.state.shop.capacity >= RULES.SHOP_MAX_CAPACITY
          ? null
          : this.state.shop.expandCost,
    });
  }

  private shopReroll(): CommandResult {
    const shop = this.state.shop;
    if (this.state.bankroll < shop.rerollCost) return fail('INSUFFICIENT_FUNDS');
    const cost = shop.rerollCost;
    const rng = this.stream('shop');
    const rolled = rollShop({
      floor: this.currentFloor(),
      items: this.shopCatalog(),
      rng,
      capacity: shop.capacity,
      count: shop.capacity,
      expansions: 0,
      archetype: shop.archetype ?? undefined,
    });
    this.saveStream('shop', rng);

    this.state.bankroll -= cost;
    shop.rerollCost = nextRerollCost(cost);
    shop.archetype = rolled.archetype;
    shop.offers = this.priceOffers(rolled.offers);
    this.emit({
      t: 'BankrollChanged',
      delta: -cost,
      total: this.state.bankroll,
      reason: 'shop',
    });
    this.emitShopRolled(rolled.archetype);
    return OK;
  }

  private shopExpand(): CommandResult {
    const shop = this.state.shop;
    if (shop.capacity >= RULES.SHOP_MAX_CAPACITY) return fail('AT_LIMIT');
    if (this.state.bankroll < shop.expandCost) return fail('INSUFFICIENT_FUNDS');
    const cost = shop.expandCost;
    this.state.bankroll -= cost;
    shop.capacity = Math.min(RULES.SHOP_MAX_CAPACITY, shop.capacity + 1);
    shop.expandCost = nextExpandCost(cost);
    this.emit({
      t: 'BankrollChanged',
      delta: -cost,
      total: this.state.bankroll,
      reason: 'shop',
    });

    // The new slot is stocked right away from the same vendor archetype.
    if (shop.archetype !== null) {
      const rng = this.stream('shop');
      const extra = rollShop({
        floor: this.currentFloor(),
        items: this.shopCatalog(shop.offers.map((offer) => offer.itemId)),
        rng,
        capacity: 1,
        count: 1,
        expansions: 0,
        archetype: shop.archetype,
      });
      this.saveStream('shop', rng);
      for (const offer of this.priceOffers(extra.offers)) {
        shop.offers.push({ ...offer, offerId: `offer-${shop.offers.length}` });
      }
      this.emitShopRolled(shop.archetype);
    }
    return OK;
  }

  private shopLeave(): CommandResult {
    this.state.shop.offers = [];
    this.state.shop.archetype = null;
    this.state.roundCash = 0;

    if (this.state.round < RULES.NORMAL_ROUNDS_PER_FLOOR) {
      this.state.round += 1;
      this.state.spinsLeft = RULES.SPINS_PER_ROUND;
      this.transition('PREP');
      return OK;
    }

    this.state.round = BOSS_ROUND;
    this.state.spinsLeft = RULES.SPINS_PER_ROUND;
    this.state.boss = { score: 0, spin: 0 };
    this.phaseRemaining = ANIM_TICKS.bossIntro;
    this.transition('BOSS_INTRO');
    return OK;
  }

  private shopBuy(offerId: string, target?: { reel?: number }): CommandResult {
    const shop = this.state.shop;
    const offer = shop.offers.find((candidate) => candidate.offerId === offerId);
    if (offer === undefined || offer.sold) return fail('UNKNOWN_ID');

    const item = (this.content.items ?? []).find((candidate) => candidate.id === offer.itemId);

    if (offer.category === 'DRINK' && !this.state.drinkTray.includes(null)) {
      return fail('AT_LIMIT');
    }
    const blocked = purchaseBlock(this.state, item);
    if (blocked !== null) return fail(blocked);
    if (offer.category === 'REEL') {
      const reel = target?.reel;
      if (
        reel === undefined ||
        !Number.isInteger(reel) ||
        reel < 0 ||
        reel >= this.state.grid.cols ||
        item?.category !== 'REEL'
      ) {
        return fail('INVALID_TARGET');
      }
    }
    if (this.state.bankroll < offer.price) return fail('INSUFFICIENT_FUNDS');

    this.state.bankroll -= offer.price;
    offer.sold = true;
    this.emit({
      t: 'BankrollChanged',
      delta: -offer.price,
      total: this.state.bankroll,
      reason: 'shop',
    });
    this.emit({ t: 'ItemBought', offerId, itemId: offer.itemId, price: offer.price });
    this.grantItem(offer, item, target);
    return OK;
  }

  private grantItem(
    offer: ShopOffer,
    item: ItemDef | undefined,
    target?: { reel?: number },
  ): void {
    switch (offer.category) {
      case 'TRINKET': {
        this.state.trinkets.push(offer.itemId);
        const count = this.state.trinkets.filter((id) => id === offer.itemId).length;
        this.emit({ t: 'TrinketMounted', itemId: offer.itemId, count });
        break;
      }
      case 'DRINK': {
        const slot = this.state.drinkTray.indexOf(null);
        if (slot >= 0) this.state.drinkTray[slot] = offer.itemId;
        break;
      }
      case 'COIN': {
        if (!this.state.ownedCoins.includes(offer.itemId)) {
          this.state.ownedCoins.push(offer.itemId);
        }
        break;
      }
      case 'REEL': {
        if (item?.category === 'REEL' && target?.reel !== undefined) {
          const strip = this.state.grid.strips[target.reel];
          if (strip !== undefined) strip.push(item.symbolId);
          if (item.bonusTokens > 0) {
            this.glyphBonuses.push({ symbolId: item.symbolId, count: item.bonusTokens });
          }
        }
        break;
      }
      case 'CHASSIS': {
        if (item?.category === 'CHASSIS') this.applyChassis(item);
        break;
      }
    }
  }

  private applyChassis(item: Extract<ItemDef, { category: 'CHASSIS' }>): void {
    const grid = this.state.grid;
    switch (item.kind) {
      case 'ADD_COLUMN': {
        const base = this.content.balance.baseStrip;
        const strip = Array.from(base.length > 0 ? base : ['cherry']);
        const visible: string[] = [];
        for (let row = 0; row < grid.rows; row++) visible.push(strip[row % strip.length]!);
        grid.strips.push(strip as RunState['grid']['strips'][number]);
        grid.visible.push(visible as RunState['grid']['visible'][number]);
        grid.cols += 1;
        this.emit({
          t: 'GridMutated',
          from: { cols: grid.cols - 1, rows: grid.rows },
          to: { cols: grid.cols, rows: grid.rows },
          wiring: grid.wiring,
        });
        break;
      }
      case 'ADD_ROW': {
        for (let col = 0; col < grid.cols; col++) {
          const strip = grid.strips[col]!;
          grid.visible[col]!.push(strip[grid.rows % strip.length]!);
        }
        grid.rows += 1;
        this.emit({
          t: 'GridMutated',
          from: { cols: grid.cols, rows: grid.rows - 1 },
          to: { cols: grid.cols, rows: grid.rows },
          wiring: grid.wiring,
        });
        break;
      }
      case 'HARNESS_HYPER':
      case 'HARNESS_WAYS':
      case 'HARNESS_CLUSTER': {
        const wiring =
          item.kind === 'HARNESS_HYPER'
            ? 'HYPER'
            : item.kind === 'HARNESS_WAYS'
              ? 'WAYS'
              : 'CLUSTER';
        const from = { cols: grid.cols, rows: grid.rows };
        grid.wiring = wiring;
        this.emit({ t: 'GridMutated', from, to: { ...from }, wiring });
        break;
      }
      case 'JUMPER': {
        const rng = this.stream('jumpers');
        const options = generateJumperOffers(
          this.state.seed,
          { cols: grid.cols, rows: grid.rows },
          { wiring: grid.wiring, current: this.state.jumpers, count: 3, rng: () => rng.next() },
        );
        this.saveStream('jumpers', rng);
        if (options.length === 0) break;
        this.state.pendingJumpers = options.map((line) => line.map((cell) => [cell[0], cell[1]] as Cell));
        this.returnPhase = 'SHOP';
        this.transition('JUMPER_PICK');
        this.emit({ t: 'JumpersOffered', options: options.map((line) => line.map((cell) => [...cell] as Cell)) });
        break;
      }
      case 'OVERVOLT': {
        // R-MUT-06: owning the Overvolt unlocks SetOvervolt; arm the middle
        // row so the purchase pays off before the player picks a line.
        this.state.overvoltOwned = true;
        if (this.state.overvoltLineId === null) {
          const middle = `row:${Math.floor((grid.rows - 1) / 2)}`;
          if (overvoltLineIds(this.state).includes(middle)) {
            this.state.overvoltLineId = middle;
            this.emit({ t: 'OvervoltSet', lineId: middle });
          }
        }
        break;
      }
    }
  }

  private chooseFloor(floorId: FloorId): CommandResult {
    const options = this.currentFloor().next;
    if (!options.includes(floorId)) return fail('INVALID_TARGET');
    const target = floorById(this.content, floorId);
    const cleared = this.state.floorId;
    if (!this.state.floorsCleared.includes(cleared)) this.state.floorsCleared.push(cleared);

    this.state.floorId = target.id;
    this.state.round = 1;
    this.state.spinsLeft = RULES.SPINS_PER_ROUND;
    this.state.roundCash = 0;
    this.state.boss = null;
    // Boss locks belong to the floor they were applied on (R-BOS-03).
    this.state.grid.frozen = [];
    this.state.activeDrink = null;
    this.state.shop.offers = [];
    this.state.shop.archetype = null;
    this.state.shop.rerollCost = RULES.SHOP_REROLL_BASE;

    this.phaseRemaining = ANIM_TICKS.floorTransition;
    this.transition('FLOOR_TRANSITION');
    return OK;
  }

  private relicOptions(count = 3): string[] {
    if (this.state.pendingRelics !== undefined && this.state.pendingRelics.length > 0) {
      return this.state.pendingRelics;
    }
    const trinkets = (this.content.items ?? [])
      .filter((item) => item.category === 'TRINKET')
      .map((item) => item.id);
    if (trinkets.length === 0) return [];
    const rng = this.stream('relics');
    this.state.pendingRelics = rng.shuffle(trinkets).slice(0, Math.max(1, count));
    this.saveStream('relics', rng);
    return this.state.pendingRelics;
  }

  private offerRelics(count = 3): CommandResult {
    const options = this.relicOptions(count);
    if (options.length === 0) {
      delete this.state.pendingRelics;
      this.transition('ELEVATOR');
      return OK;
    }
    this.transition('RELIC_PICK');
    this.emit({ t: 'RelicsOffered', itemIds: [...options] });
    return OK;
  }

  private chooseRelic(index: number): CommandResult {
    const options = this.state.pendingRelics ?? [];
    if (!Number.isInteger(index) || index < 0 || index >= options.length) {
      return fail('INVALID_TARGET');
    }
    const itemId = options[index]!;
    this.state.trinkets.push(itemId);
    delete this.state.pendingRelics;
    this.emit({
      t: 'TrinketMounted',
      itemId,
      count: this.state.trinkets.filter((id) => id === itemId).length,
    });
    this.transition('ELEVATOR');
    return OK;
  }

  private chooseJumper(index: number): CommandResult {
    const pending = this.state.pendingJumpers ?? [];
    if (!Number.isInteger(index) || index < 0 || index >= pending.length) {
      return fail('INVALID_TARGET');
    }
    if (this.state.jumpers.length >= RULES.MAX_JUMPERS) return fail('AT_LIMIT');
    const chosen = chooseJumper(pending, index);
    if (chosen === null) return fail('INVALID_TARGET');
    this.state.jumpers.push(chosen);
    delete this.state.pendingJumpers;
    const back = this.returnPhase ?? 'PREP';
    this.returnPhase = null;
    this.transition(back);
    return OK;
  }

  private setOvervolt(lineId: string | null): CommandResult {
    if (lineId !== null && this.state.overvoltOwned !== true) return fail('NOT_OWNED');
    const wiring = this.state.grid.wiring;
    const selected = selectOvervolt(wiring, lineId, overvoltLineIds(this.state));
    if (lineId !== null && selected === null) return fail('INVALID_TARGET');
    if (this.state.overvoltLineId !== selected) {
      this.state.overvoltLineId = selected;
      this.emit({ t: 'OvervoltSet', lineId: selected });
    }
    return OK;
  }
}

/** True when `command` is legal in `phase` (used by UI affordances and tests). */
export function commandAllowed(phase: Phase, command: CommandName | Command): boolean {
  const name = typeof command === 'string' ? command : command.c;
  return COMMAND_PHASES[name]?.includes(phase) ?? false;
}