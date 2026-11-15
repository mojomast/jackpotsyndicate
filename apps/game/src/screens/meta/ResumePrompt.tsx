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
      eyebrow="Continue · R-RUN-07"
      title="Resume run"
      description="Autosaves are written at phase boundaries, including the full shelf state. Resume restores the exact state hash."
      testId="resume-prompt"
    >
      {notice ? <MetaNotice tone="info" testId="resume-notice">{notice}</MetaNotice> : null}
      {error ? <MetaNotice tone="error" testId="resume-error">{error}</MetaNotice> : null}

      {summary === null ? (
        <MetaNotice tone="info" testId="resume-empty">
          No resumable run is stored on this device.
        </MetaNotice>
      ) : (
        <>
          <div className="summary-grid">
            <div className="summary-card panel">
              <span className="eyebrow">Seed</span>
              <p className="seed-value" data-testid="resume-seed">{summary.seed}</p>
              <CopySeedButton seed={summary.seed} testId="copy-seed" />
            </div>
            <div className="summary-card panel">
              <span className="eyebrow">Phase boundary</span>
              <strong data-testid="resume-phase">{summary.phaseLabel}</strong>
              <span className="meta-hint">{summary.phase.replaceAll('_', ' ')} · tick {summary.tick}</span>
            </div>
            <div className="summary-card panel">
              <span className="eyebrow">Progress</span>
              <strong>{floorName(summary.floorId)}</strong>
              <span className="meta-hint">Round {summary.round}</span>
            </div>
            <div className="summary-card panel">
              <span className="eyebrow">Bankroll</span>
              <strong>{formatCash(summary.bankroll)}</strong>
              <span className="meta-hint">
                {summary.resumable ? 'Ready to continue' : 'Run already ended'}
              </span>
            </div>
          </div>

          <div className="stub-actions">
            <button
              type="button"
              className="btn btn-primary"
              data-testid="resume-continue"
              onClick={resume}
              disabled={!summary.resumable}
            >
              Resume run
            </button>
            <button
              type="button"
              className="btn"
              data-testid="resume-discard"
              onClick={discard}
            >
              Discard save
            </button>
            <button type="button" className="btn" onClick={() => navigateTo('title', onNavigate)}>
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
