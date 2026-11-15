/** @jsxRuntime automatic */
import { useMemo, useState } from 'react';
import type { Wiring } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { findItem, itemDescription, itemName } from '../meta/metaContent';
import { SpriteImage } from '../../components/Artwork';

function humanize(id: string): string {
  return id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function coinItem(coinId: string) {
  return findItem(coinId) ?? findItem(`${coinId}Token`) ?? null;
}

export function coinSpriteKey(coinId: string): string {
  return coinItem(coinId)?.spriteKey ?? `coin.${coinId}-token`;
}

function coinLabel(coinId: string): string {
  const item = coinItem(coinId);
  return item ? item.name : humanize(coinId);
}

export function drinkSpriteKey(itemId: string): string | null {
  return findItem(itemId)?.spriteKey ?? null;
}

/** Payline ids match the engine: row:N, diag:down/up, hyper:v/inverted-v, jumper:N. */
function overvoltLines(
  wiring: Wiring,
  cols: number,
  rows: number,
  jumpers: number,
): { id: string; label: string }[] {
  if (wiring !== 'CLASSIC' && wiring !== 'HYPER') return [];
  const lines: { id: string; label: string }[] = [];
  for (let row = 0; row < rows; row++) {
    lines.push({ id: `row:${row}`, label: `Row ${row + 1}` });
  }
  if (cols >= 3 && rows >= 3) {
    lines.push({ id: 'diag:down', label: 'Diagonal ↘' });
    lines.push({ id: 'diag:up', label: 'Diagonal ↗' });
  }
  if (wiring === 'HYPER') {
    lines.push({ id: 'hyper:v', label: 'Hyper V' });
    lines.push({ id: 'hyper:inverted-v', label: 'Hyper Λ' });
  }
  for (let index = 0; index < jumpers; index++) {
    lines.push({ id: `jumper:${index}`, label: `Jumper ${index + 1}` });
  }
  return lines;
}

function isInstantDrink(itemId: string | null): boolean {
  if (!itemId) return false;
  const item = findItem(itemId) as { instant?: boolean } | undefined;
  return item?.instant === true || itemId === 'lubricantOilShot';
}

/**
 * PREP tray. Every button dispatches a C-2 command; no control writes to
 * `RunState` or the store directly. The store remains a read-only mirror.
 */
export function PrepControls() {
  const phase = useGameStore((store) => store.state.phase);
  const ownedCoins = useGameStore((store) => store.state.ownedCoins);
  const loadedCoin = useGameStore((store) => store.state.loadedCoin);
  const drinkTray = useGameStore((store) => store.state.drinkTray);
  const activeDrink = useGameStore((store) => store.state.activeDrink);
  const overvoltLineId = useGameStore((store) => store.state.overvoltLineId);
  const wiring = useGameStore((store) => store.state.grid.wiring);
  const cols = useGameStore((store) => store.state.grid.cols);
  const rows = useGameStore((store) => store.state.grid.rows);
  const jumperCount = useGameStore((store) => store.state.jumpers?.length ?? 0);
  const overvoltOwned = useGameStore((store) => store.state.overvoltOwned === true);
  const dispatch = useGameStore((store) => store.dispatch);

  const [message, setMessage] = useState('');

  const lines = useMemo(() => overvoltLines(wiring, cols, rows, jumperCount), [wiring, cols, rows, jumperCount]);
  const canPrep = phase === 'PREP';

  const loadCoin = (coinId: string): void => {
    const result = dispatch({ c: 'LoadCoin', coinId });
    setMessage(result.ok ? `Loaded ${coinLabel(coinId)}` : result.error.replaceAll('_', ' '));
  };

  const drink = (slot: number): void => {
    const result = dispatch({ c: 'Drink', slot });
    const id = drinkTray[slot];
    setMessage(result.ok ? `Drank ${id ? itemName(id) : 'drink'}` : result.error.replaceAll('_', ' '));
  };

  const setOvervolt = (lineId: string): void => {
    const result = dispatch({ c: 'SetOvervolt', lineId: lineId === '' ? null : lineId });
    setMessage(result.ok ? (lineId === '' ? 'Overvolt cleared' : `Overvolt → ${lineId}`) : result.error.replaceAll('_', ' '));
  };

  return (
    <section
      className="prep-controls prep-tray"
      aria-label="Prep controls"
      data-testid="prep-controls"
      data-locked={!canPrep}
    >
      <div className="prep-group" role="group" aria-label="Load coin">
        <span className="prep-group-label" aria-hidden="true">Coin</span>
        <div className="prep-options">
          {ownedCoins.map((coinId) => (
            <button
              key={coinId}
              type="button"
              className="prep-chip"
              data-testid={`prep-coin-${coinId}`}
              aria-pressed={loadedCoin === coinId}
              disabled={!canPrep}
              title={coinItem(coinId)?.desc ?? 'Loaded coin changes orb mass, bounce and payout.'}
              onClick={() => loadCoin(coinId)}
            >
              <SpriteImage spriteKey={coinSpriteKey(coinId)} className="prep-chip-art" />
              <span>{coinLabel(coinId)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="prep-group" role="group" aria-label="Drink tray">
        <span className="prep-group-label" aria-hidden="true">Drinks</span>
        <div className="prep-options">
          {drinkTray.map((itemId, slot) => (
            <button
              key={slot}
              type="button"
              className={`prep-chip prep-drink ${itemId ? '' : 'is-empty'}`}
              data-testid={`prep-drink-${slot}`}
              aria-pressed={activeDrink === itemId && itemId !== null}
              disabled={!canPrep || itemId === null || (activeDrink !== null && !isInstantDrink(itemId))}
              aria-label={itemId ? `Drink ${itemName(itemId)}` : `Slot ${slot + 1} empty`}
              title={itemId ? `${itemName(itemId)}: ${itemDescription(itemId)}` : 'Empty drink slot'}
              onClick={() => drink(slot)}
            >
              {itemId ? (
                <SpriteImage
                  spriteKey={drinkSpriteKey(itemId)}
                  className="prep-chip-art"
                  fallback={itemName(itemId).charAt(0)}
                />
              ) : (
                <span className="prep-slot-dot" aria-hidden="true" />
              )}
              <span className="prep-chip-text">{itemId ? itemName(itemId) : `Slot ${slot + 1}`}</span>
            </button>
          ))}
        </div>
        {activeDrink ? (
          <span className="prep-active" title={itemDescription(activeDrink)}>
            Active: {itemName(activeDrink)}
          </span>
        ) : null}
      </div>

      <div className="prep-group" role="group" aria-label="Overvolt">
        <label className="prep-group-label" htmlFor="prep-overvolt-select">Overvolt</label>
        <select
          id="prep-overvolt-select"
          className="prep-select"
          data-testid="prep-overvolt"
          aria-label="Overvolt line"
          value={overvoltLineId ?? ''}
          disabled={!canPrep || !overvoltOwned || lines.length === 0}
          title={!overvoltOwned ? 'Buy the Overvolt chassis in the shop to triple one line.' : lines.length > 0 ? 'Triple one CLASSIC/HYPER line.' : `${wiring} has no selectable overvolt line.`}
          onChange={(event) => setOvervolt(event.target.value)}
        >
          <option value="">{!overvoltOwned ? 'Locked' : lines.length > 0 ? 'Off' : 'n/a'}</option>
          {lines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.label}
            </option>
          ))}
        </select>
      </div>

      {message ? (
        <p className="prep-feedback" role="status" data-testid="prep-feedback">
          {message}
        </p>
      ) : null}
    </section>
  );
}
