import { RULES } from '@jackpotsyndicate/contracts';
import type {
  ChassisKind,
  CommandError,
  FloorDef,
  ItemCategory,
  Rarity,
  ShopArchetype,
  ShopOffer,
  SymbolId,
} from '@jackpotsyndicate/contracts';

export const SHOP_ARCHETYPES = ['DRINKS', 'TRINKETS', 'REELS', 'MIXED'] as const;
export const SHOP_CATEGORIES = ['TRINKET', 'DRINK', 'REEL', 'COIN', 'CHASSIS'] as const;
export const SHOP_RARITIES = ['common', 'rare', 'epic', 'legendary', 'cursed'] as const;

export const ARCHETYPE_CATEGORIES: Record<ShopArchetype, readonly ItemCategory[]> = {
  DRINKS: ['DRINK'],
  TRINKETS: ['TRINKET'],
  REELS: ['REEL', 'COIN', 'CHASSIS'],
  MIXED: ['TRINKET', 'DRINK', 'REEL', 'COIN', 'CHASSIS'],
};

export const DEFAULT_ARCHETYPE_WEIGHTS: Record<ShopArchetype, number> = {
  DRINKS: 25,
  TRINKETS: 25,
  REELS: 25,
  MIXED: 25,
};

export const DEFAULT_CATEGORY_WEIGHTS: Record<ItemCategory, number> = {
  TRINKET: 20,
  DRINK: 20,
  REEL: 20,
  COIN: 20,
  CHASSIS: 20,
};

export const DEFAULT_RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 1,
  rare: 1,
  epic: 1,
  legendary: 1,
  cursed: 1,
};

export type SeedInput = number | string;
export type RandomSource = (() => number) | { next(): number };
export type RngInput = RandomSource | SeedInput | undefined;

export interface ShopWeightSet {
  archetypeWeights?: Partial<Record<ShopArchetype, number>>;
  categoryWeights?: Partial<Record<ItemCategory, number>>;
  rarityWeights?: Partial<Record<Rarity, number>>;
}

export type FloorInput = ShopWeightSet | FloorDef | { shop: ShopWeightSet };

export interface ShopItemLike {
  id: string;
  category: ItemCategory;
  price: number;
  rarity?: Rarity;
  symbolId?: SymbolId;
  bonusTokens?: number;
  kind?: ChassisKind;
}

export interface ShopState {
  capacity: number;
  rerollCost: number;
  expandCost: number;
  archetype: ShopArchetype | null;
  offers: ShopOffer[];
  rerolls?: number;
  expansions?: number;
}

export interface ShopRoll {
  archetype: ShopArchetype;
  offers: ShopOffer[];
  rerollCost: number;
  expandCost: number | null;
  categoryCounts: Record<ItemCategory, number>;
}

export interface RollShopOptions {
  floor?: FloorInput;
  items?: readonly ShopItemLike[];
  capacity?: number;
  count?: number;
  expansions?: number;
  rng?: RngInput;
  seed?: SeedInput;
  archetype?: ShopArchetype;
  offerIdPrefix?: string;
  avoidDuplicates?: boolean;
}

export type ShopEffect =
  | { e: 'spendBankroll'; amount: number; reason: 'shop' }
  | { e: 'grantItem'; itemId: string; category: ItemCategory; price: number }
  | { e: 'mountTrinket'; itemId: string }
  | { e: 'addDrink'; itemId: string; instant: boolean }
  | { e: 'addCoin'; itemId: string; coinId: string }
  | { e: 'addGlyph'; itemId: string; symbolId?: SymbolId; bonusTokens?: number; reel?: number }
  | { e: 'applyChassis'; itemId: string; kind?: ChassisKind }
  | { e: 'markOfferSold'; offerId: string }
  | { e: 'rerollOffers'; cost: number; archetype: ShopArchetype | null }
  | { e: 'expandCapacity'; from: number; to: number; cost: number };

export interface PurchaseOptions {
  items?: readonly ShopItemLike[];
  target?: { reel?: number };
  maxCols?: number;
}

export interface PurchaseSuccess {
  ok: true;
  offer: ShopOffer;
  itemId: string;
  category: ItemCategory;
  price: number;
  bankroll: number;
  bankrollAfter: number;
  effects: ShopEffect[];
}

export interface PurchaseFailure {
  ok: false;
  error: CommandError;
  offer?: ShopOffer;
  itemId?: string;
  category?: ItemCategory;
  price?: number;
  bankroll: number;
  effects: [];
}

export type PurchaseValidation = PurchaseSuccess | PurchaseFailure;

export type PurchaseResult =
  | (PurchaseSuccess & { shop?: ShopState })
  | (PurchaseFailure & { shop?: ShopState });

export interface MutationSuccess {
  ok: true;
  cost: number;
  effects: ShopEffect[];
}

export interface MutationFailure {
  ok: false;
  error: CommandError;
  cost: number;
  effects: [];
}

export type MutationValidation = MutationSuccess | MutationFailure;

export class ShopRng {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 1;

  constructor(seed: SeedInput) {
    this.reseed(seed);
  }

  reseed(seed: SeedInput): void {
    this.a = hashSeed(seed) | 0;
    this.b = 0x9e3779b9 | 0;
    this.c = 0x243f6a88 | 0;
    this.d = 1;
    for (let i = 0; i < 15; i++) this.nextU32();
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  next(): number {
    return this.nextU32() / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  getState(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }

  setState(state: readonly number[]): void {
    this.a = state[0]! | 0;
    this.b = state[1]! | 0;
    this.c = state[2]! | 0;
    this.d = state[3]! | 0;
  }
}

export function hashSeed(seed: SeedInput): number {
  if (typeof seed === 'number') return Number.isFinite(seed) ? seed | 0 : 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createShopRng(seed: SeedInput): ShopRng {
  return new ShopRng(seed);
}

export function isShopArchetype(value: unknown): value is ShopArchetype {
  return typeof value === 'string' && (SHOP_ARCHETYPES as readonly string[]).includes(value);
}

function isRandomSource(value: unknown): value is RandomSource {
  return (
    typeof value === 'function' ||
    (typeof value === 'object' && value !== null && typeof (value as { next?: unknown }).next === 'function')
  );
}

export function makeRandom(input?: RngInput): () => number {
  if (isRandomSource(input)) {
    if (typeof input === 'function') return input;
    return () => input.next();
  }
  const rng = new ShopRng(input ?? 1);
  return () => rng.next();
}

function weightsOf(input?: FloorInput): ShopWeightSet {
  if (input === undefined) return {};
  if (typeof input === 'object' && input !== null && 'shop' in input && input.shop) {
    return input.shop as ShopWeightSet;
  }
  return input as ShopWeightSet;
}

export function rollWeighted<K extends string>(
  weights: Partial<Record<K, number>>,
  keys?: readonly K[] | RngInput,
  rng?: RngInput,
): K {
  const list: readonly K[] = Array.isArray(keys) ? keys : (Object.keys(weights) as K[]);
  const random = makeRandom(Array.isArray(keys) ? rng : (keys as RngInput));
  if (list.length === 0) throw new Error('rollWeighted: no keys');
  let total = 0;
  for (const key of list) {
    const weight = weights[key];
    if (typeof weight === 'number' && Number.isFinite(weight) && weight > 0) total += weight;
  }
  if (total <= 0) return list[0]!;
  const roll = Math.min(Math.max(random(), 0), 0.9999999999999999) * total;
  let cursor = 0;
  let last = list[0]!;
  for (const key of list) {
    const weight = weights[key];
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) continue;
    last = key;
    cursor += weight;
    if (roll < cursor) return key;
  }
  return last;
}

export function rollArchetype(weightsOrFloor?: FloorInput | RngInput, rng?: RngInput): ShopArchetype {
  let floor: FloorInput | undefined;
  let randomInput: RngInput;
  if (
    isRandomSource(weightsOrFloor) ||
    typeof weightsOrFloor === 'number' ||
    typeof weightsOrFloor === 'string'
  ) {
    floor = undefined;
    randomInput = weightsOrFloor as RngInput;
    if (rng !== undefined) randomInput = weightsOrFloor as RngInput;
  } else {
    floor = weightsOrFloor as FloorInput | undefined;
    randomInput = rng;
  }
  const weights = { ...DEFAULT_ARCHETYPE_WEIGHTS, ...weightsOf(floor).archetypeWeights };
  return rollWeighted(weights, SHOP_ARCHETYPES, randomInput);
}

export function allowedCategories(archetype?: ShopArchetype | null): readonly ItemCategory[] {
  return archetype ? ARCHETYPE_CATEGORIES[archetype] : SHOP_CATEGORIES;
}

export function rollCategory(
  archetypeOrWeights?: ShopArchetype | FloorInput | RngInput,
  weightsOrRng?: FloorInput | RngInput,
  rng?: RngInput,
): ItemCategory {
  let archetype: ShopArchetype | undefined;
  let floor: FloorInput | undefined;
  let randomInput: RngInput;

  if (isShopArchetype(archetypeOrWeights)) {
    archetype = archetypeOrWeights;
    if (isRandomSource(weightsOrRng) || typeof weightsOrRng === 'number' || typeof weightsOrRng === 'string') {
      randomInput = weightsOrRng as RngInput;
    } else {
      floor = weightsOrRng as FloorInput | undefined;
      randomInput = rng;
    }
  } else if (
    isRandomSource(archetypeOrWeights) ||
    typeof archetypeOrWeights === 'number' ||
    typeof archetypeOrWeights === 'string'
  ) {
    randomInput = archetypeOrWeights as RngInput;
    if (
      typeof weightsOrRng === 'object' &&
      weightsOrRng !== null &&
      !isRandomSource(weightsOrRng)
    ) {
      floor = weightsOrRng as FloorInput;
    }
  } else {
    floor = archetypeOrWeights as FloorInput | undefined;
    randomInput =
      isRandomSource(weightsOrRng) || typeof weightsOrRng === 'number' || typeof weightsOrRng === 'string'
        ? (weightsOrRng as RngInput)
        : rng;
  }

  const categories = allowedCategories(archetype);
  if (categories.length === 1) return categories[0]!;
  const weights = { ...DEFAULT_CATEGORY_WEIGHTS, ...weightsOf(floor).categoryWeights };
  return rollWeighted(weights, categories, randomInput);
}

export function rollCategoryForArchetype(
  archetype: ShopArchetype,
  floor?: FloorInput,
  rng?: RngInput,
): ItemCategory {
  return rollCategory(archetype, floor, rng);
}

export function rerollPriceRaw(step: number): number {
  return RULES.SHOP_REROLL_BASE * RULES.SHOP_REROLL_GROWTH ** Math.max(0, step);
}

export function expandPriceRaw(step: number): number {
  return RULES.SHOP_EXPAND_BASE * RULES.SHOP_EXPAND_GROWTH ** Math.max(0, step);
}

export function nextRerollCost(current: number): number {
  return Math.round(current * RULES.SHOP_REROLL_GROWTH);
}

export function nextExpandCost(current: number): number {
  return Math.round(current * RULES.SHOP_EXPAND_GROWTH);
}

export function rerollPrice(step: number): number {
  const steps = Math.max(0, Math.floor(step));
  let price: number = RULES.SHOP_REROLL_BASE;
  for (let i = 0; i < steps; i++) price = nextRerollCost(price);
  return price;
}

export function expandPrice(step: number): number {
  const steps = Math.max(0, Math.floor(step));
  let price: number = RULES.SHOP_EXPAND_BASE;
  for (let i = 0; i < steps; i++) price = nextExpandCost(price);
  return price;
}

export function rerollCost(input?: number | ShopState): number {
  if (typeof input === 'object' && input !== null) return input.rerollCost;
  return rerollPrice(input ?? 0);
}

export function expandCost(input?: number | ShopState): number {
  if (typeof input === 'object' && input !== null) return input.expandCost;
  return expandPrice(input ?? 0);
}

export function clampCapacity(capacity: number): number {
  if (!Number.isFinite(capacity)) return RULES.SHOP_START_CAPACITY;
  return Math.max(
    RULES.SHOP_START_CAPACITY,
    Math.min(RULES.SHOP_MAX_CAPACITY, Math.floor(capacity)),
  );
}

export function canExpand(shop: ShopState, bankroll = Number.POSITIVE_INFINITY): boolean {
  return shop.capacity < RULES.SHOP_MAX_CAPACITY && bankroll >= shop.expandCost;
}

function pickItemIndex(
  items: readonly ShopItemLike[],
  rarityWeights: Partial<Record<Rarity, number>>,
  random: () => number,
): number {
  if (items.length === 0) return -1;
  const weights = items.map((item) => {
    const rarity = item.rarity ?? 'common';
    const weight = rarityWeights[rarity] ?? DEFAULT_RARITY_WEIGHTS[rarity];
    return typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : 0;
  });
  let total = 0;
  for (const weight of weights) total += weight;
  if (total <= 0) return Math.min(items.length - 1, Math.floor(random() * items.length));
  const roll = Math.min(Math.max(random(), 0), 0.9999999999999999) * total;
  let cursor = 0;
  let last = 0;
  for (let i = 0; i < items.length; i++) {
    const weight = weights[i]!;
    if (weight <= 0) continue;
    last = i;
    cursor += weight;
    if (roll < cursor) return i;
  }
  return last;
}

function normalizeRollOptions(
  optionsOrFloor?: RollShopOptions | FloorInput,
  items?: readonly ShopItemLike[],
  rng?: RngInput,
  capacity?: number,
): RollShopOptions {
  if (
    typeof optionsOrFloor === 'object' &&
    optionsOrFloor !== null &&
    ('items' in optionsOrFloor ||
      'floor' in optionsOrFloor ||
      'capacity' in optionsOrFloor ||
      'count' in optionsOrFloor ||
      'archetype' in optionsOrFloor ||
      'seed' in optionsOrFloor ||
      'rng' in optionsOrFloor)
  ) {
    return optionsOrFloor as RollShopOptions;
  }
  return {
    floor: optionsOrFloor as FloorInput | undefined,
    items,
    rng,
    capacity,
    count: capacity,
  };
}

export function rollShop(
  optionsOrFloor?: RollShopOptions | FloorInput,
  items?: readonly ShopItemLike[],
  rng?: RngInput,
  capacity?: number,
): ShopRoll {
  const options = normalizeRollOptions(optionsOrFloor, items, rng, capacity);
  const floor = options.floor;
  const catalog = options.items ?? [];
  const random = makeRandom(options.rng ?? options.seed);
  const archetype = options.archetype ?? rollArchetype(floor, random);
  const wanted = Math.max(
    0,
    Math.min(
      RULES.SHOP_MAX_CAPACITY,
      Math.floor(options.count ?? options.capacity ?? RULES.SHOP_START_CAPACITY),
    ),
  );
  const categories = allowedCategories(archetype);
  const availableCategories = categories.filter((category) =>
    catalog.some((item) => item.category === category),
  );
  const poolCategories =
    availableCategories.length > 0
      ? availableCategories
      : SHOP_CATEGORIES.filter((category) => catalog.some((item) => item.category === category));
  const categoryWeights = { ...DEFAULT_CATEGORY_WEIGHTS, ...weightsOf(floor).categoryWeights };
  const rarityWeights = { ...DEFAULT_RARITY_WEIGHTS, ...weightsOf(floor).rarityWeights };
  const prefix = options.offerIdPrefix ?? 'offer-';
  const avoidDuplicates = options.avoidDuplicates !== false;
  const used = new Set<number>();
  const offers: ShopOffer[] = [];
  const categoryCounts: Record<ItemCategory, number> = {
    TRINKET: 0,
    DRINK: 0,
    REEL: 0,
    COIN: 0,
    CHASSIS: 0,
  };

  for (let slot = 0; slot < wanted; slot++) {
    if (poolCategories.length === 0) break;
    const category =
      categories.length === 1 && poolCategories.includes(categories[0]!)
        ? categories[0]!
        : rollWeighted(categoryWeights, poolCategories, random);
    const candidates: number[] = [];
    for (let i = 0; i < catalog.length; i++) {
      const item = catalog[i]!;
      if (item.category !== category) continue;
      if (avoidDuplicates && used.has(i)) continue;
      candidates.push(i);
    }
    if (candidates.length === 0) {
      for (let i = 0; i < catalog.length; i++) {
        const item = catalog[i]!;
        if (item.category === category) candidates.push(i);
      }
    }
    if (candidates.length === 0) continue;
    const candidateItems = candidates.map((index) => catalog[index]!);
    const picked = pickItemIndex(candidateItems, rarityWeights, random);
    const itemIndex = candidates[picked]!;
    const item = catalog[itemIndex]!;
    used.add(itemIndex);
    offers.push({
      offerId: `${prefix}${slot}`,
      itemId: item.id,
      category: item.category,
      price: item.price,
      sold: false,
    });
    categoryCounts[item.category] += 1;
  }

  return {
    archetype,
    offers,
    rerollCost: RULES.SHOP_REROLL_BASE,
    expandCost:
      wanted >= RULES.SHOP_MAX_CAPACITY
        ? null
        : expandPrice(options.expansions ?? 0),
    categoryCounts,
  };
}

export function generateOffers(
  optionsOrFloor?: RollShopOptions | FloorInput,
  items?: readonly ShopItemLike[],
  rng?: RngInput,
  capacity?: number,
): ShopOffer[] {
  return rollShop(optionsOrFloor, items, rng, capacity).offers;
}

export const rollOffers = generateOffers;

export function createShop(options?: { capacity?: number; expansions?: number }): ShopState {
  const capacity = clampCapacity(options?.capacity ?? RULES.SHOP_START_CAPACITY);
  const expansions = Math.max(0, Math.floor(options?.expansions ?? 0));
  return {
    capacity,
    rerollCost: RULES.SHOP_REROLL_BASE,
    expandCost: expandPrice(expansions),
    archetype: null,
    offers: [],
    rerolls: 0,
    expansions,
  };
}

export function enterShop(
  optionsOrFloor?: RollShopOptions | FloorInput,
  items?: readonly ShopItemLike[],
  rng?: RngInput,
  capacity?: number,
): ShopState {
  const options = normalizeRollOptions(optionsOrFloor, items, rng, capacity);
  const shopCapacity = clampCapacity(options.capacity ?? options.count ?? RULES.SHOP_START_CAPACITY);
  const rolled = rollShop({ ...options, capacity: shopCapacity, count: shopCapacity });
  return {
    capacity: shopCapacity,
    rerollCost: RULES.SHOP_REROLL_BASE,
    expandCost: expandPrice(options.expansions ?? 0),
    archetype: rolled.archetype,
    offers: rolled.offers,
    rerolls: 0,
    expansions: options.expansions ?? 0,
  };
}

export function resetShop(shop: ShopState, keepOffers = false): ShopState {
  return {
    ...shop,
    rerollCost: RULES.SHOP_REROLL_BASE,
    rerolls: 0,
    offers: keepOffers ? shop.offers.map((offer) => ({ ...offer })) : [],
  };
}

export const resetShopForFloor = resetShop;

function itemForOffer(
  offer: ShopOffer,
  items?: readonly ShopItemLike[],
): ShopItemLike | undefined {
  return items?.find((item) => item.id === offer.itemId);
}

function purchaseEffects(
  offer: ShopOffer,
  item: ShopItemLike | undefined,
  target: { reel?: number } | undefined,
): ShopEffect[] {
  const effects: ShopEffect[] = [
    { e: 'spendBankroll', amount: offer.price, reason: 'shop' },
    { e: 'grantItem', itemId: offer.itemId, category: offer.category, price: offer.price },
  ];
  switch (offer.category) {
    case 'TRINKET':
      effects.push({ e: 'mountTrinket', itemId: offer.itemId });
      break;
    case 'DRINK':
      effects.push({ e: 'addDrink', itemId: offer.itemId, instant: false });
      break;
    case 'COIN':
      effects.push({ e: 'addCoin', itemId: offer.itemId, coinId: offer.itemId });
      break;
    case 'REEL':
      effects.push({
        e: 'addGlyph',
        itemId: offer.itemId,
        symbolId: item?.symbolId,
        bonusTokens: item?.bonusTokens,
        reel: target?.reel,
      });
      break;
    case 'CHASSIS':
      effects.push({ e: 'applyChassis', itemId: offer.itemId, kind: item?.kind });
      break;
  }
  effects.push({ e: 'markOfferSold', offerId: offer.offerId });
  return effects;
}

export function validatePurchase(
  shopOrRequest:
    | ShopState
    | { shop: ShopState; offerId: string; bankroll: number; target?: { reel?: number }; items?: readonly ShopItemLike[]; maxCols?: number },
  offerId?: string,
  bankrollOrOptions?: number | ({ bankroll: number } & PurchaseOptions),
  options?: PurchaseOptions,
): PurchaseValidation {
  let shop: ShopState;
  let resolvedOfferId: string;
  let bankroll: number;
  let purchaseOptions: PurchaseOptions;

  if (
    typeof shopOrRequest === 'object' &&
    shopOrRequest !== null &&
    'shop' in shopOrRequest
  ) {
    shop = shopOrRequest.shop;
    resolvedOfferId = shopOrRequest.offerId;
    bankroll = shopOrRequest.bankroll;
    purchaseOptions = {
      items: shopOrRequest.items,
      target: shopOrRequest.target,
      maxCols: shopOrRequest.maxCols,
    };
  } else {
    shop = shopOrRequest;
    resolvedOfferId = offerId ?? '';
    if (typeof bankrollOrOptions === 'number') {
      bankroll = bankrollOrOptions;
      purchaseOptions = options ?? {};
    } else {
      bankroll = bankrollOrOptions?.bankroll ?? Number.NEGATIVE_INFINITY;
      purchaseOptions = { ...(bankrollOrOptions ?? {}), ...(options ?? {}) };
    }
  }

  const offer = shop.offers.find((candidate) => candidate.offerId === resolvedOfferId);
  if (!offer || offer.sold) {
    return {
      ok: false,
      error: 'UNKNOWN_ID',
      offer,
      itemId: offer?.itemId,
      category: offer?.category,
      price: offer?.price,
      bankroll,
      effects: [],
    };
  }

  const item = itemForOffer(offer, purchaseOptions.items);
  const target = purchaseOptions.target;

  if (target?.reel !== undefined) {
    const maxCols = purchaseOptions.maxCols ?? RULES.MAX_COLS;
    if (
      offer.category !== 'REEL' ||
      !Number.isInteger(target.reel) ||
      target.reel < 0 ||
      target.reel >= maxCols
    ) {
      return {
        ok: false,
        error: 'INVALID_TARGET',
        offer,
        itemId: offer.itemId,
        category: offer.category,
        price: offer.price,
        bankroll,
        effects: [],
      };
    }
  }

  if (!Number.isFinite(bankroll) || bankroll < offer.price) {
    return {
      ok: false,
      error: 'INSUFFICIENT_FUNDS',
      offer,
      itemId: offer.itemId,
      category: offer.category,
      price: offer.price,
      bankroll,
      effects: [],
    };
  }

  return {
    ok: true,
    offer,
    itemId: offer.itemId,
    category: offer.category,
    price: offer.price,
    bankroll,
    bankrollAfter: bankroll - offer.price,
    effects: purchaseEffects(offer, item, target),
  };
}

export function applyPurchase(shop: ShopState, validation: PurchaseValidation): ShopState {
  if (!validation.ok) {
    return {
      ...shop,
      offers: shop.offers.map((offer) => ({ ...offer })),
    };
  }
  return {
    ...shop,
    offers: shop.offers.map((offer) =>
      offer.offerId === validation.offer.offerId ? { ...offer, sold: true } : { ...offer },
    ),
  };
}

export function purchase(
  shop: ShopState,
  offerId: string,
  bankroll: number,
  options?: PurchaseOptions,
): PurchaseResult {
  const validation = validatePurchase(shop, offerId, bankroll, options);
  if (!validation.ok) return validation;
  return { ...validation, shop: applyPurchase(shop, validation) };
}

export function validateReroll(shop: ShopState, bankroll: number): MutationValidation {
  if (!Number.isFinite(bankroll) || bankroll < shop.rerollCost) {
    return { ok: false, error: 'INSUFFICIENT_FUNDS', cost: shop.rerollCost, effects: [] };
  }
  return {
    ok: true,
    cost: shop.rerollCost,
    effects: [
      { e: 'spendBankroll', amount: shop.rerollCost, reason: 'shop' },
      { e: 'rerollOffers', cost: shop.rerollCost, archetype: shop.archetype },
    ],
  };
}

export function applyReroll(shop: ShopState, rolled?: ShopRoll): ShopState {
  return {
    ...shop,
    offers: rolled ? rolled.offers.map((offer) => ({ ...offer })) : shop.offers.map((offer) => ({ ...offer })),
    archetype: rolled?.archetype ?? shop.archetype,
    rerollCost: nextRerollCost(shop.rerollCost),
    rerolls: (shop.rerolls ?? 0) + 1,
    expandCost: rolled?.expandCost ?? shop.expandCost,
  };
}

export type RerollResult =
  | (MutationSuccess & { shop?: ShopState; roll?: ShopRoll })
  | (MutationFailure & { shop?: ShopState; roll?: ShopRoll });

export function rerollShop(
  shop: ShopState,
  bankroll: number,
  options?: RollShopOptions,
): RerollResult {
  const validation = validateReroll(shop, bankroll);
  if (!validation.ok) return validation;
  const roll =
    options === undefined
      ? undefined
      : rollShop({
          ...options,
          archetype: options.archetype ?? shop.archetype ?? undefined,
          capacity: shop.capacity,
          count: shop.capacity,
          expansions: shop.expansions ?? 0,
        });
  return {
    ...validation,
    shop: applyReroll(shop, roll),
    roll,
  };
}

export function validateExpand(shop: ShopState, bankroll: number): MutationValidation {
  if (shop.capacity >= RULES.SHOP_MAX_CAPACITY) {
    return { ok: false, error: 'AT_LIMIT', cost: shop.expandCost, effects: [] };
  }
  if (!Number.isFinite(bankroll) || bankroll < shop.expandCost) {
    return { ok: false, error: 'INSUFFICIENT_FUNDS', cost: shop.expandCost, effects: [] };
  }
  return {
    ok: true,
    cost: shop.expandCost,
    effects: [
      { e: 'spendBankroll', amount: shop.expandCost, reason: 'shop' },
      {
        e: 'expandCapacity',
        from: shop.capacity,
        to: Math.min(RULES.SHOP_MAX_CAPACITY, shop.capacity + 1),
        cost: shop.expandCost,
      },
    ],
  };
}

export function applyExpand(shop: ShopState): ShopState {
  const capacity = Math.min(RULES.SHOP_MAX_CAPACITY, shop.capacity + 1);
  return {
    ...shop,
    capacity,
    expansions: (shop.expansions ?? 0) + 1,
    expandCost: nextExpandCost(shop.expandCost),
    offers: shop.offers.map((offer) => ({ ...offer })),
  };
}

export type ExpandResult =
  | (MutationSuccess & { shop?: ShopState })
  | (MutationFailure & { shop?: ShopState });

export function expandShop(shop: ShopState, bankroll: number): ExpandResult {
  const validation = validateExpand(shop, bankroll);
  if (!validation.ok) return validation;
  return { ...validation, shop: applyExpand(shop) };
}

export function expandCostOrNull(shop: ShopState): number | null {
  return shop.capacity >= RULES.SHOP_MAX_CAPACITY ? null : shop.expandCost;
}
