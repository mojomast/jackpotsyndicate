import type { Phase } from '@jackpotsyndicate/contracts';
import type { Route } from '../../app/routes';

export type MetaNavigate = (route: Route) => void;

/** Routes the meta screens add on top of the shell router (resume is a prompt, not a URL). */
export type MetaRoute = Route | 'resume' | 'roundresult';

export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'ROUND_RESULT':
      return 'Round result';
    case 'RELIC_PICK':
      return 'Relic choice';
    case 'JUMPER_PICK':
      return 'Jumper choice';
    default:
      return phase
        .split('_')
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(' ');
  }
}

export function routeForPhase(phase: Phase): Route {
  switch (phase) {
    case 'SHOP':
    case 'JUMPER_PICK':
      return 'shop';
    case 'RELIC_PICK':
    case 'BOSS_INTRO':
      return 'boss';
    case 'ELEVATOR':
      return 'elevator';
    case 'GAME_OVER':
      return 'gameover';
    case 'VICTORY':
      return 'victory';
    case 'TITLE':
      return 'title';
    default:
      return 'table';
  }
}

export function navigateTo(route: MetaRoute, onNavigate?: MetaNavigate): void {
  if (route === 'resume' || route === 'roundresult') {
    if (route === 'resume') onNavigate?.('title');
    else onNavigate?.('table');
    return;
  }
  if (onNavigate) {
    onNavigate(route);
    return;
  }
  if (typeof window === 'undefined') return;
  const next = `#/${route}`;
  if (window.location.hash !== next) window.location.hash = next;
}
