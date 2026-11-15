import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, sep, extname } from 'node:path';
import { launchBrowser } from './browser.mjs';

// Run after render-v2.mjs: check the exact built compositions and encoded media.
const directory = resolve('.render');
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(directory, `.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`);
  if (!file.startsWith(directory + sep)) { response.writeHead(403).end(); return; }
  try {
    const bytes = await readFile(file);
    response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[extname(file)] ?? 'application/octet-stream');
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
// Match the software-compositing path used by the exported HyperFrames films.
const browser = await launchBrowser(['--disable-gpu-compositing', '--disable-partial-raster']), page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
const errors = [], reports = [], base = `http://127.0.0.1:${server.address().port}/`;
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (!request.url().startsWith(base) && !/^(data:|blob:)/.test(request.url())) errors.push(`external request: ${request.url()}`);
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir('artifacts/review', { recursive: true });
try {
  for (const [name, duration, cuts, stills] of [
    ['trailer', 24, [3, 5.5, 6.5, 9, 10, 14, 18], [1.8, 3.3, 5.8, 7.2, 9.45, 12, 15, 21.5, 23.98]],
    ['reelShowcase', 18, [3, 6, 9, 12, 14.5, 16], [.4, 1.35, 4.6, 6.6, 9.5, 13.55, 14.65, 15.1, 16.7, 17.95]],
  ]) {
    console.log('Checking', name);
    await page.goto(`${base}${name}/`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(n => !!window.__timelines?.[n], {}, name);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
    });
    const seek = time => page.evaluate(async ({ name, time }) => {
      window.__timelines[name].time(time, true);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(document.querySelector('#composition').innerHTML));
      return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    }, { name, time });
    const times = [...new Set([0, duration - 1 / 60, ...stills, ...cuts.flatMap(t => [t - 1 / 60, t, t + 1 / 60])])].sort((a, b) => a - b);
    const snapshots = new Map(), pixels = new Map();
    for (const time of times) snapshots.set(time, await seek(time));
    console.log(name, 'forward/cut samples', times.length);
    for (const time of stills) {
      await seek(time);
      const image = await page.screenshot(name === 'reelShowcase' ? { path: `artifacts/review/showcase-${time}.png` } : {});
      pixels.set(time, hash(image));
    }
    for (const time of [...times].reverse()) assert.equal(await seek(time), snapshots.get(time), `${name}: reverse at ${time}`);
    console.log(name, 'reverse seeks passed');
    for (const time of [...times.filter((_, i) => i % 2), ...times.filter((_, i) => !(i % 2))]) {
      await seek(0);
      assert.equal(await seek(time), snapshots.get(time), `${name}: shuffled t→0→t at ${time}`);
      if (pixels.has(time)) {
        const image = await page.screenshot();
        if (hash(image) !== pixels.get(time)) {
          await writeFile(`.cache/${name}-seek-${time}.png`, image);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await page.screenshot({ path: `.cache/${name}-settled-${time}.png` });
        }
        assert.equal(hash(image), pixels.get(time), `${name}: pixels at ${time}`);
      }
    }
    await seek(name === 'trailer' ? 3.2 : .35); const motionA = hash(await page.screenshot());
    await seek(name === 'trailer' ? 3.4 : .55); assert.notEqual(hash(await page.screenshot()), motionA, `${name}: spin must move`);
    const file = `artifacts/${name}.mp4`;
    console.log(name, 'pixel and motion checks passed');
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
    assert.equal(probe.status, 0);
    const media = JSON.parse(probe.stdout), video = media.streams.find(s => s.codec_type === 'video');
    assert.equal(video.avg_frame_rate, '60/1'); assert.equal(video.pix_fmt, 'yuv420p');
    assert.equal(Number(media.format.duration), duration); assert.equal(media.streams.length, 1, 'Intentionally silent');
    const sheet = spawnSync('ffmpeg', ['-y', '-v', 'error', '-threads', '2', '-i', file, '-filter_threads', '2', '-vf', `fps=1,scale=480:-1,tile=6x${duration / 6}`, '-frames:v', '1', '-threads', '2', `artifacts/review/encoded-${name}-contact.png`], { encoding: 'utf8' });
    assert.equal(sheet.status, 0, sheet.stderr);
    const bundle = Buffer.concat(await Promise.all(['index.html', 'index.js', 'style.css', 'gsap.min.js'].map(file => readFile(`.render/${name}/${file}`))));
    reports.push({ name, times: times.length, reverse: true, shuffled: true, pixelMatches: pixels.size, moving: true, seconds: duration, fps: video.avg_frame_rate, bundleSha256: hash(bundle), sha256: hash(await readFile(file)) });
  }
  for (const [time, label] of [[6.6, 'mega'], [17.95, 'end']]) {
    const frame = spawnSync('ffmpeg', ['-y', '-v', 'error', '-threads', '2', '-ss', String(time), '-i', 'artifacts/reelShowcase.mp4', '-frames:v', '1', '-threads', '2', `artifacts/review/encoded-showcase-${label}.png`], { encoding: 'utf8' });
    assert.equal(frame.status, 0, frame.stderr);
  }
  assert.deepEqual(errors, []);
  await writeFile('artifacts/composition-qa-v2.json', JSON.stringify({ errors, reports }, null, 2));
  console.log(reports);
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
