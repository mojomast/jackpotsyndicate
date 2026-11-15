/** @jsxRuntime automatic */
import { FLOOR_LABELS, formatCash, useGameStore } from '../store/gameStore';
import { quotaForState } from '../screens/meta/metaContent';
import { TEST_IDS } from '@jackpotsyndicate/contracts';
import { CascadeEquation } from './CascadeEquation';
import { SpriteImage } from './Artwork';

export function Hud() {
  const state = useGameStore((store) => store.state);
  const dispatch = useGameStore((store) => store.dispatch);

  const quota = quotaForState(state);
  const canSpin = state.phase === 'PREP';
  const fever = Math.round(state.fever);

  const spin = () => {
    dispatch({ c: 'Spin' });
  };

  return (
    <section className="hud panel ui9-panel" aria-label="Heads-up display">
      <div className="hud-topline">
        <span className="hud-label">{state.phase.replaceAll('_', ' ')}</span>
        <span className="hud-label">Round {state.round} · {FLOOR_LABELS[state.floorId]}</span>
        <span className="hud-label">Round cash {formatCash(state.roundCash)}</span>
        {state.grid.frozen.length > 0 ? (
          <span className="freeze-chip">
            <SpriteImage spriteKey="vfx.freeze" className="freeze-chip-art" />
            {state.grid.frozen.length} frozen
          </span>
        ) : null}
      </div>

      <CascadeEquation />

      <dl className="hud-stats">
        <div className="hud-stat">
          <dt>Bankroll</dt>
          <dd className="gold" data-testid={TEST_IDS.bankroll}>
            {formatCash(state.bankroll)}
          </dd>
        </div>
        <div className="hud-stat">
          <dt>Quota</dt>
          <dd className="cyan" data-testid={TEST_IDS.quota}>
            {formatCash(quota)}
          </dd>
        </div>
        <div className="hud-stat">
          <dt>Spins left</dt>
          <dd data-testid={TEST_IDS.spinsLeft}>
            {state.spinsLeft}
          </dd>
        </div>
        <div className="hud-stat">
          <dt>Fever</dt>
          <dd className="crimson" data-testid={TEST_IDS.fever}>
            {fever}%
          </dd>
        </div>
        <div className="hud-stat">
          <dt>Floor</dt>
          <dd className="emerald" data-testid={TEST_IDS.floorBadge}>
            {FLOOR_LABELS[state.floorId]}
          </dd>
        </div>
      </dl>

      <div className="hud-actions">
        <button
          type="button"
          className="btn btn-primary hud-spin ui9-button"
          data-testid={TEST_IDS.spinBtn}
          onClick={spin}
          disabled={!canSpin}
          aria-keyshortcuts="Space"
          title={canSpin ? 'Spin (Space)' : `Spin unavailable during ${state.phase}`}
        >
          {canSpin ? 'Spin' : state.phase.replaceAll('_', ' ')}
        </button>
        <span className="hud-seed" data-testid={TEST_IDS.seedDisplay}>
          Seed <strong>{state.seed}</strong>
        </span>
      </div>
    </section>
  );
}
