import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RULES,
  type BalanceDef,
  type BossDef,
  type FloorDef,
  type FloorId,
  type RunState,
} from '@jackpotsyndicate/contracts';
import {
  BOSSES,
  BOSS_DEFINITIONS,
  BOSS_IDS,
  BOSS_PHASE_IDS,
  BOSS_PHASE_THRESHOLDS,
  BossEncounter,
  advanceFrozen,
  applyBossReward,
  applyDamage,
  bossIdForSeed,
  bossReward,
  bossScoreForSpin,
  bossTugOfWar,
  bossViewForRun,
  createBossCombat,
  damageBoss,
  getBossDefinition,
  isFrozen,
  isLegalDamage,
  phaseForHp,
  planBossSpin,
  planDozerExtension,
  planFreeze,
  planRunBossSpin,
  scoreForSpin,
  scoreableCells,
  selectBossForRun,
  selectBossForSeed,
  skillsAtHp,
  type BossContentSource,
  type FrozenCell,
} from '../src/boss/index.js';
import { createRunState, RunMachine } from '../src/run/index.js';

const BALANCE: BalanceDef = {
  startBankroll: 500,
  cashPerChip: 1,
  quotas: [1000, 2100, 4410, 9261, 19448, 40841, 85766, 180109, 378229],
  minMatch: 3,
  baseStrip: ['cherry', 'diamond', 'seven', 'skull', 'uranium'],
  firstReelStrip: ['cherry', 'cherry', 'diamond', 'seven', 'skull'],
};

function floorDef(
  id: FloorId,
  order: 1 | 2 | 3,
  next: FloorId[],
  bossId: BossDef['id'],
  quotaScale = 1,
): FloorDef {
  return {
    id,
    name: id,
    order,
    next,
    bossId,
    physics: { friction: 0.9, gutterRisk: 1, dozerSpeed: 0.05, pegs: [] },
    chuteMults: [0.8, 1.5, 3, 1.5, 2],
    pegChips: { gold: 5, bumper: 15, golden: 25, splitter: 5 },
    lipMult: 1,
    quotaScale,
    shop: {
      archetypeWeights: { DRINKS: 25, TRINKETS: 25, REELS: 25, MIXED: 25 },
      categoryWeights: { TRINKET: 20, DRINK: 20, REEL: 20, COIN: 20, CHASSIS: 20 },
      rarityWeights: { common: 1, rare: 1, epic: 1, legendary: 1, cursed: 1 },
    },
    bgSpriteKey: `floor.${id}.bg`,
  };
}

const CONTENT_BOSSES = BOSS_DEFINITIONS.map((definition) => definition.content);

const CONTENT: BossContentSource = {
  bosses: CONTENT_BOSSES,
  floors: [
    floorDef('FLOOR_NEON', 1, ['FLOOR_CRYO', 'FLOOR_FOUNDRY'], 'valenti'),
    floorDef('FLOOR_CRYO', 2, ['FLOOR_PENTHOUSE'], 'zero'),
    floorDef('FLOOR_FOUNDRY', 2, ['FLOOR_PENTHOUSE'], 'zero'),
    floorDef('FLOOR_PENTHOUSE', 3, [], 'auditor', 2.2),
  ],
};

function runState(seed = 'boss-seed'): RunState {
  const state = createRunState({ floors: CONTENT.floors, balance: BALANCE, items: [] }, seed);
  state.floorId = 'FLOOR_NEON';
  state.round = RULES.NORMAL_ROUNDS_PER_FLOOR + 1;
  state.boss = { score: 0, spin: 0 };
  return state;
}

test('all three bosses expose their skill sets at every HP threshold', () => {
  assert.deepEqual(BOSS_IDS, ['valenti', 'zero', 'auditor']);
  assert.deepEqual(BOSS_PHASE_THRESHOLDS, [0.66, 0.33]);
  assert.equal(BOSS_DEFINITIONS.length, 3);

  const expected: Record<string, string[]> = {
    valenti: ['seededScore', 'suction'],
    zero: ['frozenCellScore', 'freezeCells', 'iceBlocks'],
    auditor: ['deterministicCurve', 'removeCenterTokens'],
  };

  for (const id of BOSS_IDS) {
    const definition = BOSSES[id];
    assert.equal(definition.id, id);
    assert.equal(definition.maxHp > 0, true);
    assert.deepEqual(definition.hpThresholds, [0.66, 0.33]);
    assert.deepEqual(definition.phases.map((phase) => phase.id), [...BOSS_PHASE_IDS]);
    for (const phase of definition.phases) {
      assert.ok(phase.skills.length > 0, `${id} ${phase.id} has no skills`);
      const skillIds = phase.skills.map((skill) => skill.id);
      for (const skillId of expected[id]!) {
        assert.ok(skillIds.includes(skillId as never), `${id} ${phase.id} missing ${skillId}`);
      }
      assert.deepEqual(
        definition.phases.map((entry) => entry.skills).indexOf(phase.skills),
        definition.phases.indexOf(phase),
      );
    }

    const full = skillsAtHp(definition, definition.maxHp);
    const half = skillsAtHp(definition, definition.maxHp * 0.5);
    const low = skillsAtHp(definition, definition.maxHp * 0.2);
    assert.equal(full.length, expected[id]!.length);
    assert.equal(half.length, expected[id]!.length);
    assert.equal(low.length, expected[id]!.length);
  }

  const valentiAmounts = [
    skillsAtHp(BOSSES.valenti, BOSSES.valenti.maxHp).find((skill) => skill.id === 'suction')
      ?.params.amount,
    skillsAtHp(BOSSES.valenti, BOSSES.valenti.maxHp * 0.5).find((skill) => skill.id === 'suction')
      ?.params.amount,
    skillsAtHp(BOSSES.valenti, BOSSES.valenti.maxHp * 0.2).find((skill) => skill.id === 'suction')
      ?.params.amount,
  ];
  assert.deepEqual(valentiAmounts, [1, 1.25, 1.5]);
});

test('definitions are rebuilt from content without changing the content object', () => {
  const source: BossDef = { ...CONTENT_BOSSES[0]!, name: 'Custom Valenti' };
  const before = structuredClone(source);
  const definition = getBossDefinition('valenti', [source]);
  assert.equal(definition.name, 'Custom Valenti');
  assert.deepEqual(source, before);
  assert.notEqual(definition.content, source);
});

test('boss selection is deterministic from run state and seed', () => {
  assert.equal(selectBossForRun(CONTENT, { floorId: 'FLOOR_NEON', seed: 'a' }).id, 'valenti');
  assert.equal(selectBossForRun({ floorId: 'FLOOR_CRYO', seed: 'a' }, CONTENT).id, 'zero');
  assert.equal(selectBossForRun(CONTENT, { floorId: 'FLOOR_PENTHOUSE', seed: 'a' }).id, 'auditor');

  const state = runState('select-seed');
  state.floorId = 'FLOOR_CRYO';
  assert.equal(selectBossForRun(CONTENT, state).id, 'zero');
  assert.equal(
    selectBossForRun(CONTENT, state).id,
    selectBossForRun(CONTENT, { floorId: state.floorId, seed: state.seed }).id,
  );

  const unknownA = selectBossForRun(CONTENT, { floorId: 'NOT_A_FLOOR', seed: 'fallback' });
  const unknownB = selectBossForRun(CONTENT, { floorId: 'NOT_A_FLOOR', seed: 'fallback' });
  assert.equal(unknownA.id, unknownB.id);
  assert.equal(unknownA.id, bossIdForSeed('fallback', 'NOT_A_FLOOR'));

  assert.equal(selectBossForSeed('seed-a').id, selectBossForSeed('seed-a').id);
  for (let i = 0; i < 100; i++) {
    assert.equal(selectBossForSeed('stable-seed').id, selectBossForSeed('stable-seed').id);
  }
});

test('all three bosses are selectable and retain their content identity', () => {
  for (const id of BOSS_IDS) assert.equal(getBossDefinition(id).id, id);
  for (const id of BOSS_IDS) {
    const definition = BOSSES[id];
    assert.equal(definition.content.id, id);
    assert.equal(definition.content.spriteKey, `boss.${id}`);
    assert.equal(definition.content.score.handler, 'onSpinEvaluated');
  }
});

test('Valenti score is a seeded 450-900 roll scaled by the floor', () => {
  const first = Array.from({ length: 20 }, (_, index) =>
    bossScoreForSpin('valenti', { seed: 'valenti-seed', spin: index + 1 }),
  );
  const second = Array.from({ length: 20 }, (_, index) =>
    bossScoreForSpin('valenti', { seed: 'valenti-seed', spin: index + 1 }),
  );
  assert.deepEqual(first, second);
  for (const score of first) {
    assert.ok(Number.isInteger(score));
    assert.ok(score >= 450 && score <= 900, `score ${score} outside 450..900`);
  }
  for (let spin = 1; spin <= 10; spin++) {
    const scaled = bossScoreForSpin('valenti', {
      seed: 'valenti-seed',
      spin,
      floorScale: 2.2,
    });
    assert.ok(scaled >= Math.round(450 * 2.2) && scaled <= Math.round(900 * 2.2));
  }
  assert.equal(
    scoreForSpin(BOSSES.valenti, { seed: 'valenti-seed', spin: 3 }),
    first[2],
  );
});

test('Madame Zero scores +0.5x the base per frozen cell', () => {
  assert.equal(bossScoreForSpin('zero', { seed: 'zero', spin: 1 }), 600);
  assert.equal(
    bossScoreForSpin('zero', { seed: 'zero', spin: 1, frozenCells: 2 }),
    1200,
  );
  assert.equal(
    bossScoreForSpin('zero', { seed: 'zero', spin: 4, frozenCells: 2, floorScale: 2.2 }),
    2640,
  );
  assert.equal(
    bossScoreForSpin('zero', { seed: 'other', spin: 1, frozenCells: 1 }),
    900,
  );
});

test('the Iron Auditor curve is exactly base x 1.35^spin', () => {
  for (let spin = 1; spin <= 10; spin++) {
    const expected = Math.round(600 * Math.pow(1.35, spin));
    assert.equal(
      bossScoreForSpin('auditor', { seed: 'ignored', spin }),
      expected,
      `spin ${spin}`,
    );
  }
  assert.equal(
    bossScoreForSpin('auditor', { seed: 'ignored', spin: 7, floorScale: 2.2 }),
    Math.round(600 * Math.pow(1.35, 7) * 2.2),
  );
  assert.equal(BOSSES.auditor.score.kind, 'curve');
  assert.equal(BOSSES.auditor.score.kind === 'curve' ? BOSSES.auditor.score.growth : 0, 1.35);
});

test('score inputs are validated without touching callers', () => {
  assert.throws(() => bossScoreForSpin('auditor', { seed: 's', spin: 0 }), RangeError);
  assert.throws(() => bossScoreForSpin('auditor', { seed: 's', spin: 1.5 }), RangeError);
  assert.throws(
    () => bossScoreForSpin('auditor', { seed: 's', spin: 1, floorScale: -1 }),
    RangeError,
  );
  assert.throws(
    () => bossScoreForSpin('auditor', { seed: 's', spin: 1, floorScale: Number.NaN }),
    RangeError,
  );
});

test('HP thresholds transition phases at the exact boundaries', () => {
  const definition = BOSSES.valenti;
  const max = definition.maxHp;

  assert.equal(phaseForHp(definition, max).id, 'phase1');
  assert.equal(phaseForHp(definition, max * 0.67).id, 'phase1');
  assert.equal(phaseForHp(definition, max * 0.66).id, 'phase2');
  assert.equal(phaseForHp(definition, max * 0.34).id, 'phase2');
  assert.equal(phaseForHp(definition, max * 0.33).id, 'phase3');
  assert.equal(phaseForHp(definition, 0).id, 'phase3');

  const combat = createBossCombat(definition);
  assert.deepEqual(combat, {
    bossId: 'valenti',
    maxHp: max,
    hp: max,
    phase: 'phase1',
  });

  const toPhase2 = applyDamage(definition, max, max * 0.35);
  assert.equal(toPhase2.ok, true);
  if (!toPhase2.ok) return;
  assert.equal(toPhase2.phaseBefore, 'phase1');
  assert.equal(toPhase2.phaseAfter, 'phase2');
  assert.equal(toPhase2.transitioned, true);
  assert.equal(toPhase2.hpAfter, max - max * 0.35);
  assert.equal(toPhase2.defeated, false);

  const toPhase3 = applyDamage(definition, toPhase2.hpAfter, max * 0.35);
  assert.equal(toPhase3.ok, true);
  if (!toPhase3.ok) return;
  assert.equal(toPhase3.phaseBefore, 'phase2');
  assert.equal(toPhase3.phaseAfter, 'phase3');
  assert.equal(toPhase3.transitioned, true);

  const defeated = applyDamage(definition, toPhase3.hpAfter, max);
  assert.equal(defeated.ok, true);
  if (!defeated.ok) return;
  assert.equal(defeated.hpAfter, 0);
  assert.equal(defeated.defeated, true);
  assert.equal(defeated.overkill, max * 0.7);
  assert.equal(defeated.state.phase, 'phase3');
});

test('damage is pure and illegal damage is rejected without mutation', () => {
  const definition = BOSSES.zero;
  const hp = definition.maxHp;
  const illegal = [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const damage of illegal) {
    const result = applyDamage(definition, hp, damage);
    assert.deepEqual(result, { ok: false, error: 'INVALID_DAMAGE' }, String(damage));
    assert.equal(isLegalDamage(damage), false);
    assert.equal(hp, definition.maxHp);
  }

  const legal = applyDamage(definition, hp, 0);
  assert.equal(legal.ok, true);
  if (!legal.ok) return;
  assert.equal(legal.hpAfter, hp);
  assert.equal(legal.transitioned, false);
  assert.equal(legal.damage, 0);

  const fractional = applyDamage(definition, hp, 123.5);
  assert.equal(fractional.ok, true);
  if (!fractional.ok) return;
  assert.equal(fractional.hpAfter, hp - 123.5);

  assert.throws(() => applyDamage(definition, -1, 10), RangeError);
  assert.throws(() => applyDamage(definition, Number.NaN, 10), RangeError);
});

test('damageBoss validates snapshots and preserves the combat object', () => {
  const combat = createBossCombat(BOSSES.auditor);
  const before = structuredClone(combat);
  const result = damageBoss(combat, 100);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.hpAfter, combat.hp - 100);
  assert.deepEqual(combat, before);
  assert.deepEqual(damageBoss(combat, -5), { ok: false, error: 'INVALID_DAMAGE' });
});

test('Madame Zero freezes 1-2 fresh cells deterministically for two spins', () => {
  const first = planFreeze('zero', { seed: 'freeze-seed', spin: 1, cols: 5, rows: 4 });
  const second = planFreeze('zero', { seed: 'freeze-seed', spin: 1, cols: 5, rows: 4 });
  assert.deepEqual(first, second);
  assert.ok(first.added.length >= 1 && first.added.length <= 2);
  assert.equal(first.frozen.length, first.added.length);
  for (const entry of first.frozen) assert.equal(entry.spins, 2);
  for (const [col, row] of first.added) {
    assert.ok(col >= 0 && col < 5);
    assert.ok(row >= 0 && row < 4);
  }

  const existing: FrozenCell[] = [
    { cell: [0, 0], spins: 2 },
    { cell: [4, 3], spins: 2 },
  ];
  const before = structuredClone(existing);
  const next = planFreeze('zero', {
    seed: 'freeze-seed',
    spin: 2,
    cols: 5,
    rows: 4,
    frozen: existing,
  });
  assert.deepEqual(existing, before, 'input frozen list must not be mutated');
  for (const added of next.added) {
    assert.equal(isFrozen(existing, added), false, 'frozen cells cannot be targeted');
  }
  assert.equal(next.frozen.length, next.active.length);
  assert.ok(next.frozen.length >= 2);
  assert.deepEqual(next.expired, [], 'spins=2 entries age to one remaining spin');
  assert.equal(next.active.length, 2 + next.added.length);
  for (const entry of next.active.slice(0, 2)) assert.equal(entry.spins, 1);
});

test('freeze timers expire after the second spin and scoreable cells exclude ice', () => {
  const frozen: FrozenCell[] = [
    { cell: [0, 0], spins: 2 },
    { cell: [1, 1], spins: 1 },
  ];
  const ticked = advanceFrozen(frozen);
  assert.deepEqual(ticked.active, [{ cell: [0, 0], spins: 1 }]);
  assert.deepEqual(ticked.expired, [[1, 1]]);
  assert.equal(isFrozen(ticked.active, [0, 0]), true);
  assert.equal(isFrozen(ticked.active, [1, 1]), false);

  const cells = scoreableCells(3, 3, [{ cell: [1, 1], spins: 2 }]);
  assert.equal(cells.length, 8);
  assert.equal(
    cells.some(([col, row]) => col === 1 && row === 1),
    false,
  );
});

test('freeze selection stops when every cell is already frozen', () => {
  const all: FrozenCell[] = [];
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) all.push({ cell: [col, row], spins: 2 });
  }
  const plan = planFreeze('zero', {
    seed: 'full',
    spin: 1,
    cols: 3,
    rows: 3,
    frozen: all,
  });
  assert.deepEqual(plan.added, []);
  assert.equal(plan.frozen.length, 9);
  assert.equal(plan.expired.length, 0);
});

test('Valenti applies phase-scaled suction and a deterministic score every spin', () => {
  const strengths: number[] = [];
  for (const hp of [
    BOSSES.valenti.maxHp,
    BOSSES.valenti.maxHp * 0.5,
    BOSSES.valenti.maxHp * 0.2,
  ]) {
    const plan = planBossSpin('valenti', { seed: 'plan', spin: 1, hp });
    assert.equal(plan.modifiers.suction, BOSSES.valenti.phases[strengths.length]!.skills.find(
      (skill) => skill.id === 'suction',
    )?.params.amount);
    strengths.push(plan.modifiers.suction as number);
    assert.equal(plan.sabotage[0]?.kind, 'suction');
    assert.deepEqual(plan.directives, []);
    assert.ok(plan.scoreDelta >= 450 && plan.scoreDelta <= 900);
  }
  assert.deepEqual(strengths, [1, 1.25, 1.5]);

  const a = planBossSpin('valenti', { seed: 'plan', spin: 3, bossScore: 2_000 });
  const b = planBossSpin('valenti', { seed: 'plan', spin: 3, bossScore: 2_000 });
  assert.deepEqual(a, b);
  assert.equal(a.scoreTotal, 2_000 + a.scoreDelta);
});

test('Madame Zero freezes each spin and drops ice on every second spin', () => {
  const spin1 = planBossSpin('zero', { seed: 'zero-plan', spin: 1, cols: 4, rows: 3 });
  assert.equal(spin1.addedFrozen.length, spin1.frozen.length);
  assert.ok(spin1.addedFrozen.length >= 1 && spin1.addedFrozen.length <= 2);
  assert.equal(spin1.directives.length, 0);
  assert.equal(spin1.scoreDelta, Math.round(600 * (1 + 0.5 * spin1.frozen.length)));

  const spin2 = planBossSpin('zero', {
    seed: 'zero-plan',
    spin: 2,
    cols: 4,
    rows: 3,
    frozen: spin1.frozen,
    bossScore: spin1.scoreDelta,
  });
  assert.deepEqual(spin2.directives, [{ t: 'dropIceBlocks', count: 2 }]);
  assert.equal(spin2.sabotage.some((entry) => entry.kind === 'iceBlocks'), true);
  assert.equal(
    spin2.scoreTotal,
    spin1.scoreDelta +
      Math.round(600 * (1 + 0.5 * spin2.frozen.length)),
  );

  const spin3 = planBossSpin('zero', {
    seed: 'zero-plan',
    spin: 3,
    cols: 4,
    rows: 3,
    frozen: spin2.frozen,
  });
  assert.equal(spin3.directives.length, 0);
});

test('spin plans report threshold phase transitions without mutating inputs', () => {
  const frozen: FrozenCell[] = [{ cell: [0, 0], spins: 2 }];
  const before = structuredClone(frozen);
  const definition = BOSSES.zero;
  const plan = planBossSpin(definition, {
    seed: 'transition',
    spin: 1,
    cols: 3,
    rows: 3,
    frozen,
    hp: definition.maxHp * 0.7,
    damage: definition.maxHp * 0.1,
  });
  assert.deepEqual(frozen, before);
  assert.equal(plan.phase, 'phase1');
  assert.equal(plan.damage?.ok, true);
  assert.equal(plan.phaseTransition?.from, 'phase1');
  assert.equal(plan.phaseTransition?.to, 'phase2');
  assert.equal(plan.phaseTransition?.hp, definition.maxHp * 0.6);
});

test('the Iron Auditor sweeps the two centre-most tokens every third reciprocation', () => {
  for (const count of [1, 2, 4, 5, 7]) {
    const plan = planDozerExtension('auditor', count);
    assert.deepEqual(plan.directives, []);
    assert.deepEqual(plan.sabotage, []);
  }
  for (const count of [3, 6, 9]) {
    const plan = planDozerExtension(BOSSES.auditor, count);
    assert.deepEqual(plan.directives, [{ t: 'sweepCenter', count: 2 }]);
    assert.deepEqual(plan.sabotage, [{ kind: 'removeCenterTokens', count: 2 }]);
  }
  assert.deepEqual(planDozerExtension('valenti', 3).directives, []);
  assert.throws(() => planDozerExtension('auditor', 0), RangeError);
});

test('spin plans are reproducible from seed, spin and frozen state', () => {
  const seed = 'replay-seed';
  const frozen: FrozenCell[] = [{ cell: [2, 1], spins: 2 }];
  const left = planBossSpin('zero', {
    seed,
    spin: 4,
    cols: 5,
    rows: 4,
    frozen,
    hp: 5_000,
    damage: 500,
    bossScore: 3_000,
    floorScale: 1.4,
  });
  const right = planBossSpin('zero', {
    seed,
    spin: 4,
    cols: 5,
    rows: 4,
    frozen: structuredClone(frozen),
    hp: 5_000,
    damage: 500,
    bossScore: 3_000,
    floorScale: 1.4,
  });
  assert.deepEqual(left, right);
  assert.deepEqual(frozen, [{ cell: [2, 1], spins: 2 }]);
});

test('boss rewards expose the right claim and apply without aliasing state', () => {
  const valenti = bossReward('valenti');
  assert.deepEqual(valenti.relicChoice, { count: 3 });
  assert.equal(valenti.victory, false);

  const state = runState('reward');
  const before = structuredClone(state);
  const valentiResult = applyBossReward(state, 'valenti');
  assert.equal(valentiResult.requestRelicChoice, true);
  assert.equal(valentiResult.changed, false);
  assert.deepEqual(state, before);
  assert.notEqual(valentiResult.state, state);

  const zero = bossReward(CONTENT_BOSSES[1]!);
  assert.equal(zero.bossId, 'zero');
  assert.deepEqual(zero.shopCapacity, {
    amount: 2,
    target: Math.min(RULES.SHOP_MAX_CAPACITY, RULES.SHOP_START_CAPACITY + 2),
  });

  const zeroResult = applyBossReward(state, 'zero');
  assert.equal(zeroResult.changed, true);
  assert.equal(zeroResult.state.shop.capacity, RULES.SHOP_START_CAPACITY + 2);
  assert.deepEqual(state, before);
  const repeated = applyBossReward(zeroResult.state, 'zero');
  assert.equal(repeated.changed, false, 'the same reward target is idempotent');
  assert.equal(repeated.state.shop.capacity, RULES.SHOP_START_CAPACITY + 2);

  const expanded = structuredClone(state);
  expanded.shop.capacity = RULES.SHOP_MAX_CAPACITY;
  const capped = applyBossReward(expanded, 'zero');
  assert.equal(capped.state.shop.capacity, RULES.SHOP_MAX_CAPACITY);
  assert.equal(capped.changed, false);

  const claimed = applyBossReward(state, 'zero', { claimed: true });
  assert.equal(claimed.changed, false);
  assert.equal(claimed.state.shop.capacity, state.shop.capacity);

  const auditor = applyBossReward(state, 'auditor');
  assert.equal(auditor.victory, true);
  assert.equal(auditor.changed, false);
  assert.deepEqual(state, before);
});

test('boss selection and spin projection integrate with the run state without state leak', () => {
  const state = runState('integration-seed');
  state.boss = { score: 1_500, spin: 2 };
  const before = structuredClone(state);

  const view = bossViewForRun(CONTENT, state);
  assert.deepEqual(view, {
    bossId: 'valenti',
    seed: 'integration-seed',
    spin: 2,
    score: 1_500,
    floorId: 'FLOOR_NEON',
    floorScale: 1,
  });

  const encounter = BossEncounter.fromRun(CONTENT, state);
  assert.equal(encounter.id, 'valenti');
  const plan = planRunBossSpin(CONTENT, state, { hp: BOSSES.valenti.maxHp });
  assert.equal(plan.spin, 2);
  assert.equal(plan.scoreTotal, 1_500 + plan.scoreDelta);
  assert.deepEqual(state, before, 'projecting a spin must not mutate the run');

  state.floorId = 'FLOOR_PENTHOUSE';
  state.boss = { score: 0, spin: 1 };
  const auditor = planRunBossSpin(CONTENT, state);
  assert.equal(auditor.bossId, 'auditor');
  assert.equal(auditor.scoreDelta, bossScoreForSpin('auditor', {
    seed: 'integration-seed',
    spin: 1,
    floorScale: 2.2,
  }));

  state.boss = null;
  assert.throws(() => planRunBossSpin(CONTENT, state), RangeError);
});

test('BossEncounter facade keeps only immutable content and seed', () => {
  const encounter = new BossEncounter('zero', { seed: 'facade', floorScale: 1.5 });
  assert.deepEqual(Object.keys(encounter).sort(), ['definition', 'floorScale', 'seed']);
  assert.ok(Object.isFrozen(encounter));
  assert.equal(encounter.score(1, 2), Math.round(600 * (1 + 0.5 * 2) * 1.5));
  assert.equal(encounter.skills().length, 3);
  assert.equal(encounter.reward().shopCapacity?.amount, 2);
  const plan = encounter.planSpin({ spin: 2, cols: 3, rows: 3 });
  assert.deepEqual(plan.directives, [{ t: 'dropIceBlocks', count: 2 }]);

  const machine = RunMachine.fromState(
    { floors: CONTENT.floors, balance: BALANCE, items: [] },
    runState('machine'),
  );
  const machineState = machine.getState();
  machineState.boss = { score: 200, spin: 1 };
  const snapshot = structuredClone(machineState);
  const fromMachine = BossEncounter.fromRun(CONTENT, machineState);
  assert.equal(fromMachine.id, 'valenti');
  assert.deepEqual(fromMachine.planSpin({ spin: machineState.boss.spin }).scoreDelta > 0, true);
  assert.deepEqual(machineState, snapshot);
});

test('tug-of-war value follows D-04 and is pure', () => {
  assert.deepEqual(bossTugOfWar(1_000, 500), {
    playerScore: 1_000,
    bossScore: 500,
    lead: 500,
    ratio: 1_000 / 1_500,
    winner: 'player',
  });
  assert.equal(bossTugOfWar(500, 500).winner, 'player');
  assert.equal(bossTugOfWar(499, 500).winner, 'boss');
  assert.equal(bossTugOfWar(0, 0).ratio, 0.5);
  assert.throws(() => bossTugOfWar(-1, 0), RangeError);
  assert.throws(() => bossTugOfWar(0, Number.NaN), RangeError);
});
