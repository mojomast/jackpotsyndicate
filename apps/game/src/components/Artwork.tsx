/** @jsxRuntime automatic */
import type { CSSProperties, ReactNode } from 'react';
import assetManifest from '../../public/atlas/asset-manifest.json';
import {
  spriteAssetFromManifest,
  type SpriteAsset,
  type SpriteManifest,
} from '../store/spriteResolver';

const MANIFEST = assetManifest as SpriteManifest;

export function spriteAsset(spriteKey: string | null | undefined): SpriteAsset | null {
  return spriteKey ? spriteAssetFromManifest(MANIFEST, spriteKey) : null;
}

function artBackground(spriteKey: string, shade = 0.72): CSSProperties | undefined {
  const asset = spriteAsset(spriteKey);
  if (!asset) return undefined;
  return {
    backgroundImage: `linear-gradient(180deg, rgba(7, 9, 14, ${shade}), rgba(7, 9, 14, ${Math.min(0.96, shade + 0.12)})), url("${asset.url}")`,
    backgroundSize: '100% 100%, 100% 100%',
    backgroundPosition: 'center, center',
    backgroundRepeat: 'no-repeat, no-repeat',
  };
}

/** Subtle generated-panel skin for table HUD and side panels. */
export function uiPanelStyle(): CSSProperties | undefined {
  return artBackground('ui.panel', 0.68);
}

/** Generated button skin for the primary spin control. */
export function uiButtonStyle(): CSSProperties | undefined {
  return artBackground('ui.button', 0.48);
}

/** Expose reusable UI-art URLs to CSS for primary buttons. */
export function installUiArtVariables(): void {
  if (typeof document === 'undefined') return;
  const button = spriteAsset('ui.button');
  if (button) document.documentElement.style.setProperty('--ui-button-art', `url("${button.url}")`);
}


export interface SpriteImageProps {
  spriteKey: string | null | undefined;
  className?: string;
  /** Decorative art should not add noise to the accessibility tree. */
  decorative?: boolean;
  alt?: string;
  fallback?: ReactNode;
  style?: CSSProperties;
}

/**
 * Render a full manifest image (not a packed atlas frame). Missing and
 * placeholder keys render nothing, leaving the surrounding card readable.
 */
export function SpriteImage({
  spriteKey,
  className,
  decorative = true,
  alt = '',
  fallback,
  style,
}: SpriteImageProps) {
  const asset = spriteAsset(spriteKey);
  if (!asset) {
    return fallback ? (
      <span className={`sprite-fallback ${className ?? ''}`.trim()} aria-hidden="true">
        {fallback}
      </span>
    ) : null;
  }
  return (
    <img
      className={className}
      src={asset.url}
      alt={decorative ? '' : alt}
      aria-hidden={decorative ? 'true' : undefined}
      decoding="async"
      draggable={false}
      style={style}
    />
  );
}

export interface FloorBannerProps {
  floorId: string;
  floorName: string;
  eyebrow?: string;
}

/** A compact floor establishing shot used by the shop and floor dossiers. */
export function FloorBanner({ floorId, floorName, eyebrow = 'Current floor' }: FloorBannerProps) {
  return (
    <figure className="floor-banner" aria-label={`${floorName} floor artwork`}>
      <SpriteImage
        spriteKey={`floor.${floorId}.bg`}
        className="floor-banner-art"
        decorative={false}
        alt={`${floorName} floor`}
      />
      <figcaption className="floor-banner-caption">
        <span className="eyebrow">{eyebrow}</span>
        <strong>{floorName}</strong>
      </figcaption>
    </figure>
  );
}

/** Decorative vendor/section trim made from the generated UI bezel. */
export function MetaBezel() {
  return (
    <div className="meta-bezel" aria-hidden="true">
      <SpriteImage spriteKey="ui.bezel" className="meta-bezel-art" />
    </div>
  );
}
