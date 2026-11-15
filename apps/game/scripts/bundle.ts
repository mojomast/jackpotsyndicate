import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

export const BUNDLE_BUDGET_BYTES = 3 * 1024 * 1024;

export interface BundleFile {
  path: string;
  rawBytes: number;
  gzipBytes: number;
}

export interface BundleReport {
  distDir: string;
  files: BundleFile[];
  rawBytes: number;
  gzipBytes: number;
  budgetBytes: number;
  withinBudget: boolean;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

export function measureBundle(distDir: string): BundleReport {
  const files = walk(distDir)
    .map((file) => {
      const raw = readFileSync(file);
      return {
        path: relative(distDir, file).replaceAll('\\', '/'),
        rawBytes: raw.byteLength,
        gzipBytes: gzipSync(raw).byteLength,
      };
    })
    .sort((left, right) => right.gzipBytes - left.gzipBytes);

  const rawBytes = files.reduce((total, file) => total + file.rawBytes, 0);
  const gzipBytes = files.reduce((total, file) => total + file.gzipBytes, 0);

  return {
    distDir,
    files,
    rawBytes,
    gzipBytes,
    budgetBytes: BUNDLE_BUDGET_BYTES,
    withinBudget: gzipBytes <= BUNDLE_BUDGET_BYTES,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${bytes} B`;
}

export function bundleLines(report: BundleReport): string[] {
  const lines = report.files
    .filter((file) => file.rawBytes > 0)
    .slice(0, 12)
    .map(
      (file) =>
        `  ${file.path.padEnd(42)} ${formatBytes(file.rawBytes).padStart(9)} raw  ${formatBytes(file.gzipBytes).padStart(9)} gzip`,
    );
  lines.push(
    `Bundle total: ${formatBytes(report.gzipBytes)} gzip of ${formatBytes(report.budgetBytes)} budget (${report.withinBudget ? 'PASS' : 'FAIL'})`,
  );
  return lines;
}
