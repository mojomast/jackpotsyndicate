import { gsap } from 'gsap';
import { reelSpin, lineWin, gridRelayout, fever, bossIntro, floorTransition, victory, createCabinet, setCabinetGrid, DEFAULT_TOKENS, defaultSpriteResolver } from '../../src';
import type { ReelSpinParams, LineWinParams, GridRelayoutParams, BossIntroParams, FloorTransitionParams } from '../../src';
import spinParams from '../../fixtures/reelSpin.json';
import winParams from '../../fixtures/lineWin.json';
import weldParams from '../../fixtures/gridRelayout.json';
import feverParams from '../../fixtures/fever.json';
import bossParams from '../../fixtures/bossIntro.json';
import floorParams from '../../fixtures/floorTransition.json';
import victoryParams from '../../fixtures/victory.json';
import { register } from '../register';
import '../style.css';

const root = document.querySelector<HTMLElement>('#composition')!;
const node = (name: string) => root.querySelector<HTMLElement>('[data-anim="' + name + '"]')!;
const tokens = DEFAULT_TOKENS, sprites = defaultSpriteResolver;
const tl = gsap.timeline({ paused: true, defaults: { lazy: false } });
tl.to({}, { duration: 24 }, 0);
const shots = [...root.querySelectorAll<HTMLElement>('[data-anim="shot"]')];
const starts = [0, 3, 5.5, 6.5, 9, 10, 14, 18], ends = [3, 5.5, 6.5, 9, 10, 14, 18, 24];
shots.forEach((shot, i) => {
  gsap.set(shot, { opacity: i === 0 ? 1 : 0 });
  if (i) tl.fromTo(shot, { opacity: 0 }, { opacity: 1, duration: 0, immediateRender: false }, starts[i]!);
  if (i < shots.length - 1) tl.fromTo(shot, { opacity: 1 }, { opacity: 0, duration: 0, immediateRender: false }, ends[i]!);
});
tl.fromTo(node('title'), { y: 35, opacity: 0 }, { y: 0, opacity: 1, duration: .9, ease: 'power4.out', immediateRender: false }, .12);
tl.fromTo(node('subtitle'), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: .65, ease: 'power3.out', immediateRender: false }, .55);
tl.fromTo(node('mark'), { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: 'power3.out', immediateRender: false }, .25);
const add = (child: gsap.core.Timeline, at: number) => { tl.add(child.paused(false), at); };
add(reelSpin(node('spin-root'), spinParams as ReelSpinParams, tokens, sprites), 3);
for (const name of ['win-root', 'weld-root']) { createCabinet(node(name), { cols: 3, rows: 3 }, tokens, sprites); setCabinetGrid(node(name), (spinParams as ReelSpinParams).finalGrid, tokens, sprites); }
add(lineWin(node('win-root'), winParams as LineWinParams, tokens, sprites), 5.5);
add(gridRelayout(node('weld-root'), weldParams as GridRelayoutParams, tokens, sprites), 6.5);
add(fever(node('fever-root'), feverParams, tokens, sprites), 9);
add(bossIntro(node('boss-root'), bossParams as BossIntroParams, tokens, sprites), 10);
add(floorTransition(node('floor-root'), floorParams as FloorTransitionParams, tokens, sprites), 14);
add(victory(node('victory-root'), victoryParams, tokens, sprites), 18);
tl.totalTime(24, true).totalTime(0, true).pause();
register('trailer', tl);
