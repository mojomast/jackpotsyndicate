import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRng,
  DEFAULT_FIRST_REEL_STRIP,
  DEFAULT_REEL_STRIP,
  drawGrid,
  hashSeed,
  makeDefaultReelStrips,
  makeReelStrips,
} from '@jackpotsyndicate/engine';

test('seeded RNG has a fixed golden sequence', () => {
  const rng = createRng('t010-golden');
  assert.equal(hashSeed('t010-golden'), 2802551581);
  assert.deepEqual(
    [rng.nextU32(), rng.nextU32(), rng.nextU32(), rng.nextU32(), rng.nextU32()],
    [1281639061, 1298881972, 3197565770, 3858446362, 3021648391],
  );

  const child = rng.split('reels');
  assert.deepEqual(
    [child.nextU32(), child.nextU32(), child.nextU32()],
    [4046936459, 3462109783, 2435216375],
  );
});

test('RNG streams are deterministic, splittable and serialisable', () => {
  const root = createRng(1337);
  const parentBefore = root.clone();
  const a = root.split('reel:0');
  const b = root.split('reel:0');
  const other = root.split('reel:1');

  assert.deepEqual(a.getState(), b.getState());
  assert.notDeepEqual(a.getState(), other.getState());

  // Splitting does not advance the parent.
  assert.deepEqual(
    [root.nextU32(), root.nextU32()],
    [parentBefore.nextU32(), parentBefore.nextU32()],
  );

  const restored = createRng('restore');
  const saved = restored.getState();
  const expected = [restored.nextU32(), restored.nextU32()];
  restored.setState(saved);
  assert.deepEqual([restored.nextU32(), restored.nextU32()], expected);
  assert.deepEqual(new Set(saved).size, 4);
});

test('RNG pick/shuffle are in range and repeat exactly', () => {
  const first = createRng('shuffle');
  const second = createRng('shuffle');
  const items = [0, 1, 2, 3, 4, 5, 6, 7];
  const a = first.shuffle(items);
  const b = second.shuffle(items);
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort((x, y) => x - y), items);
  for (let i = 0; i < 20; i++) {
    const picked = first.pick(items);
    assert.ok(picked >= 0 && picked < items.length);
  }
});

test('default strips are weighted and reel 1 places cherries in adjacent pairs', () => {
  assert.ok(DEFAULT_REEL_STRIP.length >= 10);
  assert.ok(DEFAULT_REEL_STRIP.includes('cherry'));
  assert.ok(DEFAULT_FIRST_REEL_STRIP.includes('cherry'));

  let pairs = 0;
  for (let i = 0; i < DEFAULT_FIRST_REEL_STRIP.length; i++) {
    const next = (i + 1) % DEFAULT_FIRST_REEL_STRIP.length;
    if (
      DEFAULT_FIRST_REEL_STRIP[i] === 'cherry' &&
      DEFAULT_FIRST_REEL_STRIP[next] === 'cherry'
    ) {
      pairs++;
    }
  }
  assert.ok(pairs >= 2);

  const strips = makeDefaultReelStrips(3);
  assert.equal(strips.length, 3);
  assert.deepEqual(strips[0], [...DEFAULT_FIRST_REEL_STRIP]);
  assert.deepEqual(strips[1], [...DEFAULT_REEL_STRIP]);
  assert.notEqual(strips[0], DEFAULT_FIRST_REEL_STRIP);

  assert.throws(() => makeReelStrips(2), RangeError);
  assert.throws(() => makeReelStrips(6), RangeError);
  assert.throws(() => drawGrid(createRng(1), { rows: 5 }), RangeError);
});

test('grid draw matches a fixed seeded golden grid', () => {
  const draw = drawGrid(createRng('grid-golden'), { rows: 3 });
  assert.deepEqual(draw.stops, [5, 8, 6]);
  assert.deepEqual(draw.grid, [
    ['cherry', 'diamond', 'cherry'],
    ['seven', 'uranium', 'cherry'],
    ['skull', 'cherry', 'seven'],
  ]);
});

test('grid draw wraps the strip and uses one stop per column', () => {
  const strips = [
    ['cherry', 'skull', 'seven', 'uranium'],
    ['skull', 'cherry', 'seven', 'uranium'],
    ['seven', 'cherry', 'skull', 'uranium'],
  ] as const;
  const draw = drawGrid(createRng('strip-wrap'), { rows: 3, strips });
  assert.deepEqual(draw.stops, [2, 0, 3]);
  assert.deepEqual(draw.grid, [
    ['seven', 'uranium', 'cherry'],
    ['skull', 'cherry', 'seven'],
    ['uranium', 'seven', 'cherry'],
  ]);

  // The view is a copy: mutating it cannot corrupt the caller's strips.
  draw.strips[0]![0] = 'diamond';
  assert.equal(strips[0][0], 'cherry');
});

test('the same seed draws the same grid and different seeds differ', () => {
  const a = drawGrid(createRng('repeat-me'), { rows: 4 });
  const b = drawGrid(createRng('repeat-me'), { rows: 4 });
  const c = drawGrid(createRng('repeat-you'), { rows: 4 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.grid, c.grid);
  for (const column of a.grid) assert.equal(column.length, 4);
});
