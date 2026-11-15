import { gsap } from 'gsap';
import type { TimelineFactory, TumbleStepParams } from '../contracts-shim';
import { TUMBLE_TICKS } from '../contracts-shim';
import { ensureCabinet, setCabinetGrid } from '../runtime/cabinet';
import { anchor, cellAt, clearTransient, fade, finish, initial, ticks, timeline, validateCells, validateGrid } from '../runtime/dom';
import { lightRig, particles, prepareEffects } from '../runtime/reelEffects';

export const tumbleStep: TimelineFactory<TumbleStepParams, gsap.core.Timeline> = (root, p, tokens, sprites) => {
  validateGrid(p.gridAfter, p); validateCells(p.cleared, p);
  ensureCabinet(root, p, tokens, sprites); clearTransient(root);
  prepareEffects(root, p.reducedMotion, tokens, p.floorId, p.grain);
  const before = Array.from({ length: p.cols }, (_, c) => Array.from({ length: p.rows }, (_, r) => cellAt(root, [c, r]).cloneNode(true) as HTMLElement));
  setCabinetGrid(root, p.gridAfter, tokens, sprites);
  const effects = anchor(root, 'cell-effects'), tl = timeline(root, TUMBLE_TICKS);
  lightRig(tl, root, ticks(TUMBLE_TICKS), p.reducedMotion);
  for (let col = 0; col < p.cols; col++) {
    const removed = [...new Set(p.cleared.filter(([c]) => c === col).map(([, r]) => r))];
    const survivors = Array.from({ length: p.rows }, (_, r) => r).filter(r => !removed.includes(r));
    for (let row = 0; row < p.rows; row++) {
      const finalFace = anchor(cellAt(root, [col, row]), 'symbol'); initial(tl, finalFace, { opacity: 0 });
      fade(tl, finalFace, 0, 1, p.reducedMotion ? ticks(6) : ticks(30), p.reducedMotion ? ticks(24) : 0);
      const old = before[col]![row]!; old.dataset.anim = 'tumble-symbol'; effects.append(old); initial(tl, old, { opacity: 1 });
      if (removed.includes(row)) {
        fade(tl, old, 1, 0, 0, ticks(6));
        if (!p.reducedMotion) {
          initial(tl, old, { scale: 1, rotationY: 0 });
          tl.fromTo(old, { scale: 1, rotationY: 0 }, { scale: .72, rotationY: 65, duration: ticks(6), immediateRender: false, ease: 'power2.in' }, 0);
          particles(tl, root, (p.seed ?? 41) + col * 97 + row * 23, Math.min(4, Math.floor(48 / Math.max(1, p.cleared.length))), [col, row], p, 0, .28);
        }
      } else {
        const target = removed.length + survivors.indexOf(row);
        if (!p.reducedMotion) { initial(tl, old, { yPercent: 0 }); tl.fromTo(old, { yPercent: 0 }, { yPercent: (target - row) * 100, duration: ticks(24), immediateRender: false, ease: 'bounce.out' }, ticks(6)); }
        fade(tl, old, 1, 0, p.reducedMotion ? ticks(6) : ticks(30), p.reducedMotion ? ticks(24) : 0);
      }
      if (row < removed.length) {
        const incoming = cellAt(root, [col, row]).cloneNode(true) as HTMLElement; incoming.dataset.anim = 'tumble-symbol';
        anchor(incoming, 'symbol').style.opacity = '1'; effects.append(incoming); initial(tl, incoming, { opacity: 0 });
        fade(tl, incoming, 0, 1, ticks(6), p.reducedMotion ? ticks(24) : 0);
        if (!p.reducedMotion) {
          initial(tl, incoming, { yPercent: -(removed.length + 1) * 100 });
          const at = 6 + col + row;
          tl.fromTo(incoming, { yPercent: -(removed.length + 1) * 100 }, { yPercent: 0, duration: ticks(30 - at), ease: 'bounce.out', immediateRender: false }, ticks(at));
        }
        fade(tl, incoming, 1, 0, ticks(30), 0);
      }
    }
  }
  tl.addLabel('settled', ticks(30)); return finish(tl);
};
