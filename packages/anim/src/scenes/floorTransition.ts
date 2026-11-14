import { gsap } from 'gsap';
import type { FloorTransitionParams, TimelineFactory } from '../contracts-shim';
import { SCENE_TICKS } from '../contracts-shim';
import { element, fade, finish, timeline } from '../runtime/dom';
import { sprite } from '../runtime/sprites';
import { copy, entrance, scene } from './layout';

export const floorTransition: TimelineFactory<FloorTransitionParams, gsap.core.Timeline> = (root, p, tokens, sprites) => {
  const stage = scene(root, tokens, 'floor'), tl = timeline(root, SCENE_TICKS.floorTransition);
  const from = element('div', 'floor-from', 'jsa-floor-plate'); from.append(sprite(`floor.${p.fromFloor}.bg`, tokens, sprites));
  const to = element('div', 'floor-to', 'jsa-floor-plate'); to.append(sprite(`floor.${p.toFloor}.bg`, tokens, sprites));
  stage.append(from, to); gsap.set(to, { opacity: 0 });
  fade(tl, from, 1, 0, .9, .2); fade(tl, to, 0, 1, .95, .2);
  const doors = element('div', 'elevator-doors', 'jsa-elevator-doors'); stage.append(doors);
  for (const side of ['left', 'right']) {
    const door = element('div', 'elevator-door', `jsa-elevator-door jsa-door-${side}`); doors.append(door);
    const sign = side === 'left' ? -1 : 1;
    if (!p.reducedMotion) {
      gsap.set(door, { xPercent: sign * 100 });
      tl.fromTo(door, { xPercent: sign * 100 }, { xPercent: 0, duration: .45, ease: 'power3.inOut', immediateRender: false }, 0);
      tl.fromTo(door, { xPercent: 0 }, { xPercent: sign * 100, duration: .6, ease: 'power3.inOut', immediateRender: false }, 1.35);
    } else { gsap.set(door, { opacity: 0 }); fade(tl, door, 0, 1, 0, .45); fade(tl, door, 1, 0, 1.35, .6); }
  }
  const readout = element('div', 'scene-content', 'jsa-centered jsa-floor-copy'); stage.append(readout);
  const eyebrow = copy(readout, 'scene-eyebrow', 'p', 'DESCENDING / ACCESS GRANTED', 'jsa-eyebrow');
  const title = copy(readout, 'scene-title', 'h1', p.floorName, 'jsa-floor-title');
  const detail = copy(readout, 'scene-detail', 'p', p.toFloor.replace('FLOOR_', 'FLOOR / '), 'jsa-mono');
  entrance(tl, eyebrow, .45, .25, p.reducedMotion, -15);
  entrance(tl, title, .7, .5, p.reducedMotion, 25); entrance(tl, detail, .95, .3, p.reducedMotion);
  return finish(tl);
};
