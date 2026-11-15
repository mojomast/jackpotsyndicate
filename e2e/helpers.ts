import { expect, type Page } from '@playwright/test';
import type { Phase, RunState } from '../packages/contracts/src/index';

export const SEEDS = {
  j1: 'SEED-1',
  j2: 'J2-SEED-2',
  j3: 'J3-SEED',
  j4: 'J4-FAIL-1',
  j5: 'J5-E2E',
  j6: 'J6-E2E',
  j8: 'J8-COMFORT',
} as const;

export type ContentVariant = 'default' | 'lip' | 'j6';

export async function openHarness(page: Page, hash = '#/table'): Promise<void> {
  await page.goto(`/?test=1${hash}`);
  await page.waitForFunction(
    () => Boolean(window.__JS_TEST__ && window.__E2E__ && document.getElementById('root')?.childElementCount),
  );
}

export async function attach(
  page: Page,
  options: { seed?: string; content?: ContentVariant } = {},
): Promise<void> {
  await page.evaluate((value) => {
    window.__E2E__!.attach(value);
  }, options);
}

export async function startRun(page: Page, seed: string): Promise<void> {
  await page.evaluate((value) => {
    window.__JS_TEST__!.newRun(value);
  }, seed);
}

export async function grantCash(page: Page, amount: number): Promise<void> {
  await page.evaluate((value) => {
    window.__JS_TEST__!.grantCash(value);
  }, amount);
}

export async function mountTrinket(page: Page, itemId: string): Promise<void> {
  await page.evaluate((value) => {
    window.__E2E__!.mountTrinket(value);
  }, itemId);
}

export async function runState(page: Page): Promise<Readonly<RunState>> {
  return page.evaluate(() => window.__JS_TEST__!.getState());
}

export async function stateHash(page: Page): Promise<string> {
  return page.evaluate(() => window.__JS_TEST__!.stateHash());
}

export async function advanceToPhase(
  page: Page,
  phases: Phase[],
  maxTicks = 30_000,
): Promise<boolean> {
  return page.evaluate(
    async ({ targets, budget }) => {
      const api = window.__JS_TEST__!;
      return api.runUntil((core) => targets.includes(core.getState().phase), budget);
    },
    { targets: phases, budget: maxTicks },
  );
}

export async function advanceUntilSpins(page: Page, spins: number, maxTicks = 30_000): Promise<boolean> {
  return page.evaluate(
    async ({ target, budget }) => {
      const api = window.__JS_TEST__!;
      return api.runUntil(
        (core) => {
          const state = core.getState();
          return state.stats.spins >= target && state.phase === 'PREP';
        },
        budget,
      );
    },
    { target: spins, budget: maxTicks },
  );
}

export async function clickSpin(page: Page): Promise<void> {
  const button = page.getByTestId('spin-btn');
  await expect(button).toBeEnabled();
  await button.click();
  await page.waitForFunction(() => window.__JS_TEST__!.getState().phase !== 'PREP');
}

export async function spinAndWait(page: Page, terminals: Phase[] = ['PREP']): Promise<void> {
  await clickSpin(page);
  const reached = await advanceToPhase(page, terminals);
  expect(reached, `spin did not reach ${terminals.join('/')}`).toBe(true);
}

export async function playRoundToResult(page: Page): Promise<void> {
  for (let spin = 0; spin < 6; spin += 1) {
    await spinAndWait(page, ['PREP']);
  }
  await spinAndWait(page, ['ROUND_RESULT', 'GAME_OVER']);
}

export async function dispatchContinue(page: Page): Promise<Phase> {
  return page.evaluate(() => {
    const api = window.__JS_TEST__!;
    const result = api.dispatch({ c: 'ContinueAfterRound' });
    if (!result.ok) throw new Error(`ContinueAfterRound failed: ${result.error}`);
    return api.getState().phase;
  });
}

export async function leaveShop(page: Page): Promise<Phase> {
  return page.evaluate(() => {
    const api = window.__JS_TEST__!;
    const result = api.dispatch({ c: 'ShopLeave' });
    if (!result.ok) throw new Error(`ShopLeave failed: ${result.error}`);
    return api.getState().phase;
  });
}

export async function goToRoute(page: Page, route: string): Promise<void> {
  await page.evaluate((value) => {
    window.location.hash = `#/${value}`;
  }, route);
}

export async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__E2E__!.startRecording();
  });
}

export async function recordedEvents(page: Page) {
  return page.evaluate(() => window.__E2E__!.recordedEvents());
}

export async function eventLog(page: Page): Promise<string> {
  return page.getByTestId('event-log').innerText();
}
