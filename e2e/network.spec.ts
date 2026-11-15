import { expect, test } from '@playwright/test';
import {
  SEEDS,
  attach,
  clickSpin,
  mountTrinket,
  openHarness,
  runState,
  startRun,
} from './helpers';

type InstrumentedWindow = typeof window & { __NETWORK_CALLS__?: number };

test('NET: a full J1 run makes zero requests after initial load', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as InstrumentedWindow;
    target.__NETWORK_CALLS__ = 0;
    const count = (): void => {
      target.__NETWORK_CALLS__ = (target.__NETWORK_CALLS__ ?? 0) + 1;
    };

    const originalFetch = window.fetch;
    window.fetch = function trackedFetch(
      this: Window,
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      count();
      return originalFetch.call(this, input, init);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function trackedOpen(
      this: XMLHttpRequest,
      ...args: Parameters<typeof originalOpen>
    ) {
      count();
      return originalOpen.apply(this, args);
    } as typeof originalOpen;

    if (typeof navigator.sendBeacon === 'function') {
      const originalBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function trackedBeacon(
        url: string | URL,
        data?: BodyInit | null,
      ): boolean {
        count();
        return originalBeacon(url, data);
      };
    }

    const OriginalWebSocket = window.WebSocket;
    if (OriginalWebSocket) {
      const Tracked = function TrackedWebSocket(
        this: WebSocket,
        url: string | URL,
        protocols?: string | string[],
      ): WebSocket {
        count();
        return new OriginalWebSocket(url, protocols);
      } as unknown as typeof WebSocket;
      Tracked.prototype = OriginalWebSocket.prototype;
      window.WebSocket = Tracked;
    }
  });

  await openHarness(page, '#/table');
  await attach(page, { seed: SEEDS.j1, content: 'lip' });
  await startRun(page, SEEDS.j1);
  await mountTrinket(page, 'test-lip-assist');
  await page.waitForTimeout(250);

  const initialCalls = await page.evaluate(
    () => (window as InstrumentedWindow).__NETWORK_CALLS__ ?? 0,
  );
  const requests: string[] = [];
  const sockets: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('websocket', (socket) => sockets.push(socket.url()));

  const before = await runState(page);
  await clickSpin(page);
  const outcome = await page.evaluate(async (startBankroll) => {
    const api = window.__JS_TEST__!;
    const ok = await api.runUntil(
      (core) => core.getState().stats.lipDrops > 0 && core.getState().bankroll > startBankroll,
      30_000,
    );
    return { ok, state: api.getState() };
  }, before.bankroll);

  expect(outcome.ok).toBe(true);
  expect(outcome.state.stats.lipDrops).toBeGreaterThan(0);
  await page.waitForTimeout(250);

  expect(requests, `unexpected requests: ${requests.join(', ')}`).toEqual([]);
  expect(sockets, `unexpected websockets: ${sockets.join(', ')}`).toEqual([]);
  const finalCalls = await page.evaluate(
    () => (window as InstrumentedWindow).__NETWORK_CALLS__ ?? 0,
  );
  expect(finalCalls).toBe(initialCalls);
});
