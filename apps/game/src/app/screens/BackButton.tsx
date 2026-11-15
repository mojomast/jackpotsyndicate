/** @jsxRuntime automatic */
import { useEffect } from 'react';

export interface BackButtonProps {
  onBack: () => void;
  label?: string;
  /** Escape triggers Back while this button is mounted (menus only). */
  escape?: boolean;
}

/** The single way out of a menu screen; Escape does the same. */
export function BackButton({ onBack, label = 'Back', escape = true }: BackButtonProps) {
  useEffect(() => {
    if (!escape || typeof window === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [escape, onBack]);

  return (
    <button type="button" className="btn btn-ghost btn-back" onClick={onBack} aria-keyshortcuts="Escape">
      <span className="btn-back-arrow" aria-hidden="true" />
      {label}
    </button>
  );
}

export default BackButton;
