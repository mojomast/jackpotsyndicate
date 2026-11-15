import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { SPRITE_KEYS } from '@jackpotsyndicate/contracts';
import {
  DEFAULT_ITEM_CATALOG,
  allAssetKeys,
  buildAssets,
  verifyAssets,
  type ResolvedManifest,
} from '../src/index';

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'js-assets-test-'));
}

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(root, relativePath)));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

function entriesWithPrefix(manifest: ResolvedManifest, prefix: string): string[] {
  return Object.keys(manifest).filter((key) => key.startsWith(`${prefix}.`));
}

test('every C-7 key and item family resolves in the manifest', async () => {
  const outputDir = await tempDir();
  try {
    const result = await buildAssets({ outputDir, assetrizzManifestPath: null });
    const text = await readFile(join(outputDir, 'asset-manifest.json'), 'utf8');
    const manifest = JSON.parse(text) as ResolvedManifest;

    assert.equal(Object.keys(manifest).length, allAssetKeys().length);
    assert.equal(new Set(result.keys).size, result.keys.length);
    for (const key of SPRITE_KEYS) {
      assert.ok(manifest[key], `missing pinned key ${key}`);
    }

    assert.equal(entriesWithPrefix(manifest, 'symbol').length, 6);
    assert.equal(entriesWithPrefix(manifest, 'token').length, 7);
    assert.equal(entriesWithPrefix(manifest, 'peg').length, 4);
    assert.equal(entriesWithPrefix(manifest, 'boss').length, 3);
    assert.equal(entriesWithPrefix(manifest, 'floor').length, 4);
    assert.equal(entriesWithPrefix(manifest, 'ui').length, 7);
    assert.equal(entriesWithPrefix(manifest, 'vfx').length, 4);
    assert.equal(entriesWithPrefix(manifest, 'trinket').length, DEFAULT_ITEM_CATALOG.trinket.length);
    assert.equal(entriesWithPrefix(manifest, 'drink').length, DEFAULT_ITEM_CATALOG.drink.length);
    assert.equal(entriesWithPrefix(manifest, 'coin').length, DEFAULT_ITEM_CATALOG.coin.length);
    assert.equal(entriesWithPrefix(manifest, 'chassis').length, DEFAULT_ITEM_CATALOG.chassis.length);
    assert.equal(entriesWithPrefix(manifest, 'glyph').length, DEFAULT_ITEM_CATALOG.glyph.length);
    assert.equal(DEFAULT_ITEM_CATALOG.trinket.length, 15);
    assert.equal(DEFAULT_ITEM_CATALOG.drink.length, 5);
    assert.equal(DEFAULT_ITEM_CATALOG.coin.length, 4);

    for (const [key, entry] of Object.entries(manifest)) {
      assert.equal(entry.source.length > 0, true, `missing source for ${key}`);
      assert.match(entry.sha256, /^[0-9a-f]{64}$/);
      assert.ok(entry.file, `missing file for ${key}`);
      assert.equal('placeholder' in entry, true, `${key} should be a placeholder`);
      if ('placeholder' in entry) {
        const svg = await readFile(join(outputDir, entry.file));
        assert.equal(sha256(svg), entry.sha256);
        assert.equal(svg.toString('utf8').includes(`data-key="${key}"`), true);
      }
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('re-running the build is byte-identical', async () => {
  const first = await tempDir();
  const second = await tempDir();
  try {
    await buildAssets({ outputDir: first, assetrizzManifestPath: null });
    await buildAssets({ outputDir: second, assetrizzManifestPath: null });

    const firstFiles = await listFiles(first);
    const secondFiles = await listFiles(second);
    assert.deepEqual(firstFiles, secondFiles);
    for (const file of firstFiles) {
      const [a, b] = await Promise.all([
        readFile(join(first, file)),
        readFile(join(second, file)),
      ]);
      assert.equal(a.equals(b), true, `${file} differs between builds`);
    }

    const before = await readFile(join(first, 'asset-manifest.json'));
    await buildAssets({ outputDir: first, assetrizzManifestPath: null });
    const after = await readFile(join(first, 'asset-manifest.json'));
    assert.equal(before.equals(after), true);
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test('verify accepts a fresh build, rejects tampered output and never uses fetch', async () => {
  const outputDir = await tempDir();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error('network access is not allowed');
  }) as typeof fetch;
  try {
    await buildAssets({ outputDir, assetrizzManifestPath: null });
    const ok = await verifyAssets({ outputDir, assetrizzManifestPath: null });
    assert.equal(ok.ok, true, ok.errors.join('\n'));
    assert.equal(ok.checked.length > 0, true);

    const manifest = JSON.parse(
      await readFile(join(outputDir, 'asset-manifest.json'), 'utf8'),
    ) as ResolvedManifest;
    const firstKey = Object.keys(manifest).sort()[0];
    assert.ok(firstKey);
    const firstEntry = manifest[firstKey];
    assert.ok(firstEntry);
    assert.ok(firstEntry.file);
    await writeFile(join(outputDir, firstEntry.file), 'tampered');

    const bad = await verifyAssets({ outputDir, assetrizzManifestPath: null });
    assert.equal(bad.ok, false);
    assert.equal(bad.errors.length > 0, true);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('a pinned assetrizz entry is hash-verified and used instead of a placeholder', async () => {
  const root = await tempDir();
  const outputDir = join(root, 'out');
  const manifestDir = join(root, 'assets');
  try {
    await mkdir(manifestDir, { recursive: true });
    const png = Buffer.from('pinned-asset-bytes');
    await writeFile(join(manifestDir, 'diamond.png'), png);
    const manifestPath = join(manifestDir, 'manifest.jsonl');
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        key: 'symbol.diamond',
        path: 'diamond.png',
        sha256: sha256(png),
        atlas: 'symbols',
        frame: { x: 4, y: 8, w: 32, h: 40 },
        pivot: { x: 0.5, y: 1 },
      })}\n`,
      'utf8',
    );

    const result = await buildAssets({ outputDir, assetrizzManifestPath: manifestPath });
    const manifest = result.manifest;
    const locked = manifest['symbol.diamond'];
    assert.ok(locked);
    assert.equal('placeholder' in locked, false);
    if (!('placeholder' in locked)) {
      assert.equal(locked.atlas, 'symbols');
      assert.deepEqual(locked.frame, { x: 4, y: 8, w: 32, h: 40 });
      assert.deepEqual(locked.pivot, { x: 0.5, y: 1 });
      assert.equal(locked.sha256, sha256(png));
      assert.match(locked.source, /^assetrizz:/);
      assert.ok(locked.file);
      assert.equal((await readFile(join(outputDir, locked.file))).equals(png), true);
    }
    assert.equal(result.locked.length, 1);
    assert.equal(result.placeholders.length, result.keys.length - 1);
    assert.equal('placeholder' in manifest['symbol.cherry']!, true);

    const ok = await verifyAssets({ outputDir, assetrizzManifestPath: manifestPath });
    assert.equal(ok.ok, true, ok.errors.join('\n'));

    const badManifestPath = join(manifestDir, 'bad.jsonl');
    await writeFile(
      badManifestPath,
      `${JSON.stringify({
        key: 'symbol.diamond',
        path: 'diamond.png',
        sha256: '0'.repeat(64),
      })}\n`,
      'utf8',
    );
    await assert.rejects(
      buildAssets({ outputDir, assetrizzManifestPath: badManifestPath }),
      /sha256 mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
