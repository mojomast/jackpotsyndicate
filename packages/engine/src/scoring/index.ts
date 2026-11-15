/**
 * T-010: CLASSIC line evaluation and SPEC 2.6 scoring.
 *
 * A spin has additive multiplier A = 1 + sum(symbol +Mult for each winning
 * evaluation) + external additions, and multiplicative X = product(symbol
 * x-Mult for each winning evaluation) * external factors.
 *
 * Every scoring cell yields exactly one orb. Its chips are
 * `symbolChips * sum(lineMult of every winning evaluation containing the cell)`.
 * Orb-plan order is the first-occurrence order of the flattened wins, which the
 * animation contract uses for cell detach timing.
 */
import { RULES, type Cell, type SymbolId, type WinEval, type Wiring } from '@jackpotsyndicate/contracts';
import { gridSize, symbolAt } from '../slot/core/index';
import {
  evaluateCluster,
  evaluateWays,
  paylinesForWiring,
  evaluateClassic as evaluateClassicLines,
  evaluateHyper,
  type TumbleResult,
} from '../slot/wirings/index';

export interface SymbolSlotStats {
  chips: number;
  addMult: number;
  xMult: number;
  /** Used instead of `xMult` when the winning evaluation covers the whole line. */
  fullLineXMult?: number;
}

export type SymbolStatsTable = Record<SymbolId, SymbolSlotStats>;

/** SPEC 2.6 slot-stage values. */
export const DEFAULT_SYMBOL_STATS: SymbolStatsTable = {
  diamond: { chips: 45, addMult: 4, xMult: 1 },
  cherry: { chips: 20, addMult: 2, xMult: 1 },
  uranium: { chips: 65, addMult: 0, xMult: 1.8 },
  skull: { chips: 30, addMult: 5, xMult: 1 },
  seven: { chips: 77, addMult: 7, xMult: 1.5, fullLineXMult: 5 },
};

export const CLASSIC_MIN_MATCH = 3;

export interface Payline {
  id: string;
  /** Full path of the line, left to right. */
  cells: Cell[];
}

export interface OrbPlanEntry {
  /** `null` identifies the dead-spin Scrap Copper fallback. */
  cell: Cell | null;
  symbolId: string;
  chips: number;
}

export interface EvaluateClassicOptions {
  minMatch?: number;
  /** Line id whose lineMult is 3 (R-MUT-06). */
  overvoltLineId?: string | null;
  /** Boss-frozen cells never start or extend a line (R-BOS-03). */
  frozen?: readonly Cell[];
}

export interface ScoreOptions extends EvaluateClassicOptions {
  /** Per-symbol overrides merged over DEFAULT_SYMBOL_STATS. */
  symbols?: Partial<Record<SymbolId, Partial<SymbolSlotStats>>>;
  /** Drink/trinket additive-multiplier contributions. */
  extraAddMult?: number;
  /** Drink/trinket/carried x-multiplier contributions. */
  extraXMult?: number;
  cashPerChip?: number;
  /** Fraction of the cheapest symbol's chips used by the dead-spin orb. */
  scrapEquity?: number;
  scrapSymbolId?: string;
}

export interface ScoreResult {
  grid: SymbolId[][];
  wins: WinEval[];
  /** Total chips across the orb plan. */
  chips: number;
  /** A: additive multiplier including the base 1. */
  addMult: number;
  /** X: product of all x-multipliers. */
  xMult: number;
  /** HUD Spin Equity: sum(chips) * A * X * cashPerChip. */
  equity: number;
  orbPlan: OrbPlanEntry[];
}

/**
 * CLASSIC lines: every row, plus the two left-anchored diagonals. A diagonal
 * spans as many columns as fit inside the grid (`min(cols, rows)`).
 */
export function classicLines(cols: number, rows: number): Payline[] {
  if (!Number.isInteger(cols) || cols < 1 || !Number.isInteger(rows) || rows < 1) {
    throw new RangeError('cols and rows must be positive integers');
  }
  const lines: Payline[] = [];

  for (let row = 0; row < rows; row++) {
    const cells: Cell[] = [];
    for (let col = 0; col < cols; col++) cells.push([col, row]);
    lines.push({ id: `row:${row}`, cells });
  }

  const diagonalLength = Math.min(cols, rows);

  const down: Cell[] = [];
  for (let i = 0; i < diagonalLength; i++) down.push([i, i]);
  lines.push({ id: 'diag:down', cells: down });

  const up: Cell[] = [];
  for (let i = 0; i < diagonalLength; i++) up.push([i, rows - 1 - i]);
  lines.push({ id: 'diag:up', cells: up });

  return lines;
}

export function evaluateClassic(
  grid: readonly (readonly SymbolId[])[],
  options: EvaluateClassicOptions = {},
): WinEval[] {
  const { cols, rows } = gridSize(grid);
  const minMatch = options.minMatch ?? CLASSIC_MIN_MATCH;
  if (!Number.isInteger(minMatch) || minMatch < 1) {
    throw new RangeError('minMatch must be a positive integer');
  }
  const overvoltLineId = options.overvoltLineId ?? null;
  const frozen = new Set(
    (options.frozen ?? []).map(([col, row]) => `${col}:${row}`),
  );
  const wins: WinEval[] = [];

  for (const line of classicLines(cols, rows)) {
    if (line.cells.length < minMatch) continue;
    if (frozen.has(`${line.cells[0]![0]}:${line.cells[0]![1]}`)) continue;
    const first = symbolAt(grid, line.cells[0]![0], line.cells[0]![1]);
    let matched = 1;
    while (
      matched < line.cells.length &&
      !frozen.has(`${line.cells[matched]![0]}:${line.cells[matched]![1]}`) &&
      symbolAt(grid, line.cells[matched]![0], line.cells[matched]![1]) === first
    ) {
      matched++;
    }
    if (matched < minMatch) continue;

    const overvolt = overvoltLineId === line.id;
    wins.push({
      kind: 'line',
      symbolId: first,
      cells: line.cells.slice(0, matched),
      lineId: line.id,
      lineMult: overvolt ? 3 : 1,
      ...(overvolt ? { overvolt: true } : {}),
    });
  }

  return wins;
}

function resolveSymbols(
  overrides: Partial<Record<SymbolId, Partial<SymbolSlotStats>>> | undefined,
): SymbolStatsTable {
  const table: SymbolStatsTable = {
    diamond: { ...DEFAULT_SYMBOL_STATS.diamond },
    cherry: { ...DEFAULT_SYMBOL_STATS.cherry },
    uranium: { ...DEFAULT_SYMBOL_STATS.uranium },
    skull: { ...DEFAULT_SYMBOL_STATS.skull },
    seven: { ...DEFAULT_SYMBOL_STATS.seven },
  };
  if (overrides === undefined) return table;
  for (const id of Object.keys(overrides) as SymbolId[]) {
    const patch = overrides[id];
    if (patch === undefined) continue;
    table[id] = { ...table[id], ...patch };
  }
  for (const id of Object.keys(table) as SymbolId[]) {
    const stat = table[id];
    if (!Number.isFinite(stat.chips) || stat.chips < 0) {
      throw new RangeError(`${id} chips must be finite and non-negative`);
    }
    if (!Number.isFinite(stat.addMult) || stat.addMult < 0) {
      throw new RangeError(`${id} addMult must be finite and non-negative`);
    }
    if (!Number.isFinite(stat.xMult) || stat.xMult < 0) {
      throw new RangeError(`${id} xMult must be finite and non-negative`);
    }
    if (
      stat.fullLineXMult !== undefined &&
      (!Number.isFinite(stat.fullLineXMult) || stat.fullLineXMult < 0)
    ) {
      throw new RangeError(`${id} fullLineXMult must be finite and non-negative`);
    }
  }
  return table;
}

/** Chips of the single Scrap Copper orb used by a dead spin. */
export function scrapChips(
  symbols: SymbolStatsTable = DEFAULT_SYMBOL_STATS,
  fraction: number = RULES.SCRAP_EQUITY,
): number {
  if (!Number.isFinite(fraction) || fraction < 0) {
    throw new RangeError('scrap fraction must be finite and non-negative');
  }
  let cheapest = Infinity;
  for (const id of Object.keys(symbols) as SymbolId[]) {
    const chips = symbols[id].chips;
    if (chips < cheapest) cheapest = chips;
  }
  if (!Number.isFinite(cheapest)) throw new RangeError('symbol table is empty');
  return Math.round(cheapest * fraction);
}

/** The R-CORE-02 fallback orb plan for a spin with no winning evaluation. */
export function makeScrapOrbPlan(
  symbolId = 'scrap',
  chips = scrapChips(),
  count: number = RULES.SCRAP_ORBS,
): OrbPlanEntry[] {
  const n = Math.max(1, Math.floor(count));
  return Array.from({ length: n }, () => ({ cell: null, symbolId, chips }));
}

function finiteNonNegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
  return value;
}

/** Evaluate and score one CLASSIC spin. */
export function scoreClassic(
  grid: readonly (readonly SymbolId[])[],
  options: ScoreOptions = {},
): ScoreResult {
  gridSize(grid);
  const symbols = resolveSymbols(options.symbols);
  const wins = evaluateClassic(grid, options);
  const extraAddMult = finiteNonNegative('extraAddMult', options.extraAddMult ?? 0);
  const extraXMult = finiteNonNegative('extraXMult', options.extraXMult ?? 1);
  const cashPerChip = finiteNonNegative('cashPerChip', options.cashPerChip ?? 1);

  let addMult = 1 + extraAddMult;
  let xMult = extraXMult;

  const linesById = new Map<string, Payline>();
  for (const line of classicLines(grid.length, grid[0]!.length)) {
    linesById.set(line.id, line);
  }

  for (const win of wins) {
    const stat = symbols[win.symbolId];
    addMult += stat.addMult;
    const line = win.lineId === undefined ? undefined : linesById.get(win.lineId);
    const fillsLine = line !== undefined && win.cells.length === line.cells.length;
    xMult *= fillsLine && stat.fullLineXMult !== undefined ? stat.fullLineXMult : stat.xMult;
  }

  let chips = 0;
  const orbPlan: OrbPlanEntry[] = [];
  if (wins.length === 0) {
    const scrap = scrapChips(symbols, options.scrapEquity ?? RULES.SCRAP_EQUITY);
    orbPlan.push(...makeScrapOrbPlan(options.scrapSymbolId ?? 'scrap', scrap));
    chips = scrap;
  } else {
    const byCell = new Map<string, OrbPlanEntry>();
    for (const win of wins) {
      const stat = symbols[win.symbolId];
      for (const [col, row] of win.cells) {
        const symbol = symbolAt(grid, col, row);
        const key = `${col},${row}`;
        let entry = byCell.get(key);
        if (entry === undefined) {
          entry = { cell: [col, row], symbolId: symbol, chips: 0 };
          byCell.set(key, entry);
          orbPlan.push(entry);
        }
        const cellChips = stat.chips * win.lineMult;
        entry.chips += cellChips;
        chips += cellChips;
      }
    }
  }

  const equity = chips * addMult * xMult * cashPerChip;
  finiteNonNegative('chips', chips);
  finiteNonNegative('addMult', addMult);
  finiteNonNegative('xMult', xMult);
  finiteNonNegative('equity', equity);
  for (const entry of orbPlan) finiteNonNegative('orb chips', entry.chips);

  return {
    grid: grid.map((column) => column.slice()),
    wins,
    chips,
    addMult,
    xMult,
    equity,
    orbPlan,
  };
}

/** Readable alias for callers that name the operation after the spin. */
export const scoreSpin = scoreClassic;

// ------------------------------------------------------------ every wiring

export interface ScoreWiringOptions extends ScoreOptions {
  wiring?: Wiring;
  /** Extra jumper paylines (R-MUT-05, CLASSIC/HYPER only). */
  jumperLines?: readonly (readonly Cell[])[];
}

/** One winning evaluation plus where it happened (tumble step 0 is the drawn grid). */
export interface ScoredWin {
  win: WinEval;
  /** Tumble step the win belongs to; orbs from different steps never merge. */
  step: number;
  /** True when a `line` win covers its whole payline (Seven's full-line X). */
  fullLine: boolean;
}

/**
 * SPEC 2.6 aggregation over any set of wins: A = 1 + Σ symbol +Mult per win,
 * X = Π symbol x-mult per win (full-line override for `line` wins), one orb per
 * scoring cell per tumble step with `chips = symbolChips × Σ lineMult`.
 */
export function aggregateWins(
  scored: readonly ScoredWin[],
  options: ScoreOptions = {},
): Omit<ScoreResult, 'grid'> {
  const symbols = resolveSymbols(options.symbols);
  const extraAddMult = finiteNonNegative('extraAddMult', options.extraAddMult ?? 0);
  const extraXMult = finiteNonNegative('extraXMult', options.extraXMult ?? 1);
  const cashPerChip = finiteNonNegative('cashPerChip', options.cashPerChip ?? 1);

  let addMult = 1 + extraAddMult;
  let xMult = extraXMult;
  let chips = 0;
  const orbPlan: OrbPlanEntry[] = [];
  const byCell = new Map<string, OrbPlanEntry>();

  for (const { win, step, fullLine } of scored) {
    const stat = symbols[win.symbolId];
    addMult += stat.addMult;
    xMult *= fullLine && stat.fullLineXMult !== undefined ? stat.fullLineXMult : stat.xMult;
    for (const [col, row] of win.cells) {
      const key = `${step}:${col},${row}`;
      let entry = byCell.get(key);
      if (entry === undefined) {
        entry = { cell: [col, row], symbolId: win.symbolId, chips: 0 };
        byCell.set(key, entry);
        orbPlan.push(entry);
      }
      const cellChips = stat.chips * win.lineMult;
      entry.chips += cellChips;
      chips += cellChips;
    }
  }

  if (scored.length === 0) {
    const scrap = scrapChips(symbols, options.scrapEquity ?? RULES.SCRAP_EQUITY);
    orbPlan.push(...makeScrapOrbPlan(options.scrapSymbolId ?? 'scrap', scrap));
    chips = scrap;
  }

  const equity = chips * addMult * xMult * cashPerChip;
  finiteNonNegative('equity', equity);
  return {
    wins: scored.map((entry) => entry.win),
    chips,
    addMult,
    xMult,
    equity,
    orbPlan,
  };
}

function lineLengths(wiring: Wiring, cols: number, rows: number, jumpers: readonly (readonly Cell[])[]): Map<string, number> {
  const lengths = new Map<string, number>();
  for (const line of paylinesForWiring(wiring, cols, rows, jumpers)) lengths.set(line.id, line.cells.length);
  return lengths;
}

function evaluateWiring(
  grid: readonly (readonly SymbolId[])[],
  wiring: Wiring,
  options: ScoreWiringOptions,
): WinEval[] {
  const evalOptions = {
    minMatch: options.minMatch ?? CLASSIC_MIN_MATCH,
    overvoltLineId: options.overvoltLineId ?? null,
    jumperLines: options.jumperLines ?? [],
    frozen: options.frozen ?? [],
  };
  switch (wiring) {
    case 'CLASSIC':
      return evaluateClassicLines(grid, evalOptions);
    case 'HYPER':
      return evaluateHyper(grid, evalOptions);
    case 'WAYS':
      return evaluateWays(grid, evalOptions);
    case 'CLUSTER':
      return evaluateCluster(grid, evalOptions);
  }
}

/**
 * Score one drawn grid under any wiring (R-SLOT-03, R-MUT-02..06). Payline
 * ids are shared by every wiring (`row:N`, `diag:down`, `diag:up`,
 * `hyper:v`, `hyper:inverted-v`, `jumper:N`), so the overvolted line and
 * Seven's full-line X work the same with or without jumpers.
 */
export function scoreWiring(
  grid: readonly (readonly SymbolId[])[],
  options: ScoreWiringOptions = {},
): ScoreResult {
  const { cols, rows } = gridSize(grid);
  const wiring = options.wiring ?? 'CLASSIC';
  const jumpers = wiring === 'CLASSIC' || wiring === 'HYPER' ? options.jumperLines ?? [] : [];
  const wins = evaluateWiring(grid, wiring, { ...options, jumperLines: jumpers });
  const lengths = lineLengths(wiring, cols, rows, jumpers);
  const scored = wins.map((win) => ({
    win,
    step: 0,
    fullLine:
      win.kind === 'line' &&
      win.lineId !== undefined &&
      lengths.get(win.lineId) === win.cells.length,
  }));
  return { grid: grid.map((column) => column.slice()), ...aggregateWins(scored, options) };
}

/** Score a CLUSTER spin including its tumbles (R-MUT-04); `grid` is the drawn grid. */
export function scoreTumble(
  grid: readonly (readonly SymbolId[])[],
  tumble: TumbleResult,
  options: ScoreOptions = {},
): ScoreResult {
  const scored: ScoredWin[] = tumble.initialWins.map((win) => ({ win, step: 0, fullLine: false }));
  for (const step of tumble.steps) {
    for (const win of step.wins) scored.push({ win, step: step.step, fullLine: false });
  }
  return { grid: grid.map((column) => column.slice()), ...aggregateWins(scored, options) };
}
