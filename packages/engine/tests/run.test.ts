import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANIM_TICKS,
  RULES,
  SIM,
  type BalanceDef,
  type Command,
  type CommandResult,
  type EngineEvent,
  type FloorDef,
  type FloorId,
  type ItemDef,
  type Phase,
  type RoundResult,
  type RunState,
} from '@jackpotsyndicate/contracts';
import {
  COMMAND_PHASES,
  RunMachine,
  commandAllowed,
  createRunState,
  normalRoundIndex,
  quotaForNormalRound,
  type CommandName,
  type RunContent,
} from '../src/run/index.js';

const PHASES: readonly Phase[] = [
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

/** The expected phase table, written independently of COMMAND_PHASES. */
const LEGAL: Record<Phase, readonly CommandName[]> = {
  TITLE: ['NewRun'],
  PREP: ['NewRun', 'AbandonRun', 'LoadCoin', 'Drink', 'Spin', 'SetOvervolt'],
  SPINNING: ['NewRun', 'AbandonRun'],
  RESOLVING: ['NewRun', 'AbandonRun'],
  ROUND_SETTLE: ['NewRun', 'AbandonRun'],
  ROUND_RESULT: ['NewRun', 'AbandonRun', 'ContinueAfterRound'],
  SHOP: ['NewRun', 'AbandonRun', 'ShopBuy', 'ShopReroll', 'ShopExpand', 'ShopLeave'],
  RELIC_PICK: ['NewRun', 'AbandonRun', 'ChooseRelic'],
  JUMPER_PICK: ['NewRun', 'AbandonRun', 'ChooseJumper'],
  BOSS_INTRO: ['NewRun', 'AbandonRun', 'ContinueAfterRound'],
  ELEVATOR: ['NewRun', 'AbandonRun', 'ChooseFloor'],
  FLOOR_TRANSITION: ['NewRun', 'AbandonRun'],
  GAME_OVER: ['NewRun'],
  VICTORY: ['NewRun'],
};

const COMMANDS: readonly Command[] = [
  { c: 'NewRun', seed: 'command-table' },
  { c: 'AbandonRun' },
  { c: 'LoadCoin', coinId: 'copper' },
  { c: 'Drink', slot: 0 },
  { c: 'Spin' },
  { c: 'ContinueAfterRound' },
  { c: 'ShopBuy', offerId: 'offer-0' },
  { c: 'ShopReroll' },
  { c: 'ShopExpand' },
  { c: 'ShopLeave' },
  { c: 'ChooseFloor', floorId: 'FLOOR_CRYO' },
  { c: 'ChooseRelic', index: 0 },
  { c: 'ChooseJumper', index: 0 },
  { c: 'SetOvervolt', lineId: null },
];

function floorDef(
  id: FloorId,
  order: 1 | 2 | 3,
  next: FloorId[],
  quotaScale = 1,
): FloorDef {
  return {
    id,
    name: id,
    order,
    next,
    bossId: 'valenti',
    physics: { friction: 0.9, gutterRisk: 1, dozerSpeed: 0.05, pegs: [] },
    chuteMults: [0.8, 1.5, 3, 1.5, 2],
    pegChips: { gold: 5, bumper: 15, golden: 30, splitter: 10 },
    lipMult: 1,
    quotaScale,
    shop: {
      archetypeWeights: { DRINKS: 25, TRINKETS: 25, REELS: 25, MIXED: 25 },
      categoryWeights: { TRINKET: 20, DRINK: 20, REEL: 20, COIN: 20, CHASSIS: 20 },
      rarityWeights: { common: 1, rare: 1, epic: 1, legendary: 1, cursed: 1 },
    },
    bgSpriteKey: 'bg',
  };
}

const BALANCE: BalanceDef = {
  startBankroll: 500,
  cashPerChip: 1,
  quotas: [1000, 2100, 4410, 9261, 19448, 40841, 85766, 180109, 378229],
  minMatch: 3,
  baseStrip: ['cherry', 'diamond', 'seven', 'skull', 'uranium'],
  firstReelStrip: ['cherry', 'cherry', 'diamond', 'seven', 'skull'],
};

const ITEMS: readonly ItemDef[] = [
  {
    id: 'relic-a',
    name: 'Relic A',
    desc: '',
    price: 100,
    spriteKey: 'trinket.relic-a',
    rarity: 'common',
    category: 'TRINKET',
    effects: [],
  },
  {
    id: 'relic-b',
    name: 'Relic B',
    desc: '',
    price: 120,
    spriteKey: 'trinket.relic-b',
    rarity: 'rare',
    category: 'TRINKET',
    effects: [],
  },
  {
    id: 'drink-a',
    name: 'Drink A',
    desc: '',
    price: 110,
    spriteKey: 'drink.a',
    rarity: 'common',
    category: 'DRINK',
    instant: false,
    effects: [],
  },
];

const CONTENT: RunContent = {
  balance: BALANCE,
  items: ITEMS,
  floors: [
    floorDef('FLOOR_NEON', 1, ['FLOOR_CRYO', 'FLOOR_FOUNDRY']),
    floorDef('FLOOR_CRYO', 2, ['FLOOR_PENTHOUSE'], 1),
    floorDef('FLOOR_FOUNDRY', 2, ['FLOOR_PENTHOUSE'], 1),
    floorDef('FLOOR_PENTHOUSE', 3, [], 2.2),
  ],
};

function started(seed = 'seed-1'): RunMachine {
  const machine = RunMachine.newRun(CONTENT, seed);
  assert.deepEqual(machine.dispatch({ c: 'NewRun', seed }), { ok: true });
  machine.drainEvents();
  return machine;
}

function stateAtPhase(phase: Phase): RunState {
  const state = createRunState(CONTENT, `phase:${phase}`);
  state.phase = phase;
  state.bankroll = 10_000;
  state.spinsLeft = RULES.SPINS_PER_ROUND;
  return state;
}

function roundSettled(events: readonly EngineEvent[]): RoundResult {
  const settled = events.find(
    (event): event is Extract<EngineEvent, { t: 'RoundSettled' }> =>
      event.t === 'RoundSettled',
  );
  assert.ok(settled, 'expected a RoundSettled event');
  return settled.result;
}

function advance(machine: RunMachine, ticks: number): EngineEvent[] {
  const out: EngineEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...machine.tick());
  return out;
}

function spinOnce(machine: RunMachine): void {
  assert.deepEqual(machine.dispatch({ c: 'Spin' }), { ok: true });
  assert.deepEqual(machine.beginResolving(), { ok: true });
  assert.deepEqual(machine.spinResolved(), { ok: true });
}

function playRound(machine: RunMachine): void {
  for (let spin = 0; spin < RULES.SPINS_PER_ROUND; spin++) spinOnce(machine);
  assert.equal(machine.getPhase(), 'ROUND_SETTLE');
  assert.equal(machine.getState().spinsLeft, 0);
}

function playNormalRound(machine: RunMachine): RoundResult {
  machine.bank(1_000_000);
  playRound(machine);
  const result = roundSettled(advance(machine, SIM.ROUND_SETTLE_TICKS));
  assert.equal(machine.getPhase(), 'ROUND_RESULT');
  assert.equal(result.kind, 'normal');
  assert.equal(result.passed, true);
  assert.deepEqual(machine.dispatch({ c: 'ContinueAfterRound' }), { ok: true });
  assert.equal(machine.getPhase(), 'SHOP');
  assert.deepEqual(machine.dispatch({ c: 'ShopLeave' }), { ok: true });
  return result;
}

function winBoss(machine: RunMachine): void {
  assert.equal(machine.getPhase(), 'BOSS_INTRO');
  assert.deepEqual(machine.dispatch({ c: 'ContinueAfterRound' }), { ok: true });
  assert.equal(machine.getPhase(), 'PREP');
  machine.bank(1_000_000);
  assert.deepEqual(machine.recordBossScore(500), { ok: true });
  playRound(machine);
  const result = roundSettled(advance(machine, SIM.ROUND_SETTLE_TICKS));
  assert.equal(result.kind, 'boss');
  assert.equal(result.passed, true);
  assert.equal(machine.getPhase(), 'ROUND_RESULT');
  assert.deepEqual(machine.dispatch({ c: 'ContinueAfterRound' }), { ok: true });
}

// --------------------------------------------------------------- phase table

test('every illegal command is rejected with WRONG_PHASE and no state change', () => {
  const expected: Partial<Record<CommandName, Phase[]>> = {};
  for (const phase of PHASES) {
    for (const name of LEGAL[phase]) {
      (expected[name] ??= []).push(phase);
    }
  }
  for (const [name, phases] of Object.entries(COMMAND_PHASES)) {
    assert.deepEqual(
      [...phases].sort(),
      [...(expected[name as CommandName] ?? [])].sort(),
      `${name} phase allow-list`,
    );
  }

  for (const phase of PHASES) {
    for (const command of COMMANDS) {
      if (LEGAL[phase].includes(command.c)) continue;
      const machine = RunMachine.fromState(CONTENT, stateAtPhase(phase));
      const before = JSON.stringify(machine.getState());
      const result = machine.dispatch(command);
      assert.deepEqual(
        result,
        { ok: false, error: 'WRONG_PHASE' },
        `${command.c} must be illegal in ${phase}`,
      );
      assert.equal(JSON.stringify(machine.getState()), before, `${command.c} mutated ${phase}`);
      assert.equal(machine.drainEvents().length, 0, `${command.c} emitted events in ${phase}`);
      assert.equal(commandAllowed(phase, command), false);
    }
  }
});

test('every command the table allows is not rejected for its phase', () => {
  for (const phase of PHASES) {
    for (const command of COMMANDS) {
      if (!LEGAL[phase].includes(command.c)) continue;
      const machine = RunMachine.fromState(CONTENT, stateAtPhase(phase));
      const result: CommandResult = machine.dispatch(command);
      if (!result.ok) {
        assert.notEqual(result.error, 'WRONG_PHASE', `${command.c} in ${phase}`);
      }
      assert.equal(commandAllowed(phase, command), true);
    }
  }
});

test('a spin is refused while orbs are in flight, with no state change', () => {
  const machine = started();
  machine.setOrbsInFlight(2);
  const before = JSON.stringify(machine.getState());
  assert.deepEqual(machine.dispatch({ c: 'Spin' }), { ok: false, error: 'ORBS_IN_FLIGHT' });
  assert.equal(JSON.stringify(machine.getState()), before);
  machine.setOrbsInFlight(0);
  assert.deepEqual(machine.dispatch({ c: 'Spin' }), { ok: true });
});

// --------------------------------------------------------------- quota rule

test('quota formula uses the global normal-round index and floor scale', () => {
  assert.equal(quotaForNormalRound(BALANCE, 1), 1000);
  assert.equal(quotaForNormalRound(BALANCE, 3), 4410);
  assert.equal(quotaForNormalRound(BALANCE, 4), 9261);
  assert.equal(quotaForNormalRound(BALANCE, 9), 378229);
  assert.equal(quotaForNormalRound(BALANCE, 1, 2.2), 2200);
  assert.equal(quotaForNormalRound(BALANCE, 3, 2.2), 9702);

  const neon = CONTENT.floors[0]!;
  const cryo = CONTENT.floors[1]!;
  assert.equal(normalRoundIndex(neon, 1), 1);
  assert.equal(normalRoundIndex(neon, 3), 3);
  assert.equal(normalRoundIndex(cryo, 1), 4);
  assert.equal(normalRoundIndex(cryo, 3), 6);
  assert.equal(normalRoundIndex(CONTENT.floors[3]!, 1), 7);
});

test('quota deduction and round progression are exact', () => {
  const machine = started();

  machine.bank(2500);
  assert.equal(machine.getState().bankroll, 3000);
  playRound(machine);
  assert.equal(machine.getPhase(), 'ROUND_SETTLE');
  advance(machine, SIM.ROUND_SETTLE_TICKS - 1);
  assert.equal(machine.getPhase(), 'ROUND_SETTLE');

  const first = roundSettled(advance(machine, 1));
  assert.deepEqual(first, {
    kind: 'normal',
    passed: true,
    quota: 1000,
    bankrollBefore: 3000,
    bankrollAfter: 2000,
  });
  assert.equal(machine.getState().bankroll, 2000);
  assert.equal(machine.getPhase(), 'ROUND_RESULT');

  machine.dispatch({ c: 'ContinueAfterRound' });
  assert.equal(machine.getPhase(), 'SHOP');
  machine.dispatch({ c: 'ShopLeave' });
  assert.equal(machine.getPhase(), 'PREP');
  assert.equal(machine.getState().round, 2);
  assert.equal(machine.getState().spinsLeft, RULES.SPINS_PER_ROUND);
  assert.equal(machine.getState().roundCash, 0);

  machine.bank(500);
  playRound(machine);
  const second = roundSettled(advance(machine, SIM.ROUND_SETTLE_TICKS));
  assert.deepEqual(second, {
    kind: 'normal',
    passed: true,
    quota: 2100,
    bankrollBefore: 2500,
    bankrollAfter: 400,
  });
  assert.equal(machine.getState().bankroll, 400);

  machine.dispatch({ c: 'ContinueAfterRound' });
  machine.dispatch({ c: 'ShopLeave' });
  assert.equal(machine.getState().round, 3);

  machine.bank(1000);
  playRound(machine);
  const third = roundSettled(advance(machine, SIM.ROUND_SETTLE_TICKS));
  assert.deepEqual(third, {
    kind: 'normal',
    passed: false,
    quota: 4410,
    bankrollBefore: 1400,
    bankrollAfter: 1400,
  });
  assert.equal(machine.getState().bankroll, 1400, 'a failed quota is not deducted');

  const events = machine.drainEvents();
  assert.deepEqual(machine.dispatch({ c: 'ContinueAfterRound' }), { ok: true });
  assert.equal(machine.getPhase(), 'GAME_OVER');
  const ended = [...events, ...machine.drainEvents()].find(
    (event): event is Extract<EngineEvent, { t: 'RunEnded' }> => event.t === 'RunEnded',
  );
  assert.equal(ended?.outcome, 'defeat');
});

// ------------------------------------------------------------------- fever

test('fever gains 20 per spin, triggers at 100 and resets to 20', () => {
  const machine = started();
  const values: number[] = [];
  for (let spin = 1; spin <= 5; spin++) {
    assert.deepEqual(machine.dispatch({ c: 'Spin' }), { ok: true });
    const events = machine.drainEvents();
    values.push(machine.getState().fever);
    if (spin < 5) assert.equal(events.some((event) => event.t === 'FeverTriggered'), false);
    if (spin === 5) {
      assert.equal(events.some((event) => event.t === 'FeverTriggered'), true);
      assert.equal(machine.getState().nextSpin.bonusOrbs, RULES.FEVER_ORBS);
      assert.deepEqual(machine.drainDirectives(), [{ t: 'surge' }]);
    }
    // Keep the state machine in PREP without advancing rounds in this unit test.
    machine.setOrbsInFlight(0);
    machine.getState().spinsLeft = RULES.SPINS_PER_ROUND;
    machine.beginResolving();
    machine.spinResolved();
  }
  assert.deepEqual(values, [20, 40, 60, 80, RULES.FEVER_RESET]);

  const later = started('fever-six');
  for (let spin = 1; spin <= 9; spin++) {
    later.getState().spinsLeft = RULES.SPINS_PER_ROUND;
    later.dispatch({ c: 'Spin' });
    const fired = later.drainEvents().some((event) => event.t === 'FeverTriggered');
    if (spin === 5 || spin === 9) assert.equal(fired, true, `fever at spin ${spin}`);
    else assert.equal(fired, false, `fever at spin ${spin}`);
    later.beginResolving();
    later.spinResolved();
  }
  assert.equal(later.getState().fever, RULES.FEVER_RESET);
});

// ---------------------------------------------------------- floor graph

test('three normal rounds, boss duel, relic pick and floor graph progress exactly', () => {
  const machine = started('floor-run');
  assert.equal(machine.getState().floorId, 'FLOOR_NEON');
  assert.equal(machine.getState().round, 1);

  playNormalRound(machine);
  assert.equal(machine.getState().round, 2);
  playNormalRound(machine);
  assert.equal(machine.getState().round, 3);
  playNormalRound(machine);

  assert.equal(machine.getPhase(), 'BOSS_INTRO');
  assert.equal(machine.getState().round, RULES.NORMAL_ROUNDS_PER_FLOOR + 1);
  assert.equal(machine.getState().spinsLeft, RULES.SPINS_PER_ROUND);
  assert.deepEqual(machine.getState().boss, { score: 0, spin: 0 });
  assert.equal(advance(machine, ANIM_TICKS.bossIntro).some((event) => event.t === 'PhaseChanged'), true);
  assert.equal(machine.getPhase(), 'PREP');

  machine.bank(1_000_000);
  machine.recordBossScore(500);
  playRound(machine);
  const bossResult = roundSettled(advance(machine, SIM.ROUND_SETTLE_TICKS));
  assert.equal(bossResult.kind, 'boss');
  assert.equal(bossResult.passed, true);
  assert.equal(machine.getPhase(), 'ROUND_RESULT');

  const bossEvents = machine.drainEvents();
  machine.dispatch({ c: 'ContinueAfterRound' });
  assert.equal(machine.getPhase(), 'RELIC_PICK');
  assert.equal(bossEvents.some((event) => event.t === 'RunEnded'), false);

  assert.equal(machine.getState().trinkets.length, 0);
  assert.deepEqual(machine.dispatch({ c: 'ChooseRelic', index: 0 }), { ok: true });
  assert.equal(machine.getState().trinkets.length, 1);
  assert.equal(machine.getPhase(), 'ELEVATOR');
  assert.deepEqual(machine.getState().floorsCleared, ['FLOOR_NEON']);

  const beforeInvalid = JSON.stringify(machine.getState());
  assert.deepEqual(machine.dispatch({ c: 'ChooseFloor', floorId: 'FLOOR_PENTHOUSE' }), {
    ok: false,
    error: 'INVALID_TARGET',
  });
  assert.equal(JSON.stringify(machine.getState()), beforeInvalid);
  assert.equal(machine.getPhase(), 'ELEVATOR');

  assert.deepEqual(machine.dispatch({ c: 'ChooseFloor', floorId: 'FLOOR_CRYO' }), { ok: true });
  assert.equal(machine.getPhase(), 'FLOOR_TRANSITION');
  assert.equal(machine.getState().floorId, 'FLOOR_CRYO');
  advance(machine, ANIM_TICKS.floorTransition - 1);
  assert.equal(machine.getPhase(), 'FLOOR_TRANSITION');
  advance(machine, 1);
  assert.equal(machine.getPhase(), 'PREP');
  assert.equal(machine.getState().round, 1);
  assert.equal(machine.getState().spinsLeft, RULES.SPINS_PER_ROUND);
  assert.equal(machine.currentQuota(), 9261);

  const cryoRound = playNormalRound(machine);
  assert.deepEqual(cryoRound, {
    kind: 'normal',
    passed: true,
    quota: 9261,
    bankrollBefore: machine.getState().bankroll + 9261,
    bankrollAfter: machine.getState().bankroll,
  });
  playNormalRound(machine);
  playNormalRound(machine);
  winBoss(machine);
  assert.equal(machine.getPhase(), 'RELIC_PICK');
  machine.dispatch({ c: 'ChooseRelic', index: 0 });
  assert.equal(machine.getPhase(), 'ELEVATOR');
  assert.deepEqual(machine.getState().floorsCleared, ['FLOOR_NEON', 'FLOOR_CRYO']);

  machine.dispatch({ c: 'ChooseFloor', floorId: 'FLOOR_PENTHOUSE' });
  advance(machine, ANIM_TICKS.floorTransition);
  assert.equal(machine.getPhase(), 'PREP');
  assert.equal(machine.getState().floorId, 'FLOOR_PENTHOUSE');
  assert.equal(machine.currentQuota(), Math.round(85766 * 2.2));

  const penthouseRound = playNormalRound(machine);
  assert.equal(penthouseRound.kind, 'normal');
  assert.equal(penthouseRound.quota, 188685);
  playNormalRound(machine);
  playNormalRound(machine);
  winBoss(machine);
  assert.equal(machine.getPhase(), 'VICTORY');
  const ended = machine.drainEvents().find(
    (event): event is Extract<EngineEvent, { t: 'RunEnded' }> => event.t === 'RunEnded',
  );
  assert.equal(ended?.outcome, 'victory');
  assert.equal(machine.getState().seed, 'floor-run');
});

test('losing the boss duel ends the run with no quota deduction', () => {
  const machine = started('boss-loss');
  playNormalRound(machine);
  playNormalRound(machine);
  playNormalRound(machine);
  machine.dispatch({ c: 'ContinueAfterRound' });
  assert.equal(machine.getPhase(), 'PREP');

  machine.bank(400);
  machine.recordBossScore(10_000);
  const bankrollBefore = machine.getState().bankroll;
  playRound(machine);
  const result = roundSettled(advance(machine, SIM.ROUND_SETTLE_TICKS));
  assert.deepEqual(result, {
    kind: 'boss',
    passed: false,
    playerScore: 400,
    bossScore: 10_000,
  });
  assert.equal(machine.getState().bankroll, bankrollBefore);

  machine.dispatch({ c: 'ContinueAfterRound' });
  assert.equal(machine.getPhase(), 'GAME_OVER');
});

test('abandoning a run is legal in every active phase and ends it', () => {
  for (const phase of PHASES) {
    const machine = RunMachine.fromState(CONTENT, stateAtPhase(phase));
    const result = machine.dispatch({ c: 'AbandonRun' });
    if (phase === 'TITLE' || phase === 'GAME_OVER' || phase === 'VICTORY') {
      assert.deepEqual(result, { ok: false, error: 'WRONG_PHASE' });
    } else {
      assert.deepEqual(result, { ok: true });
      assert.equal(machine.getPhase(), 'GAME_OVER');
    }
  }
});

// -------------------------------------------------------------------- seed

test('the same seed reproduces the first grid and RNG; NewRun reseeds exactly', () => {
  const a = started('alpha');
  const b = started('alpha');
  const c = started('beta');
  const bStart = structuredClone(b.getState());

  a.dispatch({ c: 'Spin' });
  b.dispatch({ c: 'Spin' });
  c.dispatch({ c: 'Spin' });

  assert.deepEqual(a.getState().grid.visible, b.getState().grid.visible);
  assert.deepEqual(a.getState().rng, b.getState().rng);
  assert.notDeepEqual(a.getState().rng, c.getState().rng);

  const firstGrid = structuredClone(a.getState().grid.visible);
  const firstReels = [...a.getState().rng.reels!];
  a.dispatch({ c: 'NewRun', seed: 'alpha' });
  assert.equal(a.getState().phase, 'PREP');
  assert.equal(a.getState().tick, 0);
  assert.deepEqual(a.getState().grid.visible, bStart.grid.visible);
  assert.deepEqual(a.getState().rng, bStart.rng);
  assert.notDeepEqual(a.getState().grid.visible, firstGrid, 'a spin advanced the reels');
  assert.notDeepEqual(a.getState().rng.reels, firstReels);
});

test('tick-driven phases use the contract durations', () => {
  const machine = started();
  const state = machine.getState();
  state.phase = 'ROUND_SETTLE';
  state.round = 1;
  state.spinsLeft = 0;
  const resumed = RunMachine.fromState(CONTENT, state);
  advance(resumed, SIM.ROUND_SETTLE_TICKS - 1);
  assert.equal(resumed.getPhase(), 'ROUND_SETTLE');
  advance(resumed, 1);
  assert.equal(resumed.getPhase(), 'ROUND_RESULT');

  const boss = started();
  boss.getState().phase = 'BOSS_INTRO';
  const bossResumed = RunMachine.fromState(CONTENT, boss.getState());
  advance(bossResumed, ANIM_TICKS.bossIntro - 1);
  assert.equal(bossResumed.getPhase(), 'BOSS_INTRO');
  advance(bossResumed, 1);
  assert.equal(bossResumed.getPhase(), 'PREP');
});
