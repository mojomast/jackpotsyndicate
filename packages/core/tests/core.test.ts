import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REEL_STOP_TICK, EVAL_DELAY_TICKS, ORB_LAUNCH_DELAY_TICKS, type GameEvent, type RunState } from '@jackpotsyndicate/contracts';
import {
  createBrowserLoop,
  createFixedStepLoop,
  createGameCore,
} from '../src/index';

interface PlayedRound {
  core: ReturnType<typeof createGameCore>;
  events: GameEvent[];
  ticks: number;
}

function playRound(seed = 'seed-11'): PlayedRound {
  const core = createGameCore();
  const events: GameEvent[] = [];
  assert.deepEqual(core.dispatch({ c: 'NewRun', seed }), { ok: true });

  let guard = 0;
  while (core.phase !== 'ROUND_RESULT' && guard++ < 30_000) {
    if (core.phase === 'PREP' && core.getState().spinsLeft > 0) {
      assert.deepEqual(core.dispatch({ c: 'Spin' }), { ok: true });
    }
    events.push(...core.tick());
  }
  assert.ok(guard < 30_000, 'round must settle within the tick budget');
  assert.equal(core.phase, 'ROUND_RESULT');
  return { core, events, ticks: core.tickCount };
}

function spinOnce(core: ReturnType<typeof createGameCore>): GameEvent[] {
  const events: GameEvent[] = [];
  assert.deepEqual(core.dispatch({ c: 'Spin' }), { ok: true });
  let guard = 0;
  while (
    (core.phase === 'SPINNING' || core.phase === 'RESOLVING') &&
    guard++ < 10_000
  ) {
    events.push(...core.tick());
  }
  assert.ok(guard < 10_000, 'spin must resolve');
  return events;
}

function lastOrbChips(events: readonly GameEvent[]): number {
  const chips = new Map<number, number>();
  for (const event of events) {
    if (event.t === 'OrbValued') chips.set(event.orbId, event.chips);
  }
  let total = 0;
  for (const value of chips.values()) total += value;
  return total;
}

test('a scripted run plays a complete round to RoundSettled headlessly', () => {
  const { core, events } = playRound('seed-11');

  const settled = events.filter(
    (event): event is Extract<GameEvent, { t: 'RoundSettled' }> => event.t === 'RoundSettled',
  );
  assert.equal(settled.length, 1, 'exactly one RoundSettled per round');
  assert.equal(settled[0]!.result.kind, 'normal');
  assert.equal(core.getState().stats.spins, 7);
  assert.equal(core.getState().spinsLeft, 0);

  // Every event is stamped and the stream is monotonic in tick order.
  for (const event of events) {
    assert.ok(Number.isFinite(event.tick));
    assert.ok(event.tick >= 0);
  }
  for (let i = 1; i < events.length; i++) {
    assert.ok(events[i]!.tick >= events[i - 1]!.tick, `tick went backwards at event ${i}`);
  }

  const types = new Set(events.map((event) => event.t));
  for (const required of [
    'RunStarted',
    'PhaseChanged',
    'SpinStarted',
    'ReelStopped',
    'SpinEvaluated',
    'OrbValued',
    'OrbLaunched',
    'PegHit',
    'OrbSplit',
    'ChuteExit',
    'TokenSpawned',
    'TokenValued',
    'LipDrop',
    'GutterLoss',
    'DozerFullExtension',
    'FeverTriggered',
    'SurgeStarted',
    'BankrollChanged',
    'RoundSettled',
  ]) {
    assert.ok(types.has(required as GameEvent['t']), `missing C-2 event ${required}`);
  }

  const cashBanked = events
    .filter((event): event is Extract<GameEvent, { t: 'CashBanked' }> => event.t === 'CashBanked')
    .reduce((sum, event) => sum + event.cash, 0);
  assert.equal(cashBanked, core.getState().stats.cashBanked);
  assert.ok(cashBanked > 0, 'seed-11 banks at least one lip drop');
});

test('command validation rejects illegal commands without changing state', () => {
  const core = createGameCore();
  const before = core.stateHash();
  assert.deepEqual(core.dispatch({ c: 'Spin' }), { ok: false, error: 'WRONG_PHASE' });
  assert.deepEqual(core.dispatch({ c: 'ShopBuy', offerId: 'x' }), { ok: false, error: 'WRONG_PHASE' });
  assert.deepEqual(core.dispatch({ c: 'Nope' } as never), { ok: false, error: 'INVALID_TARGET' });
  assert.equal(core.stateHash(), before);

  assert.deepEqual(core.dispatch({ c: 'NewRun', seed: 'validate' }), { ok: true });
  const afterStart = core.stateHash();
  assert.deepEqual(core.dispatch({ c: 'ContinueAfterRound' }), { ok: false, error: 'WRONG_PHASE' });
  assert.equal(core.stateHash(), afterStart);

  // A rejected command is harmless on replay too: the log keeps it, state does not move.
  assert.deepEqual(core.dispatch({ c: 'Spin' }), { ok: true });
  assert.equal(core.getState().phase, 'SPINNING');
  assert.deepEqual(core.dispatch({ c: 'Spin' }), { ok: false, error: 'WRONG_PHASE' });
});

test('tick ordering follows the C-6 reel/evaluation/launch schedule', () => {
  const core = createGameCore();
  core.dispatch({ c: 'NewRun', seed: 'timing' });
  const events: GameEvent[] = [];
  core.dispatch({ c: 'Spin' });
  let guard = 0;
  while (
    !events.some((event) => event.t === 'OrbLaunched') &&
    core.phase !== 'PREP' &&
    guard++ < 500
  ) {
    events.push(...core.tick());
  }
  assert.ok(guard < 500);

  const start = events.find(
    (event): event is Extract<GameEvent, { t: 'SpinStarted' }> => event.t === 'SpinStarted',
  );
  assert.ok(start !== undefined);
  const stopTicks = events
    .filter((event): event is Extract<GameEvent, { t: 'ReelStopped' }> => event.t === 'ReelStopped')
    .map((event) => event.tick - start.tick);
  assert.deepEqual(stopTicks, [30, 42, 54].map((_, col) => REEL_STOP_TICK(col)));

  const evaluated = events.find(
    (event): event is Extract<GameEvent, { t: 'SpinEvaluated' }> => event.t === 'SpinEvaluated',
  );
  assert.ok(evaluated !== undefined);
  assert.equal(evaluated.tick - start.tick, REEL_STOP_TICK(2) + EVAL_DELAY_TICKS);

  const resolving = events.find(
    (event): event is Extract<GameEvent, { t: 'PhaseChanged' }> =>
      event.t === 'PhaseChanged' && event.to === 'RESOLVING',
  );
  assert.ok(resolving !== undefined);
  assert.equal(resolving.tick, evaluated.tick);

  const launched = events.find(
    (event): event is Extract<GameEvent, { t: 'OrbLaunched' }> => event.t === 'OrbLaunched',
  );
  assert.ok(launched !== undefined);
  assert.equal(launched.tick - start.tick, evaluated.tick - start.tick + ORB_LAUNCH_DELAY_TICKS);
  assert.ok(events.indexOf(evaluated) < events.indexOf(launched));
});

test('effect routing: engine peg effects change orb chips; physics exits update run state', () => {
  const baseline = createGameCore();
  baseline.dispatch({ c: 'NewRun', seed: 'routing' });
  const baseEvents = spinOnce(baseline);

  const boosted = createGameCore();
  boosted.dispatch({ c: 'NewRun', seed: 'routing' });
  (boosted.getState() as RunState).trinkets.push('goldPegAlchemist');
  const boostedEvents = spinOnce(boosted);
  const pegHits = boostedEvents.filter((event) => event.t === 'PegHit').length;

  assert.ok(pegHits > 0, 'the spin must hit pegs');
  const chipBonus = lastOrbChips(boostedEvents) - lastOrbChips(baseEvents);
  assert.ok(chipBonus > 0, 'Gold Peg Alchemist must add chips through onPegHit');
  assert.equal(chipBonus % 15, 0);
  assert.ok(
    chipBonus >= pegHits * 15,
    'every peg hit (and its split descendants) carries the +15 chip effect',
  );

  // Physics events back into engine state.
  const state = boosted.getState();
  const gutterLosses = boostedEvents.filter((event) => event.t === 'GutterLoss').length;
  assert.equal(state.stats.gutterLosses, gutterLosses);
  const cashBanked = boostedEvents
    .filter((event): event is Extract<GameEvent, { t: 'CashBanked' }> => event.t === 'CashBanked')
    .reduce((sum, event) => sum + event.cash, 0);
  assert.equal(cashBanked, state.stats.cashBanked);
});

test('effect routing: onSpinStart spawns a copper token through the sim', () => {
  const core = createGameCore();
  core.dispatch({ c: 'NewRun', seed: 'solenoid' });
  (core.getState() as RunState).trinkets.push('overvoltedSolenoid');
  core.dispatch({ c: 'Spin' });
  const firstTick = core.tick();
  assert.ok(
    firstTick.some((event) => event.t === 'TokenSpawned' && event.symbolId === 'scrap'),
    'the solenoid copper token reaches the shelf before the first orb lands',
  );
});


test('effect routing: gutter-loss X bonuses survive into the next spin', () => {
  const core = createGameCore();
  core.dispatch({ c: 'NewRun', seed: 'seed-2' });
  (core.getState() as RunState).trinkets.push('vampiricRakeCollector');
  const events = spinOnce(core);
  const evaluated = events.find(
    (event): event is Extract<GameEvent, { t: 'SpinEvaluated' }> => event.t === 'SpinEvaluated',
  );
  assert.ok(evaluated !== undefined);
  const lateGutters = events.filter(
    (event) => event.t === 'GutterLoss' && event.tick > evaluated.tick,
  ).length;
  assert.ok(lateGutters > 0, 'the shelf loses tokens while orbs resolve');
  assert.equal(core.getState().nextSpin.xBonus.vampiricRake, lateGutters * 0.25);
});
test('fixed-step loop and browser driver honour speed multipliers', () => {
  const make = () => {
    const core = createGameCore();
    core.dispatch({ c: 'NewRun', seed: 'loop' });
    return core;
  };

  const slow = createFixedStepLoop(make(), { speed: 1, maxStepsPerFrame: 1000 });
  slow.advance(100);
  assert.equal(slow.ticks, 6);

  const fast = createFixedStepLoop(make(), { speed: 2, maxStepsPerFrame: 1000 });
  fast.advance(100);
  assert.equal(fast.ticks, 12);

  const turbo = createFixedStepLoop(make(), { speed: 4, maxStepsPerFrame: 1000 });
  turbo.advance(100);
  assert.equal(turbo.ticks, 24);
  assert.equal(turbo.setSpeed(2), 2);

  const browser = createBrowserLoop(make());
  browser.setSpeed(4);
  browser.advance(100);
  assert.equal(browser.loop.ticks, 24);
  assert.equal(browser.speed, 4);

  assert.throws(() => slow.setSpeed(0), RangeError);
  assert.throws(() => slow.advance(-1), RangeError);
});
