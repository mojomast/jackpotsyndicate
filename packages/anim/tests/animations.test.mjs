import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'vite';
import { readdir, readFile } from 'node:fs/promises';
import { launchBrowser } from '../scripts/browser.mjs';
import { checkSource } from '../scripts/lint.mjs';

let server, browser, page;
beforeAll(async () => {
  server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0 } }); await server.listen();
  browser = await launchBrowser(); page = await browser.newPage();
  await page.goto(`${server.resolvedUrls.local[0]}tests/harness.html`); await page.waitForFunction('!!window.qa');
});
afterAll(async () => { await browser?.close(); await server?.close(); });
const all = [];
for (const file of await readdir('fixtures')) if (file.endsWith('.json')) all.push([file.slice(0, -5), JSON.parse(await readFile(`fixtures/${file}`, 'utf8'))]);
describe('seekable factory contracts', () => {
  for (const [fixture, params] of all) for (const reducedMotion of [false, true]) {
    const name = fixture.split('-')[0];
    test(`${fixture}: 10 ordered/reverse/direct/shuffled samples, reduced=${reducedMotion}`, async () => {
      const result = await page.evaluate((args) => window.qa.seekCheck(...args), [name, { ...params, reducedMotion }]);
      expect(result).toEqual({ pass: true });
    });
  }
  for (const [fixture, params] of all) test(`${fixture}: opacity-only reduced motion, identical duration`, async () => {
    const result = await page.evaluate(args => window.qa.reducedCheck(...args), [fixture.split('-')[0], params]);
    expect(result.violations).toEqual([]); expect(result.duration).toBe(result.fullDuration);
  });
});
describe('grid and tick contracts', () => {
  for (const cols of [3, 4, 5]) for (const rows of [3, 4]) for (const reduced of [false, true]) {
    test(`${cols}×${rows}: reel symbols stop at exact ticks; frozen cell stays fixed; reduced=${reduced}`, async () => {
      const r = await page.evaluate(args => window.qa.reelTiming(...args), [cols, rows, reduced]);
      expect(r.duration).toBeCloseTo(r.expectedDuration, 7); expect(r.checks.filter(c => !c.pass)).toEqual([]);
    });
    test(`${cols}×${rows}: ordered launches and deduplication; reduced=${reduced}`, async () => {
      const r = await page.evaluate(args => window.qa.lineTiming(...args), [cols, rows, reduced]);
      expect(r.drops).toBe(cols); for (const c of r.checks) { expect(c.before).toBe(true); expect(c.after).toBe(true); expect(c.label).toBeCloseTo(c.expected, 7); }
    });
  }
  for (const cols of [3, 4, 5]) for (const rows of [3, 4]) for (const width of [280, 390, 720]) test(`${cols}×${rows}: cabinet layout at ${width}px`, async () => {
    expect(await page.evaluate(args => window.qa.layout(...args), [cols, rows, width])).toEqual({ count: cols * rows, fits: true, overflow: false });
  });
  const durations = { fever: 1, bossIntro: 3, floorTransition: 2.5, victory: 4, gameOver: 3, tumbleStep: .6, gridRelayout: 1.5 };
  for (const [name, duration] of Object.entries(durations)) test(`${name}: exact duration`, async () => {
    expect(await page.evaluate(name => window.qa.present(name, window.qa.fixtures[name], 0, 620), name)).toBe(duration);
  });
});
test('TimelinePlayer uses the supplied tick, clamps, stays paused, and completes once per play', async () => {
  expect(await page.evaluate(() => window.qa.playerCheck())).toEqual({ time: .5, clamped: 0, once: 1, twice: 2, paused: true, stopped: true });
});
test('source has no nondeterministic clocks, timers, or unseeded random calls', async () => { expect(await checkSource()).toEqual([]); });
