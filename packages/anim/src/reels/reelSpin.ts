import { gsap } from 'gsap';
import type { ReelSpinParams, TimelineFactory } from '../contracts-shim';
import { EVAL_DELAY_TICKS, REEL_SETTLE_TICKS, REEL_STOP_TICK, SYMBOL_IDS } from '../contracts-shim';
import { ensureCabinet, setCabinetGrid } from '../runtime/cabinet';
import { anchor, anchors, cellAt, clearTransient, effectScope, element, fade, finish, initial, seeded, svgNode, ticks, timeline, validateCells, validateGrid } from '../runtime/dom';
import { lightRig, prepareEffects } from '../runtime/reelEffects';
import { sprite } from '../runtime/sprites';

/** Presentation-only possibility test. Never samples or modifies the outcome. */
export function hasNearMiss(p: ReelSpinParams): boolean {
  if (p.wiring === 'CLUSTER') return false;
  if (p.wiring === 'WAYS') return SYMBOL_IDS.some(id => p.finalGrid.slice(0, -1).every(col => col.includes(id)));
  const paths = Array.from({ length: p.rows }, (_, row) => Array.from({ length: p.cols }, () => row));
  if (p.wiring === 'HYPER') {
    paths.push(Array.from({ length: p.cols }, (_, c) => Math.round(Math.abs(c - (p.cols - 1) / 2) * (p.rows - 1) / ((p.cols - 1) / 2))));
    paths.push(paths[paths.length - 1]!.map(r => p.rows - 1 - r));
  }
  return paths.some(rows => {
    const prefix = rows.slice(0, -1).map((r, c) => p.finalGrid[c]![r]!);
    return prefix.every(s => s === prefix[0]);
  });
}

export const reelSpin: TimelineFactory<ReelSpinParams, gsap.core.Timeline> = (root, p, tokens, sprites) => {
  validateGrid(p.finalGrid, p); validateCells(p.frozenCells || [], p);
  ensureCabinet(root, p, tokens, sprites); clearTransient(root); setCabinetGrid(root, p.finalGrid, tokens, sprites);
  prepareEffects(root, p.reducedMotion, tokens, p.floorId, p.grain);
  const tl = timeline(root, REEL_STOP_TICK(p.cols - 1) + EVAL_DELAY_TICKS);
  const random = seeded(p.seed), streamLayer = anchor(root, 'reel-streams'), near = hasNearMiss(p);
  root.dataset.nearMiss = String(near); lightRig(tl, root, tl.duration(), p.reducedMotion);
  const window = anchor(root, 'reel-window');
  for (let col = 0; col < p.cols; col++) {
    const stop = ticks(REEL_STOP_TICK(col)), start = ticks(col * 1.2), brake = stop - ticks(9);
    tl.addLabel(`reel:${col}:land`, stop); tl.addLabel(`reel:${col}:settled`, stop + ticks(REEL_SETTLE_TICKS));
    const stream = element('div', 'reel-stream', 'jsa-reel-stream');
    stream.dataset.col = String(col); Object.assign(stream.style, { left: `${col * 100 / p.cols}%`, width: `${100 / p.cols}%`, opacity: '1' });
    streamLayer.append(stream);
    if (p.reducedMotion) {
      for (let row = 0; row < p.rows; row++) {
        const plate = element('div', 'stream-symbol', 'jsa-echo-tile');
        Object.assign(plate.style, { top: `${row * 100 / p.rows}%`, height: `${100 / p.rows}%` });
        plate.append(sprite(`symbol.${SYMBOL_IDS[Math.floor(random() * SYMBOL_IDS.length)]!}`, tokens, sprites)); stream.append(plate);
      }
      fade(tl, stream, .45, 0, stop - .1, .1);
    } else {
      const drum = element('div', 'reel-drum', 'jsa-reel-drum'); stream.append(drum);
      for (let i = 0; i < 12; i++) {
        const tile = element('div', 'stream-symbol', 'jsa-drum-facet');
        Object.assign(tile.style, { top: `${50 - 50 / p.rows}%`, height: `${100 / p.rows}%`, transform: `rotateX(${-(i - (p.rows - 1) / 2) * 30}deg) translateZ(${193.185 / p.rows}cqh)` });
        const id = i < p.rows ? p.finalGrid[col]![i]! : SYMBOL_IDS[Math.floor(random() * SYMBOL_IDS.length)]!;
        tile.append(sprite(`symbol.${id}`, tokens, sprites)); drum.append(tile);
      }
      // The container counter-translates the cylinder: front facets stay in the glass plane.
      drum.style.translate = `0 0 ${-193.185 / p.rows}cqh`;
      const turns = 2 + Math.floor(random() * 2), end = turns * 360;
      initial(tl, drum, { rotationX: 0 });
      tl.fromTo(drum, { rotationX: 0 }, { rotationX: -12, duration: ticks(4), ease: 'power2.inOut', immediateRender: false }, start);
      tl.fromTo(drum, { rotationX: -12 }, { rotationX: end - 80, duration: brake - start - ticks(4), ease: 'power2.in', immediateRender: false }, start + ticks(4));
      tl.fromTo(drum, { rotationX: end - 80 }, { rotationX: end, duration: ticks(9), ease: 'power3.out', immediateRender: false }, brake);
      if (p.blurMode !== 'echo') {
        const svg = svgNode('svg', 'blur-defs'), defs = svgNode('defs', 'blur-definitions'), filter = svgNode('filter', 'velocity-filter'), blur = svgNode('feGaussianBlur', 'velocity-blur');
        const id = `jsa-velocity-${effectScope(root)}-${p.seed >>> 0}-${col}`; filter.id = id; filter.setAttribute('x', '-10%'); filter.setAttribute('y', '-30%'); filter.setAttribute('width', '120%'); filter.setAttribute('height', '160%');
        blur.setAttribute('stdDeviation', '0 0'); blur.setAttribute('in', 'SourceGraphic'); blur.setAttribute('result', 'blur');
        const offset = svgNode('feOffset', 'ghost-offset'), transfer = svgNode('feComponentTransfer', 'ghost-transfer'), alpha = svgNode('feFuncA', 'ghost-alpha'), merge = svgNode('feMerge', 'velocity-merge');
        offset.setAttribute('in', 'SourceGraphic'); offset.setAttribute('dy', '0'); offset.setAttribute('result', 'echo');
        transfer.setAttribute('in', 'echo'); transfer.setAttribute('result', 'ghost'); alpha.setAttribute('type', 'linear'); alpha.setAttribute('slope', '0'); transfer.append(alpha);
        for (const input of ['ghost', 'blur']) { const layer = svgNode('feMergeNode', 'blur-layer'); layer.setAttribute('in', input); merge.append(layer); }
        filter.append(blur, offset, transfer, merge); defs.append(filter); svg.append(defs); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); stream.append(svg);
        // Filter the already-projected reel, never the preserve-3d drum itself.
        stream.style.filter = `url(#${id})`;
        const peak = near && col === p.cols - 1 ? '0 10' : '0 7';
        tl.fromTo(blur, { attr: { stdDeviation: '0 0' } }, { attr: { stdDeviation: peak }, duration: brake - start, ease: 'power1.in', immediateRender: false }, start);
        tl.fromTo(blur, { attr: { stdDeviation: peak } }, { attr: { stdDeviation: '0 0' }, duration: ticks(9), ease: 'power3.out', immediateRender: false }, brake);
        for (const [node, property, value] of [[offset, 'dy', 7], [alpha, 'slope', .16]] as const) {
          tl.fromTo(node, { attr: { [property]: 0 } }, { attr: { [property]: value }, duration: brake - start, ease: 'power1.in', immediateRender: false }, start);
          tl.fromTo(node, { attr: { [property]: value } }, { attr: { [property]: 0 }, duration: ticks(9), ease: 'power3.out', immediateRender: false }, brake);
        }
      } else for (let echoIndex = 0; echoIndex < 2; echoIndex++) {
        const echo = element('div', 'velocity-echo', 'jsa-echo'); stream.append(echo);
        for (let row = 0; row < p.rows; row++) {
          const tile = element('div', 'echo-symbol', 'jsa-echo-tile'); Object.assign(tile.style, { top: `${row * 100 / p.rows}%`, height: `${100 / p.rows}%` });
          tile.append(sprite(`symbol.${p.finalGrid[col]![row]!}`, tokens, sprites)); echo.append(tile);
        }
        const strength = (echoIndex ? .11 : .21) * (near && col === p.cols - 1 ? 1.4 : 1), offset = echoIndex ? 8 : -5;
        initial(tl, echo, { y: 0, scaleY: 1, opacity: 0 });
        tl.fromTo(echo, { y: 0, scaleY: 1 }, { y: offset, scaleY: 1.32, duration: brake - start, ease: 'power1.in', immediateRender: false }, start);
        tl.fromTo(echo, { y: offset, scaleY: 1.32 }, { y: 0, scaleY: 1, duration: ticks(9), ease: 'power3.out', immediateRender: false }, brake);
        fade(tl, echo, 0, strength, start + ticks(4), Math.max(.01, brake - start - ticks(4))); fade(tl, echo, strength, 0, brake, ticks(9));
      }
      fade(tl, stream, 1, 0, stop, 0);
      // Small coherent contact impulse, no stochastic screen shake.
      tl.fromTo(window, { x: 0 }, { x: col % 2 ? -1.2 : 1.2, duration: ticks(1), ease: 'power2.out', immediateRender: false }, stop);
      tl.fromTo(window, { x: col % 2 ? -1.2 : 1.2 }, { x: 0, duration: ticks(4), ease: 'power2.out', immediateRender: false }, stop + ticks(1));
    }
    if (near && col === p.cols - 1) {
      const tension = element('div', 'near-miss', 'jsa-tension'); stream.append(tension);
      initial(tl, tension, { opacity: 0 });
      const at = ticks(REEL_STOP_TICK(col - 1)); tl.addLabel('near-miss', at);
      // One rising envelope rather than a high-frequency heartbeat/strobe at 4×.
      fade(tl, tension, 0, p.reducedMotion ? .18 : .45, at, stop - at);
      if (!p.reducedMotion) {
        initial(tl, tension, { scaleY: .25, transformOrigin: '50% 100%' });
        tl.fromTo(tension, { scaleY: .25 }, { scaleY: 1, duration: stop - at, immediateRender: false, ease: 'sine.inOut' }, at);
      }
    }
    const divider = anchors(root, 'reel-divider')[col]!;
    fade(tl, divider, 0, .52, stop, ticks(2)); fade(tl, divider, .52, 0, tl.duration() - ticks(3), ticks(3));
    for (let row = 0; row < p.rows; row++) {
      const cell = cellAt(root, [col, row]), face = anchor(cell, 'symbol'), glow = anchor(cell, 'cell-glow');
      const frozen = p.frozenCells?.some(([c, r]) => c === col && r === row) || false;
      cell.dataset.frozen = String(frozen); cell.style.zIndex = frozen ? '4' : ''; cell.style.background = frozen ? tokens.color.panel : '';
      cell.dataset.landed = String(frozen); initial(tl, face, { opacity: frozen ? 1 : 0 });
      if (frozen) { glow.style.opacity = '.55'; continue; }
      tl.fromTo(cell, { attr: { 'data-landed': 'false' } }, { attr: { 'data-landed': 'true' }, duration: 0, immediateRender: false }, stop);
      fade(tl, face, 0, 1, stop, 0);
      fade(tl, glow, 0, .26, stop, ticks(2)); fade(tl, glow, .26, 0, tl.duration() - ticks(3), ticks(3));
      if (!p.reducedMotion) {
        initial(tl, face, { yPercent: 0, scaleY: 1, scaleX: 1 });
        tl.fromTo(face, { yPercent: 0, scaleY: 1, scaleX: 1 }, { yPercent: 4, scaleY: .93, scaleX: 1.035, duration: ticks(2), ease: 'power1.out', immediateRender: false }, stop);
        tl.fromTo(face, { yPercent: 4, scaleY: .93, scaleX: 1.035 }, { yPercent: 0, scaleY: 1, scaleX: 1, duration: ticks(REEL_SETTLE_TICKS - 2), ease: 'back.out(1.3)', immediateRender: false }, stop + ticks(2));
      }
    }
  }
  tl.addLabel('evaluation', tl.duration()); return finish(tl);
};
