import { gsap } from 'gsap';
import type { GridRelayoutParams, TimelineFactory } from '../contracts-shim';
import { RELAYOUT_TICKS } from '../contracts-shim';
import { createCabinet, ensureCabinet } from '../runtime/cabinet';
import { anchor, anchors, cellAt, clearTransient, element, fade, finish, ticks, timeline, validateSize } from '../runtime/dom';

export const gridRelayout: TimelineFactory<GridRelayoutParams, gsap.core.Timeline> = (root, p, tokens, sprites) => {
  validateSize(p.from); validateSize(p.to); ensureCabinet(root, p.from, tokens, sprites); clearTransient(root);
  const old = anchor(root, 'cabinet').cloneNode(true) as HTMLElement;
  // The host's bezel content is moved by createCabinet, never duplicated.
  anchor(old, 'bezel-rail').replaceChildren();
  old.dataset.anim = 'relayout-previous'; old.classList.add('jsa-relayout-previous');
  createCabinet(root, p.to, tokens, sprites);
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
  gsap.set(current, { opacity: 0 }); gsap.set(old, { opacity: 1 });
  fade(tl, old, 1, 0, ticks(12), ticks(30)); fade(tl, current, 0, 1, ticks(12), ticks(30));
  for (const cell of cells) {
    const col = Number(cell.dataset.col), row = Number(cell.dataset.row);
    if (col < p.from.cols && row < p.from.rows) continue;
    const at = ticks(20 + Math.min(col, 4) * 5 + row * 2), face = anchor(cell, 'symbol');
    if (!p.reducedMotion) {
      gsap.set(face, { xPercent: col >= p.from.cols ? 40 : 0, yPercent: row >= p.from.rows ? -45 : 0 });
      tl.fromTo(face, { xPercent: col >= p.from.cols ? 40 : 0, yPercent: row >= p.from.rows ? -45 : 0 }, { xPercent: 0, yPercent: 0, duration: ticks(24), ease: 'back.out(1.15)', immediateRender: false }, at);
    }
    fade(tl, face, 0, 1, at, ticks(12));
    const glow = anchor(cell, 'cell-glow'); fade(tl, glow, 0, 1, at, ticks(6)); fade(tl, glow, 1, 0, at + ticks(6), ticks(24));
  }
  const spark = element('div', 'weld-spark', 'jsa-weld-spark'); anchor(root, 'reel-window').append(spark);
  gsap.set(spark, { opacity: 0 }); fade(tl, spark, 0, .9, ticks(24), ticks(6)); fade(tl, spark, .9, 0, ticks(66), ticks(12));
  if (!p.reducedMotion) { gsap.set(spark, { xPercent: -100 }); tl.fromTo(spark, { xPercent: -100 }, { xPercent: 100, duration: ticks(48), ease: 'none', immediateRender: false }, ticks(24)); }
  tl.addLabel('welded', ticks(78)); return finish(tl);
};
