import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Cell, SymbolId } from '@jackpotsyndicate/contracts';
import {
  classicLines,
  createRng,
  DEFAULT_SYMBOL_STATS,
  drawGrid,
  evaluateClassic,
  makeScrapOrbPlan,
  scoreClassic,
  scrapChips,
} from '@jackpotsyndicate/engine';

type Grid = SymbolId[][];

const byColumn = (...columns: SymbolId[][]): Grid => columns;

const FULL_ROWS: Grid = byColumn(
  ['cherry', 'diamond', 'seven'],
  ['cherry', 'diamond', 'seven'],
  ['cherry', 'diamond', 'seven'],
);

const DIAGONAL: Grid = byColumn(
  ['cherry', 'uranium', 'seven'],
  ['skull', 'cherry', 'uranium'],
  ['seven', 'skull', 'cherry'],
);

const ALL_CHERRIES: Grid = byColumn(
  ['cherry', 'cherry', 'cherry'],
  ['cherry', 'cherry', 'cherry'],
  ['cherry', 'cherry', 'cherry'],
);

const DEAD: Grid = byColumn(
  ['cherry', 'diamond', 'uranium'],
  ['skull', 'uranium', 'cherry'],
  ['seven', 'cherry', 'skull'],
);

function entryChips(grid: Grid, result: ReturnType<typeof scoreClassic>, cell: Cell): number {
  const [col, row] = cell;
  const entry = result.orbPlan.find(
    (orb) => orb.cell !== null && orb.cell[0] === col && orb.cell[1] === row,
  );
  assert.ok(entry, `no orb plan entry for ${col},${row}`);
  assert.equal(entry.symbolId, grid[col]![row]);
  return entry.chips;
}

test('CLASSIC has all rows plus both diagonals and is left-anchored', () => {
  const lines = classicLines(3, 3);
  assert.equal(lines.length, 5);
  assert.deepEqual(
    lines.map((line) => line.id),
    ['row:0', 'row:1', 'row:2', 'diag:down', 'diag:up'],
  );
  assert.deepEqual(lines[3]!.cells, [
    [0, 0],
    [1, 1],
    [2, 2],
  ]);
  assert.deepEqual(lines[4]!.cells, [
    [0, 2],
    [1, 1],
    [2, 0],
  ]);
  assert.equal(classicLines(4, 3).length, 5);
  assert.equal(classicLines(5, 4).length, 6);

  const wins = evaluateClassic(DIAGONAL);
  assert.equal(wins.length, 1);
  assert.equal(wins[0]!.symbolId, 'cherry');
  assert.deepEqual(wins[0]!.cells, [
    [0, 0],
    [1, 1],
    [2, 2],
  ]);
  assert.equal(wins[0]!.lineMult, 1);
});

test('a golden 3x3 grid produces the expected wins, A, X, chips and equity', () => {
  const result = scoreClassic(FULL_ROWS);

  assert.equal(result.wins.length, 3);
  assert.deepEqual(
    result.wins.map((win) => [win.symbolId, win.cells.length, win.lineId]),
    [
      ['cherry', 3, 'row:0'],
      ['diamond', 3, 'row:1'],
      ['seven', 3, 'row:2'],
    ],
  );

  // A = 1 + 2 (cherry) + 4 (diamond) + 7 (seven)
  assert.equal(result.addMult, 14);
  // Seven fills its line, so it contributes its full-line 5x instead of 1.5x.
  assert.equal(result.xMult, 5);
  // 3*20 + 3*45 + 3*77
  assert.equal(result.chips, 426);
  assert.equal(result.equity, 29820);

  assert.equal(result.orbPlan.length, 9);
  assert.equal(entryChips(FULL_ROWS, result, [0, 0]), 20);
  assert.equal(entryChips(FULL_ROWS, result, [2, 1]), 45);
  assert.equal(entryChips(FULL_ROWS, result, [1, 2]), 77);
});

test('orb plan order is the flattened win order, deduplicated by first occurrence', () => {
  const result = scoreClassic(ALL_CHERRIES);
  assert.equal(result.wins.length, 5);
  assert.equal(result.addMult, 11);
  assert.equal(result.xMult, 1);
  assert.equal(result.chips, 300);
  assert.equal(result.equity, 3300);
  assert.equal(result.orbPlan.length, 9);

  assert.deepEqual(
    result.orbPlan.map((orb) => orb.cell),
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ],
  );

  // Rows contribute 20 to every cell; each diagonal adds another 20.
  assert.equal(entryChips(ALL_CHERRIES, result, [0, 0]), 40);
  assert.equal(entryChips(ALL_CHERRIES, result, [0, 1]), 20);
  assert.equal(entryChips(ALL_CHERRIES, result, [1, 1]), 60);
  assert.equal(entryChips(ALL_CHERRIES, result, [2, 2]), 40);
});

test('an overvolted line uses lineMult 3 for every cell on that win', () => {
  const grid = byColumn(
    ['cherry', 'diamond', 'seven'],
    ['cherry', 'uranium', 'skull'],
    ['cherry', 'skull', 'uranium'],
  );
  const plain = scoreClassic(grid);
  const overvolt = scoreClassic(grid, { overvoltLineId: 'row:0' });

  assert.equal(plain.chips, 60);
  assert.equal(plain.addMult, 3);
  assert.equal(plain.xMult, 1);
  assert.equal(plain.equity, 180);

  assert.equal(overvolt.wins.length, 1);
  assert.equal(overvolt.wins[0]!.lineMult, 3);
  assert.equal(overvolt.wins[0]!.overvolt, true);
  assert.equal(overvolt.chips, 180);
  assert.equal(overvolt.equity, 540);
  for (const orb of overvolt.orbPlan) assert.equal(orb.chips, 60);
});

test('Seven uses x5 on a full line and x1.5 on a shorter match', () => {
  const full = byColumn(
    ['seven', 'diamond', 'cherry'],
    ['seven', 'skull', 'uranium'],
    ['seven', 'uranium', 'skull'],
  );
  const fullScore = scoreClassic(full);
  assert.equal(fullScore.wins.length, 1);
  assert.equal(fullScore.wins[0]!.symbolId, 'seven');
  assert.equal(fullScore.xMult, 5);
  assert.equal(fullScore.chips, 231);
  assert.equal(fullScore.equity, 9240);

  const partial = byColumn(
    ['seven', 'diamond', 'cherry'],
    ['seven', 'skull', 'uranium'],
    ['seven', 'uranium', 'skull'],
    ['cherry', 'diamond', 'seven'],
  );
  const partialScore = scoreClassic(partial);
  assert.equal(partialScore.wins.length, 1);
  assert.equal(partialScore.wins[0]!.cells.length, 3);
  assert.equal(partialScore.xMult, 1.5);
  assert.equal(partialScore.chips, 231);
  assert.equal(partialScore.equity, 2772);
});

test('external additive and x-multipliers compose into A and X', () => {
  const result = scoreClassic(
    byColumn(
      ['cherry', 'diamond', 'seven'],
      ['cherry', 'uranium', 'skull'],
      ['cherry', 'skull', 'uranium'],
    ),
    { extraAddMult: 2.5, extraXMult: 2 },
  );
  assert.equal(result.addMult, 5.5);
  assert.equal(result.xMult, 2);
  assert.equal(result.chips, 60);
  assert.equal(result.equity, 660);
});

test('a dead spin yields exactly one Scrap Copper orb worth 15% of the cheapest symbol', () => {
  assert.equal(DEFAULT_SYMBOL_STATS.cherry.chips, 20);
  assert.equal(scrapChips(), 3);
  assert.deepEqual(makeScrapOrbPlan(), [{ cell: null, symbolId: 'scrap', chips: 3 }]);

  const result = scoreClassic(DEAD);
  assert.equal(result.wins.length, 0);
  assert.equal(result.addMult, 1);
  assert.equal(result.xMult, 1);
  assert.equal(result.chips, 3);
  assert.equal(result.equity, 3);
  assert.deepEqual(result.orbPlan, [{ cell: null, symbolId: 'scrap', chips: 3 }]);
});

test('1e6 seeded CLASSIC spins never produce NaN or negative chips', () => {
  const rng = createRng('t010-property');
  const strips = [
    ['cherry', 'cherry', 'skull', 'uranium', 'cherry', 'diamond', 'seven'],
    ['cherry', 'skull', 'uranium', 'cherry', 'seven', 'diamond', 'skull'],
    ['cherry', 'uranium', 'diamond', 'skull', 'cherry', 'seven', 'uranium'],
  ] as const;

  let wins = 0;
  let dead = 0;
  for (let spin = 0; spin < 1_000_000; spin++) {
    const { grid } = drawGrid(rng, { rows: 3, strips });
    const result = scoreClassic(grid);
    if (result.wins.length === 0) {
      dead++;
      assert.equal(result.orbPlan.length, 1);
      assert.equal(result.orbPlan[0]!.cell, null);
    } else {
      wins++;
    }

    if (
      !Number.isFinite(result.chips) ||
      !Number.isFinite(result.addMult) ||
      !Number.isFinite(result.xMult) ||
      !Number.isFinite(result.equity) ||
      result.chips < 0 ||
      result.addMult < 1 ||
      result.xMult < 0 ||
      result.equity < 0
    ) {
      assert.fail(`invalid score at spin ${spin}: ${JSON.stringify(result)}`);
    }
    for (const orb of result.orbPlan) {
      if (!Number.isFinite(orb.chips) || orb.chips < 0) {
        assert.fail(`invalid orb at spin ${spin}: ${JSON.stringify(orb)}`);
      }
    }
  }

  assert.ok(wins > 0);
  assert.ok(dead > 0);
});

test('CLASSIC lines do not start or extend through boss-frozen cells', () => {
  const unfrozen = evaluateClassic(FULL_ROWS, { minMatch: 3 });
  assert.ok(unfrozen.some((win) => win.lineId === 'row:0'));

  const frozen = evaluateClassic(FULL_ROWS, { minMatch: 3, frozen: [[0, 0]] });
  assert.equal(
    frozen.some((win) => win.lineId === 'row:0'),
    false,
    'a line that starts on a frozen cell must not score',
  );

  const frozenMiddle = evaluateClassic(FULL_ROWS, {
    minMatch: 3,
    frozen: [[1, 0]],
  });
  assert.equal(
    frozenMiddle.some((win) => win.lineId === 'row:0'),
    false,
    'a line cannot extend through a frozen cell',
  );
});
