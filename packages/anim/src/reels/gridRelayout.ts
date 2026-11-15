import { gsap } from 'gsap';
import type { GridRelayoutParams, TimelineFactory } from '../contracts-shim';
import { RELAYOUT_TICKS } from '../contracts-shim';
import { createCabinet, ensureCabinet } from '../runtime/cabinet';
import { anchor, anchors, cellAt, clearTransient, element, fade, finish, initial, ticks, timeline, validateSize } from '../runtime/dom';
import { lightRig, prepareEffects } from '../runtime/reelEffects';

export const gridRelayout: TimelineFactory<GridRelayoutParams, gsap.core.Timeline> = (root, p, tokens, sprites) => {
  validateSize(p.from); validateSize(p.to); ensureCabinet(root, p.from, tokens, sprites); clearTransient(root);
  prepareEffects(root, p.reducedMotion, tokens, p.floorId, p.grain);
  const old = anchor(root, 'cabinet').cloneNode(true) as HTMLElement;
  // The host's bezel content is moved by createCabinet, never duplicated.
  anchor(old, 'bezel-rail').replaceChildren();
  old.dataset.anim = 'relayout-previous'; old.classList.add('jsa-relayout-previous');
  createCabinet(root, p.to, tokens, sprites);
  prepareEffects(root, p.reducedMotion, tokens, p.floorId, p.grain);
  const current = anchor(root, 'cabinet'), cells = anchors(root, 'cell'); root.append(old);
  anchor(old, 'cabinet-header').setAttribute('data-layout-allow-overlap', '');
  anchor(current, 'cabinet-header').setAttribute('data-layout-allow-overlap', '');
  for (const cell of cells) {
    const col = Number(cell.dataset.col), row = Number(cell.dataset.row);
    if (col < p.from.cols && row < p.from.rows) {
      const previous = cellAt(old, [col, row]); cell.dataset.symbol = previous.dataset.symbol;
      anchor(cell, 'symbol').replaceChildren(...[...anchor(previous, 'symbol').childNodes].map(n => n.cloneNode(true)));
    }
  }
  const tl = timeline(root, RELAYOUT_TICKS);
  lightRig(tl, root, ticks(RELAYOUT_TICKS), p.reducedMotion);
  initial(tl, current, { opacity: 0 }); initial(tl, old, { opacity: 1 });
  fade(tl, old, 1, 0, ticks(12), ticks(30)); fade(tl, current, 0, 1, ticks(12), ticks(30));
  if (!p.reducedMotion) {
    const aperture = anchor(current, 'reel-window');
    initial(tl, aperture, { scaleX: p.from.cols / p.to.cols, scaleY: .92 });
    tl.fromTo(aperture, { scaleX: p.from.cols / p.to.cols, scaleY: .92 }, { scaleX: 1, scaleY: 1, duration: ticks(60), ease: 'power3.inOut', immediateRender: false }, ticks(12));
    for (const cell of anchors(old, 'cell')) {
      const face = anchor(cell, 'symbol'), at = ticks(Number(cell.dataset.col) * 3);
      initial(tl, face, { rotationY: 0, z: 0 });
      tl.fromTo(face, { rotationY: 0, z: 0 }, { rotationY: -88, z: -60, duration: ticks(25), ease: 'power3.in', immediateRender: false }, at);
    }
    for (const cell of cells) {
      const face = anchor(cell, 'symbol'), at = ticks(25 + Number(cell.dataset.col) * 5);
      initial(tl, face, { rotationY: 88, z: -60 });
      tl.fromTo(face, { rotationY: 88, z: -60 }, { rotationY: 0, z: 0, duration: ticks(35), ease: 'power3.out', immediateRender: false }, at);
    }
  }
  for (const cell of cells) {
    const col = Number(cell.dataset.col), row = Number(cell.dataset.row);
    if (col < p.from.cols && row < p.from.rows) continue;
    const at = ticks(20 + Math.min(col, 4) * 5 + row * 2), face = anchor(cell, 'symbol');
    if (!p.reducedMotion) {
      initial(tl, face, { yPercent: row >= p.from.rows ? -25 : 0 });
      tl.fromTo(face, { yPercent: row >= p.from.rows ? -25 : 0 }, { yPercent: 0, duration: ticks(24), ease: 'back.out(1.15)', immediateRender: false }, at);
    }
    fade(tl, face, 0, 1, at, ticks(12));
    const glow = anchor(cell, 'cell-glow'); fade(tl, glow, 0, 1, at, ticks(6)); fade(tl, glow, 1, 0, at + ticks(6), ticks(24));
  }
  const spark = element('div', 'weld-spark', 'jsa-weld-spark'); anchor(root, 'reel-window').append(spark);
  initial(tl, spark, { opacity: 0 }); fade(tl, spark, 0, .9, ticks(24), ticks(6)); fade(tl, spark, .9, 0, ticks(66), ticks(12));
  if (!p.reducedMotion) { initial(tl, spark, { xPercent: -100 }); tl.fromTo(spark, { xPercent: -100 }, { xPercent: 100, duration: ticks(48), ease: 'none', immediateRender: false }, ticks(24)); }
  tl.addLabel('welded', ticks(78)); return finish(tl);
};
