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
 * R-BOS-01 head-to-head tug-of-war bar. Player round cash vs boss score; the
 * knot sits where the two meet, so a lead reads at a glance.
 */
export function BossBar({
  playerScore,
  bossScore,
  bossName = 'Boss',
  playerLabel = 'You',
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
      className={`boss-bar lead-${lead}`}
      data-testid={TEST_IDS.bossBar}
      aria-label="Boss tug-of-war"
    >
      <div className="boss-bar-heading">
        <span className="stat-label">The duel</span>
        <span className={`boss-lead boss-lead-${lead}`}>
          {lead === 'player' ? 'You lead' : lead === 'boss' ? `${bossName} leads` : 'Dead level'}
          {pending ? ' · scores pending' : ''}
        </span>
      </div>

      <div className="boss-bar-scores">
        <div className="boss-bar-side side-player">
          <span className="stat-label">{playerLabel}</span>
          <strong data-testid="boss-player-score">{formatCash(player)}</strong>
        </div>
        <div className="boss-bar-side side-boss">
          <span className="stat-label">{bossName}</span>
          <strong data-testid="boss-score">{formatCash(boss)}</strong>
        </div>
      </div>
      <div
        className="boss-tug"
        role="meter"
        aria-label="Your share of the tug-of-war"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(playerShare * 100)}
        style={{ ['--player-share' as string]: `${playerWidth}%` }}
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
        <span className="boss-tug-knot" aria-hidden="true" />
      </div>
      <p className="meta-hint">
        No quota in a boss round. The boss scores once per spin; bank more round cash
        than the boss by the final spin to take the floor.
      </p>
    </section>
  );
}

export const BossTugOfWar = BossBar;
export const TugOfWarBar = BossBar;
export default BossBar;
