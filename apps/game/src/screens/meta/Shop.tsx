/** @jsxRuntime automatic */
import { useState } from 'react';
import {
  TEST_IDS,
  type CommandError,
  type ShopOffer,
} from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { dispatchMeta } from './commands';
import {
  chassisKind,
  floorName,
  formatCash,
  itemName,
  itemSpriteKey,
  maxShopCapacity,
  offerDescription,
  shopArchetypeLabel,
} from './metaContent';
import { FloorBanner, MetaBezel, SpriteImage } from '../../components/Artwork';
import { MetaNotice, MetaScreen } from './MetaScreen';
import { JumperPicker, ReelTargetPicker, RelicPicker } from './Pickers';
import { useMetaAutosave } from './persistence';
import { navigateTo, routeForPhase, type MetaNavigate } from './navigation';

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

const PREVIEW_OFFERS: ShopOffer[] = [
  { offerId: 'preview-trinket', itemId: 'turboDozerCam', category: 'TRINKET', price: 200, sold: false },
  { offerId: 'preview-drink', itemId: 'dirtySyndicateMartini', category: 'DRINK', price: 110, sold: false },
  { offerId: 'preview-coin', itemId: 'heavyLeadSlug', category: 'COIN', price: 150, sold: false },
  { offerId: 'preview-reel', itemId: 'bloodDiamondGlyph', category: 'REEL', price: 220, sold: false },
  { offerId: 'preview-chassis', itemId: 'hyperHarness', category: 'CHASSIS', price: 300, sold: false },
];

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

  return (
    <MetaScreen
      eyebrow="Vendor shelf"
      title="Shop"
      description="Spend what the round left behind. Trinkets mount on the cabinet bezel; glyphs need a target reel; jumpers need a target path."
      testId="shop"
    >
      <FloorBanner floorId={state.floorId} floorName={floorName(state.floorId)} eyebrow="Vendor floor" />
      <MetaBezel />
      <div className="shop-summary panel">
        <div>
          <span className="eyebrow">Vendor archetype</span>
          <strong data-testid="shop-archetype">{shopArchetypeLabel(state.shop.archetype)}</strong>
        </div>
        <div>
          <span className="eyebrow">Bankroll</span>
          <strong data-testid="shop-bankroll">{formatCash(state.bankroll)}</strong>
        </div>
        <div>
          <span className="eyebrow">Shelf</span>
          <strong data-testid="shop-capacity">
            {offers.length} / {state.shop.capacity}
          </strong>
        </div>
        <div>
          <span className="eyebrow">Phase</span>
          <strong>{inShop ? 'Open' : state.phase.replaceAll('_', ' ')}</strong>
        </div>
      </div>

      {error ? <MetaNotice tone="error" testId="shop-error">{error}</MetaNotice> : null}
      {!inShop ? (
        <MetaNotice tone="info" testId="shop-closed">
          The vendor is closed. A shelf is rolled after a passed round.
        </MetaNotice>
      ) : null}
      {inShop && offers.length === 0 ? (
        <MetaNotice tone="info">The shelf is empty. Leave and spin the next round.</MetaNotice>
      ) : null}

      <div className="offer-grid" role="group" aria-label="Shop offers">
        {offers.map((offer, index) => {
          const affordable = state.bankroll >= offer.price;
          const kind = chassisKind(offer.itemId);
          const disabled = !inShop || offer.sold || !affordable || busy;
          return (
            <button
              key={offer.offerId}
              type="button"
              className="offer-card"
              data-testid={TEST_IDS.shopOffer(index)}
              data-category={offer.category}
              data-offer-id={offer.offerId}
              onClick={() => selectOffer(offer)}
              disabled={disabled}
              title={offerDescription(offer)}
            >
              <span className="offer-art">
                <SpriteImage
                  spriteKey={itemSpriteKey(offer.itemId)}
                  className="sprite-icon offer-art-image"
                  fallback={offer.category.slice(0, 2)}
                />
              </span>
              <span className="offer-copy">
                <span className="offer-name">{itemName(offer.itemId)}</span>
                <span className="offer-meta">
                  {offer.category}
                  {kind === 'JUMPER' ? ' · path picker' : ''}
                  {offer.category === 'REEL' ? ' · reel picker' : ''}
                  {offer.sold ? ' · sold' : ''}
                </span>
                <span className="offer-price">{formatCash(offer.price)}</span>
                <span className="offer-effect">{offerDescription(offer)}</span>
              </span>
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

      <div className="stub-actions">
        <button
          type="button"
          className="btn"
          data-testid={TEST_IDS.shopReroll}
          onClick={reroll}
          disabled={!inShop || state.bankroll < state.shop.rerollCost || busy}
        >
          Reroll · {formatCash(state.shop.rerollCost)}
        </button>
        <button
          type="button"
          className="btn"
          data-testid={TEST_IDS.shopExpand}
          onClick={expand}
          disabled={!inShop || capacityFull || state.bankroll < state.shop.expandCost || busy}
        >
          {capacityFull ? 'Shelf at max' : `Expand · ${formatCash(state.shop.expandCost)}`}
        </button>
        <button
          type="button"
          className="btn btn-cyan"
          data-testid={TEST_IDS.shopLeave}
          onClick={leave}
          disabled={!inShop || busy}
        >
          Leave shop
        </button>
      </div>

      <p className="meta-hint">
        Shelf capacity starts at four and caps at ten. Reroll and expand prices
        rise with each use and reset when the floor changes.
      </p>
    </MetaScreen>
  );
}

export const Shop = ShopScreen;
export const ShopStub = ShopScreen;
export default ShopScreen;
