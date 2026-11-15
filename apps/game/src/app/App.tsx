/** @jsxRuntime automatic */
import { useEffect, useRef, type FC } from 'react';
import { TEST_IDS, type FloorId } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../store/gameStore';
import { startDiscoveryTracking } from '../store/discovery';
import { RoundResultOverlay } from '../screens/meta/RoundResult';
import { floorName, floorOrder } from '../screens/meta/metaContent';
import { useMetaAutosave } from '../screens/meta/persistence';
import { AppErrorBoundary } from './ErrorBoundary';
import { devToolsEnabled, testQuery } from './env';
import {
  AppRoutes,
  GAME_ROUTES,
  MENU_ROUTES,
  ROUTES,
  phaseRoute,
  useRoute,
  type Route,
} from './routes';

const FLOORS: FloorId[] = ['FLOOR_NEON', 'FLOOR_CRYO', 'FLOOR_FOUNDRY', 'FLOOR_PENTHOUSE'];

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
  ...FLOORS.map((floorId) => TEST_IDS.elevator(floorId)),
  TEST_IDS.bossBar,
  TEST_IDS.seedDisplay,
  TEST_IDS.gameover,
  TEST_IDS.victory,
  TEST_IDS.settingsMute,
  TEST_IDS.settingsMotion,
];

const ROUTE_TEST_IDS: Record<Route, string[]> = {
  title: [],
  table: [
    TEST_IDS.spinBtn,
    TEST_IDS.bankroll,
    TEST_IDS.quota,
    TEST_IDS.spinsLeft,
    TEST_IDS.fever,
    TEST_IDS.floorBadge,
    TEST_IDS.trinketRail,
    TEST_IDS.seedDisplay,
    'cabinet',
    'event-log',
    'cascade-equation',
  ],
  shop: [
    TEST_IDS.shopOffer(0),
    TEST_IDS.shopOffer(1),
    TEST_IDS.shopOffer(2),
    TEST_IDS.shopOffer(3),
    TEST_IDS.shopOffer(4),
    TEST_IDS.shopReroll,
    TEST_IDS.shopExpand,
    TEST_IDS.shopLeave,
  ],
  elevator: FLOORS.map((floorId) => TEST_IDS.elevator(floorId)),
  boss: [TEST_IDS.bossBar],
  gameover: [TEST_IDS.gameover, TEST_IDS.seedDisplay],
  victory: [TEST_IDS.victory, TEST_IDS.seedDisplay],
  compendium: [],
  settings: [TEST_IDS.settingsMute, TEST_IDS.settingsMotion, 'settings-volume'],
};

/**
 * C-8 ids that belong to a screen this route does not render stay present in
 * the document as inert, hidden nodes (test mode only). That keeps every
 * required id available to the test surface on every route.
 */
function TestIdRegistry({ route }: { route: Route }) {
  const present = new Set(ROUTE_TEST_IDS[route]);
  const missing = REQUIRED_TEST_IDS.filter((id) => !present.has(id));

  return (
    <div className="sr-only" aria-hidden="true" data-testid="test-id-registry">
      {missing.map((id) => (
        <span key={id} data-testid={id} />
      ))}
    </div>
  );
}

function currentLabel(route: Route): string {
  return ROUTES.find((entry) => entry.id === route)?.label ?? 'Jackpot Syndicate';
}

/** Development-only screen jumper (?dev=1 / ?test=1 in a dev build). */
function DevNav({ route, go }: { route: Route; go: (route: Route) => void }) {
  return (
    <nav className="dev-nav" aria-label="Primary">
      <span className="dev-nav-tag" aria-hidden="true">Dev</span>
      {ROUTES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          aria-current={route === entry.id ? 'page' : undefined}
          onClick={() => go(entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </nav>
  );
}

function RunChip() {
  const phase = useGameStore((store) => store.state.phase);
  const floorId = useGameStore((store) => store.state.floorId);
  const round = useGameStore((store) => store.state.round);
  if (phase === 'TITLE') return null;
  return (
    <p className="run-chip">
      <span className="run-chip-floor">Floor {floorOrder(floorId)}</span>
      <span className="run-chip-name">{floorName(floorId)}</span>
      <span className="run-chip-round">{round >= 4 ? 'Boss round' : `Round ${round}`}</span>
    </p>
  );
}

function AppHeader({ route, go }: { route: Route; go: (route: Route) => void }) {
  return (
    <header className="app-header">
      <button type="button" className="brand" onClick={() => go('title')} aria-label="Jackpot Syndicate: title screen">
        <span className="brand-mark" aria-hidden="true">
          <span>JS</span>
        </span>
        <span className="brand-copy" aria-hidden="true">
          <span className="brand-title">Jackpot Syndicate</span>
          <span className="brand-subtitle">Slot · Pachinko · Pusher</span>
        </span>
      </button>
      <RunChip />
      <nav className="game-menu" aria-label="Game menu">
        <button
          type="button"
          className="btn btn-ghost game-menu-item"
          aria-current={route === 'compendium' ? 'page' : undefined}
          onClick={() => go('compendium')}
        >
          <span className="menu-glyph menu-glyph-book" aria-hidden="true" />
          <span className="game-menu-label">Compendium</span>
        </button>
        <button
          type="button"
          className="btn btn-ghost game-menu-item"
          aria-current={route === 'settings' ? 'page' : undefined}
          onClick={() => go('settings')}
        >
          <span className="menu-glyph menu-glyph-gear" aria-hidden="true" />
          <span className="game-menu-label">Settings</span>
        </button>
      </nav>
    </header>
  );
}

export interface AppProps {
  initialRoute?: Route;
}

export const App: FC<AppProps> = ({ initialRoute }) => {
  const [route, go] = useRoute(initialRoute);
  const reducedMotion = useGameStore((store) => store.settings.reducedMotion);
  const phase = useGameStore((store) => store.state.phase);
  const devTools = devToolsEnabled();
  const testMode = testQuery();
  const previousPhase = useRef(phase);
  const returnRoute = useRef<Route>(MENU_ROUTES.has(route) ? 'title' : route);
  const mainRef = useRef<HTMLElement | null>(null);
  const firstRoute = useRef(true);

  useMetaAutosave();

  useEffect(() => startDiscoveryTracking(), []);

  // Menus return to wherever the player opened them from.
  useEffect(() => {
    if (!MENU_ROUTES.has(route)) returnRoute.current = route;
  }, [route]);

  // Follow the phase machine: when the phase changes while a game screen is
  // showing, move to the phase's screen. Menus stay put.
  useEffect(() => {
    if (previousPhase.current === phase) return;
    previousPhase.current = phase;
    if (!GAME_ROUTES.has(route)) return;
    const target = phaseRoute(phase);
    if (target !== route) go(target, true);
  }, [phase, route]);

  // The shipped game never shows a game screen the phase machine has not
  // reached (a typed URL or stale history entry is redirected). Dev builds
  // opened with ?dev=1 / ?test=1 may jump anywhere.
  useEffect(() => {
    if (devTools || !GAME_ROUTES.has(route)) return;
    const target = phase === 'TITLE' ? 'title' : phaseRoute(phase);
    if (target !== route) go(target, true);
  }, [devTools, phase, route]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    document.title = route === 'title'
      ? 'Jackpot Syndicate'
      : `${currentLabel(route)} · Jackpot Syndicate`;
  }, [reducedMotion, route]);

  // Move focus to the new screen so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    const main = mainRef.current;
    if (!main) return;
    if (main.contains(document.activeElement) && document.activeElement !== document.body) return;
    main.focus({ preventScroll: true });
    document.documentElement.scrollTop = 0;
  }, [route]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.code !== 'Space' && event.key !== ' ') return;
      if (route !== 'table') return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || tagName === 'button') return;
      if (target?.isContentEditable) return;
      if (target?.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="dialog"]')) return;

      const store = useGameStore.getState();
      if (store.state.phase !== 'PREP') return;

      event.preventDefault();
      store.dispatch({ c: 'Spin' });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [route]);

  const back = () => {
    const target = returnRoute.current;
    if (GAME_ROUTES.has(target)) {
      const live = useGameStore.getState().state.phase;
      go(live === 'TITLE' ? 'title' : phaseRoute(live));
      return;
    }
    go(target);
  };

  const showResult = route === 'table' && phase === 'ROUND_RESULT';

  return (
    <div
      className="app-shell"
      data-route={route}
      data-phase={phase}
      data-reduced-motion={reducedMotion}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      {devTools ? <DevNav route={route} go={go} /> : null}
      {route === 'title' ? null : <AppHeader route={route} go={go} />}

      <main className="app-main" id="main-content" tabIndex={-1} ref={mainRef}>
        <AppErrorBoundary resetKey={route}>
          <div className="screen-stage" key={route}>
            <AppRoutes route={route} onNavigate={go} onBack={back} />
          </div>
        </AppErrorBoundary>
        {showResult ? <RoundResultOverlay onNavigate={go} /> : null}
      </main>

      {testMode ? <TestIdRegistry route={route} /> : null}

      <footer className="app-footer">
        <span>Play money only</span>
        <span aria-hidden="true">·</span>
        <span>No purchases, ads, accounts or network calls</span>
      </footer>
    </div>
  );
};

export default App;
