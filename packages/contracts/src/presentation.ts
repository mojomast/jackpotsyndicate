/**
 * C-6 animation, C-7 assets, C-8 test surface, C-9 design tokens.
 *
 * C-6 is shared with the external animation package (packages/anim). Its
 * src/contracts-shim.ts must match the names and values here and in
 * constants.ts (TICKS_PER_SECOND, REEL_STOP_TICK, EVAL_DELAY_TICKS,
 * ORB_LAUNCH_DELAY_TICKS, ORB_LAUNCH_INTERVAL_TICKS). If they differ, the
 * shim wins for anything animation code already uses.
 */
import type { BossId, FloorId, SymbolId } from './content';
import type { Command, GameCore, Phase } from './protocol';

// ---------------------------------------------------------------- C-9
export const DESIGN_TOKENS = {
  color: {
    obsidian: '#07090e',
    slateDark: '#0f1420',
    panel: '#121826',
    gold: '#fbbf24',
    cyan: '#06b6d4',
    crimson: '#f43f5e',
    emerald: '#10b981',
  },
  font: { sans: 'Inter', mono: 'JetBrains Mono', display: 'Outfit' },
} as const;
export type DesignTokens = typeof DESIGN_TOKENS;

// ---------------------------------------------------------------- C-6
export type SpriteFrame = { url: string; x: number; y: number; w: number; h: number };
export type SpriteResolver = (logicalKey: string) => SpriteFrame | null;

/** Minimal structural type so contracts does not depend on gsap. */
export interface SeekableTimeline {
  time(): number;
  time(seconds: number): unknown;
  duration(): number;
  pause(): unknown;
  kill(): unknown;
}

/** Returns a paused, fully built timeline. See spec 2.4 C-6 for the rules. */
export type TimelineFactory<P, T extends SeekableTimeline = SeekableTimeline> = (
  root: HTMLElement,
  params: P,
  tokens: DesignTokens,
  sprites: SpriteResolver,
) => T;

type Motion = { reducedMotion: boolean };
export type AnimCell = [col: number, row: number];
export interface ReelSpinParams extends Motion {
  cols: number; rows: number; finalGrid: SymbolId[][]; frozenCells?: AnimCell[]; seed: number;
  floorId?: FloorId; grain?: boolean; wiring?: 'CLASSIC' | 'HYPER' | 'WAYS' | 'CLUSTER';
  /** Optional quality strategy; reduced motion always disables motion blur. */
  blurMode?: 'echo' | 'svg';
}
export interface LineWinParams extends Motion {
  cols: number; rows: number; wins: { cells: AnimCell[]; kind: 'line' | 'ways' | 'cluster'; overvolt?: boolean }[];
  seed?: number; equity?: number; winTier?: 'small' | 'big' | 'mega' | 'jackpot';
  /** Authoritative orb-plan order; null entries reserve a launch slot (scrap). */
  launchOrder?: (AnimCell | null)[];
  floorId?: FloorId; grain?: boolean; exitEdge?: 'bottom' | 'right';
}
export interface TumbleStepParams extends Motion {
  cols: number; rows: number; cleared: AnimCell[]; gridAfter: SymbolId[][];
  seed?: number; floorId?: FloorId; grain?: boolean;
}
export interface GridRelayoutParams extends Motion {
  from: { cols: number; rows: number }; to: { cols: number; rows: number };
  seed?: number; floorId?: FloorId; grain?: boolean;
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- names the empty reduced-motion payload
export interface FeverParams extends Motion {}
export interface BossIntroParams extends Motion { bossId: BossId; bossName: string; tagline: string }
export interface FloorTransitionParams extends Motion { fromFloor: FloorId; toFloor: FloorId; floorName: string }
export interface VictoryParams extends Motion { seedText: string; bankroll: number }
export interface GameOverParams extends Motion { seedText: string; floorName: string; round: number }

// ---------------------------------------------------------------- C-7
/** Every logical sprite key the game may request. tools/assets must resolve each (asset or placeholder). */
export const SPRITE_KEYS = [
  'symbol.diamond', 'symbol.cherry', 'symbol.uranium', 'symbol.skull', 'symbol.seven', 'symbol.scrap',
  'token.diamond', 'token.cherry', 'token.uranium', 'token.skull', 'token.bullion', 'token.copper', 'token.ice',
  'peg.gold', 'peg.splitter', 'peg.bumper', 'peg.golden',
  'boss.valenti', 'boss.zero', 'boss.auditor',
  'floor.FLOOR_NEON.bg', 'floor.FLOOR_CRYO.bg', 'floor.FLOOR_FOUNDRY.bg', 'floor.FLOOR_PENTHOUSE.bg',
  'ui.cabinet', 'ui.bezel', 'ui.dozer', 'ui.lip', 'ui.gutter', 'ui.panel', 'ui.button',
  'vfx.spark', 'vfx.coinburst', 'vfx.shock', 'vfx.freeze',
] as const;
/** Item sprites are `trinket.<id>`, `drink.<id>`, `coin.<id>`, `chassis.<id>`, `glyph.<id>`. */
export type SpriteKey = (typeof SPRITE_KEYS)[number] | `${'trinket' | 'drink' | 'coin' | 'chassis' | 'glyph'}.${string}`;

export type AssetManifest = Record<
  string,
  | { atlas: string; frame: { x: number; y: number; w: number; h: number }; pivot: { x: number; y: number }; source: string; sha256: string }
  | { placeholder: true }
>;

// ---------------------------------------------------------------- C-8
export const TEST_IDS = {
  spinBtn: 'spin-btn',
  bankroll: 'bankroll',
  quota: 'quota',
  spinsLeft: 'spins-left',
  fever: 'fever',
  floorBadge: 'floor-badge',
  trinketRail: 'trinket-rail',
  trinket: (id: string) => `trinket-${id}`,
  shopOffer: (n: number) => `shop-offer-${n}`,
  shopReroll: 'shop-reroll',
  shopExpand: 'shop-expand',
  shopLeave: 'shop-leave',
  elevator: (floorId: FloorId) => `elevator-${floorId}`,
  bossBar: 'boss-bar',
  seedDisplay: 'seed-display',
  gameover: 'gameover',
  victory: 'victory',
  settingsMute: 'settings-mute',
  settingsMotion: 'settings-motion',
} as const;

/** Exposed as window.__JS_TEST__ only when the page is opened with ?test=1. */
export interface TestApi {
  newRun(seed: string): void;
  dispatch(cmd: Command): ReturnType<GameCore['dispatch']>;
  runUntil(target: Phase | ((core: GameCore) => boolean), maxTicks: number): Promise<boolean>;
  getState(): ReturnType<GameCore['getState']>;
  stateHash(): string;
  setSpeed(multiplier: number): void;
  grantCash(amount: number): void;
}

// ------------------------------------------------- 2.5D board projection
/**
 * Reference projection for drawing the 2D shelf in 2.5D. The sim is flat;
 * the board renderer and any shelf VFX should share this so they line up.
 * Returns screen-space x/y in board units plus a size scale.
 */
export function projectShelf(x: number, y: number, splitY = 275, boardH = 510, boardW = 600): { x: number; y: number; scale: number } {
  if (y <= splitY) return { x, y, scale: 0.8 };
  const d = (y - splitY) / (boardH - splitY);
  const scale = 0.8 + 0.28 * d;
  const cx = boardW / 2;
  return { x: cx + (x - cx) * scale, y: splitY + (y - splitY) * (0.78 + 0.22 * d), scale };
}
