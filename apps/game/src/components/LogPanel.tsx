/** @jsxRuntime automatic */
import { useId, useState } from 'react';
import type { GameEvent } from '@jackpotsyndicate/contracts';
import { formatCash, useGameStore } from '../store/gameStore';

export function summarize(event: GameEvent): string {
  switch (event.t) {
    case 'SpinStarted':
      return `Spin ${event.spinIndex + 1} started (${event.cols}×${event.rows})`;
    case 'ReelStopped':
      return `Reel ${event.col + 1} stopped: ${event.symbols.join(' · ')}`;
    case 'SpinEvaluated':
      return `Evaluated ${event.chips} chips · +${event.addMult} Mult · ×${event.xMult} X`;
    case 'TumbleStep':
      return `Tumble step: ${event.cleared.length} cells cleared`;
    case 'OrbLaunched':
      return `Orb launched: ${event.symbolId}`;
    case 'OrbValued':
      return `Orb ${event.orbId} valued at ${event.chips} chips`;
    case 'PegHit':
      return `Peg hit: ${event.kind}${event.chained ? ' (chain)' : ''}`;
    case 'OrbSplit':
      return `Orb ${event.parentId} split into ${event.childId}`;
    case 'ChuteExit':
      return `Chute ${event.chute + 1} exit: ${event.symbolId}`;
    case 'TokenSpawned':
      return `Token spawned: ${event.symbolId}`;
    case 'TokenValued':
      return `Token ${event.tokenId} worth ${formatCash(event.cash)}`;
    case 'CashBanked':
      return `Banked ${formatCash(event.cash)} at x=${Math.round(event.x)}`;
    case 'LipDrop':
      return `Lip drop: token ${event.tokenId} (${event.symbolId})`;
    case 'GutterLoss':
      return `Gutter loss: ${event.symbolId}`;
    case 'DozerFullExtension':
      return `Dozer full extension (${event.count} tokens)`;
    case 'SurgeStarted':
      return 'Dozer surge started';
    case 'SurgeEnded':
      return 'Dozer surge ended';
    case 'BankrollChanged':
      return `Bankroll ${event.delta >= 0 ? '+' : ''}${formatCash(event.delta)} (${event.reason})`;
    case 'PhaseChanged':
      return `Phase ${event.from.replaceAll('_', ' ')} → ${event.to.replaceAll('_', ' ')}`;
    case 'FeverChanged':
      return `Fever ${event.value}%`;
    case 'FeverTriggered':
      return 'Fever triggered';
    case 'RoundSettled':
      return event.result.kind === 'normal'
        ? `Round settled: ${event.result.passed ? 'passed' : 'missed'} quota`
        : `Boss round settled: ${event.result.playerScore} vs ${event.result.bossScore}`;
    case 'BossScored':
      return `Boss scored +${event.delta} (${event.total})`;
    case 'BossSabotage':
      return `Boss sabotage: ${event.kind}`;
    case 'ShopRolled':
      return `Shop rolled: ${event.archetype} · ${event.offers.length} offers`;
    case 'ItemBought':
      return `Bought ${event.itemId} for ${formatCash(event.price)}`;
    case 'TrinketMounted':
      return `Trinket mounted: ${event.itemId} (×${event.count})`;
    case 'DrinkActive':
      return event.itemId ? `Drink active: ${event.itemId}` : 'Drink cleared';
    case 'CoinLoaded':
      return `Coin loaded: ${event.coinId}`;
    case 'GridMutated':
      return `Grid mutated to ${event.to.cols}×${event.to.rows} (${event.wiring})`;
    case 'JumpersOffered':
      return `${event.options.length} jumper options offered`;
    case 'RelicsOffered':
      return `${event.itemIds.length} relics offered`;
    case 'CellsFrozen':
      return `Cells frozen for ${event.spins} spin(s)`;
    case 'RunStarted':
      return `Run started with seed ${event.seed}`;
    case 'RunEnded':
      return `Run ended: ${event.outcome}`;
    default:
      return event.t;
  }
}

/**
 * Event log, secondary by design: a one-line ticker with the latest event and
 * a toggle that opens the full scrollback as a drawer. The list stays in the
 * DOM when closed so the log is always complete for tests and screen readers.
 */
export function LogPanel() {
  const events = useGameStore((store) => store.events);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const latest = events.length > 0 ? events[events.length - 1]! : null;

  return (
    <section className={`log-panel ${open ? 'is-open' : ''}`} aria-label="Event log">
      <button
        type="button"
        className="log-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="log-toggle-label">Log</span>
        <b>{events.length}</b>
      </button>
      <span className="log-ticker" aria-hidden="true">
        {latest ? summarize(latest) : 'No events yet'}
      </span>
      <div className="log-drawer" hidden={!open}>
        <ol
          className="log"
          id={listId}
          data-testid="event-log"
          tabIndex={0}
          aria-label="Event log entries"
          aria-live="polite"
          aria-relevant="additions"
        >
          {events.length === 0 ? (
            <li className="log-empty">No events yet. Start a run and spin.</li>
          ) : (
            events.slice(-80).map((event, index) => (
              <li className="log-line" key={`${event.tick}-${event.t}-${index}`}>
                <span className="log-tick">{event.tick}</span>
                <span className="log-text">{summarize(event)}</span>
              </li>
            ))
          )}
        </ol>
      </div>
    </section>
  );
}
