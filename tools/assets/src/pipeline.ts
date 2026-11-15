import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITE_KEYS } from '@jackpotsyndicate/contracts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, 'apps/game/public/atlas');
export const DEFAULT_ASSETRIZZ_MANIFEST = join(REPO_ROOT, 'assets/manifest.jsonl');
export const DEFAULT_STYLE_PACK = 'obsidian-noir';

export type AssetCategory =
  | 'symbol'
  | 'token'
  | 'peg'
  | 'boss'
  | 'floor'
  | 'ui'
  | 'vfx'
  | 'trinket'
  | 'drink'
  | 'coin'
  | 'chassis'
  | 'glyph';

export interface ItemCatalog {
  trinket: readonly string[];
  drink: readonly string[];
  coin: readonly string[];
  chassis: readonly string[];
  glyph: readonly string[];
}

export const DEFAULT_ITEM_CATALOG: ItemCatalog = {
  trinket: [
    'quantum-splitter-coil',
    'electromagnetic-hopper',
    'vampiric-stepper-motor',
    'vampiric-rake-collector',
    'gold-peg-alchemist',
    'turbo-dozer-cam',
    'hydraulic-dozer-piston',
    'rubber-gutter-bumper',
    'gutter-guard-bumper',
    'ouroboros-capacitor',
    'loaded-platinum-die',
    'overvolted-solenoid',
    'vip-bullion-stamp',
    'tesla-peg-capacitor',
    'midas-lip-sensor',
  ],
  drink: [
    'dirty-syndicate-martini',
    'alchemist-absinthe',
    'green-fairy-absinthe',
    'nitrous-espresso',
    'lubricant-oil-shot',
  ],
  coin: ['copper-token', 'heavy-lead-slug', 'polymer-superball', 'blood-doubloon'],
  chassis: [
    'reel-column',
    'row',
    'harness-hyper',
    'harness-ways',
    'harness-cluster',
    'jumper-wire',
    'overvolt',
  ],
  glyph: ['blood-diamond', 'lucky-seven', 'uranium', 'cherry', 'magnet-skull'],
};

export interface AssetKeyConfig {
  key: string;
  category: AssetCategory;
  search: string;
  stylePack: string;
}

export interface ManifestFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ManifestPivot {
  x: number;
  y: number;
}

export interface ManifestAsset {
  atlas: string;
  frame: ManifestFrame;
  pivot: ManifestPivot;
  source: string;
  sha256: string;
  file?: string;
}

export interface ManifestPlaceholder {
  placeholder: true;
  source: string;
  sha256: string;
  file: string;
}

export type ResolvedManifestEntry = ManifestAsset | ManifestPlaceholder;
export type ResolvedManifest = Record<string, ResolvedManifestEntry>;

export interface AssetrizzEntry {
  key: string;
  path: string;
  sha256: string;
  atlas?: string;
  frame?: ManifestFrame;
  pivot?: ManifestPivot;
  source?: string;
  width?: number;
  height?: number;
  commit?: string;
}

export interface AssetrizzManifest {
  commit: string;
  entries: Map<string, AssetrizzEntry>;
}

export interface BuildOptions {
  outputDir?: string;
  assetrizzManifestPath?: string | null;
  itemCatalog?: ItemCatalog;
  stylePack?: string;
  commit?: string;
}

export interface BuildResult {
  outputDir: string;
  manifestPath: string;
  manifest: ResolvedManifest;
  keys: string[];
  placeholders: string[];
  locked: string[];
  files: string[];
}

export interface VerifyResult {
  ok: boolean;
  errors: string[];
  checked: string[];
}

interface ResolvedOptions {
  outputDir: string;
  assetrizzManifestPath: string | null;
  itemCatalog: ItemCatalog;
  stylePack: string;
  commit?: string;
}

const ITEM_FAMILIES = ['trinket', 'drink', 'coin', 'chassis', 'glyph'] as const;
const ITEM_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function normalizeSlashes(value: string): string {
  return value.replaceAll('\\', '/');
}

function safeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

function categoryForKey(key: string): AssetCategory {
  const prefix = key.split('.')[0];
  const categories: readonly string[] = [
    'symbol',
    'token',
    'peg',
    'boss',
    'floor',
    'ui',
    'vfx',
    'trinket',
    'drink',
    'coin',
    'chassis',
    'glyph',
  ];
  if (!prefix || !categories.includes(prefix)) {
    throw new Error(`unsupported sprite key: ${key}`);
  }
  return prefix as AssetCategory;
}

function normalizeCatalog(catalog: ItemCatalog): ItemCatalog {
  const normalized: ItemCatalog = {
    trinket: [...catalog.trinket],
    drink: [...catalog.drink],
    coin: [...catalog.coin],
    chassis: [...catalog.chassis],
    glyph: [...catalog.glyph],
  };
  for (const family of ITEM_FAMILIES) {
    const seen = new Set<string>();
    for (const id of normalized[family]) {
      if (!ITEM_ID_PATTERN.test(id)) throw new Error(`invalid ${family} id: ${id}`);
      if (seen.has(id)) throw new Error(`duplicate ${family} id: ${id}`);
      seen.add(id);
    }
  }
  return normalized;
}

export function allAssetKeys(catalog: ItemCatalog = DEFAULT_ITEM_CATALOG): string[] {
  const normalized = normalizeCatalog(catalog);
  const keys: string[] = [...SPRITE_KEYS];
  for (const family of ITEM_FAMILIES) {
    for (const id of normalized[family]) keys.push(`${family}.${id}`);
  }
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) throw new Error(`duplicate sprite key: ${key}`);
    seen.add(key);
  }
  return keys;
}

export function buildAssetConfig(
  catalog: ItemCatalog = DEFAULT_ITEM_CATALOG,
  stylePack: string = DEFAULT_STYLE_PACK,
): AssetKeyConfig[] {
  return allAssetKeys(catalog).map((key) => ({
    key,
    category: categoryForKey(key),
    search: key.replace(/[._-]+/g, ' ').trim(),
    stylePack,
  }));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readFrame(value: unknown): ManifestFrame | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const x = readNumber(record.x);
  const y = readNumber(record.y);
  const w = readNumber(record.w);
  const h = readNumber(record.h);
  if (x === undefined || y === undefined || w === undefined || h === undefined) return undefined;
  return { x, y, w, h };
}

function readPivot(value: unknown): ManifestPivot | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const x = readNumber(record.x);
  const y = readNumber(record.y);
  if (x === undefined || y === undefined) return undefined;
  return { x, y };
}

function parseEntry(value: unknown, origin: string): AssetrizzEntry {
  const record = asRecord(value);
  if (!record) throw new Error(`${origin}: assetrizz entry must be an object`);
  const key = record.key;
  const assetPath = record.path ?? record.file;
  const sha256 = record.sha256;
  if (typeof key !== 'string' || key.length === 0) throw new Error(`${origin}: entry is missing key`);
  if (typeof assetPath !== 'string' || assetPath.length === 0) {
    throw new Error(`${origin}: entry ${key} is missing path`);
  }
  if (typeof sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(sha256)) {
    throw new Error(`${origin}: entry ${key} is missing a valid sha256`);
  }
  const entry: AssetrizzEntry = {
    key,
    path: assetPath,
    sha256: sha256.toLowerCase(),
  };
  if (typeof record.atlas === 'string') entry.atlas = record.atlas;
  if (typeof record.source === 'string') entry.source = record.source;
  if (typeof record.commit === 'string') entry.commit = record.commit;
  const frame = readFrame(record.frame);
  if (frame) entry.frame = frame;
  const pivot = readPivot(record.pivot);
  if (pivot) entry.pivot = pivot;
  const width = readNumber(record.width);
  const height = readNumber(record.height);
  if (width !== undefined) entry.width = width;
  if (height !== undefined) entry.height = height;
  return entry;
}

export async function loadAssetrizzManifest(
  manifestPath: string | null,
): Promise<AssetrizzManifest> {
  if (!manifestPath) return { commit: 'unpinned', entries: new Map() };
  let text: string;
  try {
    text = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { commit: 'unpinned', entries: new Map() };
    }
    throw error;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) return { commit: 'unpinned', entries: new Map() };

  let commit = 'pinned';
  const rawEntries: unknown[] = [];
  const origin = manifestPath;

  if (manifestPath.endsWith('.jsonl')) {
    const lines = trimmed.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new Error(`${origin}:${i + 1}: invalid JSON`);
      }
      const record = asRecord(parsed);
      if (record && typeof record.commit === 'string') commit = record.commit;
      rawEntries.push(parsed);
    }
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`${origin}: invalid JSON`);
    }
    const record = asRecord(parsed);
    if (Array.isArray(parsed)) {
      rawEntries.push(...parsed);
    } else if (record && Array.isArray(record.assets)) {
      rawEntries.push(...record.assets);
      if (typeof record.commit === 'string') commit = record.commit;
    } else {
      throw new Error(`${origin}: expected a JSON array or an object with an assets array`);
    }
  }

  const entries = new Map<string, AssetrizzEntry>();
  for (const raw of rawEntries) {
    const record = asRecord(raw);
    if (record && typeof record.key !== 'string' && typeof record.commit === 'string') continue;
    const entry = parseEntry(raw, origin);
    if (entries.has(entry.key)) throw new Error(`${origin}: duplicate entry for ${entry.key}`);
    entries.set(entry.key, entry);
  }
  return { commit, entries };
}

function resolveOptions(options: BuildOptions): ResolvedOptions {
  const inputManifest =
    options.assetrizzManifestPath === null
      ? null
      : resolve(options.assetrizzManifestPath ?? DEFAULT_ASSETRIZZ_MANIFEST);
  return {
    outputDir: resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR),
    assetrizzManifestPath: inputManifest,
    itemCatalog: normalizeCatalog(options.itemCatalog ?? DEFAULT_ITEM_CATALOG),
    stylePack: options.stylePack ?? DEFAULT_STYLE_PACK,
    commit: options.commit,
  };
}

function placeholderSvg(key: string): string {
  const digest = sha256Hex(key);
  const hue = Number.parseInt(digest.slice(0, 6), 16) % 360;
  const accentHue = (hue + 42) % 360;
  const label = key.length > 26 ? `${key.slice(0, 25)}...` : key;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" data-key="${escapeXml(key)}">`,
    `  <rect width="128" height="128" rx="14" fill="hsl(${hue} 42% 12%)"/>`,
    `  <rect x="6" y="6" width="116" height="116" rx="10" fill="none" stroke="hsl(${accentHue} 82% 62%)" stroke-width="2"/>`,
    `  <circle cx="64" cy="48" r="18" fill="hsl(${accentHue} 82% 62%)" opacity="0.35"/>`,
    `  <text x="64" y="92" text-anchor="middle" font-family="monospace" font-size="11" fill="#fbbf24">${escapeXml(label)}</text>`,
    `  <text x="64" y="108" text-anchor="middle" font-family="monospace" font-size="8" fill="#94a3b8">placeholder</text>`,
    '</svg>',
    '',
  ].join('\n');
}

async function writePlaceholder(
  outputDir: string,
  key: string,
  stylePack: string,
): Promise<ManifestPlaceholder> {
  const relativeFile = `placeholders/${safeFileName(key)}.svg`;
  const contents = placeholderSvg(key);
  await mkdir(join(outputDir, 'placeholders'), { recursive: true });
  await writeFile(join(outputDir, relativeFile), contents, 'utf8');
  return {
    placeholder: true,
    source: `placeholder:${stylePack}:${key}`,
    sha256: sha256Hex(contents),
    file: relativeFile,
  };
}

async function writeLockedAsset(
  outputDir: string,
  manifestDir: string,
  key: string,
  entry: AssetrizzEntry,
  commit: string,
): Promise<ManifestAsset> {
  const sourcePath = isAbsolute(entry.path) ? entry.path : resolve(manifestDir, entry.path);
  let bytes: Buffer;
  try {
    bytes = await readFile(sourcePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new Error(`assetrizz entry for ${key} points at missing file: ${sourcePath} (${code ?? 'error'})`);
  }
  const digest = sha256Hex(bytes);
  if (digest !== entry.sha256) {
    throw new Error(
      `assetrizz sha256 mismatch for ${key}: manifest ${entry.sha256}, file ${digest}`,
    );
  }
  const base = safeFileName(basename(sourcePath)) || 'asset.bin';
  const relativeFile = `assets/${digest.slice(0, 12)}-${base}`;
  await mkdir(join(outputDir, 'assets'), { recursive: true });
  await writeFile(join(outputDir, relativeFile), bytes);

  const relativeSource = normalizeSlashes(relative(manifestDir, sourcePath));
  const sourcePathLabel = relativeSource.startsWith('..') ? basename(sourcePath) : relativeSource;
  return {
    atlas: entry.atlas ?? 'external',
    frame: entry.frame ?? {
      x: 0,
      y: 0,
      w: entry.width ?? 128,
      h: entry.height ?? 128,
    },
    pivot: entry.pivot ?? { x: 0.5, y: 0.5 },
    source: entry.source ?? `assetrizz:${commit}/${sourcePathLabel}`,
    sha256: digest,
    file: relativeFile,
  };
}

function contactSheetSvg(keys: string[], manifest: ResolvedManifest): string {
  const columns = 6;
  const cellWidth = 230;
  const cellHeight = 92;
  const padding = 24;
  const header = 58;
  const rows = Math.ceil(keys.length / columns);
  const width = padding * 2 + columns * cellWidth;
  const height = header + padding + rows * cellHeight;
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="${width}" height="${height}" fill="#07090e"/>`,
    `  <text x="${padding}" y="34" font-family="monospace" font-size="16" fill="#fbbf24">Jackpot Syndicate asset contact sheet (${keys.length} keys)</text>`,
  ];
  keys.forEach((key, index) => {
    const entry = manifest[key];
    if (!entry) return;
    const digest = sha256Hex(key);
    const hue = Number.parseInt(digest.slice(0, 6), 16) % 360;
    const x = padding + (index % columns) * cellWidth;
    const y = header + Math.floor(index / columns) * cellHeight;
    const label = key.length > 27 ? `${key.slice(0, 26)}...` : key;
    lines.push(
      `  <rect x="${x + 4}" y="${y + 4}" width="${cellWidth - 8}" height="${cellHeight - 8}" rx="8" fill="hsl(${hue} 38% 13%)" stroke="hsl(${(hue + 42) % 360} 55% 38%)"/>`,
      `  <text x="${x + 14}" y="${y + 30}" font-family="monospace" font-size="11" fill="#fbbf24">${escapeXml(label)}</text>`,
      `  <text x="${x + 14}" y="${y + 50}" font-family="monospace" font-size="9" fill="#94a3b8">${'placeholder' in entry ? 'placeholder vector' : escapeXml(entry.atlas)}</text>`,
      `  <text x="${x + 14}" y="${y + 68}" font-family="monospace" font-size="8" fill="#64748b">${entry.sha256.slice(0, 16)}</text>`,
    );
  });
  lines.push('</svg>', '');
  return lines.join('\n');
}

export function serializeManifest(manifest: ResolvedManifest): string {
  const sortValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortValue);
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) sorted[key] = sortValue(record[key]);
      return sorted;
    }
    return value;
  };
  return `${JSON.stringify(sortValue(manifest), null, 2)}\n`;
}

export async function buildAssets(options: BuildOptions = {}): Promise<BuildResult> {
  const resolved = resolveOptions(options);
  const keys = allAssetKeys(resolved.itemCatalog).sort();
  const assetrizz = await loadAssetrizzManifest(resolved.assetrizzManifestPath);
  const manifestDir = resolved.assetrizzManifestPath
    ? resolve(resolved.assetrizzManifestPath, '..')
    : resolved.outputDir;

  await mkdir(resolved.outputDir, { recursive: true });
  await rm(join(resolved.outputDir, 'placeholders'), { recursive: true, force: true });
  await rm(join(resolved.outputDir, 'assets'), { recursive: true, force: true });
  await rm(join(resolved.outputDir, 'contact-sheet.svg'), { force: true });

  const manifest: ResolvedManifest = {};
  const placeholders: string[] = [];
  const locked: string[] = [];

  for (const key of keys) {
    const entry = assetrizz.entries.get(key);
    if (entry) {
      const commit = resolved.commit ?? entry.commit ?? assetrizz.commit;
      manifest[key] = await writeLockedAsset(
        resolved.outputDir,
        manifestDir,
        key,
        entry,
        commit,
      );
      locked.push(key);
    } else {
      manifest[key] = await writePlaceholder(resolved.outputDir, key, resolved.stylePack);
      placeholders.push(key);
    }
  }

  const manifestPath = join(resolved.outputDir, 'asset-manifest.json');
  const contactsPath = join(resolved.outputDir, 'contact-sheet.svg');
  await writeFile(contactsPath, contactSheetSvg(keys, manifest), 'utf8');
  await writeFile(manifestPath, serializeManifest(manifest), 'utf8');

  return {
    outputDir: resolved.outputDir,
    manifestPath,
    manifest,
    keys,
    placeholders,
    locked,
    files: await listFiles(resolved.outputDir),
  };
}

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function isManifest(value: unknown): value is ResolvedManifest {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function verifyAssets(options: BuildOptions = {}): Promise<VerifyResult> {
  const resolved = resolveOptions(options);
  const manifestPath = join(resolved.outputDir, 'asset-manifest.json');
  const errors: string[] = [];
  let checked: string[] = [];
  let tempDir: string | undefined;

  try {
    let existingText: string;
    try {
      existingText = await readFile(manifestPath, 'utf8');
    } catch {
      throw new Error(`missing manifest: ${manifestPath}`);
    }

    tempDir = await mkdtemp(join(tmpdir(), 'js-assets-verify-'));
    const rebuilt = await buildAssets({ ...options, outputDir: tempDir });
    const expectedText = await readFile(rebuilt.manifestPath, 'utf8');
    if (existingText !== expectedText) {
      errors.push('asset-manifest.json differs from a fresh deterministic build');
    }

    const expectedFiles = await listFiles(tempDir);
    const actualFiles = await listFiles(resolved.outputDir);
    checked = expectedFiles;
    if (expectedFiles.join('\n') !== actualFiles.join('\n')) {
      const missing = expectedFiles.filter((file) => !actualFiles.includes(file));
      const extra = actualFiles.filter((file) => !expectedFiles.includes(file));
      if (missing.length > 0) errors.push(`missing output files: ${missing.join(', ')}`);
      if (extra.length > 0) errors.push(`unexpected output files: ${extra.join(', ')}`);
    }

    for (const file of expectedFiles) {
      if (!actualFiles.includes(file)) continue;
      const [expected, actual] = await Promise.all([
        readFile(join(tempDir, file)),
        readFile(join(resolved.outputDir, file)),
      ]);
      if (!expected.equals(actual)) errors.push(`output file differs: ${file}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(existingText);
    } catch {
      errors.push('asset-manifest.json is not valid JSON');
      parsed = undefined;
    }
    if (!isManifest(parsed)) {
      errors.push('asset-manifest.json is not an object');
    } else {
      const expectedKeys = allAssetKeys(resolved.itemCatalog);
      for (const key of expectedKeys) {
        const entry = parsed[key];
        if (!entry) {
          errors.push(`missing sprite key: ${key}`);
          continue;
        }
        if (typeof entry.source !== 'string' || entry.source.length === 0) {
          errors.push(`missing source for ${key}`);
        }
        if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
          errors.push(`invalid sha256 for ${key}`);
          continue;
        }
        const file = 'file' in entry ? entry.file : undefined;
        if (typeof file !== 'string' || file.length === 0) {
          errors.push(`missing file for ${key}`);
          continue;
        }
        try {
          const bytes = await readFile(join(resolved.outputDir, file));
          if (sha256Hex(bytes) !== entry.sha256) errors.push(`sha256 mismatch for ${key}`);
        } catch {
          errors.push(`missing file for ${key}: ${file}`);
        }
      }
      for (const key of Object.keys(parsed)) {
        if (!expectedKeys.includes(key)) errors.push(`unexpected sprite key: ${key}`);
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }

  return { ok: errors.length === 0, errors, checked };
}

const USAGE = `Usage:
  tsx tools/assets/src/index.ts build [--out DIR] [--manifest FILE] [--no-manifest] [--style PACK]
  tsx tools/assets/src/index.ts verify [--out DIR] [--manifest FILE] [--no-manifest] [--style PACK]

Build resolves every C-7 sprite key and item key to a pinned assetrizz entry when
one is present, otherwise to a deterministic vector placeholder. Verify rebuilds
in a temporary directory and compares bytes and SHA-256 hashes; it never uses the
network.`;

function parseCli(args: string[]): BuildOptions {
  const options: BuildOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    const next = (): string => {
      const value = args[++i];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      return value;
    };
    if (arg === '--out') options.outputDir = next();
    else if (arg === '--manifest') options.assetrizzManifestPath = next();
    else if (arg === '--no-manifest') options.assetrizzManifestPath = null;
    else if (arg === '--style') options.stylePack = next();
    else if (arg === '--commit') options.commit = next();
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === '--help' || command === 'help') {
    console.log(USAGE);
    return 0;
  }
  let options: BuildOptions;
  try {
    options = parseCli(rest);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    return 1;
  }
  if (command === 'build') {
    const result = await buildAssets(options);
    console.log(
      `assets: ${result.keys.length} keys, ${result.locked.length} locked, ${result.placeholders.length} placeholders`,
    );
    console.log(`manifest: ${result.manifestPath}`);
    return 0;
  }
  if (command === 'verify') {
    const result = await verifyAssets(options);
    if (!result.ok) {
      for (const error of result.errors) console.error(`error: ${error}`);
      return 1;
    }
    console.log(`verified ${result.checked.length} files against a fresh deterministic build`);
    return 0;
  }
  console.error(`unknown command: ${command}`);
  console.error(USAGE);
  return 1;
}
