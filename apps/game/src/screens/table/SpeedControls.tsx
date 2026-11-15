/** @jsxRuntime automatic */
import { useGameStore } from '../../store/gameStore';
import { uiPanelStyle } from '../../components/Artwork';

/**
 * Speed is a browser-loop multiplier only: the fixed-step loop runs the same
 * tick sequence, so 1x/2x/4x differ in wall-clock pacing, not state hashes.
 */
export function SpeedControls() {
  const speed = useGameStore((store) => store.settings.speed);
  const setSpeed = useGameStore((store) => store.setSpeed);

  return (
    <section className="speed-panel panel" aria-label="Simulation speed" data-testid="table-speed" style={uiPanelStyle()}>
      <div className="panel-heading">
        <h2>Loop speed</h2>
        <span>{speed}× fixed step</span>
      </div>
      <div className="speed-group" role="group" aria-label="Table simulation speed">
        {[1, 2, 4].map((value) => (
          <button
            key={value}
            type="button"
            className="btn"
            data-testid={`table-speed-${value}`}
            aria-pressed={speed === value}
            onClick={() => setSpeed(value)}
          >
            {value}×
          </button>
        ))}
      </div>
      <p className="prep-feedback">Same tick sequence at every rate.</p>
    </section>
  );
}
