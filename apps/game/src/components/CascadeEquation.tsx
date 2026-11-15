/** @jsxRuntime automatic */
import { useGameStore } from '../store/gameStore';

/**
 * Live cascade equation (R-UI-02):
 *   Chips x +Mult x X-Mult x Drop x Lip Drops
 * Values come from the latest SpinEvaluated event and the sum of lip drops in
 * the run stats. Nothing here writes to core state.
 */
export function CascadeEquation() {
  const lastSpin = useGameStore((store) => store.lastSpin);
  const dropMult = useGameStore((store) => store.lastDropMult);
  const lipDrops = useGameStore((store) => store.state.stats.lipDrops);

  const chips = lastSpin?.chips ?? 0;
  const addMult = lastSpin?.addMult ?? 1;
  const xMult = lastSpin?.xMult ?? 1;
  const equity = lastSpin?.equity ?? Math.round(chips * addMult * xMult * dropMult);

  return (
    <div
      className="cascade"
      data-testid="cascade-equation"
      role="group"
      aria-label={`Cascade equation: ${chips} chips times ${addMult} additive mult times ${xMult} x mult times ${dropMult} drop, ${lipDrops} lip drops, for ${equity} spin equity`}
    >
      <div className="cascade-heading">
        <span>Live cascade</span>
        <strong>Chips × +Mult × X-Mult × Drop × Lip Drops</strong>
      </div>

      <span className="cascade-term">
        <b>{chips.toLocaleString('en-US')}</b>
        <small>Chips</small>
      </span>
      <span className="cascade-op" aria-hidden="true">×</span>
      <span className="cascade-term">
        <b>+{Number.isInteger(addMult) ? addMult : addMult.toFixed(2)}</b>
        <small>+Mult</small>
      </span>
      <span className="cascade-op" aria-hidden="true">×</span>
      <span className="cascade-term">
        <b>{Number.isInteger(xMult) ? xMult : xMult.toFixed(2)}</b>
        <small>X-Mult</small>
      </span>
      <span className="cascade-op" aria-hidden="true">×</span>
      <span className="cascade-term">
        <b>{Number.isInteger(dropMult) ? dropMult : dropMult.toFixed(2)}</b>
        <small>Drop</small>
      </span>

      <span className="cascade-total">
        <b>{equity.toLocaleString('en-US')}</b>
        <small>Spin equity</small>
      </span>

      <span className="cascade-lip">
        Lip drops <b>{lipDrops}</b>
      </span>
    </div>
  );
}
