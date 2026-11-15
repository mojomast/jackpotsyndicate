/** @jsxRuntime automatic */
import { TEST_IDS } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { SpriteImage } from '../../components/Artwork';
import { bossRewardCopy, floorName, formatCash, itemName, itemSpriteKey } from './metaContent';
import { useMetaAutosave } from './persistence';
import { navigateTo, type MetaNavigate } from './navigation';
import { SeedCard, StatTile } from './ui';

export interface VictoryScreenProps {
  onNavigate?: MetaNavigate;
}

/** Deterministic confetti: a fixed scatter of coins and sparks, CSS-animated. */
const CONFETTI = Array.from({ length: 28 }, (_, index) => ({
  left: (index * 37) % 100,
  delay: ((index * 53) % 40) / 10,
  duration: 4 + ((index * 29) % 30) / 10,
  kind: index % 3 === 0 ? 'spark' : 'coin',
}));

export function VictoryScreen({ onNavigate }: VictoryScreenProps) {
  useMetaAutosave();
  const state = useGameStore((store) => store.state);
  const events = useGameStore((store) => store.events);
  const rewarded = events.some((event) => event.t === 'BossRewarded' && event.reward === 'victory');

  return (
    <section
      className="screen meta-screen meta-stage victory-screen"
      data-testid={TEST_IDS.victory}
      aria-labelledby="victory-heading"
    >
      <div className="stage-backdrop stage-gold" aria-hidden="true">
        <span className="victory-rays" />
        <span className="confetti">
          {CONFETTI.map((piece, index) => (
            <span
              key={index}
              className={`confetti-${piece.kind}`}
              style={{
                left: `${piece.left}%`,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
              }}
            />
          ))}
        </span>
      </div>

      <div className="stage-card">
        <p className="eyebrow">Full clear · The Syndicate is broken</p>
        <h1 className="stage-title" id="victory-heading">
          <span className="stage-title-small">You broke</span>{' '}
          <span className="stage-title-big">the house</span>
        </h1>
        <p className="stage-cause">
          The Iron Auditor is scrap. Three floors, three bosses, one machine built from the
          ground up. Every number is play money; the bragging rights are real.
        </p>

        <p className="boss-reward" data-testid="boss-reward" data-reward="victory">
          <span className="stat-label">{rewarded ? 'Boss reward' : 'Final floor'}</span>
          <strong>{bossRewardCopy('victory', 0)}</strong>
        </p>

        <div className="stat-grid">
          <StatTile label="Final bankroll" value={formatCash(state.bankroll)} tone="gold" size="lg" testId="victory-bankroll" />
          <StatTile
            label="Floors cleared"
            value={`${state.floorsCleared.length} / 3`}
            tone="emerald"
            hint={state.floorsCleared.map((floorId) => floorName(floorId)).join(' → ')}
          />
          <StatTile label="Cash banked" value={formatCash(state.stats.cashBanked)} />
          <StatTile label="Spins" value={state.stats.spins} hint={`${state.stats.lipDrops} lip drops`} />
          <StatTile label="Best spin" value={formatCash(state.stats.bestSpinEquity)} />
          <StatTile
            label="Machine"
            value={`${state.grid.cols}×${state.grid.rows}`}
            hint={`${state.grid.wiring} · ${state.jumpers.length} jumper${state.jumpers.length === 1 ? '' : 's'}`}
          />
        </div>

        {state.trinkets.length > 0 ? (
          <div className="victory-trinkets" aria-label="Trinkets mounted on the winning machine" role="group">
            {state.trinkets.slice(0, 16).map((id, index) => (
              <span className="machine-icon" key={`${id}-${index}`} title={itemName(id)}>
                <SpriteImage spriteKey={itemSpriteKey(id)} className="machine-icon-art" fallback={itemName(id).slice(0, 2)} />
                <span className="sr-only">{itemName(id)}</span>
              </span>
            ))}
          </div>
        ) : null}

        <SeedCard seed={state.seed} caption="Share the seed: anyone can replay this exact run." />

        <div className="screen-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => navigateTo('title', onNavigate)}>
            New run
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigateTo('compendium', onNavigate)}>
            Compendium
          </button>
        </div>
      </div>
    </section>
  );
}

export const Victory = VictoryScreen;
export const VictoryStub = VictoryScreen;

export default VictoryScreen;
