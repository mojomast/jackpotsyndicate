/** @jsxRuntime automatic */
import type { ReactNode } from 'react';

export interface MetaScreenProps {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  testId?: string;
  className?: string;
}

export function MetaScreen({
  eyebrow,
  title,
  description,
  children,
  testId,
  className,
}: MetaScreenProps) {
  return (
    <section
      className={`screen meta-screen${className ? ` ${className}` : ''}`}
      data-testid={testId}
    >
      <header className="screen-header">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="screen-title">{title}</h1>
        {description ? <p className="screen-description">{description}</p> : null}
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
