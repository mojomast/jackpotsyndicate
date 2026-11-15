/**
 * Shelf and board geometry helpers for the 2.5D renderer.
 *
 * The simulation is flat (K-3). Everything here is a pure projection of the
 * 2D snapshot through `projectShelf` from contracts, so the board renderer and
 * shelf VFX always agree on where a coin appears. No assets are loaded: every
 * visual is a generated shape with a placeholder colour.
 */
import { BOARD, DEFAULT_CHUTE_MULTS, projectShelf } from '@jackpotsyndicate/contracts';
import type { SimSnapshot } from '@jackpotsyndicate/contracts';

export interface Point {
  x: number;
  y: number;
}

export interface ProjectedPoint extends Point {
  scale: number;
}

/** Palette for placeholder tokens and pinfield bodies. */
export const SYMBOL_COLORS: Readonly<Record<string, string>> = {
  diamond: '#06b6d4',
  cherry: '#f43f5e',
  uranium: '#10b981',
  skull: '#a855f7',
  seven: '#fbbf24',
  scrap: '#b45309',
  ice: '#bae6fd',
  copper: '#b45309',
  bullion: '#fbbf24',
};

export const PEG_COLORS: Readonly<Record<string, string>> = {
  gold: '#fbbf24',
  golden: '#fde047',
  splitter: '#06b6d4',
  bumper: '#f43f5e',
};

export const SHELF_COLORS = {
  background: '#07090e',
  gutter: '#2a0f1a',
  gutterLip: '#3b1524',
  surface: '#16203a',
  surfaceEdge: '#1e2c4d',
  bevel: '#231a33',
  lip: '#0c3b2e',
  lipHighlight: '#10b981',
  dozer: '#d97706',
  dozerSurge: '#fb923c',
  dozerHighlight: '#fde68a',
  shadow: '#000000',
} as const;

export function symbolColor(symbolId: string, fallback = '#fbbf24'): string {
  return SYMBOL_COLORS[symbolId] ?? fallback;
}

/** Clamp and shade a #rrggbb colour by `delta` per channel. */
export function shade(hex: string, delta: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + delta));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + delta));
  const b = Math.max(0, Math.min(255, (n & 0xff) + delta));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** The bevelled strip beside each gutter, in board units (spec 2.7). */
export function bevelWidth(gutterRisk = 1): number {
  return 26 * gutterRisk * gutterRisk;
}

export function projectPoint(x: number, y: number): ProjectedPoint {
  return projectShelf(x, y);
}

/** Project two opposite corners into a screen-space quad (TL, TR, BR, BL). */
export function projectQuad(x0: number, y0: number, x1: number, y1: number): Point[] {
  const a = projectPoint(x0, y0);
  const b = projectPoint(x1, y0);
  const c = projectPoint(x1, y1);
  const d = projectPoint(x0, y1);
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: b.y },
    { x: c.x, y: c.y },
    { x: d.x, y: d.y },
  ];
}

export function flattenPoints(points: readonly Point[]): number[] {
  const out: number[] = [];
  for (const p of points) out.push(p.x, p.y);
  return out;
}

export interface ChuteDraw {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  multiplier: number;
  color: string;
  label: string;
}

export function chuteLayout(count = BOARD.CHUTE_COUNT, mults: readonly number[] = DEFAULT_CHUTE_MULTS): ChuteDraw[] {
  const cw = BOARD.W / count;
  const colors = ['#64748b', '#06b6d4', '#fbbf24', '#06b6d4', '#10b981'];
  const out: ChuteDraw[] = [];
  for (let i = 0; i < count; i++) {
    const multiplier = mults[i] ?? 1;
    out.push({
      index: i,
      x: i * cw + 2,
      y: BOARD.SPLIT_Y - BOARD.CHUTE_H,
      w: cw - 4,
      h: BOARD.CHUTE_H - 2,
      multiplier,
      color: colors[i % colors.length]!,
      label: `x${multiplier.toFixed(1)}`,
    });
  }
  return out;
}

export interface ShelfGeometry {
  splitY: number;
  lipY: number;
  boardH: number;
  boardW: number;
  gutterW: number;
  bevel: number;
  leftGutter: Point[];
  rightGutter: Point[];
  leftBevel: Point[];
  rightBevel: Point[];
  surface: Point[];
  lip: Point[];
  lipHighlight: Point[];
  dozer: Point[];
  dozerHighlight: Point[];
  gutters: Point[][];
}

export function shelfGeometry(gutterRisk = 1): ShelfGeometry {
  const splitY = BOARD.SPLIT_Y;
  const gutterW = BOARD.GUTTER_W;
  const left = gutterW;
  const right = BOARD.W - gutterW;
  const lipY = BOARD.LIP_Y;
  const bevel = bevelWidth(gutterRisk);
  const leftGutter = projectQuad(0, splitY, left, lipY);
  const rightGutter = projectQuad(right, splitY, BOARD.W, lipY);
  return {
    splitY,
    lipY,
    boardH: BOARD.H,
    boardW: BOARD.W,
    gutterW,
    bevel,
    leftGutter,
    rightGutter,
    leftBevel: projectQuad(left, splitY, Math.min(left + bevel, right), lipY),
    rightBevel: projectQuad(Math.max(right - bevel, left), splitY, right, lipY),
    surface: projectQuad(left, splitY, right, lipY),
    lip: projectQuad(left, lipY, right, BOARD.H),
    lipHighlight: projectQuad(left + 2, lipY, right - 2, lipY + 4),
    dozer: projectQuad(left + 2, splitY, right - 2, BOARD.DOZER_BACK_Y),
    dozerHighlight: projectQuad(left + 2, BOARD.DOZER_BACK_Y - 5, right - 2, BOARD.DOZER_BACK_Y),
    gutters: [leftGutter, rightGutter],
  };
}

export interface TokenLayer {
  index: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  thickness: number;
  fill: string;
  side: string;
}

export interface TokenVisual {
  id: number;
  symbolId: string;
  skin: string;
  projected: ProjectedPoint;
  screen: Point;
  baseY: number;
  lift: number;
  liftOffset: number;
  stack: number;
  welded: boolean;
  radius: number;
  thickness: number;
  rx: number;
  ry: number;
  color: string;
  outline: string;
  outlineWidth: number;
  shadow: { x: number; y: number; rx: number; ry: number; alpha: number };
  layers: TokenLayer[];
  depth: number;
}

export type SnapshotToken = SimSnapshot['tokens'][number];

/**
 * Describe one token in screen space. `stack` produces one layer per coin in
 * the tower, `lift` raises the tower off the shelf plane, and `welded` gets a
 * bright outline. All numbers are deterministic functions of the snapshot.
 */
export function tokenVisual(token: SnapshotToken): TokenVisual {
  const projected = projectPoint(token.x, token.y);
  const color = symbolColor(token.symbolId);
  const rx = token.radius * projected.scale;
  const ry = token.radius * projected.scale * 0.58;
  const thickness = 3.2 * projected.scale;
  const lift = Number.isFinite(token.lift) ? token.lift : 0;
  const liftOffset = lift * 2.5 * projected.scale;
  const screen = { x: projected.x, y: projected.y - liftOffset };
  const stack = Math.max(1, Math.floor(Number.isFinite(token.stack) ? token.stack : 1));
  const layers: TokenLayer[] = [];
  for (let i = 0; i < stack; i++) {
    layers.push({
      index: i,
      x: projected.x,
      y: screen.y - i * thickness,
      rx,
      ry,
      thickness,
      fill: shade(color, -12 + i * 6),
      side: shade(color, -45),
    });
  }
  return {
    id: token.id,
    symbolId: token.symbolId,
    skin: token.skin,
    projected,
    screen,
    baseY: projected.y,
    lift,
    liftOffset,
    stack,
    welded: Boolean(token.welded),
    radius: token.radius,
    thickness,
    rx,
    ry,
    color,
    outline: token.welded ? '#ffffff' : shade(color, 50),
    outlineWidth: token.welded ? 1.6 : 0.8,
    shadow: {
      x: projected.x + 2,
      y: projected.y + 3,
      rx,
      ry,
      alpha: 0.35,
    },
    layers,
    depth: token.y,
  };
}

/** Stable far-to-near ordering for painter's algorithm. */
export function sortTokens(tokens: readonly SnapshotToken[]): SnapshotToken[] {
  return [...tokens].sort((a, b) => a.y - b.y || a.id - b.id);
}
