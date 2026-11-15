import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

// Repository-integration check, including the shared re-export shim.
const shared = resolve('../contracts/src');
const require = createRequire(import.meta.url);
const hyperframesRequire = createRequire(require.resolve('hyperframes/package.json'));
const { buildSync } = hyperframesRequire('esbuild');
async function values(file) {
  const output = buildSync({ entryPoints: [resolve(file)], bundle: true, write: false, platform: 'node', format: 'cjs', target: 'es2022' }).outputFiles[0].text;
  const context = { module: { exports: {} } };
  vm.runInNewContext(output, context, { filename: file });
  return context.module.exports;
}
const local = await values('src/contracts-shim.ts');
const constants = await values(`${shared}/constants.ts`);
const presentation = await values(`${shared}/presentation.ts`);
const names = ['TICKS_PER_SECOND', 'EVAL_DELAY_TICKS', 'ORB_LAUNCH_DELAY_TICKS', 'ORB_LAUNCH_INTERVAL_TICKS', 'ANIM_TICKS', 'DESIGN_TOKENS'];
for (const name of names) assert.deepEqual(JSON.parse(JSON.stringify(local[name])), JSON.parse(JSON.stringify({ ...constants, ...presentation }[name])), name);
for (let col = 0; col < 5; col++) assert.equal(local.REEL_STOP_TICK(col), constants.REEL_STOP_TICK(col), `REEL_STOP_TICK(${col})`);

const contentTypes = ['SymbolId', 'BossId', 'FloorId'];
const presentationTypes = ['DesignTokens', 'SpriteFrame', 'SpriteResolver', 'SeekableTimeline', 'AnimCell', 'ReelSpinParams', 'LineWinParams', 'TumbleStepParams', 'GridRelayoutParams', 'FeverParams', 'BossIntroParams', 'FloorTransitionParams', 'VictoryParams', 'GameOverParams'];
await mkdir('.cache', { recursive: true });
const checks = [
  `import type * as Local from '../src/contracts-shim';`,
  `import type * as Content from '../../contracts/src/content';`,
  `import type * as Presentation from '../../contracts/src/presentation';`,
  `type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;`,
  `type Assert<T extends true> = T;`,
  ...contentTypes.map(name => `type Check${name} = Assert<Equal<Local.${name}, Content.${name}>>;`),
  ...presentationTypes.map(name => `type Check${name} = Assert<Equal<Local.${name}, Presentation.${name}>>;`),
  `type CheckTimelineFactory = Assert<Equal<Local.TimelineFactory<Local.ReelSpinParams>, Presentation.TimelineFactory<Presentation.ReelSpinParams>>>;`,
];
const file = '.cache/contracts-check.ts'; await writeFile(file, checks.join('\n'));
await writeFile('.cache/tsconfig.contracts.json', JSON.stringify({ extends: '../tsconfig.json', include: ['contracts-check.ts'] }, null, 2));
execFileSync('pnpm', ['exec', 'tsc', '-p', '.cache/tsconfig.contracts.json'], { stdio: 'inherit' });
console.log(`Contracts match: ${names.length + 1} value/function exports and ${contentTypes.length + presentationTypes.length + 1} shared types. No runtime import of @jackpotsyndicate/contracts.`);
