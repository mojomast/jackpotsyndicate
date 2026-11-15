/** @jsxRuntime automatic */
import { useState } from 'react';
import { TEST_IDS, type FloorId } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { dispatchMeta } from './commands';
import {
  META_FLOORS,
  allowedFloors,
  bossForFloor,
  floorFriction,
  floorGutterRisk,
  floorName,
  formatPercent,
} from './metaContent';
import { MetaNotice, MetaScreen } from './MetaScreen';
import { useMetaAutosave } from './persistence';
import { navigateTo, type MetaNavigate } from './navigation';

export interface ElevatorScreenProps {
  onNavigate?: MetaNavigate;
}

export function ElevatorScreen({ onNavigate }: ElevatorScreenProps) {
  useMetaAutosave();
  const state = useGameStore((store) => store.state);
  const [error, setError] = useState<string | null>(null);
  const legal = new Set(allowedFloors(state.floorId).map((floor) => floor.id));
  const canChoose = state.phase === 'ELEVATOR';

  const choose = (floorId: FloorId) => {
    setError(null);
    const result = dispatchMeta({ c: 'ChooseFloor', floorId });
    if (!result.ok) {
      setError(
        result.error === 'INVALID_TARGET'
          ? 'That floor is not on this elevator bank.'
          : 'The elevator is not accepting floor choices right now.',
      );
      return;
    }
    navigateTo('table', onNavigate);
  };

  return (
    <MetaScreen
      eyebrow="Elevator · R-RUN-05"
      title="Choose the next floor"
      description="After a boss win the elevator offers only the legal branches. The chosen floor changes pusher physics and shop bias."
      testId="elevator"
    >
      <div className="elevator-current panel">
        <span className="eyebrow">Current floor</span>
        <strong>{floorName(state.floorId)}</strong>
        <span className="meta-hint">
          Boss defeated? {state.floorsCleared.length} floor
          {state.floorsCleared.length === 1 ? '' : 's'} cleared.
        </span>
      </div>

      {error ? <MetaNotice tone="error" testId="elevator-error">{error}</MetaNotice> : null}
      {!canChoose ? (
        <MetaNotice tone="info" testId="elevator-locked">
          The elevator unlocks after a boss win. Current phase: {state.phase.replaceAll('_', ' ')}.
        </MetaNotice>
      ) : null}

      <div className="elevator-grid">
        {META_FLOORS.map((floor) => {
          const available = legal.has(floor.id);
          const boss = bossForFloor(floor.id);
          return (
            <button
              key={floor.id}
              type="button"
              className="elevator-card"
              data-testid={TEST_IDS.elevator(floor.id)}
              data-available={available}
              onClick={() => choose(floor.id)}
              disabled={!canChoose || !available}
            >
              <span className="eyebrow">Floor {floor.order}</span>
              <strong>{floorName(floor.id)}</strong>
              <span className="offer-meta">
                Friction {formatPercent(floorFriction(floor.id))} · gutter risk{' '}
                {floorGutterRisk(floor.id).toFixed(2)}
              </span>
              <span className="offer-meta">
                Quota ×{floor.quotaScale} · boss {boss?.name ?? 'unknown'}
              </span>
              <span className="elevator-shop-bias">
                Shop bias:{' '}
                {Object.entries(floor.shop.archetypeWeights)
                  .sort((left, right) => right[1] - left[1])
                  .slice(0, 2)
                  .map(([archetype, weight]) => `${archetype.toLowerCase()} ${weight}%`)
                  .join(' · ')}
              </span>
              {!available ? (
                <span className="locked-note">
                  {canChoose ? 'Not on this elevator bank' : 'Locked'}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </MetaScreen>
  );
}

export const Elevator = ElevatorScreen;
export const ElevatorStub = ElevatorScreen;

export default ElevatorScreen;
