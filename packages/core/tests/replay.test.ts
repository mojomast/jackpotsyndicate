import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Command, GameEvent } from '@jackpotsyndicate/contracts';
import {
  combinedHash,
  createGameCore,
  replayCommandLog,
  replayHash,
  verifyReplay,
} from '../src/index';

function playRound(seed = 'seed-11') {
  const core = createGameCore();
  const events: GameEvent[] = [];
  core.dispatch({ c: 'NewRun', seed });
  let guard = 0;
  while (core.phase !== 'ROUND_RESULT' && guard++ < 30_000) {
    if (core.phase === 'PREP' && core.getState().spinsLeft > 0) {
      core.dispatch({ c: 'Spin' });
    }
    events.push(...core.tick());
  }
  assert.ok(guard < 30_000);
  return { core, events, ticks: core.tickCount, log: core.getCommandLog() };
}

test('the command log replays deterministically and reproduces the combined hash', () => {
  const first = playRound('seed-11');
  const second = playRound('seed-11');

  assert.equal(first.core.stateHash(), second.core.stateHash());
  assert.equal(first.ticks, second.ticks);

  const replay = replayCommandLog(first.log, { ticks: first.ticks });
  assert.equal(replay.ticks, first.ticks);
  assert.equal(replay.hash, first.core.stateHash());
  assert.deepEqual(
    replay.core.getCommandLog(),
    first.core.getCommandLog(),
    'the replay records the same command log',
  );

  const a = first.events.map((event) => `${event.tick}:${event.t}`);
  const b = replay.events.map((event) => `${event.tick}:${event.t}`);
  assert.deepEqual(b, a, 'the replay emits the same event stream');

  assert.equal(replayHash(first.log, { ticks: first.ticks }), first.core.stateHash());
  assert.equal(typeof combinedHash, 'function');
  assert.equal(first.core.stateHash().length, 24, '8-char run hash + 16-char sim hash');
});

test('replay divergence is detected when the seed changes', () => {
  const { log, ticks, core } = playRound('seed-11');
  const expected = core.stateHash();

  const ok = verifyReplay(log, expected, { ticks });
  assert.equal(ok.match, true);
  assert.equal(ok.actual, expected);

  const divergent: { tick: number; cmd: Command }[] = structuredClone(log);
  const newRun = divergent[0]!;
  assert.equal(newRun.cmd.c, 'NewRun');
  divergent[0] = {
    tick: newRun.tick,
    cmd: { c: 'NewRun', seed: 'seed-12' },
  };

  const bad = verifyReplay(divergent, expected, { ticks });
  assert.equal(bad.match, false);
  assert.notEqual(bad.actual, expected);

  // Same divergent log twice is still stable with itself.
  const again = replayHash(divergent, { ticks });
  assert.equal(again, bad.actual);
});

test('replay stops at a requested phase and keeps the combined hash format', () => {
  const { log } = playRound('seed-11');
  const settled = replayCommandLog(log, { stopPhase: 'ROUND_RESULT', maxTicks: 30_000 });
  assert.equal(settled.core.phase, 'ROUND_RESULT');
  assert.equal(settled.hash.length, 24, '8-char run hash + 16-char sim hash');

  const state = settled.core.getState();
  const snapshot = settled.core.getSimSnapshot();
  assert.ok(snapshot.tick > 0);
  assert.ok(Math.abs(snapshot.tick - state.tick) <= 1, 'physics follows the engine tick');
});
