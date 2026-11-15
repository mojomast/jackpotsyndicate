import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, '..');
const gameModules = resolve(workspace, 'apps/game/node_modules');

export default defineConfig({
  root: resolve(here, 'harness'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react$/, replacement: resolve(gameModules, 'react') },
      { find: /^react\/(.*)$/, replacement: `${resolve(gameModules, 'react')}/$1` },
      { find: /^react-dom$/, replacement: resolve(gameModules, 'react-dom') },
      { find: /^react-dom\//, replacement: `${resolve(gameModules, 'react-dom')}/` },
      {
        find: /^@jackpotsyndicate\/([a-z-]+)$/,
        replacement: `${resolve(workspace, 'packages')}/$1/src/index.ts`,
      },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    hmr: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
