/** @jsxRuntime automatic */
import { useId, useState, type ReactNode } from 'react';
import { TEST_IDS } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { floorName, formatCash } from '../../screens/meta/metaContent';
import { discardStoredSave, readStoredSave, summariseSave } from '../../screens/meta/persistence';
import type { Route } from '../routes';
import { BackButton } from './BackButton';

interface SettingRowProps {
  title: string;
  description: ReactNode;
  children: ReactNode;
  labelFor?: string;
}

function SettingRow({ title, description, children, labelFor }: SettingRowProps) {
  return (
    <div className="settings-row">
      <div className="settings-copy">
        {labelFor ? <label htmlFor={labelFor}><strong>{title}</strong></label> : <strong>{title}</strong>}
        <span>{description}</span>
      </div>
      <div className="settings-control">{children}</div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  testId: string;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        role="switch"
        data-testid={testId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}

export interface SettingsScreenProps {
  onNavigate: (route: Route) => void;
  onBack?: () => void;
}

export function SettingsScreen({ onNavigate, onBack }: SettingsScreenProps) {
  const settings = useGameStore((store) => store.settings);
  const setSettings = useGameStore((store) => store.setSettings);
  const setSpeed = useGameStore((store) => store.setSpeed);
  const volumeId = useId();
  const [stored, setStored] = useState(() => readStoredSave());
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  const summary = stored.save === null ? null : summariseSave(stored.save);
  const volumePercent = Math.round(settings.volume * 100);

  const clearSave = () => {
    discardStoredSave();
    setStored({ save: null, notice: null });
    setConfirming(false);
    setCleared(true);
  };

  return (
    <section className="screen menu-screen settings-screen" aria-labelledby="settings-heading">
      <header className="screen-header menu-header">
        <BackButton onBack={onBack ?? (() => onNavigate('title'))} />
        <p className="eyebrow">Comfort &amp; data</p>
        <h1 className="screen-title" id="settings-heading">Settings</h1>
        <p className="screen-description">
          Preferences apply instantly and are stored on this device only.
        </p>
      </header>

      <div className="settings-groups">
        <section className="settings-group panel" aria-labelledby="settings-audio">
          <h2 className="settings-group-title" id="settings-audio">Audio</h2>
          <SettingRow title="Mute" description="Silence every synthesized voice. The game stays fully playable.">
            <Switch
              checked={settings.mute}
              onChange={(mute) => setSettings({ mute })}
              label="Mute audio"
              testId={TEST_IDS.settingsMute}
            />
          </SettingRow>
          <SettingRow
            title="Volume"
            labelFor={volumeId}
            description={<span className="settings-value">{settings.mute ? `Muted (${volumePercent}%)` : `${volumePercent}%`}</span>}
          >
            <input
              id={volumeId}
              className="range"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              data-testid="settings-volume"
              aria-label="Volume"
              aria-valuetext={`${volumePercent}%`}
              style={{ ['--range-fill' as string]: `${volumePercent}%` }}
              onChange={(event) => setSettings({ volume: Number(event.target.value) })}
            />
          </SettingRow>
        </section>

        <section className="settings-group panel" aria-labelledby="settings-motion-heading">
          <h2 className="settings-group-title" id="settings-motion-heading">Motion &amp; pace</h2>
          <SettingRow
            title="Reduced motion"
            description="Swap reel spins, screen transitions and celebrations for short, still versions."
          >
            <Switch
              checked={settings.reducedMotion}
              onChange={(reducedMotion) => setSettings({ reducedMotion })}
              label="Reduced motion"
              testId={TEST_IDS.settingsMotion}
            />
          </SettingRow>
          <SettingRow
            title="Simulation speed"
            description="Fixed-step physics stays deterministic at every speed."
          >
            <div className="segmented" role="group" aria-label="Simulation speed">
              {[1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className="segmented-option"
                  data-testid={`settings-speed-${speed}`}
                  aria-pressed={settings.speed === speed}
                  onClick={() => setSpeed(speed)}
                >
                  {speed}×
                </button>
              ))}
            </div>
          </SettingRow>
        </section>

        <section className="settings-group panel" aria-labelledby="settings-data">
          <h2 className="settings-group-title" id="settings-data">Saved run</h2>
          <SettingRow
            title={summary ? summary.seed : 'No saved run'}
            description={
              summary
                ? `${floorName(summary.floorId)} · Round ${summary.round} · ${formatCash(summary.bankroll)} · ${summary.phaseLabel}`
                : cleared
                  ? 'Save cleared. Your next run starts fresh.'
                  : 'Runs autosave at every phase boundary.'
            }
          >
            {summary && !confirming ? (
              <button
                type="button"
                className="btn btn-danger"
                data-testid="settings-clear-save"
                onClick={() => setConfirming(true)}
              >
                Clear save
              </button>
            ) : null}
          </SettingRow>
          {summary && confirming ? (
            <div className="confirm-strip" role="alertdialog" aria-labelledby="settings-confirm-copy">
              <p id="settings-confirm-copy">
                Delete the saved run on <strong>{summary.seed}</strong>? This cannot be undone.
              </p>
              <div className="confirm-actions">
                <button type="button" className="btn" onClick={() => setConfirming(false)} autoFocus>
                  Keep it
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  data-testid="settings-clear-confirm"
                  onClick={clearSave}
                >
                  Delete save
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <p className="notice">
        <strong>Play money only.</strong> No purchases, ads, accounts or network calls.
        Settings live under <code>js.settings.v1</code>; saves under <code>js.save.v1</code>.
      </p>
    </section>
  );
}

export default SettingsScreen;
