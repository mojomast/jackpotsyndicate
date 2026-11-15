import { gsap } from 'gsap';
import { createCabinet, setCabinetGrid, reelSpin, lineWin, tumbleStep, gridRelayout, DESIGN_TOKENS } from '../../src';
import type { Cell, LineWinParams, ReelSpinParams, SymbolId } from '../../src';
import { reelArt } from '../reel-art';
import { register } from '../register';
import '../style.css';
import './style.css';

const root = document.querySelector<HTMLElement>('#composition')!;
const node = (name: string) => root.querySelector<HTMLElement>('[data-anim="' + name + '"]')!;
const tl = gsap.timeline({ paused: true, defaults: { lazy: false } }); tl.to({}, { duration: 18 }, 0);
const starts = [0, 3, 6, 9, 12, 14.5, 16], ends = [...starts.slice(1), 18];
for (const [i, shot] of [...root.querySelectorAll<HTMLElement>('[data-anim="shot"]')].entries()) {
  gsap.set(shot, { opacity: i ? 0 : 1 });
  if (i) tl.fromTo(shot, { opacity: 0 }, { opacity: 1, duration: 0, immediateRender: false }, starts[i]!);
  if (i < starts.length - 1) tl.fromTo(shot, { opacity: 1 }, { opacity: 0, duration: 0, immediateRender: false }, ends[i]!);
  const heading = shot.querySelector('h1');
  tl.fromTo(heading, { opacity: .4, y: 12 }, { opacity: 1, y: 0, duration: .32, immediateRender: false, ease: 'power3.out' }, starts[i]!);
}
const add = (child: gsap.core.Timeline, at: number) => tl.add(child.paused(false), at);
const grid = (cols: number, rows: number): SymbolId[][] => Array.from({ length: cols }, (_, c) => Array.from({ length: rows }, (_, r) => ['diamond', 'cherry', 'uranium', 'skull', 'seven'][(c + r) % 5] as SymbolId));
function mount(name: string, symbols: SymbolId[][]) {
  const host = node(name); createCabinet(host, { cols: symbols.length, rows: symbols[0]!.length }, DESIGN_TOKENS, reelArt); setCabinetGrid(host, symbols, DESIGN_TOKENS, reelArt); return host;
}
function spin(name: string, symbols: SymbolId[][], at: number, wiring: ReelSpinParams['wiring'] = 'CLASSIC') {
  add(reelSpin(node(name), { cols: symbols.length, rows: symbols[0]!.length, finalGrid: symbols, reducedMotion: false, seed: 714, wiring }, DESIGN_TOKENS, reelArt), at);
}
function win(name: string, symbols: SymbolId[][], wins: LineWinParams['wins'], tier: NonNullable<LineWinParams['winTier']>, at: number) {
  add(lineWin(mount(name, symbols), { cols: symbols.length, rows: symbols[0]!.length, wins, winTier: tier, seed: 714, reducedMotion: false }, DESIGN_TOKENS, reelArt), at);
}
function swap(before: string, after: string, at: number) {
  gsap.set(node(after), { opacity: 0 });
  tl.fromTo(node(before), { opacity: 1 }, { opacity: 0, duration: 0, immediateRender: false }, at);
  tl.fromTo(node(after), { opacity: 0 }, { opacity: 1, duration: 0, immediateRender: false }, at);
}
const classic = grid(3, 3); classic.forEach(c => { c[1] = 'seven'; });
spin('classic-spin', classic, .15); win('classic-win', classic, [{ kind: 'line', cells: [[0, 1], [1, 1], [2, 1]] }], 'small', 1.15); swap('classic-spin', 'classic-win', 1.15);
const hyper = grid(5, 3), v: Cell[] = [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]], iv: Cell[] = [[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]];
[...v, ...iv].forEach(([c, r]) => { hyper[c]![r] = 'diamond'; });
spin('hyper-spin', hyper, 3, 'HYPER'); win('hyper-win', hyper, [{ kind: 'line', cells: v, overvolt: true }, { kind: 'line', cells: iv }], 'big', 4.4); swap('hyper-spin', 'hyper-win', 4.4);
const ways = grid(5, 4), web: Cell[] = Array.from({ length: 10 }, (_, i) => [Math.floor(i / 2), 1 + i % 2]);
web.forEach(([c, r]) => { ways[c]![r] = 'uranium'; }); win('ways-win', ways, [{ kind: 'ways', cells: web }], 'mega', 6.35);
const jackpot = grid(5, 3), row: Cell[] = Array.from({ length: 5 }, (_, c) => [c, 1]); row.forEach(([c, r]) => { jackpot[c]![r] = 'seven'; });
win('jackpot-win', jackpot, [{ kind: 'line', cells: row }], 'jackpot', 9.35);
const near = grid(5, 3); near.forEach((c, i) => { c[1] = i === 4 ? 'cherry' : 'seven'; }); spin('near-spin', near, 12.35);
const cluster = grid(3, 3), region: Cell[] = [[0, 0], [1, 0], [0, 1], [1, 1], [1, 2]]; region.forEach(([c, r]) => { cluster[c]![r] = 'cherry'; });
win('cluster-win', cluster, [{ kind: 'cluster', cells: region }], 'big', 14.5);
add(tumbleStep(mount('cluster-tumble', cluster), { cols: 3, rows: 3, cleared: region, gridAfter: grid(3, 3), seed: 714, reducedMotion: false }, DESIGN_TOKENS, reelArt), 14.85); swap('cluster-win', 'cluster-tumble', 14.85);
mount('relayout-root', classic); add(gridRelayout(node('relayout-root'), { from: { cols: 3, rows: 3 }, to: { cols: 5, rows: 4 }, reducedMotion: false }, DESIGN_TOKENS, reelArt), 16);
tl.totalTime(18, true).totalTime(0, true).pause(); register('reelShowcase', tl);
