/** @jsxRuntime automatic */
import { useEffect, useRef } from 'react';
import type { GameCore, GameEvent } from '@jackpotsyndicate/contracts';
import { createAudioEngine, type AudioEngine, type GestureTarget } from '@jackpotsyndicate/audio';
import { Hud } from '../../components/Hud';
import { LogPanel } from '../../components/LogPanel';
import { SlotFrame } from '../../components/Artwork';
import { TrinketRail } from '../../components/TrinketRail';
import { MockGameCore, useGameStore } from '../../store/gameStore';
import { BoardView } from './BoardView';
import { CabinetStage } from './CabinetStage';
import { PrepControls } from './PrepControls';
import { SpeedControls } from './SpeedControls';
import { createTableCore, decorateCore } from './tableCore';

interface SubscribableCore extends GameCore {
  subscribe?(listener: (event: GameEvent) => void): () => void;
}

function isTestMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('test') === '1';
}

function isMock(core: GameCore): boolean {
  return core instanceof MockGameCore;
}

function useTableAudio(core: GameCore): AudioEngine | null {
  const audioRef = useRef<AudioEngine | null>(null);
  const mute = useGameStore((store) => store.settings.mute);
  const volume = useGameStore((store) => store.settings.volume);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const audio = createAudioEngine({
      volume,
      muted: mute,
      gestureTarget: window as unknown as GestureTarget,
    });
    audioRef.current = audio;
    const unsubscribe = (core as SubscribableCore).subscribe?.((event) => {
      audio.playEvent(event);
    });
    return () => {
      unsubscribe?.();
      audio.dispose();
      audioRef.current = null;
    };
  }, [core]);

  useEffect(() => {
    audioRef.current?.setMuted(mute);
    audioRef.current?.setVolume(volume);
  }, [mute, volume]);

  return audioRef.current;
}

/**
 * T-072 Table. The screen only reads the Zustand mirror and acts through
 * `dispatch`; the real GameCore is attached to the store in production, while
 * tests may attach any GameCore implementation before rendering.
 */
export function TableScreen() {
  const core = useGameStore((store) => store.core);
  const seed = useGameStore((store) => store.state.seed);
  const cols = useGameStore((store) => store.state.grid.cols);
  const rows = useGameStore((store) => store.state.grid.rows);
  const floorId = useGameStore((store) => store.state.floorId);
  const reducedMotion = useGameStore((store) => store.settings.reducedMotion);

  useEffect(() => {
    decorateCore(core);
    if (isTestMode() || !isMock(core)) return;
    const store = useGameStore.getState();
    const runSeed = store.state.seed || 'JACKPOT-SYNDICATE';
    const real = createTableCore({ seed: runSeed });
    real.dispatch({ c: 'NewRun', seed: runSeed });
    real.tick();
    store.attachCore(real);
  }, [core]);

  useTableAudio(core);

  const gutterRisk = floorRisk(floorId);

  return (
    <section className="screen table-screen" aria-labelledby="table-heading" data-core={core.constructor.name}>
      <TableStyle />
      <h1 className="sr-only" id="table-heading">Table</h1>
      <div className="table-layout">
        <div className="table-main">
          <Hud />
          <div className="table-stage">
            <SlotFrame>
              <CabinetStage
                core={core}
                seed={seed}
                cols={cols}
                rows={rows}
                reducedMotion={reducedMotion}
              />
            </SlotFrame>
            <BoardView core={core} floorId={floorId} gutterRisk={gutterRisk} />
          </div>
          <PrepControls />
        </div>
        <aside className="table-side">
          <TrinketRail />
          <SpeedControls />
          <LogPanel />
        </aside>
      </div>
    </section>
  );
}

function floorRisk(floorId: string): number {
  switch (floorId) {
    case 'FLOOR_CRYO':
      return 1.35;
    case 'FLOOR_FOUNDRY':
      return 0.65;
    case 'FLOOR_PENTHOUSE':
      return 1.15;
    default:
      return 1;
  }
}

function TableStyle() {
  return (
    <style>{`
      .table-stage { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
      .table-cabinet { min-width: 0; }
      .slot-frame { position: relative; width: 100%; aspect-ratio: 365 / 343; min-width: 0; }
      .slot-frame-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; z-index: 0; filter: drop-shadow(0 18px 35px #0008); }
      .slot-frame-window { position: absolute; left: 12.6%; top: 25.7%; width: 71.8%; height: 44.3%; display: flex; align-items: center; justify-content: center; overflow: hidden; z-index: 1; }
      .slot-frame-window .table-cabinet { position: absolute; inset: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
      .slot-frame-window .jsa-root { width: 100%; height: 100%; }
      .slot-frame-window .jsa-cabinet { position: absolute; inset: 0; width: auto; height: auto; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; display: flex; align-items: center; justify-content: center; }
      .slot-frame-window .jsa-cabinet-header, .slot-frame-window .jsa-bezel-rail { display: none; }
      .slot-frame-window .jsa-reel-window { width: 100% !important; height: 100% !important; max-width: none; aspect-ratio: auto !important; border: 0; border-radius: 0; box-shadow: none; }
      .table-board { min-width: 0; padding: 12px; }
      .table-board-heading { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; color: var(--color-muted); font-family: var(--font-mono); font-size: .72rem; }
      .table-board-svg { display: block; width: 100%; height: auto; aspect-ratio: 600 / 510; border-radius: 10px; background: #07090e; border: 1px solid rgba(251,191,36,.16); }
      .prep-controls, .speed-panel { padding: 14px; }
      .prep-row { display: grid; gap: 8px; padding: 10px 0; border-top: 1px solid rgba(148,163,184,.1); }
      .prep-row:first-of-type { border-top: 0; }
      .prep-label { display: flex; flex-direction: column; gap: 2px; }
      .prep-label span { color: var(--color-muted); font-size: .78rem; }
      .prep-options { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .prep-select { min-width: 180px; }
      .prep-feedback { margin: 8px 0 0; color: var(--color-muted); font-family: var(--font-mono); font-size: .74rem; }
      @media (min-width: 900px) { .table-stage { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
      .jsa-root { position: relative; isolation: isolate; color: #e9eef5; }
      .jsa-root * { box-sizing: border-box; }
      .jsa-cabinet { position: relative; width: 100%; padding: 3.3%; border: 1px solid #8e702c; border-radius: 18px; background: linear-gradient(125deg,#30343b,#101521 22%,#0b1019 65%,#3d3123); box-shadow: inset 0 0 0 7px #151c29, 0 18px 70px #0009; }
      .jsa-cabinet-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 1% 1% 3.4%; color: #fbbf24; font-family: var(--font-display); font-weight: 700; letter-spacing: .18em; }
      .jsa-reel-window { position: relative; width: 100%; background: #07090e; border: 2px solid #5b4729; border-radius: 6px; box-shadow: inset 0 0 25px #000; overflow: hidden; }
      .jsa-layer { position: absolute; inset: 0; pointer-events: none; }
      .jsa-cell { position: absolute; padding: 3%; border: 1px solid #36415570; display: grid; place-items: center; background: radial-gradient(ellipse at 50% 20%,#23314880,transparent 80%); }
      .jsa-symbol { width: 100%; height: 100%; position: relative; display: grid; place-items: center; }
      .jsa-sprite { display: block; width: 100%; height: 100%; overflow: hidden; }
      .jsa-symbol > .jsa-sprite { max-width: 92%; max-height: 92%; filter: drop-shadow(0 3px 5px #000a); }
      .jsa-cell-glow { position: absolute; inset: 5%; border: 2px solid #fbbf24; border-radius: 12%; box-shadow: 0 0 18px #fbbf2466; background: #fbbf2419; }
      .jsa-streams { z-index: 2; overflow: hidden; }
      .jsa-reel-stream { position: absolute; top: 0; height: 100%; }
      .jsa-stream-symbol { position: absolute; width: 100%; padding: 12%; display: grid; place-items: center; }
      .jsa-duration { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
      .jsa-bezel-rail { min-height: 12px; margin-top: 3.4%; border: 1px solid #594727; border-radius: 3px; background: linear-gradient(90deg,#0a111c,#233047,#0a111c); }
      .jsa-relayout-previous { position: absolute; left: 0; top: 0; pointer-events: none; }
    `}</style>
  );
}

export default TableScreen;
