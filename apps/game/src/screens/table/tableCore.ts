import { createGameCore, type GameCoreOptions } from '@jackpotsyndicate/core';
import type {
  CommandResult,
  GameCore,
  GameEvent,
  RunState,
} from '@jackpotsyndicate/contracts';

export interface TableTestHooks {
  /** C-8 test surface helper, available on the real core used by the Table. */
  grantCash?(amount: number): void;
  /** Test-only setup helper: mount a trinket on the current run. */
  mountTrinket?(itemId: string): void;
}

export type TableCore = GameCore & TableTestHooks;

interface CoreInternals {
  emit?: (event: Omit<GameEvent, 'tick'> | GameEvent) => GameEvent;
}

function mutableState(core: GameCore): RunState {
  return core.getState() as RunState;
}

/**
 * Attach C-8 test hooks to a real GameCore. `grantCash` is part of the frozen
 * test API contract; the production core intentionally has no cheat command,
 * so the bridge sets the test bankroll directly through the core instance.
 */
export function decorateCore<T extends GameCore>(core: T): T & TableTestHooks {
  const target = core as T & TableTestHooks & CoreInternals;

  if (typeof target.grantCash !== 'function') {
    target.grantCash = (amount: number): void => {
      if (!Number.isFinite(amount)) return;
      const state = mutableState(core);
      state.bankroll += amount;
      target.emit?.({
        t: 'BankrollChanged',
        delta: amount,
        total: state.bankroll,
        reason: 'bonus',
      } as GameEvent);
    };
  }

  if (typeof target.mountTrinket !== 'function') {
    target.mountTrinket = (itemId: string): void => {
      if (typeof itemId !== 'string' || itemId.length === 0) return;
      const state = mutableState(core);
      state.trinkets.push(itemId);
      target.emit?.({
        t: 'TrinketMounted',
        itemId,
        count: state.trinkets.filter((id) => id === itemId).length,
      } as GameEvent);
    };
  }

  return target;
}

/** A real GameCore with the Table's C-8 test hooks attached. */
export function createTableCore(options: GameCoreOptions = {}): TableCore {
  return decorateCore(createGameCore(options));
}

/** Result of a command that the Table can surface without touching state. */
export interface CommandFeedback {
  ok: boolean;
  message: string;
}

export function feedbackFor(result: CommandResult, success: string): CommandFeedback {
  return result.ok
    ? { ok: true, message: success }
    : { ok: false, message: result.error.replaceAll('_', ' ') };
}
