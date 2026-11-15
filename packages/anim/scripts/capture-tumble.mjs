import { launchBrowser } from './browser.mjs';
import { writeFile } from 'node:fs/promises';
const browser = await launchBrowser(), page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://127.0.0.1:4176/?seed=REEL-V2-3', { waitUntil: 'networkidle0' });
await page.click('#title-seeded-run button[type="submit"]'); await page.waitForSelector('[data-testid="spin-btn"]');
await page.click('[data-testid="table-speed-4"]');
for (let spin = 0; spin < 7; spin++) {
  await page.waitForFunction(() => document.querySelector('[data-testid="spin-btn"]')?.disabled === false, { timeout: 90000 });
  await page.click('[data-testid="spin-btn"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="spin-btn"]')?.disabled === true);
  await page.waitForFunction(() => document.querySelector('[data-testid="spin-btn"]')?.disabled === false || document.querySelector('[data-testid="round-continue"]'), { timeout: 90000 });
  console.log('Round spin', spin + 1);
}
await page.click('[data-testid="round-continue"]'); await page.waitForSelector('[data-testid="shop-reroll"]');
let offer;
for (let reroll = 0; reroll < 12; reroll++) {
  offer = await page.evaluate(() => [...document.querySelectorAll('button[data-offer-id]')].find(n => n.textContent.includes('CLUSTER Harness'))?.getAttribute('data-testid'));
  if (offer) break;
  await page.click('[data-testid="shop-reroll"]');
  console.log('Shop reroll', reroll + 1);
}
if (!offer) throw new Error('No affordable CLUSTER harness found through normal shop rolls');
await page.click(`[data-testid="${offer}"]`);
await page.waitForFunction(() => document.querySelector('.machine-value')?.textContent.includes('CLUSTER'));
await page.click('[data-testid="shop-leave"]');
await page.waitForSelector('[data-testid="spin-btn"]');
const results = [];
for (const [width, height] of [[1440, 900], [390, 844]]) {
  await page.setViewport({ width, height });
  let captured = false;
  for (let spin = 0; spin < 7 && !captured; spin++) {
    await page.waitForFunction(() => document.querySelector('[data-testid="spin-btn"]')?.disabled === false, { timeout: 90000 });
    await page.click('[data-testid="table-speed-1"]'); await page.click('[data-testid="spin-btn"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="spin-btn"]')?.disabled === true);
    await page.evaluate(() => window.scrollTo(0, 0));
    try {
      await page.waitForFunction(() => document.querySelector('[data-anim="tumble-symbol"]') || document.querySelector('[data-testid="spin-btn"]')?.disabled === false, { timeout: 60000 });
      if (!await page.$('[data-anim="tumble-symbol"]')) throw new Error('No tumble');
      await new Promise(r => setTimeout(r, 120));
      await page.evaluate(() => window.scrollTo(0, 0));
      const path = `artifacts/review/${width}x${height}-tumble.png`; await page.screenshot({ path });
      results.push({ path, seed: 'REEL-V2-3', acquired: 'seven real spins; first shop; reroll three times; buy CLUSTER Harness; leave; real spins', testApi: await page.evaluate(() => typeof window.__JS_TEST__ !== 'undefined') });
      captured = true; console.log('Captured', path);
    } catch {
      console.log('No tumble on this real spin');
      await page.click('[data-testid="table-speed-4"]');
    }
  }
  if (!captured) throw new Error('No tumble reached through UI');
}
await writeFile('artifacts/tumble-evidence.json', JSON.stringify(results, null, 2)); await browser.close();
