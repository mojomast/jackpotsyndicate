import type { Command, GameCore, Phase, TestApi } from '@jackpotsyndicate/contracts';
import { useGameStore } from './store/gameStore';
import { decorateCore } from './screens/table/tableCore';

declare global {
  interface Window {
    __JS_TEST__?: TestApi;
  }
}

/** The core the shell is showing right now; never a reference captured earlier. */
function currentCore(): GameCore {
  return useGameStore.getState().core;
}

/**
 * C-8 test bridge. Present only in development builds opened with ?test=1 (or
 * when the preview/e2e build enables VITE_ENABLE_TEST_API). The bridge drives
 * the same store the UI reads, so assertions see exactly what the shell sees.
 *
 * Every call resolves the store's *current* core. Passing `core` attaches it
 * to the store first (the e2e harness and tests use this to install a core
 * with custom content); later `attachCore`, `resetCore` or resume calls are
 * followed automatically.
 */
export function createTestApi(core?: GameCore): TestApi {
  if (core !== undefined && useGameStore.getState().core !== core) {
    useGameStore.getState().attachCore(core);
  }

  return {
    newRun(seed: string): void {
      useGameStore.getState().newRun(seed);
    },

    dispatch(cmd: Command): ReturnType<GameCore['dispatch']> {
      return useGameStore.getState().dispatch(cmd);
    },

    async runUntil(
      target: Phase | ((targetCore: GameCore) => boolean),
      maxTicks: number,
    ): Promise<boolean> {
      const reached = () => {
        const live = currentCore();
        if (typeof target === 'function') return target(live);
        return live.getState().phase === target;
      };

      let ticks = 0;
      while (ticks < maxTicks) {
        if (reached()) return true;
        useGameStore.getState().tick();
        ticks += 1;
        if (ticks % 120 === 0) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
          });
        }
      }
      return reached();
    },

    getState(): ReturnType<GameCore['getState']> {
      return currentCore().getState();
    },

    stateHash(): string {
      return currentCore().stateHash();
    },

    setSpeed(multiplier: number): void {
      useGameStore.getState().setSpeed(multiplier);
    },

    grantCash(amount: number): void {
      // decorateCore keeps a core's own grantCash (the test mock has one) and
      // otherwise attaches the C-8 hook to the real core.
      decorateCore(currentCore()).grantCash?.(amount);
      useGameStore.getState().refresh();
    },
  };
}

export function installTestApi(core?: GameCore): TestApi {
  const api = createTestApi(core);
  if (typeof window !== 'undefined') window.__JS_TEST__ = api;
  return api;
}

export function isTestMode(search?: string): boolean {
  if (typeof window === 'undefined' && search === undefined) return false;
  const query = search ?? window.location.search;
  return new URLSearchParams(query).get('test') === '1';
}

export type { TestApi };
