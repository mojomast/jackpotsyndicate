/** @jsxRuntime automatic */
import { useState } from 'react';
import {
  TEST_IDS,
  type CommandError,
  type RunState,
  type ShopOffer,
} from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { dispatchMeta } from './commands';
import {
  chassisKind,
  findItem,
  floorName,
  formatCash,
  itemName,
  itemSpriteKey,
  maxShopCapacity,
  offerDescription,
  shopArchetypeLabel,
} from './metaContent';
import { SpriteImage } from '../../components/Artwork';
import { MetaNotice, MetaScreen } from './MetaScreen';
import { JumperPicker, ReelTargetPicker, RelicPicker } from './Pickers';
import { useMetaAutosave } from './persistence';
import { navigateTo, routeForPhase, type MetaNavigate } from './navigation';
import { CATEGORY_LABEL, RARITY_LABEL, StatTile, rarityClass } from './ui';

export interface ShopScreenProps {
  onNavigate?: MetaNavigate;
}

function errorCopy(error: CommandError): string {
  switch (error) {
    case 'INSUFFICIENT_FUNDS':
      return 'Not enough bankroll for that purchase.';
    case 'AT_LIMIT':
      return 'That purchase would exceed a run limit.';
    case 'INVALID_TARGET':
      return 'That target is not legal for this item.';
    case 'UNKNOWN_ID':
      return 'That shelf slot is no longer available.';
    case 'NOT_OWNED':
      return 'You do not own that item.';
    case 'ORBS_IN_FLIGHT':
      return 'Wait for the shelf to settle first.';
    case 'WRONG_PHASE':
    default:
      return 'That action is not allowed in the current phase.';
  }
}

/** Shown only when a dev jumps to the shop outside the SHOP phase. */
const PREVIEW_OFFERS: ShopOffer[] = [
  { offerId: 'preview-trinket', itemId: 'turboDozerCam', category: 'TRINKET', price: 200, sold: false },
  { offerId: 'preview-drink', itemId: 'dirtySyndicateMartini', category: 'DRINK', price: 110, sold: false },
  { offerId: 'preview-coin', itemId: 'heavyLeadSlug', category: 'COIN', price: 150, sold: false },
  { offerId: 'preview-reel', itemId: 'bloodDiamondGlyph', category: 'REEL', price: 220, sold: false },
  { offerId: 'preview-chassis', itemId: 'hyperHarness', category: 'CHASSIS', price: 300, sold: false },
];

/** Build keywords read from item text; shared keywords are synergy hints. */
const KEYWORDS: { tag: string; pattern: RegExp }[] = [
  { tag: 'Lip', pattern: /\blip\b/i },
  { tag: 'Dozer', pattern: /dozer/i },
  { tag: 'Gutter', pattern: /gutter/i },
  { tag: 'Pegs', pattern: /\bpegs?\b/i },
  { tag: 'Orbs', pattern: /\borbs?\b/i },
  { tag: 'Tokens', pattern: /\btokens?\b/i },
  { tag: 'Chips', pattern: /\bchips\b/i },
  { tag: 'X-Mult', pattern: /\d\s?X\b|\bX\b/ },
];

function itemTags(itemId: string): string[] {
  const item = findItem(itemId);
  if (!item) return [];
  return KEYWORDS.filter(({ pattern }) => pattern.test(item.desc)).map(({ tag }) => tag);
}

function synergyHint(offer: ShopOffer, state: RunState): string | null {
  const item = findItem(offer.itemId);
  if (!item) return null;
  switch (item.category) {
    case 'TRINKET': {
      const owned = state.trinkets.filter((id) => id === offer.itemId).length;
      if (owned > 0) return `Stacks · you own ${owned}`;
      const tags = itemTags(offer.itemId);
      let best: { tag: string; count: number } | null = null;
      for (const tag of tags) {
        const count = state.trinkets.filter((id) => itemTags(id).includes(tag)).length;
        if (count > 0 && (best === null || count > best.count)) best = { tag, count };
      }
      return best ? `Synergy · ${best.tag} build ×${best.count}` : null;
    }
    case 'REEL': {
      const stops = state.grid.strips.reduce(
        (total, strip) => total + strip.filter((symbol) => symbol === item.symbolId).length,
        0,
      );
      return `Adds a ${item.symbolId} stop · ${stops} on your reels`;
    }
    case 'DRINK': {
      const free = state.drinkTray.filter((slot) => slot === null).length;
      return free === 0 ? 'Drink tray full' : `Tray · ${free} of ${state.drinkTray.length} free`;
    }
    case 'COIN':
      return state.ownedCoins.includes(offer.itemId)
        ? 'Already in your coin purse'
        : `Coin purse · ${state.ownedCoins.length} owned`;
    case 'CHASSIS': {
      const { cols, rows, wiring } = state.grid;
      switch (item.kind) {
        case 'ADD_COLUMN':
          return `Grid ${cols}×${rows} → ${cols + 1}×${rows}`;
        case 'ADD_ROW':
          return `Grid ${cols}×${rows} → ${cols}×${rows + 1}`;
        case 'HARNESS_HYPER':
          return `Wiring ${wiring} → HYPER`;
        case 'HARNESS_WAYS':
          return `Wiring ${wiring} → WAYS`;
        case 'HARNESS_CLUSTER':
          return `Wiring ${wiring} → CLUSTER`;
        case 'JUMPER':
          return `+1 payline · ${state.jumpers.length} jumper${state.jumpers.length === 1 ? '' : 's'} wired`;
        case 'OVERVOLT':
          return 'Overvolt one payline each spin';
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

function actionCopy(offer: ShopOffer, affordable: boolean, inShop: boolean): string {
  if (offer.sold) return 'Sold';
  if (!inShop) return 'Preview';
  if (!affordable) return 'Too rich';
  if (offer.category === 'REEL') return 'Buy · pick reel';
  if (chassisKind(offer.itemId) === 'JUMPER') return 'Buy · pick path';
  return 'Buy';
}

function MachineStrip({ state }: { state: RunState }) {
  return (
    <section className="machine-strip panel" aria-labelledby="shop-machine-heading">
      <h2 className="strip-title" id="shop-machine-heading">Your machine</h2>
      <div className="machine-strip-body">
        <div className="machine-group">
          <span className="stat-label">Grid</span>
          <strong className="machine-value">
            {state.grid.cols}×{state.grid.rows} <small>{state.grid.wiring}</small>
          </strong>
        </div>
        <div className="machine-group machine-trinkets">
          <span className="stat-label">Trinkets · {state.trinkets.length}</span>
          <span className="machine-icons">
            {state.trinkets.length === 0 ? <span className="machine-empty">None yet</span> : null}
            {state.trinkets.slice(0, 12).map((id, index) => (
              <span className="machine-icon" key={`${id}-${index}`} title={itemName(id)}>
                <SpriteImage spriteKey={itemSpriteKey(id)} className="machine-icon-art" fallback={itemName(id).slice(0, 2)} />
                <span className="sr-only">{itemName(id)}</span>
              </span>
            ))}
            {state.trinkets.length > 12 ? <span className="machine-more">+{state.trinkets.length - 12}</span> : null}
          </span>
        </div>
        <div className="machine-group">
          <span className="stat-label">Drink tray</span>
          <span className="machine-icons">
            {state.drinkTray.map((drink, index) => (
              <span className={`machine-slot${drink ? ' is-filled' : ''}`} key={index} title={drink ? itemName(drink) : 'Empty slot'}>
                {drink ? (
                  <SpriteImage spriteKey={itemSpriteKey(drink)} className="machine-icon-art" fallback="DR" />
                ) : null}
                <span className="sr-only">{drink ? itemName(drink) : 'Empty slot'}</span>
              </span>
            ))}
          </span>
        </div>
        <div className="machine-group">
          <span className="stat-label">Loaded coin</span>
          <strong className="machine-value">{itemName(state.loadedCoin)}</strong>
        </div>
      </div>
    </section>
  );
}

export function ShopScreen({ onNavigate }: ShopScreenProps) {
  useMetaAutosave();
  const state = useGameStore((store) => store.state);
  const [picker, setPicker] = useState<ShopOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.phase === 'JUMPER_PICK') {
    return <JumperPicker onNavigate={onNavigate} />;
  }
  if (state.phase === 'RELIC_PICK') {
    return <RelicPicker onNavigate={onNavigate} />;
  }

  const inShop = state.phase === 'SHOP';
  const offers = state.shop.offers.length > 0
    ? state.shop.offers
    : inShop
      ? []
      : PREVIEW_OFFERS;
  const capacityFull = state.shop.capacity >= maxShopCapacity();
  const canReroll = inShop && state.bankroll >= state.shop.rerollCost && !busy;
  const canExpand = inShop && !capacityFull && state.bankroll >= state.shop.expandCost && !busy;

  const buy = (offer: ShopOffer, target?: { reel?: number }) => {
    setError(null);
    setBusy(true);
    try {
      const result = target
        ? dispatchMeta({ c: 'ShopBuy', offerId: offer.offerId, target })
        : dispatchMeta({ c: 'ShopBuy', offerId: offer.offerId });
      if (!result.ok) {
        setError(errorCopy(result.error));
        return;
      }
      setPicker(null);
    } finally {
      setBusy(false);
    }
  };

  const selectOffer = (offer: ShopOffer) => {
    setError(null);
    if (offer.category === 'REEL') {
      setPicker(offer);
      return;
    }
    buy(offer);
  };

  const reroll = () => {
    setError(null);
    const result = dispatchMeta({ c: 'ShopReroll' });
    if (!result.ok) setError(errorCopy(result.error));
  };

  const expand = () => {
    setError(null);
    const result = dispatchMeta({ c: 'ShopExpand' });
    if (!result.ok) setError(errorCopy(result.error));
  };

  const leave = () => {
    setError(null);
    const result = dispatchMeta({ c: 'ShopLeave' });
    if (!result.ok) {
      setError(errorCopy(result.error));
      return;
    }
    navigateTo(routeForPhase(useGameStore.getState().state.phase), onNavigate);
  };

  const leaveLabel = state.round >= 4 ? 'Face the boss' : 'Leave shop';

  return (
    <MetaScreen
      eyebrow={`Vendor · ${floorName(state.floorId)}`}
      title="The Shop"
      description="Spend what the round left behind. Every purchase changes the next spin."
      testId="shop"
      className="shop-screen"
      aside={
        <StatTile
          label="Bankroll"
          value={formatCash(state.bankroll)}
          tone="gold"
          size="lg"
          testId="shop-bankroll"
        />
      }
    >
      <div className="vendor-bar" role="group" aria-label="Vendor controls">
        <div className="vendor-facts">
          <div className="vendor-fact">
            <span className="stat-label">Vendor</span>
            <strong>
              <span data-testid="shop-archetype">{shopArchetypeLabel(state.shop.archetype)}</span>
            </strong>
          </div>
          <div className="vendor-fact">
            <span className="stat-label">Shelf</span>
            <strong data-testid="shop-capacity">
              {offers.length} / {state.shop.capacity}
            </strong>
          </div>
        </div>
        <div className="vendor-actions">
          <button
            type="button"
            className="btn btn-secondary"
            data-testid={TEST_IDS.shopReroll}
            onClick={reroll}
            disabled={!canReroll}
          >
            <span className="btn-glyph glyph-reroll" aria-hidden="true" />
            Reroll <span className="btn-price">{formatCash(state.shop.rerollCost)}</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            data-testid={TEST_IDS.shopExpand}
            onClick={expand}
            disabled={!canExpand}
          >
            <span className="btn-glyph glyph-expand" aria-hidden="true" />
            {capacityFull ? 'Shelf at max' : (
              <>
                Expand shelf <span className="btn-price">{formatCash(state.shop.expandCost)}</span>
              </>
            )}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-leave"
            data-testid={TEST_IDS.shopLeave}
            onClick={leave}
            disabled={!inShop || busy}
          >
            {leaveLabel}
            <span className="btn-arrow" aria-hidden="true" />
          </button>
        </div>
      </div>

      {error ? <MetaNotice tone="error" testId="shop-error">{error}</MetaNotice> : null}
      {!inShop ? (
        <MetaNotice tone="info" testId="shop-closed">
          The vendor is closed. A shelf is rolled after a passed round; these cards are a preview.
        </MetaNotice>
      ) : null}
      {inShop && offers.length === 0 ? (
        <MetaNotice tone="info">The shelf is empty. Reroll, or leave and spin the next round.</MetaNotice>
      ) : null}

      <div className="offer-grid" role="group" aria-label="Shop offers">
        {offers.map((offer, index) => {
          const item = findItem(offer.itemId);
          const rarity = item?.rarity ?? 'common';
          const affordable = state.bankroll >= offer.price;
          const disabled = !inShop || offer.sold || !affordable || busy;
          const hint = synergyHint(offer, state);
          const tags = itemTags(offer.itemId);
          const status = offer.sold ? 'sold' : affordable ? 'ready' : 'short';
          const effectId = `offer-effect-${index}`;
          const name = itemName(offer.itemId);
          return (
            <button
              key={offer.offerId}
              type="button"
              className={`offer-card ${rarityClass(rarity)}`}
              data-testid={TEST_IDS.shopOffer(index)}
              data-category={offer.category}
              data-offer-id={offer.offerId}
              data-status={status}
              onClick={() => selectOffer(offer)}
              disabled={disabled}
              aria-label={`${name}, ${CATEGORY_LABEL[offer.category]}, ${formatCash(offer.price)}${offer.sold ? ', sold' : !affordable ? `, need ${formatCash(offer.price - state.bankroll)} more` : ''}`}
              aria-describedby={effectId}
              style={{ ['--deal-index' as string]: index }}
            >
              <span className="offer-top">
                <span className="offer-category">{CATEGORY_LABEL[offer.category]}</span>
                <span className="offer-rarity">{RARITY_LABEL[rarity] ?? rarity}</span>
              </span>
              <span className="offer-art">
                <SpriteImage
                  spriteKey={itemSpriteKey(offer.itemId)}
                  className="sprite-icon offer-art-image"
                  fallback={offer.category.slice(0, 2)}
                />
              </span>
              <span className="offer-copy">
                <span className="offer-name">{name}</span>
                <span className="offer-effect" id={effectId}>{offerDescription(offer)}</span>
              </span>
              {tags.length > 0 || hint ? (
                <span className="offer-meta">
                  {tags.slice(0, 3).map((tag) => (
                    <span className="offer-tag" key={tag}>{tag}</span>
                  ))}
                  {hint ? <span className="offer-hint">{hint}</span> : null}
                </span>
              ) : null}
              <span className="offer-foot">
                <span className="offer-price">{formatCash(offer.price)}</span>
                <span className="offer-action">
                  {!offer.sold && inShop && !affordable
                    ? `Need ${formatCash(offer.price - state.bankroll)}`
                    : actionCopy(offer, affordable, inShop)}
                </span>
              </span>
              {offer.sold ? <span className="offer-sold-stamp" aria-hidden="true">Sold</span> : null}
            </button>
          );
        })}
      </div>

      {picker ? (
        <ReelTargetPicker
          offer={picker}
          cols={state.grid.cols}
          busy={busy}
          onChoose={(reel) => buy(picker, { reel })}
          onCancel={() => setPicker(null)}
        />
      ) : null}

      <MachineStrip state={state} />

      <p className="meta-hint">
        The vendor only stocks items your machine can use. Rerolls get pricier with each use
        for the rest of the floor; expanding adds a slot and stocks it at once (cap {maxShopCapacity()}).
      </p>
    </MetaScreen>
  );
}

export const Shop = ShopScreen;
export const ShopStub = ShopScreen;
export default ShopScreen;
