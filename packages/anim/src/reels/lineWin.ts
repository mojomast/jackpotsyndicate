import { gsap } from 'gsap';
import type { Cell, LineWinParams, TimelineFactory } from '../contracts-shim';
import { ORB_LAUNCH_DELAY_TICKS, ORB_LAUNCH_INTERVAL_TICKS, SYMBOL_DROP_TICKS } from '../contracts-shim';
import { ensureCabinet } from '../runtime/cabinet';
import { anchor, anchors, cellAt, clearTransient, effectScope, element, fade, finish, initial, svgNode, ticks, timeline, validateCells, validateSize } from '../runtime/dom';
import { lightRig, particles, prepareEffects, sheen, winTier } from '../runtime/reelEffects';

const key = ([c, r]: Cell): string => `${c}:${r}`;
function region(cells: Cell[], cols: number, rows: number): string {
  const set = new Set(cells.map(key));
  return cells.map(([c, r]) => {
    const x = c * 1000 / cols + 10, y = r * 1000 / rows + 10, w = 1000 / cols - 20, h = 1000 / rows - 20;
    return [!set.has(`${c}:${r - 1}`) ? `M${x},${y}h${w}` : '', !set.has(`${c + 1}:${r}`) ? `M${x + w},${y}v${h}` : '', !set.has(`${c}:${r + 1}`) ? `M${x},${y + h}h${w}` : '', !set.has(`${c - 1}:${r}`) ? `M${x},${y}v${h}` : ''].join(' ');
  }).join(' ');
}

export const lineWin: TimelineFactory<LineWinParams, gsap.core.Timeline> = (root, p, tokens, sprites) => {
  validateSize(p); p.wins.forEach(win => validateCells(win.cells, p));
  if (p.launchOrder) validateCells(p.launchOrder.filter((c): c is Cell => c !== null), p);
  ensureCabinet(root, p, tokens, sprites); clearTransient(root); prepareEffects(root, p.reducedMotion, tokens, p.floorId, p.grain);
  const slots = p.launchOrder ?? p.wins.flatMap(w => w.cells).filter((c, i, all) => all.findIndex(x => key(x) === key(c)) === i);
  const cells = slots.flatMap((cell, slot) => cell && slots.findIndex(c => c && key(c) === key(cell)) === slot ? [{ cell, slot }] : []);
  const end = slots.length ? ORB_LAUNCH_DELAY_TICKS + (slots.length - 1) * ORB_LAUNCH_INTERVAL_TICKS + SYMBOL_DROP_TICKS : ORB_LAUNCH_DELAY_TICKS;
  const tl = timeline(root, end), paths = anchor<SVGSVGElement>(root, 'payline-overlay'), effects = anchor(root, 'cell-effects');
  const tier = winTier(p), level = ['small', 'big', 'mega', 'jackpot'].indexOf(tier), endTime = ticks(end);
  root.dataset.winTier = tier; lightRig(tl, root, endTime, p.reducedMotion);
  const badge = anchor(root, 'win-tier'); badge.textContent = tier === 'small' || !cells.length ? '' : `${tier.toUpperCase()} / ${p.equity === undefined ? 'SYNDICATE' : Math.round(p.equity).toLocaleString('en-US')}`;
  if (cells.length && level > 0) { fade(tl, badge, 0, 1, 0, .06); fade(tl, badge, 1, 0, Math.max(.06, endTime - .16), .16); }
  const slotOf = (cell: Cell): number => slots.findIndex(c => c !== null && key(c) === key(cell));
  let arcAllocated = false;
  for (const win of p.wins) if (win.cells.length) {
    const ordered = [...win.cells].sort((a, b) => slotOf(a) - slotOf(b));
    const point = ([c, r]: Cell) => `${(c + .5) * 1000 / p.cols},${(r + .5) * 1000 / p.rows}`;
    let d = ordered.map((c, i) => `${i ? 'L' : 'M'}${point(c)}`).join(' ');
    if (win.kind === 'ways') d = ordered.flatMap(a => ordered.filter(b => b[0] === a[0] + 1).map(b => `M${point(a)}L${point(b)}`)).slice(0, 48).join(' ');
    if (win.kind === 'cluster') d = region(ordered, p.cols, p.rows);
    const group = svgNode('g', 'win-path'); group.dataset.kind = win.kind; paths.append(group);
    if (win.overvolt && win.kind === 'line' && !p.reducedMotion && !arcAllocated) {
      arcAllocated = true;
      const defs = svgNode('defs', 'arc-defs'), filter = svgNode('filter', 'arc-filter'), noise = svgNode('feTurbulence', 'arc-noise'), displacement = svgNode('feDisplacementMap', 'arc-displacement');
      const id = `jsa-arc-${effectScope(root)}-${(p.seed ?? 0) >>> 0}-${paths.childElementCount}`; filter.id = id;
      const xs = ordered.map(c => (c[0] + .5) * 1000 / p.cols), ys = ordered.map(c => (c[1] + .5) * 1000 / p.rows);
      filter.setAttribute('filterUnits', 'userSpaceOnUse');
      filter.setAttribute('x', String(Math.min(...xs) - 25)); filter.setAttribute('y', String(Math.min(...ys) - 25));
      filter.setAttribute('width', String(Math.max(...xs) - Math.min(...xs) + 50)); filter.setAttribute('height', String(Math.max(...ys) - Math.min(...ys) + 50));
      noise.setAttribute('type', 'fractalNoise'); noise.setAttribute('baseFrequency', '.014'); noise.setAttribute('numOctaves', '1'); noise.setAttribute('seed', String((p.seed ?? 42) % 997)); noise.setAttribute('result', 'noise');
      displacement.setAttribute('in', 'SourceGraphic'); displacement.setAttribute('in2', 'noise'); displacement.setAttribute('scale', '12');
      filter.append(noise, displacement); defs.append(filter); paths.append(defs); group.setAttribute('filter', `url(#${id})`);
      tl.fromTo(noise, { attr: { baseFrequency: '.014' } }, { attr: { baseFrequency: '.025' }, duration: endTime, ease: 'none', immediateRender: false }, 0);
    }
    for (const [width, alpha] of [[22, .12], [8, .38], [3, .9]]) {
      const path = svgNode('path', 'beam-core'); path.setAttribute('d', d); path.setAttribute('fill', 'none'); path.setAttribute('stroke', win.overvolt ? tokens.color.cyan : tokens.color.gold);
      path.setAttribute('stroke-width', String(width)); path.setAttribute('opacity', String(alpha)); path.setAttribute('pathLength', '1'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); group.append(path);
      if (!p.reducedMotion && win.kind !== 'cluster') {
        initial(tl, path, { strokeDasharray: 1, strokeDashoffset: 1 });
        tl.fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: Math.max(.08, ticks((Math.max(...ordered.map(slotOf)) + 1) * 6)), immediateRender: false, ease: 'none' }, 0);
      }
    }
    initial(tl, group, { opacity: 0 }); fade(tl, group, 0, 1, 0, .08); fade(tl, group, 1, 0, Math.max(.08, endTime - .18), Math.min(.18, endTime - .08));
  }
  const winning = new Set(cells.map(c => key(c.cell)));
  for (const cell of anchors(anchor(root, 'grid'), 'cell')) if (!winning.has(`${cell.dataset.col}:${cell.dataset.row}`)) {
    const face = anchor(cell, 'symbol'); fade(tl, face, 1, .32, 0, Math.min(.08, endTime / 2)); fade(tl, face, .32, 1, Math.max(.05, endTime - .12), Math.min(.12, endTime / 2));
  }
  let bloom: HTMLElement | undefined;
  if (!p.reducedMotion && cells.length) {
    bloom = element('div', 'win-vfx', 'jsa-bloom'); effects.append(bloom);
    fade(tl, bloom, 0, .18 + level * .1, 0, .08); fade(tl, bloom, .18 + level * .1, 0, endTime - .12, .12);
    const grid = anchor(root, 'grid');
    tl.fromTo(grid, { filter: 'saturate(1)' }, { filter: 'saturate(.6)', duration: .08, immediateRender: false }, 0);
    tl.fromTo(grid, { filter: 'saturate(.6)' }, { filter: 'saturate(1)', duration: .12, immediateRender: false }, endTime - .12);
  }
  cells.forEach(({ cell: [col, row], slot }, i) => {
    const cell = cellAt(root, [col, row]), face = anchor(cell, 'symbol'), glow = anchor(cell, 'cell-glow');
    const launch = ticks(ORB_LAUNCH_DELAY_TICKS + slot * ORB_LAUNCH_INTERVAL_TICKS);
    cell.dataset.detached = 'false'; tl.addLabel(`launch:${col}:${row}`, launch);
    tl.fromTo(cell, { attr: { 'data-detached': 'false' } }, { attr: { 'data-detached': 'true' }, duration: 0, immediateRender: false }, launch);
    glow.style.borderColor = p.wins.some(w => w.overvolt && w.cells.some(c => key(c) === `${col}:${row}`)) ? tokens.color.cyan : tokens.color.gold;
    fade(tl, glow, 0, .55, 0, .06); fade(tl, glow, .55, 0, launch, .1);
    const drop = cell.cloneNode(true) as HTMLElement; drop.dataset.anim = 'drop-symbol'; effects.append(drop);
    initial(tl, drop, { opacity: 0 }); initial(tl, face, { opacity: 1 });
    if (bloom) {
      const copy = cell.cloneNode(true) as HTMLElement; copy.dataset.anim = 'bloom-cell'; bloom.append(copy); fade(tl, copy, 1, 0, launch, 0);
    }
    if (!p.reducedMotion) {
      sheen(tl, cell, Math.max(0, launch - .12), .12);
      initial(tl, face, { z: 0, scale: 1 });
      tl.fromTo(face, { z: 0, scale: 1 }, { z: 22 + level * 6, scale: 1.06, duration: Math.min(.1, launch), immediateRender: false, ease: 'back.out(1.2)' }, Math.max(0, launch - .1));
      initial(tl, drop, { xPercent: 0, yPercent: 0, scale: 1 });
      tl.fromTo(drop, { xPercent: 0, yPercent: 0, scale: 1 }, { xPercent: p.exitEdge === 'right' ? (p.cols - col + .3) * 100 : 0, yPercent: p.exitEdge === 'right' ? (p.rows / 2 - row) * 100 : (p.rows - row + .5) * 100, scale: .25, duration: ticks(SYMBOL_DROP_TICKS), ease: 'power2.in', immediateRender: false }, launch);
      if (level > 0) particles(tl, root, (p.seed ?? 41) + i * 1337, Math.min(level * 2, Math.floor(48 / cells.length)), [col, row], p, launch, .24);
    }
    fade(tl, face, 1, 0, launch, 0); fade(tl, drop, 0, 1, launch, 0);
    fade(tl, drop, 1, 0, p.reducedMotion ? launch : launch + ticks(SYMBOL_DROP_TICKS - 3), p.reducedMotion ? ticks(SYMBOL_DROP_TICKS) : ticks(3));
  });
  if (tier === 'jackpot' && !p.reducedMotion && bloom) for (const [name, offset] of [['red', -2], ['cyan', 2]] as const) {
    const split = bloom.cloneNode(true) as HTMLElement; split.className = `jsa-rgb jsa-rgb-${name}`; effects.append(split);
    initial(tl, split, { x: offset, opacity: 0 }); fade(tl, split, 0, .16, 0, .06); fade(tl, split, .16, 0, .12, .12);
  }
  return finish(tl);
};
