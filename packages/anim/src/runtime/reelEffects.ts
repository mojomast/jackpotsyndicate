import { gsap } from 'gsap';
import type { Cell, DesignTokens, FloorId, LineWinParams } from '../contracts-shim';
import { anchor, anchors, element, fade, initial, seeded } from './dom';

export function prepareEffects(root: HTMLElement, reduced: boolean, tokens: DesignTokens, floor?: FloorId, grain = true): void {
  root.dataset.motion = reduced ? 'reduced' : 'full'; root.dataset.grain = String(grain && !reduced);
  root.style.setProperty('--jsa-accent', floor === 'FLOOR_CRYO' ? tokens.color.cyan : floor === 'FLOOR_FOUNDRY' ? tokens.color.crimson : floor === 'FLOOR_PENTHOUSE' ? tokens.color.gold : tokens.color.emerald);
  for (const name of ['win-vfx', 'particle', 'symbol-sheen', 'arc-defs']) for (const node of anchors(root, name)) node.remove();
  for (const name of ['symbol', 'cell', 'cell-glow', 'grid', 'reel-window', 'reel-divider', 'win-tier']) {
    for (const node of anchors(root, name)) gsap.set(node, { clearProps: 'transform,filter,opacity' });
  }
  for (const node of anchors(root, 'cell-glow')) node.style.opacity = '0';
  for (const node of anchors(root, 'reel-divider')) node.style.opacity = '0';
  anchor(root, 'win-tier').style.opacity = '0';
  anchor(root, 'light-rig').style.cssText = '--jsa-light-hue:0deg;--jsa-light-intensity:.16;--jsa-sweep-angle:-24deg';
}

export function lightRig(tl: gsap.core.Timeline, root: HTMLElement, duration: number, reduced: boolean): void {
  const rig = anchor(root, 'light-rig');
  tl.fromTo(rig, { '--jsa-light-intensity': .16 }, { '--jsa-light-intensity': .24, duration: duration * .6, ease: 'sine.inOut', immediateRender: false }, 0);
  tl.fromTo(rig, { '--jsa-light-intensity': .24 }, { '--jsa-light-intensity': .16, duration: duration * .4, ease: 'sine.inOut', immediateRender: false }, duration * .6);
  if (!reduced) tl.fromTo(rig, { '--jsa-sweep-angle': '-24deg', '--jsa-light-hue': '0deg' }, { '--jsa-sweep-angle': '32deg', '--jsa-light-hue': '8deg', duration, ease: 'none', immediateRender: false }, 0);
}

export function winTier(p: LineWinParams): 'small' | 'big' | 'mega' | 'jackpot' {
  if (p.winTier) return p.winTier;
  const equity = p.equity ?? p.wins.reduce((n, w) => n + w.cells.length * (w.overvolt ? 100 : 15), 0);
  return equity >= 5000 ? 'jackpot' : equity >= 1000 ? 'mega' : equity >= 250 ? 'big' : 'small';
}

/** Constants sampled once; every displacement is a closed-form function of u. */
export function particles(tl: gsap.core.Timeline, root: HTMLElement, seed: number, count: number, origin: Cell, size: { cols: number; rows: number }, start: number, duration: number): void {
  const layer = anchor(root, 'cell-effects'), random = seeded(seed);
  for (let i = 0; i < Math.min(count, 48); i++) {
    const node = element('i', 'particle', 'jsa-particle');
    node.dataset.kind = i % 3 ? 'spark' : 'coin';
    node.style.left = `${(origin[0] + .5) * 100 / size.cols}%`; node.style.top = `${(origin[1] + .5) * 100 / size.rows}%`;
    const vx = (random() - .5) * 220, vy = -35 - random() * 90, gravity = 420;
    const d = Math.max(.1, duration * (.7 + random() * .3));
    node.dataset.trajectory = [vx, vy, gravity, d].map(n => n.toFixed(4)).join(',');
    layer.append(node);
    const at = start + i % 4 * .012;
    // One numeric tween drives a pure analytical renderer. Property setters run
    // even when the host suppresses timeline callbacks during arbitrary seeking.
    let progress = 0;
    const state = {
      get progress() { return progress; },
      set progress(u: number) {
        progress = u; const t = u * d;
        node.style.transform = `translate3d(${(vx * t).toFixed(4)}px,${(vy * t + .5 * gravity * t * t).toFixed(4)}px,0) rotate(${(vx * 2 * u).toFixed(4)}deg)`;
        node.style.opacity = String(Math.max(0, Math.min(1, u / .12, (1 - u) / .55)) * .8);
      },
    };
    state.progress = 0;
    tl.fromTo(state, { progress: 0 }, { progress: 1, duration: d, ease: 'none', immediateRender: false }, at);
  }
}

export function sheen(tl: gsap.core.Timeline, cell: HTMLElement, start: number, duration: number): void {
  const mask = element('div', 'symbol-sheen', 'jsa-sheen'), light = element('div', 'sheen-light', 'jsa-sheen-light');
  mask.append(light); cell.append(mask); initial(tl, mask, { opacity: 0 }); initial(tl, light, { xPercent: -100 });
  fade(tl, mask, 0, .35, start, duration * .2); fade(tl, mask, .35, 0, start + duration * .6, duration * .4);
  tl.fromTo(light, { xPercent: -100 }, { xPercent: 100, duration, ease: 'power1.inOut', immediateRender: false }, start);
}
