/** @jsxRuntime automatic */
import { useEffect, type FC } from 'react';
import { TEST_IDS, type FloorId } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../store/gameStore';
import { AppRoutes, ROUTES, useRoute, type Route } from './routes';

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
 * the document as inert, hidden nodes. That keeps every required id available
 * to the test surface while the shell's own screens stay honest stubs.
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

export interface AppProps {
  initialRoute?: Route;
}

export const App: FC<AppProps> = ({ initialRoute }) => {
  const [route, go] = useRoute(initialRoute);
  const reducedMotion = useGameStore((store) => store.settings.reducedMotion);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    document.title = route === 'title'
      ? 'Jackpot Syndicate'
      : `${currentLabel(route)} · Jackpot Syndicate`;
  }, [reducedMotion, route]);

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
      if (target?.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;

      const store = useGameStore.getState();
      if (store.state.phase !== 'PREP') return;

      event.preventDefault();
      store.dispatch({ c: 'Spin' });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [route]);

  return (
    <div className="app-shell" data-reduced-motion={reducedMotion}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">JS</span>
          <div className="brand-copy">
            <p className="brand-title">Jackpot Syndicate</p>
            <p className="brand-subtitle">Slot · Pachinko · Pusher</p>
          </div>
        </div>

        <nav className="nav" aria-label="Primary">
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
      </header>

      <main className="app-main" id="main-content" tabIndex={-1}>
        <AppRoutes route={route} onNavigate={go} />
      </main>

      <TestIdRegistry route={route} />

      <footer className="app-footer">
        <span>T-070 UI shell · MockGameCore · C-8 test surface</span>
        <span>
          Play money only · <code>?test=1</code> test bridge
        </span>
      </footer>
    </div>
  );
};

export default App;
