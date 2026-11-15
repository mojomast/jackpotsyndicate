import { RULES } from '@jackpotsyndicate/contracts';
import type { Cell, SymbolId, Wiring } from '@jackpotsyndicate/contracts';
import {
  SYMBOL_ORDER,
  classicPaylines,
  hyperPaylines,
  paylinesForWiring,
} from '../slot/wirings/index';
import type { GridSize, Payline, SymbolGrid } from '../slot/wirings/index';

export type { GridSize, Payline, SymbolGrid } from '../slot/wirings/index';

export const MIN_COLS = RULES.MIN_COLS;
export const MAX_COLS = RULES.MAX_COLS;
export const MIN_ROWS = RULES.MIN_ROWS;
export const MAX_ROWS = RULES.MAX_ROWS;
export const MAX_JUMPERS = RULES.MAX_JUMPERS;

export type SymbolFiller = SymbolId | ((cell: Cell) => SymbolId);

export interface ResizeOptions {
  fill?: SymbolFiller;
  stripLength?: number;
}

export interface ResizableGridState {
  cols: number;
  rows: number;
  wiring: Wiring;
  strips: SymbolId[][];
  visible: SymbolId[][];
  frozen?: { cell: Cell; spins: number }[];
}

export interface JumperOptions {
  wiring?: Wiring;
  count?: number;
  current?: readonly (readonly Cell[])[];
  paylines?: readonly (Payline | readonly Cell[])[];
  rng?: () => number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function integer(value: number): number {
  return Math.trunc(value);
}

function fillerFor(fill?: SymbolFiller): (cell: Cell) => SymbolId {
  if (typeof fill === 'function') return fill;
  if (typeof fill === 'string') return () => fill;
  return (cell) => SYMBOL_ORDER[(cell[0] * 3 + cell[1] * 5) % SYMBOL_ORDER.length]!;
}

function measure(grid: SymbolGrid): GridSize {
  return { cols: grid.length, rows: grid.length === 0 ? 0 : grid[0]!.length };
}

function assertSize(size: GridSize): GridSize {
  const cols = integer(size.cols);
  const rows = integer(size.rows);
  if (cols < MIN_COLS || cols > MAX_COLS || rows < MIN_ROWS || rows > MAX_ROWS) {
    throw new RangeError(`grid size ${cols}x${rows} is outside ${MIN_COLS}-${MAX_COLS} x ${MIN_ROWS}-${MAX_ROWS}`);
  }
  return { cols, rows };
}

export function clampGridSize(size: GridSize): GridSize {
  return {
    cols: clamp(integer(size.cols), MIN_COLS, MAX_COLS),
    rows: clamp(integer(size.rows), MIN_ROWS, MAX_ROWS),
  };
}

export function resizeGrid(grid: SymbolGrid, to: GridSize, options: ResizeOptions = {}): SymbolId[][] {
  const target = assertSize(to);
  const from = measure(grid);
  const fill = fillerFor(options.fill);
  const out: SymbolId[][] = [];
  for (let col = 0; col < target.cols; col++) {
    const column: SymbolId[] = [];
    for (let row = 0; row < target.rows; row++) {
      const existing = col < from.cols && row < from.rows ? grid[col]?.[row] : undefined;
      column.push(existing ?? fill([col, row]));
    }
    out.push(column);
  }
  return out;
}

export function resizeStrips(
  strips: readonly (readonly SymbolId[])[],
  to: GridSize,
  options: ResizeOptions = {},
): SymbolId[][] {
  const target = assertSize(to);
  const fill = fillerFor(options.fill);
  const existingLength = strips.reduce((max, strip) => Math.max(max, strip.length), 0);
  const length = options.stripLength ?? Math.max(target.rows, existingLength);
  const out: SymbolId[][] = [];
  for (let col = 0; col < target.cols; col++) {
    const source = strips[col] ?? [];
    const strip = source.slice(0, length).map((symbol) => symbol);
    for (let index = strip.length; index < length; index++) strip.push(fill([col, index]));
    out.push(strip);
  }
  return out;
}

export function resizeGridState<T extends ResizableGridState>(
  state: T,
  to: GridSize,
  options: ResizeOptions = {},
): T & { lines: Payline[] } {
  const target = assertSize(to);
  const visible = resizeGrid(state.visible, target, options);
  const strips = resizeStrips(state.strips, target, options);
  const frozen = (state.frozen ?? []).filter(
    (entry) => entry.cell[0] < target.cols && entry.cell[1] < target.rows,
  );
  return {
    ...state,
    cols: target.cols,
    rows: target.rows,
    visible,
    strips,
    frozen,
    lines: paylinesForWiring(state.wiring, target.cols, target.rows),
  };
}

export function addColumn(grid: SymbolGrid, options: ResizeOptions = {}): SymbolId[][] {
  const from = measure(grid);
  return resizeGrid(grid, clampGridSize({ cols: from.cols + 1, rows: from.rows }), options);
}

export function addRow(grid: SymbolGrid, options: ResizeOptions = {}): SymbolId[][] {
  const from = measure(grid);
  return resizeGrid(grid, clampGridSize({ cols: from.cols, rows: from.rows + 1 }), options);
}

export function growGrid(
  grid: SymbolGrid,
  delta: { columns?: number; rows?: number },
  options: ResizeOptions = {},
): SymbolId[][] {
  const from = measure(grid);
  return resizeGrid(
    grid,
    clampGridSize({ cols: from.cols + (delta.columns ?? 0), rows: from.rows + (delta.rows ?? 0) }),
    options,
  );
}

export function hashSeed(seed: string | number): number {
  if (typeof seed === 'number') return seed >>> 0;
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: string | number): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let index = items.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1));
    const item = items[index]!;
    items[index] = items[swap]!;
    items[swap] = item;
  }
  return items;
}

function pathKey(path: readonly Cell[]): string {
  return path.map((cell) => `${cell[0]},${cell[1]}`).join('|');
}

function enumerateJumperPaths(cols: number, rows: number): Cell[][] {
  const paths: Cell[][] = [];
  const build = (prefix: Cell[]): void => {
    if (prefix.length === cols) {
      paths.push(prefix);
      return;
    }
    const previous = prefix.length === 0 ? null : prefix[prefix.length - 1]!;
    const start = previous === null ? 0 : Math.max(0, previous[1] - 1);
    const end = previous === null ? rows - 1 : Math.min(rows - 1, previous[1] + 1);
    for (let row = start; row <= end; row++) {
      build([...prefix, [prefix.length, row]]);
    }
  };
  build([]);
  return paths;
}

export function jumpersAllowed(wiring: Wiring): boolean {
  return wiring === 'CLASSIC' || wiring === 'HYPER';
}

export function overvoltAllowed(wiring: Wiring): boolean {
  return wiring === 'CLASSIC' || wiring === 'HYPER';
}

function standardLinesFor(wiring: Wiring | undefined, cols: number, rows: number): Payline[] {
  if (wiring === 'CLASSIC' || wiring === 'HYPER') return paylinesForWiring(wiring, cols, rows);
  return [...classicPaylines(cols, rows), ...hyperPaylines(cols, rows)];
}

export function generateJumperOffers(seed: string, size: GridSize, options: JumperOptions = {}): Cell[][] {
  const target = clampGridSize(size);
  if (options.wiring !== undefined && !jumpersAllowed(options.wiring)) return [];
  const count = options.count ?? 3;
  if (count <= 0) return [];
  const rng = options.rng ?? createSeededRandom(`${seed}:${target.cols}x${target.rows}:${options.wiring ?? '*'}`);
  const blocked = new Set<string>();
  const standard: readonly (Payline | readonly Cell[])[] =
    options.paylines ?? standardLinesFor(options.wiring, target.cols, target.rows);
  for (const line of standard) blocked.add(pathKey(Array.isArray(line) ? line : (line as Payline).cells));
  for (const line of options.current ?? []) blocked.add(pathKey(line));
  const candidates = enumerateJumperPaths(target.cols, target.rows).filter((path) => !blocked.has(pathKey(path)));
  shuffle(candidates, rng);
  return candidates.slice(0, count).map((path) => path.map((cell) => [cell[0], cell[1]] as Cell));
}

export function canAddJumper(wiring: Wiring, currentCount: number): boolean {
  return jumpersAllowed(wiring) && currentCount < MAX_JUMPERS;
}

export function addJumper(
  current: readonly (readonly Cell[])[],
  path: readonly Cell[],
  options: { max?: number; wiring?: Wiring } = {},
): Cell[][] {
  const max = options.max ?? MAX_JUMPERS;
  const existing = current.map((line) => line.map((cell) => [cell[0], cell[1]] as Cell));
  if (options.wiring !== undefined && !jumpersAllowed(options.wiring)) return existing;
  if (existing.length >= max) return existing;
  const key = pathKey(path);
  if (existing.some((line) => pathKey(line) === key)) return existing;
  return [...existing, path.map((cell) => [cell[0], cell[1]] as Cell)];
}

export function chooseJumper(offers: readonly (readonly Cell[])[], index: number): Cell[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= offers.length) return null;
  return offers[index]!.map((cell) => [cell[0], cell[1]] as Cell);
}

export function selectOvervolt(
  wiring: Wiring,
  lineId: string | null,
  lines?: readonly ({ id: string } | string)[],
): string | null {
  if (lineId === null || lineId.length === 0) return null;
  if (!overvoltAllowed(wiring)) return null;
  if (lines !== undefined) {
    const found = lines.some((line) => (typeof line === 'string' ? line === lineId : line.id === lineId));
    if (!found) return null;
  }
  return lineId;
}

export const setOvervolt = selectOvervolt;

export function overvoltMultiplier(wiring: Wiring, selectedLineId: string | null, lineId: string): number {
  return overvoltAllowed(wiring) && selectedLineId !== null && selectedLineId === lineId ? 3 : 1;
}
