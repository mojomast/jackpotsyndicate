/** @jsxRuntime automatic */
import { useEffect, useRef } from 'react';
import type { RoundResult as RoundResultData } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { dispatchMeta } from './commands';
import {
  bossForFloor,
  bossForFloorId,
  bossReward,
  bossRewardCopy,
  floorName,
  formatCash,
  quotaForState,
} from './metaContent';
import { MetaScreen } from './MetaScreen';
import { useMetaAutosave } from './persistence';
import { navigateTo, routeForPhase, type MetaNavigate } from './navigation';
import { StatTile } from './ui';

export interface RoundResultScreenProps {
  onNavigate?: MetaNavigate;
  /** Focus the primary action on mount (the overlay does). */
  autoFocus?: boolean;
}

function latestResult(events: ReturnType<typeof useGameStore.getState>['events']): RoundResultData | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.t === 'RoundSettled') return event.result;
  }
  return null;
}

function headline(result: RoundResultData): { stamp: string; title: string; copy: string } {
  if (result.kind === 'boss') {
    return result.passed
      ? {
          stamp: 'Boss broken',
          title: 'The floor is yours',
          copy: 'You out-banked the boss. Collect the bounty, then ride up.',
        }
      : {
          stamp: 'House wins',
          title: 'The boss took the duel',
          copy: 'The boss banked more than you this round. The run ends here.',
        };
  }
  return result.passed
    ? {
        stamp: 'Quota met',
        title: 'Round cleared',
        copy: 'The Syndicate takes its tribute. What is left is yours to spend at the vendor.',
      }
    : {
        stamp: 'Quota missed',
        title: 'The debt is called',
        copy: 'The bankroll came up short of the quota. The run ends here; the seed lets you try it again.',
      };
}

/** R-RUN-03 verdict: shown once the shelf settles after the final spin of a round. */
export function RoundResultScreen({ onNavigate, autoFocus = false }: RoundResultScreenProps) {
  useMetaAutosave();
  const state = useGameStore((store) => store.state);
  const events = useGameStore((store) => store.events);
  const storedResult = useGameStore((store) => store.lastResult);
  const settled = storedResult ?? latestResult(events);
  const continueRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (autoFocus) continueRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

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
  const copy = headline(result);
  const tone = result.passed ? 'pass' : 'fail';
  const bossName = bossForFloor(state.floorId)?.name ?? 'The boss';
  const rewardEvent = [...events].reverse().find((event) => event.t === 'BossRewarded') as
    | { t: 'BossRewarded'; reward: 'relicChoice' | 'shopCapacity' | 'victory'; amount: number }
    | undefined;
  const reward = boss && result.passed
    ? rewardEvent
      ? { kind: rewardEvent.reward, amount: rewardEvent.amount }
      : bossReward(bossForFloorId(state.floorId))
    : null;
  const continueLabel = !result.passed
    ? 'See run summary'
    : !boss
      ? 'Enter the shop'
      : reward?.kind === 'shopCapacity'
        ? 'Call the elevator'
        : reward?.kind === 'victory'
          ? 'Claim the house'
          : 'Claim a relic';

  const continueRun = () => {
    const outcome = dispatchMeta({ c: 'ContinueAfterRound' });
    if (!outcome.ok) return;
    navigateTo(routeForPhase(useGameStore.getState().state.phase), onNavigate);
  };

  return (
    <MetaScreen
      eyebrow={`${floorName(state.floorId)} · ${boss ? 'Boss round' : `Round ${state.round}`}`}
      title={copy.title}
      testId="round-result"
      className={`round-result result-${tone}`}
    >
      <p className={`result-stamp stamp-${tone}`} aria-hidden="true">{copy.stamp}</p>
      <p className="result-copy">
        <span className="sr-only">Outcome: </span>
        <span className={`result-outcome outcome-${tone}`} data-testid="round-result-outcome">
          {result.passed ? 'Passed' : 'Missed'}
        </span>
        <span className="result-copy-text">{copy.copy}</span>
      </p>

      {boss ? (
        <div className="result-ledger result-duel">
          <StatTile
            label="Your round cash"
            value={formatCash(result.playerScore)}
            tone={result.passed ? 'emerald' : 'ivory'}
            testId="round-player-score"
            size="lg"
          />
          <span className="ledger-op" aria-hidden="true">vs</span>
          <StatTile
            label={bossName}
            value={formatCash(result.bossScore)}
            tone={result.passed ? 'ivory' : 'crimson'}
            testId="round-boss-score"
            size="lg"
          />
        </div>
      ) : (
        <div className="result-ledger">
          <StatTile label="Bankroll" value={formatCash(result.bankrollBefore)} />
          <span className="ledger-op" aria-hidden="true">−</span>
          <StatTile
            label="Quota"
            value={formatCash(result.quota)}
            tone={result.passed ? 'gold' : 'crimson'}
            testId="round-quota"
          />
          <span className="ledger-op" aria-hidden="true">=</span>
          <StatTile
            label={result.passed ? 'Left to spend' : 'Bankroll'}
            value={formatCash(result.bankrollAfter)}
            tone={result.passed ? 'emerald' : 'crimson'}
            testId="round-bankroll"
            size="lg"
          />
        </div>
      )}

      {reward ? (
        <p className="boss-reward" data-testid="boss-reward" data-reward={reward.kind}>
          <span className="stat-label">Boss reward</span>
          <strong>{bossRewardCopy(reward.kind, reward.amount)}</strong>
        </p>
      ) : null}

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

      <div className="screen-actions">
        <button
          type="button"
          className={`btn btn-lg ${result.passed ? 'btn-primary' : 'btn-danger-solid'}`}
          data-testid="round-continue"
          ref={continueRef}
          onClick={continueRun}
          disabled={state.phase !== 'ROUND_RESULT' && state.phase !== 'BOSS_INTRO'}
        >
          {continueLabel}
        </button>
      </div>
    </MetaScreen>
  );
}

/**
 * The verdict as a modal over the settled table, so the board that produced
 * it stays visible behind the card.
 */
export function RoundResultOverlay({ onNavigate }: { onNavigate?: MetaNavigate }) {
  return (
    <div className="result-overlay" role="dialog" aria-modal="true" aria-label="Round result">
      <div className="result-overlay-card">
        <RoundResultScreen onNavigate={onNavigate} autoFocus />
      </div>
    </div>
  );
}

export const RoundResult = RoundResultScreen;

export default RoundResultScreen;
