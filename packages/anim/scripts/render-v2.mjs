import { spawnSync } from 'node:child_process';
import { rename, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildCompositions } from './build-compositions.mjs';

await buildCompositions();
const report = [];
for (const [name, duration] of [['trailer', 24], ['reelShowcase', 18]]) {
  const candidate = resolve(`artifacts/${name}.candidate.mp4`);
  const render = spawnSync('pnpm', ['exec', 'hyperframes', 'render', `.render/${name}`, '--output', candidate, '--fps', '60', '--workers', '2', '--quality', 'delivery', '--strict', '--no-browser-gpu'], { stdio: 'inherit' });
  if (render.status) throw new Error(`${name} render failed`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', candidate], { encoding: 'utf8' });
  if (probe.status) throw new Error(`${name} probe failed`);
  const media = JSON.parse(probe.stdout), video = media.streams.find(s => s.codec_type === 'video');
  const bytes = (await stat(candidate)).size;
  if (video.width !== 1920 || video.height !== 1080 || Number(video.nb_read_frames) !== duration * 60 || bytes >= 25_000_000) throw new Error(`${name} media contract failed`);
  const decode = spawnSync('ffmpeg', ['-v', 'error', '-threads', '2', '-i', candidate, '-f', 'null', '-'], { encoding: 'utf8' });
  if (decode.status || decode.stderr.trim()) throw new Error(`${name} decode failed: ${decode.stderr}`);
  await rename(candidate, resolve(`artifacts/${name}.mp4`));
  report.push({ name, duration, frames: Number(video.nb_read_frames), width: video.width, height: video.height, codec: video.codec_name, bytes, fullDecode: true });
}
await writeFile('artifacts/media-v2.json', JSON.stringify(report, null, 2));
console.log(report);
