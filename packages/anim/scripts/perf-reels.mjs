import { createServer } from 'vite';
import { writeFile, mkdir } from 'node:fs/promises';
import { launchBrowser } from './browser.mjs';
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0 } }); await server.listen();
const browser = await launchBrowser(), page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${server.resolvedUrls.local[0]}tests/harness.html`); await page.waitForFunction('!!window.qa');
const cdp = await page.createCDPSession(); await cdp.send('Performance.enable');
const results = [];
for (const [blur, speed] of [['echo', 1], ['svg', 1], ['svg', 4]]) {
  const before = await cdp.send('Performance.getMetrics');
  const result = await page.evaluate(args => window.qa.measure(...args), [blur, speed]);
  const after = await cdp.send('Performance.getMetrics');
  const metric = (name) => (after.metrics.find(m => m.name === name).value - before.metrics.find(m => m.name === name).value) * 1000 / result.frames;
  results.push({ ...result, cdpPerFrameMs: { script: metric('ScriptDuration'), layout: metric('LayoutDuration'), style: metric('RecalcStyleDuration'), task: metric('TaskDuration') } });
}
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/perf-reels.json', JSON.stringify({ chromium: await browser.version(), viewport: '1440x900', grid: '5x4', cabinetWidth: 620, results }, null, 2));
console.log(JSON.stringify(results, null, 2)); await browser.close(); await server.close();
