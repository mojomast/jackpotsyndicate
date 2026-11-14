// Self-contained mirror of packages/contracts (C-6/C-9, CONTRACTS_REV 1).
// The integrator may replace the mirrored declarations with shared re-exports.
export const TICKS_PER_SECOND = 60;
// Tick offsets measured from the Spin command:
export const REEL_STOP_TICK = (col: number): number => 30 + 12 * col;
export const EVAL_DELAY_TICKS = 6;
export const ORB_LAUNCH_DELAY_TICKS = 6;
export const ORB_LAUNCH_INTERVAL_TICKS = 6;
export const ANIM_TICKS = {
  tumbleStep: 36, gridRelayout: 90, fever: 60, bossIntro: 180,
  floorTransition: 150, victory: 240, gameOver: 180,
} as const;

export type SymbolId = 'diamond' | 'cherry' | 'uranium' | 'skull' | 'seven';
export type BossId = 'valenti' | 'zero' | 'auditor';
export type FloorId = 'FLOOR_NEON' | 'FLOOR_CRYO' | 'FLOOR_FOUNDRY' | 'FLOOR_PENTHOUSE';

export const DESIGN_TOKENS = {
  color: { obsidian: '#07090e', slateDark: '#0f1420', panel: '#121826', gold: '#fbbf24', cyan: '#06b6d4', crimson: '#f43f5e', emerald: '#10b981' },
  font: { sans: 'Inter', mono: 'JetBrains Mono', display: 'Outfit' },
} as const;
export type DesignTokens = typeof DESIGN_TOKENS;
export type SpriteFrame = { url: string; x: number; y: number; w: number; h: number };
export type SpriteResolver = (logicalKey: string) => SpriteFrame | null;
export interface SeekableTimeline {
  time(): number;
  time(seconds: number): unknown;
  duration(): number;
  pause(): unknown;
  kill(): unknown;
}
export type TimelineFactory<P, T extends SeekableTimeline = SeekableTimeline> =
  (root: HTMLElement, params: P, tokens: DesignTokens, sprites: SpriteResolver) => T;

export type GridCols = 3 | 4 | 5;
export type GridRows = 3 | 4;
export type AnimCell = [col: number, row: number];
export type Cell = AnimCell;
export interface GridSize { cols: number; rows: number }
export interface MotionParams { reducedMotion: boolean }
export interface ReelSpinParams extends GridSize, MotionParams {
  finalGrid: SymbolId[][]; frozenCells?: Cell[]; seed: number;
}
export interface Win { cells: Cell[]; kind: 'line' | 'ways' | 'cluster'; overvolt?: boolean }
export interface LineWinParams extends GridSize, MotionParams { wins: Win[] }
export interface TumbleStepParams extends GridSize, MotionParams { cleared: AnimCell[]; gridAfter: SymbolId[][] }
export interface GridRelayoutParams extends MotionParams { from: GridSize; to: GridSize }
export type FeverParams = MotionParams;
export interface BossIntroParams extends MotionParams { bossId: BossId; bossName: string; tagline: string }
export interface FloorTransitionParams extends MotionParams { fromFloor: FloorId; toFloor: FloorId; floorName: string }
export interface VictoryParams extends MotionParams { seedText: string; bankroll: number }
export interface GameOverParams extends MotionParams { seedText: string; floorName: string; round: number }
export interface FactoryParams {
  reelSpin: ReelSpinParams; lineWin: LineWinParams; tumbleStep: TumbleStepParams;
  gridRelayout: GridRelayoutParams; fever: FeverParams; bossIntro: BossIntroParams;
  floorTransition: FloorTransitionParams; victory: VictoryParams; gameOver: GameOverParams;
}
export type FactoryName = keyof FactoryParams;
export type CompletionHook = () => void;

// Package conveniences retained when the mirror is replaced with re-exports.
export const DEFAULT_TOKENS = DESIGN_TOKENS;
export const SYMBOL_IDS: readonly SymbolId[] = ['diamond', 'cherry', 'uranium', 'skull', 'seven'];
export const SCENE_TICKS = { fever: ANIM_TICKS.fever, bossIntro: ANIM_TICKS.bossIntro, floorTransition: ANIM_TICKS.floorTransition, victory: ANIM_TICKS.victory, gameOver: ANIM_TICKS.gameOver } as const;
export const TUMBLE_TICKS = ANIM_TICKS.tumbleStep;
export const RELAYOUT_TICKS = ANIM_TICKS.gridRelayout;
export const REEL_SETTLE_TICKS = 5;
export const SYMBOL_DROP_TICKS = 18;
