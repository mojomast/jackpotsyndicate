import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BOARD, projectShelf } from '@jackpotsyndicate/contracts';
import type { PhysicsEvent, SimSnapshot } from '@jackpotsyndicate/contracts';
import {
  bevelWidth,
  buildDrawPlan,
  createBoardRenderer,
  interpolateSnapshots,
  particlesFromEvents,
  shelfGeometry,
  tokenVisual,
} from '../src/index';

const fixture = JSON.parse(
  readFileSync(new URL('../../contracts/fixtures/snapshot.static.json', import.meta.url), 'utf8'),
) as SimSnapshot;

test('static snapshot plan is deterministic and complete', () => {
  const a = buildDrawPlan(fixture);
  const b = buildDrawPlan(fixture);
  assert.deepEqual(a, b);
  assert.equal(a.projection, 'projectShelf');
  assert.equal(a.width, BOARD.W);
  assert.equal(a.height, BOARD.H);
  assert.ok(a.commands.length > 100);
  assert.equal(a.pegs.length, fixture.pegs.length);
  assert.equal(a.orbs.length, fixture.orbs.length);
  assert.equal(a.tokens.length, fixture.tokens.length);
  assert.ok(a.layers.pegs.length > 0);
  assert.ok(a.layers.orbs.length > 0);
  assert.ok(a.layers.tokens.length > 0);
  assert.ok(a.layers.shelf.length > 0);
});

test('pinfield draws every peg and orb from the snapshot', () => {
  const plan = buildDrawPlan(fixture);
  for (const peg of fixture.pegs) {
    assert.ok(
      plan.layers.pegs.some((c) => c.kind === 'circle' && c.pegId === peg.id),
      `peg ${peg.id} missing`,
    );
  }
  for (const orb of fixture.orbs) {
    assert.ok(
      plan.layers.orbs.some((c) => c.kind === 'circle' && c.orbId === orb.id),
      `orb ${orb.id} missing`,
    );
  }
});

test('shelf uses projectShelf for 2.5D tokens', () => {
  const plan = buildDrawPlan(fixture);
  for (const token of fixture.tokens) {
    const visual = plan.tokens.find((t) => t.id === token.id);
    assert.ok(visual, `token ${token.id} missing`);
    const projected = projectShelf(token.x, token.y);
    assert.equal(visual.screen.x, projected.x);
    assert.equal(visual.baseY, projected.y);
    assert.equal(visual.projected.scale, projected.scale);
    assert.equal(visual.lift, token.lift);
    assert.equal(visual.welded, token.welded);
  }
});

test('stack towers, lift and welded state are rendered', () => {
  const bullion = fixture.tokens.find((t) => t.stack > 1);
  assert.ok(bullion, 'fixture has a stacked token');
  const visual = tokenVisual(bullion);
  assert.equal(visual.stack, bullion.stack);
  assert.equal(visual.layers.length, bullion.stack);
  for (let i = 1; i < visual.layers.length; i++) {
    assert.ok(visual.layers[i]!.y < visual.layers[i - 1]!.y, 'stack layers rise');
  }
  assert.equal(visual.screen.y, visual.baseY - visual.liftOffset);

  const lifted = fixture.tokens.find((t) => t.lift > 0);
  assert.ok(lifted, 'fixture has a lifted token');
  assert.ok(tokenVisual(lifted).liftOffset > 0);

  const welded = fixture.tokens.find((t) => t.welded);
  assert.ok(welded, 'fixture has a welded token');
  const weldedVisual = tokenVisual(welded);
  assert.equal(weldedVisual.outline, '#ffffff');
  assert.ok(
    buildDrawPlan(fixture).layers.tokens.some(
      (c) => c.kind === 'ellipse' && c.tokenId === welded.id && c.welded === true,
    ),
  );
});

test('gutters, bevel, lip and chutes are present with the spec bevel width', () => {
  const geometry = shelfGeometry(1.35);
  assert.equal(geometry.bevel, 26 * 1.35 * 1.35);
  assert.equal(geometry.gutters.length, 2);
  assert.ok(geometry.lip.length === 4);
  const plan = buildDrawPlan(fixture, { gutterRisk: 1.35 });
  assert.equal(plan.shelf.bevel, bevelWidth(1.35));
  assert.ok(plan.shelf.gutters.length === 2);
  assert.ok(plan.layers.shelf.some((c) => c.kind === 'polygon' && c.role === 'gutter'));
  assert.ok(plan.layers.shelf.some((c) => c.kind === 'polygon' && c.role === 'lip'));
  assert.equal(plan.shelf.chutes.length, BOARD.CHUTE_COUNT);
  assert.equal(plan.layers.chutes.length, BOARD.CHUTE_COUNT * 2);
});

test('exit events produce deterministic lip and gutter VFX', () => {
  const events: PhysicsEvent[] = [
    {
      t: 'LipDrop',
      tokenId: 1,
      symbolId: 'diamond',
      skin: 'diamond',
      x: 300,
      y: BOARD.LIP_Y,
      vx: 0.2,
      vy: 2,
      radius: 11,
      stack: 1,
      magnetic: false,
    },
    {
      t: 'GutterLoss',
      tokenId: 2,
      symbolId: 'cherry',
      skin: 'cherry',
      x: 20,
      y: BOARD.LIP_Y,
      vx: -0.5,
      vy: 1,
      radius: 6.5,
      stack: 1,
      magnetic: false,
      side: 'left',
    },
  ];
  const particles = particlesFromEvents(events, 100);
  assert.equal(particles.length, 2);
  assert.equal(particles[0]!.kind, 'lip');
  assert.equal(particles[1]!.kind, 'gutter');
  const plan = buildDrawPlan(fixture, { events, vfxTick: 100 });
  assert.equal(plan.vfx.length, 2);
  assert.deepEqual(plan, buildDrawPlan(fixture, { events, vfxTick: 100 }));
  assert.ok(plan.layers.vfx.some((c) => c.kind === 'ellipse' && c.role === 'particle' && c.tokenId === 1));
  assert.ok(plan.layers.vfx.some((c) => c.kind === 'ellipse' && c.role === 'particle' && c.tokenId === 2));
});

test('Pixi renderer consumes the plan without external assets', () => {
  const renderer = createBoardRenderer();
  const plan = renderer.draw(fixture);
  assert.equal(renderer.plan, plan);
  assert.equal(renderer.container.children.length > 0, true);
  renderer.render(plan);
  renderer.destroy();
});

test('snapshot interpolation is pure and keeps stable ids', () => {
  const next: SimSnapshot = {
    ...fixture,
    tick: fixture.tick + 1,
    dozer: { ...fixture.dozer, frontY: fixture.dozer.frontY + 1 },
    orbs: fixture.orbs.map((orb) => ({ ...orb, x: orb.x + 2 })),
    tokens: fixture.tokens.map((token) => ({ ...token, y: token.y + 2, lift: token.lift + 0.1 })),
  };
  const mid = interpolateSnapshots(fixture, next, 0.5);
  assert.equal(mid.tick, next.tick);
  assert.equal(mid.orbs.length, next.orbs.length);
  assert.equal(mid.tokens.length, next.tokens.length);
  assert.equal(mid.dozer.frontY, fixture.dozer.frontY + 0.5);
  assert.equal(mid.orbs[0]!.x, fixture.orbs[0]!.x + 1);
  assert.equal(mid.tokens[0]!.y, fixture.tokens[0]!.y + 1);
});
