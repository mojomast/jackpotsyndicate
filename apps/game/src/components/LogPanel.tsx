/** @jsxRuntime automatic */
import type { GameEvent } from '@jackpotsyndicate/contracts';
import { formatCash, useGameStore } from '../store/gameStore';

function summarize(event: GameEvent): string {
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

export function LogPanel() {
  const events = useGameStore((store) => store.events);

  return (
    <section className="log-panel panel" aria-label="Event log">
      <div className="panel-heading">
        <h2>Event log</h2>
        <span>{events.length} events</span>
      </div>
      <ol className="log" data-testid="event-log" aria-live="polite" aria-relevant="additions">
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
    </section>
  );
}
