/** @jsxRuntime automatic */
import { TEST_IDS } from '@jackpotsyndicate/contracts';
import { formatCash } from './metaContent';

export interface BossBarProps {
  playerScore: number;
  bossScore: number;
  bossName?: string;
  playerLabel?: string;
  pending?: boolean;
}

/**
 * R-BOS-01 head-to-head tug-of-war bar. Player round cash vs boss score.
 */
export function BossBar({
  playerScore,
  bossScore,
  bossName = 'Boss',
  playerLabel = 'Player',
  pending = false,
}: BossBarProps) {
  const player = Math.max(0, playerScore);
  const boss = Math.max(0, bossScore);
  const total = player + boss;
  const playerShare = total <= 0 ? 0.5 : player / total;
  const playerWidth = Math.round(playerShare * 1000) / 10;
  const lead = player > boss ? 'player' : boss > player ? 'boss' : 'level';

  return (
    <section
      className="boss-bar panel"
      data-testid={TEST_IDS.bossBar}
      aria-label="Boss tug-of-war"
    >
      <div className="boss-bar-heading">
        <span className="eyebrow">Tug of war</span>
        <strong>{bossName}</strong>
        <span className={`boss-lead boss-lead-${lead}`}>
          {lead === 'player' ? 'Player leads' : lead === 'boss' ? 'Boss leads' : 'Level'}
          {pending ? ' · score pending' : ''}
        </span>
      </div>

      <div className="boss-bar-row">
        <span>{playerLabel}</span>
        <span data-testid="boss-player-score">{formatCash(player)}</span>
      </div>
      <div
        className="boss-tug"
        role="meter"
        aria-label="Player share of the tug-of-war"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(playerShare * 100)}
      >
        <div
          className="boss-tug-player"
          data-testid="boss-bar-player"
          style={{ width: `${playerWidth}%` }}
        />
        <div
          className="boss-tug-boss"
          data-testid="boss-bar-boss"
          style={{ width: `${100 - playerWidth}%` }}
        />
      </div>
      <div className="boss-bar-row">
        <span>Boss</span>
        <span data-testid="boss-score">{formatCash(boss)}</span>
      </div>
      <p className="meta-hint">
        The boss scores once per spin. Bank more round cash than the boss after
        the final spin to take the floor.
      </p>
    </section>
  );
}

export const BossTugOfWar = BossBar;
export const TugOfWarBar = BossBar;
export default BossBar;
