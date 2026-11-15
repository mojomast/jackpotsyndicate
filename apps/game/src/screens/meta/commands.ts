import type { Command, CommandResult, Phase } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { saveCore } from './persistence';

const PICKER_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  'RELIC_PICK',
  'JUMPER_PICK',
]);

/**
 * Dispatch a meta command through the store, then drain the core's queued
 * events into the store history. Pickers depend on `RelicsOffered` /
 * `JumpersOffered`, which are events rather than RunState fields.
 */
export function dispatchMeta(cmd: Command): CommandResult {
  const store = useGameStore.getState();
  const result = store.dispatch(cmd);
  if (!result.ok) return result;

  const after = useGameStore.getState();
  if (cmd.c !== 'NewRun' && PICKER_PHASES.has(after.state.phase)) {
    after.tick();
  }
  saveCore();
  return result;
}

/** NewRun deliberately restarts the core; it must go through the command path. */
export function startRun(seed: string): CommandResult {
  const result = dispatchMeta({ c: 'NewRun', seed });
  return result;
}
