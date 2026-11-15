/**
 * @jackpotsyndicate/core — the integration surface described by C-2/C-5.
 */
export {
  Core,
  GameCoreEngine,
  GameCoreImpl,
  createCore,
  createGameCore,
  type CoreContent,
  type GameCoreOptions,
} from './core';
export { EventBus, stampEvent, type AnySimEvent, type EventListener } from './events';
export {
  FixedStepLoop,
  createFixedStepLoop,
  createLoop,
  type FixedStepLoopOptions,
} from './loop';
export {
  BrowserLoop,
  BrowserLoopDriver,
  createBrowserLoop,
  type BrowserLoopOptions,
} from './browserLoop';
export {
  combinedHash,
  hashReplay,
  replay,
  replayCommandLog,
  replayHash,
  replayLog,
  replayToPhase,
  verifyReplay,
  type CommandLogEntry,
  type ReplayOptions,
  type ReplayResult,
} from './replay';
