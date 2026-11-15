/** @jsxRuntime automatic */
import { useState } from 'react';
import { TEST_IDS, type FloorDef, type FloorId } from '@jackpotsyndicate/contracts';
import { useGameStore } from '../../store/gameStore';
import { SpriteImage } from '../../components/Artwork';
import { dispatchMeta } from './commands';
import {
  BOSS_SABOTAGE,
  META_FLOORS,
  allowedFloors,
  bossForFloor,
  floorDef,
  floorName,
  floorSpriteKey,
} from './metaContent';
import { MetaNotice, MetaScreen } from './MetaScreen';
import { useMetaAutosave } from './persistence';
import { navigateTo, type MetaNavigate } from './navigation';
import { PipMeter } from './ui';

export interface ElevatorScreenProps {
  onNavigate?: MetaNavigate;
}

/** Map a floor onto five-pip scales relative to the Neon Vault baseline. */
function floorProfile(floor: FloorDef) {
  const pegValue = (floor.pegChips.gold + floor.pegChips.bumper + floor.pegChips.golden) / 3;
  const slide = floor.physics.friction;
  const archetypes = Object.entries(floor.shop.archetypeWeights).sort((left, right) => right[1] - left[1]);
  const [topArchetype, topWeight] = archetypes[0] ?? ['MIXED', 25];
  return {
    risk: Math.min(5, 1 + (floor.physics.gutterRisk - 0.5) * 4),
    riskCaption: floor.physics.gutterRisk >= 1.2 ? 'Hungry gutters' : floor.physics.gutterRisk <= 0.8 ? 'Guarded gutters' : 'Standard gutters',
    payout: Math.min(5, 1 + pegValue / 40) * floor.lipMult,
    payoutCaption: `Pegs ${floor.pegChips.gold}/${floor.pegChips.bumper}/${floor.pegChips.golden} chips`,
    slide: Math.min(5, Math.max(1, (slide - 0.8) * 30)),
    slideCaption: slide >= 0.94 ? 'Ice-slick shelf' : slide <= 0.86 ? 'Grippy shelf' : 'Steady shelf',
    shopBias: `${topArchetype.charAt(0)}${topArchetype.slice(1).toLowerCase()} ${topWeight}%`,
  };
}

function BranchCard({
  floor,
  canChoose,
  onChoose,
  index,
}: {
  floor: FloorDef;
  canChoose: boolean;
  onChoose: (floorId: FloorId) => void;
  index: number;
}) {
  const boss = bossForFloor(floor.id);
  const profile = floorProfile(floor);
  return (
    <button
      type="button"
      className="branch-card"
      data-testid={TEST_IDS.elevator(floor.id)}
      data-available="true"
      data-floor={floor.id}
      onClick={() => onChoose(floor.id)}
      disabled={!canChoose}
      style={{ ['--deal-index' as string]: index }}
    >
      <span className="branch-art">
        <SpriteImage spriteKey={floorSpriteKey(floor.id)} className="branch-art-image" />
      </span>
      <span className="branch-body">
        <span className="branch-floor">Floor {floor.order}</span>
        <span className="branch-name">{floorName(floor.id)}</span>
        <span className="branch-meters">
          <PipMeter label="Risk" value={profile.risk} tone="crimson" caption={profile.riskCaption} />
          <PipMeter label="Payout" value={profile.payout} tone="gold" caption={profile.payoutCaption} />
          <PipMeter label="Slide" value={profile.slide} tone="cyan" caption={profile.slideCaption} />
        </span>
        <span className="branch-facts">
          <span><span className="stat-label">Shop leans</span> {profile.shopBias}</span>
          <span><span className="stat-label">Quota</span> ×{floor.quotaScale}</span>
          {floor.lipMult !== 1 ? <span><span className="stat-label">Lip</span> ×{floor.lipMult}</span> : null}
        </span>
        {boss ? (
          <span className="branch-boss">
            <SpriteImage spriteKey={boss.spriteKey} className="branch-boss-portrait" />
            <span className="branch-boss-copy">
              <span className="stat-label">Waiting at the top</span>
              <span className="branch-boss-name">{boss.name}</span>
              <span className="branch-boss-rule">{BOSS_SABOTAGE[boss.id]}</span>
            </span>
          </span>
        ) : null}
        <span className="branch-cta">{canChoose ? 'Ride up' : 'Locked'}</span>
      </span>
    </button>
  );
}

export function ElevatorScreen({ onNavigate }: ElevatorScreenProps) {
  useMetaAutosave();
  const state = useGameStore((store) => store.state);
  const [error, setError] = useState<string | null>(null);
  const branches = allowedFloors(state.floorId);
  const legal = new Set(branches.map((floor) => floor.id));
  const canChoose = state.phase === 'ELEVATOR';
  const current = floorDef(state.floorId);

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

  const others = META_FLOORS.filter((floor) => !legal.has(floor.id));

  return (
    <MetaScreen
      eyebrow={`Floor ${current?.order ?? 1} cleared · ${floorName(state.floorId)}`}
      title="Choose your ascent"
      description={
        branches.length > 1
          ? 'The car stops twice on the way up. Each floor bends the physics, the vendors and the boss waiting at the top. There is no coming back down.'
          : 'One shaft left. The Penthouse waits.'
      }
      testId="elevator"
      className="elevator-screen"
    >
      {error ? <MetaNotice tone="error" testId="elevator-error">{error}</MetaNotice> : null}
      {!canChoose ? (
        <MetaNotice tone="info" testId="elevator-locked">
          The elevator unlocks after a boss win.
        </MetaNotice>
      ) : null}

      <div className={`branch-grid branches-${branches.length}`}>
        {branches.length > 1 ? <span className="branch-fork" aria-hidden="true" /> : null}
        {branches.map((floor, index) => (
          <BranchCard
            key={floor.id}
            floor={floor}
            canChoose={canChoose}
            onChoose={choose}
            index={index}
          />
        ))}
      </div>

      <section className="floor-directory" aria-labelledby="floor-directory-heading">
        <h2 className="strip-title" id="floor-directory-heading">Building directory</h2>
        <div className="directory-list">
          {others.map((floor) => {
            const here = floor.id === state.floorId;
            const cleared = state.floorsCleared.includes(floor.id);
            return (
              <button
                key={floor.id}
                type="button"
                className={`directory-entry${here ? ' is-here' : ''}`}
                data-testid={TEST_IDS.elevator(floor.id)}
                data-available="false"
                onClick={() => choose(floor.id)}
                disabled
              >
                <span className="directory-floor">{floor.order}</span>
                <span className="directory-name">{floorName(floor.id)}</span>
                <span className="directory-state">
                  {here ? 'You are here' : cleared ? 'Cleared' : 'Not on this bank'}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </MetaScreen>
  );
}

export const Elevator = ElevatorScreen;
export const ElevatorStub = ElevatorScreen;

export default ElevatorScreen;
