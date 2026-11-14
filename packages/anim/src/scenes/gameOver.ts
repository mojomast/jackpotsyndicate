import { gsap } from 'gsap';
import type { GameOverParams, TimelineFactory } from '../contracts-shim';
import { SCENE_TICKS } from '../contracts-shim';
import { element, fade, finish, timeline } from '../runtime/dom';
import { copy, entrance, scene } from './layout';

export const gameOver: TimelineFactory<GameOverParams, gsap.core.Timeline> = (root, p, tokens) => {
  if (!Number.isInteger(p.round) || p.round < 0) throw new Error('round must be a non-negative integer.');
  const stage = scene(root, tokens, 'gameover'), tl = timeline(root, SCENE_TICKS.gameOver);
  const line = element('div', 'gameover-line', 'jsa-gameover-line'); stage.append(line);
  gsap.set(line, { opacity: 0 }); fade(tl, line, 0, 1, .05, .15);
  if (!p.reducedMotion) { gsap.set(line, { scaleX: 0 }); tl.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: .65, ease: 'power3.inOut', immediateRender: false }, .05); }
  const content = element('div', 'scene-content', 'jsa-centered'); stage.append(content);
  const eyebrow = copy(content, 'scene-eyebrow', 'p', 'THE HOUSE COLLECTS', 'jsa-eyebrow');
  const title = copy(content, 'scene-title', 'h1', 'BUSTED.', 'jsa-giant');
  const detail = copy(content, 'scene-detail', 'p', `${p.floorName} / ROUND ${p.round}`, 'jsa-description');
  const seed = copy(content, 'seed-text', 'p', `RUN SEED / ${p.seedText}`, 'jsa-seed');
  entrance(tl, eyebrow, .2, .4, p.reducedMotion, -15); entrance(tl, title, .35, .6, p.reducedMotion, 45);
  entrance(tl, detail, .8, .4, p.reducedMotion, 15); entrance(tl, seed, 1.1, .4, p.reducedMotion, 10);
  return finish(tl);
};
