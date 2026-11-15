/** @jsxRuntime automatic */
import { useGameStore } from '../../store/gameStore';
import { dispatchMeta } from './commands';
import {
  BOSS_SABOTAGE,
  bossForFloor,
  bossForFloorId,
  floorName,
  formatCash,
} from './metaContent';
import { BossBar, BossTugOfWar, TugOfWarBar } from './BossBar';
import { MetaNotice, MetaScreen } from './MetaScreen';
import { RelicPicker } from './Pickers';
import { useMetaAutosave } from './persistence';
import { navigateTo, type MetaNavigate } from './navigation';

export interface BossIntroScreenProps {
  onNavigate?: MetaNavigate;
}

export function BossIntroScreen({ onNavigate }: BossIntroScreenProps) {
  useMetaAutosave();
  const state = useGameStore((store) => store.state);
  const boss = bossForFloor(state.floorId);
  const bossId = bossForFloorId(state.floorId);

  if (state.phase === 'RELIC_PICK') {
    return <RelicPicker onNavigate={onNavigate} />;
  }

  const playerScore = state.roundCash;
  const bossScore = state.boss?.score ?? 0;
  const canBegin = state.phase === 'BOSS_INTRO';

  const begin = () => {
    if (canBegin) {
      const result = dispatchMeta({ c: 'ContinueAfterRound' });
      if (result.ok) navigateTo('table', onNavigate);
      return;
    }
    navigateTo('table', onNavigate);
  };

  return (
    <MetaScreen
      eyebrow="Floor boss · R-BOS-01"
      title={boss?.name ?? 'Boss intro'}
      description={
        boss?.tagline ??
        'A head-to-head duel. The player banks round cash; the boss scores once per spin.'
      }
      testId="boss-intro"
    >
      <div className="boss-layout">
        <div className="boss-dossier panel">
          <span className="eyebrow">{floorName(state.floorId)} · round {state.round}</span>
          <h2>{boss?.name ?? bossId}</h2>
          <p>{BOSS_SABOTAGE[bossId]}</p>
          <dl className="boss-facts">
            <div>
              <dt>Player round cash</dt>
              <dd>{formatCash(playerScore)}</dd>
            </div>
            <div>
              <dt>Boss score</dt>
              <dd>{formatCash(bossScore)}</dd>
            </div>
            <div>
              <dt>Spins left</dt>
              <dd>{state.spinsLeft}</dd>
            </div>
            <div>
              <dt>Quota</dt>
              <dd>None in boss rounds (D-04)</dd>
            </div>
          </dl>
          {state.boss === null && state.phase !== 'BOSS_INTRO' ? (
            <MetaNotice tone="info">
              The boss round has not started on this floor yet.
            </MetaNotice>
          ) : null}
          <div className="stub-actions">
            <button type="button" className="btn btn-primary" onClick={begin}>
              {canBegin ? 'Begin boss round' : 'Back to table'}
            </button>
          </div>
        </div>

        <BossBar
          playerScore={playerScore}
          bossScore={bossScore}
          bossName={boss?.name ?? bossId}
          pending={state.phase === 'BOSS_INTRO' || state.spinsLeft > 0}
        />
      </div>

      <p className="meta-hint">
        Sabotage resolves before the spin. Boss scores are fixed per seed, so the
        same seed always produces the same duel.
      </p>
    </MetaScreen>
  );
}

export const BossIntro = BossIntroScreen;
export const BossScreen = BossIntroScreen;
export const BossStub = BossIntroScreen;

export { BossTugOfWar, TugOfWarBar };
export default BossIntroScreen;
