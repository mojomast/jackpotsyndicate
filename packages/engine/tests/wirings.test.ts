import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RULES } from '@jackpotsyndicate/contracts';
import type { Cell, SymbolId, WinEval } from '@jackpotsyndicate/contracts';
import {
  classicEvaluator,
  classicPaylines,
  clusterEvaluator,
  evaluateCluster,
  evaluateHyper,
  evaluateWays,
  getWiringEvaluator,
  hyperPaylines,
  tumbleCluster,
  waysEvaluator,
} from '../src/slot/wirings/index';
import type { SymbolGrid } from '../src/slot/wirings/index';
import {
  addColumn,
  addJumper,
  addRow,
  canAddJumper,
  chooseJumper,
  createSeededRandom,
  generateJumperOffers,
  growGrid,
  overvoltMultiplier,
  resizeGrid,
  resizeGridState,
  selectOvervolt,
  setOvervolt,
} from '../src/mutations/index';

const SYMBOLS: readonly SymbolId[] = ['diamond', 'cherry', 'uranium', 'skull', 'seven'];

function gridFromRows(rows: readonly (readonly SymbolId[])[]): SymbolId[][] {
  const cols = rows[0]!.length;
  return Array.from({ length: cols }, (_, col) => rows.map((row) => row[col]!));
}

function cellKey(cell: Cell): string {
  return `${cell[0]},${cell[1]}`;
}

function pathKey(path: readonly Cell[]): string {
  return path.map(cellKey).join('|');
}

function winSignature(win: WinEval): string {
  return [
    win.kind,
    win.symbolId,
    win.cells.map(cellKey).join('|'),
    `${win.lineMult}`,
    win.lineId ?? '',
    win.overvolt ? 'overvolt' : '',
  ].join(':');
}

function filled(cols: number, rows: number, symbol: SymbolId): SymbolId[][] {
  return Array.from({ length: cols }, () => Array.from({ length: rows }, () => symbol));
}

interface BruteWay {
  symbolId: SymbolId;
  ways: number;
  cells: Cell[];
}

function bruteWays(grid: SymbolGrid): BruteWay[] {
  const cols = grid.length;
  const rows = grid[0]!.length;
  const symbols: SymbolId[] = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const symbol = grid[col]![row]!;
      if (!symbols.includes(symbol)) symbols.push(symbol);
    }
  }
  const out: BruteWay[] = [];
  for (const symbol of symbols) {
    const counts: number[] = [];
    for (let col = 0; col < cols; col++) {
      let count = 0;
      for (let row = 0; row < rows; row++) if (grid[col]![row] === symbol) count++;
      if (count === 0) break;
      counts.push(count);
    }
    if (counts.length < 3) continue;
    let ways = 1;
    for (const count of counts) ways *= count;
    const cells: Cell[] = [];
    for (let col = 0; col < counts.length; col++) {
      for (let row = 0; row < rows; row++) if (grid[col]![row] === symbol) cells.push([col, row]);
    }
    out.push({ symbolId: symbol, ways, cells });
  }
  return out;
}

function randomGrid(rng: () => number): SymbolId[][] {
  const cols = 3 + Math.floor(rng() * 3);
  const rows = 3 + Math.floor(rng() * 2);
  return Array.from({ length: cols }, () =>
    Array.from({ length: rows }, () => SYMBOLS[Math.floor(rng() * SYMBOLS.length)]!),
  );
}

test('line geometry is stable for 3x3, 4x3 and 5x4 grids', () => {
  for (const [cols, rows, classicCount, hyperCount] of [
    [3, 3, 5, 7],
    [4, 3, 5, 7],
    [5, 4, 6, 8],
  ] as const) {
    const classic = classicPaylines(cols, rows);
    const hyper = hyperPaylines(cols, rows);
    assert.equal(classic.length, classicCount);
    assert.equal(hyper.length, hyperCount);
    for (const line of hyper) {
      assert.ok(line.cells.length >= 3);
      assert.equal(line.cells[0]![0], 0);
      for (let index = 1; index < line.cells.length; index++) {
        assert.equal(line.cells[index]![0], index);
        assert.ok(line.cells[index]![1] >= 0 && line.cells[index]![1] < rows);
      }
    }
    assert.deepEqual(hyper.find((line) => line.id === 'hyper-v')!.cells, [
      [0, 0],
      ...Array.from({ length: cols - 2 }, (_, index) => {
        const col = index + 1;
        return [col, Math.round((2 * (rows - 1) * Math.min(col, cols - 1 - col)) / (cols - 1))];
      }),
      [cols - 1, 0],
    ]);
  }
});

test('HYPER evaluates classic rows plus V and inverted-V zigzags', () => {
  const grid = gridFromRows([
    ['cherry', 'skull', 'cherry'],
    ['uranium', 'diamond', 'seven'],
    ['skull', 'cherry', 'uranium'],
  ]);
  const hyper = evaluateHyper(grid);
  assert.equal(hyper.length, 1);
  assert.equal(hyper[0]!.lineId, 'hyper-v');
  assert.equal(hyper[0]!.symbolId, 'cherry');
  assert.deepEqual(hyper[0]!.cells, [
    [0, 0],
    [1, 2],
    [2, 0],
  ]);
  assert.deepEqual(classicEvaluator.evaluate(grid), []);

  const invertedGrid = gridFromRows([
    ['diamond', 'skull', 'seven'],
    ['uranium', 'diamond', 'uranium'],
    ['skull', 'cherry', 'skull'],
  ]);
  const inverted = evaluateHyper(invertedGrid).find((win) => win.lineId === 'hyper-inverted-v');
  assert.ok(inverted);
  assert.equal(inverted!.symbolId, 'skull');
  assert.deepEqual(inverted!.cells, [
    [0, 2],
    [1, 0],
    [2, 2],
  ]);
});

test('evaluators share the WiringEvaluator shape and resolve by wiring', () => {
  const grid = filled(3, 3, 'cherry');
  assert.equal(getWiringEvaluator('HYPER').wiring, 'HYPER');
  assert.equal(getWiringEvaluator('WAYS').wiring, 'WAYS');
  assert.equal(getWiringEvaluator('CLUSTER').wiring, 'CLUSTER');
  assert.equal(hyperPaylines(3, 3).length, 7);
  assert.equal(waysEvaluator.evaluate(grid).length, 1);
  assert.equal(clusterEvaluator.evaluate(grid).length, 1);
  assert.ok(clusterEvaluator.tumble);
});

test('WAYS count matches brute force on 500 seeded grids', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const grid = randomGrid(createSeededRandom(`ways-${seed}`));
    const actual = evaluateWays(grid).map((win) => ({
      symbolId: win.symbolId,
      ways: win.lineMult,
      cells: win.cells,
    }));
    const expected = bruteWays(grid);
    assert.deepEqual(actual, expected, `WAYS mismatch for seed ${seed}`);
  }
});

test('WAYS wins only from reels anchored at the left edge', () => {
  const grid = gridFromRows([
    ['seven', 'diamond', 'seven', 'seven'],
    ['seven', 'seven', 'seven', 'seven'],
    ['seven', 'cherry', 'seven', 'seven'],
  ]);
  const ways = evaluateWays(grid);
  assert.deepEqual(
    ways.map((win) => [win.symbolId, win.lineMult]),
    [['seven', 27]],
  );
  const notAnchored = gridFromRows([
    ['diamond', 'seven', 'seven', 'seven'],
    ['skull', 'seven', 'seven', 'seven'],
    ['uranium', 'seven', 'seven', 'seven'],
  ]);
  assert.ok(!evaluateWays(notAnchored).some((win) => win.symbolId === 'seven'));
});

test('CLUSTER finds orthogonally connected groups of four or more', () => {
  const grid = gridFromRows([
    ['cherry', 'cherry', 'skull'],
    ['cherry', 'cherry', 'skull'],
    ['diamond', 'uranium', 'seven'],
  ]);
  const wins = evaluateCluster(grid);
  assert.equal(wins.length, 1);
  assert.equal(wins[0]!.symbolId, 'cherry');
  assert.equal(wins[0]!.lineMult, 1);
  assert.deepEqual(
    wins[0]!.cells.map(cellKey).sort(),
    ['0,0', '0,1', '1,0', '1,1'],
  );
});

test('CLUSTER tumble stops at five steps even when wins keep appearing', () => {
  const grid = filled(3, 3, 'cherry');
  const result = tumbleCluster(grid, () => 'cherry');
  assert.equal(result.initialWins.length, 1);
  assert.equal(result.steps.length, RULES.MAX_TUMBLES);
  assert.equal(result.tumbleCount, RULES.MAX_TUMBLES);
  assert.equal(result.capped, true);
  for (const step of result.steps) assert.ok(step.wins.length > 0);

  const clear = tumbleCluster(gridFromRows([
    ['diamond', 'uranium', 'seven'],
    ['skull', 'diamond', 'uranium'],
    ['seven', 'skull', 'diamond'],
  ]));
  assert.equal(clear.steps.length, 0);
  assert.equal(clear.capped, false);
});

test('grid resize preserves existing cells and is deterministic', () => {
  const base = gridFromRows([
    ['diamond', 'uranium', 'seven'],
    ['skull', 'diamond', 'uranium'],
    ['seven', 'skull', 'diamond'],
  ]);
  const wide = resizeGrid(base, { cols: 4, rows: 3 });
  assert.deepEqual(wide, resizeGrid(base, { cols: 4, rows: 3 }));
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) assert.equal(wide[col]![row], base[col]![row]);
  }
  assert.equal(wide.length, 4);
  assert.deepEqual(resizeGrid(wide, { cols: 3, rows: 3 }), base);
  assert.deepEqual(addColumn(base), resizeGrid(base, { cols: 4, rows: 3 }));
  assert.deepEqual(addRow(base), resizeGrid(base, { cols: 3, rows: 4 }));
  assert.deepEqual(growGrid(base, { columns: 2, rows: 1 }), resizeGrid(base, { cols: 5, rows: 4 }));
  assert.throws(() => resizeGrid(base, { cols: 2, rows: 3 }), RangeError);
  assert.throws(() => resizeGrid(base, { cols: 6, rows: 3 }), RangeError);
  assert.deepEqual(addColumn(filled(5, 4, 'cherry')), filled(5, 4, 'cherry'));
  assert.deepEqual(addRow(filled(4, 4, 'cherry')), filled(4, 4, 'cherry'));
});

test('grid resize regenerates strips and the wiring line set', () => {
  const base = gridFromRows([
    ['diamond', 'uranium', 'seven'],
    ['skull', 'diamond', 'uranium'],
    ['seven', 'skull', 'diamond'],
  ]);
  const state = {
    cols: 3,
    rows: 3,
    wiring: 'HYPER' as const,
    strips: base.map((column) => [...column, ...column]),
    visible: base,
    frozen: [{ cell: [2, 2] as Cell, spins: 1 }],
  };
  const resized = resizeGridState(state, { cols: 4, rows: 4 }, { fill: 'cherry' });
  assert.equal(resized.cols, 4);
  assert.equal(resized.rows, 4);
  assert.equal(resized.strips.length, 4);
  assert.ok(resized.strips.every((strip) => strip.length >= 4));
  assert.equal(resized.lines.length, hyperPaylines(4, 4).length);
  assert.deepEqual(resized.frozen, [{ cell: [2, 2], spins: 1 }]);
  assert.deepEqual(resizeGridState(state, { cols: 4, rows: 4 }, { fill: 'cherry' }), resized);
});

test('jumper offers are deterministic per seed and non-standard', () => {
  const options = { wiring: 'CLASSIC' as const };
  const first = generateJumperOffers('jumper-seed', { cols: 5, rows: 4 }, options);
  const second = generateJumperOffers('jumper-seed', { cols: 5, rows: 4 }, options);
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  const standard = new Set(classicPaylines(5, 4).map((line) => pathKey(line.cells)));
  const seen = new Set<string>();
  for (const path of first) {
    assert.equal(path.length, 5);
    for (let col = 0; col < path.length; col++) assert.equal(path[col]![0], col);
    const key = pathKey(path);
    assert.ok(!standard.has(key));
    assert.ok(!seen.has(key));
    seen.add(key);
  }
  assert.notDeepEqual(generateJumperOffers('other-seed', { cols: 5, rows: 4 }, options), first);
  assert.deepEqual(generateJumperOffers('jumper-seed', { cols: 3, rows: 3 }, { wiring: 'WAYS' }), []);
  assert.equal(canAddJumper('CLASSIC', 2), true);
  assert.equal(canAddJumper('CLASSIC', 3), false);
  assert.equal(canAddJumper('CLUSTER', 0), false);
});

test('jumper selection enforces the three-wire cap', () => {
  const offers = generateJumperOffers('jumper-cap', { cols: 4, rows: 3 }, { count: 4 });
  let jumpers: Cell[][] = [];
  for (let index = 0; index < 3; index++) jumpers = addJumper(jumpers, offers[index]!);
  assert.equal(jumpers.length, 3);
  assert.equal(addJumper(jumpers, offers[3]!).length, 3);
  assert.equal(addJumper(jumpers, offers[0]!).length, 3);
  assert.deepEqual(chooseJumper(offers, 1), offers[1]);
  assert.equal(chooseJumper(offers, 4), null);
  assert.equal(chooseJumper(offers, -1), null);
});

test('overvolt selects one classic/hyper line and triples only that line', () => {
  const lines = classicPaylines(3, 3);
  assert.equal(selectOvervolt('CLASSIC', 'row-0', lines), 'row-0');
  assert.equal(selectOvervolt('HYPER', 'row-0', lines), 'row-0');
  assert.equal(selectOvervolt('CLASSIC', 'missing', lines), null);
  assert.equal(selectOvervolt('CLASSIC', null, lines), null);
  assert.equal(selectOvervolt('WAYS', 'row-0', lines), null);
  assert.equal(selectOvervolt('CLUSTER', 'row-0', lines), null);
  assert.equal(setOvervolt('HYPER', 'row-1', lines), 'row-1');
  assert.equal(overvoltMultiplier('HYPER', 'row-0', 'row-0'), 3);
  assert.equal(overvoltMultiplier('HYPER', 'row-0', 'row-1'), 1);
  assert.equal(overvoltMultiplier('WAYS', 'row-0', 'row-0'), 1);

  const grid = gridFromRows([
    ['cherry', 'cherry', 'cherry'],
    ['skull', 'uranium', 'skull'],
    ['diamond', 'seven', 'uranium'],
  ]);
  const wins = classicEvaluator.evaluate(grid, { overvoltLineId: 'row-0' });
  const row = wins.find((win) => win.lineId === 'row-0');
  assert.ok(row);
  assert.equal(row!.lineMult, 3);
  assert.equal(row!.overvolt, true);
  assert.deepEqual(
    wins.filter((win) => win.lineId !== 'row-0').map(winSignature),
    [],
  );
});

test('all wiring evaluators are deterministic on repeated evaluation', () => {
  const grid = gridFromRows([
    ['cherry', 'cherry', 'skull', 'seven'],
    ['cherry', 'diamond', 'skull', 'seven'],
    ['uranium', 'diamond', 'cherry', 'seven'],
  ]);
  for (const wiring of ['CLASSIC', 'HYPER', 'WAYS', 'CLUSTER'] as const) {
    const evaluator = getWiringEvaluator(wiring);
    assert.deepEqual(evaluator.evaluate(grid), evaluator.evaluate(grid));
  }
});
