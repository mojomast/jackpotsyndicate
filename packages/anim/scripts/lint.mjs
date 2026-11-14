import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { buildCompositions } from './build-compositions.mjs';

export async function checkSource(dir = 'src') {
  const failures = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) failures.push(...await checkSource(path));
    else {
      const text = await readFile(path, 'utf8');
      for (const pattern of [/Math\s*(?:\.\s*random|\[\s*['"]random['"]\s*\])/, /\bDate\b/, /performance\s*\.\s*now/, /\bsetTimeout\b/, /\bsetInterval\b/, /\brequestAnimationFrame\b/]) if (pattern.test(text)) failures.push(`${path}: forbidden ${pattern}`);
    }
  }
  return failures;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const failures = await checkSource();
  if (failures.length) throw new Error(failures.join('\n'));
  await buildCompositions();
  for (const entry of await readdir('.render', { withFileTypes: true })) if (entry.isDirectory()) {
    const run = spawnSync('pnpm', ['exec', 'hyperframes', 'lint', `.render/${entry.name}`], { stdio: 'inherit' });
    if (run.status) process.exit(run.status);
  }
  console.log('Source determinism guard and all composition lints passed.');
}
