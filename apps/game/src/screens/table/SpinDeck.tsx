/** @jsxRuntime automatic */
import { TEST_IDS, type Phase } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { SpeedControls } from './SpeedControls';

const PHASE_COPY: Partial<Record<Phase, { label: string; hint: string }>> = {
  PREP: { label: 'Spin', hint: 'Space' },
  SPINNING: { label: 'Spinning', hint: 'Reels in motion' },
  RESOLVING: { label: 'Paying out', hint: 'Orbs in play' },
  ROUND_SETTLE: { label: 'Settling', hint: 'Counting the round' },
  ROUND_RESULT: { label: 'Round over', hint: 'See the result' },
};

function humanPhase(phase: string): string {
  return phase.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** Lifecycle steps shown as lamps beside the SPIN action. */
const STEPS: { id: Phase[]; label: string }[] = [
  { id: ['PREP'], label: 'Prep' },
  { id: ['SPINNING'], label: 'Reels' },
  { id: ['RESOLVING'], label: 'Board' },
  { id: ['ROUND_SETTLE', 'ROUND_RESULT'], label: 'Settle' },
];

/**
 * The primary action. SPIN dispatches the C-2 `Spin` command (the store is a
 * read-only mirror); the lamps show which stage of the spin is running.
 */
export function SpinDeck() {
  const phase = useGameStore((store) => store.state.phase);
  const spinsLeft = useGameStore((store) => store.state.spinsLeft);
  const dispatch = useGameStore((store) => store.dispatch);
  const canSpin = phase === 'PREP';
  const copy = PHASE_COPY[phase] ?? { label: humanPhase(phase), hint: 'Spin unavailable' };
  const lastSpin = spinsLeft === 1 && canSpin;

  return (
    <div className="spin-deck" data-phase={phase}>
      <button
        type="button"
        className="btn btn-primary hud-spin ui9-button"
        data-testid={TEST_IDS.spinBtn}
        data-ready={canSpin}
        onClick={() => dispatch({ c: 'Spin' })}
        disabled={!canSpin}
        aria-keyshortcuts="Space"
        aria-label={canSpin ? 'Spin' : copy.label}
        title={canSpin ? 'Spin (Space)' : `Spin unavailable during ${phase}`}
      >
        <span className="hud-spin-label" aria-hidden="true">{copy.label}</span>
        <span className="hud-spin-hint" aria-hidden="true">
          {canSpin ? (lastSpin ? 'Last spin · Space' : copy.hint) : copy.hint}
        </span>
      </button>
      <ol className="spin-lamps" aria-label="Spin stage">
        {STEPS.map((step) => {
          const active = step.id.includes(phase);
          return (
            <li key={step.label} className={active ? 'on' : ''} aria-current={active ? 'step' : undefined}>
              <i aria-hidden="true" />
              {step.label}
            </li>
          );
        })}
      </ol>
      <SpeedControls />
    </div>
  );
}
