/**
 * Public surface of the board renderer (T-071).
 *
 * Consumers can either render a snapshot directly through the Pixi adapter or
 * ask for a deterministic `DrawPlan` first (the path used by tests and by the
 * static-snapshot screenshot check).
 */
export {
  BOARD,
  DEFAULT_CHUTE_MULTS,
  projectShelf,
} from '@jackpotsyndicate/contracts';
export type {
  PhysicsEvent,
  SimSnapshot,
} from '@jackpotsyndicate/contracts';

export {
  PEG_COLORS,
  SHELF_COLORS,
  SYMBOL_COLORS,
  bevelWidth,
  chuteLayout,
  flattenPoints,
  projectPoint,
  projectQuad,
  shade,
  shelfGeometry,
  sortTokens,
  symbolColor,
  tokenVisual,
} from './shelf';
export type {
  ChuteDraw,
  Point,
  ProjectedPoint,
  ShelfGeometry,
  SnapshotToken,
  TokenLayer,
  TokenVisual,
} from './shelf';

export {
  particlesFromEvents,
  stepParticles,
} from './particles';
export type {
  ExitParticle,
  ParticleInit,
  ParticleKind,
} from './particles';

export {
  LAYER_ORDER,
  PixiBoardRenderer,
  BoardRenderer,
  Renderer,
  PixiRenderer,
  buildDrawPlan,
  buildDrawPlanForSnapshot,
  createBoardRenderer,
  buildStaticDrawPlan,
  createDrawPlan,
  createPixiRenderer,
  createRenderer,
  drawPlan,
  drawSnapshot,
  planForSnapshot,
  planSnapshot,
  renderBoard,
  renderSnapshot,
  interpolateSnapshots,
} from './renderer';
export type {
  BoardLayer,
  BoardRendererOptions,
  CircleCommand,
  DozerDraw,
  DrawCommand,
  DrawPlan,
  EllipseCommand,
  FillStyle,
  LineCommand,
  OrbDraw,
  PegDraw,
  PolygonCommand,
  RectCommand,
  RenderOptions,
  ShelfDraw,
  StrokeStyle,
  TextCommand,
  TokenDraw,
} from './renderer';

export { createBoardRenderer as default } from './renderer';
