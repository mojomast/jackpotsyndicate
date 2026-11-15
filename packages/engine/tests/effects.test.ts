import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Effect, HandlerRef } from '@jackpotsyndicate/contracts';
import {
  EFFECT_HANDLER_IDS,
  HOOK_NAMES,
  DEFAULT_SYMBOL_EFFECTS,
  UnknownEffectHandlerError,
  applyEffects,
  applyPhysicsMod,
  buildModifierBag,
  createModifierBag,
  dispatchAllHooks,
  dispatchHook,
  dispatchHookMany,
  hasEffectHandler,
  hitsEvery,
  stackFactor,
  symbolEffectRefs,
} from '../src/effects/index.js';

function ref(
  handler: HandlerRef['handler'],
  params: Record<string, number | string | boolean>,
): HandlerRef {
  return { handler, params };
}

test('all C-4 hooks dispatch through pure handlers', () => {
  const cases: { hook: (typeof HOOK_NAMES)[number]; ref: HandlerRef }[] = [
    { hook: 'onRunStart', ref: ref('onRunStart', { action: 'addCash', amount: 1 }) },
    { hook: 'onSpinStart', ref: ref('onSpinStart', { action: 'addBonusOrbs', count: 1 }) },
    { hook: 'onCellScored', ref: ref('onCellScored', { action: 'addChips', amount: 1 }) },
    { hook: 'onSpinEvaluated', ref: ref('onSpinEvaluated', { action: 'addMult', amount: 1 }) },
    { hook: 'onOrbLaunch', ref: ref('onOrbLaunch', { action: 'flagOrb', canSplit: true }) },
    { hook: 'onPegHit', ref: ref('onPegHit', { action: 'addChips', amount: 1 }) },
    { hook: 'onChuteExit', ref: ref('onChuteExit', { action: 'addTokenCash', amount: 1 }) },
    { hook: 'onTokenSpawn', ref: ref('onTokenSpawn', { action: 'addCash', amount: 1 }) },
    {
      hook: 'onDozerFullExtension',
      ref: ref('onDozerFullExtension', { action: 'nudgeEveryNthPeg', every: 1, distance: 1 }),
    },
    {
      hook: 'onGutterLoss',
      ref: ref('onGutterLoss', { action: 'addNextSpinX', amount: 1, cap: 2, key: 'k' }),
    },
    { hook: 'onLipDrop', ref: ref('onLipDrop', { action: 'addCash', amount: 1 }) },
    { hook: 'onRoundEnd', ref: ref('onRoundEnd', { action: 'addCash', amount: 1 }) },
    { hook: 'onShopEnter', ref: ref('onShopEnter', { action: 'addCash', amount: 1 }) },
    {
      hook: 'physicsModifiers',
      ref: ref('physicsModifiers', { action: 'centerPull', orbs: 1, tokens: 1 }),
    },
  ];

  assert.deepEqual(
    cases.map((entry) => entry.hook),
    [...HOOK_NAMES],
    'every C-4 hook must be exercised',
  );
  for (const entry of cases) {
    const effects = dispatchHook(entry.hook, [entry.ref], { pegHitCount: 1 });
    assert.ok(effects.length > 0, `${entry.hook} produced no effects`);
  }

  const all = dispatchAllHooks(
    cases.map((entry) => entry.ref),
    { pegHitCount: 1 },
  );
  for (const hook of HOOK_NAMES) assert.ok(Array.isArray(all[hook]), `${hook} missing`);
});

test('handlers are pure and dispatching twice returns equal fresh effects', () => {
  const refs = [
    ref('physicsModifiers', { action: 'dozerBoost', speedMul: 1.3, strokeMul: 1.3 }),
    ref('physicsModifiers', { action: 'gutterBounce', chance: 0.5 }),
    ref('onLipDrop', { action: 'addNextSpinX', amount: 0.25, cap: 3, key: 'ouroboros' }),
  ];
  const ctx = {
    nextSpin: { xBonus: { ouroboros: 0.5 }, addMult: 0, bonusOrbs: 0 },
  };
  const payload = { tick: 4, cash: 10 };
  const before = JSON.stringify({ refs, ctx, payload });

  const first = dispatchHook('physicsModifiers', refs, ctx, payload);
  const second = dispatchHook('physicsModifiers', refs, ctx, payload);
  const lipFirst = dispatchHook('onLipDrop', refs, ctx, payload);
  const lipSecond = dispatchHook('onLipDrop', refs, ctx, payload);

  assert.deepEqual(first, second);
  assert.deepEqual(lipFirst, lipSecond);
  assert.notEqual(first, second);
  assert.equal(JSON.stringify({ refs, ctx, payload }), before);

  // Resolving does not mutate the effect objects either.
  const effectsBefore = JSON.stringify(lipFirst);
  applyEffects(lipFirst, { nextSpin: ctx.nextSpin });
  assert.equal(JSON.stringify(lipFirst), effectsBefore);
});

test('duplicate handler references stack additively', () => {
  const stepper = ref('onSpinEvaluated', { action: 'mulX', factor: 1.5 });
  const effects = dispatchHook('onSpinEvaluated', [stepper, { ...stepper }]);
  assert.deepEqual(effects, [{ e: 'mulX', factor: 2 }]);
  assert.equal(stackFactor(1.5, 2), 2);

  const midas = ref('onLipDrop', { action: 'addCash', amount: 75 });
  assert.deepEqual(dispatchHook('onLipDrop', [midas, { ...midas }]), [
    { e: 'addCash', amount: 150, reason: 'bonus' },
  ]);

  const die = ref('onCellScored', { action: 'addChips', amount: 20 });
  assert.deepEqual(dispatchHook('onCellScored', [die, { ...die }]), [
    { e: 'addChips', amount: 40 },
  ]);

  // Two 50% bumpers stay independent rolls, not one 100% chance.
  const bumper = ref('physicsModifiers', { action: 'gutterBounce', chance: 0.5 });
  const bag = buildModifierBag([bumper, { ...bumper }]);
  assert.deepEqual(bag.gutterBounceChances, [0.5, 0.5]);
});

test('next-spin X bonuses are capped per key without mutating context', () => {
  const rake = ref('onGutterLoss', {
    action: 'addNextSpinX',
    amount: 0.25,
    cap: 2,
    key: 'vampiricRake',
  });
  const ctx = { nextSpin: { xBonus: { vampiricRake: 1.9 }, addMult: 0, bonusOrbs: 0 } };
  const before = JSON.stringify(ctx);
  assert.deepEqual(dispatchHook('onGutterLoss', [rake], ctx), [
    { e: 'addNextSpinX', amount: 0.1, cap: 2, key: 'vampiricRake' },
  ]);
  assert.equal(JSON.stringify(ctx), before);

  const atCap = {
    nextSpin: { xBonus: { vampiricRake: 2 }, addMult: 0, bonusOrbs: 0 },
  };
  assert.deepEqual(dispatchHook('onGutterLoss', [rake], atCap), []);

  const ouroboros = ref('onLipDrop', {
    action: 'addNextSpinX',
    amount: 0.25,
    cap: 3,
    key: 'ouroboros',
  });
  const nearlyFull = { nextSpin: { xBonus: { ouroboros: 2.8 }, addMult: 0, bonusOrbs: 0 } };
  assert.deepEqual(dispatchHook('onLipDrop', [ouroboros], nearlyFull), [
    { e: 'addNextSpinX', amount: 0.2, cap: 3, key: 'ouroboros' },
  ]);

  const resolved = applyEffects(
    [
      { e: 'addNextSpinX', amount: 0.6, cap: 2, key: 'k' },
      { e: 'addNextSpinX', amount: 0.6, cap: 2, key: 'k' },
    ],
    { nextSpin: { xBonus: { k: 1.5 }, addMult: 0, bonusOrbs: 0 } },
  );
  assert.equal(resolved.nextSpinX.k, 2);
});

test('every-Nth handlers use counters and stack across duplicates', () => {
  const coil = ref('onOrbLaunch', { action: 'everyNthCanSplit', every: 2 });
  assert.deepEqual(dispatchHook('onOrbLaunch', [coil], { orbLaunchCount: 1 }), []);
  assert.deepEqual(dispatchHook('onOrbLaunch', [coil], { orbLaunchCount: 2 }), [
    { e: 'flagOrb', flags: { canSplit: true } },
  ]);
  assert.deepEqual(dispatchHook('onOrbLaunch', [coil, { ...coil }], { orbLaunchCount: 1 }), [
    { e: 'flagOrb', flags: { canSplit: true } },
  ]);

  const tesla = ref('onPegHit', { action: 'nudgeEveryNthPeg', every: 3, distance: 4 });
  assert.deepEqual(dispatchHook('onPegHit', [tesla], { pegHitCount: 2 }), []);
  assert.deepEqual(dispatchHook('onPegHit', [tesla], { pegHitCount: 3 }), [
    { e: 'simDirective', directive: { t: 'nudgeForward', distance: 4 } },
  ]);

  assert.equal(hitsEvery(6, 3, 1), true);
  assert.equal(hitsEvery(5, 3, 1), false);
});

test('modifier bag stacks boosts additively and keeps bounce rolls independent', () => {
  const refs = [
    ref('physicsModifiers', { action: 'dozerBoost', speedMul: 1.3, strokeMul: 1.3 }),
    ref('physicsModifiers', { action: 'dozerBoost', strokeMul: 1.25 }),
    ref('physicsModifiers', { action: 'centerPull', orbs: 1, tokens: 1 }),
    ref('physicsModifiers', { action: 'gutterBounce', chance: 0.5 }),
    ref('physicsModifiers', { action: 'gutterBounce', chance: 0.35, independent: true }),
    ref('physicsModifiers', { action: 'suction', amount: 1 }),
  ];
  const bag = buildModifierBag(refs);
  assert.equal(bag.dozerSpeedMul, 1.3);
  assert.equal(bag.dozerStrokeMul, 1.55);
  assert.equal(bag.centerPullOrbs, 1);
  assert.equal(bag.centerPullTokens, 1);
  assert.deepEqual(bag.gutterBounceChances, [0.5, 0.35]);
  assert.equal(bag.suction, 1);
  assert.deepEqual(createModifierBag(bag), bag);

  const dup = buildModifierBag([
    ref('physicsModifiers', { action: 'dozerBoost', speedMul: 1.3 }),
    ref('physicsModifiers', { action: 'dozerBoost', speedMul: 1.3 }),
  ]);
  assert.equal(dup.dozerSpeedMul, 1.6);

  const applied = applyPhysicsMod(createModifierBag(), {
    e: 'setPhysicsMod',
    patch: { dozerSpeedMul: 0.5, addGutterBounce: 0.25 },
    combine: 'add',
  });
  assert.equal(applied.dozerSpeedMul, 1.5);
  assert.deepEqual(applied.gutterBounceChances, [0.25]);
});

test('applyEffects folds chips, multipliers, cash, spawns and directives', () => {
  const effects: Effect[] = [
    { e: 'addChips', amount: 30 },
    { e: 'addChipsAllOrbs', amount: 12 },
    { e: 'addMult', amount: 2 },
    { e: 'mulX', factor: 1.5 },
    { e: 'mulX', factor: 2 },
    { e: 'addNextSpinMult', amount: 1 },
    { e: 'addBonusOrbs', count: 2 },
    { e: 'addCash', amount: 75, reason: 'bonus' },
    { e: 'mulTokenCash', factor: 2 },
    { e: 'addTokenCash', amount: 40 },
    { e: 'mulLipPayout', factor: 1.25 },
    {
      e: 'spawnToken',
      template: {
        symbolId: 'scrap',
        skin: 'copper',
        radius: 10,
        mass: 1,
        slide: 0.5,
        count: 1,
        stack: 1,
        weldOnLand: false,
        magnetic: false,
        seismic: false,
        resistSuction: false,
      },
      cash: 0,
    },
    { e: 'simDirective', directive: { t: 'surge' } },
    { e: 'flagOrb', flags: { canSplit: true } },
    { e: 'triggerFever' },
  ];

  const resolved = applyEffects(effects);
  assert.equal(resolved.chips, 30);
  assert.equal(resolved.allOrbChips, 12);
  assert.equal(resolved.addMult, 2);
  assert.equal(resolved.xMult, 3);
  assert.equal(resolved.nextSpinAddMult, 1);
  assert.equal(resolved.bonusOrbs, 2);
  assert.equal(resolved.cash, 75);
  assert.equal(resolved.tokenCashMul, 2);
  assert.equal(resolved.tokenCashAdd, 40);
  assert.equal(resolved.lipPayoutMul, 1.25);
  assert.equal(resolved.spawns.length, 1);
  assert.deepEqual(resolved.directives, [{ t: 'surge' }]);
  assert.equal(resolved.flags.canSplit, true);
  assert.equal(resolved.triggerFever, true);
});

test('handler resolution rejects unknown action ids and resolves the registry', () => {
  assert.equal(hasEffectHandler('mulX'), true);
  assert.equal(hasEffectHandler('notAHandler'), false);
  assert.ok(EFFECT_HANDLER_IDS.includes('everyNthCanSplit'));
  assert.ok(EFFECT_HANDLER_IDS.includes('nudgeEveryNthPeg'));

  assert.throws(
    () =>
      dispatchHook('onSpinEvaluated', [
        ref('onSpinEvaluated', { action: 'definitelyMissing' }),
      ]),
    UnknownEffectHandlerError,
  );
});

test('dispatchHookMany merges reference sets and stacks identical effects', () => {
  const a = [ref('onCellScored', { action: 'addChips', amount: 20 })];
  const b = [ref('onCellScored', { action: 'addChips', amount: 20 })];
  assert.deepEqual(dispatchHookMany('onCellScored', [a, b]), [
    { e: 'addChips', amount: 40 },
  ]);
});

// ------------------------------------------------- symbol rules (DRIFT.md)

test('Blood Diamond gains +0.2 X per adjacent Skull pair, scoring diamonds only', () => {
  const refs: HandlerRef[] = [{ handler: 'onSpinEvaluated', params: { action: 'diamondAdjacencyX', xPerSkull: 0.2 } }];
  // Column-major: the diamond at (1,1) touches skulls at (0,1) and (1,0).
  const grid = [
    ['cherry', 'skull', 'cherry'],
    ['skull', 'diamond', 'cherry'],
    ['cherry', 'cherry', 'seven'],
  ] as const;
  const all = dispatchHook('onSpinEvaluated', refs, {}, { grid: grid as never });
  assert.deepEqual(all, [{ e: 'mulX', factor: 1.4 }]);

  const scoring = dispatchHook('onSpinEvaluated', refs, {}, {
    grid: grid as never,
    wins: [{ cells: [[1, 1]] }],
  });
  assert.deepEqual(scoring, [{ e: 'mulX', factor: 1.4 }]);

  const idle = dispatchHook('onSpinEvaluated', refs, {}, {
    grid: grid as never,
    wins: [{ cells: [[2, 0]] }],
  });
  assert.deepEqual(idle, [], 'a diamond that does not score earns nothing');
});

test('Uranium adds +15 chips to every other orb on each peg hit by default', () => {
  assert.deepEqual(symbolEffectRefs('uranium', 'onPegHit', []), [
    { handler: 'onPegHit', params: { action: 'addChipsAllOrbs', amount: 15 } },
  ]);
  assert.deepEqual(symbolEffectRefs('uranium', 'onSpinEvaluated', []), []);
  assert.deepEqual(symbolEffectRefs('cherry', 'onPegHit', []), []);
  const override: HandlerRef[] = [{ handler: 'onPegHit', params: { action: 'addChipsAllOrbs', amount: 30 } }];
  assert.deepEqual(symbolEffectRefs('uranium', 'onPegHit', override), override);
  const effects = dispatchHook('onPegHit', symbolEffectRefs('uranium', 'onPegHit', undefined), {}, { orbId: 7 });
  assert.deepEqual(effects, [{ e: 'addChipsAllOrbs', amount: 15, exceptOrbId: 7 }]);
  assert.ok(Object.isFrozen(DEFAULT_SYMBOL_EFFECTS));
});
