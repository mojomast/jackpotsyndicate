import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import {
  BUNDLE_BUDGET_BYTES,
  formatBytes,
  measureBundle,
} from '../apps/game/scripts/bundle';
import {
  auditReducedMotionCss,
  auditTouchTargetCss,
} from '../apps/game/src/app/a11yAudit';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GAME_ROOT = join(ROOT, 'apps/game');
const DIST = join(GAME_ROOT, 'dist');
const ALLOWED_URL_HOSTS = new Set([
  'www.w3.org',
  'gsap.com',
  'json-schema.org',
  'react.dev',
]);

let buildPromise: Promise<void> | null = null;

function ensureBuild(): Promise<void> {
  buildPromise ??= build({ root: GAME_ROOT, logLevel: 'error' }).then(() => undefined);
  return buildPromise;
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

test('production bundle is at most 3 MB gzip', async (t) => {
  await ensureBuild();
  const report = measureBundle(DIST);
  t.diagnostic(
    `bundle ${formatBytes(report.gzipBytes)} gzip across ${report.files.length} files; budget ${formatBytes(BUNDLE_BUDGET_BYTES)}`,
  );
  assert.ok(
    report.gzipBytes <= BUNDLE_BUDGET_BYTES,
    `bundle ${report.gzipBytes} exceeds budget ${BUNDLE_BUDGET_BYTES}`,
  );
});

test('static build keeps every URL local and makes no runtime request calls', async () => {
  await ensureBuild();

  const files = walk(DIST);
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const value = match[1]!;
    assert.ok(
      value.startsWith('./') || value.startsWith('/') || value.startsWith('data:'),
      `index.html references a non-local resource: ${value}`,
    );
  }

  const offenders: string[] = [];
  for (const file of files) {
    if (!/\.(?:html|js|css|json|svg)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
      const host = match[1]!.toLowerCase();
      if (!ALLOWED_URL_HOSTS.has(host)) {
        offenders.push(`${relative(DIST, file)} -> ${host}`);
      }
    }
  }
  assert.deepEqual(offenders, []);

  const sourceRoots = [join(GAME_ROOT, 'src'), join(ROOT, 'packages/board-render/src')];
  const networkCalls: string[] = [];
  const networkPattern = /\b(?:fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|sendBeacon\s*\()/;
  for (const root of sourceRoots) {
    for (const file of walk(root)) {
      if (!/\.(?:ts|tsx)$/.test(file)) continue;
      if (networkPattern.test(readFileSync(file, 'utf8'))) networkCalls.push(relative(ROOT, file));
    }
  }
  assert.deepEqual(networkCalls, []);
});

test('reduced motion and 390px touch targets are covered in the shipped CSS', () => {
  const css = readFileSync(join(GAME_ROOT, 'src/theme/tokens.css'), 'utf8');
  assert.deepEqual(auditReducedMotionCss(css), []);
  assert.deepEqual(auditTouchTargetCss(css), []);

  const html = readFileSync(join(GAME_ROOT, 'index.html'), 'utf8');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /width=device-width/);
});

test('axe browser pass', async (t) => {
  const blockers: string[] = [];
  let axePath = '';

  try {
    axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
  } catch {
    blockers.push('axe-core is not installed in this workspace (no dependency/lockfile change was permitted)');
  }

  let browserType: typeof import('@playwright/test').chromium | null = null;
  try {
    const playwright = await import('@playwright/test');
    browserType = playwright.chromium;
    const executable = browserType.executablePath();
    if (!existsSync(executable)) {
      blockers.push(`Playwright Chromium is not installed (expected ${executable}); run pnpm exec playwright install chromium`);
      browserType = null;
    }
  } catch (error) {
    blockers.push(`@playwright/test is unavailable: ${(error as Error).message}`);
  }

  if (blockers.length > 0) {
    t.diagnostic(`AXE: NOT RUN — ${blockers.join('; ')}`);
    return;
  }

  await ensureBuild();
  const server = await preview({
    root: GAME_ROOT,
    logLevel: 'error',
    preview: { host: '127.0.0.1', port: 4179, strictPort: false },
  });
  const base = server.resolvedUrls?.local[0];
  assert.ok(base, 'preview server did not resolve a local URL');

  const browser = await browserType!.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript({ content: readFileSync(axePath, 'utf8') });

    for (const route of ['title', 'table', 'shop', 'elevator', 'boss', 'gameover', 'victory', 'compendium', 'settings']) {
      await page.goto(`${base}#/${route}`, { waitUntil: 'load' });
      await page.waitForTimeout(120);
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (node: Document) => Promise<{ violations: { impact: string | null; id: string; nodes: unknown[] }[] }> } }).axe;
        const result = await axe.run(document);
        return result.violations
          .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
          .map((violation) => `${violation.id} (${violation.nodes.length})`);
      });
      assert.deepEqual(violations, [], `${route} has serious or critical axe violations`);
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
  }
});
