import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, beforeEach, test } from 'node:test';
// @ts-expect-error jsdom is JavaScript-only in this workspace (no @types/jsdom).
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html lang="en"><head></head><body></body></html>', {
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
const appModule = await import('../src/app/App');
const boundaryModule = await import('../src/app/ErrorBoundary');
const auditModule = await import('../src/app/a11yAudit');
const persistence = await import('../src/screens/meta/persistence');

const { render, screen, cleanup, fireEvent, act } = rtl;
const { App } = appModule;
const { AppErrorBoundary } = boundaryModule;
const { auditAccessibility, seriousA11yFindings, auditTouchTargetCss, auditReducedMotionCss } = auditModule;
const { MockGameCore, useGameStore } = storeModule;
const { STORAGE_KEYS } = contracts;
const { readStoredSave, saveCore } = persistence;

const ROUTES = [
  'title',
  'table',
  'shop',
  'elevator',
  'boss',
  'gameover',
  'victory',
  'compendium',
  'settings',
] as const;

beforeEach(() => {
  cleanup();
  browser.localStorage.clear();
  browser.history.replaceState({}, '', '/?test=1');
  document.documentElement.lang = 'en';
  document.documentElement.dataset.reducedMotion = 'false';
  useGameStore.setState({
    settings: { mute: false, volume: 0.6, reducedMotion: false, speed: 1 },
    events: [],
    lastSpin: null,
    lastDropMult: 1,
  });
  useGameStore.getState().attachCore(new MockGameCore());
  useGameStore.getState().newRun('HARDENING-SEED');
});

after(() => {
  cleanup();
  dom.window.close();
});

function silenceConsoleError<T>(run: () => T): T {
  const original = console.error;
  console.error = () => undefined;
  try {
    return run();
  } finally {
    console.error = original;
  }
}

function Bomb(): never {
  throw new Error('synthetic render failure');
}

test('axe-equivalent audit has no serious or critical issues on every route at 390px', () => {
  Object.defineProperty(browser, 'innerWidth', { configurable: true, writable: true, value: 390 });
  Object.defineProperty(browser, 'innerHeight', { configurable: true, writable: true, value: 844 });
  browser.dispatchEvent(new browser.Event('resize'));

  for (const route of ROUTES) {
    const view = render(React.createElement(App, { initialRoute: route }));
    const findings = auditAccessibility(view.container);
    const serious = seriousA11yFindings(findings);
    assert.deepEqual(
      serious,
      [],
      `${route}: ${serious.map((finding) => `${finding.id} ${finding.target ?? ''}`).join(', ')}`,
    );
    view.unmount();
  }
});

test('reduced motion reaches the document, table shell and cabinet, and CSS honors it', () => {
  useGameStore.getState().setSettings({ reducedMotion: true });
  const { container } = render(React.createElement(App, { initialRoute: 'table' }));

  assert.equal(document.documentElement.dataset.reducedMotion, 'true');
  assert.equal(container.querySelector('.app-shell')?.getAttribute('data-reduced-motion'), 'true');
  assert.equal(container.querySelector('[data-testid="cabinet"]')?.getAttribute('data-reduced-motion'), 'true');

  const css = readFileSync(new URL('../src/theme/tokens.css', import.meta.url), 'utf8');
  assert.deepEqual(auditReducedMotionCss(css), []);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration:\s*0\.001ms/);
  assert.match(css, /transition-duration:\s*0\.001ms/);
});

test('390px touch targets are at least 44px for every control class', () => {
  const css = readFileSync(new URL('../src/theme/tokens.css', import.meta.url), 'utf8');
  assert.deepEqual(auditTouchTargetCss(css), []);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /@media \(max-width: 480px\)/);
});

test('error boundary preserves an existing valid save byte-for-byte and resumes it', async () => {
  const core = useGameStore.getState().core;
  assert.ok(saveCore(core));
  const raw = browser.localStorage.getItem(STORAGE_KEYS.save);
  assert.ok(raw);
  const hashBefore = core.stateHash();

  let shouldThrow = true;
  function MaybeBomb() {
    if (shouldThrow) throw new Error('screen exploded');
    return <p data-testid="recovered-copy">recovered</p>;
  }

  silenceConsoleError(() => {
    render(
      React.createElement(AppErrorBoundary, null, React.createElement(MaybeBomb)),
    );
  });

  assert.ok(screen.getByTestId('error-boundary'));
  assert.match(screen.getByTestId('error-boundary-notice').textContent ?? '', /preserved/i);
  assert.equal(browser.localStorage.getItem(STORAGE_KEYS.save), raw);
  assert.equal((screen.getByTestId('error-resume') as HTMLButtonElement).disabled, false);

  shouldThrow = false;
  await act(async () => {
    fireEvent.click(screen.getByTestId('error-resume'));
  });

  assert.ok(screen.getByTestId('recovered-copy'));
  assert.equal(core.stateHash(), hashBefore);
  assert.equal(useGameStore.getState().state.phase, 'PREP');
  assert.equal(window.location.hash, '#/table');
  assert.equal(browser.localStorage.getItem(STORAGE_KEYS.save), raw);
});

test('error boundary discards a corrupt save instead of handing it to the loader', () => {
  browser.localStorage.setItem(STORAGE_KEYS.save, '{"saveVersion":999}');
  const core = useGameStore.getState().core;
  assert.deepEqual(core.dispatch({ c: 'Spin' }), { ok: true });
  assert.equal(core.getState().phase, 'SPINNING');

  silenceConsoleError(() => {
    render(
      React.createElement(AppErrorBoundary, null, React.createElement(Bomb)),
    );
  });

  assert.equal(browser.localStorage.getItem(STORAGE_KEYS.save), null);
  assert.match(screen.getByTestId('error-boundary-notice').textContent ?? '', /discarded/i);
  assert.equal((screen.getByTestId('error-resume') as HTMLButtonElement).disabled, true);
  assert.equal(readStoredSave().save, null);
});

test('error boundary writes a fresh validated save when no save exists at a safe boundary', () => {
  assert.equal(browser.localStorage.getItem(STORAGE_KEYS.save), null);

  silenceConsoleError(() => {
    render(
      React.createElement(AppErrorBoundary, null, React.createElement(Bomb)),
    );
  });

  const stored = readStoredSave();
  assert.ok(stored.save);
  assert.equal(stored.save.run.phase, 'PREP');
  assert.equal((screen.getByTestId('error-resume') as HTMLButtonElement).disabled, false);
  assert.match(screen.getByTestId('error-boundary-notice').textContent ?? '', /fresh save/i);
});

test('discarding from the boundary clears the resume path and returns to the title', () => {
  silenceConsoleError(() => {
    render(
      React.createElement(AppErrorBoundary, null, React.createElement(Bomb)),
    );
  });

  act(() => {
    fireEvent.click(screen.getByTestId('error-discard'));
  });

  assert.equal(browser.localStorage.getItem(STORAGE_KEYS.save), null);
  assert.match(screen.getByTestId('error-boundary-notice').textContent ?? '', /discarded/i);
  assert.equal(window.location.hash, '#/title');
});

test('the shell mounts the save-safe boundary around routed screens', () => {
  const source = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /<AppErrorBoundary resetKey=\{route\}>/);
  render(React.createElement(App, { initialRoute: 'table' }));
  assert.equal(screen.queryByTestId('error-boundary'), null);
});
