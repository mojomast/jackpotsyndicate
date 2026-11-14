import { createRequire } from 'node:module';
import { readdir, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const hyperframesRequire = createRequire(require.resolve('hyperframes/package.json'));
export const puppeteer = (await import(hyperframesRequire.resolve('puppeteer-core'))).default;
async function findBrowser(dir) {
  let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch { return null; }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isFile() && ['chrome-headless-shell', 'chrome', 'chromium'].includes(entry.name)) return path;
    if (entry.isDirectory()) { const found = await findBrowser(path); if (found) return found; }
  }
  return null;
}
export async function launchBrowser() {
  let executablePath = process.env.CHROME_BIN;
  if (!executablePath) for (const dir of [join(homedir(), '.cache/hyperframes/chrome'), join(homedir(), '.cache/puppeteer')]) { executablePath = await findBrowser(dir); if (executablePath) break; }
  if (!executablePath) for (const path of ['/usr/bin/chromium', '/usr/bin/google-chrome']) { try { await access(path); executablePath = path; break; } catch {} }
  if (!executablePath) throw new Error('Set CHROME_BIN to Chrome/Chromium, or run pnpm exec hyperframes setup.');
  return puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], defaultViewport: { width: 1920, height: 1080 } });
}
