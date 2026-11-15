import { launchBrowser } from './browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const base = process.env.REVIEW_URL ?? 'http://127.0.0.1:4176/';
await mkdir('artifacts/review', { recursive: true }); await mkdir('.cache/captures', { recursive: true });
const browser = await launchBrowser(), log = [], failures = [];
const chromium = await browser.version();
const pause = ms => new Promise(r => setTimeout(r, ms));
async function start(seed, width, height) {
  const page = await browser.newPage(); await page.setViewport({ width, height });
  page.on('pageerror', error => failures.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(base) && !/^(data:|blob:)/.test(request.url())) failures.push(`external request: ${request.url()}`); });
  await page.goto(`${base}?seed=${seed}`, { waitUntil: 'networkidle0' });
  await page.click('#title-seeded-run button[type="submit"]'); await page.waitForSelector('[data-testid="spin-btn"]');
  if (await page.evaluate(() => typeof window.__JS_TEST__ !== 'undefined')) throw new Error('Production test API unexpectedly present');
  log.push({ seed, viewport: `${width}x${height}`, testApi: false }); return page;
}
async function shot(page, name) {
  await page.screenshot({ path: `artifacts/review/${name}.png` });
  log.push({ capture: name, dom: await page.evaluate(() => ({ near: document.querySelector('[data-anim="cabinet-root"]')?.dataset.nearMiss, tier: document.querySelector('[data-anim="cabinet-root"]')?.dataset.winTier, landed: [...document.querySelectorAll('[data-anim="grid"]>[data-landed="true"]')].length, detached: [...document.querySelectorAll('[data-anim="grid"]>[data-detached="true"]')].length, tumble: document.querySelectorAll('[data-anim="tumble-symbol"]').length })) });
  console.log('Captured', name);
}
async function ready(page) { await page.waitForFunction(() => !document.querySelector('[data-testid="spin-btn"]')?.disabled, { timeout: 90000 }); }
for (const [width, height] of [[1440, 900], [390, 844]]) {
  const size = `${width}x${height}`;
  let page = await start('REEL-V2-16', width, height);
  await page.click('[data-testid="spin-btn"]');
  await page.waitForFunction(() => Number(document.querySelector('[data-anim="velocity-blur"]')?.getAttribute('stdDeviation')?.split(' ')[1]) > 3); await shot(page, `${size}-mid-blur`);
  await page.waitForFunction(() => document.querySelector('[data-anim="grid"]>[data-landed="true"]')); await shot(page, `${size}-landing`);
  // First evaluation is at tick 60. Capture the early win before its last detach.
  await page.waitForFunction(() => document.querySelector('[data-anim="drop-symbol"]') !== null); await pause(120); await shot(page, `${size}-small-win`); await page.close();
  page = await start('REEL-V2-7', width, height); await page.click('[data-testid="spin-btn"]');
  await page.waitForFunction(() => document.querySelector('[data-anim="drop-symbol"]') !== null); await pause(70); await shot(page, `${size}-mega-win`); await page.close();
  page = await start('REEL-V2-1', width, height); await page.click('[data-testid="spin-btn"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-anim="grid"]>[data-landed="true"]').length >= 6 && Number(document.querySelector('[data-anim="near-miss"]')?.style.opacity) > .1); await shot(page, `${size}-near-miss`); await page.close();
}
const page = await start('REEL-V2-7', 1440, 900);
const cdp = await page.createCDPSession(), frames = [], writes = [];
cdp.on('Page.screencastFrame', frame => {
  const file = `spin-${String(frames.length).padStart(5, '0')}.jpg`;
  frames.push({ file, time: frame.metadata.timestamp });
  writes.push(writeFile(`.cache/captures/${file}`, Buffer.from(frame.data, 'base64')));
  void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
console.log('Recording real spins');
for (const speed of [1, 1, 1, 4]) {
  await ready(page); await page.click(`[data-testid="table-speed-${speed}"]`); await page.click('[data-testid="spin-btn"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="spin-btn"]')?.disabled); await ready(page);
  log.push({ realSpin: speed }); console.log('Completed real spin', speed); await pause(350);
}
await cdp.send('Page.stopScreencast'); await Promise.all(writes);
await writeFile('.cache/captures/spins.ffconcat', 'ffconcat version 1.0\n' + frames.map((frame, i) => `file '${frame.file}'\nduration ${Math.max(1 / 120, (frames[i + 1]?.time ?? frame.time + 1 / 30) - frame.time)}\n`).join(''));
const encode = spawnSync('ffmpeg', ['-y', '-v', 'error', '-threads', '2', '-safe', '0', '-f', 'concat', '-i', '.cache/captures/spins.ffconcat', '-filter_threads', '2', '-r', '30', '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'artifacts/review/production-spins-1x-4x.mp4'], { stdio: 'inherit' });
if (encode.status) throw new Error('Evidence encoding failed');
await page.close(); await browser.close();
await writeFile('artifacts/gameplay-evidence.json', JSON.stringify({ path: 'pnpm build / pnpm preview', chromium, interactions: 'seed form, Spin and speed buttons only; no test API', log, failures }, null, 2));
if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify(log, null, 2));
