/** Worst-case tick cost: full shelf (150 tokens) plus 48 orbs in flight. */
import { DEFAULT_MODIFIERS } from '@jackpotsyndicate/contracts';
import { createSimWorld, NEON_FLOOR_PHYSICS } from '@jackpotsyndicate/physics';
import { ORBS, TOKENS } from './lib';

const w = createSimWorld(3);
w.configure(NEON_FLOOR_PHYSICS, DEFAULT_MODIFIERS, true);
w.applyDirective({ t: 'seedShelf', tokens: Array.from({ length: 150 }, () => TOKENS.scrap!) });
const syms = Object.keys(ORBS);
const N = 20000;
let maxOrbs = 0, maxTok = 0;
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  if (w.counts().orbs + w.counts().queued < 48) w.launchOrb({ ...ORBS[syms[i % syms.length]!]!, x: 40 + ((i * 97) % 520) });
  w.step();
  const c = w.counts();
  if (c.orbs > maxOrbs) maxOrbs = c.orbs;
  if (c.tokens > maxTok) maxTok = c.tokens;
}
const ms = (performance.now() - t0) / N;
console.log(`avg ${ms.toFixed(4)} ms/tick  (${Math.round(1000 / 60 / ms)}x real time)  peak orbs ${maxOrbs}, peak tokens ${maxTok}`);
process.exit(ms < 4 ? 0 : 1);
