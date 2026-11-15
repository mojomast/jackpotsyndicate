/** @jsxRuntime automatic */
import { TEST_IDS } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { dispatchMeta } from './commands';
import { CopySeedButton } from './copy';
import { floorName, formatCash } from './metaContent';
import { MetaScreen } from './MetaScreen';
import { discardStoredSave, saveCore, useMetaAutosave } from './persistence';
import { navigateTo, type MetaNavigate } from './navigation';

export interface GameOverScreenProps {
  onNavigate?: MetaNavigate;
}

export function GameOverScreen({ onNavigate }: GameOverScreenProps) {
  useMetaAutosave();
  const state = useGameStore((store) => store.state);

  const retry = () => {
    discardStoredSave();
    const result = dispatchMeta({ c: 'NewRun', seed: state.seed });
    if (result.ok) {
      saveCore();
      navigateTo('table', onNavigate);
    }
  };

  return (
    <MetaScreen
      eyebrow="Run summary"
      title="Game over"
      description="The house called the debt. The seed below reproduces this run exactly, first spin included."
      testId={TEST_IDS.gameover}
    >
      <div className="summary-grid">
        <div className="summary-card panel">
          <span className="eyebrow">Seed</span>
          <p className="seed-value" data-testid={TEST_IDS.seedDisplay}>{state.seed}</p>
          <CopySeedButton seed={state.seed} testId="copy-seed" />
        </div>
        <div className="summary-card panel">
          <span className="eyebrow">Reached</span>
          <strong>{floorName(state.floorId)}</strong>
          <span className="meta-hint">Round {state.round} · {state.spinsLeft} spins left</span>
        </div>
        <div className="summary-card panel">
          <span className="eyebrow">Final bankroll</span>
          <strong data-testid="gameover-bankroll">{formatCash(state.bankroll)}</strong>
          <span className="meta-hint">
            {state.stats.spins} spins · {state.stats.lipDrops} lip drops
          </span>
        </div>
        <div className="summary-card panel">
          <span className="eyebrow">Run stats</span>
          <span className="meta-hint">
            {formatCash(state.stats.cashBanked)} banked · best spin{' '}
            {formatCash(state.stats.bestSpinEquity)}
          </span>
          <span className="meta-hint">
            {state.floorsCleared.length} floor
            {state.floorsCleared.length === 1 ? '' : 's'} cleared
          </span>
        </div>
      </div>

      <div className="stub-actions">
        <button
          type="button"
          className="btn btn-primary"
          data-testid="retry-seed"
          onClick={retry}
        >
          Retry seed
        </button>
        <button type="button" className="btn" onClick={() => navigateTo('title', onNavigate)}>
          New seed
        </button>
        <button type="button" className="btn" onClick={() => navigateTo('compendium', onNavigate)}>
          Compendium
        </button>
      </div>

      <p className="notice">
        <strong>Play money only.</strong> No purchases, ads, accounts or network
        calls. Retrying the same seed replays the same reel strips and boss
        scores.
      </p>
    </MetaScreen>
  );
}

export const GameOver = GameOverScreen;
export const GameOverStub = GameOverScreen;

export default GameOverScreen;
