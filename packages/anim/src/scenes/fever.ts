import { gsap } from 'gsap';
import type { FeverParams, TimelineFactory } from '../contracts-shim';
import { SCENE_TICKS } from '../contracts-shim';
import { element, fade, finish, timeline } from '../runtime/dom';
import { copy, entrance, scene } from './layout';

export const fever: TimelineFactory<FeverParams, gsap.core.Timeline> = (root, p, tokens) => {
  const stage = scene(root, tokens, 'fever'), tl = timeline(root, SCENE_TICKS.fever);
  const bars = element('div', 'fever-bars', 'jsa-fever-bars'); stage.append(bars);
  for (let i = 0; i < 7; i++) {
    const bar = element('div', 'fever-bar', 'jsa-fever-bar'); bars.append(bar);
    gsap.set(bar, { opacity: 0 }); fade(tl, bar, 0, .8, i * .03, .12);
    if (!p.reducedMotion) { gsap.set(bar, { scaleX: 0 }); tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: .4, ease: 'expo.out', immediateRender: false }, i * .03); }
  }
  const content = element('div', 'scene-content', 'jsa-centered'); stage.append(content);
  const eyebrow = copy(content, 'scene-eyebrow', 'p', 'THE HOUSE CANNOT CONTAIN YOU', 'jsa-eyebrow');
  const title = copy(content, 'scene-title', 'h1', 'FEVER', 'jsa-giant');
  const detail = copy(content, 'scene-detail', 'p', 'OVERVOLT / SYSTEM UNBOUND', 'jsa-mono');
  entrance(tl, eyebrow, .04, .2, p.reducedMotion, -20); entrance(tl, title, .08, .45, p.reducedMotion, 45); entrance(tl, detail, .3, .25, p.reducedMotion);
  fade(tl, content, 1, 0, .82, .18); fade(tl, bars, 1, 0, .8, .2);
  return finish(tl);
};
