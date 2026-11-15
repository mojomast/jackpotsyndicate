/**
 * Deterministic bot RNG. Deliberately independent of `Math.random` so bot
 * decisions only depend on the run seed and bot id.
 */
export class SimRng {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === 'number' ? seed >>> 0 : fnv1a(seed);
    if (this.state === 0) this.state = 0x9e3779b9;
    // Discard the first few values so nearby seeds diverge quickly.
    for (let i = 0; i < 4; i++) this.next();
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let value = (this.state += 0x6d2b79f5) >>> 0;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [0, max). */
  int(max: number): number {
    if (!Number.isFinite(max) || max <= 0) return 0;
    return Math.floor(this.next() * Math.floor(max));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T | undefined {
    if (values.length === 0) return undefined;
    return values[this.int(values.length)];
  }

  shuffle<T>(values: readonly T[]): T[] {
    const out = values.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  }
}

export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
