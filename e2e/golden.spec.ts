import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openHarness } from './helpers';

interface GoldenFixture {
  seed: string;
  expectedHash: string;
  ticks: number;
}

const golden = JSON.parse(
  readFileSync(new URL('../fixtures/replay.golden.json', import.meta.url), 'utf8'),
) as GoldenFixture;

test('AC-3/J7: golden replay runs in the browser and reaches Victory with the committed hash', async ({ page }) => {
  await openHarness(page, '#/table');

  const replayed = await page.evaluate(() => window.__E2E__!.playGolden());

  expect(replayed.hash).toBe(golden.expectedHash);
  expect(replayed.expected).toBe(golden.expectedHash);
  expect(replayed.phase).toBe('VICTORY');
  expect(replayed.seed).toBe(golden.seed);
  expect(replayed.ticks).toBe(golden.ticks);
  expect(replayed.events).toBeGreaterThan(0);

  await expect(page.getByTestId('victory')).toBeVisible();
  await expect(page.getByTestId('seed-display')).toHaveText(golden.seed);
  await expect(page.getByTestId('victory')).toContainText('3 / 3');
  await expect(page.getByTestId('victory-bankroll')).toContainText('$');

  const liveHash = await page.evaluate(() => window.__JS_TEST__!.stateHash());
  expect(liveHash).toBe(golden.expectedHash);
});
