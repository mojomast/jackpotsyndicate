import { STORAGE_KEYS, type GameEvent, type RunState } from '@jackpotsyndicate/contracts';
import { useGameStore } from './gameStore';

/**
 * Compendium discovery (js.compendium.v1). An item is discovered once the
 * player has seen it: on a vendor shelf, as a relic offer, or owned. Floors
 * and bosses are discovered by reaching them. Stored as a sorted id array.
 */

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readDiscovered(): Set<string> {
  const found = new Set<string>();
  try {
    const raw = storage()?.getItem(STORAGE_KEYS.compendium);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const id of parsed) if (typeof id === 'string') found.add(id);
      } else if (parsed && typeof parsed === 'object') {
        for (const key of Object.keys(parsed as Record<string, unknown>)) found.add(key);
      }
    }
  } catch {
    // A corrupt discovery file is ignored and rewritten on the next find.
  }
  return found;
}

function writeDiscovered(ids: Set<string>): void {
  try {
    storage()?.setItem(STORAGE_KEYS.compendium, JSON.stringify([...ids].sort()));
  } catch {
    // Storage may be unavailable; discovery then lasts for the session only.
  }
}

/** Everything the current run state shows the player. */
export function idsSeenIn(state: RunState): string[] {
  if (state.phase === 'TITLE') return [];
  const ids: string[] = [
    ...state.trinkets,
    ...state.ownedCoins,
    ...state.shop.offers.map((offer) => offer.itemId),
    `floor:${state.floorId}`,
    ...state.floorsCleared.map((floorId) => `floor:${floorId}`),
  ];
  for (const drink of state.drinkTray) if (drink) ids.push(drink);
  if (state.activeDrink) ids.push(state.activeDrink);
  return ids;
}

function idsSeenInEvents(events: readonly GameEvent[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    if (event.t === 'RelicsOffered') ids.push(...event.itemIds);
    if (event.t === 'ItemBought') ids.push(event.itemId);
  }
  return ids;
}

/** Subscribe to the store and persist new discoveries. Returns the unsubscribe. */
export function startDiscoveryTracking(): () => void {
  const known = readDiscovered();
  const absorb = (ids: readonly string[]) => {
    let grew = false;
    for (const id of ids) {
      if (!id || known.has(id)) continue;
      known.add(id);
      grew = true;
    }
    if (grew) writeDiscovered(known);
  };

  absorb(idsSeenIn(useGameStore.getState().state));
  return useGameStore.subscribe((next, previous) => {
    if (next.state !== previous.state) absorb(idsSeenIn(next.state));
    // The event history is capped, so scan only its recent tail.
    if (next.events !== previous.events) absorb(idsSeenInEvents(next.events.slice(-40)));
  });
}
