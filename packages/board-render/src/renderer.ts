/**
 * Pixi board renderer (T-071).
 *
 * `buildDrawPlan` is the testable, framework-free core: it consumes a
 * `SimSnapshot` (plus optional exit events) and returns a deterministic list
 * of draw commands for a static snapshot. `PixiBoardRenderer` replays that
 * plan into a Pixi container with generated placeholder shapes only.
 */
import { BOARD } from '@jackpotsyndicate/contracts';
import type { PhysicsEvent, SimSnapshot } from '@jackpotsyndicate/contracts';
import { Container, Graphics } from 'pixi.js';
import {
  PEG_COLORS,
  SHELF_COLORS,
  chuteLayout,
  projectPoint,
  shelfGeometry,
  sortTokens,
  symbolColor,
  tokenVisual,
} from './shelf';
import type { Point, ShelfGeometry, TokenVisual } from './shelf';
import { particlesFromEvents } from './particles';
import type { ExitParticle } from './particles';

export type BoardLayer =
  | 'background'
  | 'pinfield'
  | 'chutes'
  | 'pegs'
  | 'orbs'
  | 'shelf'
  | 'tokens'
  | 'vfx'
  | 'overlay';

export const LAYER_ORDER: readonly BoardLayer[] = [
  'background',
  'pinfield',
  'chutes',
  'pegs',
  'orbs',
  'shelf',
  'tokens',
  'vfx',
  'overlay',
];

interface CommandBase {
  layer: BoardLayer;
}

export interface FillStyle {
  color: string;
  alpha?: number;
}

export interface StrokeStyle {
  color: string;
  width?: number;
  alpha?: number;
}

export interface RectCommand extends CommandBase {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: FillStyle;
  stroke?: StrokeStyle;
  radius?: number;
}

export interface EllipseCommand extends CommandBase {
  kind: 'ellipse';
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation?: number;
  fill?: FillStyle;
  stroke?: StrokeStyle;
  tokenId?: number;
  stackIndex?: number;
  welded?: boolean;
  lift?: number;
  role?: 'token' | 'shadow' | 'particle' | 'shelf';
}

export interface CircleCommand extends CommandBase {
  kind: 'circle';
  x: number;
  y: number;
  r: number;
  fill?: FillStyle;
  stroke?: StrokeStyle;
  pegId?: number;
  orbId?: number;
  role?: 'peg' | 'orb' | 'pulse';
}

export interface PolygonCommand extends CommandBase {
  kind: 'polygon';
  points: number[];
  fill?: FillStyle;
  stroke?: StrokeStyle;
  role?: 'gutter' | 'bevel' | 'surface' | 'lip' | 'dozer' | 'region';
}

export interface LineCommand extends CommandBase {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: StrokeStyle;
}

export interface TextCommand extends CommandBase {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  align?: 'left' | 'center' | 'right';
}

export type DrawCommand =
  | RectCommand
  | EllipseCommand
  | CircleCommand
  | PolygonCommand
  | LineCommand
  | TextCommand;

export interface PegDraw {
  id: number;
  x: number;
  y: number;
  radius: number;
  kind: string;
  flash: number;
  color: string;
}

export interface OrbDraw {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  symbolId: string;
  color: string;
}

export interface DozerDraw {
  frontY: number;
  stroke: number;
  surging: boolean;
  reciprocations: number;
  points: number[];
  highlight: number[];
  color: string;
}

export interface ShelfDraw extends Omit<ShelfGeometry, 'dozer'> {
  dozer: DozerDraw;
  chutes: ReturnType<typeof chuteLayout>;
  lipGlow: Point[];
  gutter: { left: Point[]; right: Point[] };
  bevelled: boolean;
}

export type TokenDraw = TokenVisual;

export interface DrawPlan {
  width: number;
  height: number;
  tick: number;
  projection: 'projectShelf';
  layers: Record<BoardLayer, DrawCommand[]>;
  commands: DrawCommand[];
  /** Alias for `commands`, for callers that name the list after its role. */
  calls: DrawCommand[];
  pegs: PegDraw[];
  orbs: OrbDraw[];
  tokens: TokenDraw[];
  /** Alias for `tokens` (shelf coins). */
  coins: TokenDraw[];
  shelf: ShelfDraw;
  vfx: ExitParticle[];
  queuedOrbs: number;
  suction: number;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  /** Floor physics value; bevel width is `26 * gutterRisk^2` (spec 2.7). */
  gutterRisk?: number;
  chuteMults?: readonly number[];
  floorId?: string;
  events?: readonly PhysicsEvent[];
  /** Alias for `events`, kept for callers that name the exit stream explicitly. */
  exitEvents?: readonly PhysicsEvent[];
  /** Tick used to age exit events. Defaults to the snapshot tick. */
  vfxTick?: number;
  /** Accepted for future atlas support; ignored by the placeholder renderer. */
  sprites?: unknown;
  showPegs?: boolean;
  showOrbs?: boolean;
  showTokens?: boolean;
  showVfx?: boolean;
}

function push(layers: Record<BoardLayer, DrawCommand[]>, command: DrawCommand): void {
  layers[command.layer].push(command);
}

function quad(points: readonly Point[]): number[] {
  const out: number[] = [];
  for (const p of points) out.push(p.x, p.y);
  return out;
}

function fill(color: string, alpha?: number): FillStyle {
  return alpha === undefined ? { color } : { color, alpha };
}

function stroke(color: string, width = 1, alpha?: number): StrokeStyle {
  return alpha === undefined ? { color, width } : { color, width, alpha };
}

function buildLayers(): Record<BoardLayer, DrawCommand[]> {
  return {
    background: [],
    pinfield: [],
    chutes: [],
    pegs: [],
    orbs: [],
    shelf: [],
    tokens: [],
    vfx: [],
    overlay: [],
  };
}

function addShelfCommands(layers: Record<BoardLayer, DrawCommand[]>, geometry: ShelfGeometry, options: RenderOptions): ShelfDraw {
  const dozer = geometry.dozer;
  const dozerColor = SHELF_COLORS.dozer;
  push(layers, {
    kind: 'polygon',
    layer: 'shelf',
    points: quad(geometry.leftGutter),
    fill: fill(SHELF_COLORS.gutter),
    role: 'gutter',
  });
  push(layers, {
    kind: 'polygon',
    layer: 'shelf',
    points: quad(geometry.rightGutter),
    fill: fill(SHELF_COLORS.gutter),
    role: 'gutter',
  });
  push(layers, {
    kind: 'polygon',
    layer: 'shelf',
    points: quad(geometry.surface),
    fill: fill(SHELF_COLORS.surface),
    role: 'surface',
  });
  push(layers, {
    kind: 'polygon',
    layer: 'shelf',
    points: quad(geometry.leftBevel),
    fill: fill(SHELF_COLORS.bevel),
    role: 'bevel',
  });
  push(layers, {
    kind: 'polygon',
    layer: 'shelf',
    points: quad(geometry.rightBevel),
    fill: fill(SHELF_COLORS.bevel),
    role: 'bevel',
  });
  push(layers, {
    kind: 'polygon',
    layer: 'shelf',
    points: quad(geometry.lip),
    fill: fill(SHELF_COLORS.lip),
    role: 'lip',
  });
  push(layers, {
    kind: 'polygon',
    layer: 'shelf',
    points: quad(geometry.lipHighlight),
    fill: fill(SHELF_COLORS.lipHighlight, 0.85),
    role: 'lip',
  });
  // Recessed gutter edges make the drop readable without textures.
  push(layers, {
    kind: 'line',
    layer: 'shelf',
    x1: geometry.leftGutter[1]!.x,
    y1: geometry.leftGutter[1]!.y,
    x2: geometry.leftGutter[2]!.x,
    y2: geometry.leftGutter[2]!.y,
    stroke: stroke(SHELF_COLORS.gutterLip, 2, 0.9),
  });
  push(layers, {
    kind: 'line',
    layer: 'shelf',
    x1: geometry.rightGutter[0]!.x,
    y1: geometry.rightGutter[0]!.y,
    x2: geometry.rightGutter[3]!.x,
    y2: geometry.rightGutter[3]!.y,
    stroke: stroke(SHELF_COLORS.gutterLip, 2, 0.9),
  });

  // The pusher blade; the sim gives frontY every tick.
  push(layers, {
    kind: 'polygon',
    layer: 'shelf',
    points: quad(dozer),
    fill: fill(dozerColor),
    role: 'dozer',
  });
  push(layers, {
    kind: 'polygon',
    layer: 'shelf',
    points: quad(geometry.dozerHighlight),
    fill: fill(SHELF_COLORS.dozerHighlight, 0.9),
    role: 'dozer',
  });

  const chutes = chuteLayout(BOARD.CHUTE_COUNT, options.chuteMults);
  for (const chute of chutes) {
    push(layers, {
      kind: 'rect',
      layer: 'chutes',
      x: chute.x,
      y: chute.y,
      w: chute.w,
      h: chute.h,
      fill: fill('#0b1020', 0.95),
      stroke: stroke(chute.color, 1.5),
      radius: 3,
    });
    push(layers, {
      kind: 'text',
      layer: 'chutes',
      x: chute.x + chute.w / 2,
      y: chute.y + chute.h / 2,
      text: chute.label,
      color: '#e2e8f0',
      size: 10,
      align: 'center',
    });
  }

  return {
    ...geometry,
    bevel: geometry.bevel,
    gutters: geometry.gutters,
    dozer: {
      frontY: 0,
      stroke: 0,
      surging: false,
      reciprocations: 0,
      points: quad(dozer),
      highlight: quad(geometry.dozerHighlight),
      color: dozerColor,
    },
    chutes,
    lipGlow: geometry.lipHighlight,
    gutter: { left: geometry.leftGutter, right: geometry.rightGutter },
    bevelled: geometry.bevel > 0,
  };
}

/**
 * Build a deterministic draw plan for a static snapshot. Two calls with the
 * same snapshot and options return deep-equal plans (no clocks, no randomness).
 */
export function buildDrawPlan(snapshot: SimSnapshot, options: RenderOptions = {}): DrawPlan {
  const width = options.width ?? BOARD.W;
  const height = options.height ?? BOARD.H;
  const gutterRisk = options.gutterRisk ?? 1;
  const layers = buildLayers();

  push(layers, {
    kind: 'rect',
    layer: 'background',
    x: 0,
    y: 0,
    w: width,
    h: height,
    fill: fill(SHELF_COLORS.background),
  });
  // Pinfield backdrop and glass tint.
  push(layers, {
    kind: 'rect',
    layer: 'pinfield',
    x: 0,
    y: 0,
    w: BOARD.W,
    h: BOARD.SPLIT_Y,
    fill: fill('#0b1020'),
  });
  push(layers, {
    kind: 'rect',
    layer: 'pinfield',
    x: 0,
    y: 0,
    w: BOARD.W,
    h: BOARD.SPLIT_Y,
    fill: fill('#06b6d4', 0.04),
  });

  const geometry = shelfGeometry(gutterRisk);
  const shelf = addShelfCommands(layers, geometry, options);
  const dozer = snapshot.dozer ?? {
    frontY: BOARD.DOZER_BACK_Y,
    stroke: BOARD.DOZER_STROKE,
    surging: false,
    reciprocations: 0,
  };
  shelf.dozer = {
    frontY: dozer.frontY,
    stroke: dozer.stroke,
    surging: dozer.surging,
    reciprocations: dozer.reciprocations,
    points: quad(geometry.dozer),
    highlight: quad(geometry.dozerHighlight),
    color: dozer.surging ? SHELF_COLORS.dozerSurge : SHELF_COLORS.dozer,
  };
  // The sim's frontY defines the actual blade face; overlay it on the fixed
  // shelf quads so the pusher visibly advances and retracts.
  const blade = [
    projectPoint(BOARD.GUTTER_W + 2, dozer.frontY),
    projectPoint(BOARD.W - BOARD.GUTTER_W - 2, dozer.frontY),
    projectPoint(BOARD.W - BOARD.GUTTER_W - 2, Math.min(BOARD.LIP_Y, dozer.frontY + 5)),
    projectPoint(BOARD.GUTTER_W + 2, Math.min(BOARD.LIP_Y, dozer.frontY + 5)),
  ];
  push(layers, {
    kind: 'polygon',
    layer: 'shelf',
    points: quad(blade),
    fill: fill(shelf.dozer.color),
    role: 'dozer',
  });
  const bladeFront = [
    projectPoint(BOARD.GUTTER_W + 2, dozer.frontY - 5),
    projectPoint(BOARD.W - BOARD.GUTTER_W - 2, dozer.frontY - 5),
    projectPoint(BOARD.W - BOARD.GUTTER_W - 2, dozer.frontY),
    projectPoint(BOARD.GUTTER_W + 2, dozer.frontY),
  ];
  push(layers, {
    kind: 'polygon',
    layer: 'shelf',
    points: quad(bladeFront),
    fill: fill(SHELF_COLORS.dozerHighlight, 0.9),
    role: 'dozer',
  });

  const pegs: PegDraw[] = [...snapshot.pegs]
    .sort((a, b) => a.id - b.id)
    .map((peg) => ({
      id: peg.id,
      x: peg.x,
      y: peg.y,
      radius: peg.radius,
      kind: peg.kind,
      flash: peg.flash,
      color: PEG_COLORS[peg.kind] ?? '#fbbf24',
    }));
  if (options.showPegs !== false) {
    for (const peg of pegs) {
      push(layers, {
        kind: 'circle',
        layer: 'pegs',
        x: peg.x,
        y: peg.y,
        r: peg.radius,
        fill: fill(peg.color, 0.95),
        stroke: stroke('#0f1420', 1),
        pegId: peg.id,
        role: 'peg',
      });
      if (peg.flash > 0) {
        push(layers, {
          kind: 'circle',
          layer: 'pegs',
          x: peg.x,
          y: peg.y,
          r: peg.radius + 2 + Math.min(4, peg.flash * 0.25),
          stroke: stroke(peg.color, 2, Math.min(1, 0.35 + peg.flash * 0.05)),
          role: 'pulse',
        });
      }
    }
  }

  const orbs: OrbDraw[] = [...snapshot.orbs]
    .sort((a, b) => a.id - b.id)
    .map((orb) => ({
      id: orb.id,
      x: orb.x,
      y: orb.y,
      vx: orb.vx,
      vy: orb.vy,
      radius: orb.radius,
      symbolId: orb.symbolId,
      color: symbolColor(orb.symbolId),
    }));
  if (options.showOrbs !== false) {
    for (const orb of orbs) {
      push(layers, {
        kind: 'circle',
        layer: 'orbs',
        x: orb.x,
        y: orb.y,
        r: orb.radius,
        fill: fill('#0f172a'),
        stroke: stroke(orb.color, 2.5),
        orbId: orb.id,
        role: 'orb',
      });
    }
  }

  const tokens: TokenDraw[] = [];
  if (options.showTokens !== false) {
    for (const token of sortTokens(snapshot.tokens)) {
      const visual = tokenVisual(token);
      tokens.push(visual);
      push(layers, {
        kind: 'ellipse',
        layer: 'tokens',
        x: visual.shadow.x,
        y: visual.shadow.y,
        rx: visual.shadow.rx,
        ry: visual.shadow.ry,
        fill: fill(SHELF_COLORS.shadow, visual.shadow.alpha),
        tokenId: visual.id,
        role: 'shadow',
        lift: visual.lift,
        welded: visual.welded,
      });
      for (const layer of visual.layers) {
        push(layers, {
          kind: 'ellipse',
          layer: 'tokens',
          x: layer.x,
          y: layer.y,
          rx: layer.rx,
          ry: layer.ry,
          fill: fill(layer.side),
          tokenId: visual.id,
          stackIndex: layer.index,
          welded: visual.welded,
          lift: visual.lift,
          role: 'token',
        });
        push(layers, {
          kind: 'rect',
          layer: 'tokens',
          x: layer.x - layer.rx,
          y: layer.y,
          w: layer.rx * 2,
          h: layer.thickness,
          fill: fill(layer.side),
        });
        push(layers, {
          kind: 'ellipse',
          layer: 'tokens',
          x: layer.x,
          y: layer.y - layer.thickness,
          rx: layer.rx,
          ry: layer.ry,
          fill: fill(layer.fill),
          stroke: stroke(visual.outline, visual.outlineWidth),
          tokenId: visual.id,
          stackIndex: layer.index,
          welded: visual.welded,
          lift: visual.lift,
          role: 'token',
        });
      }
    }
  }

  const vfx = options.showVfx === false
    ? []
    : particlesFromEvents(options.events ?? options.exitEvents ?? [], options.vfxTick ?? snapshot.tick);
  for (const particle of vfx) {
    const p = projectPoint(particle.x, particle.y);
    const rx = particle.radius * p.scale * particle.scale;
    const ry = rx * 0.58;
    push(layers, {
      kind: 'ellipse',
      layer: 'vfx',
      x: p.x,
      y: p.y,
      rx,
      ry,
      rotation: particle.rotation,
      fill: fill(particle.color, Math.max(0, particle.alpha)),
      stroke: stroke(particle.kind === 'gutter' ? '#7f1d1d' : '#ffffff', 1, Math.max(0, particle.alpha * 0.8)),
      tokenId: particle.tokenId,
      role: 'particle',
    });
  }
  // Small deterministic lip shimmer so the payout edge reads even with no events.
  for (let i = 0; i < 5; i++) {
    const x = BOARD.GUTTER_W + ((i + 0.5) / 5) * (BOARD.W - BOARD.GUTTER_W * 2);
    const p = projectPoint(x, BOARD.LIP_Y);
    push(layers, {
      kind: 'circle',
      layer: 'vfx',
      x: p.x,
      y: p.y,
      r: 1.5,
      fill: fill(SHELF_COLORS.lipHighlight, 0.55),
      role: 'pulse',
    });
  }

  const commands: DrawCommand[] = [];
  for (const layer of LAYER_ORDER) for (const command of layers[layer]) commands.push(command);

  return {
    width,
    height,
    tick: snapshot.tick,
    projection: 'projectShelf',
    layers,
    commands,
    calls: commands,
    pegs,
    orbs,
    tokens,
    coins: tokens,
    shelf,
    vfx,
    queuedOrbs: snapshot.queuedOrbs ?? 0,
    suction: snapshot.suction ?? 0,
  };
}

/** Alias kept for callers that describe the same pure path as a "static plan". */
export const buildDrawPlanForSnapshot = buildDrawPlan;
export const createDrawPlan = buildDrawPlan;
export const drawPlan = buildDrawPlan;
export const planSnapshot = buildDrawPlan;
export const planForSnapshot = buildDrawPlan;
export const buildStaticDrawPlan = buildDrawPlan;

/** Pure plan path for a static snapshot (no Pixi side effects). */
export function renderSnapshot(snapshot: SimSnapshot, options: RenderOptions = {}): DrawPlan {
  return buildDrawPlan(snapshot, options);
}

/** Alias for `renderSnapshot`. */
export const drawSnapshot = renderSnapshot;

function isDrawPlan(value: DrawPlan | SimSnapshot): value is DrawPlan {
  return typeof (value as DrawPlan).projection === 'string' && Array.isArray((value as DrawPlan).commands);
}

/** Interpolate two ticks of a snapshot for smooth rendering. Pure and deterministic. */
export function interpolateSnapshots(previous: SimSnapshot, next: SimSnapshot, alpha: number): SimSnapshot {
  const t = Math.max(0, Math.min(1, alpha));
  const lerp = (a: number, b: number): number => a + (b - a) * t;
  const previousOrbs = new Map(previous.orbs.map((orb) => [orb.id, orb]));
  const orbs = next.orbs.map((orb) => {
    const from = previousOrbs.get(orb.id);
    if (!from) return { ...orb };
    return { ...orb, x: lerp(from.x, orb.x), y: lerp(from.y, orb.y), vx: orb.vx, vy: orb.vy };
  });
  const previousTokens = new Map(previous.tokens.map((token) => [token.id, token]));
  const tokens = next.tokens.map((token) => {
    const from = previousTokens.get(token.id);
    if (!from) return { ...token };
    return {
      ...token,
      x: lerp(from.x, token.x),
      y: lerp(from.y, token.y),
      vx: token.vx,
      vy: token.vy,
      stack: token.stack,
      welded: token.welded,
      lift: lerp(from.lift, token.lift),
    };
  });
  return {
    tick: next.tick,
    dozer: {
      ...next.dozer,
      frontY: lerp(previous.dozer.frontY, next.dozer.frontY),
      stroke: lerp(previous.dozer.stroke, next.dozer.stroke),
    },
    suction: next.suction,
    pegs: next.pegs.map((peg) => ({ ...peg })),
    orbs,
    tokens,
    queuedOrbs: next.queuedOrbs,
  };
}

function drawCommand(g: Graphics, command: DrawCommand): void {
  switch (command.kind) {
    case 'rect':
      if (command.radius && command.radius > 0) g.roundRect(command.x, command.y, command.w, command.h, command.radius);
      else g.rect(command.x, command.y, command.w, command.h);
      break;
    case 'ellipse':
      g.ellipse(command.x, command.y, command.rx, command.ry);
      break;
    case 'circle':
      g.circle(command.x, command.y, command.r);
      break;
    case 'polygon':
      g.poly(command.points);
      break;
    case 'line':
      g.moveTo(command.x1, command.y1).lineTo(command.x2, command.y2);
      break;
    case 'text':
      // Placeholder renderer deliberately avoids font assets (spec 2.8).
      return;
  }
  if ('fill' in command && command.fill) {
    g.fill({ color: command.fill.color, alpha: command.fill.alpha ?? 1 });
  }
  if ('stroke' in command && command.stroke) {
    g.stroke({ color: command.stroke.color, width: command.stroke.width ?? 1, alpha: command.stroke.alpha ?? 1 });
  }
}

export interface BoardRendererOptions extends RenderOptions {
  antialias?: boolean;
  /** Optional existing Pixi container to attach the board layers to. */
  container?: Container;
  /** Alias for `container`. */
  root?: Container;
  /** Optional Pixi Application-like object; its stage is used as the root. */
  app?: { stage?: Container };
}

/**
 * Thin Pixi adapter around the draw plan. Each board layer owns one Graphics
 * and is redrawn from the plan, which keeps rendering deterministic and makes
 * a replay of a static snapshot identical every time.
 */
export class PixiBoardRenderer {
  readonly container: Container;
  private readonly layerGraphics = new Map<BoardLayer, Graphics>();
  private readonly options: RenderOptions;
  private lastPlan: DrawPlan | null = null;

  constructor(options: BoardRendererOptions | Container = {}, maybeOptions: BoardRendererOptions = {}) {
    const normalized: BoardRendererOptions =
      options instanceof Container ? { ...maybeOptions, container: options } : { ...options, ...maybeOptions };
    this.options = normalized;
    this.container = normalized.container ?? normalized.root ?? normalized.app?.stage ?? new Container();
    this.container.label = 'board';
    for (const layer of LAYER_ORDER) {
      const graphics = new Graphics();
      graphics.label = `board:${layer}`;
      this.layerGraphics.set(layer, graphics);
      this.container.addChild(graphics);
    }
  }

  /** The most recent plan, useful for tests and debug overlays. */
  get plan(): DrawPlan | null {
    return this.lastPlan;
  }

  /** Replay a draw plan (or build and replay one from a snapshot). */
  render(planOrSnapshot: DrawPlan | SimSnapshot, options: RenderOptions = {}): this {
    const plan = isDrawPlan(planOrSnapshot)
      ? planOrSnapshot
      : buildDrawPlan(planOrSnapshot, { ...this.options, ...options });
    this.lastPlan = plan;
    for (const layer of LAYER_ORDER) {
      const graphics = this.layerGraphics.get(layer)!;
      graphics.clear();
      for (const command of plan.layers[layer]) drawCommand(graphics, command);
    }
    return this;
  }

  /** Build a static plan and render it in one call. */
  draw(snapshot: SimSnapshot | DrawPlan, options: RenderOptions = {}): DrawPlan {
    const plan = isDrawPlan(snapshot) ? snapshot : buildDrawPlan(snapshot, { ...this.options, ...options });
    this.render(plan);
    return plan;
  }

  /** Alias for `draw`. */
  update(snapshot: SimSnapshot, options: RenderOptions = {}): DrawPlan {
    return this.draw(snapshot, options);
  }

  /** Alias for `draw`. */
  setSnapshot(snapshot: SimSnapshot, options: RenderOptions = {}): DrawPlan {
    return this.draw(snapshot, options);
  }

  renderSnapshot(snapshot: SimSnapshot, options: RenderOptions = {}): DrawPlan {
    return this.draw(snapshot, options);
  }

  /** The Pixi container that owns all board layers. */
  get stage(): Container {
    return this.container;
  }

  clear(): this {
    for (const graphics of this.layerGraphics.values()) graphics.clear();
    this.lastPlan = null;
    return this;
  }

  dispose(): void {
    this.destroy();
  }

  destroy(): void {
    for (const graphics of this.layerGraphics.values()) graphics.destroy();
    this.layerGraphics.clear();
    this.container.destroy({ children: true });
  }
}

export { PixiBoardRenderer as BoardRenderer };
export { PixiBoardRenderer as Renderer };

export function createBoardRenderer(
  options: BoardRendererOptions | Container = {},
  maybeOptions: BoardRendererOptions = {},
): PixiBoardRenderer {
  return new PixiBoardRenderer(options, maybeOptions);
}

export const createRenderer = createBoardRenderer;
export const createPixiRenderer = createBoardRenderer;
export { PixiBoardRenderer as PixiRenderer };

/** Build a renderer, draw one snapshot, and return the renderer. */
export function renderBoard(
  snapshot: SimSnapshot,
  target: BoardRendererOptions | Container = {},
  options: BoardRendererOptions = {},
): PixiBoardRenderer {
  const renderer = createBoardRenderer(target, options);
  renderer.draw(snapshot);
  return renderer;
}
