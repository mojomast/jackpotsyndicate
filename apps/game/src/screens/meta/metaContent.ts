import type {
  BossDef,
  BossId,
  ChassisDef,
  FloorDef,
  FloorId,
  ItemCategory,
  ItemDef,
  RunState,
  ShopOffer,
} from '@jackpotsyndicate/contracts';
import { RULES } from '@jackpotsyndicate/contracts';
import { CONTENT_BUNDLE } from '../../../../../packages/content/src/index';

export const CONTENT = CONTENT_BUNDLE;

export const META_FLOORS: readonly FloorDef[] = [...CONTENT.floors].sort(
  (left, right) => left.order - right.order,
);

const FLOOR_BY_ID = new Map<FloorId, FloorDef>(META_FLOORS.map((floor) => [floor.id, floor]));
const BOSS_BY_ID = new Map<BossId, BossDef>(CONTENT.bosses.map((boss) => [boss.id, boss]));

export const ITEM_CATEGORIES: readonly ItemCategory[] = [
  'TRINKET',
  'DRINK',
  'REEL',
  'COIN',
  'CHASSIS',
];

function normalizeId(id: string): string {
  return id.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

const ITEM_BY_ID = new Map<string, ItemDef>();
const ITEM_BY_NORMALIZED = new Map<string, ItemDef>();
for (const item of CONTENT.items) {
  ITEM_BY_ID.set(item.id, item);
  ITEM_BY_NORMALIZED.set(normalizeId(item.id), item);
}

export function humanizeId(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function findItem(id: string): ItemDef | undefined {
  return ITEM_BY_ID.get(id) ?? ITEM_BY_NORMALIZED.get(normalizeId(id));
}

export function itemName(id: string): string {
  return findItem(id)?.name ?? humanizeId(id);
}

export function itemDescription(id: string): string {
  const item = findItem(id);
  if (item === undefined) return 'Mounted item.';
  if (item.category === 'REEL') return `${item.desc} Target strip selected at purchase.`;
  if (item.category === 'CHASSIS') return item.desc;
  return item.desc;
}

export function itemRarity(id: string): string {
  return findItem(id)?.rarity ?? 'common';
}

export function itemCategory(id: string): ItemCategory | null {
  return findItem(id)?.category ?? null;
}

export function itemSymbol(id: string): string | null {
  const item = findItem(id);
  return item?.category === 'REEL' ? item.symbolId : null;
}

export function chassisKind(id: string): ChassisDef['kind'] | null {
  const item = findItem(id);
  return item?.category === 'CHASSIS' ? item.kind : null;
}

export function offerLabel(offer: ShopOffer): string {
  return itemName(offer.itemId);
}

export function offerDescription(offer: ShopOffer): string {
  return itemDescription(offer.itemId);
}

export function itemSpriteKey(id: string): string | null {
  return findItem(id)?.spriteKey ?? null;
}

export function floorSpriteKey(id: FloorId): string {
  return `floor.${id}.bg`;
}

export function floorDef(id: FloorId): FloorDef | undefined {
  return FLOOR_BY_ID.get(id);
}

export function floorName(id: FloorId): string {
  return FLOOR_BY_ID.get(id)?.name ?? humanizeId(id);
}

export function floorOrder(id: FloorId): number {
  return FLOOR_BY_ID.get(id)?.order ?? 1;
}

export function floorFriction(id: FloorId): number {
  return FLOOR_BY_ID.get(id)?.physics.friction ?? 0.9;
}

export function floorGutterRisk(id: FloorId): number {
  return FLOOR_BY_ID.get(id)?.physics.gutterRisk ?? 1;
}

export function allowedFloors(id: FloorId): readonly FloorDef[] {
  const current = FLOOR_BY_ID.get(id);
  if (current === undefined) return META_FLOORS;
  return current.next
    .map((nextId) => FLOOR_BY_ID.get(nextId))
    .filter((floor): floor is FloorDef => floor !== undefined);
}

export function bossForFloor(id: FloorId): BossDef | undefined {
  const floor = FLOOR_BY_ID.get(id);
  return floor === undefined ? undefined : BOSS_BY_ID.get(floor.bossId);
}

export function bossForFloorId(id: FloorId): BossId {
  return FLOOR_BY_ID.get(id)?.bossId ?? 'valenti';
}

export const BOSS_SABOTAGE: Record<BossId, string> = {
  valenti:
    'Outward lateral suction drags shelf tokens toward the gutters. Lead Slugs and magnetic tokens resist it.',
  zero:
    'Freezes one or two cells for two spins and drops zero-value ice blocks near the lip every second spin.',
  auditor:
    'Score compounds by 1.35× each spin. Every third dozer extension removes the two centre-most unwelded tokens.',
};

export function quotaForState(state: RunState): number {
  const floor = FLOOR_BY_ID.get(state.floorId);
  if (floor === undefined) return 0;
  const globalIndex =
    (floor.order - 1) * RULES.NORMAL_ROUNDS_PER_FLOOR + state.round;
  const index = Math.max(0, Math.min(CONTENT.balance.quotas.length - 1, globalIndex - 1));
  const base = CONTENT.balance.quotas[index] ?? 0;
  return Math.round(base * floor.quotaScale);
}

export function formatCash(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}$${Math.abs(rounded).toLocaleString('en-US')}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function categoryCounts(): Record<ItemCategory, number> {
  const counts: Record<ItemCategory, number> = {
    TRINKET: 0,
    DRINK: 0,
    REEL: 0,
    COIN: 0,
    CHASSIS: 0,
  };
  for (const item of CONTENT.items) counts[item.category] += 1;
  return counts;
}

export function itemsByCategory(category: ItemCategory): readonly ItemDef[] {
  return CONTENT.items.filter((item) => item.category === category);
}

export function catalogue(): readonly ItemDef[] {
  return CONTENT.items;
}

export function bossCatalogue(): readonly BossDef[] {
  return CONTENT.bosses;
}

export function shopArchetypeLabel(archetype: string | null): string {
  if (archetype === null) return 'Unrolled shelf';
  return archetype.charAt(0) + archetype.slice(1).toLowerCase();
}

export function maxShopCapacity(): number {
  return 10;
}
