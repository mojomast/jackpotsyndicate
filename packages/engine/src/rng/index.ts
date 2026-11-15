/**
 * T-010: deterministic, splittable random streams for engine rules.
 *
 * Every operation is integer-only so the same seed and call sequence produce
 * the same values in Node, Chromium, Firefox and WebKit. A child stream is
 * derived from the parent's current state and a label; splitting never advances
 * or otherwise mutates the parent.
 */

export type Seed = string | number;

export interface RngStream {
  /** Raw unsigned 32-bit draw. */
  nextU32(): number;
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** True with probability `p` (clamped to [0, 1]). */
  chance(p: number): boolean;
  /** Uniform element of a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** Deterministic Fisher-Yates copy. */
  shuffle<T>(items: readonly T[]): T[];
  /** Independent child stream derived from this stream's state and `label`. */
  split(label: string): RngStream;
  /** Serialisable sfc32 state: four signed 32-bit words. */
  getState(): number[];
  setState(state: readonly number[]): void;
  clone(): RngStream;
}

const UINT32_RANGE = 4294967296;

/** FNV-1a over UTF-16 code units, returned unsigned. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable 32-bit seed for string or numeric input. */
export function hashSeed(seed: Seed): number {
  const kind = typeof seed === 'number' ? 'n' : 's';
  return hashString(`${kind}:${String(seed)}`);
}

function mix32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function requireInt(value: number, name: string): void {
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer`);
}

export class Rng implements RngStream {
  private readonly seed: number;
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 1;

  constructor(seed: Seed) {
    this.seed = hashSeed(seed) >>> 0;
    this.reseed(this.seed);
  }

  private reseed(seed: number): void {
    this.a = mix32(seed ^ 0x9e3779b9) | 0;
    this.b = mix32(seed ^ 0x243f6a88) | 0;
    this.c = mix32(seed ^ 0xb7e15162) | 0;
    this.d = (mix32(seed ^ 0x85ebca6b) | 1) | 0;
    for (let i = 0; i < 15; i++) this.nextU32();
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  next(): number {
    return this.nextU32() / UINT32_RANGE;
  }

  int(maxExclusive: number): number {
    requireInt(maxExclusive, 'maxExclusive');
    if (maxExclusive <= 0) throw new RangeError('maxExclusive must be positive');
    return this.nextU32() % maxExclusive;
  }

  range(lo: number, hi: number): number {
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) {
      throw new RangeError('invalid range');
    }
    return lo + (hi - lo) * this.next();
  }

  chance(p: number): boolean {
    if (!Number.isFinite(p)) throw new RangeError('probability must be finite');
    const clamped = p <= 0 ? 0 : p >= 1 ? 1 : p;
    return this.next() < clamped;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('cannot pick from an empty list');
    return items[this.int(items.length)]!;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  }

  split(label: string): RngStream {
    const state = this.getState();
    const key = `${this.seed.toString(16)}:${state.join(',')}:${label}`;
    return new Rng(hashString(key));
  }

  getState(): number[] {
    return [this.a, this.b, this.c, this.d];
  }

  setState(state: readonly number[]): void {
    if (state.length !== 4 || !state.every(Number.isInteger)) {
      throw new RangeError('rng state must be four integers');
    }
    this.a = state[0]! | 0;
    this.b = state[1]! | 0;
    this.c = state[2]! | 0;
    this.d = state[3]! | 0;
  }

  clone(): Rng {
    const copy = new Rng(this.seed);
    copy.setState(this.getState());
    return copy;
  }
}

export function createRng(seed: Seed): Rng {
  return new Rng(seed);
}

/** Derive an independent stream without constructing a parent explicitly. */
export function deriveRng(seed: Seed, label: string): Rng {
  return createRng(hashString(`${hashSeed(seed).toString(16)}:${label}`));
}
