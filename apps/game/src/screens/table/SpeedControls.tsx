/** @jsxRuntime automatic */
import { useGameStore } from '../../store/gameStore';

/**
 * Speed is a browser-loop multiplier only: the fixed-step loop runs the same
 * tick sequence, so 1x/2x/4x differ in wall-clock pacing, not state hashes.
 */
export function SpeedControls() {
  const speed = useGameStore((store) => store.settings.speed);
  const setSpeed = useGameStore((store) => store.setSpeed);

  return (
    <section className="speed-panel" aria-label="Simulation speed" data-testid="table-speed">
      <span className="speed-label" aria-hidden="true">Speed</span>
      <div className="speed-group" role="group" aria-label="Table simulation speed">
        {[1, 2, 4].map((value) => (
          <button
            key={value}
            type="button"
            className="speed-btn"
            data-testid={`table-speed-${value}`}
            aria-pressed={speed === value}
            title={`${value}× fixed step: same tick sequence at every rate`}
            onClick={() => setSpeed(value)}
          >
            {value}×
          </button>
        ))}
      </div>
    </section>
  );
}
