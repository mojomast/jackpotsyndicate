/** @jsxRuntime automatic */
import type { ReactNode } from 'react';

export interface MetaScreenProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  testId?: string;
  className?: string;
  /** Visual treatment: `stage` screens are full-bleed set pieces (boss, victory, game over). */
  variant?: 'default' | 'stage';
  /** Rendered before the eyebrow (e.g. a Back button on menu screens). */
  lead?: ReactNode;
  /** Rendered at the end of the header row (e.g. bankroll, primary action). */
  aside?: ReactNode;
}

export function MetaScreen({
  eyebrow,
  title,
  description,
  children,
  testId,
  className,
  variant = 'default',
  lead,
  aside,
}: MetaScreenProps) {
  return (
    <section
      className={`screen meta-screen meta-${variant}${className ? ` ${className}` : ''}`}
      data-testid={testId}
    >
      <header className={`screen-header${aside ? ' has-aside' : ''}`}>
        <div className="screen-header-copy">
          {lead}
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="screen-title">{title}</h1>
          {description ? <p className="screen-description">{description}</p> : null}
        </div>
        {aside ? <div className="screen-header-aside">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function MetaNotice({
  tone = 'info',
  children,
  testId,
}: {
  tone?: 'info' | 'error' | 'success';
  children: ReactNode;
  testId?: string;
}) {
  return (
    <p className={`meta-notice meta-notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'} data-testid={testId}>
      {children}
    </p>
  );
}
