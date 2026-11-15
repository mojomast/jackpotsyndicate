/** @jsxRuntime automatic */
import { useEffect, useState } from 'react';
import type { Phase } from '@jackpotsyndicate/contracts';
import { TableScreen as RealTableScreen } from '../screens/table';
import { MetaRouter } from '../screens/meta';
import { routeForPhase } from '../screens/meta/navigation';
import { SettingsScreen } from './screens/SettingsScreen';
import { TitleScreen } from './screens/TitleScreen';

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

/** Every screen, in phase order. The dev nav lists them; players never see this list. */
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

/**
 * Screens owned by the phase machine. While one of these is showing, a phase
 * change moves the player to the phase's screen. Title, Compendium and
 * Settings are menus: they stay put while the run advances underneath.
 */
export const GAME_ROUTES: ReadonlySet<Route> = new Set<Route>([
  'table',
  'shop',
  'elevator',
  'boss',
  'gameover',
  'victory',
]);

export const MENU_ROUTES: ReadonlySet<Route> = new Set<Route>(['compendium', 'settings']);

const ROUTE_IDS = new Set(ROUTES.map((route) => route.id));

export function parseRoute(hash: string): Route {
  const cleaned = hash.replace(/^#\/?/, '').split('?')[0]?.split('/')[0] ?? '';
  return ROUTE_IDS.has(cleaned as Route) ? (cleaned as Route) : 'title';
}

export function navigate(route: Route, replace = false): void {
  if (typeof window === 'undefined') return;
  const next = `#/${route}`;
  if (window.location.hash === next) return;
  if (replace && typeof window.history?.replaceState === 'function') {
    const url = `${window.location.pathname}${window.location.search}${next}`;
    window.history.replaceState(window.history.state, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = next;
}

/** The screen the phase machine wants for a phase (round results overlay the table). */
export function phaseRoute(phase: Phase): Route {
  return routeForPhase(phase);
}

export function useRoute(initialRoute?: Route): [Route, (route: Route, replace?: boolean) => void] {
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

  const go = (next: Route, replace = false) => {
    setRoute(next);
    navigate(next, replace);
  };

  return [route, go];
}

export interface AppRoutesProps {
  route: Route;
  onNavigate: (route: Route) => void;
  /** Where a menu's Back button returns to. */
  onBack?: () => void;
}

export function AppRoutes({ route, onNavigate, onBack }: AppRoutesProps) {
  const back = onBack ?? (() => onNavigate('title'));
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
      return <MetaRouter route="compendium" onNavigate={onNavigate} onBack={back} />;
    case 'settings':
      return <SettingsScreen onNavigate={onNavigate} onBack={back} />;
    default:
      return <TitleScreen onNavigate={onNavigate} />;
  }
}

export { SettingsScreen, TitleScreen };
