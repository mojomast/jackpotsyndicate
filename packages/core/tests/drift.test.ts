/**
 * Spec-drift regressions at the GameCore level (docs/DRIFT.md): symbol rules,
 * CLUSTER tumbles, glyph/drink/coin items, boss suction and resume offers.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANIM_TICKS,
  ORB_LAUNCH_DELAY_TICKS,
  RULES,
  type ContentBundle,
  type GameEvent,
  type RunState,
  type SymbolId,
} from '@jackpotsyndicate/contracts';
import { CONTENT_BUNDLE } from '../../content/src/index';
import { createGameCore } from '../src/index';

function contentWithStrips(first: SymbolId[], rest: SymbolId[]): ContentBundle {
  const content = structuredClone(CONTENT_BUNDLE);
  content.balance.firstReelStrip = first;
  content.balance.baseStrip = rest;
  return content;
}

function newCore(content: ContentBundle = CONTENT_BUNDLE, seed = 'drift') {
  const core = createGameCore({ content });
  assert.deepEqual(core.dispatch({ c: 'NewRun', seed }), { ok: true });
  core.tick();
  return core;
}

/** The live run state; tests poke it to reach a scenario directly. */
function live(core: ReturnType<typeof createGameCore>): RunState {
  return core.getState() as RunState;
}

function runSpin(core: ReturnType<typeof createGameCore>, limit = 20_000): GameEvent[] {
  assert.deepEqual(core.dispatch({ c: 'Spin' }), { ok: true });
  const events: GameEvent[] = [];
  let guard = 0;
  while ((core.phase === 'SPINNING' || core.phase === 'RESOLVING') && guard++ < limit) {
    events.push(...core.tick());
  }
  assert.ok(guard < limit, 'spin resolves');
  return events;
}

test('Magnet Skulls that are visible and not scoring drain 25 each (SPEC 2.6)', () => {
  // Reel 1 all cherries, reels 2-3 all skulls: no line wins, six idle skulls.
  const core = newCore(contentWithStrips(['cherry'], ['skull']));
  const before = core.getState().bankroll;
  const events = runSpin(core);
  const drain = events.find((event) => event.t === 'IdleDrain');
  assert.ok(drain && drain.t === 'IdleDrain');
  assert.equal(drain.cells.length, 6);
  assert.equal(drain.total, 6 * 25);
  const charged = events.find((event) => event.t === 'BankrollChanged' && event.reason === 'drain');
  assert.ok(charged && charged.t === 'BankrollChanged' && charged.delta === -150);
  const banked = events
    .filter((event) => event.t === 'CashBanked')
    .reduce((sum, event) => sum + (event.t === 'CashBanked' ? event.cash : 0), 0);
  assert.equal(core.getState().bankroll, before - 150 + banked);

  // Scoring skulls never drain.
  const winners = newCore(contentWithStrips(['skull'], ['skull']));
  assert.equal(runSpin(winners).some((event) => event.t === 'IdleDrain'), false);
});

test('CLUSTER wiring tumbles: TumbleStep events delay the orb plan 36 ticks each (R-MUT-04, C-6)', () => {
  const core = newCore(contentWithStrips(['cherry'], ['cherry']));
  live(core).grid.wiring = 'CLUSTER';
  assert.deepEqual(core.dispatch({ c: 'Spin' }), { ok: true });
  const events: GameEvent[] = [];
  let guard = 0;
  while (!events.some((event) => event.t === 'OrbValued') && guard++ < 1_000) events.push(...core.tick());

  const evaluated = events.find((event) => event.t === 'SpinEvaluated');
  assert.ok(evaluated && evaluated.t === 'SpinEvaluated');
  const steps = events.filter((event) => event.t === 'TumbleStep');
  assert.equal(steps.length, RULES.MAX_TUMBLES, 'an all-cherry board tumbles to the cap');
  steps.forEach((step, index) => {
    assert.equal(step.tick, evaluated.tick + ORB_LAUNCH_DELAY_TICKS + index * ANIM_TICKS.tumbleStep);
  });
  const firstOrb = events.find((event) => event.t === 'OrbValued')!;
  assert.equal(firstOrb.tick, evaluated.tick + ORB_LAUNCH_DELAY_TICKS + RULES.MAX_TUMBLES * ANIM_TICKS.tumbleStep);
  // Six evaluations (drawn grid + five tumbles) of a nine-cell cluster.
  assert.equal(evaluated.wins.length, 1 + RULES.MAX_TUMBLES);
  assert.equal(evaluated.orbPlan.filter((entry) => entry.cell !== null).length, 9 * (1 + RULES.MAX_TUMBLES));
});

test('a Uranium orb peg hit adds +15 chips to every other orb in flight (SPEC 2.6)', () => {
  const core = newCore(contentWithStrips(['uranium'], ['uranium']));
  const events = runSpin(core);
  const chips = new Map<number, number>();
  let boosted = 0;
  for (const event of events) {
    if (event.t === 'OrbValued') {
      const previous = chips.get(event.orbId);
      if (previous !== undefined && event.chips - previous === 15) boosted++;
      chips.set(event.orbId, event.chips);
    }
  }
  assert.ok(boosted > 0, 'other orbs gained exactly 15 chips from uranium hits');
});

test('reel glyphs drop their bonus tokens on the shelf with cash (SPEC 2.7)', () => {
  const core = newCore();
  const state = live(core);
  state.phase = 'SHOP';
  state.bankroll = 10_000;
  state.shop.archetype = 'REELS';
  state.shop.offers = [{ offerId: 'offer-0', itemId: 'bloodDiamondGlyph', category: 'REEL', price: 220, sold: false }];
  const tokensBefore = core.getSimSnapshot().tokens.length;
  assert.deepEqual(core.dispatch({ c: 'ShopBuy', offerId: 'offer-0', target: { reel: 0 } }), { ok: true });
  const events = core.tick();
  const valued = events.filter((event) => event.t === 'TokenValued');
  assert.equal(valued.length, 2);
  for (const event of valued) assert.equal(event.t === 'TokenValued' && event.cash, 45);
  assert.equal(events.filter((event) => event.t === 'TokenSpawned' && event.symbolId === 'diamond').length, 2);
  assert.equal(core.getSimSnapshot().tokens.length, tokensBefore + 2);
});

test('Lubricant Oil Shot surges the dozer at once (D-08)', () => {
  const core = newCore();
  live(core).drinkTray = ['lubricantOilShot', null, null];
  assert.deepEqual(core.dispatch({ c: 'Drink', slot: 0 }), { ok: true });
  const events = [...core.tick(), ...core.tick()];
  assert.ok(events.some((event) => event.t === 'SurgeStarted'));
  assert.equal(core.getState().activeDrink, null);
});

test('Valenti suction is live from the first PREP of the duel and after a resume (R-BOS-02)', () => {
  const core = newCore();
  assert.equal(core.getPhysicsModifiers().suction, 0);
  const state = live(core);
  state.round = RULES.NORMAL_ROUNDS_PER_FLOOR + 1;
  state.boss = { score: 0, spin: 0 };
  assert.deepEqual(core.dispatch({ c: 'LoadCoin', coinId: 'copperToken' }), { ok: true });
  assert.equal(core.getPhysicsModifiers().suction, 1);

  const save = core.save();
  const resumed = createGameCore();
  assert.deepEqual(resumed.load(save), { ok: true });
  assert.equal(resumed.getPhysicsModifiers().suction, 1);
});

test('a save at RELIC_PICK resumes with the same relic offer re-announced', () => {
  const core = newCore();
  const state = live(core);
  state.phase = 'RELIC_PICK';
  state.pendingRelics = ['midasLipSensor', 'vipBullionStamp', 'turboDozerCam'];
  const save = core.save();
  assert.deepEqual(save.run.pendingRelics, state.pendingRelics);

  const resumed = createGameCore();
  assert.deepEqual(resumed.load(save), { ok: true });
  const offered = resumed.tick().find((event) => event.t === 'RelicsOffered');
  assert.ok(offered && offered.t === 'RelicsOffered');
  assert.deepEqual(offered.itemIds, state.pendingRelics);
  assert.deepEqual(resumed.dispatch({ c: 'ChooseRelic', index: 2 }), { ok: true });
  assert.deepEqual(resumed.getState().trinkets, ['turboDozerCam']);
});
