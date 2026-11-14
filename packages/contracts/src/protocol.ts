/**
 * C-2 (commands and events), C-4 (effect hooks), C-5 (run state).
 * UI -> core: Command. core -> UI/anim/audio: GameEvent, each stamped with a tick.
 */
import type { FloorId, ItemCategory, ShopArchetype, SymbolId, Wiring } from './content';
import type { BodyId, PhysicsEvent, PhysicsModifiers, SimDirective, TokenTemplate } from './sim';

export type Cell = [col: number, row: number];

// ---------------------------------------------------------------- commands
export type Command =
  | { c: 'NewRun'; seed: string }
  | { c: 'LoadCoin'; coinId: string }
  | { c: 'Drink'; slot: number }
  | { c: 'Spin' }
  | { c: 'ContinueAfterRound' }
  | { c: 'ShopBuy'; offerId: string; target?: { reel?: number } }
  | { c: 'ShopReroll' }
  | { c: 'ShopExpand' }
  | { c: 'ShopLeave' }
  | { c: 'ChooseFloor'; floorId: FloorId }
  | { c: 'ChooseRelic'; index: number }
  | { c: 'ChooseJumper'; index: number }
  | { c: 'SetOvervolt'; lineId: string | null }
  | { c: 'AbandonRun' };

export type CommandError =
  | 'WRONG_PHASE'
  | 'ORBS_IN_FLIGHT'
  | 'INSUFFICIENT_FUNDS'
  | 'UNKNOWN_ID'
  | 'NOT_OWNED'
  | 'AT_LIMIT'
  | 'INVALID_TARGET';

export type CommandResult = { ok: true } | { ok: false; error: CommandError };

// ------------------------------------------------------------------ phases
export type Phase =
  | 'TITLE'
  | 'PREP'
  | 'SPINNING'
  | 'RESOLVING'
  | 'ROUND_SETTLE'
  | 'ROUND_RESULT'
  | 'SHOP'
  | 'RELIC_PICK'
  | 'JUMPER_PICK'
  | 'BOSS_INTRO'
  | 'ELEVATOR'
  | 'FLOOR_TRANSITION'
  | 'GAME_OVER'
  | 'VICTORY';

// ------------------------------------------------------------------ events
export interface WinEval {
  kind: 'line' | 'ways' | 'cluster';
  symbolId: SymbolId;
  cells: Cell[];
  lineId?: string;
  lineMult: number;
  overvolt?: boolean;
}

export interface ShopOffer {
  offerId: string;
  itemId: string;
  category: ItemCategory;
  price: number;
  sold: boolean;
}

export type RoundResult =
  | { kind: 'normal'; passed: boolean; quota: number; bankrollBefore: number; bankrollAfter: number }
  | { kind: 'boss'; passed: boolean; playerScore: number; bossScore: number };

export type EngineEvent =
  | { t: 'SpinStarted'; spinIndex: number; cols: number; rows: number }
  | { t: 'ReelStopped'; col: number; symbols: SymbolId[] }
  | { t: 'SpinEvaluated'; grid: SymbolId[][]; wins: WinEval[]; chips: number; addMult: number; xMult: number; equity: number; orbPlan: { cell: Cell | null; symbolId: string; chips: number }[] }
  | { t: 'TumbleStep'; cleared: Cell[]; gridAfter: SymbolId[][] }
  | { t: 'OrbValued'; orbId: BodyId; chips: number }
  | { t: 'TokenValued'; tokenId: BodyId; cash: number }
  | { t: 'CashBanked'; tokenId: BodyId; cash: number; x: number }
  | { t: 'FeverChanged'; value: number }
  | { t: 'FeverTriggered' }
  | { t: 'CellsFrozen'; cells: Cell[]; spins: number }
  | { t: 'BossScored'; delta: number; total: number; playerScore: number }
  | { t: 'BossSabotage'; kind: string }
  | { t: 'RoundSettled'; result: RoundResult }
  | { t: 'PhaseChanged'; from: Phase; to: Phase }
  | { t: 'ShopRolled'; archetype: ShopArchetype; offers: ShopOffer[]; rerollCost: number; expandCost: number | null }
  | { t: 'ItemBought'; offerId: string; itemId: string; price: number }
  | { t: 'TrinketMounted'; itemId: string; count: number }
  | { t: 'DrinkActive'; itemId: string | null }
  | { t: 'CoinLoaded'; coinId: string }
  | { t: 'GridMutated'; from: { cols: number; rows: number }; to: { cols: number; rows: number }; wiring: Wiring }
  | { t: 'JumpersOffered'; options: Cell[][] }
  | { t: 'RelicsOffered'; itemIds: string[] }
  | { t: 'BankrollChanged'; delta: number; total: number; reason: 'lip' | 'quota' | 'shop' | 'drain' | 'coin' | 'bonus' }
  | { t: 'RunStarted'; seed: string }
  | { t: 'RunEnded'; outcome: 'victory' | 'defeat' | 'abandoned' };

/** Everything consumers can receive. Physics events pass through unchanged. */
export type GameEvent = (EngineEvent | PhysicsEvent) & { tick: number };

// ------------------------------------------------------------ effect hooks
export type HookName =
  | 'onRunStart'
  | 'onSpinStart'
  | 'onCellScored'
  | 'onSpinEvaluated'
  | 'onOrbLaunch'
  | 'onPegHit'
  | 'onChuteExit'
  | 'onTokenSpawn'
  | 'onDozerFullExtension'
  | 'onGutterLoss'
  | 'onLipDrop'
  | 'onRoundEnd'
  | 'onShopEnter'
  | 'physicsModifiers';

/**
 * What a handler may ask for. Handlers are pure: (ctx, payload, params) => Effect[].
 * Gutter bumpers do not use a hook; they contribute to PhysicsModifiers via
 * `setPhysicsMod` from the `physicsModifiers` hook, and the sim rolls them.
 */
export type Effect =
  | { e: 'addChips'; amount: number; orbId?: BodyId }
  | { e: 'addChipsAllOrbs'; amount: number; exceptOrbId?: BodyId }
  | { e: 'addMult'; amount: number }
  | { e: 'mulX'; factor: number }
  | { e: 'addNextSpinX'; amount: number; cap: number; key: string }
  | { e: 'addNextSpinMult'; amount: number }
  | { e: 'addBonusOrbs'; count: number }
  | { e: 'addCash'; amount: number; reason: 'bonus' | 'drain' }
  | { e: 'mulTokenCash'; factor: number }
  | { e: 'addTokenCash'; amount: number }
  | { e: 'mulLipPayout'; factor: number }
  | { e: 'spawnToken'; template: TokenTemplate; cash: number }
  | { e: 'simDirective'; directive: SimDirective }
  | { e: 'setPhysicsMod'; patch: Partial<Omit<PhysicsModifiers, 'gutterBounceChances'>> & { addGutterBounce?: number }; combine: 'mul' | 'add' | 'set' }
  | { e: 'flagOrb'; flags: Partial<{ canSplit: boolean }> }
  | { e: 'triggerFever' };

// --------------------------------------------------------------- run state
/** C-5. Everything needed to resume a run, minus the sim (stored beside it as bytes). */
export interface RunState {
  saveVersion: number;
  seed: string;
  /** Engine RNG stream states, keyed by stream name. */
  rng: Record<string, number[]>;
  tick: number;
  phase: Phase;
  floorId: FloorId;
  floorsCleared: FloorId[];
  /** 1..3 normal, 4 boss. */
  round: number;
  spinsLeft: number;
  bankroll: number;
  roundCash: number;
  fever: number;
  grid: { cols: number; rows: number; wiring: Wiring; strips: SymbolId[][]; visible: SymbolId[][]; frozen: { cell: Cell; spins: number }[] };
  jumpers: Cell[][];
  overvoltLineId: string | null;
  trinkets: string[];
  drinkTray: (string | null)[];
  activeDrink: string | null;
  ownedCoins: string[];
  loadedCoin: string;
  nextSpin: { xBonus: Record<string, number>; addMult: number; bonusOrbs: number };
  shop: { capacity: number; rerollCost: number; expandCost: number; archetype: ShopArchetype | null; offers: ShopOffer[] };
  boss: { score: number; spin: number } | null;
  orbChips: Record<number, number>;
  tokenCash: Record<number, number>;
  stats: { spins: number; lipDrops: number; gutterLosses: number; cashBanked: number; bestSpinEquity: number };
}

/** The on-disk save: RunState plus the sim's bytes, base64. */
export interface SaveFile {
  saveVersion: number;
  contractsRev: number;
  run: RunState;
  simBase64: string;
  stateHash: string;
}

/** What the UI talks to. Implemented by packages/core; mocked by contracts/testing. */
export interface GameCore {
  dispatch(cmd: Command): CommandResult;
  /** Advance one tick and return its events. */
  tick(): GameEvent[];
  getState(): Readonly<RunState>;
  getSimSnapshot(): import('./sim').SimSnapshot;
  stateHash(): string;
  save(): SaveFile;
  load(save: SaveFile): CommandResult;
  /** Recorded since NewRun; replaying it on a fresh core reproduces stateHash(). */
  getCommandLog(): { tick: number; cmd: Command }[];
}
