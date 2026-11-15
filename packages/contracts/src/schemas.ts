import { z } from 'zod';
import type {
  BalanceDef,
  BossDef,
  BossId,
  ChassisDef,
  CoinDef,
  ContentBundle,
  DrinkDef,
  FloorDef,
  FloorId,
  GlyphDef,
  HandlerRef,
  ItemCategory,
  ItemDef,
  Rarity,
  ShopArchetype,
  SymbolDef,
  SymbolId,
  TrinketDef,
  Wiring,
} from './content';
import type {
  Command,
  EngineEvent,
  GameEvent,
  Phase,
  RoundResult,
  SaveFile,
  RunState,
  ShopOffer,
  WinEval,
} from './protocol';
import type { PegDef, PegKind, PhysicsEvent, TokenTemplate } from './sim';

const nonNegativeInt = z.number().int().nonnegative();
const positive = z.number().positive();

export const symbolIdSchema = z.enum(['diamond', 'cherry', 'uranium', 'skull', 'seven']) satisfies z.ZodType<SymbolId>;
export const bossIdSchema = z.enum(['valenti', 'zero', 'auditor']) satisfies z.ZodType<BossId>;
export const floorIdSchema = z.enum(['FLOOR_NEON', 'FLOOR_CRYO', 'FLOOR_FOUNDRY', 'FLOOR_PENTHOUSE']) satisfies z.ZodType<FloorId>;
export const wiringSchema = z.enum(['CLASSIC', 'HYPER', 'WAYS', 'CLUSTER']) satisfies z.ZodType<Wiring>;
export const raritySchema = z.enum(['common', 'rare', 'epic', 'legendary', 'cursed']) satisfies z.ZodType<Rarity>;
export const itemCategorySchema = z.enum(['TRINKET', 'DRINK', 'REEL', 'COIN', 'CHASSIS']) satisfies z.ZodType<ItemCategory>;
export const shopArchetypeSchema = z.enum(['DRINKS', 'TRINKETS', 'REELS', 'MIXED']) satisfies z.ZodType<ShopArchetype>;
export const pegKindSchema = z.enum(['gold', 'splitter', 'bumper', 'golden']) satisfies z.ZodType<PegKind>;

export const handlerRefSchema = z.object({
  handler: z.string(),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
}) satisfies z.ZodType<HandlerRef>;

export const pegDefSchema = z.object({
  id: z.number().int(),
  x: z.number(),
  y: z.number(),
  kind: pegKindSchema,
  radius: positive,
}) satisfies z.ZodType<PegDef>;

export const tokenTemplateSchema = z.object({
  symbolId: z.string(),
  skin: z.string(),
  radius: positive,
  mass: positive,
  slide: z.number().min(0).max(1),
  count: positiveIntLike(),
  stack: positiveIntLike(),
  weldOnLand: z.boolean(),
  magnetic: z.boolean(),
  seismic: z.boolean(),
  resistSuction: z.boolean(),
}) satisfies z.ZodType<TokenTemplate>;

function positiveIntLike() {
  return z.number().int().positive();
}

export const symbolDefSchema = z.object({
  id: symbolIdSchema,
  name: z.string(),
  rarity: raritySchema,
  spriteKey: z.string(),
  slot: z.object({
    chips: nonNegativeInt,
    addMult: z.number(),
    xMult: z.number(),
    fullLineXMult: z.number().optional(),
    drainIfIdle: z.number().optional(),
  }),
  orb: z.object({
    mass: positive,
    elasticity: z.number().min(0),
    canSplit: z.boolean(),
    splitOnFirstPeg: z.boolean(),
    magnet: z.boolean(),
    accelPerHit: z.number(),
    chainGold: z.boolean(),
    upgradesPegs: z.boolean(),
  }),
  token: z.object({
    skin: z.string(),
    radius: positive,
    mass: positive,
    slide: z.number().min(0).max(1),
    count: positiveIntLike(),
    stack: positiveIntLike(),
    weldOnLand: z.boolean(),
    magnetic: z.boolean(),
    seismic: z.boolean(),
    gutterDrain: z.number().optional(),
  }),
  effects: z.array(handlerRefSchema),
}) satisfies z.ZodType<SymbolDef>;

const itemBaseShape = {
  id: z.string(),
  name: z.string(),
  desc: z.string(),
  price: nonNegativeInt,
  spriteKey: z.string(),
  rarity: raritySchema,
};

export const trinketDefSchema = z.object({
  ...itemBaseShape,
  category: z.literal('TRINKET'),
  effects: z.array(handlerRefSchema),
}) satisfies z.ZodType<TrinketDef>;

export const drinkDefSchema = z.object({
  ...itemBaseShape,
  category: z.literal('DRINK'),
  instant: z.boolean(),
  effects: z.array(handlerRefSchema),
}) satisfies z.ZodType<DrinkDef>;

export const coinDefSchema = z.object({
  ...itemBaseShape,
  category: z.literal('COIN'),
  massMul: positive,
  bounceMul: positive,
  payoutMul: positive,
  costPerSpin: nonNegativeInt,
  resistSuction: z.boolean(),
}) satisfies z.ZodType<CoinDef>;

export const glyphDefSchema = z.object({
  ...itemBaseShape,
  category: z.literal('REEL'),
  symbolId: symbolIdSchema,
  bonusTokens: nonNegativeInt,
}) satisfies z.ZodType<GlyphDef>;

export const chassisKindSchema = z.enum(['ADD_COLUMN', 'ADD_ROW', 'HARNESS_HYPER', 'HARNESS_WAYS', 'HARNESS_CLUSTER', 'JUMPER', 'OVERVOLT']);

export const chassisDefSchema = z.object({
  ...itemBaseShape,
  category: z.literal('CHASSIS'),
  kind: chassisKindSchema,
  repeatPrices: z.array(nonNegativeInt).optional(),
}) satisfies z.ZodType<ChassisDef>;

export const itemDefSchema = z.discriminatedUnion('category', [
  trinketDefSchema,
  drinkDefSchema,
  coinDefSchema,
  glyphDefSchema,
  chassisDefSchema,
]) satisfies z.ZodType<ItemDef>;

export const floorDefSchema = z.object({
  id: floorIdSchema,
  name: z.string(),
  order: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  next: z.array(floorIdSchema),
  bossId: bossIdSchema,
  physics: z.object({
    friction: z.number().min(0).max(1),
    gutterRisk: positive,
    dozerSpeed: positive,
    pegs: z.array(pegDefSchema),
  }),
  chuteMults: z.array(z.number()),
  pegChips: z.object({
    gold: z.number(),
    bumper: z.number(),
    golden: z.number(),
    splitter: z.number(),
  }),
  lipMult: positive,
  quotaScale: positive,
  shop: z.object({
    archetypeWeights: z.object({
      DRINKS: z.number(),
      TRINKETS: z.number(),
      REELS: z.number(),
      MIXED: z.number(),
    }),
    categoryWeights: z.object({
      TRINKET: z.number(),
      DRINK: z.number(),
      REEL: z.number(),
      COIN: z.number(),
      CHASSIS: z.number(),
    }),
    rarityWeights: z.object({
      common: z.number(),
      rare: z.number(),
      epic: z.number(),
      legendary: z.number(),
      cursed: z.number(),
    }),
  }),
  bgSpriteKey: z.string(),
}) satisfies z.ZodType<FloorDef>;

export const bossDefSchema = z.object({
  id: bossIdSchema,
  name: z.string(),
  tagline: z.string(),
  spriteKey: z.string(),
  score: handlerRefSchema,
  sabotage: z.array(handlerRefSchema),
  reward: handlerRefSchema,
}) satisfies z.ZodType<BossDef>;

export const balanceDefSchema = z.object({
  startBankroll: nonNegativeInt,
  cashPerChip: positive,
  quotas: z.array(nonNegativeInt),
  minMatch: positiveIntLike(),
  baseStrip: z.array(symbolIdSchema),
  firstReelStrip: z.array(symbolIdSchema),
}) satisfies z.ZodType<BalanceDef>;

export const contentBundleSchema = z.object({
  symbols: z.array(symbolDefSchema),
  items: z.array(itemDefSchema),
  floors: z.array(floorDefSchema),
  bosses: z.array(bossDefSchema),
  balance: balanceDefSchema,
}) satisfies z.ZodType<ContentBundle>;

export const cellSchema = z.tuple([z.number().int(), z.number().int()]);

export const winEvalSchema = z.object({
  kind: z.enum(['line', 'ways', 'cluster']),
  symbolId: symbolIdSchema,
  cells: z.array(cellSchema),
  lineId: z.string().optional(),
  lineMult: z.number(),
  overvolt: z.boolean().optional(),
}) satisfies z.ZodType<WinEval>;

export const shopOfferSchema = z.object({
  offerId: z.string(),
  itemId: z.string(),
  category: itemCategorySchema,
  price: nonNegativeInt,
  sold: z.boolean(),
}) satisfies z.ZodType<ShopOffer>;

export const roundResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('normal'),
    passed: z.boolean(),
    quota: z.number(),
    bankrollBefore: z.number(),
    bankrollAfter: z.number(),
  }),
  z.object({
    kind: z.literal('boss'),
    passed: z.boolean(),
    playerScore: z.number(),
    bossScore: z.number(),
  }),
]) satisfies z.ZodType<RoundResult>;

export const phaseSchema = z.enum([
  'TITLE',
  'PREP',
  'SPINNING',
  'RESOLVING',
  'ROUND_SETTLE',
  'ROUND_RESULT',
  'SHOP',
  'RELIC_PICK',
  'JUMPER_PICK',
  'BOSS_INTRO',
  'ELEVATOR',
  'FLOOR_TRANSITION',
  'GAME_OVER',
  'VICTORY',
]) satisfies z.ZodType<Phase>;

export const runStateSchema = z.object({
  saveVersion: z.number().int(),
  seed: z.string(),
  rng: z.record(z.string(), z.array(z.number())),
  tick: z.number().int(),
  phase: phaseSchema,
  floorId: floorIdSchema,
  floorsCleared: z.array(floorIdSchema),
  round: z.number().int(),
  spinsLeft: z.number().int(),
  bankroll: z.number(),
  roundCash: z.number(),
  fever: z.number(),
  grid: z.object({
    cols: z.number().int(),
    rows: z.number().int(),
    wiring: wiringSchema,
    strips: z.array(z.array(symbolIdSchema)),
    visible: z.array(z.array(symbolIdSchema)),
    frozen: z.array(z.object({ cell: cellSchema, spins: z.number().int() })),
  }),
  jumpers: z.array(z.array(cellSchema)),
  overvoltLineId: z.string().nullable(),
  trinkets: z.array(z.string()),
  drinkTray: z.array(z.string().nullable()),
  activeDrink: z.string().nullable(),
  ownedCoins: z.array(z.string()),
  loadedCoin: z.string(),
  nextSpin: z.object({
    xBonus: z.record(z.string(), z.number()),
    addMult: z.number(),
    bonusOrbs: z.number().int(),
  }),
  shop: z.object({
    capacity: z.number().int(),
    rerollCost: z.number(),
    expandCost: z.number(),
    archetype: shopArchetypeSchema.nullable(),
    offers: z.array(shopOfferSchema),
  }),
  boss: z.object({ score: z.number(), spin: z.number().int() }).nullable(),
  orbChips: z.record(z.number(), z.number()),
  tokenCash: z.record(z.number(), z.number()),
  stats: z.object({
    spins: z.number().int(),
    lipDrops: z.number().int(),
    gutterLosses: z.number().int(),
    cashBanked: z.number(),
    bestSpinEquity: z.number(),
  }),
}) satisfies z.ZodType<RunState>;

export const saveFileSchema = z.object({
  saveVersion: z.number().int(),
  contractsRev: z.number().int(),
  run: runStateSchema,
  simBase64: z.string(),
  stateHash: z.string(),
}) satisfies z.ZodType<SaveFile>;

const exitInfoShape = {
  tokenId: z.number().int(),
  symbolId: z.string(),
  skin: z.string(),
  x: z.number(),
  y: z.number(),
  vx: z.number(),
  vy: z.number(),
  radius: positive,
  stack: positiveIntLike(),
  magnetic: z.boolean(),
};

export const engineEventSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('SpinStarted'), spinIndex: z.number().int(), cols: z.number().int(), rows: z.number().int() }),
  z.object({ t: z.literal('ReelStopped'), col: z.number().int(), symbols: z.array(symbolIdSchema) }),
  z.object({
    t: z.literal('SpinEvaluated'),
    grid: z.array(z.array(symbolIdSchema)),
    wins: z.array(winEvalSchema),
    chips: z.number(),
    addMult: z.number(),
    xMult: z.number(),
    equity: z.number(),
    orbPlan: z.array(z.object({ cell: cellSchema.nullable(), symbolId: z.string(), chips: z.number() })),
  }),
  z.object({ t: z.literal('TumbleStep'), cleared: z.array(cellSchema), gridAfter: z.array(z.array(symbolIdSchema)) }),
  z.object({ t: z.literal('OrbValued'), orbId: z.number().int(), chips: z.number() }),
  z.object({ t: z.literal('TokenValued'), tokenId: z.number().int(), cash: z.number() }),
  z.object({ t: z.literal('CashBanked'), tokenId: z.number().int(), cash: z.number(), x: z.number() }),
  z.object({ t: z.literal('FeverChanged'), value: z.number() }),
  z.object({ t: z.literal('FeverTriggered') }),
  z.object({ t: z.literal('CellsFrozen'), cells: z.array(cellSchema), spins: z.number().int() }),
  z.object({ t: z.literal('BossScored'), delta: z.number(), total: z.number(), playerScore: z.number() }),
  z.object({ t: z.literal('BossSabotage'), kind: z.string() }),
  z.object({ t: z.literal('RoundSettled'), result: roundResultSchema }),
  z.object({ t: z.literal('PhaseChanged'), from: phaseSchema, to: phaseSchema }),
  z.object({
    t: z.literal('ShopRolled'),
    archetype: shopArchetypeSchema,
    offers: z.array(shopOfferSchema),
    rerollCost: z.number(),
    expandCost: z.number().nullable(),
  }),
  z.object({ t: z.literal('ItemBought'), offerId: z.string(), itemId: z.string(), price: z.number() }),
  z.object({ t: z.literal('TrinketMounted'), itemId: z.string(), count: z.number().int() }),
  z.object({ t: z.literal('DrinkActive'), itemId: z.string().nullable() }),
  z.object({ t: z.literal('CoinLoaded'), coinId: z.string() }),
  z.object({
    t: z.literal('GridMutated'),
    from: z.object({ cols: z.number().int(), rows: z.number().int() }),
    to: z.object({ cols: z.number().int(), rows: z.number().int() }),
    wiring: wiringSchema,
  }),
  z.object({ t: z.literal('JumpersOffered'), options: z.array(z.array(cellSchema)) }),
  z.object({ t: z.literal('RelicsOffered'), itemIds: z.array(z.string()) }),
  z.object({
    t: z.literal('BankrollChanged'),
    delta: z.number(),
    total: z.number(),
    reason: z.enum(['lip', 'quota', 'shop', 'drain', 'coin', 'bonus']),
  }),
  z.object({ t: z.literal('RunStarted'), seed: z.string() }),
  z.object({ t: z.literal('RunEnded'), outcome: z.enum(['victory', 'defeat', 'abandoned']) }),
]) satisfies z.ZodType<EngineEvent>;

export const physicsEventSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('OrbLaunched'), orbId: z.number().int(), x: z.number(), symbolId: z.string() }),
  z.object({
    t: z.literal('PegHit'),
    orbId: z.number().int(),
    pegId: z.number().int(),
    kind: pegKindSchema,
    hitIndex: z.number().int(),
    chained: z.boolean(),
  }),
  z.object({ t: z.literal('PegUpgraded'), pegId: z.number().int() }),
  z.object({ t: z.literal('OrbSplit'), parentId: z.number().int(), childId: z.number().int() }),
  z.object({ t: z.literal('OrbForcedDown'), orbId: z.number().int() }),
  z.object({
    t: z.literal('ChuteExit'),
    orbId: z.number().int(),
    symbolId: z.string(),
    chute: z.number().int(),
    x: z.number(),
    tokenIds: z.array(z.number().int()),
    mergedInto: z.array(z.number().int()),
  }),
  z.object({ t: z.literal('TokenSpawned'), tokenId: z.number().int(), x: z.number(), y: z.number(), symbolId: z.string() }),
  z.object({ t: z.literal('TokenMerged'), intoId: z.number().int(), symbolId: z.string() }),
  z.object({ t: z.literal('WeldFormed'), tokenId: z.number().int(), partnerIds: z.array(z.number().int()) }),
  z.object({ t: z.literal('LipDrop'), ...exitInfoShape }),
  z.object({ t: z.literal('GutterLoss'), side: z.enum(['left', 'right']), ...exitInfoShape }),
  z.object({ t: z.literal('GutterBounce'), tokenId: z.number().int(), side: z.enum(['left', 'right']) }),
  z.object({ t: z.literal('TokenRemoved'), tokenId: z.number().int(), reason: z.enum(['sweep', 'clear']) }),
  z.object({ t: z.literal('DozerFullExtension'), count: z.number().int() }),
  z.object({ t: z.literal('SurgeStarted') }),
  z.object({ t: z.literal('SurgeEnded') }),
]) satisfies z.ZodType<PhysicsEvent>;

export const gameEventSchema = z.intersection(
  z.union([engineEventSchema, physicsEventSchema]),
  z.object({ tick: z.number().int() }),
) satisfies z.ZodType<GameEvent>;

export const commandSchema = z.discriminatedUnion('c', [
  z.object({ c: z.literal('NewRun'), seed: z.string() }),
  z.object({ c: z.literal('LoadCoin'), coinId: z.string() }),
  z.object({ c: z.literal('Drink'), slot: z.number().int() }),
  z.object({ c: z.literal('Spin') }),
  z.object({ c: z.literal('ContinueAfterRound') }),
  z.object({
    c: z.literal('ShopBuy'),
    offerId: z.string(),
    target: z.object({ reel: z.number().int().optional() }).optional(),
  }),
  z.object({ c: z.literal('ShopReroll') }),
  z.object({ c: z.literal('ShopExpand') }),
  z.object({ c: z.literal('ShopLeave') }),
  z.object({ c: z.literal('ChooseFloor'), floorId: floorIdSchema }),
  z.object({ c: z.literal('ChooseRelic'), index: z.number().int() }),
  z.object({ c: z.literal('ChooseJumper'), index: z.number().int() }),
  z.object({ c: z.literal('SetOvervolt'), lineId: z.string().nullable() }),
  z.object({ c: z.literal('AbandonRun') }),
]) satisfies z.ZodType<Command>;

export interface GridFixture {
  id: string;
  wiring: Wiring;
  cols: number;
  rows: number;
  grid: SymbolId[][];
  expected: { wins: WinEval[]; chips: number; addMult: number; xMult: number };
}

export const gridFixtureSchema = z.object({
  id: z.string(),
  wiring: wiringSchema,
  cols: z.number().int(),
  rows: z.number().int(),
  grid: z.array(z.array(symbolIdSchema)),
  expected: z.object({
    wins: z.array(winEvalSchema),
    chips: z.number(),
    addMult: z.number(),
    xMult: z.number(),
  }),
}) satisfies z.ZodType<GridFixture>;
