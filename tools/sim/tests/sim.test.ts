import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { RunState } from '../../../packages/contracts/src/index';
import { greedySynergyBot, randomBuyerBot, type Bot } from '../src/bots';
import { SimRng } from '../src/rng';
import { main, parseCli } from '../src/index';
import { playRun } from '../src/runner';
import { readGolden, verifyGolden } from '../src/golden';
import {
  emptyRunStats,
  summariseBalance,
  writeBalanceReports,
  writeHitRateReports,
  writeRakeReports,
  type HitRateResult,
  type RakeFloorResult,
} from '../src/reports';
import type { RunResult } from '../src/runner';

const ALLOWED_COMMANDS = new Set([
  'NewRun',
  'LoadCoin',
  'Drink',
  'Spin',
  'ContinueAfterRound',
  'ShopBuy',
  'ShopReroll',
  'ShopExpand',
  'ShopLeave',
  'ChooseFloor',
  'ChooseRelic',
  'ChooseJumper',
  'SetOvervolt',
  'AbandonRun',
]);

function offer(
  index: number,
  itemId: string,
  category: 'TRINKET' | 'DRINK' | 'REEL' | 'COIN' | 'CHASSIS',
  price: number,
) {
  return { offerId: `offer-${index}`, itemId, category, price, sold: false };
}

function fakeState(overrides: Partial<Record<string, unknown>> = {}): RunState {
  return {
    seed: 'test-seed',
    tick: 12,
    phase: 'SHOP',
    floorId: 'FLOOR_NEON',
    round: 1,
    bankroll: 1000,
    drinkTray: [null, null, null],
    activeDrink: null,
    loadedCoin: 'copper',
    overvoltLineId: null,
    grid: { cols: 3, rows: 3 },
    shop: {
      rerollCost: 25,
      offers: [
        offer(0, 'vampiricStepperMotor', 'TRINKET', 300),
        offer(1, 'goldPegAlchemist', 'TRINKET', 250),
        offer(2, 'cherryGlyph', 'REEL', 90),
        offer(3, 'dirtySyndicateMartini', 'DRINK', 110),
        offer(4, 'bloodDoubloon', 'COIN', 200),
      ],
    },
    ...overrides,
  } as unknown as RunState;
}

function assertPublicCommands(commands: readonly { c: string }[]): void {
  for (const command of commands) {
    assert.ok(ALLOWED_COMMANDS.has(command.c), `unexpected command ${command.c}`);
  }
}

test('CLI parses commands, values, equals form and boolean flags', () => {
  const parsed = parseCli([
    'balance',
    '--runs',
    '200',
    '--bot=greedy-synergy',
    '--out',
    'artifacts/sim',
    '--quiet',
  ]);
  assert.equal(parsed.command, 'balance');
  assert.deepEqual(parsed.options, {
    runs: '200',
    bot: 'greedy-synergy',
    out: 'artifacts/sim',
    quiet: true,
  });
  assert.deepEqual(parsed.positionals, []);

  const replay = parseCli(['replay', '--record', '--fixture', 'fixtures/replay.golden.json']);
  assert.equal(replay.command, 'replay');
  assert.equal(replay.options.record, true);
  assert.equal(replay.options.fixture, 'fixtures/replay.golden.json');

  assert.equal(parseCli([]).command, 'help');
  assert.throws(() => parseCli(['balance', '--runs']), /needs a value/);
  assert.throws(() => parseCli(['balance', '-n']), /unknown short option/);
});

test('CLI validation rejects bad numeric and unknown options', async () => {
  await assert.rejects(main(['balance', '--runs', '0']), /--runs must be an integer/);
  await assert.rejects(main(['balance', '--nope', '1']), /unknown option --nope/);
  await assert.rejects(main(['bogus']), /unknown command "bogus"/);
});

test('random buyer is deterministic and only emits public commands', () => {
  const state = fakeState();
  const first = randomBuyerBot.shop(state, new SimRng('same-seed'));
  const second = randomBuyerBot.shop(state, new SimRng('same-seed'));
  assert.deepEqual(first, second);
  assertPublicCommands(first.buy);

  for (const command of first.buy) {
    if (command.c === 'ShopBuy') {
      const matching = state.shop.offers.find((entry) => entry.offerId === command.offerId);
      assert.ok(matching !== undefined);
      if (matching.category === 'REEL') {
        assert.equal(typeof command.target?.reel, 'number', 'REEL buys need a reel target');
      }
    }
  }

  const noFunds = fakeState({ bankroll: 0 });
  const plan = randomBuyerBot.shop(noFunds, new SimRng('same-seed'));
  assert.equal(plan.buy.length, 0);
});

test('greedy synergy bot prioritises high-value items, floors and relics', () => {
  const state = fakeState();
  const plan = greedySynergyBot.shop(state, new SimRng('greedy'));
  assertPublicCommands(plan.buy);

  const order = plan.buy
    .filter((command) => command.c === 'ShopBuy')
    .map((command) => state.shop.offers.find((entry) => entry.offerId === (command as { offerId: string }).offerId)?.itemId);
  assert.deepEqual(order.slice(0, 2), ['vampiricStepperMotor', 'goldPegAlchemist']);

  const glyph = plan.buy.find((command) => {
    if (command.c !== 'ShopBuy') return false;
    const entry = state.shop.offers.find((candidate) => candidate.offerId === command.offerId);
    return entry?.category === 'REEL';
  });
  assert.ok(glyph !== undefined);
  assert.equal(typeof (glyph as { target?: { reel?: number } }).target?.reel, 'number');

  const poor = fakeState({
    bankroll: 100,
    shop: {
      rerollCost: 10,
      offers: [offer(0, 'vampiricStepperMotor', 'TRINKET', 300)],
    },
  });
  const poorPlan = greedySynergyBot.shop(poor, new SimRng('greedy'));
  assert.equal(poorPlan.buy.length, 0);
  assert.equal(poorPlan.reroll, true);

  assert.equal(greedySynergyBot.floor(['FLOOR_CRYO', 'FLOOR_FOUNDRY'], new SimRng('f')), 'FLOOR_FOUNDRY');
  assert.equal(
    greedySynergyBot.relic(['cherryGlyph', 'vampiricStepperMotor', 'midasLipSensor'], new SimRng('r')),
    1,
  );
});

test('greedy prep drinks, loads the best coin and sets overvolt', () => {
  const state = fakeState({
    drinkTray: ['nitrousEspresso', 'greenFairyAbsinthe', null],
    activeDrink: null,
    loadedCoin: 'copper',
    overvoltLineId: null,
  });
  const commands = greedySynergyBot.prep(
    state,
    new Set(['bloodDoubloon', 'overvolt']),
    new SimRng('prep'),
  );
  assertPublicCommands(commands);
  assert.deepEqual(commands, [
    { c: 'Drink', slot: 1 },
    { c: 'LoadCoin', coinId: 'bloodDoubloon' },
    { c: 'SetOvervolt', lineId: 'row:1' },
  ]);
});

function fakeResult(overrides: Partial<RunResult> & Pick<RunResult, 'bot' | 'seed'>): RunResult {
  return {
    outcome: 'defeat',
    finalPhase: 'GAME_OVER',
    floorId: 'FLOOR_NEON',
    round: 1,
    floorsCleared: [],
    clearedFloor1: false,
    won: false,
    bankroll: 500,
    maxBankroll: 500,
    ticks: 100,
    commandLog: [{ tick: 0, cmd: { c: 'NewRun', seed: overrides.seed } }],
    finalHash: '0123456789abcdef01234567',
    stats: emptyRunStats(),
    ...overrides,
  };
}

test('balance reports have stable CSV and Markdown shapes', async () => {
  const results: RunResult[] = [
    fakeResult({
      bot: 'random-buyer',
      seed: 'run-a',
      clearedFloor1: true,
      floorsCleared: ['FLOOR_NEON'],
    }),
    fakeResult({
      bot: 'random-buyer',
      seed: 'run-b',
    }),
    fakeResult({
      bot: 'greedy-synergy',
      seed: 'run-c',
      outcome: 'victory',
      finalPhase: 'VICTORY',
      floorId: 'FLOOR_PENTHOUSE',
      round: 4,
      won: true,
      clearedFloor1: true,
      floorsCleared: ['FLOOR_NEON', 'FLOOR_FOUNDRY', 'FLOOR_PENTHOUSE'],
    }),
  ];

  const summary = summariseBalance(results);
  const random = summary.find((entry) => entry.bot === 'random-buyer');
  assert.ok(random !== undefined);
  assert.equal(random.runs, 2);
  assert.equal(random.floor1Clears, 1);
  assert.equal(random.floor1Rate, 0.5);
  assert.equal(random.winRate, 0);

  const out = await mkdtemp(join(tmpdir(), 'sim-reports-'));
  const paths = await writeBalanceReports(out, results);
  assert.equal(paths.length, 3);

  const csv = await readFile(join(out, 'balance.csv'), 'utf8');
  const lines = csv.trim().split('\n');
  assert.equal(
    lines[0],
    'bot,seed,outcome,finalPhase,floorId,round,floorsCleared,clearedFloor1,won,bankroll,maxBankroll,spins,lipDrops,gutterLosses,cashBanked,ticks',
  );
  assert.equal(lines.length, 4);

  const md = await readFile(join(out, 'balance.md'), 'utf8');
  assert.match(md, /# Balance report \(AC-6\)/);
  assert.match(md, /random-buyer/);
  assert.match(md, /Floor 1 clear rate/);

  const best = await readFile(join(out, 'balance-best-run.md'), 'utf8');
  assert.match(best, /run-c/);
});

test('rake and hit-rate reports keep the documented columns', async () => {
  const out = await mkdtemp(join(tmpdir(), 'sim-reports-'));
  const rake: RakeFloorResult = {
    floorId: 'FLOOR_NEON',
    floorName: 'The Neon Vault',
    spins: 21,
    runs: 1,
    lipDrops: 10,
    gutterLosses: 10,
    rake: 0.5,
    target: 0.18,
    tolerance: 0.04,
    inBand: false,
  };
  await writeRakeReports(out, [rake]);
  const rakeCsv = await readFile(join(out, 'rake.csv'), 'utf8');
  assert.equal(
    rakeCsv.trim().split('\n')[0],
    'floor,floorName,runs,spins,lipDrops,gutterLosses,rake,target,tolerance,inBand',
  );

  const hit: HitRateResult = {
    spins: 100,
    evaluations: 100,
    winningEvaluations: 40,
    hitRate: 0.4,
    targetLow: 0.3,
    targetHigh: 0.45,
    inBand: true,
    ticks: 1000,
  };
  await writeHitRateReports(out, hit);
  const hitCsv = await readFile(join(out, 'hitrate.csv'), 'utf8');
  assert.equal(
    hitCsv.trim().split('\n')[0],
    'spins,evaluations,winningEvaluations,hitRate,targetLow,targetHigh,inBand,ticks',
  );
  const hitMd = await readFile(join(out, 'hitrate.md'), 'utf8');
  assert.match(hitMd, /PASS/);
});

test('a seeded headless run replays to the same hash and uses only public commands', () => {
  const first = playRun({ seed: 'sim:random-buyer:0', bot: 'random-buyer', maxTicks: 30_000 });
  const second = playRun({ seed: 'sim:random-buyer:0', bot: 'random-buyer', maxTicks: 30_000 });

  assert.equal(first.finalHash, second.finalHash);
  assert.equal(first.ticks, second.ticks);
  assert.equal(first.finalHash.length, 24);
  assert.equal(first.commandLog[0]?.cmd.c, 'NewRun');
  assertPublicCommands(first.commandLog.map((entry) => entry.cmd));
});

test('the golden fixture is shaped correctly and replays to its expected hash', async () => {
  const fixture = await readGolden(resolve(process.cwd(), 'fixtures/replay.golden.json'));
  assert.equal(typeof fixture.seed, 'string');
  assert.equal(fixture.commandLog[0]?.cmd.c, 'NewRun');
  assert.ok(fixture.expectedHash.length >= 16);
  if (fixture.reachedVictory) assert.equal(fixture.flagged, false);

  const verification = verifyGolden(fixture);
  assert.equal(verification.match, true);
  assert.equal(verification.actualHash, fixture.expectedHash);
});

test('bots are structurally compatible with the exported Bot interface', () => {
  const bots: Bot[] = [randomBuyerBot, greedySynergyBot];
  for (const bot of bots) {
    assert.ok(bot.id === 'random-buyer' || bot.id === 'greedy-synergy');
    const plan = bot.shop(fakeState(), new SimRng(bot.id));
    assert.ok(Array.isArray(plan.buy));
  }
});
