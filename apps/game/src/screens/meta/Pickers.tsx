/** @jsxRuntime automatic */
import { useEffect, useRef } from 'react';
import type { Cell, ShopOffer } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { SpriteImage } from '../../components/Artwork';
import { dispatchMeta } from './commands';
import { findItem, humanizeId, itemName, itemSpriteKey, itemSymbol } from './metaContent';
import { MetaNotice, MetaScreen } from './MetaScreen';
import { navigateTo, routeForPhase, type MetaNavigate } from './navigation';
import { CATEGORY_LABEL, RARITY_LABEL, rarityClass } from './ui';

function latest<T extends { t: string }>(events: readonly T[], type: T['t']): T | undefined {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.t === type) return event;
  }
  return undefined;
}

export interface RelicPickerProps {
  onNavigate?: MetaNavigate;
  onPicked?: (itemId: string) => void;
}

/** D-09: choose one of three free trinkets after a boss win. */
export function RelicPicker({ onNavigate, onPicked }: RelicPickerProps) {
  const events = useGameStore((store) => store.events);
  const offeredEvent = latest(events, 'RelicsOffered') as
    | { t: 'RelicsOffered'; itemIds: string[] }
    | undefined;
  const phase = useGameStore((store) => store.state.phase);
  const pendingRelics = useGameStore((store) => store.state.pendingRelics);
  const offered = (pendingRelics && pendingRelics.length > 0
    ? { t: 'RelicsOffered' as const, itemIds: pendingRelics }
    : offeredEvent);

  const choose = (index: number) => {
    const result = dispatchMeta({ c: 'ChooseRelic', index });
    if (!result.ok) return;
    onPicked?.(offered?.itemIds[index] ?? `relic-${index}`);
    navigateTo(routeForPhase(useGameStore.getState().state.phase), onNavigate);
  };

  const choices = offered?.itemIds ?? ['relic-1', 'relic-2', 'relic-3'];

  return (
    <MetaScreen
      eyebrow="Spoils of the floor"
      title="Choose a relic"
      description="The boss is broken. Take one trinket from the vault, free. It mounts on your cabinet at once."
      testId="relic-pick"
      className="relic-screen"
    >
      {offered === undefined || offered.itemIds.length === 0 ? (
        <MetaNotice tone="info">
          Relic offers are drawn when the boss round settles. Pick a slot to let
          the run re-draw its deterministic offer.
        </MetaNotice>
      ) : null}
      <div className="relic-grid">
        {choices.map((itemId, index) => {
          const item = offered === undefined ? undefined : findItem(itemId);
          const rarity = item?.rarity ?? 'rare';
          return (
            <button
              key={`${itemId}-${index}`}
              type="button"
              className={`relic-card offer-card ${rarityClass(rarity)}`}
              data-testid={`relic-choice-${index}`}
              onClick={() => choose(index)}
              disabled={phase !== 'RELIC_PICK'}
              style={{ ['--deal-index' as string]: index }}
            >
              <span className="offer-top">
                <span className="offer-category">{item ? CATEGORY_LABEL[item.category] : 'Relic'}</span>
                <span className="offer-rarity">{RARITY_LABEL[rarity] ?? rarity}</span>
              </span>
              <span className="offer-art">
                <SpriteImage
                  spriteKey={item ? itemSpriteKey(itemId) : null}
                  className="sprite-icon offer-art-image"
                  fallback={`R${index + 1}`}
                />
              </span>
              <span className="offer-copy">
                <span className="offer-name">{item ? itemName(itemId) : `Relic ${index + 1}`}</span>
                <span className="offer-effect">{item?.desc ?? 'A sealed vault lot.'}</span>
              </span>
              <span className="offer-foot">
                <span className="offer-price">Free</span>
                <span className="offer-action">Take it</span>
              </span>
            </button>
          );
        })}
      </div>
    </MetaScreen>
  );
}

/** A tiny reel-grid diagram with the jumper path lit. */
function PathDiagram({ path, cols, rows }: { path: Cell[]; cols: number; rows: number }) {
  const lit = new Map(path.map(([col, row], order) => [`${col},${row}`, order]));
  const size = 18;
  const gap = 6;
  const width = cols * size + (cols - 1) * gap;
  const height = rows * size + (rows - 1) * gap;
  const centre = (index: number) => index * (size + gap) + size / 2;
  const points = path.map(([col, row]) => `${centre(col)},${centre(row)}`).join(' ');
  return (
    <svg className="path-diagram" viewBox={`-4 -4 ${width + 8} ${height + 8}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => (
          <rect
            key={`${col}-${row}`}
            x={col * (size + gap)}
            y={row * (size + gap)}
            width={size}
            height={size}
            rx={4}
            className={lit.has(`${col},${row}`) ? 'path-cell is-lit' : 'path-cell'}
          />
        )),
      )}
      <polyline points={points} className="path-line" />
    </svg>
  );
}

export interface JumperPickerProps {
  onNavigate?: MetaNavigate;
  onPicked?: () => void;
}

/** R-MUT-05: choose one of three offered non-standard paylines. */
export function JumperPicker({ onNavigate, onPicked }: JumperPickerProps) {
  const events = useGameStore((store) => store.events);
  const cols = useGameStore((store) => store.state.grid.cols);
  const rows = useGameStore((store) => store.state.grid.rows);
  const offeredEvent = latest(events, 'JumpersOffered') as
    | { t: 'JumpersOffered'; options: Cell[][] }
    | undefined;
  const pendingJumpers = useGameStore((store) => store.state.pendingJumpers);
  const offered = pendingJumpers && pendingJumpers.length > 0
    ? { t: 'JumpersOffered' as const, options: pendingJumpers }
    : offeredEvent;
  const phase = useGameStore((store) => store.state.phase);

  const choose = (index: number) => {
    const result = dispatchMeta({ c: 'ChooseJumper', index });
    if (!result.ok) return;
    onPicked?.();
    navigateTo(routeForPhase(useGameStore.getState().state.phase), onNavigate);
  };

  return (
    <MetaScreen
      eyebrow="Jumper wire"
      title="Wire a new payline"
      description="Solder one of these paths onto your reel grid. It pays like any other line from the next spin on."
      testId="jumper-pick"
      className="jumper-screen"
    >
      {offered === undefined || offered.options.length === 0 ? (
        <MetaNotice tone="info">
          Jumper options arrive when the jumper wire is purchased. No offer is
          loaded for this phase.
        </MetaNotice>
      ) : (
        <div className="jumper-grid">
          {offered.options.map((path, index) => (
            <button
              key={index}
              type="button"
              className="jumper-card"
              data-testid={`jumper-target-${index}`}
              onClick={() => choose(index)}
              disabled={phase !== 'JUMPER_PICK'}
              aria-label={`Path ${index + 1}: ${path.map(([col, row]) => `reel ${col + 1} row ${row + 1}`).join(', ')}`}
            >
              <span className="stat-label">Path {index + 1}</span>
              <PathDiagram path={path} cols={cols} rows={rows} />
              <span className="jumper-path">
                {path.map(([col, row]) => `${col + 1}·${row + 1}`).join(' → ')}
              </span>
            </button>
          ))}
        </div>
      )}
    </MetaScreen>
  );
}

export interface ReelTargetPickerProps {
  offer: ShopOffer;
  cols: number;
  onChoose: (reel: number) => void;
  onCancel: () => void;
  busy?: boolean;
}

/** R-SLOT-05: the player chooses which reel strip receives the glyph stop. */
export function ReelTargetPicker({
  offer,
  cols,
  onChoose,
  onCancel,
  busy = false,
}: ReelTargetPickerProps) {
  const symbol = itemSymbol(offer.itemId);
  const strips = useGameStore((store) => store.state.grid.strips);
  const firstRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="picker-backdrop">
      <div
        className="target-picker panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reel-picker-title"
        data-testid="reel-target-picker"
      >
        <div className="target-picker-head">
          <SpriteImage spriteKey={itemSpriteKey(offer.itemId)} className="sprite-icon target-picker-art" />
          <div>
            <p className="eyebrow">Glyph · {symbol === null ? humanizeId(offer.itemId) : `${humanizeId(symbol)} stop`}</p>
            <h2 id="reel-picker-title">Which reel gets the {itemName(offer.itemId)}?</h2>
          </div>
        </div>
        <p className="meta-hint">
          The stop is soldered onto that reel strip for the rest of the run.
        </p>
        <div className="target-grid" style={{ ['--reels' as string]: cols }}>
          {Array.from({ length: cols }, (_, reel) => {
            const count = symbol === null ? 0 : (strips[reel] ?? []).filter((stop) => stop === symbol).length;
            return (
              <button
                key={reel}
                type="button"
                className="reel-target"
                data-testid={`reel-target-${reel}`}
                ref={reel === 0 ? firstRef : undefined}
                onClick={() => onChoose(reel)}
                disabled={busy}
              >
                <span className="reel-target-name">Reel {reel + 1}</span>
                <span className="reel-target-count">
                  {symbol === null ? `${(strips[reel] ?? []).length} stops` : `${count} ${humanizeId(symbol)}`}
                </span>
              </button>
            );
          })}
        </div>
        <div className="screen-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export { latest as latestEvent };
