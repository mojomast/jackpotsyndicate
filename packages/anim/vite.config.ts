import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  build: { lib: { entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)), formats: ['es'], fileName: 'anim', cssFileName: 'style' },
    rolldownOptions: { external: ['gsap'] }, sourcemap: true },
});
