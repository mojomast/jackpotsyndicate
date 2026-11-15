/** @jsxRuntime automatic */
import { useState } from 'react';

export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the DOM selection path.
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = typeof document.execCommand === 'function'
      ? document.execCommand('copy')
      : false;
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export interface CopySeedButtonProps {
  seed: string;
  testId?: string;
  label?: string;
  className?: string;
}

export function CopySeedButton({
  seed,
  testId = 'copy-seed',
  label = 'Copy seed',
  className = 'btn',
}: CopySeedButtonProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    const ok = await copyText(seed);
    setStatus(ok ? 'copied' : 'failed');
  };

  return (
    <span className="seed-copy-wrap">
      <button
        type="button"
        className={className}
        data-testid={testId}
        onClick={() => {
          void copy();
        }}
        aria-label={`${label}: ${seed}`}
      >
        {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {status === 'copied' ? `Seed ${seed} copied to clipboard` : ''}
        {status === 'failed' ? 'Clipboard unavailable' : ''}
      </span>
    </span>
  );
}
