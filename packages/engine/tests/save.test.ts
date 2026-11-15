import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONTRACTS_REV,
  SAVE_VERSION,
  saveFileSchema,
  type BalanceDef,
  type FloorDef,
  type FloorId,
  type ItemDef,
  type RunState,
} from '@jackpotsyndicate/contracts';
import { RunMachine, type RunContent } from '../src/run/index.js';
import {
  base64ToBytes,
  bytesToBase64,
  canonicalJSON,
  createSaveFile,
  decodeSave,
  encodeSave,
  engineHash,
  fnv1a,
  loadSave,
  loadSaveFromJSON,
  runStateHash,
  saveToJSON,
  type SimPersistence,
} from '../src/save/index.js';

function floorDef(id: FloorId, order: 1 | 2 | 3, next: FloorId[]): FloorDef {
  return {
    id,
    name: id,
    order,
    next,
    bossId: 'valenti',
    physics: { friction: 0.9, gutterRisk: 1, dozerSpeed: 0.05, pegs: [] },
    chuteMults: [0.8, 1.5, 3, 1.5, 2],
    pegChips: { gold: 5, bumper: 15, golden: 30, splitter: 10 },
    lipMult: 1,
    quotaScale: 1,
    shop: {
      archetypeWeights: { DRINKS: 25, TRINKETS: 25, REELS: 25, MIXED: 25 },
      categoryWeights: { TRINKET: 20, DRINK: 20, REEL: 20, COIN: 20, CHASSIS: 20 },
      rarityWeights: { common: 1, rare: 1, epic: 1, legendary: 1, cursed: 1 },
    },
    bgSpriteKey: 'bg',
  };
}

const BALANCE: BalanceDef = {
  startBankroll: 500,
  cashPerChip: 1,
  quotas: [1000, 2100, 4410, 9261, 19448, 40841, 85766, 180109, 378229],
  minMatch: 3,
  baseStrip: ['cherry', 'diamond', 'seven', 'skull', 'uranium'],
  firstReelStrip: ['cherry', 'cherry', 'diamond', 'seven', 'skull'],
};

const ITEMS: readonly ItemDef[] = [
  {
    id: 'relic-a',
    name: 'Relic A',
    desc: '',
    price: 100,
    spriteKey: 'trinket.relic-a',
    rarity: 'common',
    category: 'TRINKET',
    effects: [],
  },
];

const CONTENT: RunContent = {
  balance: BALANCE,
  items: ITEMS,
  floors: [
    floorDef('FLOOR_NEON', 1, ['FLOOR_CRYO', 'FLOOR_FOUNDRY']),
    floorDef('FLOOR_CRYO', 2, ['FLOOR_PENTHOUSE']),
    floorDef('FLOOR_FOUNDRY', 2, ['FLOOR_PENTHOUSE']),
    floorDef('FLOOR_PENTHOUSE', 3, []),
  ],
};

/** Deterministic stand-in for SimWorld's persistence surface. */
class FakeSim implements SimPersistence {
  private bytes: Uint8Array;

  constructor(bytes: Uint8Array = new Uint8Array([1, 2, 3, 4])) {
    this.bytes = bytes.slice();
  }

  serialize(): Uint8Array {
    return this.bytes.slice();
  }

  deserialize(bytes: Uint8Array): void {
    if (bytes.length < 4) throw new Error('corrupt sim payload');
    this.bytes = bytes.slice();
  }

  hash(): string {
    return `${fnv1a(Array.from(this.bytes).join(','))}`.padEnd(16, '0').slice(0, 16);
  }
}

function started(seed = 'save-seed'): RunMachine {
  const machine = RunMachine.newRun(CONTENT, seed);
  assert.deepEqual(machine.dispatch({ c: 'NewRun', seed }), { ok: true });
  machine.drainEvents();
  return machine;
}

function playedRun(): RunState {
  const machine = started('round-trip');
  assert.deepEqual(machine.bank(625), { ok: true });
  assert.deepEqual(machine.dispatch({ c: 'Spin' }), { ok: true });
  assert.deepEqual(machine.beginResolving(), { ok: true });
  assert.deepEqual(machine.spinResolved(), { ok: true });
  assert.deepEqual(machine.dispatch({ c: 'Spin' }), { ok: true });
  assert.deepEqual(machine.beginResolving(), { ok: true });
  assert.deepEqual(machine.spinResolved(), { ok: true });
  machine.drainEvents();
  return machine.getState();
}

test('canonicalJSON sorts keys and fnv1a is stable', () => {
  assert.equal(canonicalJSON({ b: 1, a: [true, null, 'x'] }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(canonicalJSON([undefined, 2]), '[null,2]');
  assert.equal(fnv1a(''), '811c9dc5');
  assert.equal(fnv1a('hello'), fnv1a('hello'));
  assert.notEqual(fnv1a('hello'), fnv1a('hellp'));
  assert.throws(() => canonicalJSON({ n: Number.NaN }), RangeError);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJSON(cyclic), RangeError);
});

test('base64 codec round-trips bytes and rejects malformed payloads', () => {
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array([0]),
    new Uint8Array([0, 1]),
    new Uint8Array([0, 1, 2]),
    Uint8Array.from({ length: 256 }, (_, index) => index),
  ]) {
    assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  }
  assert.throws(() => base64ToBytes('a'), RangeError);
  assert.throws(() => base64ToBytes('!!!!'), RangeError);
  assert.throws(() => base64ToBytes('ab=c'), RangeError);
});

test('save round-trips RunState and preserves the engine hash', () => {
  const state = playedRun();
  const before = structuredClone(state);
  const sim = new FakeSim(new Uint8Array([11, 22, 33, 44]));
  const save = createSaveFile(state, sim);

  assert.equal(save.saveVersion, SAVE_VERSION);
  assert.equal(save.contractsRev, CONTRACTS_REV);
  assert.equal(save.run.tick, state.tick);
  assert.equal(saveFileSchema.safeParse(save).success, true);
  assert.deepEqual(state, before, 'createSaveFile does not mutate its input');

  const expectedHash = `${runStateHash(state)}${sim.hash()}`;
  assert.equal(save.stateHash, expectedHash);
  assert.equal(save.stateHash, engineHash(state, sim.hash()));

  const json = encodeSave(save);
  const target = new FakeSim(new Uint8Array([9, 9, 9, 9]));
  const loaded = loadSave(json, target);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;

  assert.deepEqual(loaded.state, before);
  assert.equal(loaded.hash, save.stateHash);
  assert.equal(loaded.simHash, sim.hash());
  assert.equal(target.hash(), sim.hash());
  assert.deepEqual(target.serialize(), sim.serialize());
  assert.equal(encodeSave(loaded.save), json);

  // Continuing from the restored state produces the same next spin.
  const original = RunMachine.fromState(CONTENT, before);
  const restored = RunMachine.fromState(CONTENT, loaded.state);
  assert.deepEqual(original.dispatch({ c: 'Spin' }), { ok: true });
  assert.deepEqual(restored.dispatch({ c: 'Spin' }), { ok: true });
  assert.deepEqual(original.getState().grid.visible, restored.getState().grid.visible);
  assert.deepEqual(original.getState().rng, restored.getState().rng);
  assert.equal(
    runStateHash(original.getState()),
    runStateHash(restored.getState()),
    'continued run keeps the same engine state hash',
  );
});

test('saveToJSON/loadSaveFromJSON round-trip through the string form', () => {
  const state = playedRun();
  const sim = new FakeSim(new Uint8Array([5, 6, 7, 8]));
  const json = saveToJSON(state, sim);
  assert.equal(typeof json, 'string');
  const target = new FakeSim();
  const loaded = loadSaveFromJSON(json, target);
  assert.equal(loaded.ok, true);
  if (loaded.ok) assert.deepEqual(loaded.state, state);
});

function expectRejected(
  input: unknown,
  error: string,
  sim: FakeSim,
  priorHash: string,
  label: string,
): void {
  const result = loadSave(input, sim);
  assert.equal(result.ok, false, label);
  if (!result.ok) assert.equal(result.error, error, label);
  assert.equal(sim.hash(), priorHash, `${label}: sim must not change`);
}

test('corrupt, version-mismatched and hash-mismatched saves are rejected without changing state', () => {
  const state = playedRun();
  const sim = new FakeSim(new Uint8Array([1, 3, 5, 7]));
  const save = createSaveFile(state, sim);
  const json = encodeSave(save);
  const target = new FakeSim(new Uint8Array([42, 42, 42, 42]));
  const priorHash = target.hash();
  const priorBytes = target.serialize();
  const machineState = JSON.stringify(state);

  expectRejected('{"saveVersion":1', 'CORRUPT', target, priorHash, 'truncated json');
  expectRejected('null', 'CORRUPT', target, priorHash, 'null save');
  expectRejected(42, 'CORRUPT', target, priorHash, 'non-object save');

  const badPhase = structuredClone(save) as unknown as { run: { phase: string } };
  badPhase.run.phase = 'NOT_A_PHASE';
  expectRejected(badPhase, 'CORRUPT', target, priorHash, 'schema-invalid phase');

  const missingHash = structuredClone(save) as unknown as Record<string, unknown>;
  delete missingHash.stateHash;
  expectRejected(missingHash, 'CORRUPT', target, priorHash, 'missing hash');

  const topVersion = { ...structuredClone(save), saveVersion: SAVE_VERSION + 1 };
  expectRejected(topVersion, 'VERSION_MISMATCH', target, priorHash, 'top-level version');

  const runVersion = structuredClone(save);
  runVersion.run.saveVersion = SAVE_VERSION + 1;
  expectRejected(runVersion, 'VERSION_MISMATCH', target, priorHash, 'run version');

  const tampered = structuredClone(save);
  tampered.run.bankroll += 1;
  expectRejected(tampered, 'HASH_MISMATCH', target, priorHash, 'tampered bankroll');

  const badBase64 = { ...structuredClone(save), simBase64: '!!!!' };
  expectRejected(badBase64, 'CORRUPT', target, priorHash, 'invalid base64');

  const shortSim = { ...structuredClone(save), simBase64: bytesToBase64(new Uint8Array([1])) };
  expectRejected(shortSim, 'SIM_CORRUPT', target, priorHash, 'sim rejects payload');

  assert.deepEqual(target.serialize(), priorBytes, 'sim bytes restored after every failure');
  assert.equal(JSON.stringify(state), machineState, 'run state untouched by failed loads');
  assert.equal(decodeSave(json).ok, true);
});

test('a save whose hash matches different sim bytes is rejected', () => {
  const state = playedRun();
  const sim = new FakeSim(new Uint8Array([2, 4, 6, 8]));
  const save = createSaveFile(state, sim);
  const target = new FakeSim();
  const prior = target.hash();
  const swapped = { ...structuredClone(save), simBase64: bytesToBase64(new Uint8Array([8, 8, 8, 8])) };
  const result = loadSave(swapped, target);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'HASH_MISMATCH');
  assert.equal(target.hash(), prior);
});
