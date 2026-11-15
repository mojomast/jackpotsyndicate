/** @jsxRuntime automatic */
import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { CopySeedButton } from './copy';
import { MetaNotice, MetaScreen } from './MetaScreen';
import { navigateTo, type MetaNavigate } from './navigation';
import { saveCore } from './persistence';
import { startRun } from './commands';
import { randomSeed } from './seed';

export interface SeedEntryProps {
  onNavigate?: MetaNavigate;
  initialSeed?: string;
  compact?: boolean;
}

/** R-RUN-06: typed or random seed entry, with a copyable seed. */
export function SeedEntry({ onNavigate, initialSeed, compact = false }: SeedEntryProps) {
  const stateSeed = useGameStore((store) => store.state.seed);
  const [seed, setSeed] = useState(initialSeed ?? stateSeed ?? '');
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    const trimmed = seed.trim();
    if (trimmed.length === 0) {
      setError('Enter a seed or roll a random one.');
      return;
    }
    setError(null);
    const result = startRun(trimmed);
    if (!result.ok) {
      setError('The run could not start. Check the seed and try again.');
      return;
    }
    saveCore();
    navigateTo('table', onNavigate);
  };

  return (
    <MetaScreen
      eyebrow="Seeded run"
      title={compact ? 'Seed' : 'Start a run'}
      description="The seed fixes every reel stop, boss score and shop roll. Type one or roll a random seed, then copy it for a retry."
      testId="seed-entry"
      className="seed-entry-screen"
    >
      {error ? <MetaNotice tone="error" testId="seed-entry-error">{error}</MetaNotice> : null}
      <form
        className="seed-form seed-entry-form"
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <label className="field seed-field">
          <span>Run seed</span>
          <input
            className="input input-mono"
            type="text"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            data-testid="seed-input"
            placeholder="JS-NEON"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" className="btn btn-primary" data-testid="start-run">
          Start run
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="randomize-seed"
          onClick={() => setSeed(randomSeed())}
        >
          Random seed
        </button>
        <CopySeedButton seed={seed.trim().length > 0 ? seed.trim() : stateSeed} testId="copy-seed" className="btn btn-ghost" />
      </form>
      <p className="meta-hint">
        Current run seed: <strong>{stateSeed}</strong>. Seeds are shareable and
        never leave this device.
      </p>
    </MetaScreen>
  );
}

export const SeedEntryScreen = SeedEntry;

export default SeedEntryScreen;
