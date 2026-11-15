import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FloorDef, ItemDef } from '@jackpotsyndicate/contracts';
import {
  ARCHETYPE_CATEGORIES,
  DEFAULT_ARCHETYPE_WEIGHTS,
  SHOP_ARCHETYPES,
  SHOP_CATEGORIES,
  applyExpand,
  canExpand,
  createShop,
  createShopRng,
  enterShop,
  expandCostOrNull,
  expandPrice,
  generateOffers,
  nextExpandCost,
  nextRerollCost,
  purchase,
  resetShop,
  rollArchetype,
  rollCategory,
  rollShop,
  rerollPrice,
  validateExpand,
  validatePurchase,
  validateReroll,
} from '../src/shop/index.js';

const floor = {
  shop: {
    archetypeWeights: { DRINKS: 25, TRINKETS: 25, REELS: 25, MIXED: 25 },
    categoryWeights: { TRINKET: 40, DRINK: 20, REEL: 20, COIN: 10, CHASSIS: 10 },
    rarityWeights: { common: 50, rare: 25, epic: 15, legendary: 7, cursed: 3 },
  },
} as unknown as FloorDef;

const items: ItemDef[] = [
  { id: 't1', name: 'T1', desc: '', price: 100, spriteKey: 'trinket.t1', rarity: 'common', category: 'TRINKET', effects: [] },
  { id: 't2', name: 'T2', desc: '', price: 200, spriteKey: 'trinket.t2', rarity: 'rare', category: 'TRINKET', effects: [] },
  { id: 't3', name: 'T3', desc: '', price: 300, spriteKey: 'trinket.t3', rarity: 'epic', category: 'TRINKET', effects: [] },
  { id: 'd1', name: 'D1', desc: '', price: 110, spriteKey: 'drink.d1', rarity: 'common', category: 'DRINK', instant: false, effects: [] },
  { id: 'd2', name: 'D2', desc: '', price: 160, spriteKey: 'drink.d2', rarity: 'rare', category: 'DRINK', instant: true, effects: [] },
  { id: 'r1', name: 'R1', desc: '', price: 220, spriteKey: 'chassis.r1', rarity: 'rare', category: 'REEL', symbolId: 'diamond', bonusTokens: 2 },
  { id: 'r2', name: 'R2', desc: '', price: 350, spriteKey: 'chassis.r2', rarity: 'legendary', category: 'REEL', symbolId: 'seven', bonusTokens: 1 },
  { id: 'c1', name: 'C1', desc: '', price: 150, spriteKey: 'coin.c1', rarity: 'common', category: 'COIN', massMul: 1, bounceMul: 1, payoutMul: 1, costPerSpin: 0, resistSuction: false },
  { id: 'c2', name: 'C2', desc: '', price: 200, spriteKey: 'coin.c2', rarity: 'rare', category: 'COIN', massMul: 1.15, bounceMul: 1.1, payoutMul: 2, costPerSpin: 50, resistSuction: false },
  { id: 'x1', name: 'X1', desc: '', price: 400, spriteKey: 'chassis.x1', rarity: 'epic', category: 'CHASSIS', kind: 'ADD_COLUMN' },
  { id: 'x2', name: 'X2', desc: '', price: 300, spriteKey: 'chassis.x2', rarity: 'rare', category: 'CHASSIS', kind: 'HARNESS_HYPER' },
];

test('seeded archetype rolls match floor weights within 2% over 100k rolls', () => {
  const rng = createShopRng('archetype-distribution');
  const counts: Record<string, number> = Object.fromEntries(SHOP_ARCHETYPES.map((a) => [a, 0]));
  const rolls = 100_000;
  for (let i = 0; i < rolls; i++) counts[rollArchetype(floor, rng)]!++;
  for (const archetype of SHOP_ARCHETYPES) {
    const expected = DEFAULT_ARCHETYPE_WEIGHTS[archetype] / 100;
    const actual = counts[archetype]! / rolls;
    assert.ok(Math.abs(actual - expected) <= 0.02, `${archetype}: ${actual} vs ${expected}`);
  }
});

test('seeded category rolls match weights within 2% over 100k rolls', () => {
  const rng = createShopRng('category-distribution');
  const counts: Record<string, number> = Object.fromEntries(SHOP_CATEGORIES.map((c) => [c, 0]));
  const rolls = 100_000;
  for (let i = 0; i < rolls; i++) counts[rollCategory('MIXED', floor, rng)]!++;
  const weights = floor.shop.categoryWeights;
  for (const category of SHOP_CATEGORIES) {
    const expected = weights[category] / 100;
    const actual = counts[category]! / rolls;
    assert.ok(Math.abs(actual - expected) <= 0.02, `${category}: ${actual} vs ${expected}`);
  }
});

test('archetypes draw categories only from their pools', () => {
  const rng = createShopRng('category-pools');
  for (let i = 0; i < 10_000; i++) {
    for (const archetype of SHOP_ARCHETYPES) {
      const category = rollCategory(archetype, floor, rng);
      assert.ok(ARCHETYPE_CATEGORIES[archetype].includes(category), `${archetype} -> ${category}`);
    }
  }
  const forced = new Set(SHOP_ARCHETYPES.filter((a) => ARCHETYPE_CATEGORIES[a].length === 1));
  assert.deepEqual([...forced].sort(), ['DRINKS', 'TRINKETS']);
});

test('reroll and expand price curves are exact', () => {
  const rerolls = [25, 36, 52, 75, 109, 158, 229, 332, 481, 697];
  const expansions = [150, 240, 384, 614, 982, 1571, 2514, 4022, 6435, 10296];
  assert.deepEqual(rerolls.map((_, i) => rerollPrice(i)), rerolls);
  assert.deepEqual(expansions.map((_, i) => expandPrice(i)), expansions);
  assert.equal(nextRerollCost(25), 36);
  assert.equal(nextRerollCost(36), 52);
  assert.equal(nextExpandCost(150), 240);
  assert.equal(nextExpandCost(240), 384);
});

test('expansion charges the current price, grows by 1.6 and caps at 10', () => {
  let shop = createShop();
  assert.equal(shop.capacity, 4);
  assert.equal(shop.expandCost, 150);
  for (let i = 0; i < 6; i++) {
    assert.equal(shop.capacity, 4 + i);
    assert.equal(shop.expandCost, expandPrice(i));
    const validation = validateExpand(shop, 1_000_000);
    assert.equal(validation.ok, true);
    if (!validation.ok) return;
    assert.equal(validation.cost, expandPrice(i));
    shop = applyExpand(shop);
  }
  assert.equal(shop.capacity, 10);
  assert.equal(expandCostOrNull(shop), null);
  assert.equal(canExpand(shop, 1_000_000), false);
  const blocked = validateExpand(shop, 1_000_000);
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.equal(blocked.error, 'AT_LIMIT');
});

test('offers respect the capacity cap and a ceiling of 10', () => {
  const shop = enterShop({ floor, items, capacity: 12, rng: createShopRng(7) });
  assert.equal(shop.capacity, 10);
  assert.equal(shop.offers.length, 10);
  const rolled = rollShop({ floor, items, count: 12, rng: createShopRng(7) });
  assert.equal(rolled.offers.length, 10);
  assert.ok(Object.values(rolled.categoryCounts).reduce((sum, n) => sum + n, 0) <= 10);
});

test('seeded offer generation is deterministic', () => {
  const a = rollShop({ floor, items, capacity: 4, rng: createShopRng(1234), archetype: 'MIXED' });
  const b = rollShop({ floor, items, capacity: 4, rng: createShopRng(1234), archetype: 'MIXED' });
  assert.deepEqual(a.offers, b.offers);
  assert.equal(a.archetype, b.archetype);
  assert.equal(generateOffers({ floor, items, capacity: 4, rng: createShopRng(1234), archetype: 'MIXED' }).length, 4);
});

test('purchase validation refuses overspend and returns effects without mutating state', () => {
  const shop = enterShop({ floor, items, capacity: 4, rng: createShopRng(88), archetype: 'MIXED' });
  const offer = shop.offers[0]!;
  const before = JSON.stringify(shop);

  const refused = validatePurchase(shop, offer.offerId, offer.price - 1);
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.equal(refused.error, 'INSUFFICIENT_FUNDS');
  assert.deepEqual(refused.effects, []);
  assert.equal(JSON.stringify(shop), before);

  const accepted = validatePurchase(shop, offer.offerId, offer.price + 100);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.bankrollAfter, 100);
  assert.ok(accepted.effects.length >= 3);
  assert.ok(accepted.effects.some((effect) => effect.e === 'spendBankroll'));
  assert.ok(accepted.effects.some((effect) => effect.e === 'grantItem'));
  assert.ok(accepted.effects.some((effect) => effect.e === 'markOfferSold'));
  assert.equal(JSON.stringify(shop), before);

  const result = purchase(shop, offer.offerId, offer.price);
  assert.equal(result.ok, true);
  if (!result.ok || !result.shop) return;
  assert.equal(result.shop.offers.find((candidate) => candidate.offerId === offer.offerId)?.sold, true);
  assert.equal(JSON.stringify(shop), before);
  assert.equal(JSON.stringify(result.shop), JSON.stringify(shop).replace('"sold":false', '"sold":true'));
});

test('unknown, sold and invalid-target purchases are rejected', () => {
  const shop = enterShop({ floor, items, capacity: 4, rng: createShopRng(4), archetype: 'MIXED' });
  assert.equal(validatePurchase(shop, 'missing', 1000).ok, false);
  const trinket = shop.offers.find((offer) => offer.category !== 'REEL')!;
  const badTarget = validatePurchase(shop, trinket.offerId, 1000, { target: { reel: 0 } });
  assert.equal(badTarget.ok, false);
  if (badTarget.ok) return;
  assert.equal(badTarget.error, 'INVALID_TARGET');
  const reelShop = enterShop({ floor, items, capacity: 4, rng: createShopRng(9), archetype: 'MIXED' });
  const reel = reelShop.offers.find((offer) => offer.category === 'REEL');
  if (reel) {
    const outOfRange = validatePurchase(reelShop, reel.offerId, 1000, { target: { reel: 5 } });
    assert.equal(outOfRange.ok, false);
    const valid = validatePurchase(reelShop, reel.offerId, 1000, { target: { reel: 1 }, maxCols: 5 });
    assert.equal(valid.ok, true);
  }
});

test('reroll prices grow, can be refused and reset each floor without touching capacity', () => {
  let shop = enterShop({ floor, items, capacity: 4, rng: createShopRng(21), archetype: 'MIXED' });
  const before = JSON.stringify(shop);
  const refused = validateReroll(shop, shop.rerollCost - 1);
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.equal(refused.error, 'INSUFFICIENT_FUNDS');
  assert.equal(JSON.stringify(shop), before);
  const accepted = validateReroll(shop, shop.rerollCost);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.cost, 25);
  assert.equal(JSON.stringify(shop), before);
  shop = applyExpand(shop);
  const capacity = shop.capacity;
  const expandPriceNow = shop.expandCost;
  shop = resetShop(shop);
  assert.equal(shop.rerollCost, 25);
  assert.equal(shop.capacity, capacity);
  assert.equal(shop.expandCost, expandPriceNow);
});
