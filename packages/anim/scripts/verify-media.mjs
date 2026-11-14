import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { launchBrowser } from './browser.mjs';
const path = 'artifacts/trailer.mp4';
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8' }));
const video = probe.streams.find(s => s.codec_type === 'video');
if (probe.streams.length !== 1 || video?.width !== 1920 || video.height !== 1080 || video.avg_frame_rate !== '60/1' || video.nb_frames !== '1440' || video.duration !== '24.000000') throw new Error('Unexpected trailer media contract.');
execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'null', '-']);
const bytes = await readFile(path), sha256 = createHash('sha256').update(bytes).digest('hex');
const browser = await launchBrowser(), page = await browser.newPage();
const browserVersion = await browser.version();
await page.goto(`${process.env.DEMO_URL || 'http://127.0.0.1:5180'}/artifacts/`);
const playback = await page.evaluate(async () => {
  const video = document.querySelector('video'); const errors = [], waits = [];
  video.addEventListener('error', () => errors.push(video.error?.message));
  video.addEventListener('waiting', () => waits.push(video.currentTime));
  const end = new Promise(resolve => video.addEventListener('ended', resolve, { once: true }));
  await video.play(); await end;
  const quality = video.getVideoPlaybackQuality();
  return { ended: video.ended, errors, waits, totalFrames: quality.totalVideoFrames, droppedFrames: quality.droppedVideoFrames };
});
await mkdir('artifacts/qa', { recursive: true });
if (process.env.PREVIEW_URL) {
  await page.goto(process.env.PREVIEW_URL);
  await page.screenshot({ path: 'artifacts/qa/hyperframes-preview.png' });
}
await browser.close();
const report = { bytes: bytes.length, sha256, browserVersion, ffmpeg: execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0], probe, decodedWithoutErrors: true, playback };
await writeFile('artifacts/media-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ bytes: report.bytes, sha256, browserVersion, ffmpeg: report.ffmpeg, playback }, null, 2));
if (!playback.ended || playback.errors.length) process.exit(1);
