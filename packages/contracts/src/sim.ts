/**
 * C-3: the physics boundary.
 *
 * The simulation is value-agnostic: it knows shapes, masses and flags, never
 * chips or cash. The engine keeps `orbId -> chips` and `tokenId -> cash` maps
 * and updates them from the events below (PegHit, OrbSplit, ChuteExit,
 * TokenMerged, LipDrop, GutterLoss).
 *
 * The simulation is 2D. Rendering is 2.5D: `stack`, `lift`, velocities and the
 * exit events carry everything a perspective renderer needs.
 */

export type BodyId = number;

export type PegKind = 'gold' | 'splitter' | 'bumper' | 'golden';

export interface PegDef {
  id: number;
  x: number;
  y: number;
  kind: PegKind;
  radius: number;
}

/** Per-floor physics, from content. */
export interface FloorPhysics {
  /** Per-tick velocity retention of shelf tokens, 0..1. Higher slides further. */
  friction: number;
  /** 1.0 is the baseline 18% rake floor. Scales sideways spreading on the shelf. */
  gutterRisk: number;
  /** Radians of dozer phase per tick. */
  dozerSpeed: number;
  pegs: PegDef[];
}

/** Trinket/boss adjustments. Recomputed by the engine and pushed with `configure`. */
export interface PhysicsModifiers {
  dozerSpeedMul: number;
  dozerStrokeMul: number;
  /** Constant pull toward centre X on orbs (0 = off, 1 = Electromagnetic Hopper strength). */
  centerPullOrbs: number;
  /** Constant pull toward centre X on tokens. */
  centerPullTokens: number;
  /**
   * One entry per gutter-bumper trinket. A token reaching a gutter rolls each
   * chance independently (seeded); any success bounces it back onto the shelf.
   */
  gutterBounceChances: number[];
  /** Outward lateral pull on shelf tokens (boss suction). 0 = off, 1 = Valenti strength. */
  suction: number;
}

export const DEFAULT_MODIFIERS: PhysicsModifiers = {
  dozerSpeedMul: 1,
  dozerStrokeMul: 1,
  centerPullOrbs: 0,
  centerPullTokens: 0,
  gutterBounceChances: [],
  suction: 0,
};

/** What a token looks like and how it behaves on the shelf. */
export interface TokenTemplate {
  /** Content id of the symbol, or 'scrap' / 'ice' / 'copper'. */
  symbolId: string;
  /** Sprite key suffix, e.g. 'diamond', 'bullion', 'ice'. */
  skin: string;
  radius: number;
  mass: number;
  /** 0..1, lower slides further (Diamond 0.35, Cherry 0.50, Uranium 0.25; default 0.5). */
  slide: number;
  /** How many separate tokens to spawn (Cherry micro-medals = 2). */
  count: number;
  /** Visual tower height (Seven bullion = 3). The engine scales cash to match. */
  stack: number;
  /** Diamond: weld to the 2 nearest tokens on landing. */
  weldOnLand: boolean;
  /** Skull: pulls nearby tokens toward centre X, resists suction. */
  magnetic: boolean;
  /** Uranium: shoves neighbours toward the lip at each dozer full extension. */
  seismic: boolean;
  /** Lead Slug: resists boss suction. */
  resistSuction: boolean;
}

export interface TokenSpec extends TokenTemplate {
  x: number;
  y: number;
}

export interface OrbSpec {
  x: number;
  symbolId: string;
  mass: number;
  elasticity: number;
  /** May be cloned by a splitter gate. */
  canSplit: boolean;
  /** Cherry: also splits on its first peg hit of any kind. */
  splitOnFirstPeg: boolean;
  /** Skull: pulls itself and nearby orbs toward centre X. */
  magnet: boolean;
  /** Uranium: fractional speed gain per peg hit (0.12), capped at x2. */
  accelPerHit: number;
  /** Diamond: a gold-peg hit also triggers gold pegs within 45 units. */
  chainGold: boolean;
  /** Seven: upgrades a struck gold peg to a golden bumper for the rest of the floor. */
  upgradesPegs: boolean;
  /** Token(s) to spawn when this orb leaves a chute. */
  token: TokenTemplate;
}

export type SimDirective =
  | { t: 'surge' }
  | { t: 'seedShelf'; tokens: TokenTemplate[] }
  | { t: 'dropIceBlocks'; count: number }
  | { t: 'sweepCenter'; count: number }
  /** Shove every shelf token `distance` units toward the lip (Tesla, etc.). */
  | { t: 'nudgeForward'; distance: number }
  | { t: 'clearShelf' }
  | { t: 'clearOrbs' };

export type ExitInfo = {
  tokenId: BodyId;
  symbolId: string;
  skin: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  stack: number;
  magnetic: boolean;
};

export type PhysicsEvent =
  | { t: 'OrbLaunched'; orbId: BodyId; x: number; symbolId: string }
  | { t: 'PegHit'; orbId: BodyId; pegId: number; kind: PegKind; hitIndex: number; chained: boolean }
  | { t: 'PegUpgraded'; pegId: number }
  | { t: 'OrbSplit'; parentId: BodyId; childId: BodyId }
  | { t: 'OrbForcedDown'; orbId: BodyId }
  | { t: 'ChuteExit'; orbId: BodyId; symbolId: string; chute: number; x: number; tokenIds: BodyId[]; mergedInto: BodyId[] }
  | { t: 'TokenSpawned'; tokenId: BodyId; x: number; y: number; symbolId: string }
  /** Shelf was full: the new token was absorbed by `intoId` instead of spawning. */
  | { t: 'TokenMerged'; intoId: BodyId; symbolId: string }
  | { t: 'WeldFormed'; tokenId: BodyId; partnerIds: BodyId[] }
  | ({ t: 'LipDrop' } & ExitInfo)
  | ({ t: 'GutterLoss'; side: 'left' | 'right' } & ExitInfo)
  | { t: 'GutterBounce'; tokenId: BodyId; side: 'left' | 'right' }
  | { t: 'TokenRemoved'; tokenId: BodyId; reason: 'sweep' | 'clear' }
  | { t: 'DozerFullExtension'; count: number }
  | { t: 'SurgeStarted' }
  | { t: 'SurgeEnded' };

export interface SimSnapshot {
  tick: number;
  dozer: { frontY: number; stroke: number; surging: boolean; reciprocations: number };
  suction: number;
  pegs: { id: number; x: number; y: number; kind: PegKind; radius: number; flash: number }[];
  orbs: { id: BodyId; x: number; y: number; vx: number; vy: number; radius: number; symbolId: string }[];
  tokens: {
    id: BodyId;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    symbolId: string;
    skin: string;
    stack: number;
    welded: boolean;
    /** 0..1 crowding pressure, smoothed. Cosmetic: renderers raise/tilt crowded coins. */
    lift: number;
  }[];
  queuedOrbs: number;
}

export interface SimWorld {
  /** Set floor physics and modifiers. Replaces the peg layout only when `resetPegs` is true. */
  configure(floor: FloorPhysics, mods: PhysicsModifiers, resetPegs: boolean): void;
  /** Update modifiers only (cheap; call whenever trinkets or boss state change). */
  setModifiers(mods: PhysicsModifiers): void;
  /** Queue an orb. It enters the pinfield as soon as fewer than the cap are in flight. */
  launchOrb(spec: OrbSpec): BodyId;
  /** Spawn token(s) directly on the shelf. Returns spawned ids (empty if merged at cap). */
  spawnToken(spec: TokenSpec): BodyId[];
  applyDirective(d: SimDirective): void;
  /**
   * Events caused by spawnToken/applyDirective since the last step or drain.
   * Call right after those when the result matters immediately (e.g. in menus,
   * where the sim is not stepping). Anything not drained is returned by the next step().
   */
  drainEvents(): PhysicsEvent[];
  /** Advance exactly one 1/60 s tick. Returns this tick's events, preceded by any undrained ones. */
  step(): PhysicsEvent[];
  snapshot(): SimSnapshot;
  serialize(): Uint8Array;
  deserialize(bytes: Uint8Array): void;
  /** 16 hex chars; equal hashes mean bit-identical state. */
  hash(): string;
  counts(): { orbs: number; queued: number; tokens: number };
  readonly tick: number;
}

export type SimWorldFactory = (seed: number) => SimWorld;
