import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPRITE_KEYS } from '@jackpotsyndicate/contracts';
import type { HandlerRef, ItemCategory, SymbolId } from '@jackpotsyndicate/contracts';
import { CONTENT_BUNDLE, content } from '../src/index';

/** C-4 hook ids. Handler references in content must name one of these. */
const C4_HOOKS = [
  'onRunStart',
  'onSpinStart',
  'onCellScored',
  'onSpinEvaluated',
  'onOrbLaunch',
  'onPegHit',
  'onChuteExit',
  'onTokenSpawn',
  'onDozerFullExtension',
  'onGutterLoss',
  'onLipDrop',
  'onRoundEnd',
  'onShopEnter',
  'physicsModifiers',
] as const;

const SPRITE_KEY_SET = new Set<string>(SPRITE_KEYS);
const SYMBOL_IDS: SymbolId[] = ['diamond', 'cherry', 'uranium', 'skull', 'seven'];
const CATEGORY_PREFIX: Record<ItemCategory, string> = {
  TRINKET: 'trinket',
  DRINK: 'drink',
  COIN: 'coin',
  REEL: 'glyph',
  CHASSIS: 'chassis',
};

function effectsOf(refs: HandlerRef[]): HandlerRef[] {
  return refs;
}

function assertHandlerRefs(refs: HandlerRef[], label: string): void {
  for (const ref of refs) {
    assert.ok(
      (C4_HOOKS as readonly string[]).includes(ref.handler),
      `${label} references unknown handler "${ref.handler}"`,
    );
    for (const value of Object.values(ref.params ?? {})) {
      assert.ok(
        typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean',
        `${label} handler "${ref.handler}" has a non-scalar parameter`,
      );
    }
  }
}

test('content bundle exports the same object through both aliases', () => {
  assert.equal(content, CONTENT_BUNDLE);
});

test('all five SPEC 2.6 symbols are present with normative slot, orb and token stats', () => {
  assert.deepEqual(
    CONTENT_BUNDLE.symbols.map((s) => s.id),
    SYMBOL_IDS,
  );

  const byId = new Map(CONTENT_BUNDLE.symbols.map((s) => [s.id, s]));

  const diamond = byId.get('diamond')!;
  assert.equal(diamond.name, 'Blood Diamond');
  assert.equal(diamond.rarity, 'rare');
  assert.deepEqual(diamond.slot, { chips: 45, addMult: 4, xMult: 1 });
  assert.deepEqual(
    [diamond.orb.mass, diamond.orb.elasticity, diamond.orb.chainGold],
    [1.6, 0.6, true],
  );
  assert.deepEqual(
    [diamond.token.radius, diamond.token.mass, diamond.token.slide, diamond.token.weldOnLand],
    [11, 1.6, 0.35, true],
  );

  const cherry = byId.get('cherry')!;
  assert.equal(cherry.name, 'Splitter Cherry');
  assert.equal(cherry.rarity, 'common');
  assert.deepEqual(cherry.slot, { chips: 20, addMult: 2, xMult: 1 });
  assert.deepEqual(
    [cherry.orb.mass, cherry.orb.elasticity, cherry.orb.canSplit, cherry.orb.splitOnFirstPeg],
    [0.75, 0.88, true, true],
  );
  assert.deepEqual(
    [cherry.token.radius, cherry.token.mass, cherry.token.count],
    [6.5, 0.75, 2],
  );

  const uranium = byId.get('uranium')!;
  assert.equal(uranium.name, 'Uranium-235');
  assert.equal(uranium.rarity, 'epic');
  assert.deepEqual(uranium.slot, { chips: 65, addMult: 0, xMult: 1.8 });
  assert.deepEqual(
    [uranium.orb.mass, uranium.orb.elasticity, uranium.orb.accelPerHit],
    [1.3, 0.96, 0.12],
  );
  assert.deepEqual(
    [uranium.token.radius, uranium.token.mass, uranium.token.slide, uranium.token.seismic],
    [10, 1.3, 0.25, true],
  );

  const skull = byId.get('skull')!;
  assert.equal(skull.name, 'Magnet Skull');
  assert.equal(skull.rarity, 'cursed');
  assert.deepEqual(skull.slot, { chips: 30, addMult: 5, xMult: 1, drainIfIdle: 25 });
  assert.deepEqual(
    [skull.orb.mass, skull.orb.elasticity, skull.orb.magnet],
    [1.25, 0.7, true],
  );
  assert.deepEqual(
    [skull.token.radius, skull.token.mass, skull.token.magnetic, skull.token.gutterDrain],
    [9.5, 1.25, true, 50],
  );

  const seven = byId.get('seven')!;
  assert.equal(seven.name, 'Overclocked Seven');
  assert.equal(seven.rarity, 'legendary');
  assert.deepEqual(seven.slot, { chips: 77, addMult: 7, xMult: 1.5, fullLineXMult: 5 });
  assert.deepEqual(
    [seven.orb.mass, seven.orb.elasticity, seven.orb.upgradesPegs],
    [1.1, 0.82, true],
  );
  assert.deepEqual(
    [seven.token.radius, seven.token.mass, seven.token.stack, seven.token.skin],
    [12, 1.1, 3, 'bullion'],
  );
});

test('SPEC 2.7 counts: 15 trinkets, 5 drinks, 4 coins, glyphs and chassis', () => {
  const counts: Record<ItemCategory, number> = { TRINKET: 0, DRINK: 0, COIN: 0, REEL: 0, CHASSIS: 0 };
  for (const item of CONTENT_BUNDLE.items) counts[item.category] += 1;
  assert.deepEqual(counts, { TRINKET: 15, DRINK: 5, COIN: 4, REEL: 5, CHASSIS: 7 });
});

test('all ids are unique across the entire bundle', () => {
  const ids = [
    ...CONTENT_BUNDLE.symbols.map((s) => s.id),
    ...CONTENT_BUNDLE.items.map((i) => i.id),
    ...CONTENT_BUNDLE.floors.map((f) => f.id),
    ...CONTENT_BUNDLE.bosses.map((b) => b.id),
  ];
  assert.equal(new Set(ids).size, ids.length, 'ids must be globally unique');
});

test('every handler reference names a C-4 hook with scalar params', () => {
  for (const symbol of CONTENT_BUNDLE.symbols) {
    assertHandlerRefs(effectsOf(symbol.effects), `symbol ${symbol.id}`);
  }
  for (const item of CONTENT_BUNDLE.items) {
    if ('effects' in item) assertHandlerRefs(item.effects, `item ${item.id}`);
  }
  for (const boss of CONTENT_BUNDLE.bosses) {
    assertHandlerRefs([boss.score, boss.reward], `boss ${boss.id}`);
    assertHandlerRefs(boss.sabotage, `boss ${boss.id} sabotage`);
  }
});

test('every sprite key is a known C-7 key for its category', () => {
  for (const symbol of CONTENT_BUNDLE.symbols) {
    assert.ok(SPRITE_KEY_SET.has(symbol.spriteKey), `missing ${symbol.spriteKey}`);
    assert.equal(symbol.spriteKey, `symbol.${symbol.id}`);
    const tokenKey = `token.${symbol.token.skin}`;
    assert.ok(SPRITE_KEY_SET.has(tokenKey), `missing token sprite ${tokenKey}`);
  }

  for (const item of CONTENT_BUNDLE.items) {
    const prefix = CATEGORY_PREFIX[item.category];
    assert.match(
      item.spriteKey,
      new RegExp(`^${prefix}\\.[a-z0-9]+(?:-[a-z0-9]+)*$`),
      `unexpected sprite key for ${item.id}`,
    );
  }

  for (const floor of CONTENT_BUNDLE.floors) {
    assert.ok(SPRITE_KEY_SET.has(floor.bgSpriteKey), `missing ${floor.bgSpriteKey}`);
    assert.equal(floor.bgSpriteKey, `floor.${floor.id}.bg`);
  }
  for (const boss of CONTENT_BUNDLE.bosses) {
    assert.ok(SPRITE_KEY_SET.has(boss.spriteKey), `missing ${boss.spriteKey}`);
    assert.equal(boss.spriteKey, `boss.${boss.id}`);
  }
});

test('trinket names, prices and effects match SPEC 2.7', () => {
  const expected: Record<string, { name: string; price: number }> = {
    quantumSplitterCoil: { name: 'Quantum Splitter Coil', price: 200 },
    electromagneticHopper: { name: 'Electromagnetic Hopper', price: 220 },
    vampiricStepperMotor: { name: 'Vampiric Stepper Motor', price: 300 },
    vampiricRakeCollector: { name: 'Vampiric Rake Collector', price: 310 },
    goldPegAlchemist: { name: 'Gold Peg Alchemist', price: 250 },
    turboDozerCam: { name: 'Turbo Dozer Cam', price: 200 },
    hydraulicDozerPiston: { name: 'Hydraulic Dozer Piston', price: 240 },
    rubberGutterBumper: { name: 'Rubber Gutter Bumper', price: 200 },
    gutterGuardBumper: { name: 'Gutter Guard Bumper', price: 180 },
    ouroborosCapacitor: { name: 'Ouroboros Capacitor', price: 280 },
    loadedPlatinumDie: { name: 'Loaded Platinum Die', price: 150 },
    overvoltedSolenoid: { name: 'Overvolted Solenoid', price: 180 },
    vipBullionStamp: { name: 'VIP Bullion Stamp', price: 260 },
    teslaPegCapacitor: { name: 'Tesla Peg Capacitor', price: 260 },
    midasLipSensor: { name: 'Midas Lip Sensor', price: 390 },
  };
  const trinkets = CONTENT_BUNDLE.items.filter((i) => i.category === 'TRINKET');
  assert.equal(trinkets.length, 15);
  for (const trinket of trinkets) {
    const spec = expected[trinket.id];
    assert.ok(spec, `unexpected trinket id ${trinket.id}`);
    assert.equal(trinket.name, spec.name);
    assert.equal(trinket.price, spec.price);
    assert.ok(trinket.effects.length > 0, `${trinket.id} must declare an effect`);
  }

  const coil = trinkets.find((t) => t.id === 'quantumSplitterCoil')!;
  assert.deepEqual(coil.effects[0]?.params, { action: 'everyNthCanSplit', every: 2 });
  const rake = trinkets.find((t) => t.id === 'vampiricRakeCollector')!;
  assert.deepEqual(rake.effects[0]?.params, { action: 'addNextSpinX', amount: 0.25, cap: 2, key: 'vampiricRake' });
  const rubber = trinkets.find((t) => t.id === 'rubberGutterBumper')!;
  assert.equal(rubber.effects[0]?.params?.chance, 0.5);
  const guard = trinkets.find((t) => t.id === 'gutterGuardBumper')!;
  assert.equal(guard.effects[0]?.params?.chance, 0.35);
});

test('drinks match SPEC 2.7 including instant handling', () => {
  const expected: Record<string, { name: string; price: number; instant: boolean }> = {
    dirtySyndicateMartini: { name: 'Dirty Syndicate Martini', price: 110, instant: false },
    alchemistAbsinthe: { name: 'Alchemist Absinthe', price: 160, instant: false },
    greenFairyAbsinthe: { name: 'Green Fairy Absinthe', price: 140, instant: false },
    nitrousEspresso: { name: 'Nitrous Espresso', price: 120, instant: false },
    lubricantOilShot: { name: 'Lubricant Oil Shot', price: 95, instant: true },
  };
  const drinks = CONTENT_BUNDLE.items.filter((i) => i.category === 'DRINK');
  assert.equal(drinks.length, 5);
  for (const drink of drinks) {
    const spec = expected[drink.id];
    assert.ok(spec, `unexpected drink id ${drink.id}`);
    assert.equal(drink.name, spec.name);
    assert.equal(drink.price, spec.price);
    assert.equal(drink.instant, spec.instant);
    assert.ok(drink.effects.length > 0, `${drink.id} must declare an effect`);
  }
});

test('coin stats match SPEC 2.7', () => {
  const expected: Record<string, [number, number, number, number, boolean]> = {
    copperToken: [1, 1, 1, 0, false],
    heavyLeadSlug: [1.6, 0.7, 1, 0, true],
    polymerSuperball: [0.7, 1.35, 1, 0, false],
    bloodDoubloon: [1.15, 1.1, 2, 50, false],
  };
  const coins = CONTENT_BUNDLE.items.filter((i) => i.category === 'COIN');
  assert.equal(coins.length, 4);
  for (const coin of coins) {
    const spec = expected[coin.id];
    assert.ok(spec, `unexpected coin id ${coin.id}`);
    assert.deepEqual(
      [coin.massMul, coin.bounceMul, coin.payoutMul, coin.costPerSpin, coin.resistSuction],
      spec,
    );
  }
  assert.equal(coins.find((c) => c.id === 'copperToken')!.price, 0);
  assert.equal(coins.find((c) => c.id === 'heavyLeadSlug')!.price, 150);
  assert.equal(coins.find((c) => c.id === 'polymerSuperball')!.price, 150);
  assert.equal(coins.find((c) => c.id === 'bloodDoubloon')!.price, 200);
});

test('glyphs target valid symbols and carry bonus token counts', () => {
  const glyphs = CONTENT_BUNDLE.items.filter((i) => i.category === 'REEL');
  assert.equal(glyphs.length, 5);
  const expected: Record<string, { symbolId: SymbolId; bonusTokens: number; price: number }> = {
    bloodDiamondGlyph: { symbolId: 'diamond', bonusTokens: 2, price: 220 },
    luckySevenGlyph: { symbolId: 'seven', bonusTokens: 1, price: 350 },
    uraniumGlyph: { symbolId: 'uranium', bonusTokens: 1, price: 290 },
    cherryGlyph: { symbolId: 'cherry', bonusTokens: 2, price: 90 },
    magnetSkullGlyph: { symbolId: 'skull', bonusTokens: 1, price: 60 },
  };
  for (const glyph of glyphs) {
    const spec = expected[glyph.id];
    assert.ok(spec, `unexpected glyph id ${glyph.id}`);
    assert.equal(glyph.symbolId, spec.symbolId);
    assert.equal(glyph.bonusTokens, spec.bonusTokens);
    assert.equal(glyph.price, spec.price);
  }
});

test('chassis kinds, prices and repeat price lists match SPEC 2.7', () => {
  const chassis = CONTENT_BUNDLE.items.filter((i) => i.category === 'CHASSIS');
  assert.equal(chassis.length, 7);
  const byKind = new Map(chassis.map((c) => [c.kind, c]));
  assert.equal(byKind.get('ADD_COLUMN')!.price, 400);
  assert.deepEqual(byKind.get('ADD_COLUMN')!.repeatPrices, [400, 900]);
  assert.equal(byKind.get('ADD_ROW')!.price, 600);
  assert.equal(byKind.get('HARNESS_HYPER')!.price, 300);
  assert.equal(byKind.get('HARNESS_WAYS')!.price, 600);
  assert.equal(byKind.get('HARNESS_CLUSTER')!.price, 350);
  assert.equal(byKind.get('JUMPER')!.price, 200);
  assert.equal(byKind.get('OVERVOLT')!.price, 350);
});

test('all four floors carry SPEC 2.7 physics, branching, peg layouts and shop weights', () => {
  assert.deepEqual(
    CONTENT_BUNDLE.floors.map((f) => f.id),
    ['FLOOR_NEON', 'FLOOR_CRYO', 'FLOOR_FOUNDRY', 'FLOOR_PENTHOUSE'],
  );

  const expected = {
    FLOOR_NEON: { order: 1, friction: 0.9, risk: 1, speed: 0.05 },
    FLOOR_CRYO: { order: 2, friction: 0.96, risk: 1.35, speed: 0.075 },
    FLOOR_FOUNDRY: { order: 2, friction: 0.84, risk: 0.65, speed: 0.045 },
    FLOOR_PENTHOUSE: { order: 3, friction: 0.91, risk: 1.15, speed: 0.065 },
  } as const;

  for (const floor of CONTENT_BUNDLE.floors) {
    const spec = expected[floor.id];
    assert.equal(floor.order, spec.order);
    assert.equal(floor.physics.friction, spec.friction);
    assert.equal(floor.physics.gutterRisk, spec.risk);
    assert.equal(floor.physics.dozerSpeed, spec.speed);
    assert.equal(floor.chuteMults.length, 5);
    assert.deepEqual(floor.chuteMults, [0.8, 1.5, 3, 1.5, 2]);
    assert.ok(floor.pegChips.gold > 0 && floor.pegChips.bumper > 0);
    assert.ok(floor.pegChips.golden > 0 && floor.pegChips.splitter >= 0);
    assert.ok(floor.bgSpriteKey.length > 0);

    const pegIds = floor.physics.pegs.map((p) => p.id);
    assert.ok(pegIds.length > 0, `${floor.id} needs a peg layout`);
    assert.equal(new Set(pegIds).size, pegIds.length, `${floor.id} has duplicate peg ids`);
    for (const peg of floor.physics.pegs) {
      assert.ok(peg.x >= 0 && peg.x <= 600, `${floor.id} peg x out of bounds`);
      assert.ok(peg.y >= 0 && peg.y <= 275, `${floor.id} peg y out of bounds`);
      assert.ok(peg.radius > 0);
    }
    const rows = new Set(floor.physics.pegs.map((p) => p.y.toFixed(6)));
    assert.equal(rows.size, 5, `${floor.id} should have five peg rows`);

    for (const weight of Object.values(floor.shop.archetypeWeights)) assert.ok(weight >= 0);
    assert.ok(Object.values(floor.shop.archetypeWeights).some((w) => w > 0));
    for (const weight of Object.values(floor.shop.categoryWeights)) assert.ok(weight >= 0);
    assert.ok(Object.values(floor.shop.categoryWeights).some((w) => w > 0));
    for (const weight of Object.values(floor.shop.rarityWeights)) assert.ok(weight >= 0);
    assert.ok(Object.values(floor.shop.rarityWeights).some((w) => w > 0));
  }

  const neon = CONTENT_BUNDLE.floors.find((f) => f.id === 'FLOOR_NEON')!;
  assert.deepEqual(neon.shop.archetypeWeights, { DRINKS: 25, TRINKETS: 25, REELS: 25, MIXED: 25 });
  assert.deepEqual(neon.next, ['FLOOR_CRYO', 'FLOOR_FOUNDRY']);
  assert.equal(neon.bossId, 'valenti');

  const cryo = CONTENT_BUNDLE.floors.find((f) => f.id === 'FLOOR_CRYO')!;
  assert.equal(cryo.shop.archetypeWeights.DRINKS, 60);
  assert.deepEqual(cryo.next, ['FLOOR_PENTHOUSE']);
  assert.equal(cryo.bossId, 'zero');

  const foundry = CONTENT_BUNDLE.floors.find((f) => f.id === 'FLOOR_FOUNDRY')!;
  assert.equal(foundry.shop.archetypeWeights.TRINKETS, 65);
  assert.ok(foundry.pegChips.gold > neon.pegChips.gold, 'Foundry pegs should pay more');
  assert.deepEqual(foundry.next, ['FLOOR_PENTHOUSE']);
  assert.equal(foundry.bossId, 'zero');

  const penthouse = CONTENT_BUNDLE.floors.find((f) => f.id === 'FLOOR_PENTHOUSE')!;
  assert.equal(penthouse.lipMult, 0.6);
  assert.equal(penthouse.quotaScale, 2.2);
  assert.deepEqual(penthouse.next, []);
  assert.equal(penthouse.bossId, 'auditor');
  assert.ok(penthouse.shop.archetypeWeights.REELS > 50);
  assert.ok(penthouse.shop.rarityWeights.legendary > neon.shop.rarityWeights.legendary);
});

test('three bosses encode SPEC 2.7 / R-BOS-02..04 hooks', () => {
  assert.deepEqual(
    CONTENT_BUNDLE.bosses.map((b) => b.id),
    ['valenti', 'zero', 'auditor'],
  );

  const [valenti, zero, auditor] = CONTENT_BUNDLE.bosses;
  assert.equal(valenti!.name, 'Don "The Vacuum" Valenti');
  assert.deepEqual(valenti!.score.params, { action: 'seededScore', min: 180, max: 320, floorScale: true });
  assert.ok(valenti!.sabotage.some((s) => s.params?.action === 'suction'));

  assert.equal(zero!.name, 'Madame Zero');
  assert.deepEqual(zero!.score.params, { action: 'frozenCellScore', base: 700, xPerFrozenCell: 0.5, floorScale: true });
  assert.ok(zero!.sabotage.some((s) => s.params?.action === 'freezeCells'));
  assert.ok(zero!.sabotage.some((s) => s.params?.action === 'iceBlocks'));
  assert.deepEqual(zero!.reward.params, { action: 'shopCapacity', amount: 2 });

  assert.equal(auditor!.name, 'The Iron Auditor');
  assert.deepEqual(auditor!.score.params, { action: 'deterministicCurve', base: 700, growth: 1.35, floorScale: true });
  assert.ok(auditor!.sabotage.some((s) => s.params?.action === 'removeCenterTokens'));
  assert.deepEqual(auditor!.reward.params, { action: 'victory' });
});

test('initial balance carries bankroll, quotas, strips and minimum match', () => {
  const balance = CONTENT_BUNDLE.balance;
  assert.equal(balance.startBankroll, 1000);
  assert.equal(balance.cashPerChip, 1);
  assert.equal(balance.minMatch, 3);
  assert.equal(balance.quotas.length, 9);
  // Tuned quota curve (docs/BALANCE.md); strictly rising within each floor.
  assert.deepEqual(balance.quotas, [450, 1800, 4500, 8000, 16000, 32000, 27300, 45500, 72700]);

  assert.ok(balance.baseStrip.length > 0);
  assert.ok(balance.firstReelStrip.length > 0);
  for (const symbol of balance.baseStrip) assert.ok(SYMBOL_IDS.includes(symbol));
  for (const symbol of balance.firstReelStrip) assert.ok(SYMBOL_IDS.includes(symbol));

  const counts = new Map<SymbolId, number>();
  for (const symbol of balance.baseStrip) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  assert.equal(counts.size, 5, 'base strip should weight all five symbols');
  assert.ok((counts.get('cherry') ?? 0) > (counts.get('seven') ?? 0), 'cherries should be the common symbol');

  let run = 0;
  for (const symbol of balance.firstReelStrip) {
    if (symbol === 'cherry') run += 1;
    else {
      assert.equal(run % 2, 0, 'cherries on the first reel must be placed in adjacent pairs');
      run = 0;
    }
  }
  assert.equal(run % 2, 0, 'cherries on the first reel must be placed in adjacent pairs');
});

test('every item has non-negative finite prices and balance-sheet values', () => {
  for (const item of CONTENT_BUNDLE.items) {
    assert.ok(Number.isFinite(item.price) && item.price >= 0, `${item.id} has an invalid price`);
    assert.ok(item.name.length > 0 && item.desc.length > 0, `${item.id} needs compendium text`);
    assert.ok(item.spriteKey.length > 0);
  }
  for (const value of [
    CONTENT_BUNDLE.balance.startBankroll,
    CONTENT_BUNDLE.balance.cashPerChip,
    ...CONTENT_BUNDLE.balance.quotas,
    CONTENT_BUNDLE.balance.minMatch,
  ]) {
    assert.ok(Number.isFinite(value) && value >= 0);
  }
});
