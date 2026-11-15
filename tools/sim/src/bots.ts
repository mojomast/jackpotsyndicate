/**
 * Deterministic bots. Every action is expressed as a public `Command`; bots
 * never read or write core internals. They only look at the read-only run
 * state the UI is allowed to see (plus the item ids the driver observed in
 * `ItemBought` events).
 */
import type { Command, FloorId, RunState } from '../../../packages/contracts/src/index';
import { SimRng } from './rng';

export type BotId = 'random-buyer' | 'greedy-synergy';

export interface ShopPlan {
  /** Purchase attempts, in order. */
  buy: Command[];
  /** Ask the driver to reroll before buying, when it still may. */
  reroll: boolean;
}

export interface Bot {
  readonly id: BotId;
  readonly label: string;
  shop(state: Readonly<RunState>, rng: SimRng): ShopPlan;
  relic(options: readonly string[], rng: SimRng): number;
  floor(options: readonly FloorId[], rng: SimRng): FloorId | undefined;
  prep(state: Readonly<RunState>, owned: ReadonlySet<string>, rng: SimRng): Command[];
}

const GREEDY_PRIORITY: readonly string[] = [
  'vampiricStepperMotor',
  'goldPegAlchemist',
  'ouroborosCapacitor',
  'vipBullionStamp',
  'midasLipSensor',
  'loadedPlatinumDie',
  'electromagneticHopper',
  'turboDozerCam',
  'hydraulicDozerPiston',
  'rubberGutterBumper',
  'gutterGuardBumper',
  'teslaPegCapacitor',
  'quantumSplitterCoil',
  'overvoltedSolenoid',
  'waysHarness',
  'overvolt',
  'reelColumn',
  'addRow',
  'bloodDoubloon',
  'heavyLeadSlug',
  'greenFairyAbsinthe',
  'dirtySyndicateMartini',
  'nitrousEspresso',
  'alchemistAbsinthe',
  'lubricantOilShot',
  'uraniumGlyph',
  'bloodDiamondGlyph',
  'luckySevenGlyph',
  'cherryGlyph',
  'magnetSkullGlyph',
  'polymerSuperball',
];

const GREEDY_DRINK_PRIORITY: readonly string[] = [
  'greenFairyAbsinthe',
  'dirtySyndicateMartini',
  'nitrousEspresso',
  'alchemistAbsinthe',
  'lubricantOilShot',
];

const GREEDY_COIN_PRIORITY: readonly string[] = [
  'bloodDoubloon',
  'heavyLeadSlug',
  'polymerSuperball',
  'copperToken',
];

const GREEDY_FLOORS: readonly FloorId[] = ['FLOOR_FOUNDRY', 'FLOOR_CRYO', 'FLOOR_PENTHOUSE', 'FLOOR_NEON'];

function priorityIndex(itemId: string): number {
  const index = GREEDY_PRIORITY.indexOf(itemId);
  return index < 0 ? GREEDY_PRIORITY.length : index;
}

function bestInPriority(ids: readonly string[], order: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    const index = order.indexOf(id);
    if (index >= 0 && index < bestIndex) {
      best = id;
      bestIndex = index;
    }
  }
  return best;
}

function reelCommand(offerId: string, reel: number): Command {
  return { c: 'ShopBuy', offerId, target: { reel } };
}

export const randomBuyerBot: Bot = {
  id: 'random-buyer',
  label: 'Random buyer',

  shop(state, rng): ShopPlan {
    const offers = state.shop.offers.filter((offer) => !offer.sold);
    if (offers.length === 0) return { buy: [], reroll: false };

    let bankroll = state.bankroll;
    let drinkSlots = state.drinkTray.filter((slot) => slot === null).length;
    const buy: Command[] = [];
    const shuffled = rng.shuffle(offers);
    const wanted = rng.chance(0.75) ? 1 + rng.int(offers.length) : 0;
    let bought = 0;

    for (const offer of shuffled) {
      if (bought >= wanted) break;
      if (offer.price > bankroll) continue;
      if (offer.category === 'DRINK') {
        if (drinkSlots <= 0) continue;
        drinkSlots -= 1;
      }
      buy.push(
        offer.category === 'REEL'
          ? reelCommand(offer.offerId, rng.int(Math.max(1, state.grid.cols)))
          : { c: 'ShopBuy', offerId: offer.offerId },
      );
      bankroll -= offer.price;
      bought += 1;
    }

    const reroll =
      buy.length === 0 &&
      state.bankroll >= state.shop.rerollCost * 3 &&
      rng.chance(0.25);
    return { buy, reroll };
  },

  relic(options, rng): number {
    return options.length === 0 ? 0 : rng.int(options.length);
  },

  floor(options, rng): FloorId | undefined {
    return rng.pick(options);
  },

  prep(state, owned, rng): Command[] {
    const commands: Command[] = [];
    if (state.activeDrink === null) {
      const slots = state.drinkTray
        .map((itemId, slot) => ({ itemId, slot }))
        .filter((entry): entry is { itemId: string; slot: number } => entry.itemId !== null);
      const picked = rng.pick(slots);
      if (picked !== undefined && rng.chance(0.6)) commands.push({ c: 'Drink', slot: picked.slot });
    }

    const coins = [...owned].filter((id) => GREEDY_COIN_PRIORITY.includes(id));
    if (coins.length > 0 && rng.chance(0.5)) {
      const coin = rng.pick(coins);
      if (coin !== undefined && coin !== state.loadedCoin) commands.push({ c: 'LoadCoin', coinId: coin });
    }

    if (owned.has('overvolt') && rng.chance(0.5)) {
      commands.push({ c: 'SetOvervolt', lineId: `row:${rng.int(Math.max(1, state.grid.rows))}` });
    }
    return commands;
  },
};

export const greedySynergyBot: Bot = {
  id: 'greedy-synergy',
  label: 'Greedy synergy',

  shop(state, rng): ShopPlan {
    const offers = state.shop.offers.filter((offer) => !offer.sold);
    if (offers.length === 0) return { buy: [], reroll: false };

    let bankroll = state.bankroll;
    let drinkSlots = state.drinkTray.filter((slot) => slot === null).length;
    const buy: Command[] = [];

    const preferred = offers
      .filter((offer) => GREEDY_PRIORITY.includes(offer.itemId))
      .sort((a, b) => priorityIndex(a.itemId) - priorityIndex(b.itemId) || a.price - b.price);
    const fallback = offers
      .filter((offer) => !GREEDY_PRIORITY.includes(offer.itemId) && offer.category !== 'COIN')
      .sort((a, b) => a.price - b.price);

    for (const offer of [...preferred, ...fallback]) {
      if (offer.price > bankroll) continue;
      if (offer.category === 'DRINK') {
        if (drinkSlots <= 0) continue;
        drinkSlots -= 1;
      }
      buy.push(
        offer.category === 'REEL'
          ? reelCommand(offer.offerId, rng.int(Math.max(1, state.grid.cols)))
          : { c: 'ShopBuy', offerId: offer.offerId },
      );
      bankroll -= offer.price;
    }

    const wantedSomething =
      preferred.some((offer) => offer.price <= state.bankroll) ||
      fallback.some((offer) => offer.price <= state.bankroll);
    const reroll = !wantedSomething && state.bankroll >= state.shop.rerollCost * 4;
    return { buy, reroll };
  },

  relic(options, _rng): number {
    const best = bestInPriority(options, GREEDY_PRIORITY);
    return best === undefined ? 0 : Math.max(0, options.indexOf(best));
  },

  floor(options, _rng): FloorId | undefined {
    for (const floor of GREEDY_FLOORS) {
      if (options.includes(floor)) return floor;
    }
    return options[0];
  },

  prep(state, owned, _rng): Command[] {
    const commands: Command[] = [];

    if (state.activeDrink === null) {
      const available = state.drinkTray
        .map((itemId, slot) => ({ itemId, slot }))
        .filter((entry): entry is { itemId: string; slot: number } => entry.itemId !== null);
      const drink = bestInPriority(
        available.map((entry) => entry.itemId),
        GREEDY_DRINK_PRIORITY,
      );
      if (drink !== undefined) {
        const entry = available.find((candidate) => candidate.itemId === drink);
        if (entry !== undefined) commands.push({ c: 'Drink', slot: entry.slot });
      }
    }

    const coin = bestInPriority([...owned], GREEDY_COIN_PRIORITY);
    if (coin !== undefined && coin !== state.loadedCoin) {
      commands.push({ c: 'LoadCoin', coinId: coin });
    }

    if (owned.has('overvolt') && state.overvoltLineId !== 'row:1') {
      commands.push({ c: 'SetOvervolt', lineId: 'row:1' });
    }
    return commands;
  },
};

export const BOTS: Readonly<Record<BotId, Bot>> = {
  'random-buyer': randomBuyerBot,
  'greedy-synergy': greedySynergyBot,
};

export function createBot(id: BotId): Bot {
  return BOTS[id];
}
