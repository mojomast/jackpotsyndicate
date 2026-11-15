/** @jsxRuntime automatic */
import type { Cell, ShopOffer } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { dispatchMeta } from './commands';
import { itemName, itemSymbol, humanizeId } from './metaContent';
import { MetaNotice, MetaScreen } from './MetaScreen';
import { navigateTo, routeForPhase, type MetaNavigate } from './navigation';

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
  const offered = latest(events, 'RelicsOffered') as
    | { t: 'RelicsOffered'; itemIds: string[] }
    | undefined;
  const phase = useGameStore((store) => store.state.phase);

  const choose = (index: number) => {
    const result = dispatchMeta({ c: 'ChooseRelic', index });
    if (!result.ok) return;
    onPicked?.(offered?.itemIds[index] ?? `relic-${index}`);
    navigateTo(routeForPhase(useGameStore.getState().state.phase), onNavigate);
  };

  return (
    <MetaScreen
      eyebrow="Boss reward · D-09"
      title="Choose a relic"
      description="Take one trinket for free. It mounts on the cabinet bezel immediately."
      testId="relic-pick"
    >
      {offered === undefined || offered.itemIds.length === 0 ? (
        <MetaNotice tone="info">
          Relic offers are drawn when the boss round settles. Pick a slot to let
          the run re-draw its deterministic offer.
        </MetaNotice>
      ) : null}
      <div className="relic-grid">
        {(offered?.itemIds ?? ['relic-1', 'relic-2', 'relic-3']).map((itemId, index) => (
          <button
            key={`${itemId}-${index}`}
            type="button"
            className="relic-card"
            data-testid={`relic-choice-${index}`}
            onClick={() => choose(index)}
            disabled={phase !== 'RELIC_PICK'}
          >
            <span className="eyebrow">Relic {index + 1}</span>
            <strong>{offered === undefined ? `Relic ${index + 1}` : itemName(itemId)}</strong>
            <span className="offer-meta">Free</span>
          </button>
        ))}
      </div>
    </MetaScreen>
  );
}

export interface JumperPickerProps {
  onNavigate?: MetaNavigate;
  onPicked?: () => void;
}

/** R-MUT-05: choose one of three offered non-standard paylines. */
export function JumperPicker({ onNavigate, onPicked }: JumperPickerProps) {
  const events = useGameStore((store) => store.events);
  const offered = latest(events, 'JumpersOffered') as
    | { t: 'JumpersOffered'; options: Cell[][] }
    | undefined;
  const phase = useGameStore((store) => store.state.phase);

  const choose = (index: number) => {
    const result = dispatchMeta({ c: 'ChooseJumper', index });
    if (!result.ok) return;
    onPicked?.();
    navigateTo(routeForPhase(useGameStore.getState().state.phase), onNavigate);
  };

  return (
    <MetaScreen
      eyebrow="Jumper wire · R-MUT-05"
      title="Choose a jumper path"
      description="A jumper adds one extra payline. Three deterministic paths were offered."
      testId="jumper-pick"
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
            >
              <span className="eyebrow">Path {index + 1}</span>
              <span className="jumper-path">
                {path.map(([col, row]) => `${col + 1},${row + 1}`).join(' → ')}
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
  return (
    <div
      className="target-picker panel"
      role="dialog"
      aria-modal="false"
      aria-label="Choose a reel for the glyph"
      data-testid="reel-target-picker"
    >
      <div className="panel-heading">
        <h2>Add {itemName(offer.itemId)}</h2>
        <span>{symbol === null ? humanizeId(offer.itemId) : `${humanizeId(symbol)} stop`}</span>
      </div>
      <p className="meta-hint">
        Pick the reel strip that receives this glyph for the rest of the run.
      </p>
      <div className="target-grid">
        {Array.from({ length: cols }, (_, reel) => (
          <button
            key={reel}
            type="button"
            className="btn"
            data-testid={`reel-target-${reel}`}
            onClick={() => onChoose(reel)}
            disabled={busy}
          >
            Reel {reel + 1}
          </button>
        ))}
      </div>
      <div className="stub-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export { latest as latestEvent };
