/**
 * Spec-drift regressions (docs/DRIFT.md): run-machine rules that SPEC 1.4 and
 * 2.5-2.7 make normative and that earlier builds missed or contradicted.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RULES,
  SIM,
  type ChassisDef,
  type EngineEvent,
  type FloorId,
  type ItemDef,
  type RunState,
  type ShopOffer,
} from '@jackpotsyndicate/contracts';
import { CONTENT_BUNDLE } from '../../content/src/index';
import {
  RunMachine,
  createRunState,
  offerPrice,
  overvoltLineIds,
  purchaseBlock,
  type RunContent,
} from '../src/run/index.js';

const CONTENT: RunContent = CONTENT_BUNDLE;

function item(id: string): ItemDef {
  const found = CONTENT_BUNDLE.items.find((candidate) => candidate.id === id);
  assert.ok(found, `content has ${id}`);
  return found;
}

function offer(id: string, offerId = 'offer-0'): ShopOffer {
  const def = item(id);
  return { offerId, itemId: def.id, category: def.category, price: def.price, sold: false };
}

/** A machine resumed at `phase` with a rich bankroll. */
function at(phase: RunState['phase'], patch: (state: RunState) => void = () => {}): RunMachine {
  const state = createRunState(CONTENT, `drift:${phase}`);
  state.phase = phase;
  state.bankroll = 100_000;
  patch(state);
  return RunMachine.fromState(CONTENT, state);
}

function shopWith(...ids: string[]): RunMachine {
  return at('SHOP', (state) => {
    state.shop.archetype = 'MIXED';
    state.shop.offers = ids.map((id, index) => offer(id, `offer-${index}`));
  });
}

function bossWin(floorId: FloorId): RunMachine {
  const machine = at('ROUND_SETTLE', (state) => {
    state.floorId = floorId;
    state.round = RULES.NORMAL_ROUNDS_PER_FLOOR + 1;
    state.spinsLeft = 0;
    state.boss = { score: 100, spin: RULES.SPINS_PER_ROUND };
    state.roundCash = 1_000;
  });
  for (let i = 0; i < SIM.ROUND_SETTLE_TICKS + 1; i++) machine.tick();
  assert.equal(machine.getPhase(), 'ROUND_RESULT');
  machine.drainEvents();
  assert.deepEqual(machine.dispatch({ c: 'ContinueAfterRound' }), { ok: true });
  return machine;
}

function rewarded(events: readonly EngineEvent[]): Extract<EngineEvent, { t: 'BossRewarded' }> {
  const event = events.find(
    (candidate): candidate is Extract<EngineEvent, { t: 'BossRewarded' }> => candidate.t === 'BossRewarded',
  );
  assert.ok(event, 'BossRewarded emitted');
  return event;
}

// ------------------------------------------------------------------ bosses

test('R-BOS-02: beating Valenti deals a 3-relic pick (D-09)', () => {
  const machine = bossWin('FLOOR_NEON');
  assert.equal(machine.getPhase(), 'RELIC_PICK');
  const event = rewarded(machine.drainEvents());
  assert.deepEqual([event.bossId, event.reward, event.amount], ['valenti', 'relicChoice', 3]);
  assert.equal(machine.getState().pendingRelics?.length, 3);
});

test('R-BOS-03: beating Madame Zero adds +2 shop capacity instead of a relic', () => {
  const machine = bossWin('FLOOR_CRYO');
  assert.equal(machine.getPhase(), 'ELEVATOR');
  assert.equal(machine.getState().shop.capacity, RULES.SHOP_START_CAPACITY + 2);
  assert.equal(machine.getState().trinkets.length, 0);
  const event = rewarded(machine.drainEvents());
  assert.equal(event.bossId, 'zero');
  assert.equal(event.reward, 'shopCapacity');
  assert.equal(event.amount, 2);
  assert.deepEqual(machine.getState().floorsCleared, ['FLOOR_CRYO']);
});

test('R-BOS-04: beating the Iron Auditor ends the run in victory', () => {
  const machine = bossWin('FLOOR_PENTHOUSE');
  assert.equal(machine.getPhase(), 'VICTORY');
  const events = machine.drainEvents();
  assert.equal(rewarded(events).reward, 'victory');
  assert.ok(events.some((event) => event.t === 'RunEnded' && event.outcome === 'victory'));
});

test('relic and jumper offers live in RunState so a resumed picker can finish', () => {
  const machine = bossWin('FLOOR_NEON');
  const offered = machine.getState().pendingRelics!;
  const resumed = RunMachine.fromState(CONTENT, structuredClone(machine.getState()));
  const replay = resumed.pendingOfferEvent();
  assert.deepEqual(replay, { t: 'RelicsOffered', itemIds: offered });
  assert.deepEqual(resumed.dispatch({ c: 'ChooseRelic', index: 1 }), { ok: true });
  assert.deepEqual(resumed.getState().trinkets, [offered[1]]);
  assert.equal(resumed.getState().pendingRelics, undefined);
  assert.equal(resumed.getPhase(), 'ELEVATOR');

  const shop = shopWith('jumperWire');
  assert.deepEqual(shop.dispatch({ c: 'ShopBuy', offerId: 'offer-0' }), { ok: true });
  assert.equal(shop.getPhase(), 'JUMPER_PICK');
  const paths = shop.getState().pendingJumpers!;
  assert.equal(paths.length, 3);
  const resumedPick = RunMachine.fromState(CONTENT, structuredClone(shop.getState()));
  assert.deepEqual(resumedPick.dispatch({ c: 'ChooseJumper', index: 2 }), { ok: true });
  assert.deepEqual(resumedPick.getState().jumpers, [paths[2]]);
  assert.equal(resumedPick.getPhase(), 'SHOP');
});

// ---------------------------------------------------------------- mutations

test('R-MUT-06: SetOvervolt needs the Overvolt chassis; buying it arms the middle row', () => {
  const prep = at('PREP');
  const before = JSON.stringify(prep.getState());
  assert.deepEqual(prep.dispatch({ c: 'SetOvervolt', lineId: 'row:0' }), { ok: false, error: 'NOT_OWNED' });
  assert.equal(JSON.stringify(prep.getState()), before);
  assert.deepEqual(prep.dispatch({ c: 'SetOvervolt', lineId: null }), { ok: true });

  const shop = shopWith('overvolt');
  assert.deepEqual(shop.dispatch({ c: 'ShopBuy', offerId: 'offer-0' }), { ok: true });
  assert.equal(shop.getState().overvoltOwned, true);
  assert.equal(shop.getState().overvoltLineId, 'row:1');
  assert.ok(shop.drainEvents().some((event) => event.t === 'OvervoltSet' && event.lineId === 'row:1'));
  assert.equal(purchaseBlock(shop.getState(), item('overvolt')), 'AT_LIMIT');
});

test('R-MUT-06: overvolt accepts every CLASSIC/HYPER/jumper line id and no WAYS line', () => {
  const machine = at('PREP', (state) => {
    state.overvoltOwned = true;
    state.grid.wiring = 'HYPER';
    state.jumpers = [[[0, 0], [1, 1], [2, 1]]];
  });
  const ids = overvoltLineIds(machine.getState());
  assert.deepEqual(ids, ['row:0', 'row:1', 'row:2', 'diag:down', 'diag:up', 'hyper:v', 'hyper:inverted-v', 'jumper:0']);
  for (const lineId of ['hyper:v', 'jumper:0', 'diag:up']) {
    assert.deepEqual(machine.dispatch({ c: 'SetOvervolt', lineId }), { ok: true });
    assert.equal(machine.getState().overvoltLineId, lineId);
  }
  assert.deepEqual(machine.dispatch({ c: 'SetOvervolt', lineId: 'row-0' }), { ok: false, error: 'INVALID_TARGET' });

  const ways = at('PREP', (state) => {
    state.overvoltOwned = true;
    state.grid.wiring = 'WAYS';
  });
  assert.deepEqual(ways.dispatch({ c: 'SetOvervolt', lineId: 'row:0' }), { ok: false, error: 'INVALID_TARGET' });
});

test('R-MUT-05: jumper wires are refused (not charged) at the cap or on WAYS/CLUSTER', () => {
  const capped = at('SHOP', (state) => {
    state.shop.offers = [offer('jumperWire')];
    state.jumpers = [[[0, 0], [1, 1], [2, 1]], [[0, 1], [1, 0], [2, 0]], [[0, 2], [1, 1], [2, 0]]];
  });
  const bankroll = capped.getState().bankroll;
  assert.deepEqual(capped.dispatch({ c: 'ShopBuy', offerId: 'offer-0' }), { ok: false, error: 'AT_LIMIT' });
  assert.equal(capped.getState().bankroll, bankroll);
  assert.equal(capped.getPhase(), 'SHOP');

  const ways = at('SHOP', (state) => {
    state.shop.offers = [offer('jumperWire')];
    state.grid.wiring = 'CLUSTER';
  });
  assert.deepEqual(ways.dispatch({ c: 'ShopBuy', offerId: 'offer-0' }), { ok: false, error: 'INVALID_TARGET' });
  assert.equal(purchaseBlock(ways.getState(), item('overvolt')), 'INVALID_TARGET');
  assert.equal(purchaseBlock(ways.getState(), item('clusterHarness')), 'INVALID_TARGET');
  assert.equal(purchaseBlock(ways.getState(), item('hyperHarness')), null);
});

// --------------------------------------------------------------------- shop

test('R-SHP-02: the reroll price escalates across a floor and resets on a new floor', () => {
  const machine = at('ROUND_RESULT');
  machine.setLastResult({ kind: 'normal', passed: true, quota: 0, bankrollBefore: 0, bankrollAfter: 0 });
  machine.dispatch({ c: 'ContinueAfterRound' });
  assert.equal(machine.getPhase(), 'SHOP');
  assert.deepEqual(machine.dispatch({ c: 'ShopReroll' }), { ok: true });
  assert.deepEqual(machine.dispatch({ c: 'ShopReroll' }), { ok: true });
  const escalated = machine.getState().shop.rerollCost;
  assert.equal(escalated, Math.round(Math.round(RULES.SHOP_REROLL_BASE * RULES.SHOP_REROLL_GROWTH) * RULES.SHOP_REROLL_GROWTH));
  machine.dispatch({ c: 'ShopLeave' });
  assert.equal(machine.getState().shop.rerollCost, escalated, 'kept after leaving');

  const next = at('ELEVATOR', (state) => {
    state.shop.rerollCost = escalated;
  });
  next.dispatch({ c: 'ChooseFloor', floorId: 'FLOOR_CRYO' });
  assert.equal(next.getState().shop.rerollCost, RULES.SHOP_REROLL_BASE);
});

test('R-SHP-02: expanding the shelf stocks the new slot immediately', () => {
  const machine = shopWith('cherryGlyph', 'quantumSplitterCoil');
  machine.drainEvents();
  assert.deepEqual(machine.dispatch({ c: 'ShopExpand' }), { ok: true });
  const offers = machine.getState().shop.offers;
  assert.equal(offers.length, 3);
  assert.equal(offers[2]!.offerId, 'offer-2');
  assert.ok(!['cherryGlyph', 'quantumSplitterCoil'].includes(offers[2]!.itemId));
  const rolled = machine.drainEvents().find((event) => event.t === 'ShopRolled');
  assert.ok(rolled && rolled.t === 'ShopRolled' && rolled.offers.length === 3);
});

test('SPEC 2.7: chassis repeat prices follow ownership (+Reel column 400 then 900)', () => {
  const column = item('reelColumn') as ChassisDef;
  const state = createRunState(CONTENT, 'prices');
  assert.equal(offerPrice(state, column), column.repeatPrices![0]);
  state.grid.cols = 4;
  assert.equal(offerPrice(state, column), column.repeatPrices![1]);
  state.grid.cols = RULES.MAX_COLS;
  assert.equal(purchaseBlock(state, column), 'AT_LIMIT');
  assert.equal(offerPrice(state, item('quantumSplitterCoil')), item('quantumSplitterCoil').price);
});

test('the shop never offers owned or free coins, or maxed chassis', () => {
  for (let seed = 0; seed < 40; seed++) {
    const machine = at('ROUND_RESULT', (state) => {
      state.seed = `pool-${seed}`;
      state.floorId = 'FLOOR_PENTHOUSE';
      state.ownedCoins.push('heavyLeadSlug');
      state.grid.cols = RULES.MAX_COLS;
      state.grid.strips.push([...state.grid.strips[1]!], [...state.grid.strips[1]!]);
      state.grid.visible.push([...state.grid.visible[1]!], [...state.grid.visible[1]!]);
      state.shop.capacity = RULES.SHOP_MAX_CAPACITY;
    });
    machine.setLastResult({ kind: 'normal', passed: true, quota: 0, bankrollBefore: 0, bankrollAfter: 0 });
    machine.dispatch({ c: 'ContinueAfterRound' });
    for (const shelf of machine.getState().shop.offers) {
      assert.notEqual(shelf.itemId, 'heavyLeadSlug');
      assert.notEqual(shelf.itemId, 'copperToken');
      assert.notEqual(shelf.itemId, 'reelColumn');
    }
  }
});

// -------------------------------------------------------------------- items

test('SPEC 2.7: Blood Doubloon charges 50 per spin and blocks the spin when unaffordable', () => {
  const machine = at('PREP', (state) => {
    state.ownedCoins.push('bloodDoubloon');
    state.loadedCoin = 'bloodDoubloon';
    state.bankroll = 120;
  });
  assert.deepEqual(machine.dispatch({ c: 'Spin' }), { ok: true });
  assert.equal(machine.getState().bankroll, 70);
  const charge = machine.drainEvents().find((event) => event.t === 'BankrollChanged');
  assert.deepEqual(charge && { delta: charge.delta, reason: charge.reason }, { delta: -50, reason: 'coin' });

  const broke = at('PREP', (state) => {
    state.ownedCoins.push('bloodDoubloon');
    state.loadedCoin = 'bloodDoubloon';
    state.bankroll = 49;
  });
  const before = JSON.stringify(broke.getState());
  assert.deepEqual(broke.dispatch({ c: 'Spin' }), { ok: false, error: 'INSUFFICIENT_FUNDS' });
  assert.equal(JSON.stringify(broke.getState()), before);
  assert.deepEqual(broke.dispatch({ c: 'LoadCoin', coinId: 'copperToken' }), { ok: true });
});

test('D-08: an instant drink acts now and leaves the active-drink slot free', () => {
  const machine = at('PREP', (state) => {
    state.drinkTray = ['lubricantOilShot', 'nitrousEspresso', null];
  });
  assert.deepEqual(machine.dispatch({ c: 'Drink', slot: 0 }), { ok: true });
  assert.deepEqual(machine.drainInstantDrinks(), ['lubricantOilShot']);
  assert.equal(machine.getState().activeDrink, null);
  assert.deepEqual(machine.dispatch({ c: 'Drink', slot: 1 }), { ok: true });
  assert.equal(machine.getState().activeDrink, 'nitrousEspresso');
  assert.deepEqual(machine.getState().drinkTray, [null, null, null]);
});

test('SPEC 2.7: a reel glyph queues its shelf bonus tokens', () => {
  const machine = shopWith('bloodDiamondGlyph');
  assert.deepEqual(machine.dispatch({ c: 'ShopBuy', offerId: 'offer-0', target: { reel: 1 } }), { ok: true });
  assert.deepEqual(machine.drainGlyphBonuses(), [{ symbolId: 'diamond', count: 2 }]);
  assert.equal(machine.getState().grid.strips[1]!.at(-1), 'diamond');
});

test('a consumed drink is announced with DrinkActive(null)', () => {
  const machine = at('PREP', (state) => {
    state.drinkTray = ['nitrousEspresso', null, null];
  });
  machine.dispatch({ c: 'Drink', slot: 0 });
  machine.dispatch({ c: 'Spin' });
  machine.beginResolving();
  machine.drainEvents();
  machine.spinResolved();
  assert.ok(machine.drainEvents().some((event) => event.t === 'DrinkActive' && event.itemId === null));
});
