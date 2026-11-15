/**
 * Deterministic exit VFX for tokens leaving the shelf.
 *
 * Exit events carry the position and velocity at the lip or gutter. The
 * particle state is a pure function of the event plus the number of ticks
 * elapsed, so a static snapshot can be rendered identically every time. There
 * is no randomness and no external asset: particles are placeholder shapes.
 */
import type { PhysicsEvent } from '@jackpotsyndicate/contracts';

export type ParticleKind = 'lip' | 'gutter';

export interface ParticleInit {
  id: number;
  kind: ParticleKind;
  tokenId: number;
  symbolId: string;
  skin: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  stack: number;
  color: string;
  side?: 'left' | 'right';
  tick: number;
}

export interface ExitParticle extends ParticleInit {
  age: number;
  life: number;
  maxLife: number;
  alpha: number;
  scale: number;
  rotation: number;
}

const DEFAULT_LIFE = 26;

function eventTick(event: PhysicsEvent, fallback: number): number {
  const withTick = event as PhysicsEvent & { tick?: number };
  return typeof withTick.tick === 'number' ? withTick.tick : fallback;
}

function hashUnit(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Build particle descriptors from a stream of physics events. `currentTick`
 * is the snapshot tick used for events that do not carry their own tick.
 */
export function particlesFromEvents(
  events: readonly PhysicsEvent[],
  currentTick = 0,
  options: { life?: number } = {},
): ExitParticle[] {
  const life = options.life ?? DEFAULT_LIFE;
  const out: ExitParticle[] = [];
  let ordinal = 0;
  for (const event of events) {
    if (event.t !== 'LipDrop' && event.t !== 'GutterLoss') continue;
    const tick = eventTick(event, currentTick);
    const age = Math.max(0, currentTick - tick);
    if (age > life) continue;
    const lip = event.t === 'LipDrop';
    const jitter = hashUnit(event.tokenId + ordinal * 97);
    const id = ordinal++;
    out.push({
      id,
      kind: lip ? 'lip' : 'gutter',
      tokenId: event.tokenId,
      symbolId: event.symbolId,
      skin: event.skin,
      radius: event.radius,
      stack: event.stack,
      color: lip ? symbolColorFor(event.symbolId) : '#7f1d1d',
      side: lip ? undefined : event.side,
      tick,
      ...projectParticle({
        x: event.x,
        y: event.y,
        vx: lip ? event.vx : (event.side === 'left' ? -0.5 : 0.5) - jitter * 0.25,
        vy: lip ? Math.max(1, event.vy) : 0.5,
        age,
        life,
        seed: event.tokenId + id * 31,
      }),
    });
  }
  return out;
}

function symbolColorFor(symbolId: string): string {
  switch (symbolId) {
    case 'diamond':
      return '#06b6d4';
    case 'cherry':
      return '#f43f5e';
    case 'uranium':
      return '#10b981';
    case 'skull':
      return '#a855f7';
    case 'seven':
      return '#fbbf24';
    default:
      return '#b45309';
  }
}

function projectParticle(input: {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  seed: number;
}): Pick<ExitParticle, 'x' | 'y' | 'vx' | 'vy' | 'age' | 'life' | 'maxLife' | 'alpha' | 'scale' | 'rotation'> {
  const { age, life } = input;
  const t = Math.min(age, life);
  const x = input.x + input.vx * t;
  const y = input.y + input.vy * t + 0.175 * t * t;
  const remaining = Math.max(0, 1 - age / life);
  return {
    x,
    y,
    vx: input.vx,
    vy: input.vy,
    age,
    life,
    maxLife: life,
    alpha: remaining,
    scale: 0.85 + 0.35 * remaining,
    rotation: hashUnit(input.seed) * Math.PI * 2,
  };
}

/** Advance existing particles by `ticks`, dropping expired ones. */
export function stepParticles(
  particles: readonly ExitParticle[],
  ticks = 1,
  life = DEFAULT_LIFE,
): ExitParticle[] {
  const out: ExitParticle[] = [];
  for (const particle of particles) {
    const age = particle.age + Math.max(0, ticks);
    if (age > life) continue;
    out.push({
      ...particle,
      ...projectParticle({
        x: particle.x - particle.vx * particle.age,
        y: particle.y - particle.vy * particle.age - 0.175 * particle.age * particle.age,
        vx: particle.vx,
        vy: particle.vy,
        age,
        life,
        seed: particle.tokenId + particle.id * 31,
      }),
    });
  }
  return out;
}
