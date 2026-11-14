import { gsap } from 'gsap';
import type { Cell, LineWinParams, TimelineFactory } from '../contracts-shim';
import { ORB_LAUNCH_DELAY_TICKS, ORB_LAUNCH_INTERVAL_TICKS, SYMBOL_DROP_TICKS } from '../contracts-shim';
import { ensureCabinet } from '../runtime/cabinet';
import { anchor, cellAt, clearTransient, fade, finish, svgNode, ticks, timeline, validateCells, validateSize } from '../runtime/dom';

export const lineWin: TimelineFactory<LineWinParams, gsap.core.Timeline> = (root, p, tokens, sprites) => {
  validateSize(p); p.wins.forEach(win => validateCells(win.cells, p));
  ensureCabinet(root, p, tokens, sprites); clearTransient(root);
  const cells: Cell[] = [];
  for (const win of p.wins) for (const cell of win.cells) if (!cells.some(([c, r]) => c === cell[0] && r === cell[1])) cells.push(cell);
  const end = cells.length ? ORB_LAUNCH_DELAY_TICKS + (cells.length - 1) * ORB_LAUNCH_INTERVAL_TICKS + SYMBOL_DROP_TICKS : ORB_LAUNCH_DELAY_TICKS;
  const tl = timeline(root, end), paths = anchor<SVGSVGElement>(root, 'payline-overlay'), effects = anchor(root, 'cell-effects');
  for (const win of p.wins) if (win.kind === 'line' && win.cells.length) {
    const path = svgNode('polyline', 'win-path');
    path.setAttribute('points', win.cells.map(([c, r]) => `${(c + .5) * 1000 / p.cols},${(r + .5) * 1000 / p.rows}`).join(' '));
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', win.overvolt ? tokens.color.cyan : tokens.color.gold);
    path.setAttribute('stroke-width', '6'); path.setAttribute('pathLength', '1'); path.setAttribute('stroke-linecap', 'round');
    paths.append(path); gsap.set(path, { opacity: 0 });
    fade(tl, path, 0, .9, 0, ticks(5));
    if (!p.reducedMotion) {
      gsap.set(path, { strokeDasharray: 1, strokeDashoffset: 1 });
      tl.fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: ticks(5), immediateRender: false, ease: 'power2.out' }, 0);
    }
    fade(tl, path, .9, 0, ticks(end - 6), ticks(6));
  }
  cells.forEach(([col, row], i) => {
    const cell = cellAt(root, [col, row]), face = anchor(cell, 'symbol'), glow = anchor(cell, 'cell-glow');
    const launch = ticks(ORB_LAUNCH_DELAY_TICKS + i * ORB_LAUNCH_INTERVAL_TICKS);
    cell.dataset.detached = 'false';
    tl.addLabel(`launch:${col}:${row}`, launch);
    tl.fromTo(cell, { attr: { 'data-detached': 'false' } }, { attr: { 'data-detached': 'true' }, duration: 0, immediateRender: false }, launch);
    glow.style.borderColor = p.wins.some(w => w.overvolt && w.cells.some(([c, r]) => c === col && r === row)) ? tokens.color.cyan : tokens.color.gold;
    fade(tl, glow, 0, 1, 0, ticks(4)); fade(tl, glow, 1, 0, launch, ticks(6));
    const drop = cell.cloneNode(true) as HTMLElement; drop.dataset.anim = 'drop-symbol';
    drop.dataset.col = String(col); drop.dataset.row = String(row); effects.append(drop);
    // The visual drop is prebuilt; the game owns actual orb creation at this tick.
    gsap.set(drop, { opacity: 0 }); gsap.set(face, { opacity: 1 });
    fade(tl, face, 1, 0, launch, 0); fade(tl, drop, 0, 1, launch, 0);
    if (!p.reducedMotion) {
      gsap.set(drop, { yPercent: 0, scale: 1 });
      tl.fromTo(drop, { yPercent: 0, scale: 1 }, { yPercent: (p.rows - row + .5) * 100, scale: .62, duration: ticks(SYMBOL_DROP_TICKS), ease: 'power2.in', immediateRender: false }, launch);
      fade(tl, drop, 1, 0, launch + ticks(SYMBOL_DROP_TICKS - 3), ticks(3));
    } else fade(tl, drop, 1, 0, launch, ticks(SYMBOL_DROP_TICKS));
  });
  return finish(tl);
};
