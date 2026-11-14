import type { FloorPhysics, PhysicsModifiers } from '@jackpotsyndicate/contracts';
import type { Prng } from './prng';
import type { Tuning } from './tuning';

/** State shared by both chambers. Owned by the world. */
export interface SimContext {
  rng: Prng;
  tune: Tuning;
  floor: FloorPhysics;
  mods: PhysicsModifiers;
  /** Monotonic id source shared by orbs and tokens. */
  nextId: number;
}

export function allocId(ctx: SimContext): number {
  const id = ctx.nextId;
  ctx.nextId = id + 1;
  return id;
}
