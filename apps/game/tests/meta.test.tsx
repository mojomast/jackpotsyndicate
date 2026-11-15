import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { FloorId, RunState, ShopOffer } from '@jackpotsyndicate/contracts';
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
const coreModule = await import('@jackpotsyndicate/core');
const contentModule = await import('../../../packages/content/src/index');
const engineModule = await import('../../../packages/engine/src/index');
const storeModule = await import('../src/store/gameStore');
const apiModule = await import('../src/testApi');
const railModule = await import('../src/components/TrinketRail');
const meta = await import('../src/screens/meta/index');

const { render, screen, cleanup, fireEvent, act } = rtl;
const { TEST_IDS, STORAGE_KEYS, SAVE_VERSION } = contracts;
const { Core } = coreModule;
const { CONTENT_BUNDLE } = contentModule;
const { runStateHash } = engineModule;
const { useGameStore } = storeModule;
const { TrinketRail } = railModule;
const {
  BossIntroScreen,
  BossBar,
  CompendiumScreen,
  ElevatorScreen,
  GameOverScreen,
  MetaRouter,
  ResumePrompt,
  RoundResultScreen,
  SeedEntry,
  ShopScreen,
  VictoryScreen,
} = meta;

const CONTENT = CONTENT_BUNDLE;

function makeCore(seed = 'META-TEST'): InstanceType<typeof Core> {
  const core = new Core({ content: CONTENT, seed });
  assert.deepEqual(core.dispatch({ c: 'NewRun', seed }), { ok: true });
  return core;
}

/** Modify a saved state in a test, then load it through the real GameCore API. */
function fabricate(core: InstanceType<typeof Core>, mutate: (state: RunState) => void): void {
  const save = core.save();
  mutate(save.run);
  save.stateHash = `${runStateHash(save.run)}${save.stateHash.slice(8)}`;
  assert.deepEqual(core.load(save), { ok: true });
}

function attach(core: InstanceType<typeof Core>) {
  useGameStore.getState().attachCore(core);
  const api = apiModule.installTestApi(core);
  return api;
}

function offer(
  offerId: string,
  itemId: string,
  category: ShopOffer['category'],
  price: number,
): ShopOffer {
  return { offerId, itemId, category, price, sold: false };
}

function makeShopState(core: InstanceType<typeof Core>, offers: ShopOffer[], bankroll = 50_000) {
  fabricate(core, (state) => {
    state.phase = 'SHOP';
    state.round = 2;
    state.floorId = 'FLOOR_NEON';
    state.bankroll = bankroll;
    state.shop = {
      capacity: 8,
      rerollCost: 25,
      expandCost: 150,
      archetype: 'MIXED',
      offers: offers.map((entry) => ({ ...entry })),
    };
  });
}

const FULL_SHELF: ShopOffer[] = [
  offer('offer-trinket', 'turboDozerCam', 'TRINKET', 200),
  offer('offer-drink', 'dirtySyndicateMartini', 'DRINK', 110),
  offer('offer-coin', 'heavyLeadSlug', 'COIN', 150),
  offer('offer-reel', 'bloodDiamondGlyph', 'REEL', 220),
  offer('offer-chassis', 'hyperHarness', 'CHASSIS', 300),
  offer('offer-jumper', 'jumperWire', 'CHASSIS', 200),
];

beforeEach(() => {
  cleanup();
  browser.localStorage.clear();
  browser.history.replaceState({}, '', '/?test=1');
  delete (window as { __JS_TEST__?: unknown }).__JS_TEST__;
  useGameStore.setState({
    settings: { mute: false, volume: 0.6, reducedMotion: false, speed: 1 },
    events: [],
    lastSpin: null,
    lastDropMult: 1,
  });
  const core = makeCore('META-BASE');
  useGameStore.getState().attachCore(core);
  apiModule.installTestApi(core);
});

after(() => {
  cleanup();
  dom.window.close();
});

test('J2: shop trinket purchase goes through the test API and mounts on the rail', async () => {
  const core = makeCore('J2-SEED');
  makeShopState(core, [offer('offer-trinket', 'turboDozerCam', 'TRINKET', 200)]);
  const api = attach(core);
  const before = api.getState().bankroll;

  render(React.createElement(ShopScreen, { onNavigate: () => undefined }));
  assert.equal(screen.getByTestId(TEST_IDS.shopOffer(0)).textContent?.includes('Turbo Dozer Cam'), true);
  assert.equal(screen.getByTestId('shop-archetype').textContent, 'Mixed');

  await act(async () => {
    fireEvent.click(screen.getByTestId(TEST_IDS.shopOffer(0)));
  });

  const after = api.getState();
  assert.equal(after.trinkets.includes('turboDozerCam'), true);
  assert.equal(after.bankroll, before - 200);

  render(React.createElement(TrinketRail));
  assert.ok(screen.getByTestId(TEST_IDS.trinket('turboDozerCam')));

  await act(async () => {
    fireEvent.click(screen.getByTestId(TEST_IDS.shopLeave));
  });
  assert.equal(api.getState().phase, 'PREP');
  assert.equal(api.getState().round, 3);
});

test('every shop purchase type works, including reel and jumper target pickers', async () => {
  const core = makeCore('SHOP-SEED');
  makeShopState(core, FULL_SHELF);
  const api = attach(core);
  const startingStrips = api.getState().grid.strips.map((strip) => strip.length);

  render(React.createElement(ShopScreen, { onNavigate: () => undefined }));

  await act(async () => {
    fireEvent.click(screen.getByTestId(TEST_IDS.shopOffer(0)));
  });
  assert.equal(api.getState().trinkets.includes('turboDozerCam'), true);

  await act(async () => {
    fireEvent.click(screen.getByTestId(TEST_IDS.shopOffer(1)));
  });
  assert.equal(api.getState().drinkTray.includes('dirtySyndicateMartini'), true);

  await act(async () => {
    fireEvent.click(screen.getByTestId(TEST_IDS.shopOffer(2)));
  });
  assert.equal(api.getState().ownedCoins.includes('heavyLeadSlug'), true);

  await act(async () => {
    fireEvent.click(screen.getByTestId(TEST_IDS.shopOffer(4)));
  });
  assert.equal(api.getState().grid.wiring, 'HYPER');

  await act(async () => {
    fireEvent.click(screen.getByTestId(TEST_IDS.shopOffer(3)));
  });
  assert.ok(screen.getByTestId('reel-target-picker'));
  await act(async () => {
    fireEvent.click(screen.getByTestId('reel-target-1'));
  });
  const stripsAfter = api.getState().grid.strips.map((strip) => strip.length);
  assert.equal(stripsAfter[1], startingStrips[1]! + 1);

  await act(async () => {
    fireEvent.click(screen.getByTestId(TEST_IDS.shopOffer(5)));
  });
  assert.equal(api.getState().phase, 'JUMPER_PICK');
  assert.ok(screen.getByTestId('jumper-target-0'));
  await act(async () => {
    fireEvent.click(screen.getByTestId('jumper-target-0'));
  });
  assert.equal(api.getState().jumpers.length, 1);
  assert.equal(api.getState().phase, 'SHOP');
});

test('J3: boss bar, relic choice and elevator branch to Cryo physics', async () => {
  const core = makeCore('J3-SEED');
  fabricate(core, (state) => {
    state.phase = 'ROUND_RESULT';
    state.floorId = 'FLOOR_NEON';
    state.round = 4;
    state.spinsLeft = 0;
    state.roundCash = 2_400;
    state.bankroll = 30_000;
    state.boss = { score: 1_800, spin: 7 };
    state.floorsCleared = [];
  });
  const api = attach(core);

  render(React.createElement(BossIntroScreen, { onNavigate: () => undefined }));
  assert.ok(screen.getByTestId(TEST_IDS.bossBar));
  assert.match(screen.getByTestId('boss-player-score').textContent ?? '', /\$2,400/);
  assert.match(screen.getByTestId('boss-score').textContent ?? '', /\$1,800/);
  cleanup();

  render(React.createElement(RoundResultScreen, { onNavigate: () => undefined }));
  assert.match(screen.getByTestId('round-player-score').textContent ?? '', /\$2,400/);
  assert.match(screen.getByTestId('round-boss-score').textContent ?? '', /\$1,800/);

  await act(async () => {
    fireEvent.click(screen.getByTestId('round-continue'));
  });
  assert.equal(api.getState().phase, 'RELIC_PICK');
  cleanup();

  render(React.createElement(MetaRouter, { route: 'boss', onNavigate: () => undefined }));
  assert.ok(screen.getByTestId('relic-choice-0'));
  await act(async () => {
    fireEvent.click(screen.getByTestId('relic-choice-0'));
  });
  assert.equal(api.getState().phase, 'ELEVATOR');
  assert.equal(api.getState().trinkets.length, 1);
  cleanup();

  render(React.createElement(ElevatorScreen, { onNavigate: () => undefined }));
  for (const floorId of ['FLOOR_NEON', 'FLOOR_CRYO', 'FLOOR_FOUNDRY', 'FLOOR_PENTHOUSE'] as const) {
    assert.ok(screen.getByTestId(TEST_IDS.elevator(floorId)));
  }
  await act(async () => {
    fireEvent.click(screen.getByTestId(TEST_IDS.elevator('FLOOR_CRYO')));
  });
  assert.equal(api.getState().floorId, 'FLOOR_CRYO');
  const cryo = CONTENT.floors.find((floor) => floor.id === 'FLOOR_CRYO');
  assert.equal(cryo?.physics.friction, 0.96);
});

test('J4: game over shows and copies the seed; the same seed repeats the first evaluation', async () => {
  const core = makeCore('J4-FAIL');
  fabricate(core, (state) => {
    state.phase = 'GAME_OVER';
    state.bankroll = 0;
    state.round = 1;
    state.spinsLeft = 0;
  });
  const api = attach(core);

  const copied: string[] = [];
  Object.defineProperty(browser.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text: string) => { copied.push(text); } },
  });

  render(React.createElement(GameOverScreen, { onNavigate: () => undefined }));
  assert.ok(screen.getByTestId(TEST_IDS.gameover));
  assert.equal(screen.getByTestId(TEST_IDS.seedDisplay).textContent, 'J4-FAIL');
  await act(async () => {
    fireEvent.click(screen.getByTestId('copy-seed'));
  });
  assert.deepEqual(copied, ['J4-FAIL']);

  await act(async () => {
    fireEvent.click(screen.getByTestId('retry-seed'));
  });
  assert.equal(api.getState().seed, 'J4-FAIL');
  assert.equal(api.getState().phase, 'PREP');
  cleanup();

  async function firstEvaluation(seed: string) {
    api.newRun(seed);
    api.dispatch({ c: 'Spin' });
    const found = await api.runUntil(
      () => useGameStore.getState().events.some((event) => event.t === 'SpinEvaluated'),
      4_000,
    );
    assert.equal(found, true);
    const event = [...useGameStore.getState().events]
      .reverse()
      .find((candidate) => candidate.t === 'SpinEvaluated');
    assert.ok(event && event.t === 'SpinEvaluated');
    return {
      grid: event.grid,
      chips: event.chips,
      addMult: event.addMult,
      xMult: event.xMult,
      equity: event.equity,
    };
  }

  const first = await firstEvaluation('REPEAT-SEED');
  const second = await firstEvaluation('REPEAT-SEED');
  assert.deepEqual(second, first);
});

test('J5: resume restores the saved shop phase hash exactly', async () => {
  const core = makeCore('J5-SEED');
  makeShopState(core, FULL_SHELF, 12_345);
  const api = attach(core);

  render(React.createElement(ShopScreen, { onNavigate: () => undefined }));
  const hashBefore = api.stateHash();
  const saved = browser.localStorage.getItem(STORAGE_KEYS.save);
  assert.ok(saved);

  cleanup();
  // Simulate closing the tab: a fresh core with no run loaded into the store.
  const reloaded = new Core({ content: CONTENT, seed: 'fresh-page' });
  useGameStore.getState().attachCore(reloaded);
  const reloadedApi = apiModule.installTestApi(reloaded);

  render(React.createElement(ResumePrompt, { onNavigate: () => undefined }));
  assert.ok(screen.getByTestId('resume-prompt'));
  assert.equal(screen.getByTestId('resume-seed').textContent, 'J5-SEED');
  assert.equal(screen.getByTestId('resume-phase').textContent, 'Shop');

  await act(async () => {
    fireEvent.click(screen.getByTestId('resume-continue'));
  });
  assert.equal(reloadedApi.getState().phase, 'SHOP');
  assert.equal(reloadedApi.getState().seed, 'J5-SEED');
  assert.equal(reloadedApi.stateHash(), hashBefore);
});

test('J7: victory renders the full-clear summary and copies the seed', async () => {
  const core = makeCore('J7-SEED');
  fabricate(core, (state) => {
    state.phase = 'VICTORY';
    state.floorId = 'FLOOR_PENTHOUSE';
    state.round = 4;
    state.floorsCleared = ['FLOOR_NEON', 'FLOOR_CRYO', 'FLOOR_PENTHOUSE'];
    state.bankroll = 98_765;
    state.trinkets = ['turboDozerCam', 'midasLipSensor'];
    state.grid.cols = 4;
    state.grid.wiring = 'WAYS';
    state.jumpers = [[[0, 0], [1, 1], [2, 0]]];
  });
  attach(core);

  const copied: string[] = [];
  Object.defineProperty(browser.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text: string) => { copied.push(text); } },
  });

  render(React.createElement(VictoryScreen, { onNavigate: () => undefined }));
  assert.ok(screen.getByTestId(TEST_IDS.victory));
  assert.equal(screen.getByTestId(TEST_IDS.seedDisplay).textContent, 'J7-SEED');
  assert.match(screen.getByTestId('victory-bankroll').textContent ?? '', /\$98,765/);
  await act(async () => {
    fireEvent.click(screen.getByTestId('copy-seed'));
  });
  assert.deepEqual(copied, ['J7-SEED']);
});

test('seed entry starts a run and the compendium renders the full catalogue', async () => {
  const core = makeCore('SEED-OLD');
  const api = attach(core);

  render(React.createElement(SeedEntry, { onNavigate: () => undefined }));
  const input = screen.getByTestId('seed-input') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'TYPED-SEED' } });
  await act(async () => {
    fireEvent.click(screen.getByTestId('start-run'));
  });
  assert.equal(api.getState().seed, 'TYPED-SEED');
  assert.equal(api.getState().phase, 'PREP');
  cleanup();

  render(React.createElement(SeedEntry, { onNavigate: () => undefined }));
  await act(async () => {
    fireEvent.click(screen.getByTestId('randomize-seed'));
  });
  const randomized = (screen.getByTestId('seed-input') as HTMLInputElement).value;
  assert.match(randomized, /^JS-[A-Z0-9]{6}$/);
  cleanup();

  render(React.createElement(CompendiumScreen, { onNavigate: () => undefined }));
  assert.ok(screen.getByTestId('compendium'));
  assert.ok(screen.getByTestId('compendium-item-turboDozerCam'));
  assert.ok(screen.getByTestId('compendium-item-jumperWire'));
  assert.ok(screen.getByText('The Iron Auditor'));
});

test('every meta route renders through MetaRouter', () => {
  const core = makeCore('ROUTES-SEED');
  attach(core);

  const expectations: Array<[Parameters<typeof MetaRouter>[0]['route'], string]> = [
    ['shop', TEST_IDS.shopOffer(0)],
    ['elevator', TEST_IDS.elevator('FLOOR_CRYO')],
    ['boss', TEST_IDS.bossBar],
    ['gameover', TEST_IDS.gameover],
    ['victory', TEST_IDS.victory],
    ['compendium', 'compendium'],
    ['resume', 'resume-prompt'],
    ['roundresult', 'round-result'],
    ['title', 'seed-entry'],
  ];

  for (const [route, testId] of expectations) {
    const view = render(React.createElement(MetaRouter, { route, onNavigate: () => undefined }));
    assert.ok(screen.getByTestId(testId), `${route} did not render ${testId}`);
    view.unmount();
  }
});

test('round result and boss bar render at a 390px viewport without a shell crash', () => {
  Object.defineProperty(browser, 'innerWidth', { configurable: true, writable: true, value: 390 });
  Object.defineProperty(browser, 'innerHeight', { configurable: true, writable: true, value: 844 });
  browser.dispatchEvent(new browser.Event('resize'));

  const core = makeCore('MOBILE-SEED');
  fabricate(core, (state) => {
    state.phase = 'ROUND_RESULT';
    state.round = 1;
    state.bankroll = 900;
  });
  attach(core);

  const result = render(React.createElement(RoundResultScreen, { onNavigate: () => undefined }));
  assert.ok(screen.getByTestId('round-result'));
  assert.equal(screen.getByTestId('round-result-outcome').textContent, 'Missed');
  assert.ok(result.container.querySelector('.meta-screen'));
  result.unmount();

  const bar = render(React.createElement(BossBar, { playerScore: 120, bossScore: 80 }));
  assert.ok(screen.getByTestId(TEST_IDS.bossBar));
  assert.equal(screen.getByTestId('boss-player-score').textContent, '$120');
  bar.unmount();
});

test('a corrupt or version-mismatched save is discarded with a notice', () => {
  browser.localStorage.setItem(STORAGE_KEYS.save, '{"saveVersion":999}');
  render(React.createElement(ResumePrompt, { onNavigate: () => undefined }));
  assert.ok(screen.getByTestId('resume-notice'));
  assert.equal(browser.localStorage.getItem(STORAGE_KEYS.save), null);
  assert.ok(screen.getByTestId('resume-empty'));
});

test('save version constant is the version the resume prompt expects', () => {
  assert.equal(SAVE_VERSION, contracts.SAVE_VERSION);
  const floorIds: FloorId[] = ['FLOOR_NEON', 'FLOOR_CRYO', 'FLOOR_FOUNDRY', 'FLOOR_PENTHOUSE'];
  for (const floorId of floorIds) assert.equal(typeof TEST_IDS.elevator(floorId), 'string');
});
