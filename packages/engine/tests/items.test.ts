import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CoinDef, HandlerRef } from '@jackpotsyndicate/contracts';
import { CONTENT_BUNDLE } from '../../content/src/index.js';
import {
  HOOK_NAMES,
  dispatchHook,
  hasEffectHandler,
} from '../src/effects/index.js';
import {
  addDrinkToTray,
  addTrinket,
  applyCoinToOrb,
  applyCoinToOrbSpec,
  applyCoinToToken,
  coinPayout,
  coinProfile,
  coinSpinCost,
  collectDrinkEffects,
  collectItemEffects,
  collectTrinketEffects,
  drinkRefs,
  emptyNextSpin,
  findCoin,
  findDrink,
  findTrinket,
  glyphSymbol,
  indexItems,
  itemRefs,
  removeDrinkFromTray,
  removeTrinket,
  resolveCoin,
  trinketCounts,
  trinketModifiers,
  trinketRefs,
  unresolvedHandlerIds,
} from '../src/items/index.js';

const CATALOG = CONTENT_BUNDLE.items;

function trinket(id: string) {
  const item = findTrinket(CATALOG, id);
  assert.ok(item, `missing trinket ${id}`);
  return item;
}

function drink(id: string) {
  const item = findDrink(CATALOG, id);
  assert.ok(item, `missing drink ${id}`);
  return item;
}

function coin(id: string): CoinDef {
  return resolveCoin(CATALOG, id);
}

// ------------------------------------------------------------- trinkets (15)
test('trinket quantumSplitterCoil makes every 2nd launched orb split', () => {
  const item = trinket('quantumSplitterCoil');
  assert.equal(item.price, 200);
  assert.deepEqual(collectTrinketEffects(CATALOG, [item.id], 'onOrbLaunch', { orbLaunchCount: 1 }), []);
  assert.deepEqual(collectTrinketEffects(CATALOG, [item.id], 'onOrbLaunch', { orbLaunchCount: 2 }), [
    { e: 'flagOrb', flags: { canSplit: true } },
  ]);
});

test('trinket electromagneticHopper pulls orbs and tokens toward centre X', () => {
  const item = trinket('electromagneticHopper');
  assert.equal(item.price, 220);
  const bag = trinketModifiers(CATALOG, [item.id]);
  assert.equal(bag.centerPullOrbs, 1);
  assert.equal(bag.centerPullTokens, 1);
});

test('trinket vampiricStepperMotor multiplies X by 1.5 each spin', () => {
  const item = trinket('vampiricStepperMotor');
  assert.equal(item.price, 300);
  assert.deepEqual(collectTrinketEffects(CATALOG, [item.id], 'onSpinEvaluated'), [
    { e: 'mulX', factor: 1.5 },
  ]);
});

test('trinket vampiricRakeCollector adds capped next-spin X per gutter loss', () => {
  const item = trinket('vampiricRakeCollector');
  assert.equal(item.price, 310);
  assert.deepEqual(collectTrinketEffects(CATALOG, [item.id], 'onGutterLoss'), [
    { e: 'addNextSpinX', amount: 0.25, cap: 2, key: 'vampiricRake' },
  ]);
  const capped = collectTrinketEffects(CATALOG, [item.id], 'onGutterLoss', {
    nextSpin: { xBonus: { vampiricRake: 1.9 }, addMult: 0, bonusOrbs: 0 },
  });
  assert.deepEqual(capped, [
    { e: 'addNextSpinX', amount: 0.1, cap: 2, key: 'vampiricRake' },
  ]);
});

test('trinket goldPegAlchemist adds 15 chips per peg hit and 40 cash per token', () => {
  const item = trinket('goldPegAlchemist');
  assert.equal(item.price, 250);
  assert.deepEqual(collectTrinketEffects(CATALOG, [item.id], 'onPegHit'), [
    { e: 'addChips', amount: 15 },
  ]);
  assert.deepEqual(collectTrinketEffects(CATALOG, [item.id], 'onChuteExit'), [
    { e: 'addTokenCash', amount: 40 },
  ]);
});

test('trinket turboDozerCam raises dozer speed and stroke by 30%', () => {
  const item = trinket('turboDozerCam');
  assert.equal(item.price, 200);
  const bag = trinketModifiers(CATALOG, [item.id]);
  assert.equal(bag.dozerSpeedMul, 1.3);
  assert.equal(bag.dozerStrokeMul, 1.3);
});

test('trinket hydraulicDozerPiston raises dozer stroke by 25%', () => {
  const item = trinket('hydraulicDozerPiston');
  assert.equal(item.price, 240);
  const bag = trinketModifiers(CATALOG, [item.id]);
  assert.equal(bag.dozerSpeedMul, 1);
  assert.equal(bag.dozerStrokeMul, 1.25);
});

test('trinket rubberGutterBumper contributes a 50% independent bounce roll', () => {
  const item = trinket('rubberGutterBumper');
  assert.equal(item.price, 200);
  assert.deepEqual(trinketModifiers(CATALOG, [item.id]).gutterBounceChances, [0.5]);
});

test('trinket gutterGuardBumper contributes its own 35% bounce roll', () => {
  const item = trinket('gutterGuardBumper');
  assert.equal(item.price, 180);
  assert.deepEqual(trinketModifiers(CATALOG, [item.id]).gutterBounceChances, [0.35]);
  assert.deepEqual(
    trinketModifiers(CATALOG, ['rubberGutterBumper', 'gutterGuardBumper'])
      .gutterBounceChances,
    [0.5, 0.35],
  );
});

test('trinket ouroborosCapacitor adds capped next-spin X per lip drop', () => {
  const item = trinket('ouroborosCapacitor');
  assert.equal(item.price, 280);
  assert.deepEqual(collectTrinketEffects(CATALOG, [item.id], 'onLipDrop'), [
    { e: 'addNextSpinX', amount: 0.25, cap: 3, key: 'ouroboros' },
  ]);
  assert.deepEqual(
    collectTrinketEffects(CATALOG, [item.id], 'onLipDrop', {
      nextSpin: { xBonus: { ouroboros: 2.9 }, addMult: 0, bonusOrbs: 0 },
    }),
    [{ e: 'addNextSpinX', amount: 0.1, cap: 3, key: 'ouroboros' }],
  );
});

test('trinket loadedPlatinumDie adds 20 chips per scoring cell', () => {
  const item = trinket('loadedPlatinumDie');
  assert.equal(item.price, 150);
  assert.deepEqual(collectTrinketEffects(CATALOG, [item.id], 'onCellScored'), [
    { e: 'addChips', amount: 20 },
  ]);
});

test('trinket overvoltedSolenoid spawns one copper token each spin', () => {
  const item = trinket('overvoltedSolenoid');
  assert.equal(item.price, 180);
  const [effect] = collectTrinketEffects(CATALOG, [item.id], 'onSpinStart');
  assert.ok(effect);
  if (effect.e !== 'spawnToken') assert.fail('expected spawnToken');
  assert.equal(effect.template.symbolId, 'scrap');
  assert.equal(effect.template.skin, 'copper');
  assert.equal(effect.template.count, 1);
  assert.equal(effect.template.stack, 1);
});

test('trinket vipBullionStamp raises lip payouts by 25%', () => {
  const item = trinket('vipBullionStamp');
  assert.equal(item.price, 260);
  assert.deepEqual(collectTrinketEffects(CATALOG, [item.id], 'onLipDrop'), [
    { e: 'mulLipPayout', factor: 1.25 },
  ]);
});

test('trinket teslaPegCapacitor nudges tokens on every 3rd peg hit', () => {
  const item = trinket('teslaPegCapacitor');
  assert.equal(item.price, 260);
  assert.deepEqual(collectTrinketEffects(CATALOG, [item.id], 'onPegHit', { pegHitCount: 2 }), []);
  assert.deepEqual(collectTrinketEffects(CATALOG, [item.id], 'onPegHit', { pegHitCount: 3 }), [
    { e: 'simDirective', directive: { t: 'nudgeForward', distance: 4 } },
  ]);
});

test('trinket midasLipSensor adds 75 cash per lip drop', () => {
  const item = trinket('midasLipSensor');
  assert.equal(item.price, 390);
  assert.deepEqual(collectTrinketEffects(CATALOG, [item.id], 'onLipDrop'), [
    { e: 'addCash', amount: 75, reason: 'bonus' },
  ]);
});

// --------------------------------------------------------------- drinks (5)
test('drink dirtySyndicateMartini grants 2 bonus orbs and +1 Mult next spin', () => {
  const item = drink('dirtySyndicateMartini');
  assert.equal(item.price, 110);
  assert.equal(item.instant, false);
  assert.deepEqual(collectDrinkEffects(CATALOG, [item.id], 'onSpinStart'), [
    { e: 'addBonusOrbs', count: 2 },
  ]);
  assert.deepEqual(collectDrinkEffects(CATALOG, [item.id], 'onSpinEvaluated'), [
    { e: 'addNextSpinMult', amount: 1 },
  ]);
});

test('drink alchemistAbsinthe grants next-spin X and a 3-high bullion stack', () => {
  const item = drink('alchemistAbsinthe');
  assert.equal(item.price, 160);
  assert.equal(item.instant, false);
  const [spawn] = collectDrinkEffects(CATALOG, [item.id], 'onSpinStart');
  assert.ok(spawn);
  if (spawn.e !== 'spawnToken') assert.fail('expected spawnToken');
  assert.equal(spawn.template.skin, 'bullion');
  assert.equal(spawn.template.stack, 3);
  assert.deepEqual(collectDrinkEffects(CATALOG, [item.id], 'onSpinEvaluated'), [
    { e: 'addNextSpinX', amount: 1, cap: 9, key: 'alchemistAbsinthe' },
  ]);
});

test('drink greenFairyAbsinthe surges the dozer and grants x1.5 X next spin', () => {
  const item = drink('greenFairyAbsinthe');
  assert.equal(item.price, 140);
  assert.deepEqual(collectDrinkEffects(CATALOG, [item.id], 'onSpinStart'), [
    { e: 'simDirective', directive: { t: 'surge' } },
  ]);
  assert.deepEqual(collectDrinkEffects(CATALOG, [item.id], 'onSpinEvaluated'), [
    { e: 'addNextSpinX', amount: 0.5, cap: 9, key: 'nextSpinX' },
  ]);
});

test('drink nitrousEspresso grants 4 bonus orbs next spin', () => {
  const item = drink('nitrousEspresso');
  assert.equal(item.price, 120);
  assert.equal(item.instant, false);
  assert.deepEqual(collectDrinkEffects(CATALOG, [item.id], 'onSpinStart'), [
    { e: 'addBonusOrbs', count: 4 },
  ]);
});

test('drink lubricantOilShot is instant and triggers a dozer surge', () => {
  const item = drink('lubricantOilShot');
  assert.equal(item.price, 95);
  assert.equal(item.instant, true);
  assert.deepEqual(collectDrinkEffects(CATALOG, [item.id], 'onSpinStart'), [
    { e: 'simDirective', directive: { t: 'surge' } },
  ]);
});

// ----------------------------------------------------------------- coins (4)
test('coin copperToken is the identity profile', () => {
  const profile = coinProfile(coin('copperToken'));
  assert.deepEqual(profile, {
    id: 'copperToken',
    name: 'Copper Token',
    massMul: 1,
    bounceMul: 1,
    payoutMul: 1,
    costPerSpin: 0,
    resistSuction: false,
  });
  assert.deepEqual(applyCoinToOrb(coin('copperToken'), { mass: 2, elasticity: 0.8 }), {
    mass: 2,
    elasticity: 0.8,
  });
});

test('coin heavyLeadSlug is heavy, less bouncy and resists suction', () => {
  const profile = coinProfile(coin('heavyLeadSlug'));
  assert.equal(profile.massMul, 1.6);
  assert.equal(profile.bounceMul, 0.7);
  assert.equal(profile.resistSuction, true);
  const token = applyCoinToToken(coin('heavyLeadSlug'), {
    mass: 1,
    resistSuction: false,
  });
  assert.equal(token.mass, 1.6);
  assert.equal(token.resistSuction, true);
});

test('coin polymerSuperball is light and extra bouncy', () => {
  const profile = coinProfile(coin('polymerSuperball'));
  assert.equal(profile.massMul, 0.7);
  assert.equal(profile.bounceMul, 1.35);
  const orb = applyCoinToOrb(coin('polymerSuperball'), { mass: 2, elasticity: 1 });
  assert.equal(orb.mass, 1.4);
  assert.equal(orb.elasticity, 1.35);
});

test('coin bloodDoubloon doubles payouts and costs 50 per spin', () => {
  const blood = coin('bloodDoubloon');
  const profile = coinProfile(blood);
  assert.equal(profile.massMul, 1.15);
  assert.equal(profile.bounceMul, 1.1);
  assert.equal(profile.payoutMul, 2);
  assert.equal(coinPayout(100, blood), 200);
  assert.equal(coinSpinCost(blood), 50);
});

// ------------------------------------------------------- stacking and content
test('duplicate trinkets stack additively and have no count cap', () => {
  assert.deepEqual(collectTrinketEffects(CATALOG, ['loadedPlatinumDie', 'loadedPlatinumDie'], 'onCellScored'), [
    { e: 'addChips', amount: 40 },
  ]);
  assert.deepEqual(
    collectTrinketEffects(CATALOG, ['vampiricStepperMotor', 'vampiricStepperMotor'], 'onSpinEvaluated'),
    [{ e: 'mulX', factor: 2 }],
  );
  assert.deepEqual(collectTrinketEffects(CATALOG, ['midasLipSensor', 'midasLipSensor'], 'onLipDrop'), [
    { e: 'addCash', amount: 150, reason: 'bonus' },
  ]);
  assert.deepEqual(collectTrinketEffects(CATALOG, ['vipBullionStamp', 'vipBullionStamp'], 'onLipDrop'), [
    { e: 'mulLipPayout', factor: 1.5 },
  ]);

  const many = Array.from({ length: 20 }, () => 'loadedPlatinumDie');
  assert.equal(trinketCounts(many).loadedPlatinumDie, 20);
  assert.deepEqual(collectTrinketEffects(CATALOG, many, 'onCellScored'), [
    { e: 'addChips', amount: 400 },
  ]);
});

test('trinket and drink effects combine through one dispatch', () => {
  const effects = collectItemEffects(
    CATALOG,
    ['loadedPlatinumDie'],
    ['nitrousEspresso'],
    'onSpinStart',
  );
  assert.deepEqual(effects, [{ e: 'addBonusOrbs', count: 4 }]);
  const both = dispatchHook(
    'onSpinEvaluated',
    [...trinketRefs(CATALOG, ['vampiricStepperMotor']), ...drinkRefs(CATALOG, ['greenFairyAbsinthe'])],
  );
  assert.deepEqual(both, [
    { e: 'mulX', factor: 1.5 },
    { e: 'addNextSpinX', amount: 0.5, cap: 9, key: 'nextSpinX' },
  ]);
});

test('every content item handler id resolves to a C-4 action', () => {
  assert.deepEqual(unresolvedHandlerIds(CATALOG), []);
  const hookSet = new Set<string>(HOOK_NAMES);
  for (const item of CATALOG) {
    if (!('effects' in item)) continue;
    for (const ref of item.effects) {
      assert.ok(hookSet.has(ref.handler), `${item.id} names unknown hook ${ref.handler}`);
      const action = ref.params?.action;
      assert.equal(typeof action, 'string', `${item.id} has no action`);
      assert.ok(hasEffectHandler(action as string), `${item.id} action ${String(action)} missing`);
    }
  }
  const counts = { TRINKET: 0, DRINK: 0, COIN: 0, REEL: 0, CHASSIS: 0 };
  for (const item of CATALOG) counts[item.category] += 1;
  assert.deepEqual(counts, { TRINKET: 15, DRINK: 5, COIN: 4, REEL: 5, CHASSIS: 7 });
});

test('item collections are pure and coin-aware stat transforms compose', () => {
  const owned = ['midasLipSensor'];
  const before = JSON.stringify(owned);
  const mounted = addTrinket(owned, 'midasLipSensor');
  assert.deepEqual(owned, ['midasLipSensor']);
  assert.equal(JSON.stringify(owned), before);
  assert.deepEqual(mounted, ['midasLipSensor', 'midasLipSensor']);
  assert.deepEqual(removeTrinket(mounted, 'midasLipSensor'), ['midasLipSensor']);

  const tray = addDrinkToTray([], 'nitrousEspresso');
  assert.deepEqual(tray, ['nitrousEspresso', null, null]);
  assert.deepEqual(removeDrinkFromTray(tray, 0), [null, null, null]);

  const index = indexItems(CATALOG);
  assert.equal(index.get('midasLipSensor')?.id, 'midasLipSensor');
  assert.equal(findCoin(CATALOG, 'bloodDoubloon')?.payoutMul, 2);
  assert.equal(itemRefs(undefined).length, 0);
  assert.equal(glyphSymbol(CATALOG.find((item) => item.id === 'uraniumGlyph')!), 'uranium');
  assert.deepEqual(emptyNextSpin(), { xBonus: {}, addMult: 0, bonusOrbs: 0 });

  const spec = applyCoinToOrbSpec(coin('heavyLeadSlug'), {
    mass: 1,
    elasticity: 1,
    token: {
      symbolId: 'diamond',
      skin: 'diamond',
      radius: 11,
      mass: 1.6,
      slide: 0.35,
      count: 1,
      stack: 1,
      weldOnLand: true,
      magnetic: false,
      seismic: false,
      resistSuction: false,
    },
  });
  assert.equal(spec.mass, 1.6);
  assert.equal(spec.elasticity, 0.7);
  assert.ok(Math.abs(spec.token.mass - 2.56) < 1e-12);
  assert.equal(spec.token.resistSuction, true);
});

test('all trinket/drink handler references resolve without throwing', () => {
  const refs: HandlerRef[] = [];
  for (const item of CATALOG) {
    if ('effects' in item) refs.push(...item.effects);
  }
  for (const hook of HOOK_NAMES) {
    assert.doesNotThrow(() => dispatchHook(hook, refs, { orbLaunchCount: 2, pegHitCount: 3 }));
  }
});
