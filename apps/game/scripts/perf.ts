import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { DEFAULT_MODIFIERS } from '@jackpotsyndicate/contracts';
import { createSimWorld, NEON_FLOOR_PHYSICS } from '@jackpotsyndicate/physics';
import { buildDrawPlan } from '@jackpotsyndicate/board-render';
import { ORBS, TOKENS } from '../../../tools/physics-harness/lib';
import { bundleLines, measureBundle } from './bundle';

const TICK_BUDGET_MS = 4;
const FRAME_BUDGET_MS = 1000 / 60;
const TICK_SAMPLES = 20_000;
const FRAME_SAMPLES = 1_500;
const SYMBOLS = Object.keys(ORBS);

function makeStressWorld() {
  const world = createSimWorld(2026);
  world.configure(NEON_FLOOR_PHYSICS, DEFAULT_MODIFIERS, true);
  world.applyDirective({
    t: 'seedShelf',
    tokens: Array.from({ length: 150 }, () => TOKENS.scrap!),
  });
  for (let index = 0; index < 48; index++) {
    const symbol = SYMBOLS[index % SYMBOLS.length]!;
    world.launchOrb({
      ...ORBS[symbol]!,
      x: 40 + ((index * 97) % 520),
    });
  }
  for (let tick = 0; tick < 60 && world.counts().orbs < 48; tick++) world.step();
  topUpTokens(world);
  return world;
}

function topUpTokens(world: ReturnType<typeof createSimWorld>): void {
  const deficit = 150 - world.counts().tokens;
  if (deficit > 0) {
    world.applyDirective({
      t: 'seedShelf',
      tokens: Array.from({ length: deficit }, () => TOKENS.scrap!),
    });
  }
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * sorted.length)));
  return sorted[index]!;
}

function measureTick(): { avg: number; p95: number; maxOrbs: number; maxTokens: number; ticks: number } {
  const world = makeStressWorld();
  let maxOrbs = 0;
  let maxTokens = 0;
  let launched = 0;

  for (let index = 0; index < 2_000; index++) {
    world.step();
    const counts = world.counts();
    if (counts.orbs > maxOrbs) maxOrbs = counts.orbs;
    if (counts.tokens > maxTokens) maxTokens = counts.tokens;
  }

  const durations: number[] = [];
  for (let index = 0; index < TICK_SAMPLES; index++) {
    topUpTokens(world);
    while (world.counts().orbs + world.counts().queued < 48) {
      const symbol = SYMBOLS[launched % SYMBOLS.length]!;
      world.launchOrb({
        ...ORBS[symbol]!,
        x: 40 + ((launched * 97) % 520),
      });
      launched += 1;
    }
    const begin = performance.now();
    world.step();
    durations.push(performance.now() - begin);
    const counts = world.counts();
    if (counts.orbs > maxOrbs) maxOrbs = counts.orbs;
    if (counts.tokens > maxTokens) maxTokens = counts.tokens;
  }
  const avg = durations.reduce((total, duration) => total + duration, 0) / durations.length;
  return {
    avg,
    p95: percentile(durations, 0.95),
    maxOrbs,
    maxTokens,
    ticks: TICK_SAMPLES,
  };
}

function measureFrame(): { avg: number; p95: number; frames: number; commands: number; orbs: number; tokens: number } {
  const world = makeStressWorld();
  const snapshot = world.snapshot();
  const counts = world.counts();

  let commands = 0;
  for (let index = 0; index < 120; index++) commands = buildDrawPlan(snapshot).commands.length;

  const durations: number[] = [];
  for (let index = 0; index < FRAME_SAMPLES; index++) {
    const begin = performance.now();
    commands = buildDrawPlan(snapshot, { gutterRisk: 1 }).commands.length;
    durations.push(performance.now() - begin);
  }
  const avg = durations.reduce((total, duration) => total + duration, 0) / durations.length;

  return {
    avg,
    p95: percentile(durations, 0.95),
    frames: FRAME_SAMPLES,
    commands,
    orbs: counts.orbs,
    tokens: counts.tokens,
  };
}

const tick = measureTick();
const frame = measureFrame();

const gameRoot = fileURLToPath(new URL('..', import.meta.url));
await build({ root: gameRoot, logLevel: 'warn' });
const bundle = measureBundle(fileURLToPath(new URL('../dist', import.meta.url)));

console.log(
  `Stress scene: ${frame.tokens} shelf tokens, ${frame.orbs} orbs in flight, ${frame.commands} draw commands per frame`,
);
console.log(
  `Sim tick: avg ${tick.avg.toFixed(4)} ms  p95 ${tick.p95.toFixed(4)} ms  peak ${tick.maxOrbs} orbs / ${tick.maxTokens} tokens over ${tick.ticks} ticks  target <${TICK_BUDGET_MS} ms ${tick.avg < TICK_BUDGET_MS ? 'PASS' : 'FAIL'}`,
);
console.log(
  `Render frame: avg ${frame.avg.toFixed(4)} ms  p95 ${frame.p95.toFixed(4)} ms  sustained ${Math.round(1000 / frame.avg)} fps over ${frame.frames} frames  target >=60 fps ${frame.avg < FRAME_BUDGET_MS ? 'PASS' : 'FAIL'}`,
);
if (frame.avg >= 6) {
  console.log('T-071 note: frame work is above the stricter 6 ms software-GL budget.');
}
for (const line of bundleLines(bundle)) console.log(line);

const failed =
  tick.avg >= TICK_BUDGET_MS ||
  tick.maxOrbs > 48 ||
  tick.maxTokens > 150 ||
  frame.avg >= FRAME_BUDGET_MS ||
  frame.orbs > 48 ||
  frame.tokens > 150 ||
  !bundle.withinBudget;

if (failed) {
  console.error('PERF FAILED');
  process.exitCode = 1;
} else {
  console.log('PERF PASSED');
}
