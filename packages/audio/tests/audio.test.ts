import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameEvent } from '@jackpotsyndicate/contracts';
import {
  AudioEngine,
  EVENT_VOICE_MAP,
  VOICE_NAMES,
  voiceForEvent,
} from '@jackpotsyndicate/audio';
import type {
  AudioContextLike,
  AudioParamLike,
  GainNodeLike,
  GestureTarget,
  OscillatorNodeLike,
} from '@jackpotsyndicate/audio';

interface ParamEvent {
  method: 'set' | 'linear' | 'exponential' | 'cancel';
  value: number;
  time: number;
}

class FakeParam implements AudioParamLike {
  value = 0;
  events: ParamEvent[] = [];

  setValueAtTime(value: number, time: number): unknown {
    this.value = value;
    this.events.push({ method: 'set', value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): unknown {
    this.events.push({ method: 'linear', value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): unknown {
    this.events.push({ method: 'exponential', value, time });
    return this;
  }

  cancelScheduledValues(time: number): unknown {
    this.events.push({ method: 'cancel', value: this.value, time });
    return this;
  }
}

class FakeGain implements GainNodeLike {
  gain = new FakeParam();
  connected: unknown[] = [];
  disconnected = false;

  connect(destination: unknown): unknown {
    this.connected.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeOscillator implements OscillatorNodeLike {
  type = 'sine';
  frequency = new FakeParam();
  detune = new FakeParam();
  onended: ((event: Event) => void) | null = null;
  connected: unknown[] = [];
  startedAt: number | null = null;
  stoppedAt: number | null = null;

  connect(destination: unknown): unknown {
    this.connected.push(destination);
    return destination;
  }

  start(when = 0): void {
    this.startedAt = when;
  }

  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

class FakeContext implements AudioContextLike {
  currentTime = 0;
  destination = { name: 'destination' };
  state = 'suspended';
  gains: FakeGain[] = [];
  oscillators: FakeOscillator[] = [];
  resumeCalls = 0;

  createGain(): GainNodeLike {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createOscillator(): OscillatorNodeLike {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }
}

function harness(options: { rng?: () => number; volume?: number; muted?: boolean } = {}) {
  const context = new FakeContext();
  const engine = new AudioEngine({ context, ...options });
  return { context, engine };
}

function event(t: GameEvent['t'], extra: Record<string, unknown> = {}): GameEvent {
  return { t, tick: 1, ...extra } as GameEvent;
}

test('every mapped GameEvent kind triggers exactly one synthesized voice', () => {
  const kinds = Object.keys(EVENT_VOICE_MAP) as GameEvent['t'][];
  assert.equal(kinds.length, 21);
  assert.deepEqual(new Set(Object.values(EVENT_VOICE_MAP)), new Set(VOICE_NAMES));

  for (const kind of kinds) {
    const { context, engine } = harness();
    assert.equal(context.oscillators.length, 0, kind);
    assert.equal(engine.playEvent(event(kind)), true, kind);
    assert.equal(context.oscillators.length, 1, kind);
    assert.equal(engine.activeVoices, 1, kind);
  }
});

test('unmapped events are silent and a missing AudioContext is inert', () => {
  const { context, engine } = harness();
  assert.equal(engine.playEvent(event('RunStarted', { seed: 'abc' })), false);
  assert.equal(engine.playEvent(event('PhaseChanged', { from: 'TITLE', to: 'PREP' })), false);
  assert.equal(context.oscillators.length, 0);
  assert.equal(voiceForEvent({ t: 'PegUpgraded' }), null);

  const inert = new AudioEngine({ context: null });
  assert.equal(inert.context, null);
  assert.equal(inert.play('spin'), false);
});

test('voice limit caps a 200-event burst at 16 simultaneous voices', () => {
  const { context, engine } = harness();
  let accepted = 0;
  for (let i = 0; i < 200; i++) if (engine.playEvent(event('PegHit'))) accepted += 1;

  assert.equal(engine.maxVoices, 16);
  assert.equal(engine.activeVoices, 16);
  assert.equal(accepted, 16);
  assert.equal(context.oscillators.length, 16);

  context.currentTime = 10;
  assert.equal(engine.activeVoices, 0);
  assert.equal(engine.play('peg'), true);
  assert.equal(engine.activeVoices, 1);
  assert.equal(context.oscillators.length, 17);
});

test('mute is silent and volume changes master gain', () => {
  const { context, engine } = harness({ volume: 0.5 });
  const master = context.gains[0]!;
  assert.equal(master.gain.value, 0.5);

  engine.setVolume(0.9);
  assert.equal(master.gain.value, 0.9);

  engine.setMuted(true);
  assert.equal(master.gain.value, 0);
  const createdBeforeMute = context.oscillators.length;
  assert.equal(engine.play('boss'), false);
  assert.equal(context.oscillators.length, createdBeforeMute);

  engine.setMuted(false);
  assert.equal(master.gain.value, 0.9);
  assert.equal(engine.play('boss'), true);
  assert.equal(context.oscillators.length, createdBeforeMute + 1);
});

test('first gesture unlocks the context once and detaches its listeners', async () => {
  const { context, engine } = harness();
  const listeners = new Map<string, (event: unknown) => void>();
  const target: GestureTarget = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };

  const cleanup = engine.attachFirstGesture(target);
  assert.equal(listeners.size, 4);
  listeners.get('pointerdown')!({ type: 'pointerdown' });
  await Promise.resolve();

  assert.equal(engine.unlocked, true);
  assert.equal(context.resumeCalls, 1);
  assert.equal(context.state, 'running');
  assert.equal(listeners.size, 0);

  await engine.unlock();
  assert.equal(context.resumeCalls, 1);
  cleanup();
});

test('injected UI RNG varies voice pitch without affecting voice count', () => {
  const values = [0, 1];
  const { context, engine } = harness({ rng: () => values.shift() ?? 0.5 });

  assert.equal(engine.play('peg'), true);
  assert.equal(engine.play('peg'), true);

  const [first, second] = context.oscillators;
  const firstHz = first!.frequency.events.find((entry) => entry.method === 'set')!.value;
  const secondHz = second!.frequency.events.find((entry) => entry.method === 'set')!.value;
  assert.notEqual(firstHz, secondHz);
  assert.equal(engine.activeVoices, 2);
  assert.equal(context.oscillators.length, 2);
});
