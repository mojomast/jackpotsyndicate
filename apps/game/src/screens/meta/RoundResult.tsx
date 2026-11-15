/** @jsxRuntime automatic */
import type { RoundResult as RoundResultData } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { dispatchMeta } from './commands';
import { floorName, formatCash, quotaForState } from './metaContent';
import { MetaNotice, MetaScreen } from './MetaScreen';
import { useMetaAutosave } from './persistence';
import { navigateTo, routeForPhase, type MetaNavigate } from './navigation';

export interface RoundResultScreenProps {
  onNavigate?: MetaNavigate;
}

function latestResult(events: ReturnType<typeof useGameStore.getState>['events']): RoundResultData | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.t === 'RoundSettled') return event.result;
  }
  return null;
}

export function RoundResultScreen({ onNavigate }: RoundResultScreenProps) {
  useMetaAutosave();
  const state = useGameStore((store) => store.state);
  const events = useGameStore((store) => store.events);
  const settled = latestResult(events);

  const fallback: RoundResultData =
    state.round >= 4
      ? {
          kind: 'boss',
          passed: state.roundCash >= (state.boss?.score ?? 0),
          playerScore: state.roundCash,
          bossScore: state.boss?.score ?? 0,
        }
      : {
          kind: 'normal',
          passed: state.bankroll >= quotaForState(state),
          quota: quotaForState(state),
          bankrollBefore: state.bankroll,
          bankrollAfter: state.bankroll,
        };

  const result = settled ?? fallback;
  const boss = result.kind === 'boss';

  const continueRun = () => {
    const outcome = dispatchMeta({ c: 'ContinueAfterRound' });
    if (!outcome.ok) return;
    navigateTo(routeForPhase(useGameStore.getState().state.phase), onNavigate);
  };

  return (
    <MetaScreen
      eyebrow="Round settled"
      title={result.passed ? 'Round cleared' : 'Round missed'}
      description={
        boss
          ? 'Boss rounds have no quota. The higher side of the tug-of-war takes the floor (D-04).'
          : 'The tribute is deducted after a passed round. What remains is shop money.'
      }
      testId="round-result"
    >
      <div className="result-grid">
        <div className={`result-card panel ${result.passed ? 'result-pass' : 'result-fail'}`}>
          <span className="eyebrow">Outcome</span>
          <strong data-testid="round-result-outcome">
            {result.passed ? 'Passed' : 'Missed'}
          </strong>
          <span className="meta-hint">
            {floorName(state.floorId)} · round {state.round}
          </span>
        </div>

        {boss ? (
          <>
            <div className="result-card panel">
              <span className="eyebrow">Player round cash</span>
              <strong data-testid="round-player-score">{formatCash(result.playerScore)}</strong>
            </div>
            <div className="result-card panel">
              <span className="eyebrow">Boss score</span>
              <strong data-testid="round-boss-score">{formatCash(result.bossScore)}</strong>
            </div>
          </>
        ) : (
          <>
            <div className="result-card panel">
              <span className="eyebrow">Quota</span>
              <strong data-testid="round-quota">{formatCash(result.quota)}</strong>
            </div>
            <div className="result-card panel">
              <span className="eyebrow">Bankroll after tribute</span>
              <strong data-testid="round-bankroll">{formatCash(result.bankrollAfter)}</strong>
            </div>
          </>
        )}
      </div>

      {!result.passed ? (
        <MetaNotice tone="error">
          The quota was missed. Continue to the run summary and retry with the
          same seed.
        </MetaNotice>
      ) : (
        <MetaNotice tone="success">
          {boss
            ? 'Boss beaten. Continue to claim a relic and call the elevator.'
            : 'Quota paid. Continue to the vendor shelf.'}
        </MetaNotice>
      )}

      <div className="stub-actions">
        <button
          type="button"
          className="btn btn-primary"
          data-testid="round-continue"
          onClick={continueRun}
          disabled={state.phase !== 'ROUND_RESULT' && state.phase !== 'BOSS_INTRO'}
        >
          {result.passed
            ? boss
              ? 'Claim boss relic'
              : 'Enter shop'
            : 'Finish run'}
        </button>
        <button type="button" className="btn" onClick={() => navigateTo('table', onNavigate)}>
          Back to table
        </button>
      </div>

      <dl className="result-stats">
        <div>
          <dt>Spins</dt>
          <dd>{state.stats.spins}</dd>
        </div>
        <div>
          <dt>Lip drops</dt>
          <dd>{state.stats.lipDrops}</dd>
        </div>
        <div>
          <dt>Cash banked</dt>
          <dd>{formatCash(state.stats.cashBanked)}</dd>
        </div>
        <div>
          <dt>Best spin</dt>
          <dd>{formatCash(state.stats.bestSpinEquity)}</dd>
        </div>
      </dl>
    </MetaScreen>
  );
}

export const RoundResult = RoundResultScreen;

export default RoundResultScreen;
