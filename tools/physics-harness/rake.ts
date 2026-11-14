/**
 * Gutter-rake report (spec AC-5). Usage: pnpm sim:rake [spinsPerSeed=2500] [seeds=4]
 * Exits non-zero if any floor is outside its band.
 */
import { DEFAULT_MODIFIERS } from '@jackpotsyndicate/contracts';
import { createSimWorld } from '@jackpotsyndicate/physics';
import { FLOORS } from './floors';
import { runSpins, seedShelf } from './lib';

const spins = Number(process.argv[2] ?? 2500);
const seeds = Number(process.argv[3] ?? 4);
let ok = true;
console.log(`floor            rake    target   band        tokens(end/max)  spins`);
for (const f of FLOORS) {
  let lip = 0, gutter = 0, end = 0, max = 0;
  for (let s = 1; s <= seeds; s++) {
    const w = createSimWorld(1000 + s);
    w.configure(f.physics, DEFAULT_MODIFIERS, true);
    seedShelf(w);
    const r = runSpins(w, spins, s, { warmup: 100 });
    lip += r.lip; gutter += r.gutter; end += r.endTokens; max = Math.max(max, r.maxTokens);
  }
  const rake = gutter / (gutter + lip);
  const pass = Math.abs(rake - f.target) <= f.tol;
  ok &&= pass;
  console.log(`${f.id.padEnd(16)} ${(rake * 100).toFixed(1).padStart(5)}%  ${(f.target * 100).toFixed(0).padStart(4)}%   ±${(f.tol * 100).toFixed(0)}  ${pass ? 'PASS' : 'FAIL'}   ${Math.round(end / seeds)}/${max}`.padEnd(70) + `${spins * seeds}`);
}
process.exit(ok ? 0 : 1);
