import { gsap } from 'gsap';
import type { Cell, DesignTokens, GridSize, SymbolId } from '../contracts-shim';
import { SYMBOL_IDS, TICKS_PER_SECOND } from '../contracts-shim';

export function anchor<T extends Element = HTMLElement>(root: HTMLElement, name: string): T {
  const element = root.querySelector<T>('[data-anim="' + name + '"]');
  if (!element) throw new Error(`Missing animation anchor: ${name}`);
  return element;
}
export function anchors<T extends Element = HTMLElement>(root: HTMLElement, name: string): T[] {
  return [...root.querySelectorAll<T>('[data-anim="' + name + '"]')];
}
export function element(tag: string, name: string, className = ''): HTMLElement {
  const node = document.createElement(tag); node.dataset.anim = name; node.className = className; return node;
}
export function svgNode(tag: string, name: string): SVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag); node.setAttribute('data-anim', name); return node;
}
/** Stable per-host scope, including simultaneous cabinets in compositions. */
export function effectScope(root: HTMLElement): string {
  const path: number[] = []; let node: Element | null = root;
  while (node?.parentElement) { path.push([...node.parentElement.children].indexOf(node)); node = node.parentElement; }
  return `${root.id || root.dataset.anim || 'cabinet'}-${path.join('-')}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}
export function applyTokens(root: HTMLElement, tokens: DesignTokens): void {
  root.classList.add('jsa-root');
  for (const [key, value] of Object.entries(tokens.color)) root.style.setProperty(`--jsa-${key}`, value);
  for (const [key, value] of Object.entries(tokens.font)) root.style.setProperty(`--jsa-font-${key}`, `'${value}'`);
}
export function validateSize(size: GridSize): void {
  if (![3, 4, 5].includes(size.cols) || ![3, 4].includes(size.rows)) throw new Error('Grid must be 3–5 columns by 3–4 rows.');
}
export function validateGrid(grid: SymbolId[][], size: GridSize): void {
  validateSize(size);
  if (grid.length !== size.cols || grid.some(col => col.length !== size.rows || col.some(id => !SYMBOL_IDS.includes(id)))) throw new Error('Invalid column-major symbol grid.');
}
export function validateCells(cells: Cell[], size: GridSize): void {
  for (const [col, row] of cells) if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || col >= size.cols || row < 0 || row >= size.rows) throw new Error('Cell outside cabinet.');
}
export function cellAt(root: HTMLElement, [col, row]: Cell): HTMLElement {
  const cell = anchors(root, 'cell').find(node => Number(node.dataset.col) === col && Number(node.dataset.row) === row);
  if (!cell) throw new Error(`Missing cell ${col},${row}`);
  return cell;
}
export function positionCell(node: HTMLElement, col: number, row: number, size: GridSize): void {
  Object.assign(node.style, { left: `${100 * col / size.cols}%`, top: `${100 * row / size.rows}%`, width: `${100 / size.cols}%`, height: `${100 / size.rows}%` });
}
export function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value += 0x6d2b79f5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function ticks(n: number): number { return n / TICKS_PER_SECOND; }
export function timeline(root: HTMLElement, durationTicks: number): gsap.core.Timeline {
  const clock = element('span', 'duration', 'jsa-duration'); root.append(clock);
  const tl = gsap.timeline({ paused: true, defaults: { lazy: false } });
  hosts.set(tl, root);
  tl.fromTo(clock, { opacity: 0 }, { opacity: 0, duration: ticks(durationTicks), immediateRender: false, ease: 'none' }, 0);
  return tl;
}
const staged = new WeakMap<gsap.core.Timeline, { target: gsap.TweenTarget; values: gsap.TweenVars }[]>();
const hosts = new WeakMap<gsap.core.Timeline, HTMLElement>();
/** Defer style initialization until every layer has been mounted. */
export function initial(tl: gsap.core.Timeline, target: gsap.TweenTarget, values: gsap.TweenVars): void {
  const entries = staged.get(tl) ?? []; entries.push({ target, values }); staged.set(tl, entries);
}
export function finish(tl: gsap.core.Timeline): gsap.core.Timeline {
  const entries = staged.get(tl);
  let detached: HTMLElement | undefined, marker: Comment | undefined;
  if (entries) {
    // Batch all transform reads before any writes. GSAP then uses its cache.
    const targets = new Set<Element>();
    for (const entry of entries) if (Object.keys(entry.values).some(key => /^(x|y|z|rotation|scale|transform)/.test(key))) {
      for (const target of gsap.utils.toArray<Element>(entry.target)) if (target instanceof HTMLElement) targets.add(target);
    }
    for (const target of targets) gsap.getProperty(target, 'x');
    const host = hosts.get(tl);
    if (host?.parentNode) {
      // Transform caches are ready. Initialize explicit tween values off-document
      // so CSSPlugin's remaining computed-style reads cannot flush live layout.
      detached = host; marker = document.createComment('animation-init'); host.replaceWith(marker);
    }
  }
  try {
    if (entries) {
    for (const entry of entries) gsap.set(entry.target, entry.values);
    staged.delete(tl);
    }
    // Eagerly initializes every tween and canonicalizes property order before return.
    tl.totalTime(tl.duration(), true); tl.totalTime(0, true); tl.pause(); return tl;
  } finally {
    if (detached && marker) marker.replaceWith(detached);
  }
}
export function fade(tl: gsap.core.Timeline, target: gsap.TweenTarget, from: number, to: number, start: number, duration: number): void {
  tl.fromTo(target, { opacity: from }, { opacity: to, duration, immediateRender: false, ease: 'none' }, start);
}
export function clearTransient(root: HTMLElement): void {
  for (const name of ['duration', 'reel-stream', 'win-path', 'drop-symbol', 'tumble-symbol', 'relayout-previous', 'weld-spark']) for (const node of anchors(root, name)) node.remove();
}
