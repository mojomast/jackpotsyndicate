/**
 * CSV + Markdown report writers. Reports live under `artifacts/sim/` (ignored
 * by git) and are intentionally plain text so CI can upload them directly.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunResult, RunStats } from './runner';
import type { BotId } from './bots';
import type { FloorId } from '../../../packages/contracts/src/index';

export interface RakeFloorResult {
  floorId: FloorId;
  floorName: string;
  spins: number;
  runs: number;
  lipDrops: number;
  gutterLosses: number;
  rake: number;
  target: number;
  tolerance: number;
  inBand: boolean;
}

export interface HitRateResult {
  spins: number;
  evaluations: number;
  winningEvaluations: number;
  hitRate: number;
  targetLow: number;
  targetHigh: number;
  inBand: boolean;
  ticks: number;
}

export interface BalanceSummary {
  bot: BotId;
  runs: number;
  floor1Clears: number;
  floor1Rate: number;
  wins: number;
  winRate: number;
  timeouts: number;
  avgFloors: number;
  avgBankroll: number;
  maxBankroll: number;
  maxOverCeiling: boolean;
  floor1Band: [number, number] | null;
  winBand: [number, number];
  floor1InBand: boolean | null;
  winInBand: boolean;
}

export const BALANCE_BANDS: Readonly<
  Record<BotId, { floor1: [number, number] | null; win: [number, number] }>
> = {
  'random-buyer': { floor1: [0.35, 0.65], win: [0.02, 0.15] },
  'greedy-synergy': { floor1: null, win: [0.25, 0.6] },
};

export const BANKROLL_CEILING = 1e12;

export const RAKE_BANDS: Readonly<Record<FloorId, { target: number; tolerance: number }>> = {
  FLOOR_NEON: { target: 0.18, tolerance: 0.04 },
  FLOOR_CRYO: { target: 0.24, tolerance: 0.05 },
  FLOOR_FOUNDRY: { target: 0.12, tolerance: 0.04 },
  FLOOR_PENTHOUSE: { target: 0.21, tolerance: 0.05 },
};

export const HITRATE_BAND: readonly [number, number] = [0.3, 0.45];

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: readonly (readonly (string | number | boolean | null)[])[]): string {
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

async function write(outDir: string, name: string, content: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, name);
  await writeFile(path, content, 'utf8');
  return path;
}

export function summariseBalance(results: readonly RunResult[]): BalanceSummary[] {
  const byBot = new Map<BotId, RunResult[]>();
  for (const result of results) {
    const list = byBot.get(result.bot) ?? [];
    list.push(result);
    byBot.set(result.bot, list);
  }

  return [...byBot.entries()].map(([bot, runs]) => {
    const band = BALANCE_BANDS[bot];
    const floor1Clears = runs.filter((run) => run.clearedFloor1).length;
    const wins = runs.filter((run) => run.won).length;
    const timeouts = runs.filter((run) => run.outcome === 'timeout').length;
    const floor1Rate = runs.length === 0 ? 0 : floor1Clears / runs.length;
    const winRate = runs.length === 0 ? 0 : wins / runs.length;
    const maxBankroll = runs.reduce((max, run) => Math.max(max, run.bankroll, run.maxBankroll), 0);
    const avgFloors =
      runs.length === 0
        ? 0
        : runs.reduce((sum, run) => sum + run.floorsCleared.length, 0) / runs.length;
    const avgBankroll =
      runs.length === 0 ? 0 : runs.reduce((sum, run) => sum + run.bankroll, 0) / runs.length;

    return {
      bot,
      runs: runs.length,
      floor1Clears,
      floor1Rate,
      wins,
      winRate,
      timeouts,
      avgFloors,
      avgBankroll,
      maxBankroll,
      maxOverCeiling: maxBankroll > BANKROLL_CEILING,
      floor1Band: band.floor1,
      winBand: band.win,
      floor1InBand:
        band.floor1 === null ? null : floor1Rate >= band.floor1[0] && floor1Rate <= band.floor1[1],
      winInBand: winRate >= band.win[0] && winRate <= band.win[1],
    };
  });
}

function runRow(run: RunResult): (string | number | boolean)[] {
  return [
    run.bot,
    run.seed,
    run.outcome,
    run.finalPhase,
    run.floorId,
    run.round,
    run.floorsCleared.length,
    run.clearedFloor1,
    run.won,
    run.bankroll,
    run.maxBankroll,
    run.stats.spins,
    run.stats.lipDrops,
    run.stats.gutterLosses,
    run.stats.cashBanked,
    run.ticks,
  ];
}

export async function writeBalanceReports(
  outDir: string,
  results: readonly RunResult[],
): Promise<string[]> {
  const summaries = summariseBalance(results);
  const csvRows: (string | number | boolean)[][] = [
    [
      'bot',
      'seed',
      'outcome',
      'finalPhase',
      'floorId',
      'round',
      'floorsCleared',
      'clearedFloor1',
      'won',
      'bankroll',
      'maxBankroll',
      'spins',
      'lipDrops',
      'gutterLosses',
      'cashBanked',
      'ticks',
    ],
    ...results.map(runRow),
  ];

  const md: string[] = [
    '# Balance report (AC-6)',
    '',
    'Generated by `tools/sim` using only public GameCore commands.',
    '',
    '| Bot | Runs | Floor 1 clears | Floor 1 rate | Wins | Win rate | Timeouts | Avg floors | Avg bankroll | Max bankroll |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const summary of summaries) {
    md.push(
      `| ${summary.bot} | ${summary.runs} | ${summary.floor1Clears} | ${formatPercent(summary.floor1Rate)} | ${summary.wins} | ${formatPercent(summary.winRate)} | ${summary.timeouts} | ${summary.avgFloors.toFixed(2)} | ${Math.round(summary.avgBankroll)} | ${Math.round(summary.maxBankroll)} |`,
    );
  }
  md.push('', '## Acceptance checks', '');
  md.push('| Check | Value | Band | Status |', '| --- | ---: | --- | --- |');
  for (const summary of summaries) {
    if (summary.floor1Band !== null) {
      md.push(
        `| ${summary.bot}: Floor 1 clear rate | ${formatPercent(summary.floor1Rate)} | ${formatPercent(summary.floor1Band[0])}–${formatPercent(summary.floor1Band[1])} | ${summary.floor1InBand ? 'PASS' : 'FAIL'} |`,
      );
    }
    md.push(
      `| ${summary.bot}: win rate | ${formatPercent(summary.winRate)} | ${formatPercent(summary.winBand[0])}–${formatPercent(summary.winBand[1])} | ${summary.winInBand ? 'PASS' : 'FAIL'} |`,
    );
    md.push(
      `| ${summary.bot}: bankroll ceiling | ${Math.round(summary.maxBankroll)} | <= ${BANKROLL_CEILING.toExponential(0)} | ${summary.maxOverCeiling ? 'FAIL' : 'PASS'} |`,
    );
  }
  md.push(
    '',
    'A failing band is balance content work (T-082), not a simulator failure. Reports are written even when a band fails.',
    '',
  );

  const paths = [
    await write(outDir, 'balance.csv', csv(csvRows)),
    await write(outDir, 'balance.md', md.join('\n')),
  ];

  const best = [...results].sort(compareRunsForGolden)[0];
  if (best !== undefined) {
    paths.push(
      await write(
        outDir,
        'balance-best-run.md',
        [
          '# Best balance run',
          '',
          `- bot: ${best.bot}`,
          `- seed: ${best.seed}`,
          `- outcome: ${best.outcome}`,
          `- final phase: ${best.finalPhase}`,
          `- floor: ${best.floorId} (round ${best.round})`,
          `- floors cleared: ${best.floorsCleared.join(', ') || 'none'}`,
          `- bankroll: ${Math.round(best.bankroll)}`,
          `- max bankroll: ${Math.round(best.maxBankroll)}`,
          `- spins: ${best.stats.spins}`,
          `- ticks: ${best.ticks}`,
          `- combined hash: ${best.finalHash}`,
          '',
        ].join('\n'),
      ),
    );
  }

  return paths;
}

function compareRunsForGolden(a: RunResult, b: RunResult): number {
  if (a.won !== b.won) return a.won ? -1 : 1;
  if (a.floorsCleared.length !== b.floorsCleared.length) {
    return b.floorsCleared.length - a.floorsCleared.length;
  }
  if (a.round !== b.round) return b.round - a.round;
  if (a.outcome !== b.outcome) {
    if (a.outcome === 'timeout') return 1;
    if (b.outcome === 'timeout') return -1;
  }
  if (a.maxBankroll !== b.maxBankroll) return b.maxBankroll - a.maxBankroll;
  return b.bankroll - a.bankroll;
}

export function bestRun(results: readonly RunResult[]): RunResult | undefined {
  return [...results].sort(compareRunsForGolden)[0];
}

export async function writeRakeReports(
  outDir: string,
  results: readonly RakeFloorResult[],
): Promise<string[]> {
  const rows: (string | number | boolean)[][] = [
    ['floor', 'floorName', 'runs', 'spins', 'lipDrops', 'gutterLosses', 'rake', 'target', 'tolerance', 'inBand'],
    ...results.map((result) => [
      result.floorId,
      result.floorName,
      result.runs,
      result.spins,
      result.lipDrops,
      result.gutterLosses,
      result.rake,
      result.target,
      result.tolerance,
      result.inBand,
    ]),
  ];

  const md = [
    '# Rake report (AC-5)',
    '',
    'Gutter share of tokens leaving the shelf, measured with no trinkets.',
    '',
    'Each sample plays a fresh three-round (21 spin) no-trinket segment on the real floor; quota pressure is neutralised so the sample can play out. All events come from the integrated GameCore.',
    '',
    '| Floor | Spins | Lip drops | Gutter losses | Rake | Target | Band | Status |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ...results.map(
      (result) =>
        `| ${result.floorId} | ${result.spins} | ${result.lipDrops} | ${result.gutterLosses} | ${formatPercent(result.rake)} | ${formatPercent(result.target)} | ±${formatPercent(result.tolerance)} | ${result.inBand ? 'PASS' : 'FAIL'} |`,
    ),
    '',
    'Out-of-band floors are tuning work (T-082); the report is still written.',
    '',
  ];

  return [
    await write(outDir, 'rake.csv', csv(rows)),
    await write(outDir, 'rake.md', md.join('\n')),
  ];
}

export async function writeHitRateReports(
  outDir: string,
  result: HitRateResult,
): Promise<string[]> {
  const rows: (string | number | boolean)[][] = [
    ['spins', 'evaluations', 'winningEvaluations', 'hitRate', 'targetLow', 'targetHigh', 'inBand', 'ticks'],
    [
      result.spins,
      result.evaluations,
      result.winningEvaluations,
      result.hitRate,
      result.targetLow,
      result.targetHigh,
      result.inBand,
      result.ticks,
    ],
  ];

  const md = [
    '# Hit-rate report (AC-7)',
    '',
    'Base 3x3 CLASSIC grid; a spin counts as a hit when at least one evaluation wins.',
    '',
    '| Spins | Evaluations | Winning evaluations | Hit rate | Target | Status |',
    '| ---: | ---: | ---: | ---: | --- | --- |',
    `| ${result.spins} | ${result.evaluations} | ${result.winningEvaluations} | ${formatPercent(result.hitRate)} | ${formatPercent(result.targetLow)}–${formatPercent(result.targetHigh)} | ${result.inBand ? 'PASS' : 'FAIL'} |`,
    '',
    'An out-of-band hit rate is tuning work (T-082).',
    '',
  ];

  return [
    await write(outDir, 'hitrate.csv', csv(rows)),
    await write(outDir, 'hitrate.md', md.join('\n')),
  ];
}

export interface ReplayReport {
  fixture: string;
  seed: string;
  expectedHash: string;
  actualHash: string;
  match: boolean;
  ticks: number;
  commands: number;
  outcome: string;
  flagged: boolean;
  flag: string | null;
}

export async function writeReplayReports(
  outDir: string,
  report: ReplayReport,
): Promise<string[]> {
  const rows: (string | number | boolean | null)[][] = [
    [
      'fixture',
      'seed',
      'expectedHash',
      'actualHash',
      'match',
      'ticks',
      'commands',
      'outcome',
      'flagged',
      'flag',
    ],
    [
      report.fixture,
      report.seed,
      report.expectedHash,
      report.actualHash,
      report.match,
      report.ticks,
      report.commands,
      report.outcome,
      report.flagged,
      report.flag,
    ],
  ];

  const md = [
    '# Golden replay report',
    '',
    `- fixture: \`${report.fixture}\``,
    `- seed: \`${report.seed}\``,
    `- expected hash: \`${report.expectedHash}\``,
    `- actual hash: \`${report.actualHash}\``,
    `- match: **${report.match ? 'PASS' : 'FAIL'}**`,
    `- ticks: ${report.ticks}`,
    `- commands: ${report.commands}`,
    `- outcome: ${report.outcome}`,
    `- flagged for T-082: ${report.flagged ? `yes (${report.flag ?? 'unspecified'})` : 'no'}`,
    '',
  ];

  return [
    await write(outDir, 'replay.csv', csv(rows)),
    await write(outDir, 'replay.md', md.join('\n')),
  ];
}

export function emptyRunStats(): RunStats {
  return {
    spins: 0,
    evaluations: 0,
    winningEvaluations: 0,
    lipDrops: 0,
    gutterLosses: 0,
    cashBanked: 0,
    maxBankroll: 0,
    itemsBought: [],
  };
}
