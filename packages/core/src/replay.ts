/**
 * Deterministic replay runner.
 *
 * The command log stores the tick at which each command was dispatched. A fresh
 * core is driven with the same commands at the same ticks; because physics is
 * seeded from the run seed and the tick loop is fixed-step, the combined
 * engine+physics hash must match bit-for-bit.
 */
import type { Command, GameEvent, Phase, RunState } from '@jackpotsyndicate/contracts';
import { engineHash } from '@jackpotsyndicate/engine';
import {
  Core,
  createGameCore,
  type GameCoreOptions,
} from './core';

export interface CommandLogEntry {
  tick: number;
  cmd: Command;
}

export interface ReplayOptions extends GameCoreOptions {
  /** Stop after exactly this many ticks (state.tick). */
  ticks?: number;
  /** Safety bound when `ticks` is not given. */
  maxTicks?: number;
  /** Stop the first tick the phase equals this value. */
  stopPhase?: Phase;
  /** Stop when this predicate first returns true (checked between ticks). */
  until?: (core: Core) => boolean;
  /** Collect every event in order (default true). */
  collectEvents?: boolean;
}

export interface ReplayResult {
  core: Core;
  events: GameEvent[];
  ticks: number;
  hash: string;
  commandLog: CommandLogEntry[];
  completed: boolean;
}

/** C-5 combined hash helper; exported here for replay/browser callers. */
export function combinedHash(state: RunState, simHash: string): string {
  return engineHash(state, simHash);
}

function applyDue(core: Core, log: readonly CommandLogEntry[], cursor: number): number {
  let next = cursor;
  while (next < log.length && log[next]!.tick <= core.tickCount) {
    const entry = log[next]!;
    core.dispatch(entry.cmd);
    next += 1;
  }
  return next;
}

/**
 * Replay a log on a fresh core. `ticks` reproduces the exact end tick; without
 * it the runner uses `maxTicks` (default 100_000) or a stop condition.
 */
export function replayCommandLog(
  log: readonly CommandLogEntry[],
  options: ReplayOptions = {},
): ReplayResult {
  const core = createGameCore(options);
  const collect = options.collectEvents ?? true;
  const events: GameEvent[] = [];
  const limit = options.ticks ?? options.maxTicks ?? 100_000;
  let cursor = 0;

  while (core.tickCount < limit) {
    cursor = applyDue(core, log, cursor);
    if (options.until !== undefined && options.until(core)) {
      return finish(core, events, options, true);
    }
    if (options.stopPhase !== undefined && core.phase === options.stopPhase && core.tickCount > 0) {
      return finish(core, events, options, true);
    }
    const tickEvents = core.tick();
    if (collect) events.push(...tickEvents);
    if (options.stopPhase !== undefined && core.phase === options.stopPhase) {
      // Commands dispatched at this tick still belong to the reproduced state.
      cursor = applyDue(core, log, cursor);
      return finish(core, events, options, true);
    }
  }

  cursor = applyDue(core, log, cursor);
  return finish(core, events, options, cursor >= log.length);
}

function finish(
  core: Core,
  events: GameEvent[],
  options: ReplayOptions,
  completed: boolean,
): ReplayResult {
  return {
    core,
    events: options.collectEvents === false ? [] : events,
    ticks: core.tickCount,
    hash: core.stateHash(),
    commandLog: core.getCommandLog(),
    completed,
  };
}

export function replayHash(
  log: readonly CommandLogEntry[],
  options: ReplayOptions = {},
): string {
  return replayCommandLog(log, { ...options, collectEvents: false }).hash;
}

export function replayToPhase(
  log: readonly CommandLogEntry[],
  phase: Phase,
  options: ReplayOptions = {},
): ReplayResult {
  return replayCommandLog(log, { ...options, stopPhase: phase });
}

/** Verify a log against an expected combined hash. */
export function verifyReplay(
  log: readonly CommandLogEntry[],
  expectedHash: string,
  options: ReplayOptions = {},
): { match: boolean; actual: string; result: ReplayResult } {
  const result = replayCommandLog(log, { ...options, collectEvents: false });
  return { match: result.hash === expectedHash, actual: result.hash, result };
}

export const replay = replayCommandLog;
export const replayLog = replayCommandLog;
export const hashReplay = replayHash;
