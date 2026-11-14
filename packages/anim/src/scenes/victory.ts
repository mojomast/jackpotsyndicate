import { gsap } from 'gsap';
import type { TimelineFactory, VictoryParams } from '../contracts-shim';
import { SCENE_TICKS } from '../contracts-shim';
import { element, fade, finish, timeline } from '../runtime/dom';
import { copy, entrance, scene } from './layout';

export const victory: TimelineFactory<VictoryParams, gsap.core.Timeline> = (root, p, tokens) => {
  if (!Number.isFinite(p.bankroll) || p.bankroll < 0) throw new Error('bankroll must be a finite non-negative number.');
  const stage = scene(root, tokens, 'victory'), tl = timeline(root, SCENE_TICKS.victory);
  const rays = element('div', 'victory-rays', 'jsa-victory-rays'); stage.append(rays);
  for (let i = 0; i < 12; i++) {
    const ray = element('div', 'victory-ray', 'jsa-victory-ray'); ray.style.left = `${5 + i * 8}%`; rays.append(ray);
    gsap.set(ray, { opacity: 0 }); fade(tl, ray, 0, .55, .1 + i * .025, .25);
    if (!p.reducedMotion) { gsap.set(ray, { scaleY: 0 }); tl.fromTo(ray, { scaleY: 0 }, { scaleY: 1, duration: .8, immediateRender: false, ease: 'power3.out' }, .1 + i * .025); }
    fade(tl, ray, .55, .1, 1.2, .5);
  }
  const content = element('div', 'scene-content', 'jsa-centered'); stage.append(content);
  const eyebrow = copy(content, 'scene-eyebrow', 'p', 'THE SYNDICATE HAS FALLEN', 'jsa-eyebrow');
  const title = copy(content, 'scene-title', 'h1', 'HOUSE\nBROKEN.', 'jsa-giant jsa-victory-title');
  const bank = copy(content, 'bankroll', 'div', Math.floor(p.bankroll).toLocaleString('en-US'), 'jsa-bankroll');
  const detail = copy(content, 'scene-detail', 'p', 'BANKROLL SECURED', 'jsa-mono');
  const seed = copy(content, 'seed-text', 'p', `RUN SEED / ${p.seedText}`, 'jsa-seed');
  entrance(tl, eyebrow, .08, .35, p.reducedMotion, -25);
  entrance(tl, title, .16, .7, p.reducedMotion, 55); entrance(tl, bank, .72, .65, p.reducedMotion, 25);
  entrance(tl, detail, .95, .35, p.reducedMotion, 10); entrance(tl, seed, 1.15, .4, p.reducedMotion, 10);
  return finish(tl);
};
