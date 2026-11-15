/** @jsxRuntime automatic */
import { useEffect, useRef } from 'react';
import {
  DESIGN_TOKENS,
  type ReelSpinParams,
  type SeekableTimeline,
  type SpriteResolver,
  type SymbolId,
  type TimelineFactory,
} from '@jackpotsyndicate/contracts';
import { useGameStore } from '../store/gameStore';

const SYMBOL_LABELS: Record<SymbolId, string> = {
  diamond: 'DIA',
  cherry: 'CHR',
  uranium: 'URA',
  skull: 'SKL',
  seven: '7',
};

const NOOP_SPRITE_RESOLVER: SpriteResolver = () => null;

function makeNoopTimeline(): SeekableTimeline {
  let currentTime = 0;
  const timeline: SeekableTimeline = {
    time: ((value?: number) => {
      if (typeof value === 'number') {
        currentTime = value;
        return timeline;
      }
      return currentTime;
    }) as SeekableTimeline['time'],
    duration: () => 0,
    pause: () => timeline,
    kill: () => timeline,
  };
  return timeline;
}

/**
 * T-070 ships against the frozen C-6 types while packages/anim is external
 * (SPEC 2.11 rule 4). This factory builds a fully-resolved, paused no-op
 * timeline and stamps the cabinet anchors so the real factory can replace it
 * without changing the mount point.
 */
export const noopTimelineFactory: TimelineFactory<ReelSpinParams> = (
  root,
  params,
  tokens,
  sprites,
) => {
  root.dataset.animReady = 'true';
  root.dataset.cols = String(params.cols);
  root.dataset.rows = String(params.rows);
  root.dataset.reducedMotion = String(params.reducedMotion);
  root.dataset.seed = String(params.seed);
  root.style.setProperty('--cabinet-gold', tokens.color.gold);
  root.style.setProperty('--cabinet-cyan', tokens.color.cyan);
  root.style.setProperty('--cabinet-obsidian', tokens.color.obsidian);

  const cells = root.querySelectorAll<HTMLElement>('[data-anim="cell"]');
  cells.forEach((cell, index) => {
    const col = index % Math.max(1, params.cols);
    const row = Math.floor(index / Math.max(1, params.cols));
    cell.dataset.symbol = params.finalGrid[row]?.[col] ?? 'cherry';
    cell.dataset.frozen = String(
      params.frozenCells?.some(([frozenCol, frozenRow]) => frozenCol === col && frozenRow === row) ?? false,
    );
    cell.dataset.anim = 'cell';
  });

  void sprites;
  return makeNoopTimeline();
};

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function CabinetMount() {
  const rootRef = useRef<HTMLDivElement>(null);
  const state = useGameStore((store) => store.state);
  const lastSpin = useGameStore((store) => store.lastSpin);
  const reducedMotion = useGameStore((store) => store.settings.reducedMotion);

  const cols = state.grid.cols;
  const rows = state.grid.rows;
  const finalGrid: SymbolId[][] = lastSpin?.grid ?? state.grid.visible;
  const gridKey = finalGrid.map((row) => row.join(',')).join('|');
  const frozenKey = state.grid.frozen.map((entry) => entry.cell.join(',')).join('|');
  const seed = hashSeed(state.seed);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const timeline = noopTimelineFactory(
      root,
      {
        cols,
        rows,
        finalGrid,
        seed,
        frozenCells: state.grid.frozen.map((entry) => entry.cell),
        reducedMotion,
      },
      DESIGN_TOKENS,
      NOOP_SPRITE_RESOLVER,
    );

    return () => {
      timeline.pause();
      timeline.kill();
    };
    // gridKey captures the grid contents without re-mounting on every tick.
  }, [cols, rows, gridKey, frozenKey, seed, reducedMotion]);

  return (
    <section className="cabinet panel" data-testid="cabinet" aria-label="Slot cabinet, stub animation mount">
      <div className="cabinet-bezel" data-anim="cabinet" ref={rootRef}>
        <div className="cabinet-marquee">
          <h2 className="cabinet-name">Jackpot Syndicate</h2>
          <span className="cabinet-status" data-anim="status">
            {state.phase.replaceAll('_', ' ')}
          </span>
        </div>

        <div
          className="cabinet-reels"
          data-anim="reels"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {finalGrid.map((row, rowIndex) =>
            row.map((symbol, colIndex) => (
              <div
                key={`${colIndex}-${rowIndex}`}
                className="reel-cell"
                data-anim="cell"
                data-symbol={symbol}
                aria-label={`Reel ${colIndex + 1}, row ${rowIndex + 1}: ${symbol}`}
              >
                {SYMBOL_LABELS[symbol] ?? symbol.slice(0, 3).toUpperCase()}
              </div>
            )),
          )}
        </div>

        <div className="cabinet-foot">
          <span data-anim="legend">C-6 cabinet mount</span>
          <span>no-op timeline · {cols}×{rows}</span>
        </div>
      </div>
      <p className="stub-note" style={{ marginTop: 10 }}>
        Stub cabinet: the TimelineFactory is wired and paused. Reels, scenes and the
        board renderer arrive in T-052 / T-071.
      </p>
    </section>
  );
}
