/**
 * sfc32: small, fast, integer-only PRNG. Integer ops are bit-exact on every JS
 * engine, which is what the simulation's determinism rests on.
 */
export class Prng {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 1;

  constructor(seed: number) {
    this.reseed(seed);
  }

  reseed(seed: number): void {
    this.a = seed | 0;
    this.b = 0x9e3779b9 | 0;
    this.c = 0x243f6a88 | 0;
    this.d = 1;
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

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  getState(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }

  setState(s: readonly number[]): void {
    this.a = s[0]! | 0;
    this.b = s[1]! | 0;
    this.c = s[2]! | 0;
    this.d = s[3]! | 0;
  }
}
