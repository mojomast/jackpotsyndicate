import { RULES } from '@jackpotsyndicate/contracts';
import type { Cell, SymbolId, WinEval, Wiring } from '@jackpotsyndicate/contracts';

export const MIN_MATCH = 3;
export const SYMBOL_ORDER: readonly SymbolId[] = ['diamond', 'cherry', 'uranium', 'skull', 'seven'];

export type SymbolGrid = readonly (readonly SymbolId[])[];

export interface GridSize {
  cols: number;
  rows: number;
}

export interface Payline {
  id: string;
  cells: Cell[];
  kind: 'classic' | 'hyper' | 'jumper';
}

export interface EvaluateOptions {
  minMatch?: number;
  overvoltLineId?: string | null;
  jumperLines?: readonly (Payline | readonly Cell[])[];
  frozen?: readonly Cell[];
}

export type RefillFn = (cell: Cell, step: number) => SymbolId;

export interface TumbleOptions {
  maxTumbles?: number;
  /**
   * Boss-frozen cells (R-BOS-03). They never join a cluster, are never
   * cleared, and stay in place while the rest of their column falls past them.
   */
  frozen?: readonly Cell[];
}

export interface TumbleStep {
  step: number;
  cleared: Cell[];
  gridAfter: SymbolId[][];
  wins: WinEval[];
}

export interface TumbleResult {
  initialWins: WinEval[];
  steps: TumbleStep[];
  wins: WinEval[];
  grid: SymbolId[][];
  capped: boolean;
  tumbleCount: number;
}

export interface WiringEvaluator {
  readonly wiring: Wiring;
  evaluate(grid: SymbolGrid, options?: EvaluateOptions): WinEval[];
  tumble?(grid: SymbolGrid, refill?: RefillFn, options?: TumbleOptions): TumbleResult;
}

export function gridSize(grid: SymbolGrid): GridSize {
  return { cols: grid.length, rows: grid.length === 0 ? 0 : grid[0]!.length };
}

function cellKey(cell: Cell): string {
  return `${cell[0]},${cell[1]}`;
}

function frozenSet(frozen?: readonly Cell[]): Set<string> {
  const set = new Set<string>();
  if (frozen) for (const cell of frozen) set.add(cellKey(cell));
  return set;
}

function at(grid: SymbolGrid, col: number, row: number): SymbolId | undefined {
  return grid[col]?.[row];
}

function range(length: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i++) out.push(i);
  return out;
}

export function classicPaylines(cols: number, rows: number): Payline[] {
  const lines: Payline[] = [];
  for (const row of range(rows)) {
    lines.push({
      id: `row:${row}`,
      kind: 'classic',
      cells: range(cols).map((col) => [col, row]),
    });
  }
  const diagonal = Math.min(cols, rows);
  if (diagonal >= MIN_MATCH) {
    const down: Cell[] = [];
    const up: Cell[] = [];
    for (let col = 0; col < diagonal; col++) {
      down.push([col, col]);
      up.push([col, rows - 1 - col]);
    }
    lines.push({ id: 'diag:down', kind: 'classic', cells: down });
    lines.push({ id: 'diag:up', kind: 'classic', cells: up });
  }
  return lines;
}

export function hyperPaylines(cols: number, rows: number): Payline[] {
  const lines = classicPaylines(cols, rows);
  const span = cols - 1;
  if (span < 1 || rows < 2) return lines;
  const v: Cell[] = [];
  const inverted: Cell[] = [];
  for (let col = 0; col < cols; col++) {
    const edge = Math.min(col, span - col);
    const peak = Math.round((2 * (rows - 1) * edge) / span);
    v.push([col, peak]);
    inverted.push([col, rows - 1 - peak]);
  }
  lines.push({ id: 'hyper:v', kind: 'hyper', cells: v });
  lines.push({ id: 'hyper:inverted-v', kind: 'hyper', cells: inverted });
  return lines;
}

export function normalizePaylines(input: readonly (Payline | readonly Cell[])[]): Payline[] {
  return input.map((line, index) => {
    if (Array.isArray(line)) {
      return { id: `jumper:${index}`, kind: 'jumper' as const, cells: line.map((cell) => [cell[0], cell[1]] as Cell) };
    }
    const payline = line as Payline;
    return { id: payline.id, kind: payline.kind, cells: payline.cells.map((cell) => [cell[0], cell[1]] as Cell) };
  });
}

export function paylinesForWiring(
  wiring: Wiring,
  cols: number,
  rows: number,
  jumperLines?: readonly (Payline | readonly Cell[])[],
): Payline[] {
  if (wiring === 'CLASSIC') {
    return [...classicPaylines(cols, rows), ...normalizePaylines(jumperLines ?? [])];
  }
  if (wiring === 'HYPER') {
    return [...hyperPaylines(cols, rows), ...normalizePaylines(jumperLines ?? [])];
  }
  return [];
}

function evaluateLineSet(
  grid: SymbolGrid,
  lines: readonly Payline[],
  minMatch: number,
  overvoltLineId: string | null,
  frozen: Set<string>,
): WinEval[] {
  const wins: WinEval[] = [];
  for (const line of lines) {
    if (line.cells.length < minMatch) continue;
    const first = line.cells[0]!;
    if (frozen.has(cellKey(first))) continue;
    const symbol = at(grid, first[0], first[1]);
    if (symbol === undefined) continue;
    let matched = 1;
    for (let index = 1; index < line.cells.length; index++) {
      const cell = line.cells[index]!;
      if (frozen.has(cellKey(cell)) || at(grid, cell[0], cell[1]) !== symbol) break;
      matched++;
    }
    if (matched < minMatch) continue;
    const overvolt = overvoltLineId !== null && overvoltLineId === line.id;
    const win: WinEval = {
      kind: 'line',
      symbolId: symbol,
      cells: line.cells.slice(0, matched).map((cell) => [cell[0], cell[1]] as Cell),
      lineId: line.id,
      lineMult: overvolt ? 3 : 1,
    };
    if (overvolt) win.overvolt = true;
    wins.push(win);
  }
  return wins;
}

export function evaluateClassic(grid: SymbolGrid, options: EvaluateOptions = {}): WinEval[] {
  const { cols, rows } = gridSize(grid);
  return evaluateLineSet(
    grid,
    paylinesForWiring('CLASSIC', cols, rows, options.jumperLines),
    options.minMatch ?? MIN_MATCH,
    options.overvoltLineId ?? null,
    frozenSet(options.frozen),
  );
}

export function evaluateHyper(grid: SymbolGrid, options: EvaluateOptions = {}): WinEval[] {
  const { cols, rows } = gridSize(grid);
  return evaluateLineSet(
    grid,
    paylinesForWiring('HYPER', cols, rows, options.jumperLines),
    options.minMatch ?? MIN_MATCH,
    options.overvoltLineId ?? null,
    frozenSet(options.frozen),
  );
}

export function evaluateWays(grid: SymbolGrid, options: EvaluateOptions = {}): WinEval[] {
  const { cols, rows } = gridSize(grid);
  const frozen = frozenSet(options.frozen);
  const seen = new Set<SymbolId>();
  const wins: WinEval[] = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const symbol = at(grid, col, row);
      if (symbol === undefined || frozen.has(cellKey([col, row])) || seen.has(symbol)) continue;
      seen.add(symbol);
      const cells: Cell[] = [];
      let matchedReels = 0;
      let ways = 1;
      for (let reel = 0; reel < cols; reel++) {
        const matches: Cell[] = [];
        for (let matchRow = 0; matchRow < rows; matchRow++) {
          if (!frozen.has(cellKey([reel, matchRow])) && at(grid, reel, matchRow) === symbol) {
            matches.push([reel, matchRow]);
          }
        }
        if (matches.length === 0) break;
        matchedReels++;
        ways *= matches.length;
        for (const cell of matches) cells.push(cell);
      }
      if (matchedReels >= MIN_MATCH) {
        wins.push({ kind: 'ways', symbolId: symbol, cells, lineMult: ways });
      }
    }
  }
  return wins;
}

export interface ClusterGroup {
  symbolId: SymbolId;
  cells: Cell[];
}

export function findClusters(grid: SymbolGrid, options: EvaluateOptions = {}): ClusterGroup[] {
  const { cols, rows } = gridSize(grid);
  const frozen = frozenSet(options.frozen);
  const visited = new Set<string>();
  const clusters: ClusterGroup[] = [];
  const neighbours: readonly Cell[] = [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
  ];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const start: Cell = [col, row];
      if (visited.has(cellKey(start)) || frozen.has(cellKey(start))) continue;
      const symbol = at(grid, col, row);
      if (symbol === undefined) continue;
      visited.add(cellKey(start));
      const queue: Cell[] = [start];
      const cells: Cell[] = [];
      for (let index = 0; index < queue.length; index++) {
        const cell = queue[index]!;
        cells.push(cell);
        for (const [dc, dr] of neighbours) {
          const next: Cell = [cell[0] + dc, cell[1] + dr];
          if (next[0] < 0 || next[0] >= cols || next[1] < 0 || next[1] >= rows) continue;
          const key = cellKey(next);
          if (visited.has(key) || frozen.has(key)) continue;
          if (at(grid, next[0], next[1]) !== symbol) continue;
          visited.add(key);
          queue.push(next);
        }
      }
      if (cells.length >= 4) clusters.push({ symbolId: symbol, cells });
    }
  }
  return clusters;
}

export function evaluateCluster(grid: SymbolGrid, options: EvaluateOptions = {}): WinEval[] {
  return findClusters(grid, options).map((cluster) => ({
    kind: 'cluster',
    symbolId: cluster.symbolId,
    cells: cluster.cells.map((cell) => [cell[0], cell[1]] as Cell),
    lineMult: cluster.cells.length / 4,
  }));
}

export function defaultRefill(cell: Cell, step: number): SymbolId {
  const index = (cell[0] * 3 + cell[1] * 5 + step * 7) % SYMBOL_ORDER.length;
  return SYMBOL_ORDER[index]!;
}

function cloneGrid(grid: SymbolGrid): SymbolId[][] {
  return grid.map((column) => [...column]);
}

function unionCells(wins: readonly WinEval[]): Cell[] {
  const seen = new Set<string>();
  const cells: Cell[] = [];
  for (const win of wins) {
    for (const cell of win.cells) {
      const key = cellKey(cell);
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push([cell[0], cell[1]]);
    }
  }
  return cells;
}

function clearAndRefill(
  grid: SymbolGrid,
  cleared: readonly Cell[],
  refill: RefillFn,
  step: number,
  frozen: Set<string> = new Set(),
): SymbolId[][] {
  const { cols, rows } = gridSize(grid);
  const removed = frozenSet(cleared);
  const next: SymbolId[][] = [];
  for (let col = 0; col < cols; col++) {
    // Surviving movable symbols, bottom first. Frozen cells keep their slot.
    const survivors: SymbolId[] = [];
    for (let row = rows - 1; row >= 0; row--) {
      const key = cellKey([col, row]);
      if (frozen.has(key) || removed.has(key)) continue;
      const symbol = at(grid, col, row);
      if (symbol !== undefined) survivors.push(symbol);
    }
    const column: SymbolId[] = new Array(rows);
    const open: number[] = [];
    for (let row = rows - 1; row >= 0; row--) {
      if (frozen.has(cellKey([col, row]))) {
        column[row] = at(grid, col, row)!;
      } else {
        open.push(row);
      }
    }
    // `open` lists movable slots bottom-up: survivors settle lowest, then the
    // remaining slots are refilled top-down (the original refill call order).
    for (let index = 0; index < open.length && index < survivors.length; index++) {
      column[open[index]!] = survivors[index]!;
    }
    for (let index = open.length - 1; index >= survivors.length; index--) {
      const row = open[index]!;
      column[row] = refill([col, row], step);
    }
    next.push(column);
  }
  return next;
}

export function tumbleCluster(
  grid: SymbolGrid,
  refill: RefillFn = defaultRefill,
  options: TumbleOptions = {},
): TumbleResult {
  const maxTumbles = Math.max(0, Math.floor(options.maxTumbles ?? RULES.MAX_TUMBLES));
  const frozen = frozenSet(options.frozen);
  const evalOptions: EvaluateOptions = options.frozen === undefined ? {} : { frozen: options.frozen };
  let current = cloneGrid(grid);
  const initialWins = evaluateCluster(current, evalOptions);
  const allWins = [...initialWins];
  const steps: TumbleStep[] = [];
  if (initialWins.length === 0) {
    return { initialWins, steps, wins: initialWins, grid: current, capped: false, tumbleCount: 0 };
  }
  let pending = initialWins;
  for (let step = 1; step <= maxTumbles; step++) {
    const cleared = unionCells(pending);
    const gridAfter = clearAndRefill(current, cleared, refill, step, frozen);
    const wins = evaluateCluster(gridAfter, evalOptions);
    steps.push({ step, cleared, gridAfter, wins });
    allWins.push(...wins);
    current = gridAfter;
    if (wins.length === 0) {
      return { initialWins, steps, wins: allWins, grid: current, capped: false, tumbleCount: steps.length };
    }
    pending = wins;
  }
  return {
    initialWins,
    steps,
    wins: allWins,
    grid: current,
    capped: pending.length > 0,
    tumbleCount: steps.length,
  };
}

export const classicEvaluator: WiringEvaluator = {
  wiring: 'CLASSIC',
  evaluate: (grid, options) => evaluateClassic(grid, options),
};

export const hyperEvaluator: WiringEvaluator = {
  wiring: 'HYPER',
  evaluate: (grid, options) => evaluateHyper(grid, options),
};

export const waysEvaluator: WiringEvaluator = {
  wiring: 'WAYS',
  evaluate: (grid, options) => evaluateWays(grid, options),
};

export const clusterEvaluator: WiringEvaluator = {
  wiring: 'CLUSTER',
  evaluate: (grid, options) => evaluateCluster(grid, options),
  tumble: (grid, refill, options) => tumbleCluster(grid, refill, options),
};

export const WIRING_EVALUATORS: Record<Wiring, WiringEvaluator> = {
  CLASSIC: classicEvaluator,
  HYPER: hyperEvaluator,
  WAYS: waysEvaluator,
  CLUSTER: clusterEvaluator,
};

export function getWiringEvaluator(wiring: Wiring): WiringEvaluator {
  return WIRING_EVALUATORS[wiring];
}
