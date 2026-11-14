import { gsap } from 'gsap';
import type { DesignTokens } from '../contracts-shim';
import { applyTokens, element, fade } from '../runtime/dom';

export function scene(root: HTMLElement, tokens: DesignTokens, kind: string): HTMLElement {
  applyTokens(root, tokens); const stage = element('section', 'scene', `jsa-scene jsa-${kind}`);
  const grid = element('div', 'scene-grid', 'jsa-scene-grid');
  const orbit = element('div', 'scene-orbit', 'jsa-scene-orbit');
  const edge = element('div', 'scene-edge', 'jsa-scene-edge');
  stage.append(grid, orbit, edge); root.replaceChildren(stage); return stage;
}
export function copy(parent: HTMLElement, name: string, tag: string, text: string, className: string): HTMLElement {
  const node = element(tag, name, className); node.textContent = text; parent.append(node); return node;
}
export function entrance(tl: gsap.core.Timeline, node: HTMLElement, at: number, duration: number, reduced: boolean, y = 30): void {
  gsap.set(node, { opacity: 0 }); fade(tl, node, 0, 1, at, duration);
  if (!reduced) {
    gsap.set(node, { y });
    tl.fromTo(node, { y }, { y: 0, duration, ease: 'power4.out', immediateRender: false }, at);
  }
}
