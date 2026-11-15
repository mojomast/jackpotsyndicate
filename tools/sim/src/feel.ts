/**
 * Feel report: aggregates TelemetryRun records into the numbers that matter
 * for moment-to-moment play and for run-level balance.
 *
 * Proportions carry Wilson 95% intervals so iterations can be compared with
 * an honest sense of noise.
 */
import type { BotId } from './bots';
import { STAGE_LABELS, type SpinRecord, type TelemetryRun } from './telemetry';

export interface Proportion {
  n: number;
  k: number;
  p: number;
  lo: number;
  hi: number;
}

export function wilson(k: number, n: number, z = 1.96): Proportion {
  if (n === 0) return { n, k, p: 0, lo: 0, hi: 0 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { n, k, p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * (pos - lo);
}

function sortedOf(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

export interface Dist {
  n: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  max: number;
}

export function dist(values: readonly number[]): Dist {
  const s = sortedOf(values);
  return {
    n: s.length,
    mean: mean(s),
    p10: quantile(s, 0.1),
    p50: quantile(s, 0.5),
    p90: quantile(s, 0.9),
    max: s.length === 0 ? 0 : s[s.length - 1]!,
  };
}

export interface SpinGroupSummary {
  spins: number;
  cash: Dist;
  zeroCash: Proportion;
  slotWin: Proportion;
  /** Spins whose orbs produced >= 3 pinfield events or a split (something to watch). */
  busy: Proportion;
  multiOrb: Proportion;
  orbs: number;
  splits: number;
  pegHits: number;
  tokens: number;
  lips: number;
  gutters: number;
  ticks: Dist;
  fever: Proportion;
}

function summariseSpins(spins: readonly SpinRecord[]): SpinGroupSummary {
  const n = spins.length;
  return {
    spins: n,
    cash: dist(spins.map((s) => s.cash)),
    zeroCash: wilson(spins.filter((s) => s.cash <= 0).length, n),
    slotWin: wilson(spins.filter((s) => s.win).length, n),
    busy: wilson(spins.filter((s) => s.orbs + s.splits >= 3).length, n),
    multiOrb: wilson(spins.filter((s) => s.orbs + s.splits >= 2).length, n),
    orbs: mean(spins.map((s) => s.orbs)),
    splits: mean(spins.map((s) => s.splits)),
    pegHits: mean(spins.map((s) => s.peg)),
    tokens: mean(spins.map((s) => s.tokens)),
    lips: mean(spins.map((s) => s.lips)),
    gutters: mean(spins.map((s) => s.gutters)),
    ticks: dist(spins.map((s) => s.ticks)),
    fever: wilson(spins.filter((s) => s.fever).length, n),
  };
}

export interface StageSummary {
  stage: number;
  label: string;
  reached: number;
  pass: Proportion;
  target: Dist;
  /** achieved / target (normal: bankroll before tribute / quota; boss: player / boss). */
  ratio: Dist;
  /** quota / round income: how hard the round is relative to what the round itself paid. */
  pressure: Dist;
  income: Dist;
  bankrollStart: Dist;
  roundTicks: Dist;
  spins: SpinGroupSummary;
}

export interface ItemPower {
  itemId: string;
  offeredRuns: number;
  boughtRuns: number;
  /** boughtRuns / offeredRuns */
  pickRate: number;
  ownedRuns: number;
  ownedWin: Proportion;
  /** Win rate of runs that reached the same shop but did not own the item (matched control). */
  controlWin: number;
  lift: number;
  ownedClearF1: Proportion;
}

export interface BossSummary {
  bossId: string;
  attempts: number;
  pass: Proportion;
  ratio: Dist;
}

export interface BotFeel {
  bot: BotId;
  runs: number;
  floor1: Proportion;
  win: Proportion;
  timeouts: number;
  maxBankroll: number;
  bankrollP99: number;
  runSpins: Dist;
  runTicks: Dist;
  /** Minutes of simulated play at 60 ticks/s (ignores menus/animations). */
  runMinutes: Dist;
  allSpins: SpinGroupSummary;
  stages: StageSummary[];
  deaths: { cause: string; share: number; count: number }[];
  bosses: BossSummary[];
  shop: {
    visits: number;
    purchasesPerVisit: number;
    anyPurchase: Proportion;
    rerollsPerVisit: number;
    spendShareOfBankroll: number;
    categoryBuys: Record<string, number>;
  };
  items: ItemPower[];
}

const CATEGORY_OF: Record<string, string> = {};
export function registerCategories(items: readonly { id: string; category: string }[]): void {
  for (const item of items) CATEGORY_OF[item.id] = item.category;
}

export function summariseBot(bot: BotId, runs: readonly TelemetryRun[]): BotFeel {
  const n = runs.length;
  const allSpins = runs.flatMap((r) => r.spins);

  const stages: StageSummary[] = [];
  for (let stage = 1; stage <= 12; stage++) {
    const rounds = runs.flatMap((r) => r.rounds.filter((x) => x.stage === stage));
    if (rounds.length === 0) continue;
    const spins = allSpins.filter((s) => s.stage === stage);
    stages.push({
      stage,
      label: STAGE_LABELS[stage - 1]!,
      reached: rounds.length,
      pass: wilson(rounds.filter((x) => x.passed).length, rounds.length),
      target: dist(rounds.map((x) => x.target)),
      ratio: dist(rounds.map((x) => (x.target > 0 ? x.achieved / x.target : 0))),
      pressure: dist(rounds.map((x) => (x.income > 0 ? x.target / x.income : 99))),
      income: dist(rounds.map((x) => x.income)),
      bankrollStart: dist(rounds.map((x) => x.bankrollStart)),
      roundTicks: dist(rounds.map((x) => x.ticks)),
      spins: summariseSpins(spins),
    });
  }

  const deathCounts = new Map<string, number>();
  for (const run of runs) deathCounts.set(run.death, (deathCounts.get(run.death) ?? 0) + 1);
  const deaths = [...deathCounts.entries()]
    .map(([cause, count]) => ({ cause, count, share: count / Math.max(1, n) }))
    .sort((a, b) => b.count - a.count);

  const bossMap = new Map<string, { passed: number; attempts: number; ratios: number[] }>();
  for (const run of runs) {
    for (const round of run.rounds) {
      if (round.kind !== 'boss') continue;
      const key = round.bossId ?? 'unknown';
      const entry = bossMap.get(key) ?? { passed: 0, attempts: 0, ratios: [] };
      entry.attempts += 1;
      if (round.passed) entry.passed += 1;
      entry.ratios.push(round.target > 0 ? round.achieved / round.target : 0);
      bossMap.set(key, entry);
    }
  }
  const bosses = [...bossMap.entries()].map(([bossId, entry]) => ({
    bossId,
    attempts: entry.attempts,
    pass: wilson(entry.passed, entry.attempts),
    ratio: dist(entry.ratios),
  }));

  const shops = runs.flatMap((r) => r.shops);
  const categoryBuys: Record<string, number> = {};
  for (const shop of shops) {
    for (const itemId of shop.bought) {
      const category = CATEGORY_OF[itemId] ?? 'OTHER';
      categoryBuys[category] = (categoryBuys[category] ?? 0) + 1;
    }
  }

  // Item power with a matched control: for every run that bought item X first
  // at shop k, compare against runs that reached shop k and never owned X.
  const itemIds = new Set<string>();
  for (const run of runs) {
    for (const shop of run.shops) for (const id of shop.offered) itemIds.add(id);
    for (const id of Object.keys(run.acquired)) itemIds.add(id);
  }
  const reachedShop = (run: TelemetryRun, k: number) => run.shops.length > k;
  const items: ItemPower[] = [];
  for (const itemId of itemIds) {
    const offeredRuns = runs.filter((r) => r.shops.some((s) => s.offered.includes(itemId))).length;
    const boughtRuns = runs.filter((r) => r.boughtAtShop[itemId] !== undefined).length;
    const owned = runs.filter((r) => r.acquired[itemId] !== undefined);
    let controlNum = 0;
    let controlDen = 0;
    const byShop = new Map<number, number>();
    for (const run of owned) {
      const k = run.boughtAtShop[itemId] ?? Math.max(0, run.shops.filter((s) => s.stage < (run.acquired[itemId] ?? 1)).length - 1);
      byShop.set(k, (byShop.get(k) ?? 0) + 1);
    }
    for (const [k, count] of byShop) {
      const control = runs.filter((r) => reachedShop(r, k) && r.acquired[itemId] === undefined);
      if (control.length === 0) continue;
      controlNum += count * (control.filter((r) => r.won).length / control.length);
      controlDen += count;
    }
    const ownedWin = wilson(owned.filter((r) => r.won).length, owned.length);
    const controlWin = controlDen === 0 ? 0 : controlNum / controlDen;
    items.push({
      itemId,
      offeredRuns,
      boughtRuns,
      pickRate: offeredRuns === 0 ? 0 : boughtRuns / offeredRuns,
      ownedRuns: owned.length,
      ownedWin,
      controlWin,
      lift: ownedWin.p - controlWin,
      ownedClearF1: wilson(owned.filter((r) => r.clearedFloor1).length, owned.length),
    });
  }
  items.sort((a, b) => b.lift - a.lift);

  const bankrolls = sortedOf(runs.map((r) => r.maxBankroll));
  return {
    bot,
    runs: n,
    floor1: wilson(runs.filter((r) => r.clearedFloor1).length, n),
    win: wilson(runs.filter((r) => r.won).length, n),
    timeouts: runs.filter((r) => r.outcome === 'timeout').length,
    maxBankroll: bankrolls.length === 0 ? 0 : bankrolls[bankrolls.length - 1]!,
    bankrollP99: quantile(bankrolls, 0.99),
    runSpins: dist(runs.map((r) => r.spins.length)),
    runTicks: dist(runs.map((r) => r.ticks)),
    runMinutes: dist(runs.map((r) => r.ticks / 3600)),
    allSpins: summariseSpins(allSpins),
    stages,
    deaths,
    bosses,
    shop: {
      visits: shops.length,
      purchasesPerVisit: mean(shops.map((s) => s.bought.length)),
      anyPurchase: wilson(shops.filter((s) => s.bought.length > 0).length, shops.length),
      rerollsPerVisit: mean(shops.map((s) => Math.max(0, s.rerolls))),
      spendShareOfBankroll: mean(shops.map((s) => (s.bankroll > 0 ? s.spent / s.bankroll : 0))),
      categoryBuys,
    },
    items,
  };
}

// ------------------------------------------------------------------ format

export function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export function ci(p: Proportion): string {
  return `${pct(p.p)} [${pct(p.lo)}–${pct(p.hi)}]`;
}

export function money(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

function num(v: number, digits = 2): string {
  return v.toFixed(digits);
}

export function formatBotFeel(feel: BotFeel): string[] {
  const lines: string[] = [];
  const s = feel.allSpins;
  lines.push(`## ${feel.bot} (${feel.runs} runs)`, '');
  lines.push(
    `- Floor 1 clear: **${ci(feel.floor1)}**; win: **${ci(feel.win)}**; timeouts ${feel.timeouts}`,
    `- Max bankroll ${money(feel.maxBankroll)} (p99 ${money(feel.bankrollP99)})`,
    `- Run length: spins p50 ${num(feel.runSpins.p50, 0)} (p90 ${num(feel.runSpins.p90, 0)}); sim minutes p50 ${num(feel.runMinutes.p50, 1)} (p90 ${num(feel.runMinutes.p90, 1)})`,
    `- All spins: zero-cash ${ci(s.zeroCash)}; slot win ${ci(s.slotWin)}; ≥2 orbs ${ci(s.multiOrb)}; ≥3 orbs ${ci(s.busy)}; fever ${ci(s.fever)}`,
    `- Per spin: orbs ${num(s.orbs)}, splits ${num(s.splits)}, peg hits ${num(s.pegHits, 1)}, tokens ${num(s.tokens)}, lip drops ${num(s.lips)}, gutters ${num(s.gutters)}; ticks p50 ${num(s.ticks.p50, 0)} (p10 ${num(s.ticks.p10, 0)}, p90 ${num(s.ticks.p90, 0)})`,
    '',
  );

  lines.push(
    '| Stage | Reached | Pass [95% CI] | Target p50 | Income p10/p50/p90 | Pressure p50 (target/income) | Achieved/target p50 | Spin cash p50 / mean | Zero-cash spins | Slot win | Orbs/spin | Lips/spin | Ticks/spin p50 |',
    '| --- | ---: | --- | ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const st of feel.stages) {
    lines.push(
      `| ${st.label} | ${st.reached} | ${ci(st.pass)} | ${money(st.target.p50)} | ${money(st.income.p10)} / ${money(st.income.p50)} / ${money(st.income.p90)} | ${num(st.pressure.p50)} | ${num(st.ratio.p50)} | ${money(st.spins.cash.p50)} / ${money(st.spins.cash.mean)} | ${pct(st.spins.zeroCash.p)} | ${pct(st.spins.slotWin.p)} | ${num(st.spins.orbs + st.spins.splits, 1)} | ${num(st.spins.lips, 1)} | ${num(st.spins.ticks.p50, 0)} |`,
    );
  }
  lines.push('');

  lines.push('Death causes: ' + feel.deaths.map((d) => `${d.cause} ${pct(d.share)}`).join(', '), '');

  lines.push('| Boss | Attempts | Pass [95% CI] | Player/boss p10/p50/p90 |', '| --- | ---: | --- | --- |');
  for (const boss of feel.bosses) {
    lines.push(
      `| ${boss.bossId} | ${boss.attempts} | ${ci(boss.pass)} | ${num(boss.ratio.p10)} / ${num(boss.ratio.p50)} / ${num(boss.ratio.p90)} |`,
    );
  }
  lines.push('');

  const shop = feel.shop;
  lines.push(
    `Shop: ${shop.visits} visits, ${num(shop.purchasesPerVisit)} purchases/visit, any purchase ${ci(shop.anyPurchase)}, rerolls/visit ${num(shop.rerollsPerVisit)}, spend share ${pct(shop.spendShareOfBankroll)}; buys by category ${Object.entries(shop.categoryBuys).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    '',
  );

  lines.push(
    '| Item | Offered runs | Bought runs | Pick rate | Owned runs | Win when owned [95% CI] | Matched control win | Lift |',
    '| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |',
  );
  for (const item of feel.items) {
    lines.push(
      `| ${item.itemId} | ${item.offeredRuns} | ${item.boughtRuns} | ${pct(item.pickRate)} | ${item.ownedRuns} | ${ci(item.ownedWin)} | ${pct(item.controlWin)} | ${item.lift >= 0 ? '+' : ''}${(item.lift * 100).toFixed(1)}pp |`,
    );
  }
  lines.push('');
  return lines;
}

export function formatFeel(feels: readonly BotFeel[], title: string): string {
  const lines = [`# ${title}`, ''];
  for (const feel of feels) lines.push(...formatBotFeel(feel));
  return lines.join('\n');
}

/** One-line headline per bot for quick iteration. */
export function headline(feel: BotFeel): string {
  const st = (label: string) => feel.stages.find((x) => x.label === label);
  const r1 = st('F1R1');
  const b1 = st('F1 boss');
  const b2 = st('F2 boss');
  const b3 = st('F3 boss');
  return [
    `${feel.bot.padEnd(15)} n=${feel.runs}`,
    `F1 ${ci(feel.floor1)}`,
    `win ${ci(feel.win)}`,
    `R1 pass ${r1 ? pct(r1.pass.p) : '-'}`,
    `bosses ${[b1, b2, b3].map((b) => (b ? pct(b.pass.p) : '-')).join('/')}`,
    `zero-cash ${pct(feel.allSpins.zeroCash.p)}`,
    `orbs/spin ${(feel.allSpins.orbs + feel.allSpins.splits).toFixed(2)}`,
    `max ${money(feel.maxBankroll)}`,
    `spins p50 ${feel.runSpins.p50.toFixed(0)}`,
  ].join(' | ');
}

export function pressureLine(feel: BotFeel): string {
  return (
    `${feel.bot.padEnd(15)} pass: ` +
    feel.stages.map((st) => `${st.label} ${pct(st.pass.p)}`).join(', ') +
    '\n' +
    `${''.padEnd(15)} income p50: ` +
    feel.stages.map((st) => `${st.label} ${money(st.income.p50)}/${money(st.target.p50)}`).join(', ')
  );
}
