/** @jsxRuntime automatic */
import { useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { dispatchMeta } from './commands';
import {
  BOSS_SABOTAGE,
  bossForFloor,
  bossForFloorId,
  floorName,
  floorOrder,
} from './metaContent';
import { BossBar, BossTugOfWar, TugOfWarBar } from './BossBar';
import { MetaNotice } from './MetaScreen';
import { SpriteImage } from '../../components/Artwork';
import { RelicPicker } from './Pickers';
import { useMetaAutosave } from './persistence';
import { navigateTo, type MetaNavigate } from './navigation';

export interface BossIntroScreenProps {
  onNavigate?: MetaNavigate;
}

/** R-BOS-01: the boss walks on, states the house rule, and the duel begins. */
export function BossIntroScreen({ onNavigate }: BossIntroScreenProps) {
  useMetaAutosave();
  const state = useGameStore((store) => store.state);
  const boss = bossForFloor(state.floorId);
  const bossId = bossForFloorId(state.floorId);
  const beginRef = useRef<HTMLButtonElement | null>(null);
  const canBegin = state.phase === 'BOSS_INTRO';

  useEffect(() => {
    if (canBegin) beginRef.current?.focus({ preventScroll: true });
  }, [canBegin]);

  if (state.phase === 'RELIC_PICK') {
    return <RelicPicker onNavigate={onNavigate} />;
  }

  const playerScore = state.roundCash;
  const bossScore = state.boss?.score ?? 0;
  const name = boss?.name ?? 'The boss';

  const begin = () => {
    if (canBegin) {
      const result = dispatchMeta({ c: 'ContinueAfterRound' });
      if (result.ok) navigateTo('table', onNavigate);
      return;
    }
    navigateTo('table', onNavigate);
  };

  return (
    <section
      className={`screen meta-screen meta-stage boss-screen boss-${bossId}`}
      data-testid="boss-intro"
      aria-labelledby="boss-name"
    >
      <div className="boss-stage" aria-hidden="true">
        <span className="boss-spotlight" />
        <span className="boss-smoke" />
      </div>

      <div className="boss-layout">
        <div className="boss-portrait-wrap">
          <SpriteImage
            spriteKey={boss?.spriteKey}
            className="boss-intro-portrait"
            decorative={false}
            alt={`${name}, portrait`}
          />
        </div>

        <div className="boss-dossier">
          <p className="eyebrow boss-eyebrow">
            Floor {floorOrder(state.floorId)} boss · {floorName(state.floorId)}
          </p>
          <h1 className="boss-name" id="boss-name">{name}</h1>
          <p className="boss-tagline">{boss?.tagline ?? 'Head-to-head duel'}</p>

          <div className="house-rule">
            <span className="house-rule-label">House rule</span>
            <p className="house-rule-text">{BOSS_SABOTAGE[bossId]}</p>
          </div>

          <BossBar
            playerScore={playerScore}
            bossScore={bossScore}
            bossName={name}
            pending={state.phase === 'BOSS_INTRO' || state.spinsLeft > 0}
          />

          <dl className="boss-facts">
            <div>
              <dt>Spins</dt>
              <dd>{state.spinsLeft}</dd>
            </div>
            <div>
              <dt>Quota</dt>
              <dd>None</dd>
            </div>
            <div>
              <dt>Stakes</dt>
              <dd>Relic or ruin</dd>
            </div>
          </dl>

          {state.boss === null && state.phase !== 'BOSS_INTRO' ? (
            <MetaNotice tone="info">The boss round has not started on this floor yet.</MetaNotice>
          ) : null}

          <div className="screen-actions">
            <button
              type="button"
              className={`btn btn-lg ${canBegin ? 'btn-danger-solid' : 'btn-secondary'}`}
              onClick={begin}
              ref={beginRef}
            >
              {canBegin ? 'Begin boss round' : 'Back to table'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export const BossIntro = BossIntroScreen;
export const BossScreen = BossIntroScreen;
export const BossStub = BossIntroScreen;

export { BossTugOfWar, TugOfWarBar };
export default BossIntroScreen;
