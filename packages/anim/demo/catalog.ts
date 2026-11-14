import * as anim from '../src';
import type { gsap } from 'gsap';
import type { FactoryName, FactoryParams, TimelineFactory } from '../src';
import reelSpin from '../fixtures/reelSpin.json';
import lineWin from '../fixtures/lineWin.json';
import tumbleStep from '../fixtures/tumbleStep.json';
import gridRelayout from '../fixtures/gridRelayout.json';
import fever from '../fixtures/fever.json';
import bossIntro from '../fixtures/bossIntro.json';
import floorTransition from '../fixtures/floorTransition.json';
import victory from '../fixtures/victory.json';
import gameOver from '../fixtures/gameOver.json';

export const fixtures = { reelSpin, lineWin, tumbleStep, gridRelayout, fever, bossIntro, floorTransition, victory, gameOver } as FactoryParams;
export const names = Object.keys(fixtures) as FactoryName[];
export function mount<N extends FactoryName>(root: HTMLElement, name: N, params: FactoryParams[N]) {
  root.replaceChildren();
  if (['lineWin', 'tumbleStep'].includes(name)) {
    const size = params as FactoryParams['lineWin'];
    anim.createCabinet(root, size, anim.DEFAULT_TOKENS, anim.defaultSpriteResolver);
    if (size.cols === 3 && size.rows === 3) anim.setCabinetGrid(root, fixtures.reelSpin.finalGrid, anim.DEFAULT_TOKENS, anim.defaultSpriteResolver);
  }
  return (anim[name] as TimelineFactory<FactoryParams[N], gsap.core.Timeline>)(root, params, anim.DEFAULT_TOKENS, anim.defaultSpriteResolver);
}
