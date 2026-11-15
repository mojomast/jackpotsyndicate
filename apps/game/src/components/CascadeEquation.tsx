/** @jsxRuntime automatic */
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';

function formatInt(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatMult(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}

/**
 * Animate a displayed number toward `target` (ease-out), after `delay` ms.
 * Reduced motion snaps immediately. Presentation only.
 */
function useCountUp(target: number, duration: number, delay: number, reducedMotion: boolean): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const shownRef = useRef(target);
  shownRef.current = shown;

  useEffect(() => {
    if (reducedMotion || typeof requestAnimationFrame === 'undefined') {
      setShown(target);
      fromRef.current = target;
      return undefined;
    }
    const from = shownRef.current;
    if (from === target) return undefined;
    fromRef.current = from;
    let raf = 0;
    let start = 0;
    const step = (now: number): void => {
      if (start === 0) start = now;
      const t = Math.min(1, Math.max(0, (now - start - delay) / duration));
      const k = 1 - (1 - t) ** 3;
      setShown(t >= 1 ? target : from + (target - from) * k);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay, reducedMotion]);

  return shown;
}

/** Restart a punch animation class each time `key` changes. */
function usePunch(key: unknown): string {
  const [flip, setFlip] = useState<'' | 'a' | 'b'>('');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setFlip((current) => (current === 'a' ? 'b' : 'a'));
  }, [key]);
  return flip ? `is-punch-${flip}` : '';
}

/**
 * Live cascade equation (R-UI-02):
 *   Chips x +Mult x X-Mult x Drop x Lip Drops
 * Values come from the latest SpinEvaluated event and the sum of lip drops in
 * the run stats. The visible digits count up for juice; the final values are
 * always present in the DOM (hidden copies) so tests and assistive tech read
 * the settled numbers. Nothing here writes to core state.
 */
export function CascadeEquation() {
  const lastSpin = useGameStore((store) => store.lastSpin);
  const dropMult = useGameStore((store) => store.lastDropMult);
  const lipDrops = useGameStore((store) => store.state.stats.lipDrops);
  const reducedMotion = useGameStore((store) => store.settings.reducedMotion);

  const chips = lastSpin?.chips ?? 0;
  const addMult = lastSpin?.addMult ?? 1;
  const xMult = lastSpin?.xMult ?? 1;
  const equity = lastSpin?.equity ?? Math.round(chips * addMult * xMult * dropMult);

  const shownChips = useCountUp(chips, 520, 0, reducedMotion);
  const shownEquity = useCountUp(equity, 760, 380, reducedMotion);
  const punchSpin = usePunch(lastSpin);
  const punchDrop = usePunch(dropMult);
  const big = equity >= 1000;
  const tier = equity >= 5000 ? 'mega' : big ? 'big' : equity > 0 ? 'win' : 'idle';

  return (
    <div
      className={`cascade cascade-${tier}`}
      data-testid="cascade-equation"
      role="group"
      aria-label={`Cascade equation: ${chips} chips times ${addMult} additive mult times ${xMult} x mult times ${dropMult} drop, ${lipDrops} lip drops, for ${equity} spin equity`}
    >
      <span className={`cascade-term cascade-chips ${punchSpin}`}>
        <small>Chips</small>
        <b>
          <span className="cascade-final" hidden>{chips.toLocaleString('en-US')}</span>
          <span aria-hidden="true">{formatInt(shownChips)}</span>
        </b>
      </span>
      <span className="cascade-op" aria-hidden="true">×</span>
      <span className={`cascade-term cascade-mult ${punchSpin}`}>
        <small>+Mult</small>
        <b>+{formatMult(addMult)}</b>
      </span>
      <span className="cascade-op" aria-hidden="true">×</span>
      <span className={`cascade-term cascade-xmult ${punchSpin}`}>
        <small>X-Mult</small>
        <b>{formatMult(xMult)}</b>
      </span>
      <span className="cascade-op" aria-hidden="true">×</span>
      <span className={`cascade-term cascade-drop ${punchDrop}`}>
        <small>Drop</small>
        <b>{formatMult(dropMult)}</b>
      </span>
      <span className="cascade-op cascade-eq" aria-hidden="true">=</span>
      <span className={`cascade-total ${punchSpin}`}>
        <small>Spin equity</small>
        <b>
          <span className="cascade-final" hidden>{equity.toLocaleString('en-US')}</span>
          <span aria-hidden="true">{formatInt(shownEquity)}</span>
        </b>
      </span>
      <span className="cascade-lip" title="Lip drops this run">
        <small>Lip drops</small>
        <b>{lipDrops}</b>
      </span>
    </div>
  );
}
