/**
 * T-012: versioned save/load (C-5, R-RUN-07).
 *
 * A save is `{saveVersion, contractsRev, run, simBase64, stateHash}`. The
 * engine hash is `fnv1a(canonicalJSON(RunState without UI fields))` followed by
 * `SimWorld.hash()`; a save is only accepted when its stored hash matches the
 * state and sim bytes it carries.
 */
import {
  CONTRACTS_REV,
  SAVE_VERSION,
  saveFileSchema,
  type RunState,
  type SaveFile,
} from '@jackpotsyndicate/contracts';

/** The slice of `SimWorld` a save needs; a real SimWorld satisfies it. */
export interface SimPersistence {
  serialize(): Uint8Array;
  deserialize(bytes: Uint8Array): void;
  hash(): string;
}

/**
 * RunState has no presentation-only fields today. Exported so the hash
 * definition stays explicit if C-5 ever adds any.
 */
export const RUN_STATE_UI_FIELDS: readonly string[] = [];

export type SaveErrorCode =
  | 'CORRUPT'
  | 'VERSION_MISMATCH'
  | 'HASH_MISMATCH'
  | 'SIM_CORRUPT';

export interface SaveFailure {
  ok: false;
  error: SaveErrorCode;
  detail: string;
}

export interface SaveSuccess {
  ok: true;
  save: SaveFile;
  state: RunState;
  /** Engine hash: run hash + sim hash, equal to `save.stateHash`. */
  hash: string;
  simHash: string;
}

export type SaveLoadResult = SaveSuccess | SaveFailure;

function fail(error: SaveErrorCode, detail: string): SaveFailure {
  return { ok: false, error, detail };
}

/** Deterministic JSON with sorted object keys; numbers must be finite. */
export function canonicalJSON(value: unknown): string {
  const seen = new Set<object>();

  const walk = (input: unknown): string => {
    if (input === null) return 'null';
    switch (typeof input) {
      case 'string':
        return JSON.stringify(input);
      case 'boolean':
        return input ? 'true' : 'false';
      case 'number':
        if (!Number.isFinite(input)) throw new RangeError('canonicalJSON: non-finite number');
        return JSON.stringify(input);
      case 'object': {
        const object = input as object;
        if (seen.has(object)) throw new RangeError('canonicalJSON: cyclic value');
        seen.add(object);
        let out: string;
        if (Array.isArray(object)) {
          out = `[${object.map((entry) => (entry === undefined ? 'null' : walk(entry))).join(',')}]`;
        } else {
          const record = object as Record<string, unknown>;
          const keys = Object.keys(record)
            .filter((key) => record[key] !== undefined)
            .sort();
          out = `{${keys
            .map((key) => `${JSON.stringify(key)}:${walk(record[key])}`)
            .join(',')}}`;
        }
        seen.delete(object);
        return out;
      }
      default:
        throw new RangeError(`canonicalJSON: unsupported ${typeof input}`);
    }
  };

  return walk(value);
}

/** Unsigned 32-bit FNV-1a as 8 lowercase hex characters. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function withoutUiFields(state: RunState): Record<string, unknown> {
  const copy = structuredClone(state) as unknown as Record<string, unknown>;
  for (const key of RUN_STATE_UI_FIELDS) delete copy[key];
  return copy;
}

/** FNV-1a of the canonical UI-free RunState. */
export function runStateHash(state: RunState): string {
  return fnv1a(canonicalJSON(withoutUiFields(state)));
}

/** C-5 engine hash: run-state hash concatenated with `SimWorld.hash()`. */
export function engineHash(state: RunState, simHash: string): string {
  return `${runStateHash(state)}${simHash}`;
}

// ------------------------------------------------------------- base64 bytes
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_INDEX = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < BASE64.length; i++) table[BASE64.charCodeAt(i)] = i;
  return table;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += BASE64[b0 >> 2];
    out += BASE64[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? BASE64[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? BASE64[b2 & 0x3f] : '=';
  }
  return out;
}

export function base64ToBytes(text: string): Uint8Array {
  if (typeof text !== 'string') throw new TypeError('base64 payload must be a string');
  const normalized = text.replace(/\s+/g, '');
  if (normalized.length % 4 !== 0) throw new RangeError('invalid base64 length');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new RangeError('invalid base64 character');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((normalized.length / 4) * 3 - padding);
  let cursor = 0;
  for (let i = 0; i < normalized.length; i += 4) {
    const chunk = normalized.slice(i, i + 4);
    const values: number[] = [];
    for (let j = 0; j < 4; j++) {
      const char = chunk[j]!;
      if (char === '=') {
        values.push(0);
        continue;
      }
      const index = BASE64_INDEX[char.charCodeAt(0)] ?? -1;
      if (index < 0) throw new RangeError('invalid base64 character');
      values.push(index);
    }
    const [v0, v1, v2, v3] = values as [number, number, number, number];
    const bytes = [
      (v0 << 2) | (v1 >> 4),
      ((v1 & 0x0f) << 4) | (v2 >> 2),
      ((v2 & 0x03) << 6) | v3,
    ];
    for (let j = 0; j < 3 - (i + 4 === normalized.length ? padding : 0); j++) {
      out[cursor++] = bytes[j]!;
    }
  }
  return out;
}

// ---------------------------------------------------------------- save file

/** Build a schema-valid SaveFile and its C-5 engine hash. */
export function createSaveFile(state: RunState, sim: SimPersistence): SaveFile {
  const bytes = sim.serialize();
  if (!(bytes instanceof Uint8Array)) throw new TypeError('sim.serialize() must return Uint8Array');
  const save: SaveFile = {
    saveVersion: SAVE_VERSION,
    contractsRev: CONTRACTS_REV,
    run: structuredClone(state),
    simBase64: bytesToBase64(bytes),
    stateHash: engineHash(state, sim.hash()),
  };
  return saveFileSchema.parse(save);
}

export function encodeSave(save: SaveFile): string {
  return JSON.stringify(save);
}

export function decodeSave(input: unknown): { ok: true; save: SaveFile } | SaveFailure {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (error) {
      return fail('CORRUPT', `not JSON: ${(error as Error).message}`);
    }
  }
  const parsed = saveFileSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('CORRUPT', parsed.error.issues.map((issue) => issue.message).join('; '));
  }
  const save = parsed.data;
  if (save.saveVersion !== SAVE_VERSION || save.run.saveVersion !== SAVE_VERSION) {
    return fail(
      'VERSION_MISMATCH',
      `expected save version ${SAVE_VERSION}, found ${save.saveVersion}/${save.run.saveVersion}`,
    );
  }
  return { ok: true, save };
}

function restore(sim: SimPersistence, bytes: Uint8Array): void {
  try {
    sim.deserialize(bytes);
  } catch {
    // Nothing further can be done; the caller gets the failure and the sim is
    // considered unsafe. Keeping this helper total avoids masking the error.
  }
}

/**
 * Validate and apply a save. Nothing is written to `sim` unless the version,
 * schema, sim bytes and C-5 hash all check out; on failure the previous sim
 * bytes are restored.
 */
export function loadSave(input: unknown, sim: SimPersistence): SaveLoadResult {
  const decoded = decodeSave(input);
  if (!decoded.ok) return decoded;
  const save = decoded.save;

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(save.simBase64);
  } catch (error) {
    return fail('CORRUPT', `sim payload: ${(error as Error).message}`);
  }

  const previous = sim.serialize();
  let simHash: string;
  try {
    sim.deserialize(bytes);
    simHash = sim.hash();
  } catch (error) {
    restore(sim, previous);
    return fail('SIM_CORRUPT', `sim rejected the payload: ${(error as Error).message}`);
  }

  const hash = engineHash(save.run, simHash);
  if (hash !== save.stateHash) {
    restore(sim, previous);
    return fail('HASH_MISMATCH', `expected ${save.stateHash}, computed ${hash}`);
  }

  return {
    ok: true,
    save,
    state: structuredClone(save.run),
    hash,
    simHash,
  };
}

/** Convenience for localStorage: serialise, then read back through `loadSave`. */
export function saveToJSON(state: RunState, sim: SimPersistence): string {
  return encodeSave(createSaveFile(state, sim));
}

export function loadSaveFromJSON(text: string, sim: SimPersistence): SaveLoadResult {
  return loadSave(text, sim);
}
