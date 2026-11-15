import type { Command, GameCore, Phase, TestApi } from '@jackpotsyndicate/contracts';
import { useGameStore } from './store/gameStore';

declare global {
  interface Window {
    __JS_TEST__?: TestApi;
  }
}

type GrantableCore = GameCore & { grantCash?: (amount: number) => void };

/**
 * C-8 test bridge. Present only when the page is opened with ?test=1 (or when
 * the preview/e2e build enables VITE_ENABLE_TEST_API). The bridge drives the
 * same store the UI reads, so assertions see exactly what the shell sees.
 */
export function createTestApi(core: GameCore = useGameStore.getState().core): TestApi {
  const ensure = () => {
    const store = useGameStore.getState();
    if (store.core !== core) store.attachCore(core);
  };

  return {
    newRun(seed: string): void {
      ensure();
      useGameStore.getState().newRun(seed);
    },

    dispatch(cmd: Command): ReturnType<GameCore['dispatch']> {
      ensure();
      return useGameStore.getState().dispatch(cmd);
    },

    async runUntil(
      target: Phase | ((targetCore: GameCore) => boolean),
      maxTicks: number,
    ): Promise<boolean> {
      ensure();
      const reached = () => {
        if (typeof target === 'function') return target(core);
        return core.getState().phase === target;
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
      return core.getState();
    },

    stateHash(): string {
      return core.stateHash();
    },

    setSpeed(multiplier: number): void {
      useGameStore.getState().setSpeed(multiplier);
    },

    grantCash(amount: number): void {
      ensure();
      const grantable = core as GrantableCore;
      if (typeof grantable.grantCash === 'function') {
        grantable.grantCash(amount);
        useGameStore.setState({ state: core.getState() });
        return;
      }
      const state = core.getState();
      useGameStore.setState({ state: { ...state, bankroll: state.bankroll + amount } });
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
