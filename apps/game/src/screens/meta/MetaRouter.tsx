/** @jsxRuntime automatic */
import type { Phase } from '@jackpotsyndicate/contracts';
import type { Route } from '../../app/routes';
import { useGameStore } from '../../store/gameStore';
import { BossIntroScreen } from './BossIntro';
import { CompendiumScreen } from './Compendium';
import { ElevatorScreen } from './Elevator';
import { GameOverScreen } from './GameOver';
import { ResumePrompt } from './ResumePrompt';
import { RoundResultScreen } from './RoundResult';
import { SeedEntry } from './SeedEntry';
import { ShopScreen } from './Shop';
import { VictoryScreen } from './Victory';
import { routeForPhase, type MetaNavigate, type MetaRoute } from './navigation';

export interface MetaRouterProps {
  /** Omit to derive the screen from the current RunState phase. */
  route?: MetaRoute;
  onNavigate?: MetaNavigate;
  /** Back target for menu screens (Compendium). */
  onBack?: () => void;
}

export function metaRouteForPhase(phase: Phase): MetaRoute {
  switch (phase) {
    case 'ROUND_RESULT':
      return 'roundresult';
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
      return routeForPhase(phase);
  }
}

/** Standalone meta outlet; the shell router keeps its own Route union. */
export function MetaRouter({ route, onNavigate, onBack }: MetaRouterProps) {
  const phase = useGameStore((store) => store.state.phase);
  switch (route ?? metaRouteForPhase(phase)) {
    case 'shop':
      return <ShopScreen onNavigate={onNavigate} />;
    case 'elevator':
      return <ElevatorScreen onNavigate={onNavigate} />;
    case 'boss':
      return <BossIntroScreen onNavigate={onNavigate} />;
    case 'gameover':
      return <GameOverScreen onNavigate={onNavigate} />;
    case 'victory':
      return <VictoryScreen onNavigate={onNavigate} />;
    case 'compendium':
      return <CompendiumScreen onNavigate={onNavigate} onBack={onBack} />;
    case 'resume':
      return <ResumePrompt onNavigate={onNavigate} />;
    case 'roundresult':
      return <RoundResultScreen onNavigate={onNavigate} />;
    case 'title':
      return <SeedEntry onNavigate={onNavigate} />;
    default:
      return null;
  }
}

export interface MetaOutletProps {
  route: Route;
  onNavigate?: MetaNavigate;
}

export const MetaOutlet = MetaRouter;
