import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANIM_TICKS, BOARD, DEFAULT_CHUTE_MULTS, EVAL_DELAY_TICKS, ORB_LAUNCH_DELAY_TICKS, ORB_LAUNCH_INTERVAL_TICKS, REEL_STOP_TICK, SINE_TABLE, SINE_TABLE_SIZE, SPRITE_KEYS, TICKS_PER_SECOND, projectShelf } from '@jackpotsyndicate/contracts';

test('C-6 tick schedule matches the values given to the animation agent', () => {
  assert.equal(TICKS_PER_SECOND, 60);
  assert.deepEqual([0, 1, 2, 3, 4].map(REEL_STOP_TICK), [30, 42, 54, 66, 78]);
  assert.deepEqual([EVAL_DELAY_TICKS, ORB_LAUNCH_DELAY_TICKS, ORB_LAUNCH_INTERVAL_TICKS], [6, 6, 6]);
  assert.deepEqual(ANIM_TICKS, { tumbleStep: 36, gridRelayout: 90, fever: 60, bossIntro: 180, floorTransition: 150, victory: 240, gameOver: 180 });
});

test('board geometry is self-consistent', () => {
  assert.equal(BOARD.DOZER_BACK_Y, BOARD.SPLIT_Y + BOARD.CHUTE_H);
  assert.ok(BOARD.DOZER_BACK_Y + BOARD.SURGE_STROKE < BOARD.LIP_Y - 100);
  assert.equal(DEFAULT_CHUTE_MULTS.length, BOARD.CHUTE_COUNT);
  assert.ok(BOARD.TOKEN_SPAWN_Y > BOARD.DOZER_BACK_Y && BOARD.TOKEN_SPAWN_Y < BOARD.LIP_Y);
});

test('sine table is complete, bounded and antisymmetric', () => {
  assert.equal(SINE_TABLE.length, SINE_TABLE_SIZE);
  for (let i = 0; i < SINE_TABLE_SIZE; i++) {
    assert.ok(Math.abs(SINE_TABLE[i]!) <= 1);
    assert.ok(Math.abs(SINE_TABLE[i]! + SINE_TABLE[(i + 512) % 1024]!) < 1e-12);
  }
});

test('sprite keys are unique; shelf projection is monotonic toward the player', () => {
  assert.equal(new Set(SPRITE_KEYS).size, SPRITE_KEYS.length);
  let prev = -Infinity;
  for (let y = 275; y <= 510; y += 5) {
    const p = projectShelf(300, y);
    assert.ok(p.y > prev);
    prev = p.y;
  }
  assert.equal(projectShelf(300, 400).x, 300);
});
