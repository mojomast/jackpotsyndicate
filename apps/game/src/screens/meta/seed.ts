const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A fresh, readable run seed (`JS-XXXXXX`). Seeds never leave the device. */
export function randomSeed(): string {
  const bytes = new Uint8Array(6);
  try {
    if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('no crypto');
    globalThis.crypto.getRandomValues(bytes);
  } catch {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (const byte of bytes) out += SEED_ALPHABET[byte % SEED_ALPHABET.length];
  return `JS-${out}`;
}

/** Normalise typed seeds: trim, collapse whitespace, cap the length. */
export function cleanSeed(value: string): string {
  return value.trim().replace(/\s+/g, '-').slice(0, 40);
}
