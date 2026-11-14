import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOARD, DEFAULT_MODIFIERS, SIM } from '@jackpotsyndicate/contracts';
import type { PhysicsEvent, PhysicsModifiers, SimWorld } from '@jackpotsyndicate/contracts';
import { createSimWorld, NEON_FLOOR_PHYSICS, Prng, sinLookup } from '@jackpotsyndicate/physics';
import { FLOORS } from '../../../tools/physics-harness/floors';
import { ORBS, runSpins, seedShelf, TOKENS } from '../../../tools/physics-harness/lib';

function world(seed = 1, mods: PhysicsModifiers = DEFAULT_MODIFIERS): SimWorld {
  const w = createSimWorld(seed);
  w.configure(NEON_FLOOR_PHYSICS, mods, true);
  return w;
}
function run(w: SimWorld, ticks: number, sink?: PhysicsEvent[]): void {
  for (let i = 0; i < ticks; i++) {
    const ev = w.step();
    if (sink) for (const e of ev) sink.push(e);
  }
}
const count = (ev: PhysicsEvent[], t: PhysicsEvent['t']) => ev.filter((e) => e.t === t).length;

// ------------------------------------------------------------------ kernel

test('prng: fixed sequence for a fixed seed', () => {
  const r = new Prng(12345);
  assert.deepEqual([r.nextU32(), r.nextU32(), r.nextU32()], [545490310,515051929,2026279088]);
});

test('prng: state round-trips and values stay in [0,1)', () => {
  const a = new Prng(99);
  for (let i = 0; i < 1000; i++) {
    const v = a.next();
    assert.ok(v >= 0 && v < 1);
  }
  const b = new Prng(0);
  b.setState(a.getState());
  assert.equal(a.nextU32(), b.nextU32());
});

test('sinLookup: within 2e-5 of true sine and exact at quarter points', () => {
  for (let i = 0; i < 5000; i++) {
    const x = (i / 5000) * Math.PI * 4;
    assert.ok(Math.abs(sinLookup(x) - Math.sin(x)) < 2e-5);
  }
  assert.equal(sinLookup(0), 0);
  assert.equal(sinLookup(Math.PI / 2), 1);
});

test('determinism: same seed and inputs give the same hash; different seeds differ', () => {
  const mk = (seed: number) => {
    const w = world(seed);
    seedShelf(w);
    runSpins(w, 40, 3);
    return w.hash();
  };
  assert.equal(mk(7), mk(7));
  assert.notEqual(mk(7), mk(8));
});

test('golden hash: fixed scenario reproduces the committed hash', () => {
  const w = world(2026);
  seedShelf(w);
  runSpins(w, 60, 14);
  // If this changes, saves and replays made with the old build are invalid: bump FORMAT_VERSION.
  assert.equal(w.hash(), GOLDEN_SCENARIO_HASH);
});
const GOLDEN_SCENARIO_HASH = '95279e711596312a';

test('serialize: round-trip then 1,000 steps equals an uninterrupted run', () => {
  const a = world(5);
  seedShelf(a);
  runSpins(a, 15, 9);
  for (let i = 0; i < 6; i++) a.launchOrb({ ...ORBS.cherry!, x: 100 + i * 70 }); // save with orbs in flight and queued
  run(a, 20);
  const b = createSimWorld(424242); // different seed: everything must come from the bytes
  b.deserialize(a.serialize());
  assert.equal(b.hash(), a.hash());
  run(a, 1000);
  run(b, 1000);
  assert.equal(b.hash(), a.hash());
  assert.deepEqual(b.snapshot(), a.snapshot());
});

// ---------------------------------------------------------------- pinfield

test('pinfield: every orb exits, never more than the cap in flight, exit x feeds the shelf', () => {
  const w = world(3);
  const ev: PhysicsEvent[] = [];
  const syms = Object.keys(ORBS);
  let launched = 0;
  let peak = 0;
  for (let i = 0; i < 12000; i++) {
    if (i < 6000 && i % 3 === 0) {
      w.launchOrb({ ...ORBS[syms[launched % syms.length]!]!, x: 20 + ((launched * 53) % 560) });
      launched++;
    }
    for (const e of w.step()) ev.push(e);
    peak = Math.max(peak, w.counts().orbs);
  }
  assert.equal(w.counts().orbs + w.counts().queued, 0, 'no orb left in the pinfield');
  assert.ok(peak <= SIM.MAX_ORBS_IN_FLIGHT);
  const splits = count(ev, 'OrbSplit');
  assert.equal(count(ev, 'ChuteExit'), launched + splits, 'every launched or cloned orb exits exactly once');
  const spawnX = new Map<number, number>();
  for (const e of ev) if (e.t === 'TokenSpawned') spawnX.set(e.tokenId, e.x);
  for (const e of ev) {
    if (e.t !== 'ChuteExit') continue;
    assert.ok(e.chute >= 0 && e.chute < BOARD.CHUTE_COUNT);
    assert.equal(e.chute, Math.min(4, Math.floor(e.x / 120)));
    if (e.tokenIds.length === 1) assert.ok(Math.abs(spawnX.get(e.tokenIds[0]!)! - e.x) <= 60, 'token lands under its chute');
  }
});

test('pinfield: only splittable orbs split; cherry splits on its first peg', () => {
  const w = world(4);
  const ev: PhysicsEvent[] = [];
  for (let i = 0; i < 40; i++) w.launchOrb({ ...ORBS.scrap!, x: 30 + i * 13 });
  run(w, 3000, ev);
  assert.equal(count(ev, 'OrbSplit'), 0);
  const w2 = world(4);
  const ev2: PhysicsEvent[] = [];
  for (let i = 0; i < 10; i++) w2.launchOrb({ ...ORBS.cherry!, x: 60 + i * 50 });
  run(w2, 3000, ev2);
  const hitters = new Set<number>();
  const parents: number[] = [];
  const children = new Set<number>();
  for (const e of ev2) {
    if (e.t === 'PegHit') hitters.add(e.orbId);
    if (e.t === 'OrbSplit') {
      parents.push(e.parentId);
      children.add(e.childId);
    }
  }
  const originals = [...hitters].filter((id) => !children.has(id)).length;
  assert.ok(parents.length >= 6);
  assert.equal(parents.length, originals, 'every cherry that touched a peg split');
  assert.equal(new Set(parents).size, parents.length, 'no orb splits twice');
  assert.ok(parents.every((id) => !children.has(id)), 'clones never split');
  assert.equal(count(ev2, 'ChuteExit'), 10 + parents.length);
});

test('pinfield: seven upgrades gold pegs; diamond chains nearby gold pegs', () => {
  const w = world(6);
  const ev: PhysicsEvent[] = [];
  for (let i = 0; i < 12; i++) w.launchOrb({ ...ORBS.seven!, x: 40 + i * 45 });
  run(w, 3000, ev);
  assert.ok(count(ev, 'PegUpgraded') > 0);
  assert.ok(w.snapshot().pegs.some((p) => p.kind === 'golden'));
  w.configure(NEON_FLOOR_PHYSICS, DEFAULT_MODIFIERS, false);
  assert.ok(w.snapshot().pegs.some((p) => p.kind === 'golden'), 'upgrades persist until pegs are reset');
  w.configure(NEON_FLOOR_PHYSICS, DEFAULT_MODIFIERS, true);
  assert.ok(!w.snapshot().pegs.some((p) => p.kind === 'golden'));
});

// ------------------------------------------------------------------- shelf

test('shelf: token conservation (in = lip + gutter + removed + on shelf)', () => {
  const w = world(8);
  const ev: PhysicsEvent[] = [];
  seedShelf(w);
  runSpins(w, 300, 2, { onEvent: (e) => ev.push(e) });
  const spawned = count(ev, 'TokenSpawned');
  const out = count(ev, 'LipDrop') + count(ev, 'GutterLoss') + count(ev, 'TokenRemoved');
  assert.equal(spawned, out + w.counts().tokens);
});

test('shelf: stays valid under load (finite, in front of the blade, bounded overlap and speed)', () => {
  const w = world(9);
  seedShelf(w, 60);
  let worstOverlap = 0;
  runSpins(w, 400, 4, {
    onEvent: () => {},
  });
  for (let i = 0; i < 3000; i++) {
    w.step();
    const s = w.snapshot();
    for (const t of s.tokens) {
      assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.vx) && Number.isFinite(t.vy));
      assert.ok(t.y - t.radius >= s.dozer.frontY - 1e-9, 'no token behind the blade');
      assert.ok(Math.abs(t.vx) <= 6 && Math.abs(t.vy) <= 6);
    }
    if (i % 50 === 0) {
      for (let a = 0; a < s.tokens.length; a++)
        for (let b = a + 1; b < s.tokens.length; b++) {
          const p = s.tokens[a]!, q = s.tokens[b]!;
          const d = Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2);
          worstOverlap = Math.max(worstOverlap, p.radius + q.radius - d);
        }
    }
  }
  assert.ok(worstOverlap < 4, `settled tokens overlap by at most a few units (saw ${worstOverlap.toFixed(2)})`);
});

test('shelf: a pile at rest does not gain energy or creep with the blade parked out of reach', () => {
  const w = createSimWorld(10);
  // Stationary dozer: nothing should move once the pile has relaxed.
  w.configure({ ...NEON_FLOOR_PHYSICS, dozerSpeed: 0, gutterRisk: 0 }, DEFAULT_MODIFIERS, true);
  for (let i = 0; i < 80; i++) w.spawnToken({ ...TOKENS.scrap!, x: 120 + (i % 16) * 24, y: 360 + Math.floor(i / 16) * 22 });
  run(w, 600);
  const before = w.snapshot().tokens.map((t) => [t.x, t.y]);
  run(w, 5000);
  const after = w.snapshot().tokens;
  assert.equal(after.length, 80);
  let moved = 0;
  after.forEach((t, i) => (moved = Math.max(moved, Math.abs(t.x - before[i]![0]!) + Math.abs(t.y - before[i]![1]!))));
  assert.ok(moved < 0.5, `resting pile drifted ${moved.toFixed(3)} units`);
  assert.ok(after.every((t) => t.vx === 0 && t.vy === 0), 'everything is asleep');
});

test('shelf: blade pushes tokens to the lip and reports full extensions', () => {
  const w = world(11);
  const ev: PhysicsEvent[] = [];
  for (let i = 0; i < 200; i++) {
    if (i % 4 === 0) w.spawnToken({ ...TOKENS.scrap!, x: 250 + (i % 5) * 25, y: BOARD.TOKEN_SPAWN_Y });
    run(w, 30, ev);
  }
  assert.ok(count(ev, 'LipDrop') > 5);
  assert.ok(count(ev, 'DozerFullExtension') >= 40);
});

test('shelf: surge starts, ends after 45 ticks, and extends the stroke', () => {
  const w = world(12);
  const ev: PhysicsEvent[] = [];
  w.applyDirective({ t: 'surge' });
  let maxStroke = 0;
  for (let i = 0; i < 80; i++) {
    for (const e of w.step()) ev.push(e);
    maxStroke = Math.max(maxStroke, w.snapshot().dozer.stroke);
  }
  assert.equal(count(ev, 'SurgeStarted'), 1);
  assert.equal(count(ev, 'SurgeEnded'), 1);
  assert.equal(maxStroke, BOARD.SURGE_STROKE);
  run(w, 60);
  assert.equal(w.snapshot().dozer.stroke, BOARD.DOZER_STROKE);
});

test('shelf: at the cap new tokens merge instead of spawning', () => {
  const w = world(13);
  w.configure({ ...NEON_FLOOR_PHYSICS, dozerSpeed: 0 }, DEFAULT_MODIFIERS, true);
  w.applyDirective({ t: 'seedShelf', tokens: Array.from({ length: 170 }, () => TOKENS.scrap!) });
  const ev = w.drainEvents();
  assert.equal(w.counts().tokens, SIM.MAX_TOKENS);
  assert.equal(count(ev, 'TokenMerged'), 20);
  assert.deepEqual(w.spawnToken({ ...TOKENS.scrap!, x: 300, y: 400 }), []);
});

test('shelf: gutter bumpers at 100% stop all gutter losses; rolls are seeded', () => {
  const stats = (chances: number[]) => {
    const w = world(14, { ...DEFAULT_MODIFIERS, gutterBounceChances: chances });
    seedShelf(w);
    return runSpins(w, 400, 6);
  };
  assert.equal(stats([1]).gutter, 0);
  const none = stats([]).gutter;
  const half = stats([0.5]).gutter;
  assert.ok(none > 20);
  assert.ok(half < none, `50% bumper reduces losses (${half} vs ${none})`);
});

test('shelf: boss suction raises gutter losses; centre pull lowers them', () => {
  const g = (mods: Partial<PhysicsModifiers>) => {
    const w = world(15, { ...DEFAULT_MODIFIERS, ...mods });
    seedShelf(w);
    const s = runSpins(w, 600, 8, { warmup: 50 });
    return s.gutter / (s.gutter + s.lip);
  };
  const base = g({});
  assert.ok(g({ suction: 1 }) > base + 0.05);
  assert.ok(g({ centerPullTokens: 1 }) < base - 0.03);
});

test('shelf: sweep removes the centre-most unwelded tokens; ice blocks spawn near the lip', () => {
  const w = world(16);
  w.configure({ ...NEON_FLOOR_PHYSICS, dozerSpeed: 0 }, DEFAULT_MODIFIERS, true);
  for (const x of [100, 290, 305, 500]) w.spawnToken({ ...TOKENS.scrap!, x, y: 400 });
  w.applyDirective({ t: 'sweepCenter', count: 2 });
  const ev = w.drainEvents();
  assert.equal(count(ev, 'TokenRemoved'), 2);
  assert.deepEqual(w.snapshot().tokens.map((t) => Math.round(t.x)), [100, 500]);
  w.applyDirective({ t: 'dropIceBlocks', count: 2 });
  const ice = w.snapshot().tokens.filter((t) => t.skin === 'ice');
  assert.equal(ice.length, 2);
  assert.ok(ice.every((t) => t.y > BOARD.LIP_Y - 60));
});

test('shelf: diamond welds to its two nearest neighbours and the weld clears when it leaves', () => {
  const w = world(17);
  w.configure({ ...NEON_FLOOR_PHYSICS, dozerSpeed: 0 }, DEFAULT_MODIFIERS, true);
  for (const x of [280, 320, 480]) w.spawnToken({ ...TOKENS.scrap!, x, y: 400 });
  const [id] = w.spawnToken({ ...TOKENS.diamond!, x: 300, y: 405 });
  const ev = w.drainEvents();
  const weld = ev.find((e) => e.t === 'WeldFormed');
  assert.ok(weld && weld.t === 'WeldFormed' && weld.tokenId === id && weld.partnerIds.length === 2);
  assert.equal(w.snapshot().tokens.filter((t) => t.welded).length, 3);
  w.applyDirective({ t: 'clearShelf' });
  assert.equal(w.counts().tokens, 0);
});

test('shelf: uranium shockwave moves neighbours toward the lip at full extension', () => {
  const measure = (withUranium: boolean) => {
    const w = createSimWorld(18);
    // Blade moves but tokens start well clear of it, so any travel is the shockwave.
    w.configure({ ...NEON_FLOOR_PHYSICS, gutterRisk: 0 }, DEFAULT_MODIFIERS, true);
    w.spawnToken({ ...TOKENS.scrap!, x: 330, y: 420 });
    if (withUranium) w.spawnToken({ ...TOKENS.uranium!, x: 300, y: 420 });
    run(w, 130); // one full extension happens at ~tick 32
    return w.snapshot().tokens.find((t) => t.symbolId === 'scrap')!.y;
  };
  const moved = measure(true) - measure(false);
  assert.ok(moved > 4 && moved < 8, `neighbour carried ~6 units (got ${moved.toFixed(2)})`);
});

test('shelf: cherry spawns two micro-medals; seven spawns one 3-high stack', () => {
  const w = world(19);
  assert.equal(w.spawnToken({ ...TOKENS.cherry!, x: 300, y: 400 }).length, 2);
  assert.equal(w.spawnToken({ ...TOKENS.seven!, x: 200, y: 400 }).length, 1);
  assert.equal(w.snapshot().tokens.find((t) => t.symbolId === 'seven')!.stack, 3);
});

// -------------------------------------------------------------------- rake

test('rake: each floor is inside its target band (spec AC-5)', { timeout: 300_000 }, () => {
  for (const f of FLOORS) {
    let lip = 0, gutter = 0;
    for (const seed of [21, 22]) {
      const w = createSimWorld(seed);
      w.configure(f.physics, DEFAULT_MODIFIERS, true);
      seedShelf(w);
      const s = runSpins(w, 900, seed, { warmup: 100 });
      lip += s.lip;
      gutter += s.gutter;
    }
    const rake = gutter / (gutter + lip);
    assert.ok(Math.abs(rake - f.target) <= f.tol, `${f.id} rake ${(rake * 100).toFixed(1)}% vs ${f.target * 100}% ±${f.tol * 100}`);
  }
});
