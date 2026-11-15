/** @jsxRuntime automatic */
import { useState } from 'react';
import type { BossDef, ItemCategory, ItemDef } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { idsSeenIn, readDiscovered } from '../../store/discovery';
import {
  BOSS_SABOTAGE,
  ITEM_CATEGORIES,
  META_FLOORS,
  bossCatalogue,
  bossForFloor,
  catalogue,
  floorFriction,
  floorGutterRisk,
  floorName,
  floorSpriteKey,
  formatCash,
  formatPercent,
  itemsByCategory,
} from './metaContent';
import { MetaScreen } from './MetaScreen';
import { SpriteImage } from '../../components/Artwork';
import { navigateTo, type MetaNavigate } from './navigation';
import { CATEGORY_LABEL, RARITY_LABEL, rarityClass } from './ui';

export interface CompendiumScreenProps {
  onNavigate?: MetaNavigate;
  onBack?: () => void;
}

type Tab = ItemCategory | 'ALL' | 'FLOORS' | 'BOSSES';

/** Read once per visit: discoveries do not change while the ledger is open. */
function useDiscovered(): Set<string> {
  const [found] = useState(() => {
    const ids = readDiscovered();
    for (const id of idsSeenIn(useGameStore.getState().state)) ids.add(id);
    return ids;
  });
  return found;
}

function ItemCard({ item, discovered, index }: { item: ItemDef; discovered: boolean; index: number }) {
  return (
    <article
      className={`codex-card ${rarityClass(item.rarity)}${discovered ? ' is-discovered' : ' is-hidden'}`}
      data-testid={`compendium-item-${item.id}`}
      style={{ ['--deal-index' as string]: Math.min(index, 12) }}
    >
      <div className="codex-card-top">
        <span className="offer-category">{CATEGORY_LABEL[item.category]}</span>
        <span className="offer-rarity">{RARITY_LABEL[item.rarity] ?? item.rarity}</span>
      </div>
      <div className="codex-art">
        <SpriteImage
          spriteKey={item.spriteKey}
          className="sprite-icon compendium-art"
          fallback={item.category.slice(0, 2)}
        />
      </div>
      <h3 className="codex-name">{discovered ? item.name : 'Undiscovered'}</h3>
      <p className="codex-desc">
        {discovered ? item.desc : `Turns up on ${CATEGORY_LABEL[item.category].toLowerCase()} shelves. Spot it on a vendor shelf to reveal it.`}
      </p>
      <span className="codex-foot">
        {discovered ? (item.price === 0 ? 'Starter' : formatCash(item.price)) : '???'}
        {discovered && item.category === 'REEL' ? ` · +${item.bonusTokens} bonus tokens` : ''}
      </span>
    </article>
  );
}

export function CompendiumScreen({ onNavigate, onBack }: CompendiumScreenProps) {
  const [tab, setTab] = useState<Tab>('ALL');
  const discovered = useDiscovered();
  const items = catalogue();
  const found = items.filter((item) => discovered.has(item.id)).length;
  const progress = items.length === 0 ? 0 : Math.round((found / items.length) * 100);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'ALL', label: 'All', count: items.length },
    ...ITEM_CATEGORIES.map((category) => ({
      id: category as Tab,
      label: `${CATEGORY_LABEL[category]}s`,
      count: itemsByCategory(category).length,
    })),
    { id: 'FLOORS', label: 'Floors', count: META_FLOORS.length },
    { id: 'BOSSES', label: 'Bosses', count: bossCatalogue().length },
  ];

  const visibleItems = tab === 'ALL'
    ? ITEM_CATEGORIES.flatMap((category) => itemsByCategory(category))
    : tab === 'FLOORS' || tab === 'BOSSES'
      ? []
      : itemsByCategory(tab);
  const showFloors = tab === 'ALL' || tab === 'FLOORS';
  const showBosses = tab === 'ALL' || tab === 'BOSSES';

  return (
    <MetaScreen
      eyebrow="The Syndicate's ledger"
      title="Compendium"
      description="Every trinket, drink, glyph, coin and chassis the vendors can roll, plus the floors and the bosses who run them."
      testId="compendium"
      className="menu-screen compendium-screen"
      lead={
        <button
          type="button"
          className="btn btn-ghost btn-back"
          onClick={onBack ?? (() => navigateTo('title', onNavigate))}
        >
          <span className="btn-back-arrow" aria-hidden="true" />
          Back
        </button>
      }
      aside={
        <div className="codex-progress">
          <span className="stat-label">Discovered</span>
          <strong className="codex-progress-value">
            {found} <small>/ {items.length}</small>
          </strong>
          <span
            className="progress-track"
            role="progressbar"
            aria-label="Compendium discovered"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span className="progress-fill" style={{ width: `${progress}%` }} />
          </span>
        </div>
      }
    >
      <div className="codex-tabs" role="group" aria-label="Compendium section">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="codex-tab"
            aria-pressed={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            <span className="codex-tab-count">{entry.count}</span>
          </button>
        ))}
      </div>

      {visibleItems.length > 0 ? (
        <>
        <h2 className="section-title">{tab === 'ALL' ? 'Vendor stock' : `${CATEGORY_LABEL[tab as ItemCategory]}s`}</h2>
        <div className="codex-grid">
          {visibleItems.map((item, index) => (
            <ItemCard key={item.id} item={item} discovered={discovered.has(item.id)} index={index} />
          ))}
        </div>
        </>
      ) : null}

      {showFloors ? (
        <>
          <h2 className="section-title">Floors</h2>
          <div className="dossier-grid">
            {META_FLOORS.map((floor) => {
              const boss = bossForFloor(floor.id);
              return (
                <article className="dossier-card floor-dossier" key={floor.id}>
                  <SpriteImage spriteKey={floorSpriteKey(floor.id)} className="floor-card-art" />
                  <div className="dossier-body">
                    <span className="stat-label">
                      Floor {floor.order} · quota ×{floor.quotaScale}
                    </span>
                    <h3>{floorName(floor.id)}</h3>
                    <p>
                      Friction {formatPercent(floorFriction(floor.id))} · gutter risk{' '}
                      {floorGutterRisk(floor.id).toFixed(2)} · lip ×{floor.lipMult}
                      {boss ? ` · boss: ${boss.name}` : ''}
                    </p>
                    <span className="dossier-foot">
                      {floor.next.length === 0
                        ? 'Top floor'
                        : `Elevator → ${floor.next.map((id) => floorName(id)).join(' or ')}`}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}

      {showBosses ? (
        <>
          <h2 className="section-title">Bosses</h2>
          <div className="dossier-grid boss-dossiers">
            {bossCatalogue().map((boss: BossDef) => (
              <article className={`dossier-card boss-dossier boss-${boss.id}`} key={boss.id}>
                <SpriteImage spriteKey={boss.spriteKey} className="boss-portrait" decorative={false} alt={boss.name} />
                <div className="dossier-body">
                  <span className="stat-label">{boss.tagline}</span>
                  <h3>{boss.name}</h3>
                  <p>{BOSS_SABOTAGE[boss.id]}</p>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </MetaScreen>
  );
}

export const Compendium = CompendiumScreen;
export const CompendiumStub = CompendiumScreen;

export default CompendiumScreen;
