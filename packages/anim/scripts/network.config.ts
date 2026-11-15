import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../../../playwright.config';

export default defineConfig({
  ...base,
  testDir: fileURLToPath(new URL('../../../e2e', import.meta.url)),
  testMatch: 'network.spec.ts',
  outputDir: fileURLToPath(new URL('../.cache/network', import.meta.url)),
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {} } }],
});
