/** @jsxRuntime automatic */
import { useEffect, useRef } from 'react';
import {
  ANIM_TICKS,
  DESIGN_TOKENS,
  type GameCore,
  type GameEvent,
  type GridRelayoutParams,
  type LineWinParams,
  type ReelSpinParams,
  type SpriteResolver,
  type SymbolId,
  type TumbleStepParams,
} from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { createCabinet, setCabinetGrid } from '../../../../../packages/anim/src/runtime/cabinet';
import { TimelinePlayer } from '../../../../../packages/anim/src/runtime/TimelinePlayer';
import { gridRelayout } from '../../../../../packages/anim/src/reels/gridRelayout';
import { lineWin } from '../../../../../packages/anim/src/reels/lineWin';
import { reelSpin } from '../../../../../packages/anim/src/reels/reelSpin';
import { tumbleStep } from '../../../../../packages/anim/src/reels/tumbleStep';

const SPRITES: SpriteResolver = () => null;

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

interface SubscribableCore extends GameCore {
  subscribe?(listener: (event: GameEvent) => void): () => void;
}

export interface CabinetStageProps {
  core: GameCore;
  seed: string;
  cols: number;
  rows: number;
  reducedMotion: boolean;
}

/**
 * The real C-6 cabinet. `packages/anim` builds every timeline paused; the
 * player below seeks it from the authoritative simulation tick, so 1x/2x/4x
 * speed changes wall-clock playback without changing simulation results.
 */
export function CabinetStage({ core, seed, cols, rows, reducedMotion }: CabinetStageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TimelinePlayer | null>(null);
  const relayoutRef = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const player = new TimelinePlayer();
    playerRef.current = player;

    const paint = (): void => {
      const state = core.getState();
      createCabinet(root, { cols: state.grid.cols, rows: state.grid.rows }, DESIGN_TOKENS, SPRITES);
      setCabinetGrid(root, state.grid.visible as SymbolId[][], DESIGN_TOKENS, SPRITES);
      root.dataset.animReady = 'true';
    };

    paint();

    const syncTick = (tick: number): void => {
      player.syncToTick(tick);
      if (relayoutRef.current !== null && tick >= relayoutRef.current) {
        relayoutRef.current = null;
        const state = core.getState();
        try {
          setCabinetGrid(root, state.grid.visible as SymbolId[][], DESIGN_TOKENS, SPRITES);
        } catch {
          // A resized grid is repainted by the dimension effect below.
        }
      }
    };

    const handleEvent = (event: GameEvent): void => {
      const state = core.getState();
      try {
        if (event.t === 'SpinStarted') {
          const params: ReelSpinParams = {
            cols: state.grid.cols,
            rows: state.grid.rows,
            finalGrid: state.grid.visible as SymbolId[][],
            frozenCells: state.grid.frozen.map((entry) => entry.cell),
            seed: hashSeed(state.seed),
            reducedMotion,
          };
          player.play(reelSpin(root, params, DESIGN_TOKENS, SPRITES), event.tick);
          relayoutRef.current = null;
          return;
        }
        if (event.t === 'SpinEvaluated') {
          const params: LineWinParams = {
            cols: state.grid.cols,
            rows: state.grid.rows,
            wins: event.wins.map((win) => ({
              cells: win.cells.map((cell) => [cell[0], cell[1]]),
              kind: win.kind,
              ...(win.overvolt === true ? { overvolt: true } : {}),
            })),
            reducedMotion,
          };
          player.play(lineWin(root, params, DESIGN_TOKENS, SPRITES), event.tick);
          return;
        }
        if (event.t === 'TumbleStep') {
          const params: TumbleStepParams = {
            cols: state.grid.cols,
            rows: state.grid.rows,
            cleared: event.cleared.map((cell) => [cell[0], cell[1]]),
            gridAfter: event.gridAfter as SymbolId[][],
            reducedMotion,
          };
          player.play(tumbleStep(root, params, DESIGN_TOKENS, SPRITES), event.tick);
          return;
        }
        if (event.t === 'GridMutated') {
          const params: GridRelayoutParams = {
            from: event.from,
            to: event.to,
            reducedMotion,
          };
          player.play(gridRelayout(root, params, DESIGN_TOKENS, SPRITES), event.tick);
          relayoutRef.current = event.tick + ANIM_TICKS.gridRelayout;
        }
      } catch {
        // Animation is a consumer; a missing anchor must never stop the sim.
      }
    };

    const unsubscribeCore = (core as SubscribableCore).subscribe?.(handleEvent);
    const unsubscribeStore = useGameStore.subscribe((state) => syncTick(state.state.tick));

    return () => {
      unsubscribeCore?.();
      unsubscribeStore();
      player.stop();
      playerRef.current = null;
      relayoutRef.current = null;
    };
  }, [core, reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const state = core.getState();
    try {
      createCabinet(root, { cols, rows }, DESIGN_TOKENS, SPRITES);
      setCabinetGrid(root, state.grid.visible as SymbolId[][], DESIGN_TOKENS, SPRITES);
      root.dataset.animReady = 'true';
    } catch {
      // The event-driven paint will retry on the next spin or relayout.
    }
  }, [core, cols, rows, seed]);

  return (
    <div className="table-cabinet" data-testid="cabinet" aria-label="Slot cabinet">
      <div ref={rootRef} data-anim="cabinet-root" />
    </div>
  );
}
