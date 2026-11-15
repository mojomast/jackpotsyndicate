
import {
  RULES,
  type BossDef,
  type BossId,
  type Cell,
  type FloorDef,
  type PhysicsModifiers,
  type RunState,
  type SimDirective,
} from '@jackpotsyndicate/contracts';
import { createRng, hashString } from '../rng/index';

export const BOSS_IDS = ['valenti', 'zero', 'auditor'] as const satisfies readonly BossId[];

export const BOSS_PHASE_THRESHOLDS = Object.freeze([0.66, 0.33] as const);
export const BOSS_HP_THRESHOLDS = BOSS_PHASE_THRESHOLDS;
export const BOSS_PHASE_IDS = ['phase1', 'phase2', 'phase3'] as const;

export type BossPhaseId = (typeof BOSS_PHASE_IDS)[number];

export type BossSkillId =
  | 'seededScore'
  | 'suction'
  | 'frozenCellScore'
  | 'freezeCells'
  | 'iceBlocks'
  | 'deterministicCurve'
  | 'removeCenterTokens'
  | 'relicChoice'
  | 'shopCapacity'
  | 'victory';

export interface BossSkill {
  readonly id: BossSkillId;
  readonly hook: string;
  readonly action: string;
  readonly params: Readonly<Record<string, number | string | boolean>>;
}

export interface BossPhaseDefinition {
  readonly id: BossPhaseId;
  readonly label: string;

  readonly minHpRatio: number;
  readonly skills: readonly BossSkill[];
}

export type BossScoreSpec =
  | {
      readonly kind: 'seededRange';
      readonly min: number;
      readonly max: number;
      readonly floorScale: boolean;
    }
  | {
      readonly kind: 'frozenCells';
      readonly base: number;
      readonly xPerFrozenCell: number;
      readonly floorScale: boolean;
    }
  | {
      readonly kind: 'curve';
      readonly base: number;
      readonly growth: number;
      readonly floorScale: boolean;
    };

export type BossSabotageSpec =
  | { readonly kind: 'suction'; readonly amount: number }
  | {
      readonly kind: 'freezeCells';
      readonly min: number;
      readonly max: number;
      readonly spins: number;
    }
  | {
      readonly kind: 'iceBlocks';
      readonly every: number;
      readonly count: number;
      readonly massMul: number;
    }
  | { readonly kind: 'removeCenterTokens'; readonly every: number; readonly count: number };

export type BossRewardSpec =
  | { readonly kind: 'relicChoice'; readonly count: number }
  | { readonly kind: 'shopCapacity'; readonly amount: number }
  | { readonly kind: 'victory' };

export interface BossDefinition {
  readonly id: BossId;
  readonly name: string;
  readonly tagline: string;
  readonly spriteKey: string;
  readonly maxHp: number;
  readonly hpThresholds: readonly number[];
  readonly phases: readonly BossPhaseDefinition[];
  readonly score: BossScoreSpec;
  readonly sabotage: readonly BossSabotageSpec[];
  readonly reward: BossRewardSpec;

  readonly content: BossDef;
}

const DEFAULT_MAX_HP: Readonly<Record<BossId, number>> = Object.freeze({
  valenti: 9_000,
  zero: 10_000,
  auditor: 12_000,
});

const CONTENT_DEFAULTS: Record<BossId, BossDef> = {
  valenti: {
    id: 'valenti',
    name: 'Don "The Vacuum" Valenti',
    tagline: 'Gutter rake saboteur',
    spriteKey: 'boss.valenti',
    score: { handler: 'onSpinEvaluated', params: { action: 'seededScore', min: 450, max: 900, floorScale: true } },
    sabotage: [{ handler: 'physicsModifiers', params: { action: 'suction', amount: 1 } }],
    reward: { handler: 'onRoundEnd', params: { action: 'relicChoice', count: 3 } },
  },
  zero: {
    id: 'zero',
    name: 'Madame Zero',
    tagline: 'Cold hands, colder reels',
    spriteKey: 'boss.zero',
    score: {
      handler: 'onSpinEvaluated',
      params: { action: 'frozenCellScore', base: 600, xPerFrozenCell: 0.5, floorScale: true },
    },
    sabotage: [
      { handler: 'onSpinStart', params: { action: 'freezeCells', min: 1, max: 2, spins: 2 } },
      {
        handler: 'onSpinStart',
        params: { action: 'iceBlocks', every: 2, count: 2, massMul: 3 },
      },
    ],
    reward: { handler: 'onRoundEnd', params: { action: 'shopCapacity', amount: 2 } },
  },
  auditor: {
    id: 'auditor',
    name: 'The Iron Auditor',
    tagline: 'Syndicate AI',
    spriteKey: 'boss.auditor',
    score: {
      handler: 'onSpinEvaluated',
      params: { action: 'deterministicCurve', base: 600, growth: 1.35, floorScale: true },
    },
    sabotage: [
      {
        handler: 'onDozerFullExtension',
        params: { action: 'removeCenterTokens', every: 3, count: 2 },
      },
    ],
    reward: { handler: 'onRoundEnd', params: { action: 'victory' } },
  },
};

const DEFAULT_CONTENT: Readonly<Record<BossId, BossDef>> = Object.freeze(CONTENT_DEFAULTS);

function num(
  params: Readonly<Record<string, number | string | boolean>> | undefined,
  key: string,
  fallback: number,
): number {
  const value = params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(
  params: Readonly<Record<string, number | string | boolean>> | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const value = params?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function actionOf(ref: BossDef['score']): string {
  const action = ref.params?.action;
  return typeof action === 'string' ? action : ref.handler;
}

function scoreSpecOf(ref: BossDef['score']): BossScoreSpec {
  const action = actionOf(ref);
  switch (action) {
    case 'seededScore':
      return {
        kind: 'seededRange',
        min: num(ref.params, 'min', 450),
        max: num(ref.params, 'max', 900),
        floorScale: bool(ref.params, 'floorScale', true),
      };
    case 'frozenCellScore':
      return {
        kind: 'frozenCells',
        base: num(ref.params, 'base', 600),
        xPerFrozenCell: num(ref.params, 'xPerFrozenCell', 0.5),
        floorScale: bool(ref.params, 'floorScale', true),
      };
    case 'deterministicCurve':
      return {
        kind: 'curve',
        base: num(ref.params, 'base', 600),
        growth: num(ref.params, 'growth', 1.35),
        floorScale: bool(ref.params, 'floorScale', true),
      };
    default:
      throw new RangeError(`boss score action ${action} is not supported`);
  }
}

function sabotageSpecsOf(def: BossDef): BossSabotageSpec[] {
  return def.sabotage.map((ref): BossSabotageSpec => {
    const action = actionOf(ref);
    switch (action) {
      case 'suction':
        return { kind: 'suction', amount: num(ref.params, 'amount', 1) };
      case 'freezeCells':
        return {
          kind: 'freezeCells',
          min: Math.max(0, Math.floor(num(ref.params, 'min', 1))),
          max: Math.max(0, Math.floor(num(ref.params, 'max', 2))),
          spins: Math.max(1, Math.floor(num(ref.params, 'spins', 2))),
        };
      case 'iceBlocks':
        return {
          kind: 'iceBlocks',
          every: Math.max(1, Math.floor(num(ref.params, 'every', 2))),
          count: Math.max(0, Math.floor(num(ref.params, 'count', 2))),
          massMul: num(ref.params, 'massMul', 3),
        };
      case 'removeCenterTokens':
        return {
          kind: 'removeCenterTokens',
          every: Math.max(1, Math.floor(num(ref.params, 'every', 3))),
          count: Math.max(0, Math.floor(num(ref.params, 'count', 2))),
        };
      default:
        throw new RangeError(`boss sabotage action ${action} is not supported`);
    }
  });
}

function rewardSpecOf(def: BossDef): BossRewardSpec {
  const action = actionOf(def.reward);
  switch (action) {
    case 'relicChoice':
      return { kind: 'relicChoice', count: Math.max(1, Math.floor(num(def.reward.params, 'count', 3))) };
    case 'shopCapacity':
      return {
        kind: 'shopCapacity',
        amount: Math.max(0, Math.floor(num(def.reward.params, 'amount', 2))),
      };
    case 'victory':
      return { kind: 'victory' };
    default:
      throw new RangeError(`boss reward action ${action} is not supported`);
  }
}

function skill(
  id: BossSkillId,
  hook: string,
  action: string,
  params: Record<string, number | string | boolean>,
): BossSkill {
  return Object.freeze({ id, hook, action, params: Object.freeze({ ...params }) });
}

function phaseDefinitions(
  id: BossId,
  score: BossScoreSpec,
  sabotage: readonly BossSabotageSpec[],
): readonly BossPhaseDefinition[] {
  const scoreAction =
    score.kind === 'seededRange'
      ? 'seededScore'
      : score.kind === 'frozenCells'
        ? 'frozenCellScore'
        : 'deterministicCurve';
  const scoreParams: Record<string, number | string | boolean> =
    score.kind === 'seededRange'
      ? { action: scoreAction, min: score.min, max: score.max }
      : score.kind === 'frozenCells'
        ? { action: scoreAction, xPerFrozenCell: score.xPerFrozenCell }
        : { action: scoreAction, base: score.base, growth: score.growth };

  const phases: BossPhaseDefinition[] = [];
  const intensities = [1, 1.25, 1.5] as const;

  for (let index = 0; index < BOSS_PHASE_IDS.length; index++) {
    const phaseId = BOSS_PHASE_IDS[index]!;
    const skills: BossSkill[] = [];
    if (id === 'valenti') {
      skills.push(skill('seededScore', 'onSpinEvaluated', 'seededScore', scoreParams));
      const suction = sabotage.find((entry) => entry.kind === 'suction');
      skills.push(
        skill('suction', 'physicsModifiers', 'suction', {
          action: 'suction',
          amount: (suction?.kind === 'suction' ? suction.amount : 1) * intensities[index]!,
        }),
      );
    } else if (id === 'zero') {
      skills.push(
        skill('frozenCellScore', 'onSpinEvaluated', 'frozenCellScore', scoreParams),
      );
      const freeze = sabotage.find((entry) => entry.kind === 'freezeCells');
      if (freeze?.kind === 'freezeCells') {
        skills.push(
          skill('freezeCells', 'onSpinStart', 'freezeCells', {
            action: 'freezeCells',
            min: index === BOSS_PHASE_IDS.length - 1 ? freeze.max : freeze.min,
            max: freeze.max,
            spins: freeze.spins,
          }),
        );
      }
      const ice = sabotage.find((entry) => entry.kind === 'iceBlocks');
      if (ice?.kind === 'iceBlocks') {
        skills.push(
          skill('iceBlocks', 'onSpinStart', 'iceBlocks', {
            action: 'iceBlocks',
            every: ice.every,
            count: ice.count,
            massMul: ice.massMul,
          }),
        );
      }
    } else {
      skills.push(
        skill('deterministicCurve', 'onSpinEvaluated', 'deterministicCurve', scoreParams),
      );
      const sweep = sabotage.find((entry) => entry.kind === 'removeCenterTokens');
      if (sweep?.kind === 'removeCenterTokens') {
        skills.push(
          skill('removeCenterTokens', 'onDozerFullExtension', 'removeCenterTokens', {
            action: 'removeCenterTokens',
            every: sweep.every,
            count: sweep.count,
          }),
        );
      }
    }
    phases.push(
      Object.freeze({
        id: phaseId,
        label: phaseId === 'phase1' ? 'Opening' : phaseId === 'phase2' ? 'Pressure' : 'Last stand',
        minHpRatio: index === 0 ? 1 : BOSS_PHASE_THRESHOLDS[index - 1]!,
        skills: Object.freeze(skills),
      }),
    );
  }
  return Object.freeze(phases);
}

export function defineBoss(source: BossDef): BossDefinition {
  if (!BOSS_IDS.includes(source.id)) {
    throw new RangeError(`unknown boss id ${String(source.id)}`);
  }
  const score = scoreSpecOf(source.score);
  const sabotage = sabotageSpecsOf(source);
  return Object.freeze({
    id: source.id,
    name: source.name,
    tagline: source.tagline,
    spriteKey: source.spriteKey,
    maxHp: DEFAULT_MAX_HP[source.id],
    hpThresholds: BOSS_PHASE_THRESHOLDS,
    phases: phaseDefinitions(source.id, score, sabotage),
    score,
    sabotage: Object.freeze(sabotage),
    reward: rewardSpecOf(source),
    content: structuredClone(source),
  });
}

function resolveDefinition(
  def: BossDefinition | BossId | BossDef,
): BossDefinition {
  if (typeof def === 'string') return getBossDefinition(def);
  if (Array.isArray((def as BossDefinition).phases)) return def as BossDefinition;
  return defineBoss(def as BossDef);
}

export const BOSS_DEFINITIONS: readonly BossDefinition[] = Object.freeze(
  BOSS_IDS.map((id) => defineBoss(DEFAULT_CONTENT[id])),
);

export const BOSSES: Readonly<Record<BossId, BossDefinition>> = Object.freeze(
  Object.fromEntries(BOSS_DEFINITIONS.map((definition) => [definition.id, definition])) as Record<
    BossId,
    BossDefinition
  >,
);

export interface BossContentSource {
  readonly floors: readonly FloorDef[];
  readonly bosses?: readonly BossDef[];
}

export interface BossRunSelection {
  readonly floorId: string;
  readonly seed?: string;
}

function isContentSource(value: object): value is BossContentSource {
  return Array.isArray((value as BossContentSource).floors);
}

export function getBossDefinition(
  id: BossId,
  contentBosses?: readonly BossDef[],
): BossDefinition {
  const source = contentBosses?.find((boss) => boss.id === id) ?? DEFAULT_CONTENT[id];
  if (source === undefined) throw new RangeError(`unknown boss id ${String(id)}`);
  return defineBoss(source);
}

export function bossIdForSeed(seed: string, floorId = ''): BossId {
  const index = hashString(`boss:${seed}:${floorId}`) % BOSS_IDS.length;
  return BOSS_IDS[index]!;
}

function selectBossImpl(content: BossContentSource, state: BossRunSelection): BossDefinition {
  const floor = content.floors.find((candidate) => candidate.id === state.floorId);
  const id = floor?.bossId ?? bossIdForSeed(state.seed ?? '', state.floorId);
  return getBossDefinition(id, content.bosses);
}

export function selectBossForRun(
  content: BossContentSource,
  state: BossRunSelection,
): BossDefinition;

export function selectBossForRun(
  state: BossRunSelection,
  content: BossContentSource,
): BossDefinition;
export function selectBossForRun(
  first: BossContentSource | BossRunSelection,
  second: BossContentSource | BossRunSelection,
): BossDefinition {
  const firstIsContent = isContentSource(first as object);
  const content = (firstIsContent ? first : second) as BossContentSource;
  const state = (firstIsContent ? second : first) as BossRunSelection;
  return selectBossImpl(content, state);
}

export const selectBoss = selectBossForRun;

export function selectBossForSeed(
  seed: string,
  contentBosses?: readonly BossDef[],
): BossDefinition {
  return getBossDefinition(bossIdForSeed(seed), contentBosses);
}

function assertHp(def: BossDefinition, hp: number): void {
  if (!Number.isFinite(hp) || hp < 0) {
    throw new RangeError('boss hp must be finite and non-negative');
  }
  if (!Number.isFinite(def.maxHp) || def.maxHp <= 0) {
    throw new RangeError('boss maxHp must be positive');
  }
}

export function hpRatio(maxHp: number, hp: number): number {
  if (!Number.isFinite(maxHp) || maxHp <= 0) {
    throw new RangeError('maxHp must be finite and positive');
  }
  if (!Number.isFinite(hp)) throw new RangeError('hp must be finite');
  return Math.min(1, Math.max(0, hp / maxHp));
}

export function phaseForHp(def: BossDefinition, hp: number): BossPhaseDefinition {
  assertHp(def, hp);
  const ratio = hpRatio(def.maxHp, hp);
  if (ratio > BOSS_PHASE_THRESHOLDS[0]) return def.phases[0]!;
  if (ratio > BOSS_PHASE_THRESHOLDS[1]) return def.phases[1]!;
  return def.phases[2]!;
}

export function skillsAtHp(
  def: BossDefinition,
  hp: number,
): readonly BossSkill[] {
  return phaseForHp(def, hp).skills;
}

export function skillsAtRatio(
  def: BossDefinition,
  ratio: number,
): readonly BossSkill[] {
  return skillsAtHp(def, def.maxHp * Math.min(1, Math.max(0, ratio)));
}

export interface BossCombatState {
  readonly bossId: BossId;
  readonly maxHp: number;
  readonly hp: number;
  readonly phase: BossPhaseId;
}

export function createBossCombat(
  def: BossDefinition,
  hp = def.maxHp,
): BossCombatState {
  assertHp(def, hp);
  return Object.freeze({
    bossId: def.id,
    maxHp: def.maxHp,
    hp,
    phase: phaseForHp(def, hp).id,
  });
}

export type BossDamageError = 'INVALID_DAMAGE';

export type BossDamageResult =
  | {
      readonly ok: true;
      readonly bossId: BossId;
      readonly hpBefore: number;
      readonly hpAfter: number;
      readonly maxHp: number;
      readonly damage: number;
      readonly dealt: number;
      readonly overkill: number;
      readonly phaseBefore: BossPhaseId;
      readonly phaseAfter: BossPhaseId;
      readonly transitioned: boolean;
      readonly defeated: boolean;
      readonly state: BossCombatState;
    }
  | { readonly ok: false; readonly error: BossDamageError };

export function isLegalDamage(damage: number): boolean {
  return typeof damage === 'number' && Number.isFinite(damage) && damage >= 0;
}

export function applyDamage(
  def: BossDefinition,
  hp: number,
  damage: number,
): BossDamageResult {
  assertHp(def, hp);
  if (!isLegalDamage(damage)) return { ok: false, error: 'INVALID_DAMAGE' };
  const hpAfter = Math.max(0, hp - damage);
  const phaseBefore = phaseForHp(def, hp);
  const phaseAfter = phaseForHp(def, hpAfter);
  const damageDealt = Math.min(hp, damage);
  return Object.freeze({
    ok: true as const,
    bossId: def.id,
    hpBefore: hp,
    hpAfter,
    maxHp: def.maxHp,
    damage,
    dealt: damageDealt,
    overkill: damage - damageDealt,
    phaseBefore: phaseBefore.id,
    phaseAfter: phaseAfter.id,
    transitioned: phaseBefore.id !== phaseAfter.id,
    defeated: hpAfter === 0,
    state: Object.freeze({
      bossId: def.id,
      maxHp: def.maxHp,
      hp: hpAfter,
      phase: phaseAfter.id,
    }),
  });
}

export function damageBoss(
  combat: BossCombatState,
  damage: number,
): BossDamageResult {
  const def = getBossDefinition(combat.bossId);
  if (!Number.isFinite(combat.hp) || combat.hp < 0) {
    return { ok: false, error: 'INVALID_DAMAGE' };
  }
  return applyDamage(def, combat.hp, damage);
}

export interface BossScoreContext {
  readonly seed: string;

  readonly spin: number;
  readonly floorScale?: number;

  readonly frozenCells?: number;
}

function assertSpin(spin: number): void {
  if (!Number.isInteger(spin) || spin < 1) {
    throw new RangeError('boss spin must be a positive integer');
  }
}

function assertScale(scale: number): void {
  if (!Number.isFinite(scale) || scale < 0) {
    throw new RangeError('floorScale must be finite and non-negative');
  }
}

function integerPower(base: number, exponent: number): number {
  let result = 1;
  for (let i = 0; i < exponent; i++) result *= base;
  return result;
}

function bossScoreDelta(def: BossDefinition, context: BossScoreContext): number {
  assertSpin(context.spin);
  const scale = context.floorScale ?? 1;
  assertScale(scale);
  const score = def.score;
  switch (score.kind) {
    case 'seededRange': {
      const rng = createRng(`boss:${def.id}:${context.seed}:score:${context.spin}`);
      const raw = rng.range(score.min, score.max);
      return Math.round(raw * (score.floorScale ? scale : 1));
    }
    case 'frozenCells': {
      const frozen = Math.max(0, Math.floor(context.frozenCells ?? 0));
      const raw = score.base * (1 + score.xPerFrozenCell * frozen);
      return Math.round(raw * (score.floorScale ? scale : 1));
    }
    case 'curve': {
      const raw = score.base * integerPower(score.growth, context.spin);
      return Math.round(raw * (score.floorScale ? scale : 1));
    }
  }
}

export function bossScoreForSpin(
  def: BossDefinition | BossId | BossDef,
  context: BossScoreContext,
): number {
  return bossScoreDelta(resolveDefinition(def), context);
}

export const scoreForSpin = bossScoreForSpin;

export interface FrozenCell {
  readonly cell: Cell;
  readonly spins: number;
}

export interface FrozenTickResult {
  readonly active: readonly FrozenCell[];
  readonly expired: readonly Cell[];
}

function sameCell(a: Cell, b: Cell): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function containsCell(cells: readonly Cell[], cell: Cell): boolean {
  return cells.some((candidate) => sameCell(candidate, cell));
}

export function advanceFrozen(
  frozen: readonly FrozenCell[] = [],
): FrozenTickResult {
  const active: FrozenCell[] = [];
  const expired: Cell[] = [];
  for (const entry of frozen) {
    if (!Array.isArray(entry.cell) || entry.cell.length !== 2) continue;
    const spins = Math.floor(entry.spins);
    if (spins <= 1) {
      expired.push([entry.cell[0], entry.cell[1]]);
    } else {
      active.push({ cell: [entry.cell[0], entry.cell[1]], spins: spins - 1 });
    }
  }
  return { active, expired };
}

export interface FreezePlan {
  readonly frozen: readonly FrozenCell[];
  readonly added: readonly Cell[];
  readonly expired: readonly Cell[];
  readonly active: readonly FrozenCell[];
}

export interface FreezeOptions {
  readonly seed: string;
  readonly spin: number;
  readonly cols: number;
  readonly rows: number;
  readonly frozen?: readonly FrozenCell[];
}

function assertGrid(cols: number, rows: number): void {
  if (!Number.isInteger(cols) || cols <= 0 || !Number.isInteger(rows) || rows <= 0) {
    throw new RangeError('grid dimensions must be positive integers');
  }
}

export function planFreeze(
  def: BossDefinition | BossId | BossDef,
  options: FreezeOptions,
): FreezePlan {
  const definition = resolveDefinition(def);
  assertSpin(options.spin);
  assertGrid(options.cols, options.rows);
  const freeze = definition.sabotage.find((entry) => entry.kind === 'freezeCells');
  if (freeze?.kind !== 'freezeCells') {
    const ticked = advanceFrozen(options.frozen);
    return Object.freeze({
      frozen: Object.freeze([...ticked.active]),
      added: Object.freeze([]),
      expired: Object.freeze([...ticked.expired]),
      active: Object.freeze([...ticked.active]),
    });
  }

  const ticked = advanceFrozen(options.frozen);
  const existing = ticked.active.map((entry) => entry.cell);
  const available: Cell[] = [];
  for (let col = 0; col < options.cols; col++) {
    for (let row = 0; row < options.rows; row++) {
      const cell: Cell = [col, row];
      if (!containsCell(existing, cell)) available.push(cell);
    }
  }

  const min = Math.max(0, Math.min(freeze.min, freeze.max));
  const max = Math.max(min, freeze.max);
  const rng = createRng(`boss:${definition.id}:${options.seed}:freeze:${options.spin}`);
  const requested = min === max ? min : min + rng.int(max - min + 1);
  const count = Math.min(requested, available.length);
  const added = rng.shuffle(available).slice(0, count).map((cell): Cell => [cell[0], cell[1]]);
  const active = [...ticked.active, ...added.map((cell) => ({ cell, spins: freeze.spins }))];

  return Object.freeze({
    frozen: Object.freeze(active.map((entry) => ({ cell: [...entry.cell] as Cell, spins: entry.spins }))),
    added: Object.freeze(added.map((cell) => [...cell] as Cell)),
    expired: Object.freeze([...ticked.expired]),
    active: Object.freeze(active.map((entry) => ({ cell: [...entry.cell] as Cell, spins: entry.spins }))),
  });
}

export function isFrozen(
  frozen: readonly FrozenCell[],
  cell: Cell,
): boolean {
  return frozen.some((entry) => entry.spins > 0 && sameCell(entry.cell, cell));
}

export function scoreableCells(
  cols: number,
  rows: number,
  frozen: readonly FrozenCell[] = [],
): Cell[] {
  assertGrid(cols, rows);
  const cells: Cell[] = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const cell: Cell = [col, row];
      if (!isFrozen(frozen, cell)) cells.push(cell);
    }
  }
  return cells;
}

export type BossSabotageKind = 'suction' | 'freezeCells' | 'iceBlocks' | 'removeCenterTokens';

export interface BossSabotageNotice {
  readonly kind: BossSabotageKind;
  readonly [key: string]: number | string | boolean;
}

export interface BossPhaseTransition {
  readonly from: BossPhaseId;
  readonly to: BossPhaseId;
  readonly hp: number;
}

export interface BossSpinPlan {
  readonly bossId: BossId;
  readonly spin: number;
  readonly phase: BossPhaseId;
  readonly skills: readonly BossSkill[];
  readonly scoreDelta: number;
  readonly scoreTotal: number;
  readonly frozen: readonly FrozenCell[];
  readonly addedFrozen: readonly Cell[];
  readonly expiredFrozen: readonly Cell[];
  readonly directives: readonly SimDirective[];
  readonly modifiers: Readonly<Partial<PhysicsModifiers>>;
  readonly sabotage: readonly BossSabotageNotice[];
  readonly damage: BossDamageResult | null;
  readonly phaseTransition: BossPhaseTransition | null;
}

export interface BossSpinOptions {
  readonly seed: string;
  readonly spin: number;
  readonly floorScale?: number;
  readonly hp?: number;

  readonly damage?: number;
  readonly bossScore?: number;
  readonly cols?: number;
  readonly rows?: number;
  readonly frozen?: readonly FrozenCell[];
}

export function planBossSpin(
  def: BossDefinition | BossId | BossDef,
  options: BossSpinOptions,
): BossSpinPlan {
  const definition = resolveDefinition(def);
  assertSpin(options.spin);
  const hpBefore = options.hp ?? definition.maxHp;
  const phase = phaseForHp(definition, hpBefore);
  const directives: SimDirective[] = [];
  const sabotage: BossSabotageNotice[] = [];
  let modifiers: Partial<PhysicsModifiers> = {};
  let freeze: FreezePlan = Object.freeze({
    frozen: Object.freeze([]),
    added: Object.freeze([]),
    expired: Object.freeze([]),
    active: Object.freeze([]),
  });

  if (definition.id === 'valenti') {
    const suction = definition.sabotage.find((entry) => entry.kind === 'suction');
    if (suction?.kind === 'suction') {
      const phaseSkill = phase.skills.find((entry) => entry.id === 'suction');
      const amount =
        typeof phaseSkill?.params.amount === 'number' ? phaseSkill.params.amount : suction.amount;
      modifiers = { ...modifiers, suction: amount };
      sabotage.push(Object.freeze({ kind: 'suction', amount }));
    }
  } else if (definition.id === 'zero') {
    const cols = options.cols ?? RULES.MIN_COLS;
    const rows = options.rows ?? RULES.MIN_ROWS;
    freeze = planFreeze(definition, {
      seed: options.seed,
      spin: options.spin,
      cols,
      rows,
      frozen: options.frozen,
    });
    if (freeze.added.length > 0) {
      sabotage.push(
        Object.freeze({
          kind: 'freezeCells',
          count: freeze.added.length,
          spins: freeze.frozen[0]?.spins ?? 2,
        }),
      );
    }
    const ice = definition.sabotage.find((entry) => entry.kind === 'iceBlocks');
    if (
      ice?.kind === 'iceBlocks' &&
      options.spin % ice.every === 0 &&
      ice.count > 0
    ) {
      directives.push({ t: 'dropIceBlocks', count: ice.count });
      sabotage.push(
        Object.freeze({
          kind: 'iceBlocks',
          count: ice.count,
          massMul: ice.massMul,
        }),
      );
    }
  }

  const frozenCount = freeze.active.length;
  const scoreDelta = bossScoreDelta(definition, {
    seed: options.seed,
    spin: options.spin,
    floorScale: options.floorScale,
    frozenCells: frozenCount,
  });
  const scoreTotal = (options.bossScore ?? 0) + scoreDelta;

  let damage: BossDamageResult | null = null;
  let phaseTransition: BossPhaseTransition | null = null;
  if (options.damage !== undefined) {
    damage = applyDamage(definition, hpBefore, options.damage);
    if (damage.ok && damage.transitioned) {
      phaseTransition = {
        from: damage.phaseBefore,
        to: damage.phaseAfter,
        hp: damage.hpAfter,
      };
    }
  }

  return Object.freeze({
    bossId: definition.id,
    spin: options.spin,
    phase: phase.id,
    skills: phase.skills,
    scoreDelta,
    scoreTotal,
    frozen: freeze.frozen,
    addedFrozen: freeze.added,
    expiredFrozen: freeze.expired,
    directives: Object.freeze(directives),
    modifiers: Object.freeze({ ...modifiers }),
    sabotage: Object.freeze(sabotage),
    damage,
    phaseTransition,
  });
}

export interface BossDozerPlan {
  readonly bossId: BossId;
  readonly reciprocation: number;
  readonly directives: readonly SimDirective[];
  readonly sabotage: readonly BossSabotageNotice[];
}

export function planDozerExtension(
  def: BossDefinition | BossId | BossDef,
  reciprocation: number,
): BossDozerPlan {
  const definition = resolveDefinition(def);
  if (!Number.isInteger(reciprocation) || reciprocation < 1) {
    throw new RangeError('reciprocation must be a positive integer');
  }
  const sweep = definition.sabotage.find((entry) => entry.kind === 'removeCenterTokens');
  if (
    sweep?.kind !== 'removeCenterTokens' ||
    reciprocation % sweep.every !== 0 ||
    sweep.count === 0
  ) {
    return Object.freeze({
      bossId: definition.id,
      reciprocation,
      directives: Object.freeze([]),
      sabotage: Object.freeze([]),
    });
  }
  const directives: readonly SimDirective[] = Object.freeze([
    { t: 'sweepCenter', count: sweep.count },
  ]);
  return Object.freeze({
    bossId: definition.id,
    reciprocation,
    directives,
    sabotage: Object.freeze([
      Object.freeze({ kind: 'removeCenterTokens', count: sweep.count }),
    ]),
  });
}

export interface BossRewardClaim {
  readonly bossId: BossId;
  readonly reward: BossRewardSpec;
  readonly relicChoice: { readonly count: number } | null;
  readonly shopCapacity: { readonly amount: number; readonly target: number } | null;
  readonly victory: boolean;
}

export function bossReward(
  def: BossDefinition | BossId | BossDef,
): BossRewardClaim {
  const definition = resolveDefinition(def);
  const reward = definition.reward;
  return Object.freeze({
    bossId: definition.id,
    reward,
    relicChoice: reward.kind === 'relicChoice' ? Object.freeze({ count: reward.count }) : null,
    shopCapacity:
      reward.kind === 'shopCapacity'
        ? Object.freeze({
            amount: reward.amount,
            target: Math.min(RULES.SHOP_MAX_CAPACITY, RULES.SHOP_START_CAPACITY + reward.amount),
          })
        : null,
    victory: reward.kind === 'victory',
  });
}

export interface BossRewardOptions {

  readonly claimed?: boolean;
}

export interface BossRewardApplication {
  readonly ok: true;
  readonly claim: BossRewardClaim;
  readonly state: RunState;
  readonly changed: boolean;

  readonly requestRelicChoice: boolean;

  readonly victory: boolean;
}

export function applyBossReward(
  state: RunState,
  def: BossDefinition | BossId | BossDef,
  options: BossRewardOptions = {},
): BossRewardApplication {
  const claim = bossReward(def);
  const next = structuredClone(state);
  if (options.claimed === true) {
    return Object.freeze({
      ok: true as const,
      claim,
      state: next,
      changed: false,
      requestRelicChoice: false,
      victory: false,
    });
  }

  if (claim.shopCapacity !== null) {
    const baseTarget = claim.shopCapacity.target;
    const capacity =
      next.shop.capacity <= baseTarget
        ? baseTarget
        : Math.min(RULES.SHOP_MAX_CAPACITY, next.shop.capacity + claim.shopCapacity.amount);
    if (next.shop.capacity === capacity) {
      return Object.freeze({
        ok: true as const,
        claim,
        state: next,
        changed: false,
        requestRelicChoice: false,
        victory: false,
      });
    }
    next.shop.capacity = capacity;
    return Object.freeze({
      ok: true as const,
      claim,
      state: next,
      changed: true,
      requestRelicChoice: false,
      victory: false,
    });
  }

  return Object.freeze({
    ok: true as const,
    claim,
    state: next,
    changed: false,
    requestRelicChoice: claim.relicChoice !== null,
    victory: claim.victory,
  });
}

export interface BossRunView {
  readonly bossId: BossId;
  readonly seed: string;
  readonly spin: number;
  readonly score: number;
  readonly floorId: string;
  readonly floorScale: number;
}

export function bossViewForRun(
  content: BossContentSource,
  state: RunState,
): BossRunView {
  const definition = selectBossImpl(content, { floorId: state.floorId, seed: state.seed });
  const floor = content.floors.find((candidate) => candidate.id === state.floorId);
  return Object.freeze({
    bossId: definition.id,
    seed: state.seed,
    spin: state.boss?.spin ?? 0,
    score: state.boss?.score ?? 0,
    floorId: state.floorId,
    floorScale: floor?.quotaScale ?? 1,
  });
}

export class BossEncounter {
  readonly definition: BossDefinition;
  readonly seed: string;
  readonly floorScale: number;

  constructor(
    definition: BossDefinition | BossId | BossDef,
    options: { readonly seed: string; readonly floorScale?: number } = { seed: '' },
  ) {
    this.definition = resolveDefinition(definition);
    this.seed = options.seed;
    this.floorScale = options.floorScale ?? 1;
    Object.freeze(this);
  }

  static fromRun(content: BossContentSource, state: RunState): BossEncounter {
    const view = bossViewForRun(content, state);
    const definition = selectBossImpl(content, {
      floorId: state.floorId,
      seed: state.seed,
    });
    return new BossEncounter(definition, {
      seed: view.seed,
      floorScale: view.floorScale,
    });
  }

  get id(): BossId {
    return this.definition.id;
  }

  score(spin: number, frozenCells = 0): number {
    return bossScoreDelta(this.definition, {
      seed: this.seed,
      spin,
      floorScale: this.floorScale,
      frozenCells,
    });
  }

  skills(hp = this.definition.maxHp): readonly BossSkill[] {
    return skillsAtHp(this.definition, hp);
  }

  planSpin(options: Omit<BossSpinOptions, 'seed' | 'floorScale'>): BossSpinPlan {
    return planBossSpin(this.definition, {
      ...options,
      seed: this.seed,
      floorScale: this.floorScale,
    });
  }

  planDozerExtension(reciprocation: number): BossDozerPlan {
    return planDozerExtension(this.definition, reciprocation);
  }

  damage(hp: number, damage: number): BossDamageResult {
    return applyDamage(this.definition, hp, damage);
  }

  reward(): BossRewardClaim {
    return bossReward(this.definition);
  }
}

export function planRunBossSpin(
  content: BossContentSource,
  state: RunState,
  options: { readonly damage?: number; readonly hp?: number } = {},
): BossSpinPlan {
  if (state.boss === null) {
    throw new RangeError('planRunBossSpin requires a boss round');
  }
  const encounter = BossEncounter.fromRun(content, state);
  return encounter.planSpin({
    spin: state.boss.spin,
    hp: options.hp,
    damage: options.damage,
    bossScore: state.boss.score,
    cols: state.grid.cols,
    rows: state.grid.rows,
    frozen: state.grid.frozen,
  });
}

export interface TugOfWar {
  readonly playerScore: number;
  readonly bossScore: number;
  readonly lead: number;
  readonly ratio: number;
  readonly winner: 'player' | 'boss';
}

export function bossTugOfWar(playerScore: number, bossScore: number): TugOfWar {
  if (!Number.isFinite(playerScore) || playerScore < 0) {
    throw new RangeError('playerScore must be finite and non-negative');
  }
  if (!Number.isFinite(bossScore) || bossScore < 0) {
    throw new RangeError('bossScore must be finite and non-negative');
  }
  const total = playerScore + bossScore;
  return Object.freeze({
    playerScore,
    bossScore,
    lead: playerScore - bossScore,
    ratio: total === 0 ? 0.5 : playerScore / total,
    winner: playerScore >= bossScore ? 'player' : 'boss',
  });
}
