/**
 * C-1: content shapes. These TypeScript types are the source of truth; the
 * Zod schemas the content package validates with must infer to exactly these
 * (add `satisfies z.ZodType<SymbolDef>` on each schema).
 */
import type { PegDef } from './sim';

export type SymbolId = 'diamond' | 'cherry' | 'uranium' | 'skull' | 'seven';
export type BossId = 'valenti' | 'zero' | 'auditor';
export type FloorId = 'FLOOR_NEON' | 'FLOOR_CRYO' | 'FLOOR_FOUNDRY' | 'FLOOR_PENTHOUSE';
export type Wiring = 'CLASSIC' | 'HYPER' | 'WAYS' | 'CLUSTER';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'cursed';
export type ItemCategory = 'TRINKET' | 'DRINK' | 'REEL' | 'COIN' | 'CHASSIS';
export type ShopArchetype = 'DRINKS' | 'TRINKETS' | 'REELS' | 'MIXED';

/** A reference to an effect handler (C-4) plus its parameters. */
export interface HandlerRef {
  handler: string;
  params?: Record<string, number | string | boolean>;
}

export interface SymbolDef {
  id: SymbolId;
  name: string;
  rarity: Rarity;
  spriteKey: string;
  slot: { chips: number; addMult: number; xMult: number; fullLineXMult?: number; drainIfIdle?: number };
  orb: { mass: number; elasticity: number; canSplit: boolean; splitOnFirstPeg: boolean; magnet: boolean; accelPerHit: number; chainGold: boolean; upgradesPegs: boolean };
  token: { skin: string; radius: number; mass: number; slide: number; count: number; stack: number; weldOnLand: boolean; magnetic: boolean; seismic: boolean; gutterDrain?: number };
  /** Extra slot-stage behaviours, e.g. diamond adjacency. */
  effects: HandlerRef[];
}

interface ItemBase {
  id: string;
  name: string;
  desc: string;
  price: number;
  spriteKey: string;
  rarity: Rarity;
}
export interface TrinketDef extends ItemBase { category: 'TRINKET'; effects: HandlerRef[] }
export interface DrinkDef extends ItemBase { category: 'DRINK'; instant: boolean; effects: HandlerRef[] }
export interface CoinDef extends ItemBase { category: 'COIN'; massMul: number; bounceMul: number; payoutMul: number; costPerSpin: number; resistSuction: boolean }
export interface GlyphDef extends ItemBase { category: 'REEL'; symbolId: SymbolId; bonusTokens: number }
export type ChassisKind = 'ADD_COLUMN' | 'ADD_ROW' | 'HARNESS_HYPER' | 'HARNESS_WAYS' | 'HARNESS_CLUSTER' | 'JUMPER' | 'OVERVOLT';
export interface ChassisDef extends ItemBase { category: 'CHASSIS'; kind: ChassisKind; repeatPrices?: number[] }
export type ItemDef = TrinketDef | DrinkDef | CoinDef | GlyphDef | ChassisDef;

export interface FloorDef {
  id: FloorId;
  name: string;
  order: 1 | 2 | 3;
  /** Floors offered by the elevator after this floor's boss. Empty = run ends in victory. */
  next: FloorId[];
  bossId: BossId;
  physics: { friction: number; gutterRisk: number; dozerSpeed: number; pegs: PegDef[] };
  chuteMults: number[];
  pegChips: { gold: number; bumper: number; golden: number; splitter: number };
  lipMult: number;
  quotaScale: number;
  shop: { archetypeWeights: Record<ShopArchetype, number>; categoryWeights: Record<ItemCategory, number>; rarityWeights: Record<Rarity, number> };
  bgSpriteKey: string;
}

export interface BossDef {
  id: BossId;
  name: string;
  tagline: string;
  spriteKey: string;
  score: HandlerRef;
  sabotage: HandlerRef[];
  reward: HandlerRef;
}

export interface BalanceDef {
  startBankroll: number;
  cashPerChip: number;
  /** Quota for normal rounds 1..9 before floor.quotaScale. */
  quotas: number[];
  minMatch: number;
  /** Default reel strip (symbol ids, repeated to set weights) used for every column. */
  baseStrip: SymbolId[];
  /** Column 0 override (cherries placed in adjacent pairs). */
  firstReelStrip: SymbolId[];
}

export interface ContentBundle {
  symbols: SymbolDef[];
  items: ItemDef[];
  floors: FloorDef[];
  bosses: BossDef[];
  balance: BalanceDef;
}
