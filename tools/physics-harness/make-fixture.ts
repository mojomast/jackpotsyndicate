/** Regenerates packages/contracts/fixtures/snapshot.static.json from a fixed scenario. */
import { writeFileSync } from 'node:fs';
import { DEFAULT_MODIFIERS } from '@jackpotsyndicate/contracts';
import { createSimWorld, NEON_FLOOR_PHYSICS } from '@jackpotsyndicate/physics';
import { ORBS, runSpins, seedShelf } from './lib';

const w = createSimWorld(2026);
w.configure(NEON_FLOOR_PHYSICS, DEFAULT_MODIFIERS, true);
seedShelf(w, 30);
runSpins(w, 12, 3);
['diamond', 'cherry', 'uranium', 'skull', 'seven', 'scrap'].forEach((s, i) => w.launchOrb({ ...ORBS[s]!, x: 80 + i * 88 }));
for (let i = 0; i < 40; i++) w.step();
const round = (_k: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
writeFileSync(new URL('../../packages/contracts/fixtures/snapshot.static.json', import.meta.url), JSON.stringify(w.snapshot(), round, 1) + '\n');
const c = w.counts();
console.log(`snapshot: ${c.orbs} orbs, ${c.tokens} tokens`);
