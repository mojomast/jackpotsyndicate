import { gsap } from 'gsap';
import type { ReelSpinParams, TimelineFactory } from '../contracts-shim';
import { EVAL_DELAY_TICKS, REEL_SETTLE_TICKS, REEL_STOP_TICK, SYMBOL_IDS } from '../contracts-shim';
import { ensureCabinet, setCabinetGrid } from '../runtime/cabinet';
import { anchor, cellAt, clearTransient, element, fade, finish, seeded, ticks, timeline, validateCells, validateGrid } from '../runtime/dom';
import { sprite } from '../runtime/sprites';

export const reelSpin: TimelineFactory<ReelSpinParams, gsap.core.Timeline> = (root, p, tokens, sprites) => {
  validateGrid(p.finalGrid, p); validateCells(p.frozenCells || [], p);
  ensureCabinet(root, p, tokens, sprites); clearTransient(root); setCabinetGrid(root, p.finalGrid, tokens, sprites);
  const tl = timeline(root, REEL_STOP_TICK(p.cols - 1) + EVAL_DELAY_TICKS);
  const random = seeded(p.seed), streamLayer = anchor(root, 'reel-streams');
  for (let col = 0; col < p.cols; col++) {
    const stop = ticks(REEL_STOP_TICK(col));
    tl.addLabel(`reel:${col}:land`, stop); tl.addLabel(`reel:${col}:settled`, stop + ticks(REEL_SETTLE_TICKS));
    const stream = element('div', 'reel-stream', 'jsa-reel-stream');
    stream.dataset.col = String(col); Object.assign(stream.style, { left: `${col * 100 / p.cols}%`, width: `${100 / p.cols}%`, opacity: '1' });
    const distance = 7 + col * 2 + Math.floor(random() * 3);
    for (let i = 0; i < distance + p.rows; i++) {
      const tile = element('div', 'stream-symbol', 'jsa-stream-symbol');
      Object.assign(tile.style, { top: `${100 * i / p.rows}%`, height: `${100 / p.rows}%` });
      const id = i >= distance ? p.finalGrid[col]![i - distance]! : SYMBOL_IDS[Math.floor(random() * SYMBOL_IDS.length)]!;
      tile.append(sprite(`symbol.${id}`, tokens, sprites)); stream.append(tile);
    }
    streamLayer.append(stream);
    if (p.reducedMotion) {
      // A static stream plate crossfades into the authoritative final symbols.
      fade(tl, stream, .45, 0, Math.max(0, stop - .12), .12);
    } else {
      gsap.set(stream, { yPercent: 0 });
      tl.fromTo(stream, { yPercent: 0 }, { yPercent: -distance * 100 / p.rows, duration: stop, ease: 'power2.out', immediateRender: false }, 0);
      fade(tl, stream, 1, 0, stop, 0);
    }
    for (let row = 0; row < p.rows; row++) {
      const cell = cellAt(root, [col, row]), face = anchor(cell, 'symbol'), glow = anchor(cell, 'cell-glow');
      const frozen = p.frozenCells?.some(([c, r]) => c === col && r === row) || false;
      cell.dataset.frozen = String(frozen); cell.style.zIndex = frozen ? '4' : '';
      cell.style.background = frozen ? tokens.color.panel : '';
      gsap.set(face, { opacity: frozen ? 1 : 0 });
      if (frozen) { glow.style.opacity = '.55'; continue; }
      fade(tl, face, 0, 1, p.reducedMotion ? stop - .12 : stop, p.reducedMotion ? .12 : 0);
      fade(tl, glow, 0, .8, stop, .025); fade(tl, glow, .8, 0, stop + .025, ticks(REEL_SETTLE_TICKS) - .025);
      if (!p.reducedMotion) {
        gsap.set(face, { yPercent: 0 });
        tl.fromTo(face, { yPercent: 0 }, { yPercent: 5, duration: ticks(2), ease: 'power1.out', immediateRender: false }, stop);
        tl.fromTo(face, { yPercent: 5 }, { yPercent: 0, duration: ticks(REEL_SETTLE_TICKS - 2), ease: 'power2.out', immediateRender: false }, stop + ticks(2));
      }
    }
  }
  tl.addLabel('evaluation', tl.duration()); return finish(tl);
};
