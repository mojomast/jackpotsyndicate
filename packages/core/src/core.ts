/**
 * T-080: GameCore integration.
 *
 * One core composes the pure run machine (`@jackpotsyndicate/engine`) with the
 * value-agnostic deterministic simulation (`@jackpotsyndicate/physics`).
 *
 * Tick order (SPEC 2.5):
 *   queued commands -> engine scheduled actions -> SimWorld.step()
 *   -> route physics events through effect hooks -> apply effects -> emit.
 *
 * Commands are applied synchronously by `dispatch` (so their result is
 * meaningful immediately) and recorded in the command log at the current tick.
 * Engine events produced by a command are buffered and returned by the next
 * `tick()`, matching the C-2 "each event stamped with a tick" contract.
 */
import {
  ANIM_TICKS,
  BOARD,
  DEFAULT_MODIFIERS,
  EVAL_DELAY_TICKS,
  ORB_LAUNCH_DELAY_TICKS,
  ORB_LAUNCH_INTERVAL_TICKS,
  REEL_STOP_TICK,
  RULES,
  commandSchema,
  type BodyId,
  type BossDef,
  type Cell,
  type Command,
  type CommandResult,
  type ContentBundle,
  type EngineEvent,
  type FloorDef,
  type FloorId,
  type GameCore,
  type GameEvent,
  type ItemDef,
  type OrbSpec,
  type Phase,
  type PhysicsEvent,
  type PhysicsModifiers,
  type RunState,
  type SaveFile,
  type SimSnapshot,
  type SimWorld,
  type SymbolDef,
  type SymbolId,
  type TokenSpec,
  type TokenTemplate,
  type WinEval,
  type Effect,
} from '@jackpotsyndicate/contracts';
import {
  DEFAULT_SYMBOL_STATS,
  RunMachine,
  applyCoinToOrbSpec,
  applyEffects,
  applyModifierEffects,
  createRunState,
  createSaveFile,
  dispatchHook,
  drinkRefs,
  engineHash,
  findCoin,
  getWiringEvaluator,
  hashString,
  loadSave,
  planBossSpin,
  planDozerExtension,
  scoreTumble,
  scoreWiring,
  selectBossForRun,
  symbolEffectRefs,
  trinketRefs,
  tumbleCluster,
  type BossDefinition,
  type EffectContext,
  type EffectResolution,
  type GlyphBonus,
  type OrbPlanEntry,
  type RunContent,
  type ScoreResult,
  type TumbleResult,
} from '@jackpotsyndicate/engine';
import { createSimWorld } from '@jackpotsyndicate/physics';
import { CONTENT_BUNDLE } from '../../content/src/index';
import { EventBus } from './events';

export type CoreContent = ContentBundle | RunContent;

export interface GameCoreOptions {
  /** Full content bundle, or the run-machine slice (floors, balance, items). */
  content?: CoreContent;
  /** Run seed used before `NewRun`; the command's seed wins once dispatched. */
  seed?: string;
  /** Numeric physics seed override. Defaults to a stable hash of the run seed. */
  simSeed?: number;
  /** Disable the built-in seed shelf (20 tokens) for boundary-focused tests. */
  seedShelf?: boolean;
}

interface ActiveSpin {
  startTick: number;
  evalTick: number;
  stopsEmitted: number;
  evaluated: boolean;
  orbPlan: OrbPlanEntry[];
  addMult: number;
  xMult: number;
  chips: number;
  equity: number;
  launchQueue: { atTick: number; entry: OrbPlanEntry; index: number }[];
  launchCursor: number;
  /** CLUSTER tumble steps, emitted as TumbleStep before the first orb (C-6). */
  tumbleQueue: { atTick: number; cleared: Cell[]; gridAfter: SymbolId[][] }[];
  tumbleCursor: number;
  /** Peg hits so far this spin, across all orbs ("every 3rd peg hit", Tesla). */
  pegHits: number;
  nextSpinBaseline: RunState['nextSpin'];
}

interface OrbMeta {
  count: number;
  stack: number;
  symbolId: string;
}

const SCRAP_TEMPLATE: TokenTemplate = {
  symbolId: 'scrap',
  skin: 'copper',
  radius: 10,
  mass: 1,
  slide: 0.5,
  count: 1,
  stack: 1,
  weldOnLand: false,
  magnetic: false,
  seismic: false,
  resistSuction: false,
};

const PUSHER_ACTIVE: ReadonlySet<Phase> = new Set<Phase>([
  'PREP',
  'SPINNING',
  'RESOLVING',
  'ROUND_SETTLE',
]);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function currentItems(content: CoreContent): readonly ItemDef[] {
  return content.items ?? [];
}

function contentSymbols(content: CoreContent): readonly SymbolDef[] {
  return (content as Partial<ContentBundle>).symbols ?? [];
}

function contentBosses(content: CoreContent): readonly BossDef[] | undefined {
  return (content as Partial<ContentBundle>).bosses;
}

function sumRecord(record: Record<string, number>): number {
  let total = 0;
  for (const key of Object.keys(record)) total += record[key] ?? 0;
  return total;
}

function symbolStatOverrides(
  symbols: readonly SymbolDef[],
): Partial<Record<SymbolId, { chips?: number; addMult?: number; xMult?: number; fullLineXMult?: number }>> {
  const out: Partial<
    Record<SymbolId, { chips?: number; addMult?: number; xMult?: number; fullLineXMult?: number }>
  > = {};
  for (const symbol of symbols) {
    out[symbol.id] = {
      chips: symbol.slot.chips,
      addMult: symbol.slot.addMult,
      xMult: symbol.slot.xMult,
      ...(symbol.slot.fullLineXMult === undefined
        ? {}
        : { fullLineXMult: symbol.slot.fullLineXMult }),
    };
  }
  return out;
}

function cheapestChips(symbols: readonly SymbolDef[]): number {
  if (symbols.length === 0) {
    let cheapest = Number.POSITIVE_INFINITY;
    for (const id of Object.keys(DEFAULT_SYMBOL_STATS) as SymbolId[]) {
      cheapest = Math.min(cheapest, DEFAULT_SYMBOL_STATS[id].chips);
    }
    return cheapest;
  }
  let cheapest = Number.POSITIVE_INFINITY;
  for (const symbol of symbols) cheapest = Math.min(cheapest, symbol.slot.chips);
  return cheapest;
}

interface GridScore {
  result: ScoreResult;
  /** CLUSTER only: the tumble chain that produced the extra wins. */
  tumble: TumbleResult | null;
}

/**
 * SPEC 2.6 scoring for the current wiring. Every wiring shares payline ids,
 * so overvolt and Seven's full-line X behave the same with or without
 * jumpers. CLUSTER spins tumble (R-MUT-04) with refills drawn by `refill`.
 */
function scoreGrid(
  content: CoreContent,
  state: RunState,
  grid: SymbolId[][],
  refill: (col: number) => SymbolId,
): GridScore {
  const balance = content.balance;
  const frozen = state.grid.frozen
    .filter((entry) => entry.spins > 0)
    .map((entry) => [entry.cell[0], entry.cell[1]] as Cell);
  const options = {
    minMatch: balance.minMatch,
    overvoltLineId: state.overvoltLineId,
    frozen,
    extraAddMult: state.nextSpin.addMult,
    extraXMult: 1 + sumRecord(state.nextSpin.xBonus),
    cashPerChip: balance.cashPerChip,
    symbols: symbolStatOverrides(contentSymbols(content)),
  };

  if (state.grid.wiring === 'CLUSTER') {
    const tumble = tumbleCluster(grid, (cell) => refill(cell[0]), {
      maxTumbles: RULES.MAX_TUMBLES,
      frozen,
    });
    return { result: scoreTumble(grid, tumble, options), tumble };
  }
  return {
    result: scoreWiring(grid, { ...options, wiring: state.grid.wiring, jumperLines: state.jumpers }),
    tumble: null,
  };
}

/** Concrete `GameCore`: engine + physics with deterministic effect routing. */
export class Core implements GameCore {
  readonly content: CoreContent;
  private readonly bus = new EventBus();
  private readonly useSeedShelf: boolean;
  private machine: RunMachine;
  private sim: SimWorld;
  private configuredFloorId: FloorId | null = null;
  private configuredSimSeed: number;
  private commandLog: { tick: number; cmd: Command }[] = [];
  private activeSpin: ActiveSpin | null = null;
  private lastEvaluation: { addMult: number; xMult: number } | null = null;
  private readonly orbMeta = new Map<BodyId, OrbMeta>();
  private modifiers: PhysicsModifiers = { ...DEFAULT_MODIFIERS, gutterBounceChances: [] };

  constructor(options: GameCoreOptions = {}) {
    this.content = options.content ?? CONTENT_BUNDLE;
    this.useSeedShelf = options.seedShelf ?? true;
    const seed = options.seed ?? 'core-default-seed';
    this.configuredSimSeed = options.simSeed ?? hashString(seed);
    const state = createRunState(this.content, seed);
    this.machine = RunMachine.fromState(this.content, state);
    this.sim = createSimWorld(this.configuredSimSeed);
  }

  // ------------------------------------------------------------- GameCore

  dispatch(cmd: Command): CommandResult {
    const parsed = commandSchema.safeParse(cmd);
    if (!parsed.success) return { ok: false, error: 'INVALID_TARGET' };
    const command = parsed.data;
    const tick = this.machine.getState().tick;

    if (command.c === 'NewRun') {
      const result = this.machine.dispatch(command);
      if (!result.ok) return result;
      this.commandLog = [{ tick: 0, cmd: clone(command) }];
      this.bus.clear();
      this.resetWorld(command.seed);
      this.applyRunStart();
      this.flushEngineEvents();
      return result;
    }

    const result = this.machine.dispatch(command);
    this.commandLog.push({ tick, cmd: clone(command) });
    if (result.ok) this.afterCommand(command);
    this.flushDirectives();
    this.flushEngineEvents();
    return result;
  }

  tick(): GameEvent[] {
    // Engine scheduled actions for this tick (state.tick advances here).
    this.emitEvents(this.machine.tick());
    this.processScheduled();
    this.flushDirectives();
    this.flushEngineEvents();

    // The pusher runs only in gameplay phases; menus freeze the shelf.
    if (PUSHER_ACTIVE.has(this.machine.getState().phase)) {
      this.emitEvents(this.sim.step());
    }

    this.flushEngineEvents();
    this.maybeResolveSpin();
    this.flushEngineEvents();

    const counts = this.sim.counts();
    this.machine.setOrbsInFlight(counts.orbs + counts.queued);
    this.maybeConfigureFloor();

    return this.bus.drain();
  }

  getState(): Readonly<RunState> {
    return this.machine.getState();
  }

  getSimSnapshot(): SimSnapshot {
    return this.sim.snapshot();
  }

  stateHash(): string {
    return engineHash(this.machine.getState(), this.sim.hash());
  }

  save(): SaveFile {
    const save = createSaveFile(this.machine.getState(), this.sim);
    const lastResult = this.machine.getLastResult();
    if (lastResult !== null) save.lastResult = lastResult;
    return save;
  }

  load(save: SaveFile): CommandResult {
    const loaded = loadSave(save, this.sim);
    if (!loaded.ok) return { ok: false, error: 'INVALID_TARGET' };
    this.machine = RunMachine.fromState(this.content, loaded.state);
    const savedResult = loaded.save.lastResult ?? null;
    const bossRound = loaded.state.round === RULES.NORMAL_ROUNDS_PER_FLOOR + 1;
    // lastResult is outside the state hash; refuse a verdict that cannot
    // belong to this round rather than letting it choose the next phase.
    this.machine.setLastResult(
      savedResult !== null && (savedResult.kind === 'boss') === bossRound
        ? savedResult
        : null,
    );
    this.configuredFloorId = loaded.state.floorId;
    this.activeSpin = null;
    this.lastEvaluation = null;
    this.orbMeta.clear();
    this.commandLog = [];
    this.bus.clear();
    this.refreshModifiers();
    // A picker resumed from a save shows the same offer it was dealt.
    const offer = this.machine.pendingOfferEvent();
    if (offer !== null) this.emit(offer);
    return { ok: true };
  }

  getCommandLog(): { tick: number; cmd: Command }[] {
    return this.commandLog.map((entry) => ({ tick: entry.tick, cmd: clone(entry.cmd) }));
  }

  // ------------------------------------------------------------- extras

  get tickCount(): number {
    return this.machine.getState().tick;
  }

  get phase(): Phase {
    return this.machine.getState().phase;
  }

  getEvents(): GameEvent[] {
    return this.bus.drain();
  }

  subscribe(listener: (event: GameEvent) => void): () => void {
    return this.bus.subscribe(listener);
  }

  getPhysicsModifiers(): PhysicsModifiers {
    return {
      ...this.modifiers,
      gutterBounceChances: [...this.modifiers.gutterBounceChances],
    };
  }

  /** Run `ticks` deterministic ticks and return the concatenated stream. */
  runTicks(ticks: number): GameEvent[] {
    const out: GameEvent[] = [];
    for (let i = 0; i < ticks; i++) out.push(...this.tick());
    return out;
  }

  // ------------------------------------------------------------- lifecycle

  private resetWorld(seed: string): void {
    this.configuredSimSeed = hashString(seed);
    this.sim = createSimWorld(this.configuredSimSeed);
    this.configuredFloorId = null;
    this.activeSpin = null;
    this.lastEvaluation = null;
    this.orbMeta.clear();
    this.configureFloor(true, this.useSeedShelf);
  }

  private currentFloor(): FloorDef {
    return this.machine.currentFloor();
  }

  private maybeConfigureFloor(): void {
    const state = this.machine.getState();
    if (state.floorId === this.configuredFloorId) return;
    if (state.phase !== 'PREP') return;
    this.configureFloor(true, this.useSeedShelf);
  }

  private configureFloor(resetPegs: boolean, seedShelf: boolean): void {
    const floor = this.currentFloor();
    this.refreshModifiers();
    this.sim.configure(floor.physics, this.modifiers, resetPegs);
    this.configuredFloorId = floor.id;
    if (seedShelf) {
      this.sim.applyDirective({ t: 'clearShelf' });
      this.sim.applyDirective({ t: 'seedShelf', tokens: this.shelfSeedTokens() });
      // D-05: a new floor starts from a fresh shelf; forget the old tokens' cash.
      const tokenCash = this.machine.getState().tokenCash;
      for (const event of this.sim.drainEvents()) {
        if (event.t === 'TokenRemoved') delete tokenCash[event.tokenId];
      }
    }
  }

  private shelfSeedTokens(): TokenTemplate[] {
    const symbols = contentSymbols(this.content);
    const source = symbols.find((symbol) => symbol.id === 'cherry') ?? symbols[0];
    const template: TokenTemplate =
      source === undefined
        ? SCRAP_TEMPLATE
        : {
            symbolId: source.id,
            skin: source.token.skin,
            radius: source.token.radius,
            mass: source.token.mass,
            slide: source.token.slide,
            count: 1,
            stack: source.token.stack,
            weldOnLand: source.token.weldOnLand,
            magnetic: source.token.magnetic,
            seismic: source.token.seismic,
            resistSuction: false,
          };
    const tokens: TokenTemplate[] = [];
    for (let i = 0; i < RULES.SHELF_SEED_TOKENS; i++) tokens.push({ ...template });
    return tokens;
  }

  private applyRunStart(): void {
    const state = this.machine.getState();
    const effects = dispatchHook(
      'onRunStart',
      this.itemHandlerRefs(),
      this.effectContext(),
      { seed: state.seed } as never,
    );
    this.applyResolution(effects);
    this.refreshModifiers();
  }

  // --------------------------------------------------------------- commands

  private afterCommand(command: Command): void {
    const state = this.machine.getState();
    if (command.c === 'Spin') {
      const lastStop = REEL_STOP_TICK(Math.max(0, state.grid.cols - 1));
      this.activeSpin = {
        startTick: state.tick,
        evalTick: state.tick + lastStop + EVAL_DELAY_TICKS,
        stopsEmitted: 0,
        evaluated: false,
        orbPlan: [],
        addMult: 1,
        xMult: 1,
        chips: 0,
        equity: 0,
        launchQueue: [],
        launchCursor: 0,
        tumbleQueue: [],
        tumbleCursor: 0,
        pegHits: 0,
        nextSpinBaseline: { xBonus: {}, addMult: 0, bonusOrbs: 0 },
      };
      this.handleSpinStart();
    }
    for (const drinkId of this.machine.drainInstantDrinks()) this.applyInstantDrink(drinkId);
    for (const bonus of this.machine.drainGlyphBonuses()) this.spawnGlyphBonus(bonus);
    this.refreshModifiers();
    this.flushDirectives();
  }

  /** D-08: an instant drink (Lubricant Oil Shot) fires its effects immediately. */
  private applyInstantDrink(drinkId: string): void {
    const state = this.machine.getState();
    const refs = drinkRefs(currentItems(this.content), [drinkId]);
    const payload = {
      tick: state.tick,
      grid: state.grid.visible.map((column) => column.slice()),
      visible: state.grid.visible.map((column) => column.slice()),
    };
    this.applyResolution(dispatchHook('onSpinStart', refs, this.effectContext(), payload));
  }

  /**
   * SPEC 2.7 reel glyphs drop bonus tokens of their symbol on the shelf. Each
   * is worth one base orb of that symbol (chips x cashPerChip x stack).
   */
  private spawnGlyphBonus(bonus: GlyphBonus): void {
    const symbol = contentSymbols(this.content).find((candidate) => candidate.id === bonus.symbolId);
    if (symbol === undefined || bonus.count <= 0) return;
    const stack = Math.max(1, symbol.token.stack);
    const template: TokenTemplate = {
      symbolId: symbol.id,
      skin: symbol.token.skin,
      radius: symbol.token.radius,
      mass: symbol.token.mass,
      slide: symbol.token.slide,
      count: bonus.count,
      stack,
      weldOnLand: symbol.token.weldOnLand,
      magnetic: symbol.token.magnetic,
      seismic: symbol.token.seismic,
      resistSuction: false,
    };
    const each = symbol.slot.chips * this.content.balance.cashPerChip * stack;
    this.applySpawns([{ template, cash: each * bonus.count }]);
  }

  private handleSpinStart(): void {
    const state = this.machine.getState();
    // RunMachine draws the reel before this hook. Keep the previous visible
    // symbols for cells that were already frozen so a boss freeze actually
    // survives the next draw instead of becoming a cosmetic badge.
    const previousVisible = this.machine.getPreSpinVisible();
    const frozenBefore = new Set(
      state.grid.frozen.map((entry) => `${entry.cell[0]}:${entry.cell[1]}`),
    );
    this.machine.clearPreSpinVisible();
    const payload = {
      tick: state.tick,
      spinIndex: Math.max(0, state.stats.spins - 1),
      grid: state.grid.visible.map((column) => column.slice()),
      visible: state.grid.visible.map((column) => column.slice()),
      frozenCells: state.grid.frozen.map((entry) => [entry.cell[0], entry.cell[1]] as Cell),
    };
    this.applyResolution(
      dispatchHook('onSpinStart', this.itemHandlerRefs(), this.effectContext(), payload),
    );

    if (state.round !== RULES.NORMAL_ROUNDS_PER_FLOOR + 1 || state.boss === null) return;

    const definition = this.currentBoss();
    const plan = planBossSpin(definition, {
      seed: state.seed,
      spin: state.boss.spin,
      floorScale: this.currentFloor().quotaScale,
      bossScore: state.boss.score,
      cols: state.grid.cols,
      rows: state.grid.rows,
      frozen: state.grid.frozen,
    });

    state.grid.frozen = plan.frozen.map((entry) => ({
      cell: [entry.cell[0], entry.cell[1]] as Cell,
      spins: entry.spins,
    }));
    if (previousVisible !== null) {
      for (const entry of state.grid.frozen) {
        const key = `${entry.cell[0]}:${entry.cell[1]}`;
        if (!frozenBefore.has(key)) continue;
        const previous = previousVisible[entry.cell[0]]?.[entry.cell[1]];
        if (previous !== undefined && state.grid.visible[entry.cell[0]] !== undefined) {
          state.grid.visible[entry.cell[0]]![entry.cell[1]] = previous;
        }
      }
    }
    if (plan.addedFrozen.length > 0) {
      this.emit({ t: 'CellsFrozen', cells: plan.addedFrozen.map((cell) => [...cell] as Cell), spins: 2 });
    }
    for (const notice of plan.sabotage) {
      this.emit({ t: 'BossSabotage', kind: notice.kind });
    }
    for (const directive of plan.directives) this.sim.applyDirective({ ...directive });
    if (plan.scoreDelta !== 0) this.machine.recordBossScore(plan.scoreDelta);
    this.refreshModifiers();
  }

  /** The boss of the current floor. */
  private currentBoss(): BossDefinition {
    const state = this.machine.getState();
    const bosses = contentBosses(this.content);
    return selectBossForRun(
      { floors: this.content.floors, ...(bosses === undefined ? {} : { bosses }) },
      { floorId: state.floorId, seed: state.seed },
    );
  }

  /**
   * Boss suction (R-BOS-02) is part of the boss round itself, so it is derived
   * from run state: active from the first PREP of the duel and after a resume.
   */
  private bossSuctionNow(): number {
    const state = this.machine.getState();
    if (state.round !== RULES.NORMAL_ROUNDS_PER_FLOOR + 1 || state.boss === null) return 0;
    let suction = 0;
    for (const entry of this.currentBoss().sabotage) {
      if (entry.kind === 'suction') suction += entry.amount;
    }
    return suction;
  }

  // --------------------------------------------------------------- scheduling

  private processScheduled(): void {
    const spin = this.activeSpin;
    if (spin === null) return;
    const state = this.machine.getState();
    const cols = state.grid.cols;

    for (let col = spin.stopsEmitted; col < cols; col++) {
      const at = spin.startTick + REEL_STOP_TICK(col);
      if (state.tick < at) break;
      this.emit({ t: 'ReelStopped', col, symbols: [...(state.grid.visible[col] ?? [])] });
      spin.stopsEmitted = col + 1;
    }

    if (!spin.evaluated && state.tick >= spin.evalTick) this.evaluateCurrentSpin(spin);

    while (
      spin.tumbleCursor < spin.tumbleQueue.length &&
      state.tick >= spin.tumbleQueue[spin.tumbleCursor]!.atTick
    ) {
      const step = spin.tumbleQueue[spin.tumbleCursor]!;
      spin.tumbleCursor += 1;
      state.grid.visible = step.gridAfter.map((column) => column.slice());
      this.emit({
        t: 'TumbleStep',
        cleared: step.cleared.map((cell) => [cell[0], cell[1]] as Cell),
        gridAfter: step.gridAfter.map((column) => column.slice()),
      });
    }

    while (
      spin.launchCursor < spin.launchQueue.length &&
      state.tick >= spin.launchQueue[spin.launchCursor]!.atTick
    ) {
      const launch = spin.launchQueue[spin.launchCursor]!;
      spin.launchCursor += 1;
      this.launchPlanOrb(launch.entry, launch.index);
    }
  }

  private evaluateCurrentSpin(spin: ActiveSpin): void {
    const state = this.machine.getState();
    const grid = state.grid.visible.map((column) => column.slice());
    const frozenCells = state.grid.frozen.map((entry) => [entry.cell[0], entry.cell[1]] as Cell);

    // D-08: a drink is drunk in PREP for the coming spin, so its "next spin"
    // bonuses (Martini +1 Mult, Absinthe +1 X, Green Fairy x1.5 X) apply to
    // this evaluation. Fold them in before scoring reads state.nextSpin.
    const drink = this.applyDrinkEvaluation(grid, frozenCells);

    const scored = scoreGrid(this.content, state, grid, (col) => this.machine.drawRefill(col));
    const base = scored.result;
    // Wins on the drawn grid; tumble wins live on later grids.
    const drawnWins = scored.tumble === null ? base.wins : scored.tumble.initialWins;
    this.drainIdleSkulls(grid, drawnWins);

    const consumed = {
      xBonus: { ...state.nextSpin.xBonus },
      addMult: state.nextSpin.addMult,
    };
    const symbolRefs = contentSymbols(this.content).flatMap((symbol) => symbol.effects);
    const refs = [...symbolRefs, ...trinketRefs(currentItems(this.content), state.trinkets)];
    const evaluated = dispatchHook(
      'onSpinEvaluated',
      refs,
      this.effectContext(),
      {
        tick: state.tick,
        grid,
        visible: grid,
        wins: drawnWins,
        frozenCells,
      } as never,
    );
    const evaluatedEffects = applyEffects(evaluated, { nextSpin: state.nextSpin });
    this.commitNextSpin(evaluatedEffects);
    // Next-spin bonuses earned *by* this evaluation (trinkets) carry to the
    // following spin; everything already in nextSpin was consumed above.
    const earnedX: Record<string, number> = {};
    for (const key of Object.keys(evaluatedEffects.nextSpinX)) {
      const delta = (evaluatedEffects.nextSpinX[key] ?? 0) - (consumed.xBonus[key] ?? 0);
      if (delta > 1e-9) earnedX[key] = delta;
    }
    const earnedAddMult = Math.max(0, evaluatedEffects.nextSpinAddMult - consumed.addMult);

    let addMult = base.addMult + evaluatedEffects.addMult + drink.addMult;
    let xMult = base.xMult * evaluatedEffects.xMult * drink.xMult;
    const orbPlan = base.orbPlan.map((entry) => ({
      cell: entry.cell === null ? null : ([entry.cell[0], entry.cell[1]] as Cell),
      symbolId: entry.symbolId,
      chips: entry.chips,
    }));

    for (const entry of orbPlan) {
      if (entry.cell === null) continue;
      const cellEffects = dispatchHook(
        'onCellScored',
        this.itemHandlerRefs(),
        this.effectContext(),
        {
          tick: state.tick,
          grid,
          cell: entry.cell,
          symbolId: entry.symbolId,
          chips: entry.chips,
        } as never,
      );
      if (cellEffects.length === 0) continue;
      const resolved = applyEffects(cellEffects, { nextSpin: state.nextSpin });
      entry.chips += resolved.chips;
      addMult += resolved.addMult;
      xMult *= resolved.xMult;
      this.applyResolvedSideEffects(resolved);
    }

    this.applyResolvedSideEffects(evaluatedEffects);

    // Fever/drink bonus orbs are real orbs and launch after the plan.
    const bonus = this.machine.getState().nextSpin.bonusOrbs;
    if (bonus > 0) {
      const chips = Math.round(cheapestChips(contentSymbols(this.content)) * RULES.SCRAP_EQUITY);
      for (let i = 0; i < bonus; i++) {
        orbPlan.push({ cell: null, symbolId: 'scrap', chips });
      }
    }

    let chips = 0;
    for (const entry of orbPlan) chips += entry.chips;
    const cashPerChip = this.content.balance.cashPerChip;
    const equity = chips * addMult * xMult * cashPerChip;

    const stats = this.machine.getState().stats;
    if (Number.isFinite(equity) && equity > stats.bestSpinEquity) stats.bestSpinEquity = equity;

    spin.orbPlan = orbPlan;
    spin.addMult = addMult;
    spin.xMult = xMult;
    spin.chips = chips;
    spin.equity = equity;
    spin.evaluated = true;
    const after = this.machine.getState().nextSpin;
    const baselineX: Record<string, number> = {};
    for (const key of Object.keys(after.xBonus)) baselineX[key] = (after.xBonus[key] ?? 0) - (earnedX[key] ?? 0);
    spin.nextSpinBaseline = {
      xBonus: baselineX,
      addMult: after.addMult - earnedAddMult,
      bonusOrbs: after.bonusOrbs,
    };
    this.lastEvaluation = { addMult, xMult };

    this.emit({
      t: 'SpinEvaluated',
      grid,
      wins: base.wins,
      chips,
      addMult,
      xMult,
      equity,
      orbPlan: orbPlan.map((entry) => ({
        cell: entry.cell === null ? null : ([entry.cell[0], entry.cell[1]] as Cell),
        symbolId: entry.symbolId,
        chips: entry.chips,
      })),
    });

    this.machine.beginResolving();
    this.flushEngineEvents();

    // C-6: each tumble step holds the orb plan back by ANIM_TICKS.tumbleStep.
    const steps = scored.tumble?.steps ?? [];
    spin.tumbleQueue = steps.map((step, index) => ({
      atTick: spin.evalTick + ORB_LAUNCH_DELAY_TICKS + index * ANIM_TICKS.tumbleStep,
      cleared: step.cleared.map((cell) => [cell[0], cell[1]] as Cell),
      gridAfter: step.gridAfter.map((column) => column.slice()),
    }));
    spin.tumbleCursor = 0;
    const firstLaunch =
      spin.evalTick + ORB_LAUNCH_DELAY_TICKS + steps.length * ANIM_TICKS.tumbleStep;
    spin.launchQueue = orbPlan.map((entry, index) => ({
      atTick: firstLaunch + index * ORB_LAUNCH_INTERVAL_TICKS,
      entry,
      index: index + 1,
    }));
  }

  /**
   * Dispatch the active drink's onSpinEvaluated effects for the spin it was
   * drunk for. Next-spin parts land in state.nextSpin (consumed by this
   * scoring pass); direct Mult/X parts are returned for the caller to fold in.
   */
  private applyDrinkEvaluation(grid: SymbolId[][], frozenCells: Cell[]): { addMult: number; xMult: number } {
    const state = this.machine.getState();
    if (state.activeDrink === null) return { addMult: 0, xMult: 1 };
    const refs = drinkRefs(currentItems(this.content), [state.activeDrink]);
    const effects = dispatchHook('onSpinEvaluated', refs, this.effectContext(), {
      tick: state.tick,
      grid,
      visible: grid,
      frozenCells,
    } as never);
    if (effects.length === 0) return { addMult: 0, xMult: 1 };
    const resolved = applyEffects(effects, { nextSpin: state.nextSpin, modifiers: this.modifiers });
    this.commitNextSpin(resolved);
    this.applyResolvedSideEffects(resolved);
    return { addMult: resolved.addMult, xMult: resolved.xMult };
  }

  /**
   * SPEC 2.6 Magnet Skull: each visible Skull that is not part of a winning
   * evaluation drains its `drainIfIdle` (25) from the bankroll. Boss-frozen
   * cells are out of play and do not drain.
   */
  private drainIdleSkulls(grid: SymbolId[][], wins: readonly WinEval[]): void {
    const state = this.machine.getState();
    const scoring = new Set<string>();
    for (const win of wins) for (const [col, row] of win.cells) scoring.add(`${col},${row}`);
    const frozen = new Set(
      state.grid.frozen.filter((entry) => entry.spins > 0).map((entry) => `${entry.cell[0]},${entry.cell[1]}`),
    );
    const symbols = contentSymbols(this.content);
    const cells: Cell[] = [];
    let total = 0;
    for (let col = 0; col < grid.length; col++) {
      const column = grid[col]!;
      for (let row = 0; row < column.length; row++) {
        const key = `${col},${row}`;
        if (scoring.has(key) || frozen.has(key)) continue;
        const symbol = symbols.find((candidate) => candidate.id === column[row]);
        const drain = symbol?.slot.drainIfIdle ?? 0;
        if (drain <= 0) continue;
        cells.push([col, row]);
        total += drain;
      }
    }
    if (total <= 0) return;
    this.emit({ t: 'IdleDrain', cells, total });
    this.adjustBankroll(-total, 'drain');
  }

  private launchPlanOrb(entry: OrbPlanEntry, index: number): void {
    const state = this.machine.getState();
    const symbol = contentSymbols(this.content).find((candidate) => candidate.id === entry.symbolId);
    const token: TokenTemplate =
      symbol === undefined
        ? { ...SCRAP_TEMPLATE, symbolId: entry.symbolId }
        : {
            symbolId: symbol.id,
            skin: symbol.token.skin,
            radius: symbol.token.radius,
            mass: symbol.token.mass,
            slide: symbol.token.slide,
            count: symbol.token.count,
            stack: symbol.token.stack,
            weldOnLand: symbol.token.weldOnLand,
            magnetic: symbol.token.magnetic,
            seismic: symbol.token.seismic,
            resistSuction: false,
          };
    const x = entry.cell === null
      ? BOARD.W / 2
      : BOARD.W * ((entry.cell[0] + 0.5) / Math.max(1, state.grid.cols));

    let spec: OrbSpec = {
      x,
      symbolId: entry.symbolId,
      mass: symbol?.orb.mass ?? 1,
      elasticity: symbol?.orb.elasticity ?? 0.8,
      canSplit: symbol?.orb.canSplit ?? false,
      splitOnFirstPeg: symbol?.orb.splitOnFirstPeg ?? false,
      magnet: symbol?.orb.magnet ?? false,
      accelPerHit: symbol?.orb.accelPerHit ?? 0,
      chainGold: symbol?.orb.chainGold ?? false,
      upgradesPegs: symbol?.orb.upgradesPegs ?? false,
      token,
    };

    const coin = findCoin(currentItems(this.content), state.loadedCoin);
    if (coin !== undefined) spec = applyCoinToOrbSpec(coin, spec);

    const launchEffects = dispatchHook(
      'onOrbLaunch',
      this.itemHandlerRefs(),
      this.effectContext(),
      {
        tick: state.tick,
        launchIndex: index,
        orbIndex: index,
        orbLaunchCount: index,
        symbolId: entry.symbolId,
        chips: entry.chips,
      } as never,
    );
    const resolved = applyEffects(launchEffects, {
      nextSpin: state.nextSpin,
      modifiers: this.modifiers,
    });
    if (resolved.flags.canSplit === true) spec.canSplit = true;
    this.commitNextSpin(resolved);
    this.applyResolvedSideEffects(resolved);

    const orbId = this.sim.launchOrb(spec);
    state.orbChips[orbId] = entry.chips;
    this.orbMeta.set(orbId, { count: spec.token.count, stack: spec.token.stack, symbolId: entry.symbolId });
    this.emit({ t: 'OrbValued', orbId, chips: entry.chips });
  }

  private maybeResolveSpin(): void {
    const spin = this.activeSpin;
    if (spin === null || !spin.evaluated) return;
    if (spin.launchCursor < spin.launchQueue.length) return;
    const counts = this.sim.counts();
    if (counts.orbs > 0 || counts.queued > 0) return;
    const phase = this.machine.getState().phase;
    if (phase !== 'SPINNING' && phase !== 'RESOLVING') return;

    const carry = this.nextSpinCarry(spin);
    this.machine.spinResolved();
    const state = this.machine.getState();
    state.nextSpin = carry;
    this.flushEngineEvents();
    this.activeSpin = null;
    this.machine.setOrbsInFlight(0);
    this.refreshModifiers();
  }


  /**
   * Effects fired while orbs resolve (gutter collectors, lip capacitors) are
   * earned for the *next* spin. `spinResolved` clears the carry used by the
   * current evaluation, so preserve only what changed after evaluation.
   */
  private nextSpinCarry(spin: ActiveSpin): RunState['nextSpin'] {
    const current = this.machine.getState().nextSpin;
    const baseline = spin.nextSpinBaseline;
    const xBonus: Record<string, number> = {};
    const keys = new Set([...Object.keys(current.xBonus), ...Object.keys(baseline.xBonus)]);
    for (const key of keys) {
      const delta = (current.xBonus[key] ?? 0) - (baseline.xBonus[key] ?? 0);
      if (delta > 1e-9) xBonus[key] = Math.round(delta * 1e9) / 1e9;
    }
    return {
      xBonus,
      addMult: Math.max(0, Math.round((current.addMult - baseline.addMult) * 1e9) / 1e9),
      bonusOrbs: Math.max(0, Math.round(current.bonusOrbs - baseline.bonusOrbs)),
    };
  }

  // --------------------------------------------------------------- physics

  private handlePhysicsEvent(event: PhysicsEvent): void {
    switch (event.t) {
      case 'OrbLaunched':
        this.emit(event);
        return;
      case 'PegHit':
        this.handlePegHit(event);
        return;
      case 'OrbSplit':
        this.handleOrbSplit(event);
        return;
      case 'ChuteExit':
        this.handleChuteExit(event);
        return;
      case 'TokenSpawned':
        this.handleTokenSpawn(event);
        return;
      case 'TokenMerged':
        this.emit(event);
        return;
      case 'LipDrop':
        this.handleLipDrop(event);
        return;
      case 'GutterLoss':
        this.handleGutterLoss(event);
        return;
      case 'DozerFullExtension':
        this.handleDozerFullExtension(event);
        return;
      case 'TokenRemoved':
        delete this.machine.getState().tokenCash[event.tokenId];
        this.orbMeta.delete(event.tokenId);
        this.emit(event);
        return;
      case 'SurgeStarted':
        this.emit(event);
        return;
      case 'SurgeEnded':
      case 'GutterBounce':
      case 'PegUpgraded':
      case 'OrbForcedDown':
      case 'WeldFormed':
        this.emit(event);
        return;
    }
  }

  private handlePegHit(event: Extract<PhysicsEvent, { t: 'PegHit' }>): void {
    const state = this.machine.getState();
    const floor = this.currentFloor();
    const base = floor.pegChips[event.kind];
    // Item hooks plus the hitting orb's own symbol behaviour (Uranium: +15
    // chips to every other orb in flight, SPEC 2.6).
    const orbSymbol = this.orbMeta.get(event.orbId)?.symbolId;
    const symbolRefs =
      orbSymbol === undefined
        ? []
        : symbolEffectRefs(
            orbSymbol,
            'onPegHit',
            contentSymbols(this.content).find((candidate) => candidate.id === orbSymbol)?.effects,
          );
    const effects = dispatchHook(
      'onPegHit',
      [...this.itemHandlerRefs(), ...symbolRefs],
      this.effectContext(),
      {
        tick: state.tick,
        orbId: event.orbId,
        pegId: event.pegId,
        kind: event.kind,
        hitIndex: event.hitIndex,
        pegHitCount: this.activeSpin === null ? event.hitIndex : ++this.activeSpin.pegHits,
        chained: event.chained,
        chips: state.orbChips[event.orbId] ?? 0,
      } as never,
    );
    const resolved = applyEffects(effects, {
      nextSpin: state.nextSpin,
      modifiers: this.modifiers,
    });
    this.commitNextSpin(resolved);
    this.applyResolvedSideEffects(resolved);

    const target = state.orbChips[event.orbId];
    if (target !== undefined) {
      state.orbChips[event.orbId] = target + base + resolved.chips;
      this.emit({ t: 'OrbValued', orbId: event.orbId, chips: state.orbChips[event.orbId]! });
    }
    if (resolved.allOrbChips !== 0) {
      for (const key of Object.keys(state.orbChips)) {
        const id = Number(key);
        if (id === event.orbId) continue;
        state.orbChips[id] = (state.orbChips[id] ?? 0) + resolved.allOrbChips;
        this.emit({ t: 'OrbValued', orbId: id, chips: state.orbChips[id]! });
      }
    }
    this.emit(event);
  }

  private handleOrbSplit(event: Extract<PhysicsEvent, { t: 'OrbSplit' }>): void {
    const state = this.machine.getState();
    const parent = state.orbChips[event.parentId] ?? 0;
    state.orbChips[event.childId] = parent;
    const meta = this.orbMeta.get(event.parentId);
    if (meta !== undefined) this.orbMeta.set(event.childId, { ...meta });
    this.emit({ t: 'OrbValued', orbId: event.childId, chips: parent });
    this.emit(event);
  }


  private handleTokenSpawn(event: Extract<PhysicsEvent, { t: 'TokenSpawned' }>): void {
    const state = this.machine.getState();
    const effects = dispatchHook(
      'onTokenSpawn',
      this.itemHandlerRefs(),
      this.effectContext(),
      {
        tick: state.tick,
        tokenId: event.tokenId,
        symbolId: event.symbolId,
        x: event.x,
        y: event.y,
      } as never,
    );
    if (effects.length > 0) this.applyResolution(effects);
    this.emit(event);
  }

  private handleChuteExit(event: Extract<PhysicsEvent, { t: 'ChuteExit' }>): void {
    const state = this.machine.getState();
    const floor = this.currentFloor();
    const evaluation = this.lastEvaluation ?? {
      addMult: this.activeSpin?.addMult ?? 1,
      xMult: this.activeSpin?.xMult ?? 1,
    };
    const chips = state.orbChips[event.orbId] ?? 0;
    const chuteMult = floor.chuteMults[event.chute] ?? 1;
    const coin = findCoin(currentItems(this.content), state.loadedCoin);
    const payoutMul = coin?.payoutMul ?? 1;
    const baseCash = Math.round(
      chips *
        evaluation.addMult *
        evaluation.xMult *
        chuteMult *
        payoutMul *
        this.content.balance.cashPerChip,
    );

    const effects = dispatchHook(
      'onChuteExit',
      this.itemHandlerRefs(),
      this.effectContext(),
      {
        tick: state.tick,
        orbId: event.orbId,
        symbolId: event.symbolId,
        chute: event.chute,
        cash: baseCash,
      } as never,
    );
    const resolved = applyEffects(effects, {
      nextSpin: state.nextSpin,
      modifiers: this.modifiers,
    });
    this.commitNextSpin(resolved);
    this.applyResolvedSideEffects(resolved);

    const meta = this.orbMeta.get(event.orbId) ?? { count: 1, stack: 1, symbolId: event.symbolId };
    const stacks = Math.max(1, meta.stack);
    const denom = Math.max(1, event.tokenIds.length + event.mergedInto.length || meta.count);
    // Multipliers scale the orb's cash (split across micro-medals, tripled for
    // a bullion stack); flat token bonuses (Gold Peg Alchemist) pay per token.
    const perToken = Math.max(
      0,
      (baseCash * resolved.tokenCashMul * stacks) / denom + resolved.tokenCashAdd,
    );

    for (const tokenId of event.tokenIds) {
      state.tokenCash[tokenId] = perToken;
      this.emit({ t: 'TokenValued', tokenId, cash: perToken });
    }
    for (const tokenId of event.mergedInto) {
      state.tokenCash[tokenId] = (state.tokenCash[tokenId] ?? 0) + perToken;
      this.emit({ t: 'TokenValued', tokenId, cash: state.tokenCash[tokenId]! });
    }

    delete state.orbChips[event.orbId];
    this.orbMeta.delete(event.orbId);
    this.emit(event);
  }

  private handleLipDrop(event: Extract<PhysicsEvent, { t: 'LipDrop' }>): void {
    const state = this.machine.getState();
    const floor = this.currentFloor();
    const raw = state.tokenCash[event.tokenId] ?? 0;
    const effects = dispatchHook(
      'onLipDrop',
      this.itemHandlerRefs(),
      this.effectContext(),
      {
        tick: state.tick,
        tokenId: event.tokenId,
        symbolId: event.symbolId,
        cash: raw,
      } as never,
    );
    const resolved = applyEffects(effects, {
      nextSpin: state.nextSpin,
      modifiers: this.modifiers,
    });
    this.commitNextSpin(resolved);
    this.applyResolvedSideEffects(resolved, false);

    const payout = Math.max(0, Math.round(raw * floor.lipMult * resolved.lipPayoutMul) + resolved.cash);
    delete state.tokenCash[event.tokenId];
    this.orbMeta.delete(event.tokenId);
    this.machine.bank(payout);
    this.emit({ t: 'CashBanked', tokenId: event.tokenId, cash: payout, x: event.x });
    this.emit(event);
  }

  private handleGutterLoss(event: Extract<PhysicsEvent, { t: 'GutterLoss' }>): void {
    const state = this.machine.getState();
    const raw = state.tokenCash[event.tokenId] ?? 0;
    const effects = dispatchHook(
      'onGutterLoss',
      this.itemHandlerRefs(),
      this.effectContext(),
      {
        tick: state.tick,
        tokenId: event.tokenId,
        symbolId: event.symbolId,
        cash: raw,
      } as never,
    );
    const resolved = applyEffects(effects, {
      nextSpin: state.nextSpin,
      modifiers: this.modifiers,
    });
    this.commitNextSpin(resolved);
    this.applyResolvedSideEffects(resolved, false);

    delete state.tokenCash[event.tokenId];
    this.orbMeta.delete(event.tokenId);
    state.stats.gutterLosses += 1;

    if (event.magnetic) {
      const symbol = contentSymbols(this.content).find((candidate) => candidate.id === event.symbolId);
      const drain = symbol?.token.gutterDrain ?? 50;
      if (drain > 0) this.adjustBankroll(-drain, 'drain');
    }
    this.emit(event);
  }

  private handleDozerFullExtension(event: Extract<PhysicsEvent, { t: 'DozerFullExtension' }>): void {
    const state = this.machine.getState();
    const effects = dispatchHook(
      'onDozerFullExtension',
      this.itemHandlerRefs(),
      this.effectContext(),
      {
        tick: state.tick,
        count: event.count,
        pegHits: event.count,
      } as never,
    );
    this.applyResolution(effects);

    if (state.round === RULES.NORMAL_ROUNDS_PER_FLOOR + 1 && state.boss !== null) {
      const plan = planDozerExtension(this.currentBoss(), event.count);
      for (const directive of plan.directives) this.sim.applyDirective({ ...directive });
      for (const notice of plan.sabotage) this.emit({ t: 'BossSabotage', kind: notice.kind });
    }
    this.emit(event);
  }

  // --------------------------------------------------------------- effects

  private itemHandlerRefs() {
    const state = this.machine.getState();
    const active = state.activeDrink === null ? [] : [state.activeDrink];
    return [
      ...trinketRefs(currentItems(this.content), state.trinkets),
      ...drinkRefs(currentItems(this.content), active),
    ];
  }

  private effectContext(): EffectContext {
    const state = this.machine.getState();
    return {
      tick: state.tick,
      spinIndex: Math.max(0, state.stats.spins - 1),
      spinCount: state.stats.spins,
      nextSpin: {
        xBonus: { ...state.nextSpin.xBonus },
        addMult: state.nextSpin.addMult,
        bonusOrbs: state.nextSpin.bonusOrbs,
      },
      grid: state.grid.visible,
      visible: state.grid.visible,
      visibleSymbols: state.grid.visible.flatMap((column) => column),
      frozenCells: state.grid.frozen.map((entry) => entry.cell),
      floorScale: this.currentFloor().quotaScale,
      bossSpin: state.boss?.spin,
    };
  }

  private applyResolution(effects: readonly Effect[]): EffectResolution {
    const state = this.machine.getState();
    const resolved = applyEffects(effects, {
      nextSpin: state.nextSpin,
      modifiers: this.modifiers,
    });
    this.commitNextSpin(resolved);
    this.applyResolvedSideEffects(resolved);
    return resolved;
  }

  private applyResolvedSideEffects(resolved: EffectResolution, includeCash = true): void {
    this.applySpawns(resolved.spawns);
    for (const directive of resolved.directives) this.sim.applyDirective({ ...directive });
    if (includeCash && resolved.cash !== 0) this.adjustBankroll(resolved.cash, 'bonus');
    if (resolved.triggerFever) this.triggerFever();
  }

  private applySpawns(spawns: EffectResolution['spawns']): void {
    for (const spawn of spawns) {
      const spec: TokenSpec = {
        ...spawn.template,
        x: BOARD.W / 2,
        y: BOARD.TOKEN_SPAWN_Y,
      };
      const state = this.machine.getState();
      const ids = this.sim.spawnToken(spec);
      const per = spawn.cash / Math.max(1, Math.floor(spawn.template.count));
      for (const tokenId of ids) {
        state.tokenCash[tokenId] = per;
        this.emit({ t: 'TokenValued', tokenId, cash: per });
      }
      // At the 150-token cap a spawn merges into the nearest token (R-PSH-03);
      // that token absorbs the cash instead of losing it.
      const drained = this.sim.drainEvents();
      if (per !== 0) {
        for (const event of drained) {
          if (event.t !== 'TokenMerged') continue;
          state.tokenCash[event.intoId] = (state.tokenCash[event.intoId] ?? 0) + per;
          this.emit({ t: 'TokenValued', tokenId: event.intoId, cash: state.tokenCash[event.intoId]! });
        }
      }
      this.emitEvents(drained);
    }
  }

  private commitNextSpin(resolved: EffectResolution): void {
    const state = this.machine.getState();
    state.nextSpin = {
      xBonus: { ...resolved.nextSpinX },
      addMult: resolved.nextSpinAddMult,
      bonusOrbs: resolved.bonusOrbs,
    };
  }

  private triggerFever(): void {
    const state = this.machine.getState();
    state.fever = RULES.FEVER_RESET;
    state.nextSpin.bonusOrbs += RULES.FEVER_ORBS;
    this.sim.applyDirective({ t: 'surge' });
    this.emit({ t: 'FeverTriggered' });
    this.emit({ t: 'FeverChanged', value: state.fever });
  }

  private adjustBankroll(delta: number, reason: 'bonus' | 'drain'): void {
    if (delta === 0 || !Number.isFinite(delta)) return;
    const state = this.machine.getState();
    state.bankroll = Math.max(0, state.bankroll + delta);
    this.emit({
      t: 'BankrollChanged',
      delta,
      total: state.bankroll,
      reason,
    });
  }

  private refreshModifiers(): void {
    const state = this.machine.getState();
    const ctx = this.effectContext();
    let bag = applyModifierEffects(
      dispatchHook('physicsModifiers', trinketRefs(currentItems(this.content), state.trinkets), ctx, {}),
      {},
    );
    const drinkIds = state.activeDrink === null ? [] : [state.activeDrink];
    if (drinkIds.length > 0) {
      bag = applyModifierEffects(
        dispatchHook('physicsModifiers', drinkRefs(currentItems(this.content), drinkIds), ctx, {}),
        bag,
      );
    }
    const suction = this.bossSuctionNow();
    if (suction !== 0) bag.suction += suction;
    this.modifiers = bag;
    this.sim.setModifiers(bag);
  }


  private handleRoundEnd(event: Extract<EngineEvent, { t: 'RoundSettled' }>): void {
    const state = this.machine.getState();
    const effects = dispatchHook(
      'onRoundEnd',
      this.itemHandlerRefs(),
      this.effectContext(),
      { tick: state.tick, result: event.result } as never,
    );
    if (effects.length > 0) this.applyResolution(effects);
  }

  private handleShopEnter(): void {
    const state = this.machine.getState();
    const effects = dispatchHook(
      'onShopEnter',
      this.itemHandlerRefs(),
      this.effectContext(),
      {
        tick: state.tick,
        visibleSymbols: state.grid.visible.flatMap((column) => column),
      } as never,
    );
    if (effects.length > 0) this.applyResolution(effects);
  }

  // --------------------------------------------------------------- plumbing

  private flushDirectives(): void {
    for (const directive of this.machine.drainDirectives()) {
      this.sim.applyDirective({ ...directive });
    }
  }

  private flushEngineEvents(): void {
    this.emitEvents(this.machine.drainEvents());
  }

  private emitEvents(events: readonly (EngineEvent | PhysicsEvent)[]): void {
    const state = this.machine.getState();
    for (const event of events) {
      if (event.t === 'TokenSpawned' || event.t === 'LipDrop' || event.t === 'GutterLoss' ||
          event.t === 'PegHit' || event.t === 'OrbSplit' || event.t === 'ChuteExit' ||
          event.t === 'DozerFullExtension' || event.t === 'TokenMerged' ||
          event.t === 'TokenRemoved' || event.t === 'OrbLaunched' ||
          event.t === 'SurgeStarted' || event.t === 'SurgeEnded' ||
          event.t === 'GutterBounce' || event.t === 'PegUpgraded' ||
          event.t === 'OrbForcedDown' || event.t === 'WeldFormed') {
        this.handlePhysicsEvent(event as PhysicsEvent);
      } else {
        const engineEvent = event as EngineEvent;
        this.bus.emit(engineEvent, state.tick);
        if (engineEvent.t === 'RoundSettled') this.handleRoundEnd(engineEvent);
        else if (engineEvent.t === 'PhaseChanged' && engineEvent.to === 'SHOP') this.handleShopEnter();
      }
    }
  }

  private emit(event: EngineEvent | PhysicsEvent): void {
    this.bus.emit(event, this.machine.getState().tick);
  }
}

export function createGameCore(options: GameCoreOptions = {}): Core {
  return new Core(options);
}

export const GameCoreEngine = Core;
export const GameCoreImpl = Core;
export const createCore = createGameCore;
