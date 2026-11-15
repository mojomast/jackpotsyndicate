/** @jsxRuntime automatic */
import type { ReactNode } from 'react';
import { TEST_IDS, type FloorId } from '@jackpotsyndicate/contracts';
import { FLOOR_LABELS, formatCash, useGameStore } from '../../store/gameStore';
import { TRINKET_META } from '../../components/TrinketRail';

export type StubRoute = 'title' | 'table' | 'shop' | 'elevator' | 'boss' | 'gameover' | 'victory' | 'compendium' | 'settings';
export type StubNavigate = (route: StubRoute) => void;

export interface StubScreenProps {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
  testId?: string;
}

export function StubScreen({ eyebrow, title, description, children, testId }: StubScreenProps) {
  return (
    <section className="screen stub-screen" data-testid={testId}>
      <header className="screen-header">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="screen-title">{title}</h1>
        <p className="screen-description">{description}</p>
      </header>
      {children}
    </section>
  );
}

const DEMO_OFFERS = [
  { offerId: 'stub-offer-1', itemId: 'turbo-dozer-cam', price: 200, category: 'TRINKET' },
  { offerId: 'stub-offer-2', itemId: 'hydraulic-dozer-piston', price: 240, category: 'TRINKET' },
  { offerId: 'stub-offer-3', itemId: 'ouroboros-capacitor', price: 280, category: 'TRINKET' },
  { offerId: 'stub-offer-4', itemId: 'vip-bullion-stamp', price: 260, category: 'TRINKET' },
];

function offerName(id: string): string {
  return TRINKET_META[id]?.name ?? id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ShopStub({ onNavigate }: { onNavigate: StubNavigate }) {
  const state = useGameStore((store) => store.state);
  const dispatch = useGameStore((store) => store.dispatch);
  const inShop = state.phase === 'SHOP';
  const source = state.shop.offers.length > 0
    ? state.shop.offers
    : DEMO_OFFERS.map((offer) => ({ ...offer, sold: false }));
  const offers = Array.from({ length: 4 }, (_, index) => {
    const offer = source[index];
    if (offer) return offer;
    const fallback = DEMO_OFFERS[index]!;
    return { ...fallback, offerId: `stub-offer-${index + 1}`, sold: false };
  });

  return (
    <StubScreen
      eyebrow="Stub screen · T-073"
      title="Shop"
      description="Placeholder vendor shelf. The real shop, reroll pricing, target pickers and archetype art arrive with T-073. Every C-8 shop id is present so the shell can be exercised now."
    >
      <div className="offer-grid">
        {offers.map((offer, index) => (
          <button
            type="button"
            key={offer.offerId}
            className="offer-card"
            data-testid={TEST_IDS.shopOffer(index)}
            onClick={() => dispatch({ c: 'ShopBuy', offerId: offer.offerId })}
            disabled={!inShop || offer.sold}
          >
            <span className="offer-name">{offerName(offer.itemId)}</span>
            <span className="offer-meta">{offer.category}{offer.sold ? ' · sold' : ''}</span>
            <span className="offer-price">{formatCash(offer.price)}</span>
          </button>
        ))}
      </div>

      <div className="stub-actions">
        <button
          type="button"
          className="btn"
          data-testid={TEST_IDS.shopReroll}
          onClick={() => dispatch({ c: 'ShopReroll' })}
          disabled={!inShop}
        >
          Reroll · {formatCash(state.shop.rerollCost)}
        </button>
        <button
          type="button"
          className="btn"
          data-testid={TEST_IDS.shopExpand}
          onClick={() => dispatch({ c: 'ShopExpand' })}
          disabled={!inShop}
        >
          Expand · {formatCash(state.shop.expandCost)}
        </button>
        <button
          type="button"
          className="btn btn-cyan"
          data-testid={TEST_IDS.shopLeave}
          onClick={() => {
            dispatch({ c: 'ShopLeave' });
            onNavigate('table');
          }}
          disabled={!inShop}
        >
          Leave shop
        </button>
      </div>
    </StubScreen>
  );
}

const FLOORS: FloorId[] = ['FLOOR_NEON', 'FLOOR_CRYO', 'FLOOR_FOUNDRY', 'FLOOR_PENTHOUSE'];

export function ElevatorStub({ onNavigate }: { onNavigate: StubNavigate }) {
  const state = useGameStore((store) => store.state);
  const dispatch = useGameStore((store) => store.dispatch);
  const canChoose = state.phase === 'ELEVATOR';

  return (
    <StubScreen
      eyebrow="Stub screen · T-073"
      title="Elevator"
      description="Floor selection placeholder. The real elevator offers only legal branches after a boss win; this stub exposes every floor id for shell testing."
    >
      <div className="stub-grid">
        {FLOORS.map((floorId) => (
          <button
            type="button"
            key={floorId}
            className="stub-card"
            data-testid={TEST_IDS.elevator(floorId)}
            onClick={() => {
              dispatch({ c: 'ChooseFloor', floorId });
              onNavigate('table');
            }}
            disabled={!canChoose}
            style={{ textAlign: 'left', cursor: canChoose ? 'pointer' : 'not-allowed' }}
          >
            <h3>{FLOOR_LABELS[floorId]}</h3>
            <p>{floorId.replaceAll('_', ' ')} · {floorId === 'FLOOR_PENTHOUSE' ? 'quota ×2.2' : 'physics variant'}</p>
          </button>
        ))}
      </div>
      <p className="stub-note">Current floor: {FLOOR_LABELS[state.floorId]}.</p>
    </StubScreen>
  );
}

export function BossStub({ onNavigate }: { onNavigate: StubNavigate }) {
  const state = useGameStore((store) => store.state);
  const playerScore = state.roundCash;
  const bossScore = Math.max(1, Math.round(quotaForBoss(state.round, state.floorId)));

  return (
    <StubScreen
      eyebrow="Stub screen · T-073"
      title="Boss intro"
      description="Tug-of-war placeholder. Boss art, sabotage presentation and the real intro timeline arrive with T-073 and the animation package."
    >
      <div className="boss-bar" data-testid={TEST_IDS.bossBar}>
        <div className="boss-bar-row">
          <span>Player</span>
          <span>{formatCash(playerScore)}</span>
        </div>
        <div className="boss-track" aria-hidden="true">
          <div className="boss-fill player" />
        </div>
        <div className="boss-bar-row" style={{ marginTop: 8 }}>
          <span>Boss</span>
          <span>{formatCash(bossScore)}</span>
        </div>
        <div className="boss-track" aria-hidden="true">
          <div className="boss-fill" />
        </div>
      </div>
      <div className="stub-actions">
        <button type="button" className="btn btn-cyan" onClick={() => onNavigate('table')}>
          Back to table
        </button>
      </div>
    </StubScreen>
  );
}

function quotaForBoss(round: number, floorId: FloorId): number {
  return Math.round(1000 * Math.pow(1.9, round) * (floorId === 'FLOOR_PENTHOUSE' ? 2.2 : 1));
}

export function GameOverStub({ onNavigate }: { onNavigate: StubNavigate }) {
  const state = useGameStore((store) => store.state);
  const newRun = useGameStore((store) => store.newRun);

  return (
    <StubScreen
      eyebrow="Run summary"
      title="Game over"
      description="The quota was missed. Restart with the same seed to reproduce the run."
      testId={TEST_IDS.gameover}
    >
      <div className="stub-grid">
        <div className="stub-card">
          <h3>Seed</h3>
          <p data-testid={TEST_IDS.seedDisplay}>{state.seed}</p>
        </div>
        <div className="stub-card">
          <h3>Floor</h3>
          <p>{FLOOR_LABELS[state.floorId]} · round {state.round}</p>
        </div>
        <div className="stub-card">
          <h3>Bankroll</h3>
          <p>{formatCash(state.bankroll)}</p>
        </div>
      </div>
      <div className="stub-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            newRun(state.seed);
            onNavigate('table');
          }}
        >
          Retry seed
        </button>
        <button type="button" className="btn" onClick={() => onNavigate('title')}>
          Title
        </button>
      </div>
      <p className="stub-note">Play-money only. No purchases, ads, accounts or network calls.</p>
    </StubScreen>
  );
}

export function VictoryStub({ onNavigate }: { onNavigate: StubNavigate }) {
  const state = useGameStore((store) => store.state);

  return (
    <StubScreen
      eyebrow="Run complete"
      title="Victory"
      description="The Iron Auditor is down. The full victory scene arrives with T-073."
      testId={TEST_IDS.victory}
    >
      <div className="stub-grid">
        <div className="stub-card">
          <h3>Seed</h3>
          <p data-testid={TEST_IDS.seedDisplay}>{state.seed}</p>
        </div>
        <div className="stub-card">
          <h3>Bankroll</h3>
          <p>{formatCash(state.bankroll)}</p>
        </div>
        <div className="stub-card">
          <h3>Floors cleared</h3>
          <p>{state.floorsCleared.length} / 3</p>
        </div>
      </div>
      <div className="stub-actions">
        <button type="button" className="btn btn-primary" onClick={() => onNavigate('title')}>
          Title
        </button>
        <button type="button" className="btn" onClick={() => onNavigate('table')}>
          Back to table
        </button>
      </div>
    </StubScreen>
  );
}

export function CompendiumStub({ onNavigate }: { onNavigate: StubNavigate }) {
  const entries = Object.entries(TRINKET_META);

  return (
    <StubScreen
      eyebrow="Stub screen · T-073"
      title="Compendium"
      description="Reference shelf placeholder. Real compendium entries, boss dossiers and discovery state arrive with T-073."
    >
      <div className="stub-grid">
        {entries.map(([id, meta]) => (
          <article className="stub-card" key={id}>
            <h3>{meta.name}</h3>
            <p>{meta.effect}</p>
          </article>
        ))}
      </div>
      <div className="stub-actions">
        <button type="button" className="btn" onClick={() => onNavigate('title')}>
          Title
        </button>
      </div>
    </StubScreen>
  );
}
