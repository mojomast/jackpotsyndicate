/** @jsxRuntime automatic */
import { TEST_IDS } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { CopySeedButton } from './copy';
import { formatCash } from './metaContent';
import { MetaScreen } from './MetaScreen';
import { useMetaAutosave } from './persistence';
import { navigateTo, type MetaNavigate } from './navigation';

export interface VictoryScreenProps {
  onNavigate?: MetaNavigate;
}

export function VictoryScreen({ onNavigate }: VictoryScreenProps) {
  useMetaAutosave();
  const state = useGameStore((store) => store.state);

  return (
    <MetaScreen
      eyebrow="Run complete · J7"
      title="Victory"
      description="The Iron Auditor is down. Three floors, three bosses, one syndicate."
      testId={TEST_IDS.victory}
    >
      <div className="summary-grid">
        <div className="summary-card panel victory-seed">
          <span className="eyebrow">Seed</span>
          <p className="seed-value" data-testid={TEST_IDS.seedDisplay}>{state.seed}</p>
          <CopySeedButton seed={state.seed} testId="copy-seed" />
        </div>
        <div className="summary-card panel">
          <span className="eyebrow">Final bankroll</span>
          <strong data-testid="victory-bankroll">{formatCash(state.bankroll)}</strong>
          <span className="meta-hint">{formatCash(state.stats.cashBanked)} banked this run</span>
        </div>
        <div className="summary-card panel">
          <span className="eyebrow">Floors cleared</span>
          <strong>{state.floorsCleared.length} / 3</strong>
          <span className="meta-hint">{state.floorsCleared.join(' · ')}</span>
        </div>
        <div className="summary-card panel">
          <span className="eyebrow">Machine</span>
          <span className="meta-hint">
            {state.trinkets.length} trinkets · {state.grid.cols}×{state.grid.rows}{' '}
            {state.grid.wiring} · {state.jumpers.length} jumper
            {state.jumpers.length === 1 ? '' : 's'}
          </span>
          <span className="meta-hint">{state.stats.spins} spins</span>
        </div>
      </div>

      <div className="stub-actions">
        <button type="button" className="btn btn-primary" onClick={() => navigateTo('title', onNavigate)}>
          New run
        </button>
        <button type="button" className="btn" onClick={() => navigateTo('compendium', onNavigate)}>
          Compendium
        </button>
        <button type="button" className="btn" onClick={() => navigateTo('table', onNavigate)}>
          Back to table
        </button>
      </div>

      <p className="notice">
        <strong>Play money only.</strong> Victory is the full clear: Neon,
        one branch floor and the Velvet Penthouse.
      </p>
    </MetaScreen>
  );
}

export const Victory = VictoryScreen;
export const VictoryStub = VictoryScreen;

export default VictoryScreen;
