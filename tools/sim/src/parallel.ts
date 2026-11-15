/**
 * Telemetry run driver with optional process-level parallelism and content
 * variants for balance experiments.
 *
 * A variant is a module whose default export is `(content) => content`. It
 * receives a deep clone of the committed CONTENT_BUNDLE. A variant may also
 * adjust numeric `RULES` at import time to prototype rule-number changes.
 * Variants never change the committed content and never touch the golden
 * replay.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ContentBundle } from '../../../packages/contracts/src/index';
import { CONTENT_BUNDLE } from '../../../packages/content/src/index';
import type { BotId } from './bots';
import { playTelemetryRun, type TelemetryRun } from './telemetry';

export type Variant = (content: ContentBundle) => ContentBundle;

export async function loadVariant(path: string | undefined): Promise<ContentBundle | undefined> {
  if (path === undefined) return undefined;
  const mod = (await import(pathToFileURL(resolve(path)).href)) as { default?: Variant };
  if (typeof mod.default !== 'function') throw new Error(`variant ${path} has no default export function`);
  return mod.default(structuredClone(CONTENT_BUNDLE));
}

export interface TelemetryBatchOptions {
  runsPerBot: number;
  bots: readonly BotId[];
  seedBase: string;
  workers: number;
  variant?: string;
  onProgress?: (done: number, total: number) => void;
}

export function seedFor(seedBase: string, bot: BotId, run: number): string {
  return `${seedBase}:${bot}:${run}`;
}

/** Run a shard in-process: runs with index % shards === shard. */
export async function runShard(
  options: Omit<TelemetryBatchOptions, 'workers'> & { shard: number; shards: number },
): Promise<TelemetryRun[]> {
  const content = await loadVariant(options.variant);
  const out: TelemetryRun[] = [];
  const total = options.bots.length * options.runsPerBot;
  let index = 0;
  let done = 0;
  for (const bot of options.bots) {
    for (let run = 0; run < options.runsPerBot; run++, index++) {
      if (index % options.shards !== options.shard) continue;
      out.push(
        playTelemetryRun({
          seed: seedFor(options.seedBase, bot, run),
          bot,
          ...(content === undefined ? {} : { content }),
        }),
      );
      done += 1;
      options.onProgress?.(done, Math.ceil(total / options.shards));
    }
  }
  return out;
}

const INDEX_SCRIPT = fileURLToPath(new URL('./index.ts', import.meta.url));

/** Run the whole batch, fanning out to child processes when workers > 1. */
export async function runTelemetryBatch(options: TelemetryBatchOptions): Promise<TelemetryRun[]> {
  if (options.workers <= 1) {
    return runShard({ ...options, shard: 0, shards: 1 });
  }
  const dir = await mkdtemp(join(tmpdir(), 'js-feel-'));
  const total = options.bots.length * options.runsPerBot;
  const progress = new Array<number>(options.workers).fill(0);
  try {
    const children = Array.from({ length: options.workers }, (_, shard) => {
      const outFile = join(dir, `shard-${shard}.json`);
      const args = [
        ...process.execArgv,
        INDEX_SCRIPT,
        'feel-shard',
        '--runs', String(options.runsPerBot),
        '--bot', options.bots.length === 2 ? 'both' : options.bots[0]!,
        '--seed', options.seedBase,
        '--shard', `${shard}/${options.workers}`,
        '--raw-out', outFile,
        ...(options.variant === undefined ? [] : ['--variant', resolve(options.variant)]),
      ];
      return new Promise<string>((resolvePromise, reject) => {
        const child = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'pipe'], env: process.env });
        let stderr = '';
        child.stderr.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          for (const line of text.split('\n')) {
            const match = /^progress (\d+)/.exec(line);
            if (match) {
              progress[shard] = Number(match[1]);
              options.onProgress?.(progress.reduce((a, b) => a + b, 0), total);
            } else if (line.trim() !== '') {
              stderr += `${line}\n`;
            }
          }
        });
        child.on('exit', (code) => {
          if (code === 0) resolvePromise(outFile);
          else reject(new Error(`feel shard ${shard} exited ${code}: ${stderr.slice(-2000)}`));
        });
      });
    });
    const files = await Promise.all(children);
    const runs: TelemetryRun[] = [];
    for (const file of files) runs.push(...(JSON.parse(await readFile(file, 'utf8')) as TelemetryRun[]));
    // Stable order regardless of shard scheduling.
    const order = new Map<string, number>();
    let i = 0;
    for (const bot of options.bots) for (let run = 0; run < options.runsPerBot; run++) order.set(seedFor(options.seedBase, bot, run), i++);
    runs.sort((a, b) => (order.get(a.seed) ?? 0) - (order.get(b.seed) ?? 0));
    return runs;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function writeShard(path: string, runs: readonly TelemetryRun[]): Promise<void> {
  await writeFile(path, JSON.stringify(runs), 'utf8');
}
