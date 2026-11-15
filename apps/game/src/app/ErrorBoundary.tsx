/** @jsxRuntime automatic */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { discardStoredSave, resumeFromSave } from '../screens/meta/persistence';
import { navigateTo, routeForPhase } from '../screens/meta/navigation';
import { recoverSaveAfterError, type SaveRecovery } from './saveSafety';

export interface AppErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
  onRecovered?: () => void;
}

interface AppErrorBoundaryState {
  error: Error | null;
  recovery: SaveRecovery | null;
  actionError: string | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    recovery: null,
    actionError: null,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const recovery = recoverSaveAfterError(useGameStore.getState().core);
    this.setState({ recovery });
    if (typeof console !== 'undefined') {
      console.error('[hardening] screen error contained; saves audited', error, info.componentStack);
    }
  }

  override componentDidUpdate(previous: AppErrorBoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.reset();
    }
  }

  private reset = (): void => {
    this.setState({ error: null, recovery: null, actionError: null });
  };

  private resume = (): void => {
    const save = this.state.recovery?.save ?? null;
    if (save === null) return;
    const result = resumeFromSave(save);
    if (!result.ok) {
      this.setState({
        actionError: 'The preserved save could not be loaded. It was left untouched on disk.',
      });
      return;
    }
    this.props.onRecovered?.();
    navigateTo(routeForPhase(useGameStore.getState().state.phase));
    this.reset();
  };

  private discard = (): void => {
    discardStoredSave();
    this.setState({
      actionError: null,
      recovery: {
        status: 'discarded',
        notice: 'Saved run discarded. A new run can start from any seed.',
        save: null,
        canResume: false,
      },
    });
    navigateTo('title');
  };

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;

    const recovery = this.state.recovery;
    const canResume = recovery?.canResume === true && recovery.save !== null;

    return (
      <section
        className="screen error-boundary panel"
        role="alert"
        aria-labelledby="error-boundary-heading"
        data-testid="error-boundary"
        data-recovery={recovery?.status ?? 'pending'}
      >
        <header className="screen-header">
          <p className="eyebrow">Recovery</p>
          <h1 className="screen-title" id="error-boundary-heading">
            Something went wrong
          </h1>
          <p className="screen-description">
            The screen stopped rendering. The run state was not changed by this
            fallback, and any resume save was validated before it was kept.
          </p>
        </header>

        <p className="notice" role="status" data-testid="error-boundary-notice">
          {recovery?.notice ?? 'Auditing the local save before offering recovery.'}
        </p>

        {this.state.actionError ? (
          <p className="notice" role="alert" data-testid="error-boundary-action-error">
            {this.state.actionError}
          </p>
        ) : null}

        <div className="screen-actions">
          <button
            type="button"
            className="btn btn-cyan"
            data-testid="error-retry"
            onClick={this.reset}
          >
            Try this screen again
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="error-resume"
            onClick={this.resume}
            disabled={!canResume}
          >
            Resume saved run
          </button>
          <button
            type="button"
            className="btn btn-danger"
            data-testid="error-discard"
            onClick={this.discard}
          >
            Discard save and go to title
          </button>
        </div>

        <p className="meta-hint">
          The resume path only accepts a validated save at a resumable phase. A
          damaged save is removed instead of being handed back to the loader.
        </p>
      </section>
    );
  }
}

export const ErrorBoundary = AppErrorBoundary;

export default AppErrorBoundary;
