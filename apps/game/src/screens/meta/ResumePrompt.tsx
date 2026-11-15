/** @jsxRuntime automatic */
import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { CopySeedButton } from './copy';
import { floorName, formatCash } from './metaContent';
import { MetaNotice, MetaScreen } from './MetaScreen';
import {
  discardStoredSave,
  readStoredSave,
  resumeFromSave,
  summariseSave,
  type StoredSaveResult,
} from './persistence';
import { navigateTo, routeForPhase, type MetaNavigate } from './navigation';

export interface ResumePromptProps {
  onNavigate?: MetaNavigate;
  onResumed?: (hash: string) => void;
}

export function ResumePrompt({ onNavigate, onResumed }: ResumePromptProps) {
  const [candidate, setCandidate] = useState<StoredSaveResult>(() => readStoredSave());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(candidate.notice);

  const save = candidate.save;
  const summary = save === null ? null : summariseSave(save);

  const resume = () => {
    if (save === null) return;
    setError(null);
    const result = resumeFromSave(save);
    if (!result.ok) {
      setError('The saved run could not be restored. It has been discarded.');
      discardStoredSave();
      setCandidate({ save: null, notice: null });
      return;
    }
    const core = useGameStore.getState().core;
    onResumed?.(core.stateHash());
    navigateTo(routeForPhase(useGameStore.getState().state.phase), onNavigate);
  };

  const discard = () => {
    discardStoredSave();
    setCandidate({ save: null, notice: null });
    setError(null);
    setNotice('Saved run discarded. A new run can start from any seed.');
  };

  return (
    <MetaScreen
      eyebrow="Saved run"
      title="Pick up where you left off"
      description="Runs autosave at every phase boundary, shelf and all. Resuming restores the exact table you left."
      testId="resume-prompt"
      className="resume-screen"
    >
      {notice ? <MetaNotice tone="info" testId="resume-notice">{notice}</MetaNotice> : null}
      {error ? <MetaNotice tone="error" testId="resume-error">{error}</MetaNotice> : null}

      {summary === null ? (
        <MetaNotice tone="info" testId="resume-empty">
          No resumable run is stored on this device.
        </MetaNotice>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-tile tone-gold">
              <span className="stat-label">Seed</span>
              <strong className="stat-value seed-value" data-testid="resume-seed">{summary.seed}</strong>
              <CopySeedButton seed={summary.seed} testId="copy-seed" className="btn btn-ghost btn-sm" />
            </div>
            <div className="stat-tile">
              <span className="stat-label">Saved at</span>
              <strong className="stat-value" data-testid="resume-phase">{summary.phaseLabel}</strong>
              <span className="stat-hint">Tick {summary.tick}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Progress</span>
              <strong className="stat-value">{floorName(summary.floorId)}</strong>
              <span className="stat-hint">Round {summary.round}</span>
            </div>
            <div className="stat-tile tone-emerald">
              <span className="stat-label">Bankroll</span>
              <strong className="stat-value">{formatCash(summary.bankroll)}</strong>
              <span className="stat-hint">
                {summary.resumable ? 'Ready to continue' : 'Run already ended'}
              </span>
            </div>
          </div>

          <div className="screen-actions">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              data-testid="resume-continue"
              onClick={resume}
              disabled={!summary.resumable}
            >
              Resume run
            </button>
            <button
              type="button"
              className="btn btn-danger"
              data-testid="resume-discard"
              onClick={discard}
            >
              Discard save
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => navigateTo('title', onNavigate)}>
              Back to title
            </button>
          </div>
        </>
      )}
    </MetaScreen>
  );
}

export const ResumeScreen = ResumePrompt;

export default ResumePrompt;
