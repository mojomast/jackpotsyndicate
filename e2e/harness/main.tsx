/** @jsxRuntime automatic */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { replayCommandLog, type CommandLogEntry } from '@jackpotsyndicate/core';
import { CONTENT_BUNDLE } from '@jackpotsyndicate/content';
import type { ContentBundle, GameCore, GameEvent, ItemDef } from '@jackpotsyndicate/contracts';
import { App } from '../../apps/game/src/app/App';
import { ResumePrompt } from '../../apps/game/src/screens/meta/ResumePrompt';
import {
  createTableCore,
  type TableCore,
  type TableTestHooks,
} from '../../apps/game/src/screens/table/tableCore';
import { startGameLoop, useGameStore } from '../../apps/game/src/store/gameStore';
import { preloadSpriteAssets, type SpriteManifest } from '../../apps/game/src/store/spriteResolver';
import { installTestApi } from '../../apps/game/src/testApi';
import '../../apps/game/src/theme/tokens.css';
import assetManifest from '../../apps/game/public/atlas/asset-manifest.json';
import golden from '../../fixtures/replay.golden.json';

const LIP_ASSIST: ItemDef = {
  id: 'test-lip-assist',
  name: 'Test Lip Assist',
  desc: 'Test-only hook that nudges spawned tokens toward the lip.',
  price: 0,
  spriteKey: 'trinket.test-lip-assist',
  rarity: 'common',
  category: 'TRINKET',
  effects: [
    {
      handler: 'onTokenSpawn',
      params: { action: 'simDirective', directive: 'nudgeForward', distance: 200 },
    },
  ],
};

const J6_CONTENT: ContentBundle = {
  ...CONTENT_BUNDLE,
  items: CONTENT_BUNDLE.items.filter((item) => item.id === 'reelColumn' || item.id === 'waysHarness'),
  balance: {
    ...CONTENT_BUNDLE.balance,
    quotas: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    baseStrip: ['cherry'],
    firstReelStrip: ['cherry'],
  },
  floors: CONTENT_BUNDLE.floors.map((floor) => ({
    ...floor,
    shop: {
      ...floor.shop,
      categoryWeights: { TRINKET: 0, DRINK: 0, REEL: 0, COIN: 0, CHASSIS: 100 },
    },
  })),
};

const LIP_CONTENT: ContentBundle = {
  ...CONTENT_BUNDLE,
  items: [...CONTENT_BUNDLE.items, LIP_ASSIST],
};

type ContentVariant = 'default' | 'lip' | 'j6';

interface AttachOptions {
  seed?: string;
  content?: ContentVariant;
}

interface AudioGainRecorder {
  gains: GainNode[];
}

const audioRecorder: AudioGainRecorder = { gains: [] };
const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
const AudioCtor = window.AudioContext ?? audioWindow.webkitAudioContext;
if (AudioCtor) {
  const prototype = AudioCtor.prototype as AudioContext;
  const originalCreateGain = prototype.createGain;
  prototype.createGain = function trackedCreateGain(this: AudioContext): GainNode {
    const gain = originalCreateGain.call(this);
    audioRecorder.gains.push(gain);
    return gain;
  };
}

type PlayableCore = TableCore & TableTestHooks;

let activeCore: PlayableCore | null = null;
let stopLoop: (() => void) | null = null;
let resumeHash: string | null = null;
let recorded: GameEvent[] = [];
let unsubscribeRecording: (() => void) | null = null;

type SubscribableCore = GameCore & {
  subscribe?: (listener: (event: GameEvent) => void) => () => void;
};

function contentFor(variant: ContentVariant): ContentBundle {
  if (variant === 'lip') return LIP_CONTENT;
  if (variant === 'j6') return J6_CONTENT;
  return CONTENT_BUNDLE;
}

function attach(options: AttachOptions = {}): { seed: string } {
  const seed = options.seed ?? 'E2E-BASE';
  const core = createTableCore({ content: contentFor(options.content ?? 'default'), seed });
  core.dispatch({ c: 'NewRun', seed });
  core.tick();
  useGameStore.getState().attachCore(core);
  activeCore = core;
  installTestApi(core);
  return { seed };
}

function activePlayable(): PlayableCore | null {
  const store = useGameStore.getState();
  return store.core === activeCore ? activeCore : null;
}

const e2e = {
  attach,
  mountTrinket(itemId: string): void {
    activePlayable()?.mountTrinket?.(itemId);
  },
  grantCash(amount: number): void {
    activePlayable()?.grantCash?.(amount);
  },
  events(): GameEvent[] {
    return useGameStore.getState().events;
  },
  startRecording(): void {
    unsubscribeRecording?.();
    recorded = [];
    const core = useGameStore.getState().core as SubscribableCore;
    unsubscribeRecording = core.subscribe?.((event) => recorded.push(event)) ?? null;
  },
  recordedEvents(): GameEvent[] {
    return recorded;
  },
  stateHash(): string {
    return useGameStore.getState().core.stateHash();
  },
  friction(floorId: string): number {
    const floor = CONTENT_BUNDLE.floors.find((candidate) => candidate.id === floorId);
    return floor?.physics.friction ?? Number.NaN;
  },
  playGolden(): {
    hash: string;
    expected: string;
    phase: string;
    seed: string;
    ticks: number;
    events: number;
  } {
    const result = replayCommandLog(golden.commandLog as CommandLogEntry[], {
      ticks: golden.ticks,
      collectEvents: true,
    });
    const core: GameCore = result.core;
    useGameStore.getState().attachCore(core);
    useGameStore.setState({ events: result.events });
    installTestApi(core);
    activeCore = null;
    if (window.location.hash !== '#/victory') window.location.hash = '#/victory';
    return {
      hash: result.hash,
      expected: golden.expectedHash,
      phase: core.getState().phase,
      seed: core.getState().seed,
      ticks: result.ticks,
      events: result.events.length,
    };
  },
  startLoop(): void {
    if (stopLoop !== null) return;
    stopLoop = startGameLoop();
  },
  measureSpin(speed: number, seed: string): Promise<number> {
    const store = useGameStore.getState();
    store.setSpeed(speed);
    useGameStore.getState().newRun(seed);
    const start = performance.now();
    const result = useGameStore.getState().dispatch({ c: 'Spin' });
    if (!result.ok) return Promise.reject(new Error(`Spin failed: ${result.error}`));
    return new Promise<number>((resolve) => {
      const unsubscribe = useGameStore.subscribe((next) => {
        if (next.state.stats.spins === 1 && next.state.phase === 'PREP') {
          const elapsed = performance.now() - start;
          unsubscribe();
          resolve(elapsed);
        }
      });
    });
  },
  stopLoop(): void {
    stopLoop?.();
    stopLoop = null;
  },
  audioGains(): number[] {
    return audioRecorder.gains.map((gain) => gain.gain.value);
  },
  lastResumeHash(): string | null {
    return resumeHash;
  },
};

declare global {
  interface Window {
    __E2E__: typeof e2e;
  }
}

window.__E2E__ = e2e;

function HarnessRoot() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = (): void => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (hash.startsWith('#/resume')) {
    return (
      <ResumePrompt
        onResumed={(value) => {
          resumeHash = value;
        }}
      />
    );
  }

  return <App />;
}

attach();
const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
await preloadSpriteAssets(assetManifest as SpriteManifest);
createRoot(root).render(
  <StrictMode>
    <HarnessRoot />
  </StrictMode>,
);
