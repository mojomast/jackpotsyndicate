import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const storeModule = await import('../src/store/gameStore');
const apiModule = await import('../src/testApi');
const appModule = await import('../src/app/App');
const cabinetModule = await import('../src/components/CabinetMount');

const { render, screen, cleanup, fireEvent, act } = rtl;
const { App } = appModule;
const { TEST_IDS, STORAGE_KEYS } = contracts;
const { MockGameCore, useGameStore } = storeModule;

const REQUIRED_TEST_IDS: string[] = [
  TEST_IDS.spinBtn,
  TEST_IDS.bankroll,
  TEST_IDS.quota,
  TEST_IDS.spinsLeft,
  TEST_IDS.fever,
  TEST_IDS.floorBadge,
  TEST_IDS.trinketRail,
  TEST_IDS.shopOffer(0),
  TEST_IDS.shopOffer(1),
  TEST_IDS.shopOffer(2),
  TEST_IDS.shopOffer(3),
  TEST_IDS.shopOffer(4),
  TEST_IDS.shopReroll,
  TEST_IDS.shopExpand,
  TEST_IDS.shopLeave,
  TEST_IDS.elevator('FLOOR_NEON'),
  TEST_IDS.elevator('FLOOR_CRYO'),
  TEST_IDS.elevator('FLOOR_FOUNDRY'),
  TEST_IDS.elevator('FLOOR_PENTHOUSE'),
  TEST_IDS.bossBar,
  TEST_IDS.seedDisplay,
  TEST_IDS.gameover,
  TEST_IDS.victory,
  TEST_IDS.settingsMute,
  TEST_IDS.settingsMotion,
];

beforeEach(() => {
  cleanup();
  browser.localStorage.clear();
  browser.history.replaceState({}, '', '/?test=1');
  useGameStore.setState({
    settings: { mute: false, volume: 0.6, reducedMotion: false, speed: 1 },
  });
  useGameStore.getState().attachCore(new MockGameCore());
  useGameStore.getState().newRun('SHELL-TEST');
});

after(() => {
  cleanup();
  dom.window.close();
});

test('cabinet TimelineFactory is a paused, seekable C-6 no-op', () => {
  const root = document.createElement('div');
  root.innerHTML = '<span data-anim="cell"></span>'.repeat(9);
  const finalGrid: Array<Array<'cherry' | 'seven' | 'diamond' | 'uranium' | 'skull'>> = [
    ['cherry', 'seven', 'cherry'],
    ['diamond', 'cherry', 'uranium'],
    ['skull', 'cherry', 'seven'],
  ];

  const timeline = cabinetModule.noopTimelineFactory(
    root,
    { cols: 3, rows: 3, finalGrid, seed: 42, reducedMotion: true },
    contracts.DESIGN_TOKENS,
    () => null,
  );

  assert.equal(timeline.duration(), 0);
  assert.equal(timeline.time(), 0);
  timeline.time(1.5);
  assert.equal(timeline.time(), 1.5);
  assert.equal(root.dataset.animReady, 'true');
  assert.equal(root.dataset.reducedMotion, 'true');
  assert.equal(root.querySelectorAll('[data-anim="cell"]').length, 9);
  timeline.pause();
  timeline.kill();
});

test('C-9 design tokens and full-width/900/390 responsive rules are present', () => {
  const css = readFileSync(new URL('../src/theme/tokens.css', import.meta.url), 'utf8');
  for (const value of Object.values(contracts.DESIGN_TOKENS.color)) {
    assert.ok(css.includes(value), `missing token ${value}`);
  }
  assert.match(css, /--font-sans:\s*Inter/);
  assert.match(css, /JetBrains Mono/);
  assert.match(css, /Outfit/);
  assert.match(css, /max-width:\s*none/);
  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /border-image-slice:\s*37 45 37 45 fill/);
  assert.match(css, /border-image-slice:\s*34 36 24 36 fill/);
  assert.match(css, /border-width:\s*18px 22px/);
});

test('all C-8 test ids exist in the shell', () => {
  const { container } = render(React.createElement(App, { initialRoute: 'table' }));

  for (const id of REQUIRED_TEST_IDS) {
    const found = container.querySelectorAll(`[data-testid="${id}"]`);
    assert.equal(found.length, 1, `expected exactly one ${id}, found ${found.length}`);
  }

  assert.ok(screen.getByTestId(TEST_IDS.trinketRail));
  assert.ok(screen.getByTestId(TEST_IDS.trinket('quantum-splitter-coil')));
  assert.ok(screen.getByTestId('cabinet'));
  assert.ok(screen.getByTestId('event-log'));
  assert.ok(screen.getByTestId('cascade-equation'));
});

test('MockGameCore drives the HUD, cabinet, cascade equation, trinket rail and log', () => {
  const { container } = render(React.createElement(App, { initialRoute: 'table' }));

  assert.equal(screen.getByTestId(TEST_IDS.bankroll).textContent, '$500');
  assert.equal(screen.getByTestId(TEST_IDS.quota).textContent, '$1,000');
  assert.equal(screen.getByTestId(TEST_IDS.spinsLeft).textContent, '7');
  assert.equal(screen.getByTestId(TEST_IDS.fever).textContent, '40%');

  act(() => {
    assert.deepEqual(useGameStore.getState().dispatch({ c: 'Spin' }), { ok: true });
  });
  assert.equal(useGameStore.getState().state.spinsLeft, 6);

  for (let tick = 0; tick < 220; tick++) {
    act(() => {
      useGameStore.getState().tick();
    });
  }

  assert.equal(useGameStore.getState().state.phase, 'PREP');
  assert.match(screen.getByTestId(TEST_IDS.bankroll).textContent ?? '', /\$1,436/);
  assert.equal(screen.getByTestId(TEST_IDS.fever).textContent, '60%');

  const cascade = screen.getByTestId('cascade-equation').textContent ?? '';
  assert.match(cascade, /180/);
  assert.match(cascade, /1\.8/);
  assert.match(cascade, /1,944/);

  const log = screen.getByTestId('event-log').textContent ?? '';
  assert.match(log, /Spin \d+ started/);
  assert.match(log, /Lip drop: token 101/);
  assert.match(log, /Banked \$624/);
  assert.match(log, /Phase RESOLVING → PREP/);

  assert.ok(container.querySelectorAll('[data-anim="cell"]').length >= 9);
  assert.match(
    screen.getByTestId(TEST_IDS.trinketRail).textContent ?? '',
    /Quantum Splitter Coil/,
  );
});

test('?test=1 bridge exposes newRun, dispatch, runUntil, stateHash, speed and grantCash', async () => {
  const api = apiModule.installTestApi();
  assert.equal(window.__JS_TEST__, api);
  assert.equal(apiModule.isTestMode(), true);

  api.newRun('TEST-API-SEED');
  assert.equal(api.getState().seed, 'TEST-API-SEED');
  assert.deepEqual(api.dispatch({ c: 'Spin' }), { ok: true });

  const reached = await api.runUntil((core) => core.getState().stats.lipDrops >= 2, 400);
  assert.ok(api.getState().bankroll > 500);
  assert.equal(reached, true);
  assert.ok(api.getState().stats.lipDrops >= 2);

  const beforeGrant = api.getState().bankroll;
  api.grantCash(100);
  assert.equal(api.getState().bankroll, beforeGrant + 100);

  api.setSpeed(4);
  assert.equal(useGameStore.getState().settings.speed, 4);
  assert.match(api.stateHash(), /^[0-9a-f]{16}$/);

  delete window.__JS_TEST__;
});

test('settings persist, keyboard spins, and the shell makes no network requests', () => {
  const fetchCalls: unknown[] = [];
  const originalFetch = browser.fetch;
  const originalOpen = browser.XMLHttpRequest.prototype.open;
  let xhrOpens = 0;

  Object.defineProperty(browser, 'fetch', {
    configurable: true,
    writable: true,
    value: (...args: unknown[]) => {
      fetchCalls.push(args[0]);
      return Promise.reject(new Error('network disabled in test'));
    },
  });
  browser.XMLHttpRequest.prototype.open = function open(
    this: XMLHttpRequest,
    ...args: Parameters<typeof originalOpen>
  ) {
    xhrOpens += 1;
    return originalOpen.apply(this, args);
  } as typeof originalOpen;

  try {
    render(React.createElement(App, { initialRoute: 'settings' }));

    const mute = screen.getByTestId(TEST_IDS.settingsMute) as HTMLInputElement;
    const motion = screen.getByTestId(TEST_IDS.settingsMotion) as HTMLInputElement;

    assert.equal(mute.checked, false);
    fireEvent.click(mute);
    assert.equal(mute.checked, true);

    assert.equal(motion.checked, false);
    fireEvent.click(motion);
    assert.equal(motion.checked, true);
    assert.equal(document.documentElement.dataset.reducedMotion, 'true');

    fireEvent.click(screen.getByTestId('settings-speed-4'));
    assert.equal(useGameStore.getState().settings.speed, 4);

    const saved = browser.localStorage.getItem(STORAGE_KEYS.settings);
    assert.ok(saved);
    assert.equal(JSON.parse(saved).reducedMotion, true);

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    assert.ok(screen.getByTestId(TEST_IDS.spinBtn));

    const spinsBefore = useGameStore.getState().state.spinsLeft;
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    assert.equal(useGameStore.getState().state.spinsLeft, spinsBefore - 1);

    assert.equal(fetchCalls.length, 0);
    assert.equal(xhrOpens, 0);
  } finally {
    Object.defineProperty(browser, 'fetch', {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
    browser.XMLHttpRequest.prototype.open = originalOpen;
  }
});

test('title, settings and every stub route render at 390px', () => {
  Object.defineProperty(browser, 'innerWidth', { configurable: true, writable: true, value: 390 });
  Object.defineProperty(browser, 'innerHeight', { configurable: true, writable: true, value: 844 });
  browser.dispatchEvent(new browser.Event('resize'));

  const routes = ['title', 'settings', 'shop', 'elevator', 'boss', 'gameover', 'victory', 'compendium'] as const;
  for (const route of routes) {
    const { container, unmount } = render(React.createElement(App, { initialRoute: route }));
    assert.ok(container.querySelector('.app-shell'), `${route} shell missing`);
    assert.ok(screen.getByRole('navigation', { name: 'Primary' }), `${route} nav missing`);
    unmount();
  }

  const shop = render(React.createElement(App, { initialRoute: 'shop' }));
  assert.ok(screen.getByTestId(TEST_IDS.shopOffer(0)));
  assert.ok(screen.getByTestId(TEST_IDS.shopReroll));
  shop.unmount();

  const elevator = render(React.createElement(App, { initialRoute: 'elevator' }));
  for (const floorId of ['FLOOR_NEON', 'FLOOR_CRYO', 'FLOOR_FOUNDRY', 'FLOOR_PENTHOUSE'] as const) {
    assert.ok(screen.getByTestId(TEST_IDS.elevator(floorId)));
  }
  elevator.unmount();

  const boss = render(React.createElement(App, { initialRoute: 'boss' }));
  assert.ok(screen.getByTestId(TEST_IDS.bossBar));
  boss.unmount();

  const gameover = render(React.createElement(App, { initialRoute: 'gameover' }));
  assert.ok(screen.getByTestId(TEST_IDS.gameover));
  assert.ok(screen.getByTestId(TEST_IDS.seedDisplay));
  gameover.unmount();

  const victory = render(React.createElement(App, { initialRoute: 'victory' }));
  assert.ok(screen.getByTestId(TEST_IDS.victory));
  assert.ok(screen.getByTestId(TEST_IDS.seedDisplay));
  victory.unmount();

  const table = render(React.createElement(App, { initialRoute: 'table' }));
  assert.ok(table.container.querySelectorAll('[data-anim="cell"]').length >= 9);
});
