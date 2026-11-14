/**
 * Shared constants. CONTRACTS_REV is bumped by the integrator whenever a
 * contract in this package changes shape or value.
 */
export const CONTRACTS_REV = 1;

// ---------------------------------------------------------------- time (C-6)
export const TICKS_PER_SECOND = 60;
/** Tick offset (after the Spin command) at which reel `col` (0-based) lands. */
export const REEL_STOP_TICK = (col: number): number => 30 + 12 * col;
/** Evaluation happens this many ticks after the last reel stops. */
export const EVAL_DELAY_TICKS = 6;
/** First orb launches this many ticks after evaluation. */
export const ORB_LAUNCH_DELAY_TICKS = 6;
export const ORB_LAUNCH_INTERVAL_TICKS = 6;

/** Fixed animation durations the engine schedules against, in ticks. */
export const ANIM_TICKS = {
  tumbleStep: 36,
  gridRelayout: 90,
  fever: 60,
  bossIntro: 180,
  floorTransition: 150,
  victory: 240,
  gameOver: 180,
} as const;

// ------------------------------------------------------- board geometry (C-3)
/**
 * Logical simulation space. The sim never sees pixels; renderers scale and
 * project these units. Y grows downward (toward the player / payout lip).
 */
export const BOARD = {
  W: 600,
  H: 510,
  /** Boundary between pinfield (above) and pusher shelf (below). */
  SPLIT_Y: 275,
  CHUTE_H: 26,
  CHUTE_COUNT: 5,
  GUTTER_W: 42,
  /** A token whose leading edge reaches this line has dropped over the lip. */
  LIP_Y: 484,
  /** Fully retracted blade front. */
  DOZER_BACK_Y: 301,
  DOZER_STROKE: 34,
  SURGE_STROKE: 54,
  SURGE_TICKS: 45,
  /** Radians of dozer phase per tick while surging. */
  SURGE_SPEED: 0.18,
  LAUNCH_Y: 18,
  /** Where a token appears when its orb leaves a chute. */
  TOKEN_SPAWN_Y: 313,
  ORB_RADIUS: 9,
} as const;

export const SIM = {
  /** Downward acceleration per tick, multiplied by orb mass (heavier falls faster, by design). */
  GRAVITY: 0.21,
  WALL_RESTITUTION: 0.75,
  BUMPER_RESTITUTION: 1.25,
  MAX_ORBS_IN_FLIGHT: 48,
  MAX_TOKENS: 150,
  /** An orb older than this is forced out through the chute below it. */
  ORB_MAX_AGE_TICKS: 1800,
  /** Ticks of no orbs in flight required before a round is judged. */
  ROUND_SETTLE_TICKS: 300,
} as const;

/** Initial chute multipliers, left to right. Content may override per floor. */
export const DEFAULT_CHUTE_MULTS = [0.8, 1.5, 3.0, 1.5, 2.0] as const;

// --------------------------------------------------------------------- rules
export const RULES = {
  SPINS_PER_ROUND: 7,
  NORMAL_ROUNDS_PER_FLOOR: 3,
  FEVER_PER_SPIN: 20,
  FEVER_RESET: 20,
  FEVER_ORBS: 8,
  SCRAP_EQUITY: 0.15,
  SHOP_START_CAPACITY: 4,
  SHOP_MAX_CAPACITY: 10,
  SHOP_REROLL_BASE: 25,
  SHOP_REROLL_GROWTH: 1.45,
  SHOP_EXPAND_BASE: 150,
  SHOP_EXPAND_GROWTH: 1.6,
  MAX_COLS: 5,
  MAX_ROWS: 4,
  MIN_COLS: 3,
  MIN_ROWS: 3,
  MAX_JUMPERS: 3,
  MAX_TUMBLES: 5,
  DRINK_TRAY_SLOTS: 3,
  SHELF_SEED_TOKENS: 20,
} as const;

export const SAVE_VERSION = 1;
export const STORAGE_KEYS = {
  save: 'js.save.v1',
  settings: 'js.settings.v1',
  compendium: 'js.compendium.v1',
} as const;
