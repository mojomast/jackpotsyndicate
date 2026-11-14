import type { OrbSpec, PhysicsEvent, SimWorld, TokenTemplate } from '@jackpotsyndicate/contracts';
import { Prng } from '@jackpotsyndicate/physics';

const base = { count: 1, stack: 1, weldOnLand: false, magnetic: false, seismic: false, resistSuction: false };

/** Token templates per the spec's symbol table (2.6). */
export const TOKENS: Record<string, TokenTemplate> = {
  diamond: { ...base, symbolId: 'diamond', skin: 'diamond', radius: 11, mass: 1.6, slide: 0.35, weldOnLand: true },
  cherry: { ...base, symbolId: 'cherry', skin: 'cherry', radius: 6.5, mass: 0.75, slide: 0.5, count: 2 },
  uranium: { ...base, symbolId: 'uranium', skin: 'uranium', radius: 10, mass: 1.3, slide: 0.25, seismic: true },
  skull: { ...base, symbolId: 'skull', skin: 'skull', radius: 9.5, mass: 1.25, slide: 0.5, magnetic: true },
  seven: { ...base, symbolId: 'seven', skin: 'bullion', radius: 12, mass: 1.1, slide: 0.5, stack: 3 },
  scrap: { ...base, symbolId: 'scrap', skin: 'copper', radius: 10, mass: 1.0, slide: 0.5 },
};

const orbBase = { canSplit: false, splitOnFirstPeg: false, magnet: false, accelPerHit: 0, chainGold: false, upgradesPegs: false };

export const ORBS: Record<string, Omit<OrbSpec, 'x'>> = {
  diamond: { ...orbBase, symbolId: 'diamond', mass: 1.6, elasticity: 0.6, chainGold: true, token: TOKENS.diamond! },
  cherry: { ...orbBase, symbolId: 'cherry', mass: 0.75, elasticity: 0.88, canSplit: true, splitOnFirstPeg: true, token: TOKENS.cherry! },
  uranium: { ...orbBase, symbolId: 'uranium', mass: 1.3, elasticity: 0.96, accelPerHit: 0.12, token: TOKENS.uranium! },
  skull: { ...orbBase, symbolId: 'skull', mass: 1.25, elasticity: 0.7, magnet: true, token: TOKENS.skull! },
  seven: { ...orbBase, symbolId: 'seven', mass: 1.1, elasticity: 0.82, upgradesPegs: true, token: TOKENS.seven! },
  scrap: { ...orbBase, symbolId: 'scrap', mass: 1.0, elasticity: 0.8, token: TOKENS.scrap! },
};

/** Rough reel weights: commons frequent, sevens rare. */
const WEIGHTED = ['cherry', 'cherry', 'cherry', 'cherry', 'diamond', 'diamond', 'skull', 'skull', 'uranium', 'seven'];
const SEED_MIX = ['cherry', 'diamond', 'uranium', 'skull', 'seven'];

export interface RunStats { lip: number; gutter: number; spawned: number; merged: number; maxTokens: number; endTokens: number; ticks: number; orbsLaunched: number }

export function seedShelf(world: SimWorld, n = 20): void {
  world.applyDirective({ t: 'seedShelf', tokens: Array.from({ length: n }, (_, i) => TOKENS[SEED_MIX[i % SEED_MIX.length]!]!) });
}

/**
 * Bot loop approximating play with no trinkets: each spin launches 1-4 orbs
 * (dead spins launch one scrap orb), waits for the pinfield to clear plus a
 * short think time, repeats.
 */
export function runSpins(world: SimWorld, spins: number, seed: number, opts: { cols?: number; warmup?: number; onEvent?: (e: PhysicsEvent) => void } = {}): RunStats {
  const rng = new Prng(seed ^ 0x5eed);
  const cols = opts.cols ?? 3;
  const warmup = opts.warmup ?? 0;
  const s: RunStats = { lip: 0, gutter: 0, spawned: 0, merged: 0, maxTokens: 0, endTokens: 0, ticks: 0, orbsLaunched: 0 };
  let counting = false;
  const tickOnce = () => {
    for (const e of world.step()) {
      opts.onEvent?.(e);
      if (!counting) continue;
      if (e.t === 'LipDrop') s.lip++;
      else if (e.t === 'GutterLoss') s.gutter++;
      else if (e.t === 'TokenSpawned') s.spawned++;
      else if (e.t === 'TokenMerged') s.merged++;
    }
    s.ticks++;
    const c = world.counts().tokens;
    if (c > s.maxTokens) s.maxTokens = c;
  };
  for (let spin = 0; spin < spins + warmup; spin++) {
    counting = spin >= warmup;
    const win = rng.next() < 0.38;
    const n = win ? 3 + Math.floor(rng.next() * 2) + (rng.next() < 0.2 ? 3 : 0) : 1;
    for (let k = 0; k < n; k++) {
      const sym = win ? WEIGHTED[Math.floor(rng.next() * WEIGHTED.length)]! : 'scrap';
      const col = Math.floor(rng.next() * cols);
      const x = ((col + 0.5) / cols) * (600 - 80) + 40 + (rng.next() - 0.5) * 18;
      world.launchOrb({ ...ORBS[sym]!, x });
      if (counting) s.orbsLaunched++;
      for (let t = 0; t < 6; t++) tickOnce();
    }
    for (let t = 0; t < 78; t++) tickOnce(); // reel spin time
    let guard = 0;
    while ((world.counts().orbs > 0 || world.counts().queued > 0) && guard++ < 4000) tickOnce();
    for (let t = 0; t < 45; t++) tickOnce(); // player think time
  }
  s.endTokens = world.counts().tokens;
  return s;
}
