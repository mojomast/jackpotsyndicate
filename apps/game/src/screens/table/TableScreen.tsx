/** @jsxRuntime automatic */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  ANIM_TICKS,
  DESIGN_TOKENS,
  type GameCore,
  type GameEvent,
} from '@jackpotsyndicate/contracts';
import { createAudioEngine, type AudioEngine, type GestureTarget } from '@jackpotsyndicate/audio';
import { Hud } from '../../components/Hud';
import { CascadeEquation } from '../../components/CascadeEquation';
import { LogPanel } from '../../components/LogPanel';
import { SlotFrame, SpriteImage } from '../../components/Artwork';
import { TrinketRail } from '../../components/TrinketRail';
import { formatCash, useGameStore } from '../../store/gameStore';
import { itemName } from '../meta/metaContent';
import { TimelinePlayer } from '../../../../../packages/anim/src/runtime/TimelinePlayer';
import { fever as feverScene } from '../../../../../packages/anim/src/scenes/fever';
import { BoardView } from './BoardView';
import { CabinetStage } from './CabinetStage';
import { PrepControls, coinSpriteKey, drinkSpriteKey } from './PrepControls';
import { SpinDeck } from './SpinDeck';
import { TABLE_CSS } from './table.styles';
import { subscribeCoreEvents, useCoreEvents } from './tableEvents';
import { decorateCore } from './tableCore';

interface SubscribableCore extends GameCore {
  subscribe?(listener: (event: GameEvent) => void): () => void;
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
 * Size the desktop cockpit to the viewport space the shell leaves for it, so
 * the table never scrolls at ≥ 1024 px. Everything after the table in the
 * shell (footer, gaps, padding) is measured, not assumed.
 */
function useCockpitHeight(ref: RefObject<HTMLElement | null>): void {
  const layoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
  layoutEffect(() => {
    const element = ref.current;
    if (!element || typeof window === 'undefined' || typeof getComputedStyle === 'undefined') return undefined;
    let frame = 0;
    const measure = (): void => {
      frame = 0;
      if (window.innerWidth < 1024) {
        element.style.removeProperty('--table-h');
        return;
      }
      const top = element.getBoundingClientRect().top + window.scrollY;
      let below = 0;
      let node: HTMLElement = element;
      while (node.parentElement && node !== document.body) {
        const parent = node.parentElement;
        const style = getComputedStyle(parent);
        const flow = style.display.includes('flex') || style.display.includes('grid');
        const gap = flow ? Number.parseFloat(style.rowGap) || 0 : 0;
        let sibling = node.nextElementSibling as HTMLElement | null;
        while (sibling) {
          const s = getComputedStyle(sibling);
          if (s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed') {
            below += sibling.offsetHeight + gap
              + (Number.parseFloat(s.marginTop) || 0) + (Number.parseFloat(s.marginBottom) || 0);
          }
          sibling = sibling.nextElementSibling as HTMLElement | null;
        }
        below += (Number.parseFloat(style.paddingBottom) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0);
        node = parent;
      }
      const height = Math.max(460, Math.floor(window.innerHeight - top - below - 1));
      element.style.setProperty('--table-h', `${height}px`);
    };
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(document.body);
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [ref]);
}

type Flash = { id: number; kind: 'fever' | 'big' | 'mega' | 'none' };

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
  const phase = useGameStore((store) => store.state.phase);
  const reducedMotion = useGameStore((store) => store.settings.reducedMotion);
  const screenRef = useRef<HTMLElement>(null);
  const [flash, setFlash] = useState<Flash>({ id: 0, kind: 'none' });

  useEffect(() => {
    // The store boots the real GameCore; only attach the C-8 test hooks here.
    decorateCore(core);
  }, [core]);

  useTableAudio(core);
  useCockpitHeight(screenRef);

  useCoreEvents(core, (event) => {
    if (event.t === 'FeverTriggered') {
      setFlash((current) => ({ id: current.id + 1, kind: 'fever' }));
    } else if (event.t === 'SpinEvaluated' && event.equity >= 1000) {
      setFlash((current) => ({ id: current.id + 1, kind: event.equity >= 5000 ? 'mega' : 'big' }));
    }
  });

  useEffect(() => {
    if (flash.kind === 'none' || typeof window === 'undefined') return undefined;
    const timer = window.setTimeout(() => setFlash((current) => (current.id === flash.id ? { ...current, kind: 'none' } : current)), flash.kind === 'fever' ? 2400 : 900);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const gutterRisk = floorRisk(floorId);

  return (
    <section
      ref={screenRef}
      className="screen table-screen"
      aria-labelledby="table-heading"
      data-core={core.constructor.name}
      data-phase={phase}
      data-flash={flash.kind}
      data-flash-id={flash.id % 2}
      data-reduced-motion={reducedMotion}
    >
      <TableStyle />
      <h1 className="sr-only" id="table-heading">Table</h1>
      <div className="table-top">
        <Hud />
        <LogPanel />
      </div>
      <div className="table-hero-wrap">
      <div className="table-hero">
        <div className="table-cabinet-col">
          <div className="cabinet-fit">
            <div className="cabinet-shell">
              <SlotFrame>
                <CabinetStage
                  core={core}
                  seed={seed}
                  cols={cols}
                  rows={rows}
                  reducedMotion={reducedMotion}
                />
              </SlotFrame>
              <CabinetConsole core={core} />
              <FeverOverlay core={core} reducedMotion={reducedMotion} />
            </div>
          </div>
        </div>
        <BoardView core={core} floorId={floorId} gutterRisk={gutterRisk} />
        <TrinketRail />
      </div>
      </div>
      <div className="table-console">
        <PrepControls />
        <CascadeEquation />
        <SpinDeck />
      </div>
    </section>
  );
}

const PHASE_LED: Record<string, string> = {
  PREP: 'Ready',
  SPINNING: 'Reels rolling',
  RESOLVING: 'Orbs in play',
  ROUND_SETTLE: 'Settling',
  ROUND_RESULT: 'Round over',
};

/**
 * Diegetic readouts on the cabinet base: the loaded coin and active drink sit
 * in the wooden side plates, and the tray LED calls the action.
 */
function CabinetConsole({ core }: { core: GameCore }) {
  const phase = useGameStore((store) => store.state.phase);
  const loadedCoin = useGameStore((store) => store.state.loadedCoin);
  const activeDrink = useGameStore((store) => store.state.activeDrink);
  const spinsLeft = useGameStore((store) => store.state.spinsLeft);
  const [message, setMessage] = useState<{ text: string; tone: string; id: number } | null>(null);

  useCoreEvents(core, (event) => {
    if (event.t === 'SpinEvaluated') {
      const lines = event.wins.length;
      setMessage((m) => ({
        id: (m?.id ?? 0) + 1,
        text: lines > 0 ? `${lines} win${lines === 1 ? '' : 's'} · ${event.orbPlan.length} orbs` : 'No line · 1 orb',
        tone: lines > 0 ? 'win' : 'idle',
      }));
    } else if (event.t === 'CashBanked' && event.cash > 0) {
      setMessage((m) => ({ id: (m?.id ?? 0) + 1, text: `Banked ${formatCash(event.cash)}`, tone: 'cash' }));
    } else if (event.t === 'IdleDrain') {
      setMessage((m) => ({ id: (m?.id ?? 0) + 1, text: `Skull drain −${formatCash(event.total)}`, tone: 'loss' }));
    } else if (event.t === 'OvervoltSet') {
      setMessage((m) => ({ id: (m?.id ?? 0) + 1, text: event.lineId ? `Overvolt ${event.lineId}` : 'Overvolt off', tone: 'win' }));
    } else if (event.t === 'GutterLoss') {
      setMessage((m) => ({ id: (m?.id ?? 0) + 1, text: 'Raked into the gutter', tone: 'loss' }));
    }
  });

  useEffect(() => {
    if (!message || typeof window === 'undefined') return undefined;
    const timer = window.setTimeout(() => setMessage((m) => (m?.id === message.id ? null : m)), 1800);
    return () => window.clearTimeout(timer);
  }, [message]);

  const idle = phase === 'PREP' ? `Ready · ${spinsLeft} spin${spinsLeft === 1 ? '' : 's'}` : PHASE_LED[phase] ?? phase.replaceAll('_', ' ');

  return (
    <div className="cabinet-console" aria-hidden="true">
      <span className="cabinet-plate cabinet-plate-left" title="Loaded coin">
        <SpriteImage spriteKey={coinSpriteKey(loadedCoin)} className="cabinet-plate-art" />
        <small>{itemName(loadedCoin).replace(/ Token$/, '')}</small>
      </span>
      <span className={`cabinet-led tone-${message?.tone ?? 'phase'}`} key={message?.id ?? phase}>
        {message?.text ?? idle}
      </span>
      <span className="cabinet-plate cabinet-plate-right" title="Active drink">
        {activeDrink ? (
          <>
            <SpriteImage spriteKey={drinkSpriteKey(activeDrink)} className="cabinet-plate-art" />
            <small>{itemName(activeDrink)}</small>
          </>
        ) : (
          <small className="cabinet-plate-empty">No drink</small>
        )}
      </span>
    </div>
  );
}

/** Plays the packages/anim `fever` scene over the cabinet, seeked from sim ticks. */
function FeverOverlay({ core, reducedMotion }: { core: GameCore; reducedMotion: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const player = new TimelinePlayer();
    let endTick = -1;
    const offEvents = subscribeCoreEvents(core, (event) => {
      if (event.t !== 'FeverTriggered') return;
      try {
        player.play(feverScene(root, { reducedMotion }, DESIGN_TOKENS, () => null), event.tick);
        endTick = event.tick + ANIM_TICKS.fever + 6;
        setActive(true);
      } catch {
        // Presentation only; the sim never waits on this.
      }
    });
    const offTick = useGameStore.subscribe((store) => {
      if (endTick < 0) return;
      player.syncToTick(store.state.tick);
      if (store.state.tick >= endTick) {
        endTick = -1;
        setActive(false);
      }
    });
    return () => {
      offEvents();
      offTick();
      player.stop();
    };
  }, [core, reducedMotion]);

  return <div className="fever-overlay" data-active={active} ref={rootRef} aria-hidden="true" />;
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
  return <style>{TABLE_CSS}</style>;
}

export default TableScreen;
