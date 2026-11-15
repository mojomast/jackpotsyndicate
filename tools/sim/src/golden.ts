/**
 * Golden replay fixture: seed + command log + expected combined hash.
 *
 * T-081 records the best greedy run available. When the initial balance cannot
 * reach Victory, the fixture is flagged for T-082 instead of fabricating a win.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Command } from '../../../packages/contracts/src/index';
import { replayCommandLog } from '../../../packages/core/src/index';
import { bestRun } from './reports';
import { playRun, type RunResult } from './runner';
import type { BotId } from './bots';

export const GOLDEN_FLAG = 'victory-not-reached-with-initial-balance';

export interface GoldenFixture {
  version: 1;
  seed: string;
  bot: BotId;
  /** Combined engine + physics hash the replay must reproduce. */
  expectedHash: string;
  /** Exact tick the recorded run stopped at. */
  ticks: number;
  commandLog: { tick: number; cmd: Command }[];
  outcome: RunResult['outcome'];
  reachedVictory: boolean;
  /** True when the initial balance could not reach Victory in the search. */
  flagged: boolean;
  flag: string | null;
  note: string;
  finalPhase: string;
  floorId: string;
  round: number;
  bankroll: number;
  floorsCleared: string[];
}

export interface RecordGoldenOptions {
  candidates?: number;
  seedBase?: string;
  bot?: BotId;
  /** Record exactly this run seed instead of searching `seedBase`. */
  exactSeed?: string;
  onProgress?: (index: number, total: number, result: RunResult) => void;
}

export function fixtureFromRun(run: RunResult, searched: number): GoldenFixture {
  const reachedVictory = run.won;
  const flagged = !reachedVictory;
  return {
    version: 1,
    seed: run.seed,
    bot: run.bot,
    expectedHash: run.finalHash,
    ticks: run.ticks,
    commandLog: run.commandLog,
    outcome: run.outcome,
    reachedVictory,
    flagged,
    flag: flagged ? GOLDEN_FLAG : null,
    note: flagged
      ? `Victory was not reached across ${searched} seeded ${run.bot} runs with the initial balance; the best available run is recorded for T-082 balance tuning.`
      : searched === 1
        ? 'Reached Victory in the recorded candidate run.'
        : `Reached Victory in ${searched} seeded candidate runs.`,
    finalPhase: run.finalPhase,
    floorId: run.floorId,
    round: run.round,
    bankroll: run.bankroll,
    floorsCleared: [...run.floorsCleared],
  };
}

/** Run a deterministic candidate search and return the best verified fixture. */
export function recordGolden(options: RecordGoldenOptions = {}): GoldenFixture {
  const bot = options.bot ?? 'greedy-synergy';
  const seedBase = options.seedBase ?? 'sim';
  const candidates = options.exactSeed === undefined ? (options.candidates ?? 100) : 1;
  const results: RunResult[] = [];
  for (let index = 0; index < candidates; index++) {
    const seed = options.exactSeed ?? `${seedBase}:${bot}:${index}`;
    const result = playRun({ seed, bot });
    results.push(result);
    options.onProgress?.(index + 1, candidates, result);
  }

  const best = bestRun(results);
  if (best === undefined) throw new Error('golden search produced no runs');

  const fixture = fixtureFromRun(best, candidates);
  const replay = replayCommandLog(fixture.commandLog, {
    ticks: fixture.ticks,
    collectEvents: false,
  });
  if (replay.hash !== fixture.expectedHash) {
    throw new Error(
      `golden fixture is not replayable: expected ${fixture.expectedHash}, replayed ${replay.hash}`,
    );
  }
  return fixture;
}

export async function writeGolden(
  path: string,
  fixture: GoldenFixture,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
}

export function validateGolden(value: unknown): GoldenFixture {
  if (typeof value !== 'object' || value === null) {
    throw new Error('golden fixture must be an object');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.seed !== 'string' || record.seed.length === 0) {
    throw new Error('golden fixture: seed must be a non-empty string');
  }
  if (typeof record.expectedHash !== 'string' || record.expectedHash.length === 0) {
    throw new Error('golden fixture: expectedHash must be a non-empty string');
  }
  if (typeof record.ticks !== 'number' || !Number.isInteger(record.ticks) || record.ticks < 0) {
    throw new Error('golden fixture: ticks must be a non-negative integer');
  }
  if (!Array.isArray(record.commandLog) || record.commandLog.length === 0) {
    throw new Error('golden fixture: commandLog must be a non-empty array');
  }
  const commandLog = record.commandLog.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`golden fixture: commandLog[${index}] must be an object`);
    }
    const item = entry as { tick?: unknown; cmd?: unknown };
    if (typeof item.tick !== 'number' || !Number.isInteger(item.tick) || item.tick < 0) {
      throw new Error(`golden fixture: commandLog[${index}].tick must be a non-negative integer`);
    }
    if (
      typeof item.cmd !== 'object' ||
      item.cmd === null ||
      typeof (item.cmd as { c?: unknown }).c !== 'string'
    ) {
      throw new Error(`golden fixture: commandLog[${index}].cmd must be a command object`);
    }
    return { tick: item.tick, cmd: item.cmd as Command };
  });

  return {
    version: 1,
    seed: record.seed,
    bot: (record.bot as BotId | undefined) ?? 'greedy-synergy',
    expectedHash: record.expectedHash,
    ticks: record.ticks,
    commandLog,
    outcome: (record.outcome as RunResult['outcome'] | undefined) ?? 'timeout',
    reachedVictory: record.reachedVictory === true,
    flagged: record.flagged === true,
    flag: typeof record.flag === 'string' ? record.flag : null,
    note: typeof record.note === 'string' ? record.note : '',
    finalPhase: typeof record.finalPhase === 'string' ? record.finalPhase : 'UNKNOWN',
    floorId: typeof record.floorId === 'string' ? record.floorId : 'UNKNOWN',
    round: typeof record.round === 'number' ? record.round : 0,
    bankroll: typeof record.bankroll === 'number' ? record.bankroll : 0,
    floorsCleared: Array.isArray(record.floorsCleared)
      ? record.floorsCleared.filter((floor): floor is string => typeof floor === 'string')
      : [],
  };
}

export async function readGolden(path: string): Promise<GoldenFixture> {
  const text = await readFile(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`golden fixture is not valid JSON: ${(error as Error).message}`);
  }
  return validateGolden(parsed);
}

export function verifyGolden(fixture: GoldenFixture): {
  match: boolean;
  actualHash: string;
  ticks: number;
} {
  const replay = replayCommandLog(fixture.commandLog, {
    ticks: fixture.ticks,
    collectEvents: false,
  });
  return {
    match: replay.hash === fixture.expectedHash,
    actualHash: replay.hash,
    ticks: replay.ticks,
  };
}
