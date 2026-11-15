import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import type { ContentBundle, FloorDef, RunState, SaveFile, SymbolDef, TrinketDef } from '@jackpotsyndicate/contracts';
import {
  contentBundleSchema,
  gameEventSchema,
  gridFixtureSchema,
  saveFileSchema,
  symbolDefSchema,
  trinketDefSchema,
  floorDefSchema,
} from '@jackpotsyndicate/contracts';
import contentMin from '../fixtures/content.min.json';
import eventsSample from '../fixtures/events.sample.json';
import gridBase from '../fixtures/grids/base-3x3.json';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

export type _SymbolInference = Expect<Equal<z.infer<typeof symbolDefSchema>, SymbolDef>>;
export type _TrinketInference = Expect<Equal<z.infer<typeof trinketDefSchema>, TrinketDef>>;
export type _FloorInference = Expect<Equal<z.infer<typeof floorDefSchema>, FloorDef>>;
export type _ContentInference = Expect<Equal<z.infer<typeof contentBundleSchema>, ContentBundle>>;
export type _SaveInference = Expect<Equal<z.infer<typeof saveFileSchema>, SaveFile>>;

function roundTrip<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  const first = schema.parse(value);
  const second = schema.parse(JSON.parse(JSON.stringify(first)));
  assert.deepEqual(second, first);
  return first;
}

function sampleRun(): RunState {
  return {
    saveVersion: 1,
    seed: 'schema-seed',
    rng: { spin: [1, 2, 3] },
    tick: 12,
    phase: 'PREP',
    floorId: 'FLOOR_NEON',
    floorsCleared: [],
    round: 1,
    spinsLeft: 6,
    bankroll: 548,
    roundCash: 48,
    fever: 20,
    grid: {
      cols: 3,
      rows: 3,
      wiring: 'CLASSIC',
      strips: [['cherry', 'uranium', 'diamond']],
      visible: [['cherry', 'uranium', 'diamond']],
      frozen: [{ cell: [0, 0], spins: 2 }],
    },
    jumpers: [],
    overvoltLineId: null,
    trinkets: ['quantum-coil'],
    drinkTray: [null, 'martini', null],
    activeDrink: null,
    ownedCoins: ['copper'],
    loadedCoin: 'copper',
    nextSpin: { xBonus: { lip: 0.25 }, addMult: 1, bonusOrbs: 2 },
    shop: {
      capacity: 4,
      rerollCost: 25,
      expandCost: 150,
      archetype: null,
      offers: [],
    },
    boss: null,
    orbChips: { 100: 20 },
    tokenCash: { 200: 48 },
    stats: { spins: 1, lipDrops: 1, gutterLosses: 0, cashBanked: 48, bestSpinEquity: 60 },
  };
}

test('content.min.json has two symbols, two trinkets and one floor and validates', () => {
  const bundle = roundTrip(contentBundleSchema, contentMin);
  assert.equal(bundle.symbols.length, 2);
  assert.equal(bundle.items.filter((item) => item.category === 'TRINKET').length, 2);
  assert.equal(bundle.floors.length, 1);
  assert.equal(bundle.floors[0]!.id, 'FLOOR_NEON');
});

test('every sample event validates as a GameEvent and round-trips', () => {
  const events = eventsSample as unknown[];
  assert.ok(events.length > 0);
  for (const event of events) roundTrip(gameEventSchema, event);
  const parsed = events.map((event) => gameEventSchema.parse(event));
  assert.deepEqual(parsed.map((event) => event.tick), (eventsSample as { tick: number }[]).map((event) => event.tick));
  assert.equal(parsed[0]!.t, 'RunStarted');
  assert.equal(parsed.at(-1)!.t, 'PhaseChanged');
});

test('grid fixture validates and its expected win matches the grid', () => {
  const fixture = roundTrip(gridFixtureSchema, gridBase);
  assert.equal(fixture.wiring, 'CLASSIC');
  assert.equal(fixture.grid.length, fixture.cols);
  assert.ok(fixture.grid.every((column) => column.length === fixture.rows));
  const [win] = fixture.expected.wins;
  assert.ok(win);
  const symbols = win.cells.map(([col, row]) => fixture.grid[col]![row]);
  assert.deepEqual(symbols, [win.symbolId, win.symbolId, win.symbolId]);
});

test('SaveFile schema round-trips a complete run', () => {
  const run = sampleRun();
  const save: SaveFile = {
    saveVersion: 1,
    contractsRev: 1,
    run,
    simBase64: '',
    stateHash: '0123456789abcdef',
  };
  const parsed = roundTrip(saveFileSchema, save);
  assert.equal(parsed.run.seed, run.seed);
  assert.deepEqual(parsed.run, run);
});

test('schemas reject malformed content', () => {
  const bad = structuredClone(contentMin) as { symbols: { rarity: string }[] };
  bad.symbols[0]!.rarity = 'mythic';
  assert.equal(contentBundleSchema.safeParse(bad).success, false);
});
