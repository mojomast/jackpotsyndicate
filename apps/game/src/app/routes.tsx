/** @jsxRuntime automatic */
import { useEffect, useState } from 'react';
import { TEST_IDS } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../store/gameStore';
import { TableScreen as RealTableScreen } from '../screens/table';
import { MetaRouter } from '../screens/meta';

export type Route =
  | 'title'
  | 'table'
  | 'shop'
  | 'elevator'
  | 'boss'
  | 'gameover'
  | 'victory'
  | 'compendium'
  | 'settings';

export interface RouteDef {
  id: Route;
  label: string;
}

export const ROUTES: RouteDef[] = [
  { id: 'title', label: 'Title' },
  { id: 'table', label: 'Table' },
  { id: 'shop', label: 'Shop' },
  { id: 'elevator', label: 'Elevator' },
  { id: 'boss', label: 'Boss' },
  { id: 'gameover', label: 'Game Over' },
  { id: 'victory', label: 'Victory' },
  { id: 'compendium', label: 'Compendium' },
  { id: 'settings', label: 'Settings' },
];

const ROUTE_IDS = new Set(ROUTES.map((route) => route.id));

export function parseRoute(hash: string): Route {
  const cleaned = hash.replace(/^#\/?/, '').split('?')[0]?.split('/')[0] ?? '';
  return ROUTE_IDS.has(cleaned as Route) ? (cleaned as Route) : 'title';
}

export function navigate(route: Route): void {
  if (typeof window === 'undefined') return;
  const next = `#/${route}`;
  if (window.location.hash !== next) window.location.hash = next;
}

export function useRoute(initialRoute?: Route): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => {
    if (initialRoute) return initialRoute;
    return parseRoute(typeof window === 'undefined' ? '' : window.location.hash);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash && !initialRoute) window.location.hash = '#/title';
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [initialRoute]);

  const go = (next: Route) => {
    setRoute(next);
    navigate(next);
  };

  return [route, go];
}

export function TitleScreen({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const newRun = useGameStore((store) => store.newRun);
  const [seed, setSeed] = useState('SHELL-DEMO');

  const start = () => {
    newRun(seed.trim() || 'SHELL-DEMO');
    onNavigate('table');
  };

  return (
    <section className="screen title-screen" aria-labelledby="title-heading">
      <div className="screen-header">
        <p className="eyebrow">Play-money roguelike</p>
        <h1 className="title-hero" id="title-heading">
          Jackpot
          <br />
          Syndicate
        </h1>
        <p className="title-lead">
          Spin the reels, drop orbs through the pinfield and push coins over the
          lip. Build a machine, climb three casino floors and break the house.
        </p>
      </div>

      <form
        className="start-form"
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <label className="field">
          <span>Run seed</span>
          <input
            className="input"
            type="text"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            data-testid="seed-input"
            placeholder="SHELL-DEMO"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" className="btn btn-primary">
          Start run
        </button>
      </form>

      <div className="title-links">
        <button type="button" className="btn" onClick={() => onNavigate('table')}>
          Open shell demo
        </button>
        <button type="button" className="btn btn-cyan" onClick={() => onNavigate('settings')}>
          Settings
        </button>
        <button type="button" className="btn" onClick={() => onNavigate('compendium')}>
          Compendium
        </button>
      </div>

      <p className="notice">
        <strong>Play money only.</strong> No purchases, ads, accounts, leaderboards or
        runtime network calls. Every number on this screen is simulated.
      </p>
    </section>
  );
}

export function SettingsScreen({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const settings = useGameStore((store) => store.settings);
  const setSettings = useGameStore((store) => store.setSettings);
  const setSpeed = useGameStore((store) => store.setSpeed);

  return (
    <section className="screen" aria-labelledby="settings-heading">
      <header className="screen-header">
        <p className="eyebrow">Comfort</p>
        <h1 className="screen-title" id="settings-heading">Settings</h1>
        <p className="screen-description">
          Audio, motion and simulation speed. Preferences persist locally and are
          never sent anywhere.
        </p>
      </header>

      <div className="settings-list">
        <div className="settings-row">
          <div className="settings-copy">
            <strong>Mute audio</strong>
            <span>Silences every synthesized voice. The game stays playable.</span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              data-testid={TEST_IDS.settingsMute}
              checked={settings.mute}
              onChange={(event) => setSettings({ mute: event.target.checked })}
              aria-label="Mute audio"
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
        </div>

        <div className="settings-row">
          <div className="settings-copy">
            <strong>Reduced motion</strong>
            <span>Disables timeline motion and long transitions.</span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              data-testid={TEST_IDS.settingsMotion}
              checked={settings.reducedMotion}
              onChange={(event) => setSettings({ reducedMotion: event.target.checked })}
              aria-label="Reduced motion"
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
        </div>

        <div className="settings-row">
          <div className="settings-copy">
            <strong>Volume</strong>
            <span>{Math.round(settings.volume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            data-testid="settings-volume"
            aria-label="Volume"
            onChange={(event) => setSettings({ volume: Number(event.target.value) })}
          />
        </div>

        <div className="settings-row">
          <div className="settings-copy">
            <strong>Simulation speed</strong>
            <span>Fixed-step simulation stays deterministic at every speed.</span>
          </div>
          <div className="speed-group" role="group" aria-label="Simulation speed">
            {[1, 2, 4].map((speed) => (
              <button
                key={speed}
                type="button"
                className="btn"
                data-testid={`settings-speed-${speed}`}
                aria-pressed={settings.speed === speed}
                onClick={() => setSpeed(speed)}
              >
                {speed}×
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="notice">
        <strong>Play money only.</strong> No purchases, ads, accounts or network calls.
        Settings are stored under <code>js.settings.v1</code>.
      </p>

      <div className="stub-actions">
        <button type="button" className="btn btn-cyan" onClick={() => onNavigate('table')}>
          Back to table
        </button>
        <button type="button" className="btn" onClick={() => onNavigate('title')}>
          Title
        </button>
      </div>
    </section>
  );
}

export function AppRoutes({
  route,
  onNavigate,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
}) {
  switch (route) {
    case 'title':
      return <TitleScreen onNavigate={onNavigate} />;
    case 'table':
      return <RealTableScreen />;
    case 'shop':
      return <MetaRouter route="shop" onNavigate={onNavigate} />;
    case 'elevator':
      return <MetaRouter route="elevator" onNavigate={onNavigate} />;
    case 'boss':
      return <MetaRouter route="boss" onNavigate={onNavigate} />;
    case 'gameover':
      return <MetaRouter route="gameover" onNavigate={onNavigate} />;
    case 'victory':
      return <MetaRouter route="victory" onNavigate={onNavigate} />;
    case 'compendium':
      return <MetaRouter route="compendium" onNavigate={onNavigate} />;
    case 'settings':
      return <SettingsScreen onNavigate={onNavigate} />;
    default:
      return <TitleScreen onNavigate={onNavigate} />;
  }
}
