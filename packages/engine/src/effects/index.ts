/**
 * T-013: C-4 effect hooks, pure handlers, and the modifier bag.
 *
 * A content item references a handler by hook name (`HandlerRef.handler`) and
 * an action id inside `params.action`. The dispatcher resolves that action to a
 * pure function and returns the `Effect[]` the core applies. Nothing here
 * mutates content, context, payloads or params: duplicate references are folded
 * into a single handler call whose `copies` value gives the stacking rules.
 *
 * Stacking is additive per R-TRK-01: additive effects scale by copies,
 * multiplier effects become `1 + (factor - 1) * copies`, and per-gutter
 * bounce chances stay independent entries in the modifier bag.
 */
import { DEFAULT_MODIFIERS } from '@jackpotsyndicate/contracts';
import type {
  Cell,
  Effect,
  HandlerRef,
  HookName,
  PhysicsModifiers,
  SimDirective,
  SymbolId,
  TokenTemplate,
} from '@jackpotsyndicate/contracts';

/** All C-4 hook names, in content order. */
export const HOOK_NAMES = [
  'onRunStart',
  'onSpinStart',
  'onCellScored',
  'onSpinEvaluated',
  'onOrbLaunch',
  'onPegHit',
  'onChuteExit',
  'onTokenSpawn',
  'onDozerFullExtension',
  'onGutterLoss',
  'onLipDrop',
  'onRoundEnd',
  'onShopEnter',
  'physicsModifiers',
] as const satisfies readonly HookName[];

export type HandlerParams = Readonly<Record<string, number | string | boolean>> | undefined;

/** Common readable fields. Hook payloads may carry any subset. */
export interface HookPayload {
  readonly tick?: number;
  readonly orbId?: number;
  readonly tokenId?: number;
  readonly index?: number;
  readonly launchIndex?: number;
  readonly orbIndex?: number;
  readonly orbLaunchCount?: number;
  readonly hitIndex?: number;
  readonly pegHitCount?: number;
  readonly pegHits?: number;
  readonly spinIndex?: number;
  readonly symbolId?: string;
  readonly chips?: number;
  readonly cash?: number;
  readonly count?: number;
  readonly distance?: number;
  readonly amount?: number;
  readonly grid?: readonly (readonly SymbolId[])[];
  readonly visible?: readonly (readonly SymbolId[])[];
  readonly visibleSymbols?: readonly SymbolId[];
  readonly frozenCells?: readonly Cell[];
  readonly wins?: readonly unknown[];
  readonly result?: unknown;
}

export type RunStartPayload = HookPayload;
export type SpinStartPayload = HookPayload;
export type CellScoredPayload = HookPayload;
export type SpinEvaluatedPayload = HookPayload;
export type OrbLaunchPayload = HookPayload;
export type PegHitPayload = HookPayload;
export type ChuteExitPayload = HookPayload;
export type TokenSpawnPayload = HookPayload;
export type DozerFullExtensionPayload = HookPayload;
export type GutterLossPayload = HookPayload;
export type LipDropPayload = HookPayload;
export type RoundEndPayload = HookPayload;
export type ShopEnterPayload = HookPayload;
export type PhysicsModifiersPayload = HookPayload;

export interface HookPayloadMap {
  onRunStart: RunStartPayload;
  onSpinStart: SpinStartPayload;
  onCellScored: CellScoredPayload;
  onSpinEvaluated: SpinEvaluatedPayload;
  onOrbLaunch: OrbLaunchPayload;
  onPegHit: PegHitPayload;
  onChuteExit: ChuteExitPayload;
  onTokenSpawn: TokenSpawnPayload;
  onDozerFullExtension: DozerFullExtensionPayload;
  onGutterLoss: GutterLossPayload;
  onLipDrop: LipDropPayload;
  onRoundEnd: RoundEndPayload;
  onShopEnter: ShopEnterPayload;
  physicsModifiers: PhysicsModifiersPayload;
}

export interface NextSpinBonuses {
  xBonus: Record<string, number>;
  addMult: number;
  bonusOrbs: number;
}

/**
 * Read-only context a handler may inspect. Callers own counters such as
 * `orbLaunchCount` and `pegHitCount`; handlers never advance them.
 */
export interface EffectContext {
  readonly tick?: number;
  readonly spinIndex?: number;
  readonly spinCount?: number;
  readonly orbLaunchCount?: number;
  readonly orbIndex?: number;
  readonly pegHitCount?: number;
  readonly pegHits?: number;
  readonly nextSpin?: Readonly<NextSpinBonuses>;
  readonly xMult?: number;
  readonly addMult?: number;
  readonly grid?: readonly (readonly SymbolId[])[];
  readonly visible?: readonly (readonly SymbolId[])[];
  readonly visibleSymbols?: readonly SymbolId[];
  readonly frozenCells?: readonly Cell[];
  readonly rng?: () => number;
  readonly floorScale?: number;
  readonly bossSpin?: number;
  /** Number of identical handler references being dispatched. */
  readonly copies?: number;
  readonly copyIndex?: number;
}

export type EffectHandler = (
  ctx: EffectContext,
  payload: HookPayload,
  params: HandlerParams,
) => Effect[];

export class UnknownEffectHandlerError extends Error {
  readonly action: string;

  constructor(action: string) {
    super(`Unknown effect handler "${action}"`);
    this.name = 'UnknownEffectHandlerError';
    this.action = action;
  }
}

// ------------------------------------------------------------------ helpers
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Keep binary-float residue (2 - 1.9) out of serialisable effects. */
function round9(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

function num(params: HandlerParams, key: string, fallback = 0): number {
  return finite(params?.[key], fallback);
}

function text(params: HandlerParams, key: string, fallback = ''): string {
  const value = params?.[key];
  return typeof value === 'string' ? value : fallback;
}

function flag(params: HandlerParams, key: string): boolean {
  return params?.[key] === true;
}

function copiesOf(ctx: EffectContext): number {
  const copies = ctx.copies;
  if (typeof copies !== 'number' || !Number.isFinite(copies)) return 1;
  return Math.max(1, Math.floor(copies));
}

/** `1 + (factor - 1) * copies`, the additive stacking rule for multipliers. */
export function stackFactor(factor: number, copies = 1): number {
  const safeFactor = finite(factor, 1);
  const safeCopies = Math.max(1, Math.floor(finite(copies, 1)));
  return round9(1 + (safeFactor - 1) * safeCopies);
}

function nextSpinX(ctx: EffectContext, key: string): number {
  const value = ctx.nextSpin?.xBonus?.[key];
  return finite(value, 0);
}

function firstNumber(
  payload: HookPayload,
  keys: readonly (keyof HookPayload)[],
  fallback: number,
): number {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return fallback;
}

function orbIndex(ctx: EffectContext, payload: HookPayload): number {
  const fromPayload = firstNumber(payload, ['launchIndex', 'orbIndex', 'index', 'orbLaunchCount'], Number.NaN);
  if (Number.isFinite(fromPayload)) return fromPayload;
  return finite(ctx.orbLaunchCount ?? ctx.orbIndex, 0);
}

function pegIndex(ctx: EffectContext, payload: HookPayload): number {
  const fromPayload = firstNumber(payload, ['pegHitCount', 'pegHits', 'hitIndex', 'index'], Number.NaN);
  if (Number.isFinite(fromPayload)) return fromPayload;
  return finite(ctx.pegHitCount ?? ctx.pegHits, 0);
}

/**
 * True when hit `index` belongs to the Nth-hit pattern with `copies` duplicates.
 * One copy triggers on `every`, `2 * every`, ...; each extra copy fills the
 * preceding offset, so two every-3rd items trigger on two of every three hits.
 */
export function hitsEvery(index: number, every: number, copies = 1): boolean {
  const step = Math.max(1, Math.floor(finite(every, 1)));
  const count = Math.max(1, Math.floor(finite(copies, 1)));
  if (!Number.isFinite(index) || index <= 0) return false;
  const phase = index % step;
  if (phase === 0) return true;
  return count > 1 && phase >= step - Math.min(count - 1, step - 1);
}

function gridOf(ctx: EffectContext, payload: HookPayload): readonly (readonly SymbolId[])[] | undefined {
  return payload.grid ?? payload.visible ?? ctx.grid ?? ctx.visible;
}

function visibleSymbols(ctx: EffectContext, payload: HookPayload): readonly SymbolId[] {
  if (payload.visibleSymbols !== undefined) return payload.visibleSymbols;
  if (ctx.visibleSymbols !== undefined) return ctx.visibleSymbols;
  const grid = gridOf(ctx, payload);
  if (grid === undefined) return [];
  const symbols: SymbolId[] = [];
  for (const column of grid) {
    for (const symbol of column) symbols.push(symbol);
  }
  return symbols;
}

/** Cells of the payload's winning evaluations, or null when no wins were passed. */
function scoringCells(payload: HookPayload): Set<string> | null {
  if (!Array.isArray(payload.wins)) return null;
  const cells = new Set<string>();
  for (const win of payload.wins as readonly { cells?: readonly Cell[] }[]) {
    for (const cell of win.cells ?? []) cells.add(`${cell[0]},${cell[1]}`);
  }
  return cells;
}

/**
 * Symbol behaviours that SPEC 2.6 makes normative but that need an effect
 * hook rather than a physics flag. Content may override one by giving the
 * symbol its own reference for the same hook.
 */
export const DEFAULT_SYMBOL_EFFECTS: Readonly<Partial<Record<SymbolId, readonly HandlerRef[]>>> = Object.freeze({
  // Uranium-235: each peg hit adds +15 chips to every other orb in flight.
  uranium: Object.freeze([{ handler: 'onPegHit', params: { action: 'addChipsAllOrbs', amount: 15 } }]),
});

/**
 * Handler references for one symbol and hook: the symbol's own content
 * references when it has any for `hook`, else the built-in SPEC 2.6 default.
 */
export function symbolEffectRefs(
  symbolId: string,
  hook: HookName,
  contentRefs: readonly HandlerRef[] | undefined,
): HandlerRef[] {
  const own = (contentRefs ?? []).filter((ref) => ref.handler === hook);
  if (own.length > 0) return own;
  const defaults = DEFAULT_SYMBOL_EFFECTS[symbolId as SymbolId] ?? [];
  return defaults.filter((ref) => ref.handler === hook).map((ref) => ({
    handler: ref.handler,
    ...(ref.params === undefined ? {} : { params: { ...ref.params } }),
  }));
}

const COPPER_TEMPLATE: TokenTemplate = {
  symbolId: 'scrap',
  skin: 'copper',
  radius: 10,
  mass: 1,
  slide: 0.5,
  count: 1,
  stack: 1,
  weldOnLand: false,
  magnetic: false,
  seismic: false,
  resistSuction: false,
};

const BULLION_TEMPLATE: TokenTemplate = {
  symbolId: 'seven',
  skin: 'bullion',
  radius: 12,
  mass: 1.1,
  slide: 0.5,
  count: 1,
  stack: 3,
  weldOnLand: false,
  magnetic: false,
  seismic: false,
  resistSuction: false,
};

// ----------------------------------------------------------------- handlers
export const EFFECT_HANDLERS: Readonly<Record<string, EffectHandler>> = {
  noop: () => [],

  // ---- slot-stage symbol behaviours (T-010/T-013 boundary)
  diamondAdjacencyX(ctx, payload, params) {
    const grid = gridOf(ctx, payload);
    if (grid === undefined) return [];
    // SPEC 2.6: a Blood Diamond gains +0.2 X per orthogonally adjacent Magnet
    // Skull, so every (diamond, skull) neighbour pair counts. When the payload
    // carries the spin's wins, only scoring diamonds earn the bonus.
    const perSkull = num(params, 'xPerSkull', 0.2);
    const scoring = scoringCells(payload);
    let pairs = 0;
    for (let col = 0; col < grid.length; col++) {
      const column = grid[col]!;
      for (let row = 0; row < column.length; row++) {
        if (column[row] !== 'diamond') continue;
        if (scoring !== null && !scoring.has(`${col},${row}`)) continue;
        const neighbours: Cell[] = [
          [col - 1, row],
          [col + 1, row],
          [col, row - 1],
          [col, row + 1],
        ];
        for (const [nc, nr] of neighbours) {
          if (grid[nc]?.[nr] === 'skull') pairs++;
        }
      }
    }
    if (pairs === 0) return [];
    return [{ e: 'mulX', factor: round9(1 + perSkull * pairs) }];
  },

  feverOnVisibleSevens(ctx, payload, params) {
    const minimum = Math.max(1, Math.floor(num(params, 'minVisible', 3)));
    let seen = 0;
    for (const symbol of visibleSymbols(ctx, payload)) if (symbol === 'seven') seen++;
    return seen >= minimum ? [{ e: 'triggerFever' }] : [];
  },

  // ---- additive chips / multipliers
  addChips(ctx, payload, params) {
    const amount = num(params, 'amount') * copiesOf(ctx);
    if (amount === 0) return [];
    const orbId = typeof payload.orbId === 'number' ? payload.orbId : undefined;
    return [orbId === undefined ? { e: 'addChips', amount } : { e: 'addChips', amount, orbId }];
  },

  addChipsAllOrbs(ctx, payload, params) {
    const amount = num(params, 'amount') * copiesOf(ctx);
    if (amount === 0) return [];
    const exceptOrbId = typeof payload.orbId === 'number' ? payload.orbId : undefined;
    return [
      exceptOrbId === undefined
        ? { e: 'addChipsAllOrbs', amount }
        : { e: 'addChipsAllOrbs', amount, exceptOrbId },
    ];
  },

  addMult(ctx, _payload, params) {
    const amount = num(params, 'amount') * copiesOf(ctx);
    return amount === 0 ? [] : [{ e: 'addMult', amount }];
  },

  mulX(ctx, _payload, params) {
    const factor = num(params, 'factor', 1);
    if (!Number.isFinite(factor) || factor < 0) return [];
    return [{ e: 'mulX', factor: stackFactor(factor, copiesOf(ctx)) }];
  },

  addNextSpinMult(ctx, _payload, params) {
    const amount = num(params, 'amount') * copiesOf(ctx);
    return amount === 0 ? [] : [{ e: 'addNextSpinMult', amount }];
  },

  mulNextSpinX(ctx, _payload, params) {
    const factor = num(params, 'factor', 1);
    if (!Number.isFinite(factor) || factor <= 0) return [];
    const amount = (stackFactor(factor, copiesOf(ctx)) - 1);
    if (amount === 0) return [];
    return [
      {
        e: 'addNextSpinX',
        amount,
        cap: num(params, 'cap', 9),
        key: text(params, 'key', 'nextSpinX'),
      },
    ];
  },

  addNextSpinX(ctx, _payload, params) {
    const key = text(params, 'key', 'nextSpinX');
    const cap = num(params, 'cap', Number.POSITIVE_INFINITY);
    const amount = num(params, 'amount') * copiesOf(ctx);
    if (!Number.isFinite(amount) || amount <= 0) return [];
    const remaining = Number.isFinite(cap) ? Math.max(0, cap - nextSpinX(ctx, key)) : amount;
    const applied = round9(Math.min(amount, remaining));
    return applied === 0 ? [] : [{ e: 'addNextSpinX', amount: applied, cap, key }];
  },

  addBonusOrbs(ctx, _payload, params) {
    const count = Math.floor(num(params, 'count') * copiesOf(ctx));
    return count === 0 ? [] : [{ e: 'addBonusOrbs', count }];
  },

  // ---- cash
  addCash(ctx, _payload, params) {
    const amount = num(params, 'amount') * copiesOf(ctx);
    if (amount === 0) return [];
    return [{ e: 'addCash', amount, reason: flag(params, 'drain') ? 'drain' : 'bonus' }];
  },

  addTokenCash(ctx, _payload, params) {
    const amount = num(params, 'amount') * copiesOf(ctx);
    return amount === 0 ? [] : [{ e: 'addTokenCash', amount }];
  },

  mulTokenCash(ctx, _payload, params) {
    const factor = num(params, 'factor', 1);
    if (!Number.isFinite(factor) || factor < 0) return [];
    return [{ e: 'mulTokenCash', factor: stackFactor(factor, copiesOf(ctx)) }];
  },

  mulLipPayout(ctx, _payload, params) {
    const factor = num(params, 'factor', 1);
    if (!Number.isFinite(factor) || factor < 0) return [];
    return [{ e: 'mulLipPayout', factor: stackFactor(factor, copiesOf(ctx)) }];
  },

  // ---- spawns / directives
  spawnCopper(ctx, _payload, params) {
    const count = Math.max(0, Math.floor(num(params, 'count', 1) * copiesOf(ctx)));
    if (count === 0) return [];
    return [{ e: 'spawnToken', template: { ...COPPER_TEMPLATE, count }, cash: num(params, 'cash') }];
  },

  spawnBullionStack(ctx, _payload, params) {
    const stack = Math.max(1, Math.floor(num(params, 'stack', 3)));
    const count = Math.max(0, Math.floor(num(params, 'count', 1) * copiesOf(ctx)));
    if (count === 0) return [];
    return [
      {
        e: 'spawnToken',
        template: { ...BULLION_TEMPLATE, stack, count },
        cash: num(params, 'cash'),
      },
    ];
  },

  simDirective(_ctx, _payload, params) {
    const name = text(params, 'directive');
    const directive = directiveFrom(name, params);
    return directive === null ? [] : [{ e: 'simDirective', directive }];
  },

  flagOrb(_ctx, _payload, params) {
    const canSplit = flag(params, 'canSplit') || params?.canSplit === undefined;
    return [{ e: 'flagOrb', flags: { canSplit } }];
  },

  triggerFever: () => [{ e: 'triggerFever' }],

  everyNthCanSplit(ctx, payload, params) {
    const every = Math.max(1, Math.floor(num(params, 'every', 2)));
    if (!hitsEvery(orbIndex(ctx, payload), every, copiesOf(ctx))) return [];
    return [{ e: 'flagOrb', flags: { canSplit: true } }];
  },

  nudgeEveryNthPeg(ctx, payload, params) {
    const every = Math.max(1, Math.floor(num(params, 'every', 3)));
    if (!hitsEvery(pegIndex(ctx, payload), every, copiesOf(ctx))) return [];
    const distance = num(params, 'distance', 4) * copiesOf(ctx);
    return distance === 0 ? [] : [{ e: 'simDirective', directive: { t: 'nudgeForward', distance } }];
  },

  // ---- physics modifiers
  centerPull(ctx, _payload, params) {
    const copies = copiesOf(ctx);
    return [
      {
        e: 'setPhysicsMod',
        patch: {
          centerPullOrbs: num(params, 'orbs', 1) * copies,
          centerPullTokens: num(params, 'tokens', 1) * copies,
        },
        combine: 'add',
      },
    ];
  },

  dozerBoost(ctx, _payload, params) {
    const copies = copiesOf(ctx);
    const patch: Partial<Omit<PhysicsModifiers, 'gutterBounceChances'>> = {};
    const speed = num(params, 'speedMul', 1);
    const stroke = num(params, 'strokeMul', 1);
    if (speed !== 1) patch.dozerSpeedMul = (speed - 1) * copies;
    if (stroke !== 1) patch.dozerStrokeMul = (stroke - 1) * copies;
    return Object.keys(patch).length === 0
      ? []
      : [{ e: 'setPhysicsMod', patch, combine: 'add' }];
  },

  gutterBounce(ctx, _payload, params) {
    const chance = Math.min(1, Math.max(0, num(params, 'chance', 0)));
    if (chance <= 0) return [];
    const effects: Effect[] = [];
    for (let i = 0; i < copiesOf(ctx); i++) {
      effects.push({ e: 'setPhysicsMod', patch: { addGutterBounce: chance }, combine: 'add' });
    }
    return effects;
  },

  suction(ctx, _payload, params) {
    const amount = num(params, 'amount', 1) * copiesOf(ctx);
    return amount === 0
      ? []
      : [{ e: 'setPhysicsMod', patch: { suction: amount }, combine: 'add' }];
  },

  // ---- boss directives expressible as sim directives
  iceBlocks(_ctx, _payload, params) {
    return [
      {
        e: 'simDirective',
        directive: { t: 'dropIceBlocks', count: Math.max(0, Math.floor(num(params, 'count', 2))) },
      },
    ];
  },

  removeCenterTokens(_ctx, _payload, params) {
    return [
      {
        e: 'simDirective',
        directive: { t: 'sweepCenter', count: Math.max(0, Math.floor(num(params, 'count', 2))) },
      },
    ];
  },

  // Boss scoring/rewards are owned by T-015; they are valid actions with no
  // direct Effect representation in C-4.
  seededScore: () => [],
  frozenCellScore: () => [],
  deterministicCurve: () => [],
  freezeCells: () => [],
  relicChoice: () => [],
  shopCapacity: () => [],
  victory: () => [],
};

export const EFFECT_HANDLER_IDS: readonly string[] = Object.freeze(
  Object.keys(EFFECT_HANDLERS).sort(),
);

export function hasEffectHandler(action: string): boolean {
  return Object.prototype.hasOwnProperty.call(EFFECT_HANDLERS, action);
}

function directiveFrom(name: string, params: HandlerParams): SimDirective | null {
  switch (name) {
    case 'surge':
      return { t: 'surge' };
    case 'clearShelf':
      return { t: 'clearShelf' };
    case 'clearOrbs':
      return { t: 'clearOrbs' };
    case 'nudgeForward':
      return { t: 'nudgeForward', distance: num(params, 'distance', 4) };
    case 'dropIceBlocks':
      return { t: 'dropIceBlocks', count: Math.max(0, Math.floor(num(params, 'count', 2))) };
    case 'sweepCenter':
      return { t: 'sweepCenter', count: Math.max(0, Math.floor(num(params, 'count', 2))) };
    default:
      return null;
  }
}

// --------------------------------------------------------------- dispatching
function actionOf(ref: HandlerRef): string {
  const action = ref.params?.action ?? ref.params?.handler ?? ref.params?.id;
  if (typeof action !== 'string' || action.length === 0) {
    throw new UnknownEffectHandlerError('');
  }
  return action;
}

function paramKey(params: HandlerParams): string {
  if (params === undefined) return '';
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${String(params[key])}`)
    .join('&');
}

/**
 * Dispatch one C-4 hook over content references.
 *
 * References with the same action and params are folded into one handler call
 * with `ctx.copies` set, which implements additive duplicate stacking. The
 * returned effects are fresh objects; inputs are never mutated.
 */
export function dispatchHook<H extends HookName>(
  hook: H,
  refs: readonly HandlerRef[],
  ctx: EffectContext = {},
  payload: HookPayloadMap[H] = {} as HookPayloadMap[H],
): Effect[] {
  const groups = new Map<string, { action: string; params: HandlerParams; count: number }>();
  for (const ref of refs) {
    if (ref.handler !== hook) continue;
    const action = actionOf(ref);
    if (!hasEffectHandler(action)) throw new UnknownEffectHandlerError(action);
    const key = `${action}\u0000${paramKey(ref.params)}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { action, params: ref.params, count: 1 });
    } else {
      group.count += 1;
    }
  }

  const baseCopies = copiesOf(ctx);
  const effects: Effect[] = [];
  for (const group of groups.values()) {
    const handler = EFFECT_HANDLERS[group.action]!;
    const derived: EffectContext = {
      ...ctx,
      copies: group.count * baseCopies,
      copyIndex: 0,
    };
    effects.push(...handler(derived, payload, group.params));
  }
  return effects;
}

/** Dispatch several reference sets over one hook (e.g. trinkets + active drink). */
export function dispatchHookMany<H extends HookName>(
  hook: H,
  refSets: readonly (readonly HandlerRef[])[],
  ctx: EffectContext = {},
  payload: HookPayloadMap[H] = {} as HookPayloadMap[H],
): Effect[] {
  const refs: HandlerRef[] = [];
  for (const set of refSets) refs.push(...set);
  return dispatchHook(hook, refs, ctx, payload);
}

/** Dispatch every C-4 hook at once. Useful for validation and tests. */
export function dispatchAllHooks(
  refs: readonly HandlerRef[],
  ctx: EffectContext = {},
  payloads: Partial<Record<HookName, HookPayload>> = {},
): Record<HookName, Effect[]> {
  const result = {} as Record<HookName, Effect[]>;
  for (const hook of HOOK_NAMES) {
    result[hook] = dispatchHook(hook, refs, ctx, payloads[hook] ?? {});
  }
  return result;
}

/** Readable aliases used by callers that name the operation after the result. */
export const dispatchEffects = dispatchHook;
export const dispatch = dispatchHook;

// -------------------------------------------------------------- modifier bag
export function createModifierBag(base?: Partial<PhysicsModifiers>): PhysicsModifiers {
  return {
    dozerSpeedMul: finite(base?.dozerSpeedMul, DEFAULT_MODIFIERS.dozerSpeedMul),
    dozerStrokeMul: finite(base?.dozerStrokeMul, DEFAULT_MODIFIERS.dozerStrokeMul),
    centerPullOrbs: finite(base?.centerPullOrbs, DEFAULT_MODIFIERS.centerPullOrbs),
    centerPullTokens: finite(base?.centerPullTokens, DEFAULT_MODIFIERS.centerPullTokens),
    gutterBounceChances: [...(base?.gutterBounceChances ?? DEFAULT_MODIFIERS.gutterBounceChances)],
    suction: finite(base?.suction, DEFAULT_MODIFIERS.suction),
  };
}

type ModifierKey = Exclude<keyof PhysicsModifiers, 'gutterBounceChances'>;

const MODIFIER_KEYS: readonly ModifierKey[] = [
  'dozerSpeedMul',
  'dozerStrokeMul',
  'centerPullOrbs',
  'centerPullTokens',
  'suction',
];

/** Apply one `setPhysicsMod` effect, returning a fresh bag. */
export function applyPhysicsMod(
  bag: PhysicsModifiers,
  effect: Extract<Effect, { e: 'setPhysicsMod' }>,
): PhysicsModifiers {
  const next = createModifierBag(bag);
  const patch = effect.patch;
  for (const key of MODIFIER_KEYS) {
    const value = patch[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    switch (effect.combine) {
      case 'set':
        next[key] = value;
        break;
      case 'mul':
        next[key] = next[key] * value;
        break;
      case 'add':
        next[key] = next[key] + value;
        break;
    }
  }
  const bounce = patch.addGutterBounce;
  if (typeof bounce === 'number' && Number.isFinite(bounce) && bounce > 0) {
    if (effect.combine === 'set') next.gutterBounceChances = [Math.min(1, bounce)];
    else next.gutterBounceChances.push(Math.min(1, Math.max(0, bounce)));
  }
  return next;
}

export function applyModifierEffects(
  effects: readonly Effect[],
  base?: Partial<PhysicsModifiers>,
): PhysicsModifiers {
  let bag = createModifierBag(base);
  for (const effect of effects) {
    if (effect.e === 'setPhysicsMod') bag = applyPhysicsMod(bag, effect);
  }
  return bag;
}

export const modifiersFromEffects = applyModifierEffects;

/** Dispatch the physicsModifiers hook and fold its effects into a fresh bag. */
export function buildModifierBag<H extends HookName = 'physicsModifiers'>(
  refs: readonly HandlerRef[],
  ctx: EffectContext = {},
  payload: HookPayloadMap[H] = {} as HookPayloadMap[H],
  base?: Partial<PhysicsModifiers>,
): PhysicsModifiers {
  return applyModifierEffects(
    dispatchHook('physicsModifiers', refs, ctx, payload as HookPayload),
    base,
  );
}

export const resolveModifiers = buildModifierBag;

// --------------------------------------------------------- effect resolution
export interface EffectResolutionOptions {
  readonly nextSpin?: NextSpinBonuses;
  readonly modifiers?: Partial<PhysicsModifiers>;
}

export interface EffectResolution {
  chips: number;
  allOrbChips: number;
  addMult: number;
  xMult: number;
  nextSpinX: Record<string, number>;
  nextSpinAddMult: number;
  bonusOrbs: number;
  cash: number;
  tokenCashMul: number;
  tokenCashAdd: number;
  lipPayoutMul: number;
  modifiers: PhysicsModifiers;
  spawns: { template: TokenTemplate; cash: number }[];
  directives: SimDirective[];
  flags: { canSplit?: boolean };
  triggerFever: boolean;
}

/**
 * Fold effects into a single, serialisable result. Caps on `addNextSpinX` are
 * enforced per key against the incoming next-spin state.
 */
export function applyEffects(
  effects: readonly Effect[],
  options: EffectResolutionOptions = {},
): EffectResolution {
  const nextSpinX: Record<string, number> = { ...(options.nextSpin?.xBonus ?? {}) };
  let modifiers = createModifierBag(options.modifiers);
  let chips = 0;
  let allOrbChips = 0;
  let addMult = 0;
  let xMult = 1;
  let nextSpinAddMult = options.nextSpin?.addMult ?? 0;
  let bonusOrbs = options.nextSpin?.bonusOrbs ?? 0;
  let cash = 0;
  let tokenCashMul = 1;
  let tokenCashAdd = 0;
  let lipPayoutMul = 1;
  const spawns: { template: TokenTemplate; cash: number }[] = [];
  const directives: SimDirective[] = [];
  const flags: { canSplit?: boolean } = {};
  let triggerFever = false;

  for (const effect of effects) {
    switch (effect.e) {
      case 'addChips':
        chips += effect.amount;
        break;
      case 'addChipsAllOrbs':
        allOrbChips += effect.amount;
        break;
      case 'addMult':
        addMult += effect.amount;
        break;
      case 'mulX':
        xMult *= effect.factor;
        break;
      case 'addNextSpinX': {
        const current = finite(nextSpinX[effect.key], 0);
        const applied = round9(Math.max(0, Math.min(effect.amount, effect.cap - current)));
        nextSpinX[effect.key] = round9(current + applied);
        break;
      }
      case 'addNextSpinMult':
        nextSpinAddMult += effect.amount;
        break;
      case 'addBonusOrbs':
        bonusOrbs += effect.count;
        break;
      case 'addCash':
        cash += effect.amount;
        break;
      case 'mulTokenCash':
        tokenCashMul *= effect.factor;
        break;
      case 'addTokenCash':
        tokenCashAdd += effect.amount;
        break;
      case 'mulLipPayout':
        lipPayoutMul *= effect.factor;
        break;
      case 'spawnToken':
        spawns.push({ template: { ...effect.template }, cash: effect.cash });
        break;
      case 'simDirective':
        directives.push({ ...effect.directive });
        break;
      case 'setPhysicsMod':
        modifiers = applyPhysicsMod(modifiers, effect);
        break;
      case 'flagOrb':
        if (effect.flags.canSplit === true) flags.canSplit = true;
        break;
      case 'triggerFever':
        triggerFever = true;
        break;
    }
  }

  return {
    chips,
    allOrbChips,
    addMult,
    xMult,
    nextSpinX,
    nextSpinAddMult,
    bonusOrbs,
    cash,
    tokenCashMul,
    tokenCashAdd,
    lipPayoutMul,
    modifiers,
    spawns,
    directives,
    flags,
    triggerFever,
  };
}

export const resolveEffects = applyEffects;
