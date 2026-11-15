/**
 * Procedural art for the 2.5D board.
 *
 * Every texture here is painted once into an offscreen 2D canvas (gradients,
 * soft shadows, rim lights), then uploaded as a Pixi texture. Nothing is
 * fetched: these are the placeholder-safe baseline the scene always has, and
 * atlas art (chip faces) is layered on top when the host supplies it.
 *
 * The static board (`paintStaticBoard`) is likewise one canvas re-painted only
 * when the size or gutter risk changes, so the per-frame cost is sprites only.
 */
import { BOARD, projectShelf } from '@jackpotsyndicate/contracts';
import { bevelWidth, symbolColor } from './shelf';

export type Ctx2D = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  return canvas;
}

function ctxOf(canvas: HTMLCanvasElement): Ctx2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx;
}

export function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Soft white radial glow; tint and blend 'add' at use. */
export function paintGlow(size = 128): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = ctxOf(c);
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Thin soft ring for peg-hit shockwaves and landing puffs. */
export function paintRing(size = 128): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = ctxOf(c);
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, r * 0.55, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Contact shadow: dense core, feathered edge. */
export function paintShadow(size = 96): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = ctxOf(c);
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Glass marble: tinted later; white body with a hot specular and dark rim. */
export function paintOrb(size = 96): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = ctxOf(c);
  const r = size / 2;
  const body = g.createRadialGradient(r * 0.72, r * 0.62, r * 0.05, r, r, r);
  body.addColorStop(0, 'rgba(255,255,255,1)');
  body.addColorStop(0.35, 'rgba(235,235,235,1)');
  body.addColorStop(0.8, 'rgba(120,120,120,1)');
  body.addColorStop(1, 'rgba(40,40,40,1)');
  g.fillStyle = body;
  g.beginPath();
  g.arc(r, r, r - 1, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Specular dot laid untinted over orbs and peg heads. */
export function paintSpecular(size = 64): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = ctxOf(c);
  const r = size / 2;
  const grad = g.createRadialGradient(r * 0.7, r * 0.6, 0, r * 0.7, r * 0.6, r * 0.55);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Brass pin head seen from above, lit from the top left. Tinted per kind. */
export function paintPeg(size = 64): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = ctxOf(c);
  const r = size / 2;
  // drop shadow
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.ellipse(r + r * 0.12, r + r * 0.18, r * 0.8, r * 0.8, 0, 0, Math.PI * 2);
  g.fill();
  const body = g.createRadialGradient(r * 0.7, r * 0.6, r * 0.05, r, r, r * 0.8);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.3, '#e6e6e6');
  body.addColorStop(0.75, '#8a8a8a');
  body.addColorStop(1, '#3a3a3a');
  g.fillStyle = body;
  g.beginPath();
  g.arc(r, r, r * 0.78, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.65)';
  g.lineWidth = size * 0.035;
  g.beginPath();
  g.arc(r, r, r * 0.7, Math.PI * 1.05, Math.PI * 1.6);
  g.stroke();
  return c;
}

const CHIP_RIM: Record<string, [string, string]> = {
  diamond: ['#0e7490', '#67e8f9'],
  cherry: ['#9f1239', '#fda4af'],
  uranium: ['#047857', '#6ee7b7'],
  skull: ['#6b21a8', '#d8b4fe'],
  seven: ['#b45309', '#fde68a'],
  bullion: ['#b45309', '#fde68a'],
  scrap: ['#7c2d12', '#fdba74'],
  copper: ['#7c2d12', '#fdba74'],
  ice: ['#0369a1', '#e0f2fe'],
};

/**
 * Procedural casino chip face (fallback when the atlas token art is not yet
 * decoded). Square texture; the scene squashes it into the shelf's ellipse.
 */
export function paintChipFace(symbolId: string, size = 128): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = ctxOf(c);
  const r = size / 2;
  const base = symbolColor(symbolId);
  const [dark, light] = CHIP_RIM[symbolId] ?? ['#78350f', '#fde68a'];
  const body = g.createRadialGradient(r * 0.75, r * 0.6, r * 0.1, r, r, r);
  body.addColorStop(0, light);
  body.addColorStop(0.55, base);
  body.addColorStop(1, dark);
  g.fillStyle = body;
  g.beginPath();
  g.arc(r, r, r - 1, 0, Math.PI * 2);
  g.fill();
  // edge spots like a real chip
  g.fillStyle = 'rgba(255,248,220,0.85)';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.save();
    g.translate(r + Math.cos(a) * r * 0.82, r + Math.sin(a) * r * 0.82);
    g.rotate(a);
    g.fillRect(-r * 0.06, -r * 0.14, r * 0.12, r * 0.28);
    g.restore();
  }
  // inset ring
  g.strokeStyle = 'rgba(255,240,200,0.75)';
  g.lineWidth = size * 0.03;
  g.beginPath();
  g.arc(r, r, r * 0.6, 0, Math.PI * 2);
  g.stroke();
  const inner = g.createRadialGradient(r * 0.85, r * 0.75, 0, r, r, r * 0.58);
  inner.addColorStop(0, rgba('#ffffff', 0.35));
  inner.addColorStop(1, rgba(dark, 0.6));
  g.fillStyle = inner;
  g.beginPath();
  g.arc(r, r, r * 0.57, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Solid white disc (tinted for coin undersides). */
export function paintDisc(size = 96): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = ctxOf(c);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Cylindrical edge band: dark flanks, lit centre. Tinted per coin. */
export function paintBand(w = 64, h = 8): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = ctxOf(c);
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#3a3a3a');
  grad.addColorStop(0.3, '#d8d8d8');
  grad.addColorStop(0.42, '#ffffff');
  grad.addColorStop(0.75, '#9a9a9a');
  grad.addColorStop(1, '#2e2e2e');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // ridges like a reeded coin edge
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1.5, h);
  return c;
}

/** Vertical fade, opaque at the top: shadows and light beams. */
export function paintFade(w = 8, h = 64, color = '#000000'): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = ctxOf(c);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgba(color, 1));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return c;
}

/** Brass dozer face strip with hazard chevrons and rivets (stretched to width). */
export function paintDozerFace(w = 512, h = 48, surging = false): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = ctxOf(c);
  const grad = g.createLinearGradient(0, 0, 0, h);
  if (surging) {
    grad.addColorStop(0, '#fff1c1');
    grad.addColorStop(0.18, '#fb923c');
    grad.addColorStop(0.7, '#9a3412');
    grad.addColorStop(1, '#3b0d02');
  } else {
    grad.addColorStop(0, '#fff3c4');
    grad.addColorStop(0.16, '#d6a23a');
    grad.addColorStop(0.62, '#7c5212');
    grad.addColorStop(1, '#2a1a05');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // hazard band
  g.save();
  g.beginPath();
  g.rect(0, h * 0.38, w, h * 0.3);
  g.clip();
  g.fillStyle = 'rgba(10,10,14,0.55)';
  for (let x = -h; x < w + h; x += h * 0.7) {
    g.beginPath();
    g.moveTo(x, h * 0.68);
    g.lineTo(x + h * 0.35, h * 0.38);
    g.lineTo(x + h * 0.6, h * 0.38);
    g.lineTo(x + h * 0.25, h * 0.68);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.fillStyle = 'rgba(255,240,190,0.9)';
  for (let x = h * 0.4; x < w; x += w / 9) {
    g.beginPath();
    g.arc(x, h * 0.22, h * 0.055, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** World rectangle (board units) that the scene shows. */
export const WORLD = { x: -32, y: 0, w: 664, h: 540 } as const;

export interface StaticPaintOptions {
  gutterRisk: number;
  chuteMults: readonly number[];
  /** Device pixels per board unit. */
  scale: number;
}

function pp(x: number, y: number): { x: number; y: number } {
  const p = projectShelf(x, y);
  return { x: p.x, y: p.y };
}

function quadPath(g: Ctx2D, x0: number, y0: number, x1: number, y1: number): void {
  const a = pp(x0, y0);
  const b = pp(x1, y0);
  const c = pp(x1, y1);
  const d = pp(x0, y1);
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.lineTo(c.x, c.y);
  g.lineTo(d.x, d.y);
  g.closePath();
}

export function chuteTint(mult: number): string {
  if (mult >= 3) return '#fbbf24';
  if (mult >= 2) return '#10b981';
  if (mult >= 1.2) return '#06b6d4';
  return '#f43f5e';
}

/**
 * Paint everything that does not move: pinfield glass, chute gates, cabinet
 * walls, the perspective shelf, gutters, the bevelled rake strips and the lip.
 * Coordinates are board units; `scale` maps them to device pixels.
 */
export function paintStaticBoard(opts: StaticPaintOptions): HTMLCanvasElement {
  const s = opts.scale;
  const canvas = makeCanvas(WORLD.w * s, WORLD.h * s);
  const g = ctxOf(canvas);
  g.setTransform(s, 0, 0, s, -WORLD.x * s, -WORLD.y * s);

  const split = BOARD.SPLIT_Y;
  const chuteTop = split - BOARD.CHUTE_H;
  const gw = BOARD.GUTTER_W;
  const lipY = BOARD.LIP_Y;
  const bevel = bevelWidth(opts.gutterRisk);

  // ---------------------------------------------------------- pinfield glass
  const glass = g.createLinearGradient(0, 0, 0, chuteTop);
  glass.addColorStop(0, 'rgba(6,9,16,0.50)');
  glass.addColorStop(1, 'rgba(4,6,11,0.72)');
  g.fillStyle = glass;
  g.fillRect(0, 0, BOARD.W, chuteTop);
  // deco sunburst
  g.save();
  g.beginPath();
  g.rect(0, 0, BOARD.W, chuteTop);
  g.clip();
  g.strokeStyle = 'rgba(251,191,36,0.05)';
  g.lineWidth = 1.2;
  for (let i = -12; i <= 12; i++) {
    const a = Math.PI / 2 + (i / 12) * 1.25;
    g.beginPath();
    g.moveTo(300, -30);
    g.lineTo(300 + Math.cos(a) * 700, -30 + Math.sin(a) * 700);
    g.stroke();
  }
  for (let k = 1; k <= 4; k++) {
    g.strokeStyle = `rgba(6,182,212,${0.05 - k * 0.008})`;
    g.beginPath();
    g.arc(300, -30, 70 * k, 0, Math.PI);
    g.stroke();
  }
  // glass sheen
  const sheen = g.createLinearGradient(0, 0, BOARD.W, chuteTop);
  sheen.addColorStop(0, 'rgba(255,255,255,0.05)');
  sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.62, 'rgba(255,255,255,0.025)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, BOARD.W, chuteTop);
  g.restore();

  // launch rail
  const rail = g.createLinearGradient(0, 0, 0, 7);
  rail.addColorStop(0, '#fde68a');
  rail.addColorStop(0.5, '#a16207');
  rail.addColorStop(1, '#3b2504');
  g.fillStyle = rail;
  g.fillRect(0, 0, BOARD.W, 5);

  // side pillars (cabinet frame) over the full height
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? WORLD.x : BOARD.W;
    const pillar = g.createLinearGradient(x0, 0, x0 + 32, 0);
    const stops = side < 0
      ? ['#0a0c12', '#1c1f29', '#3d3220', '#0b0d13']
      : ['#0b0d13', '#3d3220', '#1c1f29', '#0a0c12'];
    stops.forEach((c, i) => pillar.addColorStop(i / 3, c));
    g.fillStyle = pillar;
    g.fillRect(x0, 0, 32, split);
    g.fillStyle = 'rgba(251,191,36,0.55)';
    g.fillRect(side < 0 ? -2.2 : BOARD.W + 0.6, 0, 1.6, split);
    g.fillStyle = 'rgba(6,182,212,0.35)';
    g.fillRect(side < 0 ? WORLD.x + 12 : BOARD.W + 18, 18, 2, chuteTop - 36);
  }

  // ------------------------------------------------------------- chute gates
  const cw = BOARD.W / BOARD.CHUTE_COUNT;
  const slot = g.createLinearGradient(0, chuteTop, 0, split);
  slot.addColorStop(0, '#05070c');
  slot.addColorStop(1, '#0d111b');
  g.fillStyle = slot;
  g.fillRect(0, chuteTop, BOARD.W, BOARD.CHUTE_H);
  for (let i = 0; i < BOARD.CHUTE_COUNT; i++) {
    const tint = chuteTint(opts.chuteMults[i] ?? 1);
    const x = i * cw;
    const pocket = g.createLinearGradient(x, 0, x + cw, 0);
    pocket.addColorStop(0, 'rgba(0,0,0,0.6)');
    pocket.addColorStop(0.5, rgba(tint, 0.13));
    pocket.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = pocket;
    g.fillRect(x, chuteTop, cw, BOARD.CHUTE_H);
    g.fillStyle = rgba(tint, 0.85);
    g.fillRect(x + 8, split - 2.2, cw - 16, 2.2);
  }
  for (let i = 0; i <= BOARD.CHUTE_COUNT; i++) {
    const x = i * cw;
    const post = g.createLinearGradient(x - 3, 0, x + 3, 0);
    post.addColorStop(0, '#3b2a0a');
    post.addColorStop(0.5, '#fde68a');
    post.addColorStop(1, '#5b3d0c');
    g.fillStyle = post;
    g.fillRect(x - 2.5, chuteTop - 4, 5, BOARD.CHUTE_H + 4);
    g.fillStyle = '#fef3c7';
    g.beginPath();
    g.arc(x, chuteTop - 4, 3.2, 0, Math.PI * 2);
    g.fill();
  }
  const capBar = g.createLinearGradient(0, chuteTop - 2, 0, chuteTop + 2);
  capBar.addColorStop(0, '#fde68a');
  capBar.addColorStop(1, '#78510e');
  g.fillStyle = capBar;
  g.fillRect(0, chuteTop - 1.5, BOARD.W, 2.5);

  // ----------------------------------------------------- cabinet body / walls
  g.fillStyle = '#05060a';
  g.fillRect(WORLD.x, split, WORLD.w, WORLD.h - split);
  const bodySheen = g.createLinearGradient(0, split, 0, WORLD.h);
  bodySheen.addColorStop(0, 'rgba(30,24,14,0.9)');
  bodySheen.addColorStop(1, 'rgba(8,8,12,1)');
  g.fillStyle = bodySheen;
  g.fillRect(WORLD.x, split, WORLD.w, WORLD.h - split);

  // shelf + gutters trapezoid shadow onto walls
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.9)';
  g.shadowBlur = 14;
  quadPath(g, 0, split, BOARD.W, BOARD.H);
  g.fillStyle = '#05060a';
  g.fill();
  g.restore();

  // gutters: recessed crimson troughs
  for (const [x0, x1] of [[0, gw], [BOARD.W - gw, BOARD.W]] as const) {
    quadPath(g, x0, split, x1, lipY);
    const a = pp(x0, split);
    const b = pp(x1, split);
    const trough = g.createLinearGradient(a.x, 0, b.x, 0);
    const outer = x0 === 0;
    trough.addColorStop(outer ? 0 : 1, '#040205');
    trough.addColorStop(0.55, '#16050b');
    trough.addColorStop(outer ? 1 : 0, '#2b0a16');
    g.fillStyle = trough;
    g.fill();
    // depth falloff toward the front drop
    quadPath(g, x0, lipY - 60, x1, lipY);
    const drop = g.createLinearGradient(0, pp(0, lipY - 60).y, 0, pp(0, lipY).y);
    drop.addColorStop(0, 'rgba(244,63,94,0)');
    drop.addColorStop(1, 'rgba(244,63,94,0.18)');
    g.fillStyle = drop;
    g.fill();
    // ribs
    g.strokeStyle = 'rgba(244,63,94,0.12)';
    g.lineWidth = 0.8;
    for (let y = split + 20; y < lipY; y += 22) {
      const l = pp(x0 + 4, y);
      const r = pp(x1 - 4, y);
      g.beginPath();
      g.moveTo(l.x, l.y);
      g.lineTo(r.x, r.y);
      g.stroke();
    }
  }

  // shelf surface
  quadPath(g, gw, split, BOARD.W - gw, lipY);
  const back = pp(0, split).y;
  const front = pp(0, lipY).y;
  const felt = g.createLinearGradient(0, back, 0, front);
  felt.addColorStop(0, '#060a14');
  felt.addColorStop(0.35, '#0c1a2e');
  felt.addColorStop(1, '#13314a');
  g.fillStyle = felt;
  g.fill();
  g.save();
  quadPath(g, gw, split, BOARD.W - gw, lipY);
  g.clip();
  // overhead spotlight pool
  const spot = g.createRadialGradient(300, front - 70, 10, 300, front - 70, 300);
  spot.addColorStop(0, 'rgba(120,220,255,0.16)');
  spot.addColorStop(0.5, 'rgba(60,140,200,0.06)');
  spot.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = spot;
  g.fillRect(-40, split, 680, 260);
  // perspective grid
  g.lineWidth = 0.7;
  for (let x = gw; x <= BOARD.W - gw + 0.1; x += (BOARD.W - 2 * gw) / 12) {
    const a = pp(x, split);
    const b = pp(x, lipY);
    g.strokeStyle = 'rgba(103,232,249,0.07)';
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  for (let y = split + 18; y < lipY; y += 18) {
    const a = pp(gw, y);
    const b = pp(BOARD.W - gw, y);
    const t = (y - split) / (lipY - split);
    g.strokeStyle = `rgba(103,232,249,${0.03 + t * 0.06})`;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  // back shadow under the dozer housing
  const housing = g.createLinearGradient(0, back, 0, back + 40);
  housing.addColorStop(0, 'rgba(0,0,0,0.75)');
  housing.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = housing;
  g.fillRect(-40, back, 680, 40);
  g.restore();

  // bevelled rake strips: slope toward the gutter, hatched as a hazard
  for (const [x0, x1, outerX] of [
    [gw, Math.min(gw + bevel, BOARD.W / 2), gw],
    [Math.max(BOARD.W - gw - bevel, BOARD.W / 2), BOARD.W - gw, BOARD.W - gw],
  ] as const) {
    g.save();
    quadPath(g, x0, split, x1, lipY);
    g.clip();
    const a = pp(x0, lipY);
    const b = pp(x1, lipY);
    const slope = g.createLinearGradient(a.x, 0, b.x, 0);
    const leftSide = outerX === gw;
    slope.addColorStop(leftSide ? 0 : 1, 'rgba(244,63,94,0.34)');
    slope.addColorStop(leftSide ? 1 : 0, 'rgba(251,191,36,0.03)');
    g.fillStyle = slope;
    g.fillRect(-40, split, 680, 260);
    g.strokeStyle = 'rgba(251,191,36,0.16)';
    g.lineWidth = 2.2;
    for (let y = split - 60; y < lipY + 60; y += 11) {
      const p0 = pp(x0, y);
      const p1 = pp(x1, y + (leftSide ? -14 : 14));
      g.beginPath();
      g.moveTo(p0.x, p0.y);
      g.lineTo(p1.x, p1.y);
      g.stroke();
    }
    g.restore();
    // crease line where the bevel starts
    const creaseX = leftSide ? x1 : x0;
    const c0 = pp(creaseX, split);
    const c1 = pp(creaseX, lipY);
    g.setLineDash([5, 4]);
    g.strokeStyle = 'rgba(251,191,36,0.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(c0.x, c0.y);
    g.lineTo(c1.x, c1.y);
    g.stroke();
    g.setLineDash([]);
  }

  // brass rails along the gutter edges
  for (const x of [gw, BOARD.W - gw]) {
    const a = pp(x, split);
    const b = pp(x, lipY);
    g.strokeStyle = '#7c5a14';
    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    g.strokeStyle = '#fde68a';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(a.x, a.y - 1);
    g.lineTo(b.x, b.y - 1);
    g.stroke();
  }
  // outer cabinet rails
  for (const x of [0, BOARD.W]) {
    const a = pp(x, split);
    const b = pp(x, BOARD.H);
    g.strokeStyle = '#a16207';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }

  // ------------------------------------------------------------------- lip
  const lipL = pp(gw, lipY);
  const lipR = pp(BOARD.W - gw, lipY);
  const botL = pp(gw, BOARD.H);
  const botR = pp(BOARD.W - gw, BOARD.H);
  // front face (the drop)
  g.beginPath();
  g.moveTo(lipL.x, lipL.y);
  g.lineTo(lipR.x, lipR.y);
  g.lineTo(botR.x, WORLD.h);
  g.lineTo(botL.x, WORLD.h);
  g.closePath();
  const face = g.createLinearGradient(0, lipL.y, 0, WORLD.h);
  face.addColorStop(0, '#3b2a0a');
  face.addColorStop(0.08, '#1a1406');
  face.addColorStop(0.3, '#07080b');
  face.addColorStop(1, '#010203');
  g.fillStyle = face;
  g.fill();
  const dropGlow = g.createLinearGradient(0, lipL.y, 0, WORLD.h);
  dropGlow.addColorStop(0, 'rgba(16,185,129,0.42)');
  dropGlow.addColorStop(0.22, 'rgba(16,185,129,0.08)');
  dropGlow.addColorStop(1, 'rgba(16,185,129,0)');
  g.fillStyle = dropGlow;
  g.fill();
  // payout slot: a dark trough with chevrons pointing down
  const slotY = lipL.y + (WORLD.h - lipL.y) * 0.5;
  g.fillStyle = 'rgba(253,230,138,0.22)';
  const chev = 9;
  for (let i = 0; i < 9; i++) {
    const cx = lipL.x + ((i + 0.5) / 9) * (lipR.x - lipL.x);
    g.beginPath();
    g.moveTo(cx - chev, slotY - 4);
    g.lineTo(cx, slotY + 3);
    g.lineTo(cx + chev, slotY - 4);
    g.lineTo(cx + chev, slotY - 1);
    g.lineTo(cx, slotY + 6);
    g.lineTo(cx - chev, slotY - 1);
    g.closePath();
    g.fill();
  }
  g.font = '700 9px "JetBrains Mono", monospace';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(110,231,183,0.55)';
  g.fillText('P A Y O U T', 300, WORLD.h - 6);
  // brass lip edge with emerald neon
  g.save();
  g.shadowColor = 'rgba(16,185,129,0.95)';
  g.shadowBlur = 10;
  g.strokeStyle = '#34d399';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(lipL.x, lipL.y);
  g.lineTo(lipR.x, lipR.y);
  g.stroke();
  g.restore();
  g.strokeStyle = '#ecfdf5';
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(lipL.x, lipL.y - 0.6);
  g.lineTo(lipR.x, lipR.y - 0.6);
  g.stroke();
  // gutter drops at the front
  for (const [x0, x1] of [[0, gw], [BOARD.W - gw, BOARD.W]] as const) {
    const a = pp(x0, lipY);
    const b = pp(x1, lipY);
    const hole = g.createLinearGradient(0, a.y, 0, WORLD.h);
    hole.addColorStop(0, 'rgba(244,63,94,0.35)');
    hole.addColorStop(0.3, 'rgba(60,4,16,0.9)');
    hole.addColorStop(1, '#000000');
    g.fillStyle = hole;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.lineTo(pp(x1, BOARD.H).x, WORLD.h);
    g.lineTo(pp(x0, BOARD.H).x, WORLD.h);
    g.closePath();
    g.fill();
  }

  // vignette over the lower cabinet
  const vig = g.createRadialGradient(300, 330, 160, 300, 330, 470);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vig;
  g.fillRect(WORLD.x, split, WORLD.w, WORLD.h - split);

  return canvas;
}
