import type { GameEvent } from '@jackpotsyndicate/contracts';

export type VoiceName =
  | 'spin'
  | 'reelStop'
  | 'peg'
  | 'split'
  | 'chute'
  | 'lip'
  | 'gutter'
  | 'surge'
  | 'fever'
  | 'buy'
  | 'error'
  | 'boss';

export interface AudioParamLike {
  value: number;
  setValueAtTime?(value: number, time: number): unknown;
  linearRampToValueAtTime?(value: number, time: number): unknown;
  exponentialRampToValueAtTime?(value: number, time: number): unknown;
  cancelScheduledValues?(time: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: unknown): unknown;
  disconnect?(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  detune?: AudioParamLike;
  onended: ((event: Event) => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  currentTime: number;
  destination: unknown;
  state?: string;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  resume?(): Promise<void> | void;
}

export interface GestureTarget {
  addEventListener(type: string, listener: (event: unknown) => void, options?: unknown): void;
  removeEventListener?(type: string, listener: (event: unknown) => void, options?: unknown): void;
}

export interface AudioEngineOptions {
  context?: AudioContextLike | null;
  audioContext?: AudioContextLike | null;
  volume?: number;
  muted?: boolean;
  maxVoices?: number;
  rng?: () => number;
  gestureTarget?: GestureTarget;
}

interface VoiceSpec {
  wave: WaveType;
  startHz: number;
  endHz: number;
  duration: number;
  gain: number;
  attack: number;
  endGain?: number;
  steps?: { at: number; hz: number }[];
}

type WaveType = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface ActiveVoice {
  endTime: number;
  gain: GainNodeLike;
  oscillator: OscillatorNodeLike;
}

const VOICE_SPECS: Record<VoiceName, VoiceSpec> = {
  spin: { wave: 'sawtooth', startHz: 210, endHz: 880, duration: 0.34, gain: 0.11, attack: 0.03 },
  reelStop: { wave: 'square', startHz: 460, endHz: 150, duration: 0.14, gain: 0.12, attack: 0.005 },
  peg: { wave: 'triangle', startHz: 960, endHz: 320, duration: 0.075, gain: 0.16, attack: 0.002 },
  split: { wave: 'triangle', startHz: 280, endHz: 980, duration: 0.13, gain: 0.14, attack: 0.004 },
  chute: { wave: 'sine', startHz: 520, endHz: 120, duration: 0.22, gain: 0.15, attack: 0.004 },
  lip: { wave: 'sine', startHz: 190, endHz: 72, duration: 0.19, gain: 0.17, attack: 0.003 },
  gutter: { wave: 'sawtooth', startHz: 150, endHz: 54, duration: 0.3, gain: 0.12, attack: 0.006 },
  surge: { wave: 'sawtooth', startHz: 76, endHz: 240, duration: 0.52, gain: 0.13, attack: 0.05 },
  fever: { wave: 'triangle', startHz: 310, endHz: 1240, duration: 0.46, gain: 0.15, attack: 0.01 },
  buy: { wave: 'sine', startHz: 660, endHz: 990, duration: 0.24, gain: 0.13, attack: 0.004, steps: [{ at: 0.11, hz: 990 }] },
  error: { wave: 'square', startHz: 180, endHz: 120, duration: 0.32, gain: 0.12, attack: 0.005, steps: [{ at: 0.13, hz: 130 }] },
  boss: { wave: 'sawtooth', startHz: 58, endHz: 116, duration: 0.65, gain: 0.16, attack: 0.03 },
};

export const VOICE_NAMES = Object.freeze(Object.keys(VOICE_SPECS) as VoiceName[]);

export const EVENT_VOICE_MAP = {
  SpinStarted: 'spin',
  ReelStopped: 'reelStop',
  PegHit: 'peg',
  OrbSplit: 'split',
  ChuteExit: 'chute',
  LipDrop: 'lip',
  GutterLoss: 'gutter',
  SurgeStarted: 'surge',
  SurgeEnded: 'surge',
  FeverTriggered: 'fever',
  ItemBought: 'buy',
  BossSabotage: 'error',
  BossScored: 'boss',
} as const satisfies Partial<Record<GameEvent['t'], VoiceName>>;

export function voiceForEvent(event: Pick<GameEvent, 't'>): VoiceName | null {
  const map: Partial<Record<string, VoiceName>> = EVENT_VOICE_MAP;
  return map[event.t] ?? null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function defaultAudioContext(): AudioContextLike | null {
  const scope = globalThis as typeof globalThis & {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function setParam(param: AudioParamLike | undefined, value: number, time: number): void {
  if (!param) return;
  param.value = value;
  param.setValueAtTime?.(value, time);
}

function rampParam(param: AudioParamLike | undefined, from: number, to: number, start: number, end: number): void {
  if (!param) return;
  param.value = from;
  if (param.setValueAtTime) param.setValueAtTime(from, start);
  if (param.linearRampToValueAtTime) {
    param.linearRampToValueAtTime(to, end);
  } else if (param.exponentialRampToValueAtTime && from > 0 && to > 0) {
    param.exponentialRampToValueAtTime(to, end);
  } else {
    param.value = to;
  }
}

export class AudioEngine {
  private readonly ctx: AudioContextLike | null;
  private readonly master: GainNodeLike | null;
  private readonly voices = new Set<ActiveVoice>();
  private readonly rng: () => number;
  private readonly voiceLimit: number;
  private volumeValue: number;
  private mutedValue: boolean;
  private unlockedValue = false;
  private unlockPromise: Promise<void> | null = null;
  private gestureCleanup: (() => void) | null = null;

  constructor(options: AudioEngineOptions = {}) {
    const injected = options.context === undefined ? options.audioContext : options.context;
    this.ctx = injected === undefined ? defaultAudioContext() : injected;
    this.rng = options.rng ?? Math.random;
    this.voiceLimit = Math.max(1, Math.floor(options.maxVoices ?? 16));
    this.volumeValue = clamp01(options.volume ?? 0.8);
    this.mutedValue = options.muted ?? false;
    this.master = this.ctx ? this.ctx.createGain() : null;
    if (this.master && this.ctx) {
      this.master.connect(this.ctx.destination);
      this.applyMasterGain();
    }
    if (options.gestureTarget) this.attachFirstGesture(options.gestureTarget);
  }

  get context(): AudioContextLike | null {
    return this.ctx;
  }

  get masterGain(): GainNodeLike | null {
    return this.master;
  }

  get volume(): number {
    return this.volumeValue;
  }

  get muted(): boolean {
    return this.mutedValue;
  }

  get unlocked(): boolean {
    return this.unlockedValue;
  }

  get maxVoices(): number {
    return this.voiceLimit;
  }

  get activeVoices(): number {
    if (this.ctx) this.prune(this.ctx.currentTime);
    return this.voices.size;
  }

  setVolume(volume: number): void {
    this.volumeValue = clamp01(volume);
    this.applyMasterGain();
  }

  setMuted(muted: boolean): void {
    this.mutedValue = muted;
    this.applyMasterGain();
  }

  async unlock(): Promise<void> {
    this.unlockedValue = true;
    if (!this.ctx?.resume) return;
    if (!this.unlockPromise) {
      this.unlockPromise = Promise.resolve(this.ctx.resume()).then(
        () => undefined,
        () => undefined,
      );
    }
    await this.unlockPromise;
  }

  attachFirstGesture(target: GestureTarget): () => void {
    this.detachGesture();
    const types = ['pointerdown', 'keydown', 'click', 'touchend'];
    const handler = (): void => {
      this.detachGesture();
      void this.unlock();
    };
    for (const type of types) target.addEventListener(type, handler, { passive: true });
    const cleanup = (): void => {
      for (const type of types) target.removeEventListener?.(type, handler, { passive: true });
      if (this.gestureCleanup === cleanup) this.gestureCleanup = null;
    };
    this.gestureCleanup = cleanup;
    return cleanup;
  }

  playEvent(event: GameEvent): boolean {
    const voice = voiceForEvent(event);
    return voice ? this.play(voice) : false;
  }

  playEvents(events: readonly GameEvent[]): number {
    let played = 0;
    for (const event of events) if (this.playEvent(event)) played += 1;
    return played;
  }

  handleEvent(event: GameEvent): boolean {
    return this.playEvent(event);
  }

  handleEvents(events: readonly GameEvent[]): number {
    return this.playEvents(events);
  }

  play(voice: VoiceName): boolean {
    if (!this.ctx || !this.master || this.mutedValue) return false;
    const spec = VOICE_SPECS[voice];
    const now = this.ctx.currentTime;
    this.prune(now);
    if (this.voices.size >= this.voiceLimit) return false;

    const pitch = 1 + (this.rng() * 2 - 1) * 0.12;
    const gain = this.ctx.createGain();
    const osc = this.ctx.createOscillator();
    const endTime = now + spec.duration;

    osc.type = spec.wave;
    rampParam(osc.frequency, spec.startHz * pitch, spec.endHz * pitch, now, endTime);
    for (const step of spec.steps ?? []) setParam(osc.frequency, step.hz * pitch, now + step.at);

    const attackEnd = now + Math.min(spec.attack, spec.duration * 0.5);
    setParam(gain.gain, 0, now);
    if (gain.gain.linearRampToValueAtTime) gain.gain.linearRampToValueAtTime(spec.gain, attackEnd);
    else gain.gain.value = spec.gain;
    if (gain.gain.linearRampToValueAtTime) gain.gain.linearRampToValueAtTime(spec.endGain ?? 0, endTime);
    else gain.gain.value = spec.endGain ?? 0;

    osc.connect(gain);
    gain.connect(this.master);

    const active: ActiveVoice = { endTime, gain, oscillator: osc };
    this.voices.add(active);
    osc.onended = () => this.release(active);
    osc.start(now);
    osc.stop(endTime);
    return true;
  }

  stopAll(): void {
    const now = this.ctx?.currentTime ?? 0;
    for (const voice of [...this.voices]) {
      try {
        voice.oscillator.stop(now);
      } catch {
        void 0;
      }
      this.release(voice);
    }
  }

  dispose(): void {
    this.detachGesture();
    this.stopAll();
  }

  private applyMasterGain(): void {
    if (!this.master) return;
    const gain = this.mutedValue ? 0 : this.volumeValue;
    this.master.gain.value = gain;
    this.master.gain.setValueAtTime?.(gain, this.ctx?.currentTime ?? 0);
  }

  private detachGesture(): void {
    const cleanup = this.gestureCleanup;
    this.gestureCleanup = null;
    cleanup?.();
  }

  private prune(now: number): void {
    for (const voice of [...this.voices]) if (voice.endTime <= now) this.release(voice);
  }

  private release(voice: ActiveVoice): void {
    if (!this.voices.delete(voice)) return;
    try {
      voice.gain.disconnect?.();
    } catch {
      void 0;
    }
  }
}

export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
  return new AudioEngine(options);
}

export { AudioEngine as AudioSynth };

export function createAudioSynth(options: AudioEngineOptions = {}): AudioEngine {
  return new AudioEngine(options);
}
