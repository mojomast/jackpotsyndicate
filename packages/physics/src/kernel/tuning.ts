/**
 * Every tunable physics number lives here so balance work never has to touch
 * solver code. Values marked "tuned" were fitted with tools/physics-harness
 * against the per-floor gutter-rake targets (AC-5); change them only with the
 * harness open.
 */
export const TUNE = {
  // ---- pinfield
  ORB_MAX_SPEED: 11, // keeps an orb (r=9) from tunnelling a peg (r>=5.5) in one tick
  ORB_LAUNCH_VX: 1.1,
  ORB_LAUNCH_VY: 1.2,
  PEG_JITTER: 0.425,
  CENTER_PULL_ORB: 0.0012,
  MAGNET_ORB_RANGE: 60,
  CHAIN_GOLD_RANGE: 45,
  GOLDEN_PEG_RADIUS: 8,
  PEG_FLASH_TICKS: 8,
  SPLIT_OFFSET_X: 8,
  ACCEL_CAP: 2,

  // ---- shelf solver
  ITERATIONS: 4,
  /** Extra clearance kept between tokens. */
  CONTACT_SLOP: 0.5,
  /** Largest positional correction per pair per iteration; stops spawn overlaps exploding. */
  MAX_CORRECTION: 3,
  TOKEN_MAX_SPEED: 6,
  SLEEP_SPEED: 0.004,
  /** How strongly a token's own `slide` shifts the floor friction. */
  SLIDE_GAIN: 0.08,
  DAMP_MIN: 0.5,
  DAMP_MAX: 0.985,
  STROKE_SLEW: 1.5,

  // ---- sideways spreading / rake (tuned)
  /** Fraction of the sideways part of each contact correction that is applied, at gutterRisk 1. */
  LATERAL_BASE: 0.85,
  LATERAL_RISK_POWER: 1,
  LATERAL_MAX: 1.25,
  WELD_LATERAL: 0.25,
  /** Outward acceleration (divided by mass) on the bevelled strip beside each gutter. */
  EDGE_DRIFT: 0.02,
  /** Bevel width = EDGE_ZONE * gutterRisk^EDGE_RISK_POWER + EDGE_ZONE_OFFSET. Main rake control. */
  EDGE_ZONE: 26,
  EDGE_RISK_POWER: 2,
  EDGE_ZONE_OFFSET: 0,
  /** A token is lost once it overhangs the gutter line by more than this. */
  GUTTER_OVERHANG: 6,
  LIP_OVERHANG: 0.4,

  // ---- shelf forces
  CENTER_PULL_TOKEN: 0.0008,
  MAGNET_TOKEN_PULL: 0.0016,
  MAGNET_TOKEN_RANGE: 60,
  SUCTION_ACCEL: 0.045,
  SUCTION_RESIST: 0.25,
  SEISMIC_RANGE: 45,
  SEISMIC_PUSH: 6,
  WELD_RANGE: 60,
  WELD_PARTNERS: 2,
  BOUNCE_VX: 2.2,
  BOUNCE_INSET: 8,
  ICE_MASS: 3,
  ICE_RADIUS: 13,
  LIFT_SMOOTH: 0.1,
  MAX_VISUAL_STACK: 5,
} as const;

export type Tuning = { -readonly [K in keyof typeof TUNE]: number };
