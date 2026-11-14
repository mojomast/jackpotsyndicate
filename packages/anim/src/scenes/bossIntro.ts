import { gsap } from 'gsap';
import type { BossIntroParams, TimelineFactory } from '../contracts-shim';
import { SCENE_TICKS } from '../contracts-shim';
import { element, fade, finish, timeline } from '../runtime/dom';
import { sprite } from '../runtime/sprites';
import { copy, entrance, scene } from './layout';

export const bossIntro: TimelineFactory<BossIntroParams, gsap.core.Timeline> = (root, p, tokens, sprites) => {
  const stage = scene(root, tokens, 'boss'), tl = timeline(root, SCENE_TICKS.bossIntro);
  stage.dataset.boss = p.bossId;
  const layout = element('div', 'scene-content', 'jsa-boss-layout'); stage.append(layout);
  const portrait = element('div', 'boss-portrait', 'jsa-boss-portrait'); portrait.append(sprite(`boss.${p.bossId}`, tokens, sprites)); layout.append(portrait);
  const text = element('div', 'boss-copy', 'jsa-boss-copy'); layout.append(text);
  const eyebrow = copy(text, 'scene-eyebrow', 'p', 'SYNDICATE / WANTED DOSSIER', 'jsa-eyebrow');
  const title = copy(text, 'scene-title', 'h1', p.bossName, 'jsa-boss-title');
  const detail = copy(text, 'scene-detail', 'p', p.tagline, 'jsa-description');
  const stamp = copy(text, 'boss-stamp', 'div', 'THE HOUSE PLAYS DIRTY', 'jsa-stamp');
  const slash = element('div', 'boss-slash', 'jsa-boss-slash'); portrait.append(slash);
  entrance(tl, portrait, .08, .65, p.reducedMotion, 80);
  entrance(tl, eyebrow, .2, .35, p.reducedMotion, -20);
  entrance(tl, title, .35, .65, p.reducedMotion, 35);
  entrance(tl, detail, .65, .45, p.reducedMotion, 20);
  entrance(tl, stamp, 1.05, .3, p.reducedMotion, 0);
  if (!p.reducedMotion) { gsap.set(slash, { yPercent: -100 }); tl.fromTo(slash, { yPercent: -100 }, { yPercent: 100, duration: .8, immediateRender: false, ease: 'power1.inOut' }, .2); }
  fade(tl, slash, 0, .9, .2, .12); fade(tl, slash, .9, 0, .85, .15);
  return finish(tl);
};
