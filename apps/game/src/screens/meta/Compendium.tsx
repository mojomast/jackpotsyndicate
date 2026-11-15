/** @jsxRuntime automatic */
import { useState } from 'react';
import {
  STORAGE_KEYS,
  type BossDef,
  type ItemCategory,
  type ItemDef,
} from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import {
  BOSS_SABOTAGE,
  ITEM_CATEGORIES,
  META_FLOORS,
  bossCatalogue,
  categoryCounts,
  floorFriction,
  floorGutterRisk,
  floorName,
  floorSpriteKey,
  formatCash,
  formatPercent,
  itemsByCategory,
} from './metaContent';
import { MetaScreen } from './MetaScreen';
import { MetaBezel, SpriteImage } from '../../components/Artwork';
import { navigateTo, type MetaNavigate } from './navigation';

export interface CompendiumScreenProps {
  onNavigate?: MetaNavigate;
}

function readDiscovered(): Set<string> {
  const discovered = new Set<string>();
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEYS.compendium);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const id of parsed) if (typeof id === 'string') discovered.add(id);
      } else if (parsed && typeof parsed === 'object') {
        for (const key of Object.keys(parsed as Record<string, unknown>)) discovered.add(key);
      }
    }
  } catch {
    // A corrupt discovery file is ignored; the run state still seeds the set.
  }
  for (const id of useGameStore.getState().state.trinkets) discovered.add(id);
  for (const id of useGameStore.getState().state.ownedCoins) discovered.add(id);
  return discovered;
}

function itemStatus(item: ItemDef, discovered: Set<string>): string {
  return discovered.has(item.id) ? 'Discovered' : 'Undiscovered';
}

export function CompendiumScreen({ onNavigate }: CompendiumScreenProps) {
  const state = useGameStore((store) => store.state);
  const [category, setCategory] = useState<ItemCategory | 'ALL'>('ALL');
  const discovered = readDiscovered();
  const counts = categoryCounts();

  const categories: (ItemCategory | 'ALL')[] = ['ALL', ...ITEM_CATEGORIES];
  const items = category === 'ALL'
    ? ITEM_CATEGORIES.flatMap((entry) => itemsByCategory(entry))
    : itemsByCategory(category);

  return (
    <MetaScreen
      eyebrow="Reference shelf"
      title="Compendium"
      description="Every trinket, drink, coin, glyph and chassis the run can roll, plus floor dossiers and boss sabotage."
      testId="compendium"
    >
      <MetaBezel />
      <div className="compendium-summary panel">
        <div>
          <span className="eyebrow">Run seed</span>
          <strong>{state.seed}</strong>
        </div>
        <div>
          <span className="eyebrow">Discovered</span>
          <strong>{discovered.size}</strong>
        </div>
        <div>
          <span className="eyebrow">Catalogue</span>
          <strong>{ITEM_CATEGORIES.reduce((total, key) => total + counts[key], 0)} items</strong>
        </div>
      </div>

      <div className="compendium-tabs" role="group" aria-label="Compendium category">
        {categories.map((entry) => (
          <button
            key={entry}
            type="button"
            className="btn"
            aria-pressed={category === entry}
            onClick={() => setCategory(entry)}
          >
            {entry === 'ALL'
              ? `All ${ITEM_CATEGORIES.reduce((total, key) => total + counts[key], 0)}`
              : `${entry} ${counts[entry]}`}
          </button>
        ))}
      </div>

      <div className="compendium-grid">
        {items.map((item) => (
          <article
            className={`compendium-card panel ${discovered.has(item.id) ? 'is-discovered' : ''}`}
            key={item.id}
            data-testid={`compendium-item-${item.id}`}
          >
            <div className="compendium-card-head">
              <span className="eyebrow">{item.category} · {item.rarity}</span>
              <span className="compendium-status">{itemStatus(item, discovered)}</span>
            </div>
            <div className="compendium-art-row">
              <SpriteImage
                spriteKey={item.spriteKey}
                className="sprite-icon compendium-art"
                fallback={item.category.slice(0, 2)}
              />
            </div>
            <h2>{item.name}</h2>
            <p>{item.desc}</p>
            <span className="compendium-price">
              {item.price === 0 ? 'Starter' : formatCash(item.price)}
              {item.category === 'REEL' ? ` · +${item.bonusTokens} bonus tokens` : ''}
            </span>
          </article>
        ))}
      </div>

      <h2 className="compendium-heading">Floor dossiers</h2>
      <div className="compendium-grid">
        {META_FLOORS.map((floor) => (
          <article className="compendium-card panel" key={floor.id}>
            <SpriteImage
              spriteKey={floorSpriteKey(floor.id)}
              className="floor-card-art"
            />
            <span className="eyebrow">
              Floor {floor.order} · quota ×{floor.quotaScale}
            </span>
            <h2>{floorName(floor.id)}</h2>
            <p>
              Friction {formatPercent(floorFriction(floor.id))}, gutter risk{' '}
              {floorGutterRisk(floor.id).toFixed(2)}, lip ×{floor.lipMult}.
            </p>
            <span className="compendium-price">
              {floor.next.length === 0
                ? 'Final floor'
                : `Elevator → ${floor.next.map((id) => floorName(id)).join(' or ')}`}
            </span>
          </article>
        ))}
      </div>

      <h2 className="compendium-heading">Boss dossiers</h2>
      <div className="compendium-grid">
        {bossCatalogue().map((boss: BossDef) => (
          <article className="compendium-card panel boss-dossier" key={boss.id}>
            <SpriteImage spriteKey={boss.spriteKey} className="boss-portrait" decorative={false} alt={boss.name} />
            <span className="eyebrow">{boss.tagline}</span>
            <h2>{boss.name}</h2>
            <p>{BOSS_SABOTAGE[boss.id]}</p>
          </article>
        ))}
      </div>

      <div className="stub-actions">
        <button type="button" className="btn" onClick={() => navigateTo('table', onNavigate)}>
          Back to table
        </button>
        <button type="button" className="btn btn-cyan" onClick={() => navigateTo('title', onNavigate)}>
          Title
        </button>
      </div>
    </MetaScreen>
  );
}

export const Compendium = CompendiumScreen;
export const CompendiumStub = CompendiumScreen;

export default CompendiumScreen;
