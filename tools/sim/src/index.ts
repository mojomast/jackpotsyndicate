#!/usr/bin/env node
/**
 * T-081 sim CLI.
 *
 *   tsx tools/sim/src/index.ts rake      [--spins 10000] [--out artifacts/sim]
 *   tsx tools/sim/src/index.ts hitrate   [--spins 5000]  [--out artifacts/sim]
 *   tsx tools/sim/src/index.ts balance   [--runs 200] [--bot both] [--out artifacts/sim]
 *   tsx tools/sim/src/index.ts replay    [--fixture fixtures/replay.golden.json] [--record]
 *   tsx tools/sim/src/index.ts feel      [--runs 200] [--bot both] [--workers 2] [--variant file.ts]
 *
 * All simulation entry points go through the public GameCore commands.
 */
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CONTENT_BUNDLE } from '../../../packages/content/src/index';
import type { BotId } from './bots';
import { BOTS } from './bots';
import {
  GOLDEN_FLAG,
  readGolden,
  recordGolden,
  verifyGolden,
  writeGolden,
  type GoldenFixture,
} from './golden';
import { measureHitRate, measureRake, runBalance } from './measures';
import { formatFeel, headline, pressureLine, registerCategories, summariseBot } from './feel';
import { runShard, runTelemetryBatch, writeShard } from './parallel';
import {
  bestRun,
  formatPercent,
  summariseBalance,
  writeBalanceReports,
  writeHitRateReports,
  writeRakeReports,
  writeReplayReports,
} from './reports';

export type CliValue = string | boolean;

export interface ParsedCli {
  command: string;
  options: Record<string, CliValue>;
  positionals: string[];
}

const BOOLEAN_OPTIONS = new Set(['help', 'record', 'quiet']);

export function parseCli(argv: readonly string[]): ParsedCli {
  const options: Record<string, CliValue> = {};
  const positionals: string[] = [];
  let command: string | null = null;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      if (body.length === 0) throw new Error('invalid option: --');
      const equals = body.indexOf('=');
      const name = equals < 0 ? body : body.slice(0, equals);
      if (BOOLEAN_OPTIONS.has(name)) {
        if (equals >= 0) {
          const raw = body.slice(equals + 1);
          options[name] = raw !== 'false' && raw !== '0';
        } else {
          options[name] = true;
        }
        continue;
      }
      if (equals >= 0) {
        options[name] = body.slice(equals + 1);
      } else {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) {
          throw new Error(`option --${name} needs a value`);
        }
        options[name] = value;
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      throw new Error(`unknown short option: ${arg}`);
    }
    if (command === null) {
      command = arg;
      continue;
    }
    positionals.push(arg);
  }

  return { command: command ?? 'help', options, positionals };
}

function assertKnown(options: Record<string, CliValue>, allowed: readonly string[]): void {
  for (const name of Object.keys(options)) {
    if (!allowed.includes(name)) throw new Error(`unknown option --${name}`);
  }
}

function numberOption(
  options: Record<string, CliValue>,
  name: string,
  fallback: number,
  minimum = 1,
): number {
  const raw = options[name];
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string') throw new Error(`--${name} needs a numeric value`);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`--${name} must be an integer >= ${minimum}`);
  }
  return value;
}

function stringOption(
  options: Record<string, CliValue>,
  name: string,
  fallback: string,
): string {
  const raw = options[name];
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`--${name} needs a non-empty value`);
  }
  return raw;
}

function botOption(options: Record<string, CliValue>): BotId | 'both' {
  const raw = stringOption(options, 'bot', 'both');
  if (raw === 'both') return 'both';
  if (raw === 'random-buyer' || raw === 'greedy-synergy') return raw;
  throw new Error('--bot must be random-buyer, greedy-synergy or both');
}

function outDir(options: Record<string, CliValue>): string {
  return stringOption(options, 'out', 'artifacts/sim');
}

function printPaths(paths: readonly string[]): void {
  console.log(`reports: ${paths.join(', ')}`);
}

function helpText(): string {
  return [
    'Usage: tsx tools/sim/src/index.ts <command> [options]',
    '',
    'Commands:',
    '  rake      measure gutter rake on every floor (AC-5), no trinkets',
    '  hitrate   measure base 3x3 CLASSIC hit rate (AC-7)',
    '  balance   run random-buyer and greedy-synergy bots (AC-6)',
    '  replay    verify the golden replay fixture, or --record a new one',
    '  feel      telemetry for feel + balance: per-stage cash, pressure, bosses, item power',
    '',
    'Options:',
    '  --spins N        rake/hitrate sample size (rake is per floor)',
    '  --runs N         balance runs per bot (default 200)',
    '  --bot NAME       both | random-buyer | greedy-synergy',
    '  --seed TEXT      seed base for the run family',
    '  --out DIR        report directory (default artifacts/sim)',
    '  --fixture PATH   golden fixture (default fixtures/replay.golden.json)',
    '  --record         replay: search and write a new golden fixture',
    '  --candidates N   replay --record candidate seeds (default 100)',
    '  --workers N      feel: child processes to fan out to (default 2)',
    '  --variant FILE   feel: module whose default export transforms a content clone',
    '  --quiet          suppress progress output',
  ].join('\n');
}

async function commandRake(options: Record<string, CliValue>): Promise<void> {
  assertKnown(options, ['spins', 'seed', 'out', 'quiet']);
  const spins = numberOption(options, 'spins', 10_000);
  const seed = stringOption(options, 'seed', 'rake');
  const results = measureRake(spins, seed);
  const paths = await writeRakeReports(outDir(options), results);

  console.log(`Rake (no trinkets, ${spins} spins/floor, seed base "${seed}")`);
  for (const result of results) {
    console.log(
      `  ${result.floorId.padEnd(17)} ${formatPercent(result.rake).padStart(6)}  target ${formatPercent(result.target)} ±${formatPercent(result.tolerance)}  ${result.inBand ? 'PASS' : 'FAIL'}  (${result.spins} spins)`,
    );
  }
  printPaths(paths);
}

async function commandHitRate(options: Record<string, CliValue>): Promise<void> {
  assertKnown(options, ['spins', 'seed', 'out', 'quiet']);
  const spins = numberOption(options, 'spins', 5_000);
  const seed = stringOption(options, 'seed', 'hitrate');
  const result = measureHitRate(spins, seed);
  const paths = await writeHitRateReports(outDir(options), result);
  console.log(
    `Hit rate (base 3x3 CLASSIC): ${formatPercent(result.hitRate)} over ${result.evaluations} evaluations, target ${formatPercent(result.targetLow)}–${formatPercent(result.targetHigh)} ${result.inBand ? 'PASS' : 'FAIL'}`,
  );
  printPaths(paths);
}

async function commandBalance(options: Record<string, CliValue>): Promise<void> {
  assertKnown(options, ['runs', 'bot', 'seed', 'out', 'quiet']);
  const runs = numberOption(options, 'runs', 200);
  const bot = botOption(options);
  const seed = stringOption(options, 'seed', 'sim');
  const bots: readonly BotId[] = bot === 'both' ? ['random-buyer', 'greedy-synergy'] : [bot];
  const quiet = options.quiet === true;
  const total = runs * bots.length;
  let nextProgress = Math.max(1, Math.floor(total / 10));

  const results = runBalance({
    runsPerBot: runs,
    bots,
    seedBase: seed,
    onRun: (done) => {
      if (!quiet && (done >= nextProgress || done === total)) {
        process.stderr.write(`  ${done}/${total} runs\n`);
        nextProgress += Math.max(1, Math.floor(total / 10));
      }
    },
  });
  const paths = await writeBalanceReports(outDir(options), results);

  const summaries = summariseBalance(results);
  console.log(`Balance (${runs} runs/bot, seed base "${seed}")`);
  for (const summary of summaries) {
    const floor1 =
      summary.floor1Band === null
        ? 'n/a'
        : `${formatPercent(summary.floor1Rate)} (${summary.floor1InBand ? 'PASS' : 'FAIL'})`;
    console.log(
      `  ${summary.bot.padEnd(15)} floor1 ${floor1.padEnd(16)} win ${formatPercent(summary.winRate)} (${summary.winInBand ? 'PASS' : 'FAIL'})  max bankroll ${Math.round(summary.maxBankroll)}`,
    );
  }
  const best = bestRun(results);
  if (best !== undefined) {
    console.log(
      `  best: ${best.bot} seed "${best.seed}" ${best.outcome}, floor ${best.floorId} round ${best.round}, hash ${best.finalHash}`,
    );
  }
  printPaths(paths);
}

async function commandFeel(options: Record<string, CliValue>): Promise<void> {
  assertKnown(options, ['runs', 'bot', 'seed', 'out', 'quiet', 'workers', 'variant', 'title']);
  const runs = numberOption(options, 'runs', 200);
  const workers = numberOption(options, 'workers', 2);
  const bot = botOption(options);
  const seed = stringOption(options, 'seed', 'sim');
  const variant = options.variant === undefined ? undefined : stringOption(options, 'variant', '');
  const bots: readonly BotId[] = bot === 'both' ? ['random-buyer', 'greedy-synergy'] : [bot];
  const quiet = options.quiet === true;
  let nextProgress = 0;
  const started = Date.now();
  const telemetry = await runTelemetryBatch({
    runsPerBot: runs,
    bots,
    seedBase: seed,
    workers,
    ...(variant === undefined ? {} : { variant }),
    onProgress: (done, total) => {
      if (quiet) return;
      if (done >= nextProgress || done === total) {
        process.stderr.write(`  ${done}/${total} runs (${Math.round((Date.now() - started) / 1000)}s)\n`);
        nextProgress = done + Math.max(1, Math.floor(total / 10));
      }
    },
  });
  registerCategories(CONTENT_BUNDLE.items);
  const feels = bots.map((id) => summariseBot(id, telemetry.filter((run) => run.bot === id)));
  const title = stringOption(options, 'title', `Feel report (${runs} runs/bot, seed "${seed}"${variant === undefined ? '' : `, variant ${variant}`})`);
  const dir = outDir(options);
  await mkdir(dir, { recursive: true });
  const mdPath = join(dir, 'feel.md');
  const jsonPath = join(dir, 'feel.json');
  await writeFile(mdPath, formatFeel(feels, title), 'utf8');
  await writeFile(jsonPath, JSON.stringify(feels, null, 1), 'utf8');
  for (const feel of feels) console.log(headline(feel));
  for (const feel of feels) console.log(pressureLine(feel));
  printPaths([mdPath, jsonPath]);
}

async function commandFeelShard(options: Record<string, CliValue>): Promise<void> {
  assertKnown(options, ['runs', 'bot', 'seed', 'shard', 'raw-out', 'variant']);
  const runs = numberOption(options, 'runs', 200);
  const bot = botOption(options);
  const seed = stringOption(options, 'seed', 'sim');
  const [shardText, shardsText] = stringOption(options, 'shard', '0/1').split('/');
  const shard = Number(shardText);
  const shards = Number(shardsText);
  if (!Number.isInteger(shard) || !Number.isInteger(shards) || shards < 1 || shard < 0 || shard >= shards) {
    throw new Error('--shard must look like i/n');
  }
  const variant = options.variant === undefined ? undefined : stringOption(options, 'variant', '');
  const result = await runShard({
    runsPerBot: runs,
    bots: bot === 'both' ? ['random-buyer', 'greedy-synergy'] : [bot],
    seedBase: seed,
    shard,
    shards,
    ...(variant === undefined ? {} : { variant }),
    onProgress: (done) => process.stderr.write(`progress ${done}\n`),
  });
  await writeShard(stringOption(options, 'raw-out', 'feel-shard.json'), result);
}

function fixtureReport(
  fixturePath: string,
  fixture: GoldenFixture,
  actualHash: string,
  match: boolean,
) {
  return {
    fixture: fixturePath,
    seed: fixture.seed,
    expectedHash: fixture.expectedHash,
    actualHash,
    match,
    ticks: fixture.ticks,
    commands: fixture.commandLog.length,
    outcome: fixture.outcome,
    flagged: fixture.flagged,
    flag: fixture.flag,
  };
}

async function commandReplay(options: Record<string, CliValue>): Promise<void> {
  assertKnown(options, ['fixture', 'record', 'candidates', 'seed', 'bot', 'out', 'quiet']);
  const path = stringOption(options, 'fixture', 'fixtures/replay.golden.json');
  const record = options.record === true;
  const quiet = options.quiet === true;

  if (record) {
    const bot = botOption(options);
    const candidates = numberOption(options, 'candidates', 100);
    const seed = options.seed === undefined ? undefined : stringOption(options, 'seed', 'golden');
    let nextProgress = 1;
    const fixture = recordGolden({
      candidates,
      bot: bot === 'both' ? 'greedy-synergy' : bot,
      seedBase: 'sim',
      ...(seed === undefined ? {} : { exactSeed: seed }),
      onProgress: (done, total, result) => {
        if (quiet) return;
        if (done >= nextProgress || done === total) {
          process.stderr.write(
            `  candidate ${done}/${total}: ${result.outcome}, ${result.floorsCleared.length} floor(s), ${Math.round(result.bankroll)} bankroll\n`,
          );
          nextProgress += Math.max(1, Math.floor(total / 10));
        }
      },
    });
    await writeGolden(path, fixture);
    const verification = verifyGolden(fixture);
    const report = fixtureReport(path, fixture, verification.actualHash, verification.match);
    const paths = await writeReplayReports(outDir(options), report);
    console.log(
      `Recorded ${path}: ${fixture.reachedVictory ? 'Victory' : 'best available run'}, hash ${fixture.expectedHash} ${verification.match ? 'verified' : 'MISMATCH'}`,
    );
    if (fixture.flagged) console.log(`Flagged for T-082 (${fixture.flag ?? GOLDEN_FLAG}).`);
    printPaths(paths);
    if (!verification.match) process.exitCode = 1;
    return;
  }

  const fixture = await readGolden(path);
  const verification = verifyGolden(fixture);
  const report = fixtureReport(path, fixture, verification.actualHash, verification.match);
  const paths = await writeReplayReports(outDir(options), report);
  console.log(
    `Replay ${path}: ${verification.match ? 'MATCH' : 'MISMATCH'} (${fixture.outcome}, ${fixture.commandLog.length} commands, ${fixture.ticks} ticks)`,
  );
  console.log(`  expected ${fixture.expectedHash}`);
  console.log(`  actual   ${verification.actualHash}`);
  if (fixture.flagged) console.log(`  flagged for T-082: ${fixture.flag ?? GOLDEN_FLAG}`);
  printPaths(paths);
  if (!verification.match) process.exitCode = 1;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseCli(argv);
  if (parsed.options.help === true || parsed.command === 'help' || parsed.command === '--help') {
    console.log(helpText());
    return;
  }
  if (parsed.positionals.length > 0) {
    throw new Error(`unexpected argument: ${parsed.positionals[0]}`);
  }

  switch (parsed.command) {
    case 'rake':
      await commandRake(parsed.options);
      return;
    case 'hitrate':
      await commandHitRate(parsed.options);
      return;
    case 'balance':
      await commandBalance(parsed.options);
      return;
    case 'replay':
      await commandReplay(parsed.options);
      return;
    case 'feel':
      await commandFeel(parsed.options);
      return;
    case 'feel-shard':
      await commandFeelShard(parsed.options);
      return;
    case 'bots': {
      for (const bot of Object.values(BOTS)) console.log(`${bot.id}\t${bot.label}`);
      return;
    }
    default:
      throw new Error(`unknown command "${parsed.command}" (try --help)`);
  }
}

const invoked = process.argv[1] === undefined ? '' : resolve(process.argv[1]);
if (invoked !== '' && fileURLToPath(import.meta.url) === invoked) {
  main().catch((error: unknown) => {
    console.error(`sim: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
