/** @jsxRuntime automatic */
import { useEffect, useRef, useState } from 'react';
import { RULES, TEST_IDS } from '@jackpotsyndicate/contracts';
import { FLOOR_LABELS, formatCash, useGameStore } from '../store/gameStore';
import { quotaForState } from '../screens/meta/metaContent';
import { SpriteImage } from './Artwork';

/**
 * Re-trigger a CSS keyframe class whenever `value` changes. Returns the class
 * to apply (alternating names restart the animation without layout thrash).
 */
function usePulse(value: number, direction = true): string {
  const previous = useRef(value);
  const [pulse, setPulse] = useState('');
  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (before === value) return;
    const up = value > before;
    setPulse((current) => {
      const base = !direction ? 'is-pulse' : up ? 'is-up' : 'is-down';
      return current.endsWith('-a') ? `${base}-b` : `${base}-a`;
    });
  }, [value, direction]);
  return pulse;
}

/**
 * Compact cockpit top bar (R-UI-02): floor and round, bankroll, quota with a
 * progress rail, spins as pips, the fever meter and the run seed. Every C-8
 * test id keeps its exact text content; decoration lives beside it.
 */
export function Hud() {
  const state = useGameStore((store) => store.state);

  const quota = quotaForState(state);
  const fever = Math.round(state.fever);
  const boss = state.round >= 4 || state.boss !== null;
  const progress = quota > 0 ? Math.min(1, Math.max(0, state.bankroll / quota)) : 1;
  const met = quota > 0 && state.bankroll >= quota;
  const totalSpins = Math.max(RULES.SPINS_PER_ROUND, state.spinsLeft);
  const bankPulse = usePulse(state.bankroll);
  const spinPulse = usePulse(state.spinsLeft, false);
  const feverHot = fever >= 80;

  return (
    <section
      className="hud ui9-panel"
      aria-label="Heads-up display"
      data-quota-met={met}
      data-fever-hot={feverHot}
    >
      <div className="hud-cell hud-floor">
        <span className="hud-kicker">
          {boss ? 'Boss round' : `Round ${state.round}`}
        </span>
        <strong className="hud-floor-name" data-testid={TEST_IDS.floorBadge}>
          {FLOOR_LABELS[state.floorId]}
        </strong>
      </div>

      <div className={`hud-cell hud-bank ${bankPulse}`}>
        <span className="hud-kicker">Bankroll</span>
        <strong className="hud-value gold" data-testid={TEST_IDS.bankroll}>
          {formatCash(state.bankroll)}
        </strong>
      </div>

      <div className="hud-cell hud-quota">
        <div className="hud-quota-line">
          <span className="hud-kicker">{met ? 'Quota met' : 'Quota'}</span>
          <strong className="hud-value cyan" data-testid={TEST_IDS.quota}>
            {formatCash(quota)}
          </strong>
        </div>
        <div
          className="hud-meter hud-quota-meter"
          role="progressbar"
          aria-label="Bankroll toward quota"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span className="hud-meter-fill" style={{ transform: `scaleX(${progress})` }} />
          <span className="hud-meter-mark" aria-hidden="true" />
        </div>
      </div>

      <div className={`hud-cell hud-spins ${spinPulse}`}>
        <span className="hud-kicker">Spins left</span>
        <div className="hud-spins-row">
          <strong className="hud-value" data-testid={TEST_IDS.spinsLeft}>
            {state.spinsLeft}
          </strong>
          <span className="hud-pips" aria-hidden="true">
            {Array.from({ length: totalSpins }, (_, index) => (
              <i key={index} className={index < state.spinsLeft ? 'on' : ''} />
            ))}
          </span>
        </div>
      </div>

      <div className="hud-cell hud-fever">
        <div className="hud-quota-line">
          <span className="hud-kicker">Fever</span>
          <strong className="hud-value crimson" data-testid={TEST_IDS.fever}>
            {fever}%
          </strong>
        </div>
        <div
          className="hud-meter hud-fever-meter"
          role="progressbar"
          aria-label="Fever meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fever}
        >
          <span className="hud-meter-fill" style={{ transform: `scaleX(${Math.min(1, fever / 100)})` }} />
        </div>
      </div>

      {state.grid.frozen.length > 0 ? (
        <span className="freeze-chip">
          <SpriteImage spriteKey="vfx.freeze" className="freeze-chip-art" />
          {state.grid.frozen.length} frozen
        </span>
      ) : null}

      <div className="hud-cell hud-seed">
        <span className="hud-kicker">Round cash</span>
        <span className="hud-roundcash">{formatCash(state.roundCash)}</span>
        <span className="hud-seed-text" data-testid={TEST_IDS.seedDisplay}>
          Seed <strong>{state.seed}</strong>
        </span>
      </div>
    </section>
  );
}
