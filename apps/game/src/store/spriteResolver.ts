import type { SpriteFrame, SpriteResolver } from '@jackpotsyndicate/contracts';

export interface SpriteManifestFrame { x: number; y: number; w: number; h: number }
export interface SpriteManifestPivot { x: number; y: number }
export interface SpriteManifestAsset {
  atlas: string;
  frame: SpriteManifestFrame;
  pivot?: SpriteManifestPivot;
  source?: string;
  sha256?: string;
  file?: string;
  url?: string;
}
export interface SpriteManifestPlaceholder {
  placeholder: true;
  source?: string;
  sha256?: string;
  file?: string;
}
export type SpriteManifestEntry = SpriteManifestAsset | SpriteManifestPlaceholder;
export type SpriteManifest = Record<string, SpriteManifestEntry>;
export type AssetManifest = SpriteManifest;
export type { SpriteFrame, SpriteResolver };

/** Atlas output directory produced by T-040, served from the game's public dir. */
export const DEFAULT_ATLAS_BASE_URL = '/atlas';
export const DEFAULT_ASSET_MANIFEST_URL = `${DEFAULT_ATLAS_BASE_URL}/asset-manifest.json`;

/** Every logical sprite key requested by packages/anim. */
export const ANIM_SPRITE_KEYS = [
  'symbol.diamond', 'symbol.cherry', 'symbol.uranium', 'symbol.skull', 'symbol.seven',
  'boss.valenti', 'boss.zero', 'boss.auditor',
  'floor.FLOOR_NEON.bg', 'floor.FLOOR_CRYO.bg', 'floor.FLOOR_FOUNDRY.bg', 'floor.FLOOR_PENTHOUSE.bg',
] as const;

const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function assetUrl(baseUrl: string, file: string): string {
  if (ABSOLUTE_URL.test(file)) return file;
  const base = baseUrl.replace(/\/+$/, '');
  const relative = file.replace(/^\/+/, '');
  return base ? `${base}/${relative}` : relative;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isManifest(value: unknown): value is SpriteManifest {
  return isRecord(value);
}

function frameFromEntry(entry: SpriteManifestEntry): SpriteManifestFrame | null {
  if ('placeholder' in entry && entry.placeholder) return null;
  const frame = (entry as SpriteManifestAsset).frame;
  if (!isRecord(frame)) return null;
  const { x, y, w, h } = frame;
  if (![x, y, w, h].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  if (x < 0 || y < 0 || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function fileFromEntry(entry: SpriteManifestAsset): string | null {
  if (typeof entry.file === 'string' && entry.file.length > 0) return entry.file;
  if (typeof entry.url === 'string' && entry.url.length > 0) return entry.url;
  return null;
}

/**
 * Build a C-6 SpriteResolver from a T-040 asset manifest. Placeholder entries
 * and unknown keys return null, so the animation package draws its own vector
 * placeholders. Real entries resolve to their atlas frame in natural pixels.
 */
export function createSpriteResolver(
  manifest: SpriteManifest | null | undefined,
  baseUrl: string = DEFAULT_ATLAS_BASE_URL,
): SpriteResolver {
  const entries = manifest ?? {};
  return (logicalKey: string): SpriteFrame | null => {
    if (typeof logicalKey !== 'string') return null;
    const entry = entries[logicalKey];
    if (!entry) return null;
    const frame = frameFromEntry(entry);
    if (!frame) return null;
    const file = fileFromEntry(entry as SpriteManifestAsset);
    if (!file) return null;
    return { url: assetUrl(baseUrl, file), x: frame.x, y: frame.y, w: frame.w, h: frame.h };
  };
}

export interface LoadSpriteManifestOptions {
  manifestUrl?: string;
  fetch?: typeof fetch;
}

/** Fetch and parse asset-manifest.json; return null when it is unavailable. */
export async function loadSpriteManifest(
  options: LoadSpriteManifestOptions = {},
): Promise<SpriteManifest | null> {
  const manifestUrl = options.manifestUrl ?? DEFAULT_ASSET_MANIFEST_URL;
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== 'function') return null;
  try {
    const response = await fetcher(manifestUrl, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const parsed: unknown = await response.json();
    return isManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface LoadSpriteResolverOptions extends LoadSpriteManifestOptions {
  baseUrl?: string;
}

/**
 * Load the T-040 manifest once and return a resolver. A missing or malformed
 * manifest degrades to the animation package's vector placeholders.
 */
export async function loadSpriteResolver(
  options: LoadSpriteResolverOptions = {},
): Promise<SpriteResolver> {
  const baseUrl = options.baseUrl ?? DEFAULT_ATLAS_BASE_URL;
  const manifest = await loadSpriteManifest(options);
  return createSpriteResolver(manifest, baseUrl);
}

/** Keys from the animation package that the manifest still lacks real frames for. */
export function missingAnimSpriteKeys(manifest: SpriteManifest | null | undefined): string[] {
  const resolver = createSpriteResolver(manifest);
  return ANIM_SPRITE_KEYS.filter((key) => resolver(key) === null);
}

export const spriteResolverFromManifest = createSpriteResolver;
export const createManifestSpriteResolver = createSpriteResolver;

export default createSpriteResolver;
