/** @jsxRuntime automatic */
import { useMemo, useState } from 'react';
import type { Phase } from '@jackpotsyndicate/contracts';
import { UI9_ASSETS, spriteAsset } from '../../components/Artwork';
import { useGameStore } from '../../store/gameStore';
import { startRun } from '../../screens/meta/commands';
import { floorName, formatCash } from '../../screens/meta/metaContent';
import { phaseLabel, routeForPhase } from '../../screens/meta/navigation';
import {
  readStoredSave,
  resumeFromSave,
  saveCore,
  summariseSave,
  type StoredSaveResult,
} from '../../screens/meta/persistence';
import { cleanSeed, randomSeed } from '../../screens/meta/seed';
import { testQuery } from '../env';
import type { Route } from '../routes';

const ENDED: ReadonlySet<Phase> = new Set<Phase>(['TITLE', 'GAME_OVER', 'VICTORY']);

interface ContinueTarget {
  kind: 'live' | 'saved';
  detail: string;
}

function seedFromQuery(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('seed');
  return value === null ? null : cleanSeed(value) || null;
}

/** The hero reel window: three sevens on the payline, the house's worst nightmare. */
function TitleCabinet() {
  const reels: [string, string, string][] = [
    ['symbol.cherry', 'symbol.seven', 'symbol.diamond'],
    ['symbol.diamond', 'symbol.seven', 'symbol.uranium'],
    ['symbol.skull', 'symbol.seven', 'symbol.cherry'],
  ];
  return (
    <div className="title-cabinet" aria-hidden="true">
      <div className="title-cabinet-rays" />
      <div className="title-cabinet-glow" />
      <div className="title-cabinet-frame">
        <div className="title-cabinet-window">
          {reels.map((reel, col) => (
            <div className="title-reel" key={col} style={{ animationDelay: `${col * 140}ms` }}>
              {reel.map((key, row) => {
                const asset = spriteAsset(key);
                return (
                  <span className={`title-reel-cell${row === 1 ? ' is-payline' : ''}`} key={row}>
                    {asset ? <img src={asset.url} alt="" draggable={false} decoding="async" /> : null}
                  </span>
                );
              })}
            </div>
          ))}
          <span className="title-payline" />
        </div>
        <img className="title-cabinet-art" src={UI9_ASSETS.cabinet} alt="" draggable={false} />
      </div>
      <div className="title-marquee-lights" />
    </div>
  );
}

export interface TitleScreenProps {
  onNavigate: (route: Route) => void;
}

export function TitleScreen({ onNavigate }: TitleScreenProps) {
  const state = useGameStore((store) => store.state);
  const [stored, setStored] = useState<StoredSaveResult>(() => readStoredSave());
  const presetSeed = useMemo(seedFromQuery, []);
  const [seedOpen, setSeedOpen] = useState(() => presetSeed !== null || testQuery());
  const [seed, setSeed] = useState(() => presetSeed ?? '');
  const [error, setError] = useState<string | null>(null);

  const liveRun = !ENDED.has(state.phase);
  const savedSummary = stored.save === null ? null : summariseSave(stored.save);
  const continueTarget: ContinueTarget | null = liveRun
    ? {
        kind: 'live',
        detail: `${floorName(state.floorId)} · Round ${state.round} · ${formatCash(state.bankroll)} · ${phaseLabel(state.phase)}`,
      }
    : savedSummary?.resumable
      ? {
          kind: 'saved',
          detail: `${floorName(savedSummary.floorId)} · Round ${savedSummary.round} · ${formatCash(savedSummary.bankroll)} · ${savedSummary.phaseLabel}`,
        }
      : null;

  const begin = (runSeed: string) => {
    setError(null);
    const result = startRun(runSeed);
    if (!result.ok) {
      setError('That run could not start. Try another seed.');
      return;
    }
    saveCore();
    onNavigate('table');
  };

  const continueRun = () => {
    setError(null);
    if (continueTarget?.kind === 'live') {
      onNavigate(routeForPhase(state.phase));
      return;
    }
    if (stored.save === null) return;
    const result = resumeFromSave(stored.save);
    if (!result.ok) {
      setStored({ save: null, notice: 'The saved run could not be restored and was set aside.' });
      return;
    }
    onNavigate(routeForPhase(useGameStore.getState().state.phase));
  };

  const submitSeed = () => {
    const typed = cleanSeed(seed);
    if (typed.length === 0) {
      setError('Type a seed, or roll a random one.');
      return;
    }
    begin(typed);
  };

  return (
    <section className="screen title-screen" aria-labelledby="title-heading">
      <div className="title-backdrop" aria-hidden="true">
        {spriteAsset('floor.FLOOR_PENTHOUSE.bg') ? (
          <img
            className="title-backdrop-art"
            src={spriteAsset('floor.FLOOR_PENTHOUSE.bg')!.url}
            alt=""
            draggable={false}
            decoding="async"
          />
        ) : null}
      </div>

      <div className="title-layout">
        <div className="title-copy">
          <p className="eyebrow title-eyebrow">A play-money casino roguelike</p>
          <h1 className="title-wordmark" id="title-heading">
            <span className="title-word title-word-top">Jackpot</span>
            <span className="title-word title-word-bottom">Syndicate</span>
          </h1>
          <p className="title-lead">
            Spin the reels. Drop orbs through the pins. Push the coins over the lip.
            Climb three floors of the Syndicate&rsquo;s casino and break the house.
          </p>

          <div className="title-actions">
            {continueTarget ? (
              <button
                type="button"
                className="btn btn-primary btn-hero"
                data-testid="title-continue"
                onClick={continueRun}
              >
                <span className="btn-hero-label">Continue run</span>
                <span className="btn-hero-detail">{continueTarget.detail}</span>
              </button>
            ) : null}
            <button
              type="button"
              className={`btn btn-hero ${continueTarget ? 'btn-secondary' : 'btn-primary'}`}
              data-testid="title-new-run"
              onClick={() => begin(randomSeed())}
            >
              <span className="btn-hero-label">New run</span>
              <span className="btn-hero-detail">
                {continueTarget ? 'Replaces the run in progress' : 'Random seed · Floor 1, the Neon Vault'}
              </span>
            </button>
          </div>

          <div className="title-links">
            <button
              type="button"
              className="btn btn-ghost"
              aria-expanded={seedOpen}
              aria-controls="title-seeded-run"
              onClick={() => setSeedOpen((open) => !open)}
            >
              <span className="disclosure-caret" aria-hidden="true" />
              Seeded run
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onNavigate('compendium')}>
              Compendium
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onNavigate('settings')}>
              Settings
            </button>
          </div>

          <form
            id="title-seeded-run"
            className="seed-form"
            hidden={!seedOpen}
            onSubmit={(event) => {
              event.preventDefault();
              submitSeed();
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
                placeholder="e.g. JS-NEON77"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={40}
              />
            </label>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Roll a random seed"
              title="Roll a random seed"
              onClick={() => setSeed(randomSeed())}
            >
              <span className="dice-glyph" aria-hidden="true" />
            </button>
            <button type="submit" className="btn btn-primary">
              Start run
            </button>
            <p className="seed-form-hint">
              The same seed always deals the same reels, shelves and boss scores.
            </p>
          </form>

          {error ? (
            <p className="meta-notice meta-notice-error" role="alert">{error}</p>
          ) : null}
          {stored.notice ? (
            <p className="meta-notice meta-notice-info" role="status" data-testid="title-save-notice">
              {stored.notice}
            </p>
          ) : null}

          <p className="notice title-notice">
            <strong>Play money only.</strong> No purchases, ads, accounts or network calls.
          </p>
        </div>

        <TitleCabinet />
      </div>
    </section>
  );
}

export default TitleScreen;
