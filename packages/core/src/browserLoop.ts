/**
 * Browser loop driver: requestAnimationFrame timestamps feed the deterministic
 * fixed-step loop. No wall-clock reads live in simulation code; the browser
 * supplies the timestamps. Speed control is 1x / 2x / 4x (or any positive
 * multiplier) and never changes simulation rules.
 */
import type { GameCore, GameEvent } from '@jackpotsyndicate/contracts';
import { FixedStepLoop, type FixedStepLoopOptions } from './loop';

type FrameRequest = (callback: (timestamp: number) => void) => number;
type FrameCancel = (handle: number) => void;

export interface BrowserLoopOptions extends FixedStepLoopOptions {
  requestFrame?: FrameRequest;
  cancelFrame?: FrameCancel;
  /** Aliases accepted by older hosts. */
  requestAnimationFrame?: FrameRequest;
  cancelAnimationFrame?: FrameCancel;
  raf?: FrameRequest;
  caf?: FrameCancel;
}

function defaultRequestFrame(): FrameRequest | null {
  const raf = (globalThis as { requestAnimationFrame?: FrameRequest }).requestAnimationFrame;
  return typeof raf === 'function' ? raf.bind(globalThis) : null;
}

function defaultCancelFrame(): FrameCancel | null {
  const caf = (globalThis as { cancelAnimationFrame?: FrameCancel }).cancelAnimationFrame;
  return typeof caf === 'function' ? caf.bind(globalThis) : null;
}

export class BrowserLoop {
  readonly loop: FixedStepLoop;
  private readonly requestFrame: FrameRequest | null;
  private readonly cancelFrame: FrameCancel | null;
  private handle: number | null = null;
  private running = false;
  private lastTimestamp: number | null = null;

  constructor(core: GameCore, options: BrowserLoopOptions = {}) {
    this.loop = new FixedStepLoop(core, options);
    this.requestFrame =
      options.requestFrame ??
      options.requestAnimationFrame ??
      options.raf ??
      defaultRequestFrame();
    this.cancelFrame =
      options.cancelFrame ??
      options.cancelAnimationFrame ??
      options.caf ??
      defaultCancelFrame();
  }

  get core(): GameCore {
    return this.loop.core;
  }

  get speed(): number {
    return this.loop.speed;
  }

  get isRunning(): boolean {
    return this.running;
  }

  setSpeed(speed: number): number {
    return this.loop.setSpeed(speed);
  }

  set speed(speed: number) {
    this.loop.setSpeed(speed);
  }

  /** Deterministic entry point used by tests and non-rAF hosts. */
  advance(deltaMs: number): GameEvent[] {
    return this.loop.advance(deltaMs);
  }

  update(deltaMs: number): GameEvent[] {
    return this.advance(deltaMs);
  }

  start(): void {
    if (this.running) return;
    if (this.requestFrame === null) {
      throw new Error('requestAnimationFrame is unavailable; call advance(deltaMs) instead');
    }
    this.running = true;
    this.lastTimestamp = null;
    const frame = (timestamp: number): void => {
      if (!this.running) return;
      const previous = this.lastTimestamp;
      this.lastTimestamp = timestamp;
      const delta = previous === null ? 0 : Math.max(0, timestamp - previous);
      this.loop.advance(delta);
      if (this.running) this.handle = this.requestFrame!(frame);
    };
    this.handle = this.requestFrame(frame);
  }

  stop(): void {
    this.running = false;
    if (this.handle !== null) {
      this.cancelFrame?.(this.handle);
      this.handle = null;
    }
    this.lastTimestamp = null;
  }
}

export function createBrowserLoop(
  core: GameCore,
  options: BrowserLoopOptions = {},
): BrowserLoop {
  return new BrowserLoop(core, options);
}

export const BrowserLoopDriver = BrowserLoop;
