/** Minimal binary writer/reader. Little-endian, exact float64 bits. */

const enc = new TextEncoder();
const dec = new TextDecoder();

export class ByteWriter {
  private buf = new ArrayBuffer(4096);
  private view = new DataView(this.buf);
  private pos = 0;

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.byteLength) return;
    let size = this.buf.byteLength * 2;
    while (size < this.pos + n) size *= 2;
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(new Uint8Array(this.buf, 0, this.pos));
    this.buf = next;
    this.view = new DataView(next);
  }

  u8(v: number): void {
    this.ensure(1);
    this.view.setUint8(this.pos, v);
    this.pos += 1;
  }
  bool(v: boolean): void {
    this.u8(v ? 1 : 0);
  }
  i32(v: number): void {
    this.ensure(4);
    this.view.setInt32(this.pos, v, true);
    this.pos += 4;
  }
  u32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, v, true);
    this.pos += 4;
  }
  f64(v: number): void {
    this.ensure(8);
    // Normalise -0 to +0 so equal-behaving states hash equally.
    this.view.setFloat64(this.pos, v === 0 ? 0 : v, true);
    this.pos += 8;
  }
  str(s: string): void {
    const b = enc.encode(s);
    this.u32(b.length);
    this.ensure(b.length);
    new Uint8Array(this.buf, this.pos, b.length).set(b);
    this.pos += b.length;
  }
  finish(): Uint8Array {
    return new Uint8Array(this.buf.slice(0, this.pos));
  }
}

export class ByteReader {
  private view: DataView;
  private pos = 0;
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  u8(): number {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }
  bool(): boolean {
    return this.u8() === 1;
  }
  i32(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  u32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  f64(): number {
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }
  str(): string {
    const n = this.u32();
    const s = dec.decode(this.bytes.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }
  get done(): boolean {
    return this.pos >= this.bytes.byteLength;
  }
}

/** Two independent 32-bit FNV-1a passes -> 16 hex chars. */
export function hashBytes(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5 | 0;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    h1 = Math.imul(h1 ^ b, 0x01000193);
    h2 = Math.imul(h2 ^ b, 0x85ebca6b);
    h2 = (h2 << 13) | (h2 >>> 19);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h1) + hex(h2);
}
