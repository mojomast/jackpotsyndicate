// Builds a single self-contained HTML file: node tools/physics-viewer/build.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const r = await build({ entryPoints: [resolve(here, 'viewer.ts')], bundle: true, write: false, format: 'iife', target: 'es2022', minify: true,
  alias: { '@jackpotsyndicate/contracts': resolve(root, 'packages/contracts/src/index.ts'), '@jackpotsyndicate/physics': resolve(root, 'packages/physics/src/index.ts') } });
mkdirSync(resolve(root, 'artifacts'), { recursive: true });
const html = readFileSync(resolve(here, 'shell.html'), 'utf8').replace('/*BUNDLE*/', () => r.outputFiles[0].text.replace(/<\/script/g, '<\\/script'));
writeFileSync(resolve(root, 'artifacts/physics-viewer.html'), html);
console.log('wrote artifacts/physics-viewer.html', (html.length / 1024).toFixed(0) + ' KB');
