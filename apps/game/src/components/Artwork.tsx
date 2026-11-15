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
