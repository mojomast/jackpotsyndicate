/**
 * Debug viewer for the physics package. Not the game renderer: it exists so a
 * human can judge the feel of the pinfield and pusher, and it sketches the
 * 2.5D look (perspective shelf, coin thickness, stacks, shadows, tumbling
 * exits) that the real board renderer should deliver from the same snapshot.
 */
import { BOARD, DEFAULT_MODIFIERS } from '@jackpotsyndicate/contracts';
import type { PhysicsEvent, PhysicsModifiers, SimSnapshot } from '@jackpotsyndicate/contracts';
import { createSimWorld, Prng } from '@jackpotsyndicate/physics';
import { FLOORS } from '../physics-harness/floors';
import { ORBS, runSpins, seedShelf, TOKENS } from '../physics-harness/lib';

const COLORS: Record<string, string> = { diamond: '#06b6d4', cherry: '#f43f5e', uranium: '#10b981', skull: '#a855f7', seven: '#fbbf24', scrap: '#b45309', ice: '#bae6fd' };
const canvas = document.getElementById('c') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;
const ui = new Prng(77); // viewer-only randomness, never touches the sim

let floorIdx = 0;
let mods: PhysicsModifiers = { ...DEFAULT_MODIFIERS };
let world = createSimWorld(1);
let speed = 1;
let auto = true;
let stats = { lip: 0, gutter: 0 };
const falling: { x: number; y: number; vx: number; vy: number; r: number; c: string; life: number; stack: number; gutter: boolean }[] = [];

function reset(seed = 1) {
  world = createSimWorld(seed);
  world.configure(FLOORS[floorIdx]!.physics, mods, true);
  seedShelf(world);
  stats = { lip: 0, gutter: 0 };
}
function spin() {
  const n = 2 + Math.floor(ui.next() * 4);
  const syms = ['cherry', 'cherry', 'diamond', 'skull', 'uranium', 'seven', 'scrap'];
  for (let k = 0; k < n; k++) world.launchOrb({ ...ORBS[syms[Math.floor(ui.next() * syms.length)]!]!, x: 60 + ui.next() * 480 });
}

// ---- 2.5D projection of the shelf: far edge (blade) narrow and high, lip wide and low.
const SHELF_TOP = BOARD.SPLIT_Y;
function proj(x: number, y: number) {
  if (y <= SHELF_TOP) return { x, y, s: 0.8 };
  const d = (y - SHELF_TOP) / (BOARD.H - SHELF_TOP); // 0 far .. 1 near
  const s = 0.8 + 0.28 * d;
  return { x: 300 + (x - 300) * s, y: SHELF_TOP + (y - SHELF_TOP) * (0.78 + 0.22 * d), s };
}
function coin(x: number, y: number, r: number, color: string, stack: number, lift: number, welded: boolean, alpha = 1) {
  const p = proj(x, y);
  const rx = r * p.s, ry = r * p.s * 0.58, th = 3.2 * p.s;
  g.globalAlpha = alpha * 0.35;
  g.fillStyle = '#000';
  g.beginPath(); g.ellipse(p.x + 2, p.y + 3, rx, ry, 0, 0, 7); g.fill();
  g.globalAlpha = alpha;
  const top = p.y - lift * 2.5;
  for (let k = 0; k < stack; k++) {
    const cy = top - k * th;
    g.fillStyle = shade(color, -45);
    g.beginPath(); g.ellipse(p.x, cy, rx, ry, 0, 0, 7); g.fill();
    g.fillRect(p.x - rx, cy - th, rx * 2, th);
    g.fillStyle = color;
    g.beginPath(); g.ellipse(p.x, cy - th, rx, ry, 0, 0, 7); g.fill();
    g.strokeStyle = welded ? '#fff' : shade(color, 50);
    g.lineWidth = welded ? 1.6 : 0.8;
    g.stroke();
  }
  g.globalAlpha = 1;
}
function shade(hex: string, d: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + d));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
function quad(x0: number, y0: number, x1: number, y1: number, fill: string) {
  const a = proj(x0, y0), b = proj(x1, y0), c = proj(x1, y1), d = proj(x0, y1);
  g.fillStyle = fill; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fill();
}

function draw(s: SimSnapshot) {
  g.fillStyle = '#07090e'; g.fillRect(0, 0, 600, 560);
  // pinfield (flat, behind glass)
  const cw = 120, mults = ['x0.8', 'x1.5', 'x3.0', 'x1.5', 'x2.0'];
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = ['#64748b', '#06b6d4', '#fbbf24', '#06b6d4', '#10b981'][i]!;
    g.strokeRect(i * cw + 2, BOARD.SPLIT_Y - 26, cw - 4, 24);
    g.fillStyle = '#e2e8f0'; g.font = '10px monospace'; g.textAlign = 'center'; g.fillText(mults[i]!, i * cw + 60, BOARD.SPLIT_Y - 10);
  }
  for (const p of s.pegs) {
    g.fillStyle = p.kind === 'splitter' ? '#06b6d4' : p.kind === 'bumper' ? '#f43f5e' : p.kind === 'golden' ? '#fde047' : '#fbbf24';
    g.beginPath(); g.arc(p.x, p.y, p.radius + (p.flash > 0 ? 2 : 0), 0, 7); g.fill();
  }
  for (const o of s.orbs) {
    g.fillStyle = '#0f172a'; g.strokeStyle = COLORS[o.symbolId] ?? '#fff'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(o.x, o.y, o.radius, 0, 7); g.fill(); g.stroke();
  }
  // shelf
  const L = BOARD.GUTTER_W, R = BOARD.W - BOARD.GUTTER_W, bevel = bevelWidth();
  quad(0, SHELF_TOP, L, BOARD.LIP_Y, '#2a0f1a'); quad(R, SHELF_TOP, 600, BOARD.LIP_Y, '#2a0f1a');
  quad(L, SHELF_TOP, R, BOARD.LIP_Y, '#16203a');
  quad(L, SHELF_TOP, L + bevel, BOARD.LIP_Y, '#231a33'); quad(R - bevel, SHELF_TOP, R, BOARD.LIP_Y, '#231a33');
  quad(L, BOARD.LIP_Y, R, BOARD.H, '#0c3b2e');
  quad(L + 2, SHELF_TOP, R - 2, s.dozer.frontY, s.dozer.surging ? '#fb923c' : '#d97706');
  quad(L + 2, s.dozer.frontY - 5, R - 2, s.dozer.frontY, '#fde68a');
  for (const t of [...s.tokens].sort((a, b) => a.y - b.y || a.id - b.id)) coin(t.x, t.y, t.radius, COLORS[t.symbolId] ?? '#fbbf24', t.stack, t.lift, t.welded);
  for (const f of falling) coin(f.x, f.y, f.r, f.c, f.stack, 0, false, Math.max(0, f.life / 26));
  g.fillStyle = '#94a3b8'; g.font = '11px monospace'; g.textAlign = 'left';
  const total = stats.lip + stats.gutter;
  g.fillText(`${FLOORS[floorIdx]!.id}  tick ${s.tick}  tokens ${s.tokens.length}  orbs ${s.orbs.length}  lip ${stats.lip}  gutter ${stats.gutter}  rake ${total ? ((100 * stats.gutter) / total).toFixed(1) : '0'}%`, 8, 548);
}
function bevelWidth() { const r = FLOORS[floorIdx]!.physics.gutterRisk; return 26 * r * r; }

function onEvent(e: PhysicsEvent) {
  if (e.t === 'LipDrop' || e.t === 'GutterLoss') {
    if (e.t === 'LipDrop') stats.lip++; else stats.gutter++;
    falling.push({ x: e.x, y: e.y, vx: e.vx, vy: e.t === 'LipDrop' ? Math.max(1, e.vy) : 0.5, r: e.radius, c: e.t === 'LipDrop' ? COLORS[e.symbolId] ?? '#fbbf24' : '#7f1d1d', life: 26, stack: e.stack, gutter: e.t === 'GutterLoss' });
  }
}
let frame = 0;
function loop() {
  for (let k = 0; k < speed; k++) {
    if (auto && world.tick % 190 === 0) spin();
    for (const e of world.step()) onEvent(e);
  }
  for (let i = falling.length - 1; i >= 0; i--) { const f = falling[i]!; f.vy += 0.35; f.x += f.vx; f.y += f.vy; if (--f.life <= 0) falling.splice(i, 1); }
  draw(world.snapshot());
  frame++;
  requestAnimationFrame(loop);
}
const $ = (id: string) => document.getElementById(id)!;
$('spin').onclick = spin;
$('surge').onclick = () => world.applyDirective({ t: 'surge' });
$('ice').onclick = () => world.applyDirective({ t: 'dropIceBlocks', count: 2 });
$('suction').onclick = () => { mods = { ...mods, suction: mods.suction ? 0 : 1 }; world.setModifiers(mods); $('suction').textContent = `Boss suction: ${mods.suction ? 'on' : 'off'}`; };
$('auto').onclick = () => { auto = !auto; $('auto').textContent = `Auto-spin: ${auto ? 'on' : 'off'}`; };
$('speed').onclick = () => { speed = speed === 1 ? 4 : speed === 4 ? 16 : 1; $('speed').textContent = `Speed ${speed}x`; };
$('floor').onclick = () => { floorIdx = (floorIdx + 1) % FLOORS.length; reset(); $('floor').textContent = FLOORS[floorIdx]!.id; };
$('reset').onclick = () => reset();
(window as any).__sim = {
  get world() { return world; },
  reset,
  /** Same scenario as the 'golden hash' unit test; lets a browser be checked against Node. */
  goldenHash() {
    const w = createSimWorld(2026);
    w.configure(FLOORS[0]!.physics, DEFAULT_MODIFIERS, true);
    seedShelf(w);
    runSpins(w, 60, 14);
    return w.hash();
  },
};
reset();
loop();
