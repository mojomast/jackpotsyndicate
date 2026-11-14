import { build } from 'vite';
import { copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function buildCompositions() {
  const names = (await readdir('compositions', { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name);
  for (const name of names) {
    await build({ configFile: false, logLevel: 'warn', plugins: [{ name: 'local-gsap', enforce: 'pre', resolveId(id) { if (id === 'gsap') return '\0local-gsap'; }, load(id) { if (id === '\0local-gsap') return 'export const gsap = window.gsap;'; } }], build: {
      outDir: `.render/${name}`, emptyOutDir: true,
      lib: { entry: resolve(`compositions/${name}/index.ts`), formats: ['iife'], name: 'JackpotComposition', fileName: () => 'index.js', cssFileName: 'style' },
      minify: false,
    } });
    const html = (await readFile(`compositions/${name}/index.html`, 'utf8'))
      .replace('<script type="module" src="./index.ts"></script>', '<script src="./gsap.min.js"></script><script src="./index.js"></script>')
      .replace('</head>', '<link rel="stylesheet" href="./style.css"></head>');
    await writeFile(`.render/${name}/index.html`, html);
    await copyFile('node_modules/gsap/dist/gsap.min.js', `.render/${name}/gsap.min.js`);
  }
  console.log(`Built ${names.length} local HyperFrames compositions.`);
}
if (process.argv[1] === new URL(import.meta.url).pathname) await buildCompositions();
