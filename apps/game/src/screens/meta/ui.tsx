/** @jsxRuntime automatic */
import type { ReactNode } from 'react';
import { TEST_IDS, type ItemCategory } from '@jackpotsyndicate/contracts';
import { CopySeedButton } from './copy';

export type Tone = 'gold' | 'cyan' | 'crimson' | 'emerald' | 'ivory' | 'muted';

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  TRINKET: 'Trinket',
  DRINK: 'Drink',
  REEL: 'Glyph',
  COIN: 'Coin',
  CHASSIS: 'Chassis',
};

export const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  cursed: 'Cursed',
};

export function rarityClass(rarity: string): string {
  return `rarity-${RARITY_LABEL[rarity] ? rarity : 'common'}`;
}

export interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  testId?: string;
  size?: 'md' | 'lg';
}

/** A labelled number. Values use tabular mono digits so they never jitter. */
export function StatTile({ label, value, hint, tone = 'ivory', testId, size = 'md' }: StatTileProps) {
  return (
    <div className={`stat-tile stat-${size} tone-${tone}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value" data-testid={testId}>{value}</strong>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

/** Five-pip meter for qualitative comparisons (risk, reward, payout). */
export function PipMeter({
  label,
  value,
  tone = 'gold',
  caption,
}: {
  label: string;
  /** 0..5, fractional values round to the nearest pip. */
  value: number;
  tone?: Tone;
  caption?: string;
}) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div className={`pip-meter tone-${tone}`}>
      <span className="pip-label">{label}</span>
      <span className="pips" role="img" aria-label={`${label}: ${filled} of 5${caption ? `, ${caption}` : ''}`}>
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={`pip${index < filled ? ' is-on' : ''}`} />
        ))}
      </span>
      {caption ? <span className="pip-caption">{caption}</span> : null}
    </div>
  );
}

/** The run seed, big and copyable (R-RUN-06). Carries the C-8 seed-display id. */
export function SeedCard({ seed, caption }: { seed: string; caption?: string }) {
  return (
    <div className="seed-card">
      <span className="stat-label">Run seed</span>
      <p className="seed-value" data-testid={TEST_IDS.seedDisplay}>{seed}</p>
      <CopySeedButton seed={seed} testId="copy-seed" className="btn btn-ghost btn-sm" />
      {caption ? <span className="stat-hint">{caption}</span> : null}
    </div>
  );
}

/** Decorative art-deco divider (fan + rules). */
export function DecoRule({ className }: { className?: string }) {
  return <span className={`deco-rule${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}
