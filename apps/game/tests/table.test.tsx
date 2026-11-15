import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
// @ts-expect-error jsdom is JavaScript-only in this workspace (no @types/jsdom).
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://localhost/?test=1',
  pretendToBeVisual: true,
});

const browser = dom.window;

Object.defineProperties(globalThis, {
  window: { value: browser, configurable: true, writable: true },
  document: { value: browser.document, configurable: true, writable: true },
  navigator: { value: browser.navigator, configurable: true, writable: true },
  HTMLElement: { value: browser.HTMLElement, configurable: true, writable: true },
  HTMLInputElement: { value: browser.HTMLInputElement, configurable: true, writable: true },
  Node: { value: browser.Node, configurable: true, writable: true },
  Event: { value: browser.Event, configurable: true, writable: true },
  KeyboardEvent: { value: browser.KeyboardEvent, configurable: true, writable: true },
  MouseEvent: { value: browser.MouseEvent, configurable: true, writable: true },
  HTMLSelectElement: { value: browser.HTMLSelectElement, configurable: true, writable: true },
  localStorage: { value: browser.localStorage, configurable: true, writable: true },
  getComputedStyle: { value: browser.getComputedStyle.bind(browser), configurable: true, writable: true },
  requestAnimationFrame: {
    value: (callback: FrameRequestCallback) => browser.setTimeout(() => callback(Date.now()), 16),
    configurable: true,
    writable: true,
  },
  cancelAnimationFrame: {
    value: (handle: number) => browser.clearTimeout(handle),
    configurable: true,
    writable: true,
  },
  IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true, writable: true },
});

if (!browser.matchMedia) {
  Object.defineProperty(browser, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

const React = await import('react');
const rtl = await import('@testing-library/react');
const contracts = await import('@jackpotsyndicate/contracts');
const contentModule = await import('../../../packages/content/src/index');
const storeModule = await import('../src/store/gameStore');
const mockModule = await import('./helpers/mockGameCore');
const apiModule = await import('../src/testApi');
const tableModule = await import('../src/screens/table/index');
const hudModule = await import('../src/components/Hud');
const persistenceModule = await import('../src/screens/meta/persistence');

const { render, screen, cleanup, fireEvent } = rtl;
const { TEST_IDS, STORAGE_KEYS } = contracts;
const { CONTENT_BUNDLE } = contentModule;
const { useGameStore } = storeModule;
const { MockGameCore } = mockModule;
const { TableScreen, createTableCore } = tableModule;
const { Hud } = hudModule;
const { saveCore } = persistenceModule;

type GameEvent = import('@jackpotsyndicate/contracts').GameEvent;
type RunState = import('@jackpotsyndicate/contracts').RunState;
type CoreWithEvents = import('@jackpotsyndicate/contracts').GameCore & {
  subscribe?: (listener: (event: GameEvent) => void) => () => void;
};

const LIP_ASSIST = {
  id: 'test-lip-assist',
  name: 'Test Lip Assist',
  desc: 'Test-only hook that nudges spawned tokens toward the lip.',
  price: 0,
  spriteKey: 'trinket.test-lip-assist',
  rarity: 'common' as const,
  category: 'TRINKET' as const,
  effects: [
    {
      handler: 'onTokenSpawn',
      params: { action: 'simDirective', directive: 'nudgeForward', distance: 200 },
    },
  ],
};

beforeEach(() => {
  cleanup();
  browser.localStorage.clear();
  browser.history.replaceState({}, '', '/?test=1');
  useGameStore.setState({
    settings: { mute: false, volume: 0.6, reducedMotion: false, speed: 1 },
  });
  useGameStore.getState().attachCore(new MockGameCore());
  useGameStore.getState().newRun('TABLE-BASELINE');
  delete browser.__JS_TEST__;
});

after(() => {
  cleanup();
  dom.window.close();
});

test('real Table mounts cabinet, board, HUD, audio and command-only prep controls', () => {
  const core = createTableCore({ seed: 'TABLE-MOUNT' });
  assert.deepEqual(core.dispatch({ c: 'NewRun', seed: 'TABLE-MOUNT' }), { ok: true });
  core.tick();
  (core.getState() as RunState).drinkTray[0] = 'dirtySyndicateMartini';
  useGameStore.getState().attachCore(core);

  const { container } = render(React.createElement(TableScreen));

  assert.ok(screen.getByTestId('cabinet'));
  assert.ok(screen.getByTestId('board'));
  assert.ok(screen.getByTestId('prep-controls'));
  assert.ok(screen.getByTestId('table-speed'));
  assert.ok(screen.getByTestId(TEST_IDS.bankroll));
  assert.ok(screen.getByTestId(TEST_IDS.spinBtn));

  const cabinet = screen.getByTestId('cabinet');
  assert.match(cabinet.textContent ?? '', /SYNDICATE/);
  assert.ok(cabinet.querySelectorAll('[data-anim="cell"]').length >= 9);
  assert.equal(
    container.querySelector('[data-testid="board"] svg')?.getAttribute('viewBox'),
    '0 0 600 510',
  );
  assert.ok(
    (container.querySelectorAll('[data-testid="board"] image').length) > 0,
    'the board must render real floor, peg, orb or token artwork',
  );
  assert.ok(container.querySelector('.slot-frame-art'), 'the slot cabinet chrome must be rendered');
  assert.ok(
    container.querySelector('.slot-frame-window [data-anim="cell"]'),
    'the live reel grid must sit inside the cabinet window',
  );
  assert.ok(container.querySelector('.hud.ui9-panel'), 'the HUD must use the 9-slice frame');
  assert.ok(container.querySelector('.hud-spin.ui9-button'), 'the spin button must use the 9-slice frame');

  fireEvent.change(screen.getByTestId('prep-overvolt'), { target: { value: 'row:0' } });
  assert.equal(useGameStore.getState().state.overvoltLineId, 'row:0');
  fireEvent.change(screen.getByTestId('prep-overvolt'), { target: { value: '' } });
  assert.equal(useGameStore.getState().state.overvoltLineId, null);

  fireEvent.click(screen.getByTestId('prep-coin-copper'));
  assert.equal(useGameStore.getState().state.loadedCoin, 'copper');

  fireEvent.click(screen.getByTestId('prep-drink-0'));
  assert.equal(useGameStore.getState().state.activeDrink, 'dirtySyndicateMartini');
  assert.equal(useGameStore.getState().state.drinkTray[0], null);

  fireEvent.click(screen.getByTestId('table-speed-4'));
  assert.equal(useGameStore.getState().settings.speed, 4);
  fireEvent.click(screen.getByTestId('table-speed-1'));
  assert.equal(useGameStore.getState().settings.speed, 1);
});

test('HUD quota follows the content table on every floor (not the shallow prototype formula)', () => {
  const baseline = useGameStore.getState().state;
  useGameStore.setState({ state: { ...baseline, floorId: 'FLOOR_CRYO', round: 1 } });

  render(React.createElement(Hud));
  assert.equal(
    screen.getByTestId(TEST_IDS.quota).textContent,
    '$9,261',
    'Cryo round 1 must use the content quota, not the 1000 × local-scale shortcut',
  );
});

test('store snapshots a real core so React subscribers observe engine updates', () => {
  const core = createTableCore({ seed: 'STORE-SNAPSHOT' });
  assert.deepEqual(core.dispatch({ c: 'NewRun', seed: 'STORE-SNAPSHOT' }), { ok: true });
  core.tick();
  useGameStore.getState().attachCore(core);

  const before = useGameStore.getState().state;
  core.tick();
  useGameStore.getState().tick();
  const after = useGameStore.getState().state;

  assert.notEqual(before, after, 'the store must not expose the core-owned mutable object to React');
  assert.notEqual(before.tick, after.tick);
});

test('saveCore refuses transient spin phases instead of writing a bricked save', () => {
  const core = useGameStore.getState().core;
  assert.deepEqual(core.dispatch({ c: 'Spin' }), { ok: true });
  assert.equal(core.getState().phase, 'SPINNING');

  assert.equal(saveCore(core), null);
  assert.equal(browser.localStorage.getItem(STORAGE_KEYS.save), null);
});

test('saveCore writes durable picker and settle phases', () => {
  const fakeCore = (phase: string) =>
    ({
      getState: () => ({ phase }),
      save: () => ({
        saveVersion: 1,
        contractsRev: 1,
        run: {},
        simBase64: '',
        stateHash: '',
      }),
    }) as never;

  assert.ok(saveCore(fakeCore('RELIC_PICK')));
  assert.ok(saveCore(fakeCore('JUMPER_PICK')));
  assert.ok(saveCore(fakeCore('ROUND_SETTLE')));
});

test('J1: fixed-seed spin reaches LipDrop and increases bankroll through the real GameCore', async () => {
  const content = { ...CONTENT_BUNDLE, items: [...CONTENT_BUNDLE.items, LIP_ASSIST] };
  const core = createTableCore({ content, seed: 'SEED-1' });
  assert.deepEqual(core.dispatch({ c: 'NewRun', seed: 'SEED-1' }), { ok: true });
  core.tick();
  assert.ok(core.mountTrinket);
  core.mountTrinket('test-lip-assist');
  useGameStore.getState().attachCore(core);

  const api = apiModule.installTestApi(core);
  const startBankroll = api.getState().bankroll;
  const events: GameEvent[] = [];
  const unsubscribe = (core as CoreWithEvents).subscribe?.((event) => events.push(event));

  const { container } = render(React.createElement(TableScreen));
  assert.equal(container.querySelector('.table-screen')?.getAttribute('data-core'), 'Core');

  fireEvent.click(screen.getByTestId(TEST_IDS.spinBtn));
  assert.equal(useGameStore.getState().state.phase, 'SPINNING');

  const reached = await api.runUntil(
    (target) => target.getState().stats.lipDrops > 0 && target.getState().bankroll > startBankroll,
    3000,
  );

  assert.equal(reached, true);
  const cashBanked = events
    .filter((event) => event.t === 'CashBanked')
    .reduce((sum, event) => sum + (event as Extract<GameEvent, { t: 'CashBanked' }>).cash, 0);

  assert.ok(cashBanked > 0, 'a valued token must cross the lip');
  assert.equal(api.getState().bankroll, startBankroll + cashBanked);
  assert.ok(events.some((event) => event.t === 'LipDrop'));
  assert.ok(events.some((event) => event.t === 'TokenSpawned'));
  assert.ok(events.some((event) => event.t === 'OrbLaunched'));
  assert.ok(api.getState().stats.lipDrops > 0);

  const bankrollText = screen.getByTestId(TEST_IDS.bankroll).textContent ?? '';
  assert.match(bankrollText, /\$/);

  unsubscribe?.();
  delete browser.__JS_TEST__;
});

test('J6: real shop chassis mutation re-lays out four WAYS reels and the next spin evaluates by ways', async () => {
  const chassisIds = new Set(['reelColumn', 'waysHarness']);
  const content = {
    ...CONTENT_BUNDLE,
    items: CONTENT_BUNDLE.items.filter((item) => chassisIds.has(item.id)),
    balance: {
      ...CONTENT_BUNDLE.balance,
      quotas: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      baseStrip: ['cherry'] as typeof CONTENT_BUNDLE.balance.baseStrip,
      firstReelStrip: ['cherry'] as typeof CONTENT_BUNDLE.balance.firstReelStrip,
    },
    floors: CONTENT_BUNDLE.floors.map((floor) => ({
      ...floor,
      shop: {
        ...floor.shop,
        categoryWeights: { TRINKET: 0, DRINK: 0, REEL: 0, COIN: 0, CHASSIS: 100 },
      },
    })),
  };

  const core = createTableCore({ content, seed: 'J6-FIXED' });
  assert.deepEqual(core.dispatch({ c: 'NewRun', seed: 'J6-FIXED' }), { ok: true });
  core.tick();
  useGameStore.getState().attachCore(core);

  const api = apiModule.installTestApi(core);
  const { container } = render(React.createElement(TableScreen));

  api.grantCash(5000);
  assert.equal(api.getState().bankroll, 5500);

  for (let spin = 0; spin < 7; spin++) {
    assert.deepEqual(api.dispatch({ c: 'Spin' }), { ok: true });
    const done = await api.runUntil((target) => {
      const state = target.getState();
      return state.stats.spins >= spin + 1
        && state.phase !== 'SPINNING'
        && state.phase !== 'RESOLVING';
    }, 5000);
    assert.equal(done, true, `spin ${spin + 1} did not resolve`);
  }

  assert.equal(api.getState().phase, 'ROUND_SETTLE');
  assert.equal(await api.runUntil('ROUND_RESULT', 600), true);
  assert.deepEqual(api.dispatch({ c: 'ContinueAfterRound' }), { ok: true });
  assert.equal(await api.runUntil('SHOP', 20), true);

  const offers = api.getState().shop.offers;
  const reelOffer = offers.find((offer) => offer.itemId === 'reelColumn');
  const waysOffer = offers.find((offer) => offer.itemId === 'waysHarness');
  assert.ok(reelOffer, 'shop must offer +Reel Column');
  assert.ok(waysOffer, 'shop must offer WAYS Harness');

  assert.deepEqual(api.dispatch({ c: 'ShopBuy', offerId: reelOffer.offerId }), { ok: true });
  assert.equal(api.getState().grid.cols, 4);

  assert.deepEqual(api.dispatch({ c: 'ShopBuy', offerId: waysOffer.offerId }), { ok: true });
  assert.equal(api.getState().grid.wiring, 'WAYS');

  assert.deepEqual(api.dispatch({ c: 'ShopLeave' }), { ok: true });
  for (let tick = 0; tick < 6; tick++) useGameStore.getState().tick();

  const liveCells = Array.from(container.querySelectorAll('[data-anim="cell"]'))
    .filter((cell) => cell.closest('[data-anim="relayout-previous"]') === null);
  assert.equal(
    liveCells.length,
    12,
    'the live cabinet must re-layout to 4×3 without a reload',
  );
  assert.equal(api.getState().grid.cols, 4);
  assert.equal(api.getState().grid.wiring, 'WAYS');

  const events: GameEvent[] = [];
  const unsubscribe = (core as CoreWithEvents).subscribe?.((event) => events.push(event));

  assert.deepEqual(api.dispatch({ c: 'Spin' }), { ok: true });
  const completed = await api.runUntil((target) => {
    const state = target.getState();
    return state.stats.spins >= 8 && state.phase !== 'SPINNING' && state.phase !== 'RESOLVING';
  }, 5000);
  assert.equal(completed, true);

  const evaluated = events.find((event) => event.t === 'SpinEvaluated') as
    | Extract<GameEvent, { t: 'SpinEvaluated' }>
    | undefined;
  assert.ok(evaluated, 'the next spin must evaluate');
  assert.ok(evaluated.orbPlan.length >= 1);
  assert.ok(evaluated.wins.length > 0, 'an all-cherry 4×3 grid must produce WAYS wins');
  assert.ok(evaluated.wins.every((win) => win.kind === 'ways'));
  assert.ok(events.some((event) => event.t === 'OrbLaunched'));

  unsubscribe?.();
  delete browser.__JS_TEST__;
});
