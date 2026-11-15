/**
 * Deterministic fixed-step loop.
 *
 * Wall-clock time only decides *how many* ticks to run; simulation behaviour
 * is entirely a function of the command log and tick count. Browser callers
 * feed `advance(deltaMs)` from requestAnimationFrame timestamps. Speed is a
 * positive multiplier over the nominal 60 Hz tick rate.
 */
import { TICKS_PER_SECOND, type GameCore, type GameEvent } from '@jackpotsyndicate/contracts';

export interface FixedStepLoopOptions {
  ticksPerSecond?: number;
  /** Alias for ticksPerSecond. */
  tickRate?: number;
  speed?: number;
  /** Safety valve for a long frame or an inactive tab. */
  maxStepsPerFrame?: number;
  onEvents?: (events: readonly GameEvent[]) => void;
}

function assertSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new RangeError('speed must be a finite positive number');
  }
  return speed;
}

export class FixedStepLoop {
  readonly core: GameCore;
  readonly ticksPerSecond: number;
  readonly maxStepsPerFrame: number;
  private readonly stepMs: number;
  private readonly onEvents?: (events: readonly GameEvent[]) => void;
  private accumulatorMs = 0;
  private speedValue: number;
  private totalTicks = 0;

  constructor(core: GameCore, options: FixedStepLoopOptions = {}) {
    this.core = core;
    this.ticksPerSecond = options.ticksPerSecond ?? options.tickRate ?? TICKS_PER_SECOND;
    if (!Number.isFinite(this.ticksPerSecond) || this.ticksPerSecond <= 0) {
      throw new RangeError('ticksPerSecond must be a finite positive number');
    }
    this.stepMs = 1000 / this.ticksPerSecond;
    this.speedValue = assertSpeed(options.speed ?? 1);
    this.maxStepsPerFrame = Math.max(1, Math.floor(options.maxStepsPerFrame ?? 600));
    this.onEvents = options.onEvents;
  }

  get speed(): number {
    return this.speedValue;
  }

  get ticks(): number {
    return this.totalTicks;
  }

  get accumulator(): number {
    return this.accumulatorMs;
  }

  setSpeed(speed: number): number {
    this.speedValue = assertSpeed(speed);
    return this.speedValue;
  }

  set speed(speed: number) {
    this.setSpeed(speed);
  }

  /** Run exactly `count` deterministic ticks, ignoring wall-clock time. */
  step(count = 1): GameEvent[] {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError('step count must be a non-negative integer');
    }
    const events: GameEvent[] = [];
    for (let i = 0; i < count; i++) {
      events.push(...this.core.tick());
      this.totalTicks += 1;
    }
    if (events.length > 0) this.onEvents?.(events);
    return events;
  }

  /**
   * Consume `deltaMs` of render time at the current speed. Returns the events
   * produced by the fixed steps actually run. The accumulator keeps the
   * remainder so rendering can interpolate between ticks.
   */
  advance(deltaMs: number): GameEvent[] {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError('deltaMs must be a finite non-negative number');
    }
    this.accumulatorMs += deltaMs * this.speedValue;
    let steps = Math.floor(this.accumulatorMs / this.stepMs);
    if (steps > this.maxStepsPerFrame) {
      steps = this.maxStepsPerFrame;
      this.accumulatorMs = 0;
    } else {
      this.accumulatorMs -= steps * this.stepMs;
    }
    return this.step(steps);
  }

  /** Alias used by renderer hosts that call `update(dt)` each frame. */
  update(deltaMs: number): GameEvent[] {
    return this.advance(deltaMs);
  }

  reset(): void {
    this.accumulatorMs = 0;
    this.totalTicks = 0;
  }
}

export function createFixedStepLoop(
  core: GameCore,
  options: FixedStepLoopOptions = {},
): FixedStepLoop {
  return new FixedStepLoop(core, options);
}

export const createLoop = createFixedStepLoop;
