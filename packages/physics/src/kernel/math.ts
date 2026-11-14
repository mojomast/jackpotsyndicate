import { SINE_TABLE, SINE_TABLE_SIZE } from '@jackpotsyndicate/contracts';

export const PI = 3.141592653589793;
export const TWO_PI = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
const UNITS_PER_RAD = SINE_TABLE_SIZE / TWO_PI;
const MASK = SINE_TABLE_SIZE - 1;

/**
 * Deterministic sine: table lookup with linear interpolation, using only
 * +, *, and floor. Never call Math.sin in simulation code.
 */
export function sinLookup(radians: number): number {
  const t = radians * UNITS_PER_RAD;
  const i = Math.floor(t);
  const f = t - i;
  const a = SINE_TABLE[i & MASK]!;
  const b = SINE_TABLE[(i + 1) & MASK]!;
  return a + f * (b - a);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
