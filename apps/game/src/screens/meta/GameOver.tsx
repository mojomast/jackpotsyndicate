/** @jsxRuntime automatic */
import { TEST_IDS, type GameEvent, type RoundResult, type RunState } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { dispatchMeta } from './commands';
import { bossForFloor, floorName, floorOrder, formatCash } from './metaContent';
import { discardStoredSave, saveCore, useMetaAutosave } from './persistence';
import { navigateTo, type MetaNavigate } from './navigation';
import { randomSeed } from './seed';
import { SeedCard, StatTile } from './ui';

export interface GameOverScreenProps {
  onNavigate?: MetaNavigate;
}

function lastOutcome(events: readonly GameEvent[]): 'victory' | 'defeat' | 'abandoned' | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.t === 'RunEnded') return event.outcome;
  }
  return null;
}

/** One sentence on why the run ended, from the settled verdict when we have it. */
function causeOf(state: RunState, result: RoundResult | null, outcome: string | null): string {
  if (outcome === 'abandoned') return 'You walked away from the table. The house keeps the change.';
  const where = `${floorName(state.floorId)}, ${state.round >= 4 ? 'boss round' : `round ${state.round}`}`;
  if (result?.kind === 'boss' && !result.passed) {
    const boss = bossForFloor(state.floorId)?.name ?? 'The boss';
    return `${boss} out-banked you ${formatCash(result.bossScore)} to ${formatCash(result.playerScore)} in the ${where}.`;
  }
  if (result?.kind === 'normal' && !result.passed) {
    const short = Math.max(0, result.quota - result.bankrollBefore);
    return `The bankroll came up ${formatCash(short)} short of the ${formatCash(result.quota)} quota in ${where}.`;
  }
  return `The Syndicate called the debt in ${where}.`;
}

export function GameOverScreen({ onNavigate }: GameOverScreenProps) {
  useMetaAutosave();
  const state = useGameStore((store) => store.state);
  const lastResult = useGameStore((store) => store.lastResult);
  const events = useGameStore((store) => store.events);
  const cause = causeOf(state, lastResult, lastOutcome(events));

  const restart = (seed: string) => {
    discardStoredSave();
    const result = dispatchMeta({ c: 'NewRun', seed });
    if (result.ok) {
      saveCore();
      navigateTo('table', onNavigate);
    }
  };

  return (
    <section
      className="screen meta-screen meta-stage gameover-screen"
      data-testid={TEST_IDS.gameover}
      aria-labelledby="gameover-heading"
    >
      <div className="stage-backdrop stage-crimson" aria-hidden="true" />
      <div className="stage-card">
        <p className="eyebrow">Run over · Floor {floorOrder(state.floorId)}</p>
        <h1 className="stage-title" id="gameover-heading">
          <span className="stage-title-small">The house</span>{' '}
          <span className="stage-title-big">wins</span>
        </h1>
        <p className="stage-cause" data-testid="gameover-cause">{cause}</p>

        <div className="stat-grid">
          <StatTile label="Final bankroll" value={formatCash(state.bankroll)} tone="crimson" testId="gameover-bankroll" />
          <StatTile label="Floors cleared" value={`${state.floorsCleared.length} / 3`} />
          <StatTile label="Spins" value={state.stats.spins} />
          <StatTile label="Lip drops" value={state.stats.lipDrops} />
          <StatTile label="Cash banked" value={formatCash(state.stats.cashBanked)} tone="gold" />
          <StatTile label="Best spin" value={formatCash(state.stats.bestSpinEquity)} />
        </div>

        <SeedCard seed={state.seed} caption="Same seed, same reels, same bosses. Share it or run it back." />

        <div className="screen-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            data-testid="retry-seed"
            onClick={() => restart(state.seed)}
          >
            Retry this seed
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-lg"
            data-testid="gameover-new-run"
            onClick={() => restart(randomSeed())}
          >
            New run
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigateTo('title', onNavigate)}>
            Title
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigateTo('compendium', onNavigate)}>
            Compendium
          </button>
        </div>
      </div>
    </section>
  );
}

export const GameOver = GameOverScreen;
export const GameOverStub = GameOverScreen;

export default GameOverScreen;
