import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildCompositions } from './build-compositions.mjs';
await buildCompositions(); await mkdir('artifacts', { recursive: true });
const result = spawnSync('pnpm', ['exec', 'hyperframes', 'render', '.render/trailer', '--output', resolve('artifacts/trailer.mp4'), '--fps', '60', '--workers', '2', '--quality', 'delivery', '--strict', '--no-browser-gpu'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
