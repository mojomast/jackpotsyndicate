/** @jsxRuntime automatic */
import { useMemo, useState } from 'react';
import type { Wiring } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { uiPanelStyle } from '../../components/Artwork';

function humanize(id: string): string {
  return id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function overvoltLines(wiring: Wiring, cols: number, rows: number): { id: string; label: string }[] {
  if (wiring !== 'CLASSIC' && wiring !== 'HYPER') return [];
  const lines: { id: string; label: string }[] = [];
  for (let row = 0; row < rows; row++) {
    lines.push({ id: `row:${row}`, label: `Row ${row + 1}` });
  }
  if (cols >= 3 && rows >= 3) {
    lines.push({ id: 'diag:down', label: 'Diagonal ↘' });
    lines.push({ id: 'diag:up', label: 'Diagonal ↗' });
  }
  return lines;
}

/**
 * PREP controls. Every button dispatches a C-2 command; no control writes to
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
  const dispatch = useGameStore((store) => store.dispatch);

  const [message, setMessage] = useState('');

  const lines = useMemo(() => overvoltLines(wiring, cols, rows), [wiring, cols, rows]);
  const canPrep = phase === 'PREP';

  const loadCoin = (coinId: string): void => {
    const result = dispatch({ c: 'LoadCoin', coinId });
    setMessage(result.ok ? `Loaded ${humanize(coinId)}` : result.error.replaceAll('_', ' '));
  };

  const drink = (slot: number): void => {
    const result = dispatch({ c: 'Drink', slot });
    setMessage(result.ok ? `Drank ${humanize(drinkTray[slot] ?? 'drink')}` : result.error.replaceAll('_', ' '));
  };

  const setOvervolt = (lineId: string): void => {
    const result = dispatch({ c: 'SetOvervolt', lineId: lineId === '' ? null : lineId });
    setMessage(result.ok ? (lineId === '' ? 'Overvolt cleared' : `Overvolt → ${lineId}`) : result.error.replaceAll('_', ' '));
  };

  return (
    <section className="prep-controls panel" aria-label="Prep controls" data-testid="prep-controls" style={uiPanelStyle()}>
      <div className="panel-heading">
        <h2>Prep</h2>
        <span>{canPrep ? 'Ready to spin' : phase.replaceAll('_', ' ')}</span>
      </div>

      <div className="prep-row">
        <div className="prep-label">
          <strong>Coin</strong>
          <span>Loaded coin changes orb mass, bounce and payout.</span>
        </div>
        <div className="prep-options" role="group" aria-label="Load coin">
          {ownedCoins.map((coinId) => (
            <button
              key={coinId}
              type="button"
              className="btn"
              data-testid={`prep-coin-${coinId}`}
              aria-pressed={loadedCoin === coinId}
              disabled={!canPrep}
              onClick={() => loadCoin(coinId)}
            >
              {humanize(coinId)}
            </button>
          ))}
        </div>
      </div>

      <div className="prep-row">
        <div className="prep-label">
          <strong>Drinks</strong>
          <span>{activeDrink ? `Active: ${humanize(activeDrink)}` : 'One drink may be consumed per spin.'}</span>
        </div>
        <div className="prep-options" role="group" aria-label="Drink tray">
          {drinkTray.map((itemId, slot) => (
            <button
              key={slot}
              type="button"
              className="btn"
              data-testid={`prep-drink-${slot}`}
              aria-pressed={activeDrink === itemId && itemId !== null}
              disabled={!canPrep || itemId === null || activeDrink !== null}
              onClick={() => drink(slot)}
            >
              {itemId ? humanize(itemId) : `Slot ${slot + 1} empty`}
            </button>
          ))}
        </div>
      </div>

      <div className="prep-row">
        <div className="prep-label">
          <strong>Overvolt</strong>
          <span>{lines.length > 0 ? 'Triple one CLASSIC/HYPER line.' : `${wiring} has no selectable overvolt line.`}</span>
        </div>
        <div className="prep-options">
          <select
            className="input prep-select"
            data-testid="prep-overvolt"
            aria-label="Overvolt line"
            value={overvoltLineId ?? ''}
            disabled={!canPrep || lines.length === 0}
            onChange={(event) => setOvervolt(event.target.value)}
          >
            <option value="">No overvolt</option>
            {lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {message ? (
        <p className="prep-feedback" role="status" data-testid="prep-feedback">
          {message}
        </p>
      ) : null}
    </section>
  );
}
