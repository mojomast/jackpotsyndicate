import * as anim from '../src';
import { mount, fixtures } from '../demo/catalog';
import type { FactoryName, FactoryParams, GridCols, GridRows, SymbolId } from '../src';
import { hasNearMiss } from '../src/reels/reelSpin';
import { reelArt } from '../compositions/reel-art';

function setup<N extends FactoryName>(name: N, params: FactoryParams[N], width = 620) {
  const root = document.createElement('div'); document.body.replaceChildren(root);
  root.style.cssText = `position:relative;width:${width}px;height:${name in anim.SCENE_TICKS ? width * 9 / 16 : 850}px`;
  const tl = mount(root, name, structuredClone(params));
  return { root, tl };
}
function snapshot(root: HTMLElement): string { return root.innerHTML; }
function seekCheck(name: FactoryName, params: FactoryParams[FactoryName]) {
  const direct: string[] = [], times: number[] = [];
  for (let i = 0; i < 10; i++) {
    const { root, tl } = setup(name, params);
    if (!tl.paused()) return { pass: false, reason: 'factory returned an unpaused timeline' };
    const t = tl.duration() * i / 9; times.push(t);
    tl.time(t, true); direct.push(snapshot(root)); tl.kill();
  }
  for (const order of [times.map((_, i) => i), times.map((_, i) => 9 - i), [9, 0, 7, 2, 5, 1, 8, 3, 6, 4]]) {
    const { root, tl } = setup(name, params);
    for (const i of order) {
      tl.time(times[i]!, true); const actual = snapshot(root);
      if (actual !== direct[i]) {
        let k = 0; while (actual[k] === direct[i]![k] && k < actual.length) k++;
        tl.kill(); return { pass: false, name, time: times[i], order, at: k, actual: actual.slice(k - 80, k + 180), expected: direct[i]!.slice(k - 80, k + 180) };
      }
      tl.time(times[i]!, true); if (snapshot(root) !== actual) return { pass: false, reason: 'repeated seek' };
    }
    tl.kill();
  }
  return { pass: true };
}
function grid(cols: GridCols, rows: GridRows): SymbolId[][] { return Array.from({ length: cols }, (_, c) => Array.from({ length: rows }, (_, r) => anim.SYMBOL_IDS[(c + r) % 5]!)); }
function reelTiming(cols: GridCols, rows: GridRows, reducedMotion: boolean) {
  const params = { cols, rows, finalGrid: grid(cols, rows), seed: 41, reducedMotion, frozenCells: [[0, 0] as [number, number]] };
  const { root, tl } = setup('reelSpin', params); const checks: unknown[] = [];
  const face = (c: number, r: number) => root.querySelector<HTMLElement>(`[data-anim="cell"][data-col="${c}"][data-row="${r}"] [data-anim="symbol"]`)!;
  const frozen = face(0, 0).outerHTML;
  for (let c = 0; c < cols; c++) {
    const at = anim.REEL_STOP_TICK(c) / 60;
    tl.time(at - 1 / 6000, true);
    checks.push({ phase: 'before', c, pass: Number(face(c, 1).style.opacity) < 1 });
    tl.time(at, true);
    checks.push({ phase: 'stop', c, pass: Array.from({ length: rows }, (_, r) => face(c, r)).every((f, r) => f.style.opacity === '1' && f.querySelector('[data-key]')?.getAttribute('data-key') === `symbol.${params.finalGrid[c]![r]}`) });
    tl.time(at + anim.REEL_SETTLE_TICKS / 60, true);
    const transform = getComputedStyle(face(c, 1)).transform;
    checks.push({ phase: 'settle', c, pass: transform === 'none' || Math.abs(new DOMMatrixReadOnly(transform).m42) < .01 });
    checks.push({ phase: 'frozen', c, pass: face(0, 0).outerHTML === frozen });
  }
  const duration = tl.duration(); tl.kill();
  return { duration, expectedDuration: (anim.REEL_STOP_TICK(cols - 1) + anim.EVAL_DELAY_TICKS) / 60, checks };
}
function lineTiming(cols: GridCols, rows: GridRows, reducedMotion: boolean) {
  const cells = Array.from({ length: cols }, (_, c) => [c, Math.min(1, rows - 1)] as [number, number]);
  const params = { cols, rows, wins: [{ cells, kind: 'line' as const }, { cells: [cells[0]!], kind: 'ways' as const }], reducedMotion };
  const { root, tl } = setup('lineWin', params); const checks = [];
  for (const [i, [col, row]] of cells.entries()) {
    const at = (anim.ORB_LAUNCH_DELAY_TICKS + i * anim.ORB_LAUNCH_INTERVAL_TICKS) / 60;
    const cell = root.querySelector<HTMLElement>(`[data-anim="grid"] > [data-anim="cell"][data-col="${col}"][data-row="${row}"]`)!;
    tl.time(at - 1 / 6000, true); const before = cell.dataset.detached === 'false' && cell.querySelector<HTMLElement>('[data-anim="symbol"]')!.style.opacity === '1';
    tl.time(at, true); const after = cell.dataset.detached === 'true' && cell.querySelector<HTMLElement>('[data-anim="symbol"]')!.style.opacity === '0';
    checks.push({ i, before, after, label: tl.labels[`launch:${col}:${row}`], expected: at });
  }
  const drops = root.querySelectorAll('[data-anim="drop-symbol"]').length; tl.kill(); return { checks, drops };
}
function reducedCheck(name: FactoryName, params: FactoryParams[FactoryName]) {
  let { tl } = setup(name, { ...params, reducedMotion: false }); const fullDuration = tl.duration(); tl.kill();
  const reduced = setup(name, { ...params, reducedMotion: true });
  const violations: string[] = [];
  for (let i = 0; i <= 10; i++) {
    reduced.tl.time(reduced.tl.duration() * i / 10, true);
    for (const node of reduced.root.querySelectorAll<HTMLElement>('[data-anim]')) if (node.style.transform || node.style.translate || node.style.rotate || node.style.scale) violations.push(node.dataset.anim!);
  }
  const duration = reduced.tl.duration(); reduced.tl.kill(); return { duration, fullDuration, violations };
}
function layout(cols: GridCols, rows: GridRows, width: number) {
  const { root, tl } = setup('reelSpin', { cols, rows, finalGrid: grid(cols, rows), seed: 1, reducedMotion: false }, width);
  tl.time(tl.duration()); const bounds = root.getBoundingClientRect();
  const cells = [...root.querySelectorAll('[data-anim="grid"] > [data-anim="cell"]')].map(c => c.getBoundingClientRect());
  const result = { count: cells.length, fits: cells.every(c => c.left >= bounds.left && c.right <= bounds.right && Math.abs(c.width - c.height) < 1), overflow: root.scrollWidth > width };
  tl.kill(); return result;
}
function playerCheck() {
  const { root, tl } = setup('bossIntro', fixtures.bossIntro); let completions = 0;
  const player = new anim.TimelinePlayer(() => completions++); player.play(tl, 120);
  player.syncToTick(150); const time = tl.time(); player.syncToTick(90); const clamped = tl.time();
  player.syncToTick(1000); player.syncToTick(1001); player.syncToTick(130); player.syncToTick(1000);
  const once = completions; player.stop(); const stopped = root.innerHTML; player.syncToTick(120);
  player.play(tl, 0); player.syncToTick(180); const twice = completions;
  tl.kill(); return { time, clamped, once, twice, paused: tl.paused(), stopped: stopped === root.innerHTML };
}
function present(name: FactoryName, params: FactoryParams[FactoryName], time: number, width: number) { const { tl } = setup(name, params, width); tl.time(time, true); return tl.duration(); }
function effectChecks(reducedMotion: boolean) {
  const params: anim.LineWinParams = { cols: 5, rows: 4, reducedMotion, seed: 1234, winTier: 'jackpot', launchOrder: [[4, 3], null, [0, 0], [1, 1]], wins: [{ cells: [[0, 0], [1, 1], [4, 3]], kind: 'ways', overvolt: true }] };
  const { root, tl } = setup('lineWin', params), failures: string[] = [];
  for (const [slot, cell] of params.launchOrder!.entries()) if (cell) {
    const node = root.querySelector<HTMLElement>(`[data-anim="grid"]>[data-col="${cell[0]}"][data-row="${cell[1]}"]`)!;
    const at = (6 + 6 * slot) / 60; tl.time(at - 1 / 60, true);
    if (node.dataset.detached !== 'false') failures.push(`early:${slot}`);
    tl.time(at, true); if (node.dataset.detached !== 'true') failures.push(`late:${slot}`);
  }
  for (let frame = 0; frame <= Math.round(tl.duration() * 60); frame++) {
    const time = frame / 60; tl.time(time, true); const expected = root.outerHTML;
    tl.time(0, true); tl.time(time, true); if (root.outerHTML !== expected) failures.push(`seek:${frame}`);
  }
  const trajectories = [...root.querySelectorAll<HTMLElement>('[data-trajectory]')].map(n => n.dataset.trajectory);
  const visibleEffects = [...root.querySelectorAll<HTMLElement>('[data-anim]')].filter(n => ['particle', 'reel-drum', 'velocity-echo'].includes(n.dataset.anim!) || /blur\(/.test(getComputedStyle(n).filter));
  tl.kill();
  const again = setup('lineWin', params); const same = JSON.stringify(trajectories) === JSON.stringify([...again.root.querySelectorAll<HTMLElement>('[data-trajectory]')].map(n => n.dataset.trajectory)); again.tl.kill();
  const other = setup('lineWin', { ...params, seed: 1235 }); const different = JSON.stringify(trajectories) !== JSON.stringify([...other.root.querySelectorAll<HTMLElement>('[data-trajectory]')].map(n => n.dataset.trajectory)); other.tl.kill();
  return { failures, same, different, count: trajectories.length, reducedViolations: reducedMotion ? visibleEffects.map(n => n.dataset.anim) : [] };
}
function nearCheck() {
  const base: anim.ReelSpinParams = { cols: 3, rows: 3, reducedMotion: false, seed: 1, finalGrid: [['seven', 'diamond', 'cherry'], ['seven', 'uranium', 'skull'], ['diamond', 'cherry', 'skull']] };
  const hyper: anim.ReelSpinParams = { ...base, cols: 5, rows: 4, wiring: 'HYPER', finalGrid: [['seven', 'cherry', 'cherry', 'cherry'], ['diamond', 'diamond', 'seven', 'diamond'], ['skull', 'skull', 'skull', 'seven'], ['uranium', 'uranium', 'seven', 'uranium'], ['cherry', 'diamond', 'skull', 'uranium']] };
  return {
    yes: hasNearMiss(base),
    no: hasNearMiss({ ...base, finalGrid: [['cherry', 'cherry', 'cherry'], ['diamond', 'diamond', 'diamond'], ['skull', 'skull', 'skull']] }),
    cluster: hasNearMiss({ ...base, wiring: 'CLUSTER' }),
    diagonal: hasNearMiss({ ...base, finalGrid: grid(3, 3) }),
    frozenLine: hasNearMiss({ ...base, frozenCells: [[0, 0]] }),
    ways: hasNearMiss({ ...base, wiring: 'WAYS' }),
    frozenWays: hasNearMiss({ ...base, wiring: 'WAYS', frozenCells: [[0, 0]] }),
    hyper: hasNearMiss(hyper),
    hyperClassic: hasNearMiss({ ...hyper, wiring: 'CLASSIC' }),
    frozenHyper: hasNearMiss({ ...hyper, frozenCells: [[1, 2]] }),
  };
}
/** Measurement host only. Runtime factories remain clock-free. */
async function measure(blurMode: 'echo' | 'svg', speed = 1) {
  const root = document.createElement('div'); document.body.replaceChildren(root); root.style.cssText = 'width:620px;height:850px;position:relative';
  anim.createCabinet(root, { cols: 5, rows: 4 }, anim.DESIGN_TOKENS, reelArt);
  await Promise.all(anim.SYMBOL_IDS.map(async id => { const image = new Image(); image.src = reelArt(`symbol.${id}`)!.url; await image.decode(); }));
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const longTasks: number[] = [], observer = new PerformanceObserver(list => list.getEntries().forEach(e => longTasks.push(e.duration)));
  observer.observe({ type: 'longtask', buffered: false });
  const times: number[] = [], layout: number[] = [], builds: number[] = [];
  for (let pass = 0; pass < 3; pass++) for (const name of ['reelSpin', 'lineWin'] as const) {
    const before = performance.now();
    const params = name === 'reelSpin' ? { cols: 5, rows: 4, reducedMotion: false, finalGrid: grid(5, 4), seed: 91, blurMode } : { cols: 5, rows: 4, reducedMotion: false, seed: 91, winTier: 'jackpot' as const, wins: [{ kind: 'ways' as const, overvolt: true, cells: Array.from({ length: 20 }, (_, i) => [i % 5, Math.floor(i / 5)] as [number, number]) }] };
    const tl = name === 'reelSpin' ? anim.reelSpin(root, params as anim.ReelSpinParams, anim.DESIGN_TOKENS, reelArt) : anim.lineWin(root, params as anim.LineWinParams, anim.DESIGN_TOKENS, reelArt);
    builds.push(performance.now() - before);
    for (let f = 0; f < tl.duration() * 60 / speed; f++) await new Promise<void>(resolve => requestAnimationFrame(() => {
      const start = performance.now(); tl.time(f * speed / 60, true); const js = performance.now() - start;
      // Force style/layout once at the end, never interleaved with timeline writes.
      root.getBoundingClientRect(); times.push(js); layout.push(performance.now() - start); resolve();
    }));
    tl.time(tl.duration(), true); tl.kill();
  }
  observer.disconnect();
  const summary = (list: number[]) => ({ mean: list.reduce((n, x) => n + x, 0) / list.length, max: Math.max(...list), p95: [...list].sort((a, b) => a - b)[Math.floor(list.length * .95)] });
  return { blurMode, speed, frames: times.length, js: summary(times), jsAndStyle: summary(layout), construction: summary(builds), longTasks };
}
function flashEnvelopes(speed: number) {
  const failures: string[] = [];
  for (const name of ['reelSpin', 'lineWin', 'tumbleStep', 'gridRelayout'] as const) {
    const { root, tl } = setup(name, { ...fixtures[name], seed: 42, winTier: 'jackpot' } as FactoryParams[typeof name]);
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-anim="cell-glow"],[data-anim="reel-divider"],[data-anim="near-miss"],[data-anim="win-path"],[data-anim="win-tier"],[data-anim="win-vfx"]')];
    const samples = nodes.map(() => [] as number[]);
    for (let time = 0; time <= tl.duration() + 1 / 60; time += speed / 60) {
      tl.time(Math.min(time, tl.duration()), true); nodes.forEach((n, i) => samples[i]!.push(Number(getComputedStyle(n).opacity)));
    }
    samples.forEach((values, i) => {
      let falls = 0, direction = 0;
      for (let j = 1; j < values.length; j++) {
        const delta = values[j]! - values[j - 1]!; if (Math.abs(delta) < .002) continue;
        if (delta < 0 && direction > 0) falls++; direction = Math.sign(delta);
      }
      if (falls > 1) failures.push(`${name}:${nodes[i]!.dataset.anim}:${falls}`);
    }); tl.kill();
  }
  return failures;
}
const qa = { seekCheck, reelTiming, lineTiming, reducedCheck, layout, playerCheck, present, fixtures, effectChecks, nearCheck, measure, flashEnvelopes };
declare global { interface Window { qa: typeof qa } }
window.qa = qa;
