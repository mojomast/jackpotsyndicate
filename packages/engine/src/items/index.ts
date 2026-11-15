/**
 * T-013: item helpers for trinkets, drinks and coins.
 *
 * Trinkets and drinks are data: their `effects` are C-4 handler references
 * dispatched through `effects/index.ts`. Coins are stat profiles that modify
 * orbs, shelf tokens, payouts and the per-spin cost.
 *
 * All helpers are pure. Mounting a trinket or adding a drink returns a new
 * collection and never mutates the input.
 */
import type {
  CoinDef,
  DrinkDef,
  HandlerRef,
  ItemDef,
  PhysicsModifiers,
  SymbolId,
  TokenTemplate,
  TrinketDef,
} from '@jackpotsyndicate/contracts';
import { RULES } from '@jackpotsyndicate/contracts';
import {
  applyModifierEffects,
  dispatchHook,
  dispatchHookMany,
  hasEffectHandler,
  type EffectContext,
  type HookPayload,
  type HookPayloadMap,
  type NextSpinBonuses,
} from '../effects/index';

export type ItemCatalog = readonly ItemDef[];
export type ItemIndex = ReadonlyMap<string, ItemDef>;

export function isTrinket(item: ItemDef): item is TrinketDef {
  return item.category === 'TRINKET';
}

export function isDrink(item: ItemDef): item is DrinkDef {
  return item.category === 'DRINK';
}

export function isCoin(item: ItemDef): item is CoinDef {
  return item.category === 'COIN';
}

/** Build an id -> item lookup without mutating the catalog. */
export function indexItems(items: ItemCatalog): ItemIndex {
  return new Map(items.map((item) => [item.id, item]));
}

export function findItem(items: ItemCatalog, id: string): ItemDef | undefined {
  return items.find((item) => item.id === id);
}

export function requireItem(items: ItemCatalog, id: string): ItemDef {
  const item = findItem(items, id);
  if (item === undefined) throw new Error(`Unknown item "${id}"`);
  return item;
}

export function findTrinket(items: ItemCatalog, id: string): TrinketDef | undefined {
  const item = findItem(items, id);
  return item !== undefined && isTrinket(item) ? item : undefined;
}

export function findDrink(items: ItemCatalog, id: string): DrinkDef | undefined {
  const item = findItem(items, id);
  return item !== undefined && isDrink(item) ? item : undefined;
}

export function findCoin(items: ItemCatalog, id: string): CoinDef | undefined {
  const item = findItem(items, id);
  return item !== undefined && isCoin(item) ? item : undefined;
}

export function trinkets(items: ItemCatalog): TrinketDef[] {
  return items.filter(isTrinket);
}

export function drinks(items: ItemCatalog): DrinkDef[] {
  return items.filter(isDrink);
}

export function coins(items: ItemCatalog): CoinDef[] {
  return items.filter(isCoin);
}

// ------------------------------------------------------------------ trinkets
/** R-TRK-01: no cap; duplicate ids are retained so they can stack. */
export function addTrinket(trinketsOwned: readonly string[], id: string): string[] {
  return [...trinketsOwned, id];
}

export const mountTrinket = addTrinket;

/** Remove one copy of an id (the first occurrence), leaving the rest stacked. */
export function removeTrinket(trinketsOwned: readonly string[], id: string): string[] {
  const index = trinketsOwned.indexOf(id);
  if (index < 0) return [...trinketsOwned];
  return [...trinketsOwned.slice(0, index), ...trinketsOwned.slice(index + 1)];
}

export function trinketCounts(trinketsOwned: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of trinketsOwned) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

export function hasTrinket(trinketsOwned: readonly string[], id: string): boolean {
  return trinketsOwned.includes(id);
}

/** Resolve owned ids to definitions, preserving duplicates and order. */
export function resolveTrinkets(items: ItemCatalog, ids: readonly string[]): TrinketDef[] {
  const out: TrinketDef[] = [];
  for (const id of ids) {
    const item = findTrinket(items, id);
    if (item !== undefined) out.push(item);
  }
  return out;
}

/** Flatten the C-4 handler references for the owned trinkets. */
export function trinketRefs(items: ItemCatalog, ids: readonly string[]): HandlerRef[] {
  const refs: HandlerRef[] = [];
  for (const trinket of resolveTrinkets(items, ids)) refs.push(...trinket.effects);
  return refs;
}

/** Dispatch a hook over owned trinkets only. */
export function collectTrinketEffects<H extends keyof HookPayloadMap>(
  items: ItemCatalog,
  ids: readonly string[],
  hook: H,
  ctx: EffectContext = {},
  payload: HookPayloadMap[H] = {} as HookPayloadMap[H],
) {
  return dispatchHook(hook, trinketRefs(items, ids), ctx, payload);
}

/** Fold owned trinkets into the physics modifier bag. */
export function trinketModifiers(
  items: ItemCatalog,
  ids: readonly string[],
  ctx: EffectContext = {},
  base?: Partial<PhysicsModifiers>,
): PhysicsModifiers {
  const refs = trinketRefs(items, ids);
  return dispatchModifiers(refs, ctx, base);
}

// -------------------------------------------------------------------- drinks
/** D-08: bar tray has three slots; duplicate drinks occupy separate slots. */
export function addDrinkToTray(
  tray: readonly (string | null)[],
  id: string,
  maxSlots = RULES.DRINK_TRAY_SLOTS,
): (string | null)[] {
  const next = tray.slice(0, Math.max(0, maxSlots));
  while (next.length < maxSlots) next.push(null);
  const slot = next.findIndex((entry) => entry === null);
  if (slot < 0) return next;
  next[slot] = id;
  return next;
}

export function removeDrinkFromTray(
  tray: readonly (string | null)[],
  slot: number,
): (string | null)[] {
  const next = [...tray];
  if (Number.isInteger(slot) && slot >= 0 && slot < next.length) next[slot] = null;
  return next;
}

export function resolveDrinks(items: ItemCatalog, ids: readonly string[]): DrinkDef[] {
  const out: DrinkDef[] = [];
  for (const id of ids) {
    const item = findDrink(items, id);
    if (item !== undefined) out.push(item);
  }
  return out;
}

export function drinkRefs(items: ItemCatalog, ids: readonly string[]): HandlerRef[] {
  const refs: HandlerRef[] = [];
  for (const drink of resolveDrinks(items, ids)) refs.push(...drink.effects);
  return refs;
}

export function collectDrinkEffects<H extends keyof HookPayloadMap>(
  items: ItemCatalog,
  ids: readonly string[],
  hook: H,
  ctx: EffectContext = {},
  payload: HookPayloadMap[H] = {} as HookPayloadMap[H],
) {
  return dispatchHook(hook, drinkRefs(items, ids), ctx, payload);
}

export function drinkModifiers(
  items: ItemCatalog,
  ids: readonly string[],
  ctx: EffectContext = {},
  base?: Partial<PhysicsModifiers>,
): PhysicsModifiers {
  return dispatchModifiers(drinkRefs(items, ids), ctx, base);
}

// ---------------------------------------------------------------- combined
export function itemRefs(item: ItemDef | undefined): HandlerRef[] {
  if (item === undefined) return [];
  if (isTrinket(item) || isDrink(item)) return item.effects;
  return [];
}

/**
 * Dispatch a hook over trinkets and active drinks together. Identical handler
 * references from both sources still stack additively.
 */
export function collectItemEffects<H extends keyof HookPayloadMap>(
  items: ItemCatalog,
  trinketIds: readonly string[],
  drinkIds: readonly string[],
  hook: H,
  ctx: EffectContext = {},
  payload: HookPayloadMap[H] = {} as HookPayloadMap[H],
) {
  return dispatchHookMany(
    hook,
    [trinketRefs(items, trinketIds), drinkRefs(items, drinkIds)],
    ctx,
    payload,
  );
}

/** Convenience wrapper around the effects modifier resolution. */
export function dispatchModifiers(
  refs: readonly HandlerRef[],
  ctx: EffectContext = {},
  base?: Partial<PhysicsModifiers>,
): PhysicsModifiers {
  // Imported lazily through the module binding to keep this file's public
  // surface about items; the implementation lives in effects/index.
  const effects = dispatchHook('physicsModifiers', refs, ctx, {});
  return applyModifierEffects(effects, base);
}

// --------------------------------------------------------------------- coins
export interface CoinProfile {
  id: string;
  name: string;
  massMul: number;
  bounceMul: number;
  payoutMul: number;
  costPerSpin: number;
  resistSuction: boolean;
}

/** The stat block a coin contributes. */
export function coinProfile(coin: CoinDef): Readonly<CoinProfile> {
  return Object.freeze({
    id: coin.id,
    name: coin.name,
    massMul: coin.massMul,
    bounceMul: coin.bounceMul,
    payoutMul: coin.payoutMul,
    costPerSpin: coin.costPerSpin,
    resistSuction: coin.resistSuction,
  });
}

export function resolveCoin(items: ItemCatalog, id: string): CoinDef {
  const coin = findCoin(items, id);
  if (coin === undefined) throw new Error(`Unknown coin "${id}"`);
  return coin;
}

export interface OrbCoinStats {
  mass: number;
  elasticity: number;
}

/** Apply mass and bounce multipliers to an orb profile. */
export function applyCoinToOrb<T extends OrbCoinStats>(coin: CoinDef, orb: T): T {
  return {
    ...orb,
    mass: orb.mass * coin.massMul,
    elasticity: orb.elasticity * coin.bounceMul,
  } as T;
}

export interface TokenCoinStats {
  mass: number;
  resistSuction: boolean;
}

/** Apply mass and suction resistance to a token template. */
export function applyCoinToToken<T extends TokenCoinStats>(coin: CoinDef, token: T): T {
  return {
    ...token,
    mass: token.mass * coin.massMul,
    resistSuction: token.resistSuction || coin.resistSuction,
  } as T;
}

/** Cash after the coin's payout multiplier. */
export function coinPayout(cash: number, coin: CoinDef): number {
  return cash * coin.payoutMul;
}

export const applyCoinPayout = coinPayout;

/** Bankroll charged at the start of a spin with this coin loaded. */
export function coinSpinCost(coin: CoinDef): number {
  return coin.costPerSpin;
}

export function coinResistsSuction(coin: CoinDef): boolean {
  return coin.resistSuction;
}

/**
 * Build an `OrbSpec`-shaped object from a base orb and token template using the
 * loaded coin. The token template carries the coin's mass and suction rules.
 */
export function applyCoinToOrbSpec<T extends {
  mass: number;
  elasticity: number;
  token: TokenTemplate;
}>(coin: CoinDef, orb: T): T {
  return {
    ...orb,
    mass: orb.mass * coin.massMul,
    elasticity: orb.elasticity * coin.bounceMul,
    token: applyCoinToToken(coin, orb.token),
  } as T;
}

/** Symbol id helper for callers building bonus tokens from a glyph. */
export function glyphSymbol(item: ItemDef): SymbolId | null {
  return item.category === 'REEL' ? item.symbolId : null;
}

/** Validate every handler reference in a catalog resolves to a C-4 action. */
export function unresolvedHandlerIds(items: ItemCatalog): string[] {
  const missing = new Set<string>();
  for (const item of items) {
    if (!isTrinket(item) && !isDrink(item)) continue;
    for (const ref of item.effects) {
      const action = ref.params?.action ?? ref.params?.handler ?? ref.params?.id;
      if (typeof action !== 'string' || !hasEffectHandler(action)) {
        missing.add(typeof action === 'string' ? action : `${item.id}:<missing>`);
      }
    }
  }
  return [...missing];
}

/** Next-spin state helper used by drinks/trinkets in tests and the core. */
export function emptyNextSpin(): NextSpinBonuses {
  return { xBonus: {}, addMult: 0, bonusOrbs: 0 };
}

/** Small helper so callers can dispatch a single ad-hoc reference. */
export function dispatchRefs<H extends keyof HookPayloadMap>(
  refs: readonly HandlerRef[],
  hook: H,
  ctx: EffectContext = {},
  payload: HookPayloadMap[H] = {} as HookPayloadMap[H],
) {
  return dispatchHook(hook, refs, ctx, payload);
}

export type { EffectContext, HookPayload, HookPayloadMap };
