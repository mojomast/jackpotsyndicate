/**
 * T-010: reel strips and grid drawing.
 *
 * A grid is stored by column (`grid[col][row]`), matching the animation
 * contract's `finalGrid` and the run state's visible strips. A stop is an index
 * into that column's weighted strip; the visible cells are the following
 * `rows` strip entries, wrapping at the end.
 */
import { RULES, type SymbolId } from '@jackpotsyndicate/contracts';
import type { RngStream } from '../../rng/index';

export const SYMBOL_IDS: readonly SymbolId[] = ['diamond', 'cherry', 'uranium', 'skull', 'seven'];

/** Default weighted strip (repeated ids are the weights) used when content is absent. */
export const DEFAULT_REEL_STRIP: readonly SymbolId[] = [
  'cherry',
  'cherry',
  'skull',
  'uranium',
  'cherry',
  'diamond',
  'skull',
  'cherry',
  'seven',
  'uranium',
  'cherry',
  'skull',
  'diamond',
  'cherry',
  'uranium',
  'cherry',
  'seven',
  'skull',
];

/** Column-0 override: cherries occur in adjacent pairs. */
export const DEFAULT_FIRST_REEL_STRIP: readonly SymbolId[] = [
  'cherry',
  'cherry',
  'skull',
  'uranium',
  'cherry',
  'cherry',
  'diamond',
  'cherry',
  'cherry',
  'seven',
  'skull',
  'uranium',
  'cherry',
  'cherry',
  'diamond',
  'seven',
];

export type ReelStrip = readonly SymbolId[];
export type ReelStrips = readonly ReelStrip[];

export interface DrawGridOptions {
  /** Visible rows (3 or 4, per R-SLOT-01). Defaults to 3. */
  rows?: number;
  /** One weighted strip per column. Defaults to the standard five-reel set. */
  strips?: ReelStrips;
  /** Required when `strips` is omitted; must match `strips.length` otherwise. */
  cols?: number;
}

export interface GridDraw {
  /** Visible symbols by column, `grid[col][row]`. */
  grid: SymbolId[][];
  /** Index of the top visible symbol in each column's strip. */
  stops: number[];
  /** The strips actually used (fresh copies). */
  strips: SymbolId[][];
}

function copyStrip(strip: ReelStrip): SymbolId[] {
  return strip.slice();
}

/** Build one strip per column: standard strip, with the paired-cherry strip first. */
export function makeReelStrips(
  cols: number,
  baseStrip: ReelStrip = DEFAULT_REEL_STRIP,
  firstReelStrip: ReelStrip = DEFAULT_FIRST_REEL_STRIP,
): SymbolId[][] {
  validateCols(cols);
  if (baseStrip.length === 0 || firstReelStrip.length === 0) {
    throw new RangeError('reel strips must not be empty');
  }
  const strips: SymbolId[][] = [];
  for (let col = 0; col < cols; col++) {
    strips.push(copyStrip(col === 0 ? firstReelStrip : baseStrip));
  }
  return strips;
}

/** Alias with the explicit "default" name used in integration code. */
export function makeDefaultReelStrips(cols: number): SymbolId[][] {
  return makeReelStrips(cols);
}

export function validateCols(cols: number): void {
  if (!Number.isInteger(cols) || cols < RULES.MIN_COLS || cols > RULES.MAX_COLS) {
    throw new RangeError(`cols must be an integer in ${RULES.MIN_COLS}..${RULES.MAX_COLS}`);
  }
}

export function validateRows(rows: number): void {
  if (!Number.isInteger(rows) || rows < RULES.MIN_ROWS || rows > RULES.MAX_ROWS) {
    throw new RangeError(`rows must be an integer in ${RULES.MIN_ROWS}..${RULES.MAX_ROWS}`);
  }
}

export function validateReelStrips(strips: ReelStrips, cols?: number): void {
  if (strips.length === 0) throw new RangeError('reel strips must not be empty');
  validateCols(strips.length);
  if (cols !== undefined && cols !== strips.length) {
    throw new RangeError('cols does not match the number of strips');
  }
  for (let col = 0; col < strips.length; col++) {
    const strip = strips[col]!;
    if (strip.length === 0) throw new RangeError(`reel strip ${col} is empty`);
    for (const symbol of strip) {
      if (!SYMBOL_IDS.includes(symbol)) {
        throw new RangeError(`reel strip ${col} contains unknown symbol ${String(symbol)}`);
      }
    }
  }
}

/**
 * Draw one visible grid. Exactly one seeded stop is drawn per column, in
 * column order, so the sequence is stable for a given RNG stream.
 */
export function drawGrid(rng: RngStream, options: DrawGridOptions = {}): GridDraw {
  const rows = options.rows ?? RULES.MIN_ROWS;
  validateRows(rows);

  const strips =
    options.strips !== undefined
      ? options.strips.map((strip) => copyStrip(strip))
      : makeReelStrips(options.cols ?? RULES.MIN_COLS);

  validateReelStrips(strips, options.cols);

  const grid: SymbolId[][] = [];
  const stops: number[] = [];
  for (let col = 0; col < strips.length; col++) {
    const strip = strips[col]!;
    const stop = rng.int(strip.length);
    stops.push(stop);
    const visible: SymbolId[] = [];
    for (let row = 0; row < rows; row++) {
      visible.push(strip[(stop + row) % strip.length]!);
    }
    grid.push(visible);
  }

  return { grid, stops, strips };
}

/** Convenience: draw a grid from a seeded stream split named "reels". */
export function drawGridFromSeed(
  rng: RngStream,
  options: DrawGridOptions = {},
): GridDraw {
  return drawGrid(rng.split('reels'), options);
}

/** Grid dimensions, validating the column-major rectangle. */
export function gridSize(grid: readonly (readonly SymbolId[])[]): { cols: number; rows: number } {
  if (grid.length === 0) throw new RangeError('grid must have at least one column');
  const rows = grid[0]!.length;
  if (rows === 0) throw new RangeError('grid must have at least one row');
  for (const column of grid) {
    if (column.length !== rows) throw new RangeError('grid must be rectangular');
  }
  return { cols: grid.length, rows };
}

export function symbolAt(
  grid: readonly (readonly SymbolId[])[],
  col: number,
  row: number,
): SymbolId {
  const column = grid[col];
  if (column === undefined) throw new RangeError(`grid has no column ${col}`);
  const symbol = column[row];
  if (symbol === undefined) throw new RangeError(`grid column ${col} has no row ${row}`);
  return symbol;
}
