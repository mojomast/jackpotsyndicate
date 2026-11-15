import { useEffect } from 'react';
import {
  SAVE_VERSION,
  STORAGE_KEYS,
  saveFileSchema,
  type CommandResult,
  type GameCore,
  type Phase,
  type RunState,
  type SaveFile,
} from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { phaseLabel } from './navigation';

export const SAVE_STORAGE_KEY = STORAGE_KEYS.save;

const NON_RESUMABLE_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  'TITLE',
  'GAME_OVER',
  'VICTORY',
  'SPINNING',
  'RESOLVING',
]);

const BOUNDARY_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  'PREP',
  'ROUND_RESULT',
  'SHOP',
  'BOSS_INTRO',
  'RELIC_PICK',
  'JUMPER_PICK',
  'ELEVATOR',
  'FLOOR_TRANSITION',
  'GAME_OVER',
  'VICTORY',
]);

export interface StoredSaveResult {
  save: SaveFile | null;
  notice: string | null;
}

export interface SaveSummary {
  seed: string;
  phase: Phase;
  phaseLabel: string;
  floorId: RunState['floorId'];
  round: number;
  bankroll: number;
  tick: number;
  resumable: boolean;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Autosave at phase boundaries (R-RUN-07). Never mutates game state. */
export function saveCore(core: GameCore = useGameStore.getState().core): SaveFile | null {
  const store = storage();
  if (store === null) return null;
  // A spin's in-flight schedule lives beside RunState, not inside it, so
  // SPINNING/RESOLVING reload into a phase no command can leave. Picker
  // phases are durable: RunState keeps pendingRelics / pendingJumpers and the
  // core re-sends the offer on load. ROUND_SETTLE re-arms its countdown.
  const phase = core.getState().phase;
  if (phase === 'SPINNING' || phase === 'RESOLVING') {
    return null;
  }
  try {
    const save = core.save();
    store.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
    return save;
  } catch {
    return null;
  }
}

/**
 * Read and validate the versioned save. Invalid or stale saves are discarded
 * and reported so the resume prompt can show the notice required by R-RUN-07.
 */
export function readStoredSave(): StoredSaveResult {
  const store = storage();
  if (store === null) return { save: null, notice: null };
  const raw = store.getItem(SAVE_STORAGE_KEY);
  if (raw === null || raw.length === 0) return { save: null, notice: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    store.removeItem(SAVE_STORAGE_KEY);
    return { save: null, notice: 'Saved run was unreadable and has been discarded.' };
  }

  const decoded = saveFileSchema.safeParse(parsed);
  if (!decoded.success) {
    store.removeItem(SAVE_STORAGE_KEY);
    return { save: null, notice: 'Saved run failed validation and has been discarded.' };
  }

  if (
    decoded.data.saveVersion !== SAVE_VERSION ||
    decoded.data.run.saveVersion !== SAVE_VERSION
  ) {
    store.removeItem(SAVE_STORAGE_KEY);
    return {
      save: null,
      notice: `Saved run uses save version ${decoded.data.saveVersion}; this build expects ${SAVE_VERSION}.`,
    };
  }

  return { save: decoded.data, notice: null };
}

export function discardStoredSave(): void {
  const store = storage();
  store?.removeItem(SAVE_STORAGE_KEY);
}

export function summariseSave(save: SaveFile): SaveSummary {
  return {
    seed: save.run.seed,
    phase: save.run.phase,
    phaseLabel: phaseLabel(save.run.phase),
    floorId: save.run.floorId,
    round: save.run.round,
    bankroll: save.run.bankroll,
    tick: save.run.tick,
    resumable: !NON_RESUMABLE_PHASES.has(save.run.phase),
  };
}

/** Load a validated save through GameCore.load and mirror it back into the store. */
export function resumeFromSave(save: SaveFile): CommandResult {
  const store = useGameStore.getState();
  const core = store.core;
  let result: CommandResult;
  try {
    result = core.load(save);
  } catch {
    return { ok: false, error: 'INVALID_TARGET' };
  }
  if (!result.ok) return result;
  store.attachCore(core);
  return { ok: true };
}

/** Forget the run: discard the save and park a fresh core in TITLE. */
export function forgetRun(): void {
  discardStoredSave();
  useGameStore.getState().resetCore();
}

/**
 * Persist the current phase boundary once per phase change. Components on the
 * table, shop, boss, elevator and result screens mount this so a reload always
 * resumes from the last safe boundary.
 */
export function useMetaAutosave(): void {
  const core = useGameStore((store) => store.core);
  const phase = useGameStore((store) => store.state.phase);

  useEffect(() => {
    if (!BOUNDARY_PHASES.has(phase)) return;
    saveCore(core);
  }, [core, phase]);
}

/** Save immediately before navigating away from a boundary. */
export function checkpoint(): void {
  saveCore();
}
