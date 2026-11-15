import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameCore, GameEvent } from '@jackpotsyndicate/contracts';
import { gameEventSchema, saveFileSchema } from '@jackpotsyndicate/contracts';
import { MockGameCore } from '@jackpotsyndicate/contracts/testing';
import eventsSample from '../fixtures/events.sample.json';

function replay(core: GameCore, maxTicks = 1000): GameEvent[] {
  const collected: GameEvent[] = [];
  let ticks = 0;
  while (ticks < maxTicks) {
    collected.push(...core.tick());
    ticks++;
    if (collected.length > 0 && core.getSimSnapshot().tick >= 150) break;
  }
  return collected;
}

test('MockGameCore implements GameCore and replays events.sample.json exactly', () => {
  const expected = (eventsSample as unknown[]).map((event) => gameEventSchema.parse(event));
  const core = MockGameCore.fromSample();
  assert.deepEqual(core.dispatch({ c: 'NewRun', seed: 'replay-seed' }), { ok: true });
  assert.deepEqual(core.dispatch({ c: 'Spin' }), { ok: false, error: 'WRONG_PHASE' });

  const collected = replay(core);
  assert.deepEqual(collected, expected);

  const state = core.getState();
  assert.equal(state.seed, 'sample-seed-7');
  assert.equal(state.phase, 'PREP');
  assert.equal(state.bankroll, 548);
  assert.equal(state.stats.spins, 1);
  assert.equal(state.stats.lipDrops, 1);
  assert.equal(state.stats.gutterLosses, 1);
  assert.equal(state.orbChips[100], 20);
  assert.equal(state.tokenCash[200], 48);
  assert.equal(core.getSimSnapshot().tick, 150);
  assert.equal(core.getCommandLog()[0]!.cmd.c, 'NewRun');
  assert.equal(core.remainingEvents, 0);
});

test('MockGameCore exposes a stable hash and save/load round-trips', () => {
  const core = MockGameCore.fromSample();
  core.dispatch({ c: 'NewRun', seed: 'save-seed' });
  replay(core);

  const hash = core.stateHash();
  assert.match(hash, /^[0-9a-f]{16}$/);
  assert.equal(core.stateHash(), hash);

  const save = core.save();
  const parsed = saveFileSchema.parse(JSON.parse(JSON.stringify(save)));
  assert.equal(parsed.stateHash, hash);

  const restored = MockGameCore.fromSample();
  assert.deepEqual(restored.load(parsed), { ok: true });
  assert.equal(restored.stateHash(), hash);
  assert.deepEqual(restored.getState(), core.getState());
});

test('MockGameCore rejects malformed saves without changing state', () => {
  const core = MockGameCore.fromSample();
  const before = core.stateHash();
  const result = core.load({ saveVersion: 1, contractsRev: 1 } as never);
  assert.deepEqual(result, { ok: false, error: 'INVALID_TARGET' });
  assert.equal(core.stateHash(), before);
});
