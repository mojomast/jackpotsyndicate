import {
  SAVE_VERSION,
  STORAGE_KEYS,
  saveFileSchema,
  type GameCore,
  type Phase,
  type SaveFile,
} from '@jackpotsyndicate/contracts';

const RESUMABLE_BOUNDARIES: ReadonlySet<Phase> = new Set<Phase>([
  'PREP',
  'ROUND_RESULT',
  'SHOP',
  'BOSS_INTRO',
  'RELIC_PICK',
  'JUMPER_PICK',
  'ELEVATOR',
  'FLOOR_TRANSITION',
]);

// RELIC_PICK and JUMPER_PICK keep their dealt offers in RunState
// (pendingRelics / pendingJumpers) and re-send them on load, so a save there
// resumes into the same offer.
const RESUMABLE_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  ...RESUMABLE_BOUNDARIES,
  // RunMachine.resumeTimers re-arms settleRemaining, so this phase is durable.
  'ROUND_SETTLE',
]);

export type SaveRecoveryStatus = 'preserved' | 'created' | 'discarded' | 'unavailable';

export interface SaveRecovery {
  status: SaveRecoveryStatus;
  notice: string;
  save: SaveFile | null;
  canResume: boolean;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function validSave(raw: string | null): SaveFile | null {
  if (raw === null || raw.length === 0) return null;
  try {
    const decoded = saveFileSchema.safeParse(JSON.parse(raw));
    if (!decoded.success) return null;
    if (
      decoded.data.saveVersion !== SAVE_VERSION ||
      decoded.data.run.saveVersion !== SAVE_VERSION
    ) {
      return null;
    }
    return decoded.data;
  } catch {
    return null;
  }
}

function resumeFlag(save: SaveFile): boolean {
  return RESUMABLE_PHASES.has(save.run.phase) && save.run.phase !== 'GAME_OVER' && save.run.phase !== 'VICTORY';
}

function writeBoundarySave(core: GameCore, store: Storage): SaveFile | null {
  try {
    const state = core.getState();
    if (!RESUMABLE_BOUNDARIES.has(state.phase)) return null;
    const candidate = core.save();
    const decoded = saveFileSchema.safeParse(candidate);
    if (!decoded.success) return null;
    if (
      decoded.data.saveVersion !== SAVE_VERSION ||
      decoded.data.run.saveVersion !== SAVE_VERSION
    ) {
      return null;
    }
    store.setItem(STORAGE_KEYS.save, JSON.stringify(candidate));
    return decoded.data;
  } catch {
    return null;
  }
}

export function recoverSaveAfterError(core: GameCore): SaveRecovery {
  const store = storage();
  if (store === null) {
    return {
      status: 'unavailable',
      notice: 'Local storage is unavailable. The in-memory run was not touched and no save was written.',
      save: null,
      canResume: false,
    };
  }

  const existing = validSave(store.getItem(STORAGE_KEYS.save));
  if (existing !== null) {
    return {
      status: 'preserved',
      notice: `The last valid autosave from ${existing.run.phase.replaceAll('_', ' ')} was preserved.`,
      save: existing,
      canResume: resumeFlag(existing),
    };
  }

  if (store.getItem(STORAGE_KEYS.save) !== null) {
    store.removeItem(STORAGE_KEYS.save);
    const created = writeBoundarySave(core, store);
    if (created !== null) {
      return {
        status: 'created',
        notice: 'The damaged save was discarded and a fresh phase-boundary save was written.',
        save: created,
        canResume: true,
      };
    }
    return {
      status: 'discarded',
      notice: 'The damaged save was discarded. No resume data remains.',
      save: null,
      canResume: false,
    };
  }

  const created = writeBoundarySave(core, store);
  if (created !== null) {
    return {
      status: 'created',
      notice: 'A fresh save was written at the current phase boundary.',
      save: created,
      canResume: true,
    };
  }

  return {
    status: 'discarded',
    notice: 'No safe phase boundary was available, so nothing was written.',
    save: null,
    canResume: false,
  };
}
