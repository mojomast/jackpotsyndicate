// Shared C-6/C-9 contracts. Values and types are re-exported from
// packages/contracts so the animation package has a single declaration source.
// Package-only helper aliases follow the re-exports.
export {
  TICKS_PER_SECOND, REEL_STOP_TICK, EVAL_DELAY_TICKS,
  ORB_LAUNCH_DELAY_TICKS, ORB_LAUNCH_INTERVAL_TICKS, ANIM_TICKS,
} from '../../contracts/src/constants';
export { DESIGN_TOKENS } from '../../contracts/src/presentation';
export type {
  DesignTokens, SpriteFrame, SpriteResolver, SeekableTimeline, TimelineFactory,
  AnimCell, ReelSpinParams, LineWinParams, TumbleStepParams, GridRelayoutParams,
  FeverParams, BossIntroParams, FloorTransitionParams, VictoryParams, GameOverParams,
} from '../../contracts/src/presentation';
export type { SymbolId, BossId, FloorId } from '../../contracts/src/content';

import { ANIM_TICKS } from '../../contracts/src/constants';
import { DESIGN_TOKENS } from '../../contracts/src/presentation';
import type {
  AnimCell, ReelSpinParams, LineWinParams, TumbleStepParams, GridRelayoutParams,
  FeverParams, BossIntroParams, FloorTransitionParams, VictoryParams, GameOverParams,
} from '../../contracts/src/presentation';
import type { SymbolId } from '../../contracts/src/content';

// Package conveniences retained when the mirror is replaced with re-exports.
export type GridCols = 3 | 4 | 5;
export type GridRows = 3 | 4;
export type Cell = AnimCell;
export interface GridSize { cols: number; rows: number }
export interface MotionParams { reducedMotion: boolean }
export type Win = LineWinParams['wins'][number];
export interface FactoryParams {
  reelSpin: ReelSpinParams; lineWin: LineWinParams; tumbleStep: TumbleStepParams;
  gridRelayout: GridRelayoutParams; fever: FeverParams; bossIntro: BossIntroParams;
  floorTransition: FloorTransitionParams; victory: VictoryParams; gameOver: GameOverParams;
}
export type FactoryName = keyof FactoryParams;
export type CompletionHook = () => void;

export const DEFAULT_TOKENS = DESIGN_TOKENS;
export const SYMBOL_IDS: readonly SymbolId[] = ['diamond', 'cherry', 'uranium', 'skull', 'seven'];
export const SCENE_TICKS = { fever: ANIM_TICKS.fever, bossIntro: ANIM_TICKS.bossIntro, floorTransition: ANIM_TICKS.floorTransition, victory: ANIM_TICKS.victory, gameOver: ANIM_TICKS.gameOver } as const;
export const TUMBLE_TICKS = ANIM_TICKS.tumbleStep;
export const RELAYOUT_TICKS = ANIM_TICKS.gridRelayout;
export const REEL_SETTLE_TICKS = 5;
export const SYMBOL_DROP_TICKS = 18;
