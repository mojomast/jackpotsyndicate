import { create } from 'zustand';
import { createGameCore } from '@jackpotsyndicate/core';
import {
  DEFAULT_CHUTE_MULTS,
  STORAGE_KEYS,
  type Command,
  type CommandResult,
  type FloorId,
  type GameCore,
  type GameEvent,
  type RoundResult,
  type RunState,
} from '@jackpotsyndicate/contracts';

/**
 * The store owns the real GameCore from boot. React reads a snapshot of its
 * RunState and acts only through `dispatch`; nothing here mutates core state.
 * Tests may swap in any GameCore implementation with `attachCore` (the
 * scripted MockGameCore lives in apps/game/tests/helpers, never in this bundle).
 */

export const FLOOR_LABELS: Record<FloorId, string> = {
  FLOOR_NEON: 'Neon Vault',
  FLOOR_CRYO: 'Cryo-Freezer Lounge',
  FLOOR_FOUNDRY: "Smuggler's Blast Foundry",
  FLOOR_PENTHOUSE: 'Velvet Penthouse',
};

export function formatCash(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}$${Math.abs(rounded).toLocaleString('en-US')}`;
}

export function formatSymbol(symbolId: string): string {
  return symbolId.charAt(0).toUpperCase() + symbolId.slice(1);
}

/**
 * Brand for GameCore test doubles. Production never constructs one; the
 * test-only MockGameCore (apps/game/tests/helpers/mockGameCore.ts) extends it,
 * so `core instanceof MockGameCore` is false for every core the game boots.
 */
export abstract class MockGameCore {}

/** A fresh production GameCore, parked in TITLE until a run starts. */
export function createRuntimeCore(seed?: string): GameCore {
  return createGameCore(seed === undefined ? {} : { seed });
}

function cloneState(state: RunState): RunState {
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as RunState;
}

/**
 * GameCore may return its live internal state (the real engine does). Zustand
 * only re-renders subscribers when the selected value changes identity, so the
 * store must snapshot every read. Without this, a real core's bankroll, phase
 * and quota updates are invisible to React even though the engine advanced.
 */
function snapshotState(core: GameCore): RunState {
  return cloneState(core.getState() as RunState);
}

/**
 * The real engine keeps the settled verdict beside the run and only persists it
 * in SaveFile. Read it when attaching so a reloaded ROUND_RESULT screen shows
 * the actual outcome instead of re-guessing from bankroll after tribute.
 */
function lastResultFromCore(core: GameCore): RoundResult | null {
  try {
    return core.save().lastResult ?? null;
  } catch {
    return null;
  }
}

type SpinEvalEvent = Extract<GameEvent, { t: 'SpinEvaluated' }>;

// ------------------------------------------------------------------ store
export type Speed = 1 | 2 | 4;

export interface Settings {
  mute: boolean;
  volume: number;
  reducedMotion: boolean;
  speed: Speed;
}

const DEFAULT_SETTINGS: Settings = {
  mute: false,
  volume: 0.6,
  reducedMotion: false,
  speed: 1,
};

function systemPrefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

function readSettings(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEYS.settings);
    if (!raw) return { ...DEFAULT_SETTINGS, reducedMotion: systemPrefersReducedMotion() };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      mute: Boolean(parsed.mute),
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_SETTINGS.volume,
      reducedMotion: Boolean(parsed.reducedMotion),
      speed: parsed.speed === 4 ? 4 : parsed.speed === 2 ? 2 : 1,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(settings: Settings): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode, file://); settings stay in memory.
  }
}

export interface GameStore {
  core: GameCore;
  state: RunState;
  events: GameEvent[];
  lastResult: RoundResult | null;
  lastSpin: SpinEvalEvent | null;
  lastDropMult: number;
  settings: Settings;
  /** Replace the core (tests, replays, the e2e harness). */
  attachCore(core: GameCore): void;
  /** Drop the current run: boot a fresh production core parked in TITLE. */
  resetCore(): void;
  /** Re-mirror the core's state without ticking (after out-of-band test hooks). */
  refresh(): void;
  /** Start a run on the current core (NewRun is a command, never a core swap). */
  newRun(seed: string): void;
  dispatch(cmd: Command): CommandResult;
  tick(): GameEvent[];
  setSettings(patch: Partial<Settings>): void;
  toggleMute(): void;
  toggleMotion(): void;
  setSpeed(speed: number): void;
}

const initialCore = createRuntimeCore();

export const useGameStore = create<GameStore>((set, get) => ({
  core: initialCore,
  state: snapshotState(initialCore),
  events: [],
  lastResult: null,
  lastSpin: null,
  lastDropMult: 1,
  settings: readSettings(),

  attachCore(core) {
    set({
      core,
      state: snapshotState(core),
      events: [],
      lastResult: lastResultFromCore(core),
      lastSpin: null,
      lastDropMult: 1,
    });
  },

  resetCore() {
    get().attachCore(createRuntimeCore());
  },

  refresh() {
    set({ state: snapshotState(get().core) });
  },

  newRun(seed) {
    const core = get().core;
    const result = core.dispatch({ c: 'NewRun', seed });
    if (!result.ok) return;
    const events = core.tick();
    set({
      state: snapshotState(core),
      events,
      lastResult: null,
      lastSpin: null,
      lastDropMult: 1,
    });
  },

  dispatch(cmd) {
    const core = get().core;
    const result = core.dispatch(cmd);
    if (cmd.c === 'NewRun' && result.ok) {
      const events = core.tick();
      set({ state: snapshotState(core), events, lastResult: null, lastSpin: null, lastDropMult: 1 });
      return result;
    }
    set({
      state: snapshotState(core),
      // A new spin begins a new round; never let the result screen show the
      // previous round's verdict while the new spin is in flight.
      ...(cmd.c === 'Spin' && result.ok ? { lastResult: null } : {}),
    });
    return result;
  },

  tick() {
    const core = get().core;
    const incoming = core.tick();
    const previous = get();
    let lastSpin = previous.lastSpin;
    let lastResult = previous.lastResult;
    let lastDropMult = previous.lastDropMult;

    for (const event of incoming) {
      if (event.t === 'SpinEvaluated') lastSpin = event;
      if (event.t === 'RoundSettled') lastResult = event.result;
      if (event.t === 'ChuteExit') lastDropMult = DEFAULT_CHUTE_MULTS[event.chute] ?? 1;
    }

    const events = incoming.length > 0
      ? [...previous.events, ...incoming].slice(-250)
      : previous.events;

    set({ state: snapshotState(core), events, lastResult, lastSpin, lastDropMult });
    return incoming;
  },

  setSettings(patch) {
    const settings: Settings = {
      ...get().settings,
      ...patch,
      volume: Math.min(1, Math.max(0, patch.volume ?? get().settings.volume)),
      speed: patch.speed === 4 ? 4 : patch.speed === 2 ? 2 : patch.speed === 1 ? 1 : get().settings.speed,
    };
    persistSettings(settings);
    set({ settings });
  },

  toggleMute() {
    get().setSettings({ mute: !get().settings.mute });
  },

  toggleMotion() {
    get().setSettings({ reducedMotion: !get().settings.reducedMotion });
  },

  setSpeed(speed) {
    get().setSettings({ speed: speed >= 4 ? 4 : speed >= 2 ? 2 : 1 });
  },
}));

export function startGameLoop(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let cancelled = false;
  let timer = 0;

  const loop = () => {
    if (cancelled) return;
    const speed = useGameStore.getState().settings.speed;
    useGameStore.getState().tick();
    timer = window.setTimeout(loop, Math.max(4, 1000 / (60 * speed)));
  };

  timer = window.setTimeout(loop, 16);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
