import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './browser.mjs';
const base = process.env.DEMO_URL || 'http://127.0.0.1:5180';
await mkdir('artifacts/qa', { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage(), errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`${base}/compositions/trailer/`);
await page.waitForFunction('!!window.__timelines?.trailer'); await page.evaluate(() => document.fonts.ready);
const times = [1.8, 3.3, 4.6, 5.58, 5.8, 7.2, 8.5, 9.45, 12, 15, 17, 21.5, 23.98];
const snapshots = new Map();
for (const time of times) {
  const snapshot = await page.evaluate(t => { window.__timelines.trailer.time(t, true); return document.querySelector('#composition').innerHTML; }, time);
  snapshots.set(time, snapshot);
  await page.screenshot({ path: `artifacts/qa/trailer-${time}.png` });
}
const reverse = [];
for (const time of [...times].reverse()) reverse.push(await page.evaluate(t => { window.__timelines.trailer.time(t, true); return document.querySelector('#composition').innerHTML; }, time) === snapshots.get(time));
await page.goto(`${base}/`); await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'artifacts/qa/demo-desktop.png' });
await page.select('#factory', 'bossIntro'); await page.$eval('#tick', el => { el.value = '100'; el.dispatchEvent(new Event('input')); });
await page.screenshot({ path: 'artifacts/qa/demo-boss.png' });
const scrubTime = await page.$eval('#readout', el => el.textContent);
await page.select('#speed', '4'); await page.click('#toggle');
await page.waitForFunction(() => document.querySelector('#readout')?.textContent?.startsWith('180.0') && document.querySelector('#toggle')?.textContent === 'Play');
const complete = await page.$eval('#toggle', el => el.textContent);
await page.setViewport({ width: 390, height: 844 }); await page.select('#factory', 'reelSpin');
await page.$eval('#tick', el => { el.value = '60'; el.dispatchEvent(new Event('input')); });
await page.screenshot({ path: 'artifacts/qa/demo-mobile.png', fullPage: true });
const mobileOverflow = await page.evaluate(() => {
  const cabinet = document.querySelector('[data-anim="cabinet"]').getBoundingClientRect();
  const wrapper = document.querySelector('.stage-wrap').getBoundingClientRect();
  return document.documentElement.scrollWidth > innerWidth || cabinet.right > wrapper.right || cabinet.left < wrapper.left;
});
await page.goto(`${base}/tests/harness.html`); await page.waitForFunction('!!window.qa');
for (const name of ['tumbleStep', 'gameOver']) {
  await page.setViewport({ width: 1920, height: 1080 });
  await page.evaluate(name => window.qa.present(name, window.qa.fixtures[name], name === 'tumbleStep' ? .3 : 1.7, name === 'tumbleStep' ? 620 : 1920), name);
  await page.screenshot({ path: `artifacts/qa/${name}.png` });
}
const result = { errors, trailerReverseSeek: reverse.every(Boolean), scrubTime, speed4Completed: complete === 'Play', mobileOverflow, frameTimes: times };
await writeFile('artifacts/qa/report.json', JSON.stringify(result, null, 2));
await browser.close(); console.log(result);
if (errors.length || !result.trailerReverseSeek || !result.speed4Completed || mobileOverflow) process.exit(1);
