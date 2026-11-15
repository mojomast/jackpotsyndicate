/** @jsxRuntime automatic */
import { useId } from 'react';
import { TEST_IDS } from '@jackpotsyndicate/contracts';
import { SpriteImage } from './Artwork';
import { useGameStore } from '../store/gameStore';
import { findItem } from '../screens/meta/metaContent';

export interface TrinketMeta {
  name: string;
  effect: string;
}

export const TRINKET_META: Record<string, TrinketMeta> = {
  'quantum-splitter-coil': {
    name: 'Quantum Splitter Coil',
    effect: 'Every 2nd orb launched gains canSplit.',
  },
  'electromagnetic-hopper': {
    name: 'Electromagnetic Hopper',
    effect: 'Constant pull toward centre X on all orbs and tokens.',
  },
  'vampiric-stepper-motor': {
    name: 'Vampiric Stepper Motor',
    effect: '×1.5 X every spin.',
  },
  'vampiric-rake-collector': {
    name: 'Vampiric Rake Collector',
    effect: 'Each token lost to a gutter adds +0.25 X to the next spin (cap +2.0).',
  },
  'gold-peg-alchemist': {
    name: 'Gold Peg Alchemist',
    effect: 'Peg hits +15 chips; every token +40 cash.',
  },
  'turbo-dozer-cam': {
    name: 'Turbo Dozer Cam',
    effect: 'Dozer speed and push +30%.',
  },
  'hydraulic-dozer-piston': {
    name: 'Hydraulic Dozer Piston',
    effect: 'Dozer stroke +25%.',
  },
  'rubber-gutter-bumper': {
    name: 'Rubber Gutter Bumper',
    effect: '50% of tokens reaching a gutter bounce back (seeded roll).',
  },
  'gutter-guard-bumper': {
    name: 'Gutter Guard Bumper',
    effect: '35% of tokens reaching a gutter bounce back; rolls independently.',
  },
  'ouroboros-capacitor': {
    name: 'Ouroboros Capacitor',
    effect: 'Each lip drop adds +0.25 X to the next spin (cap +3.0).',
  },
  'loaded-platinum-die': {
    name: 'Loaded Platinum Die',
    effect: '+20 chips per scoring cell.',
  },
  'overvolted-solenoid': {
    name: 'Overvolted Solenoid',
    effect: '+1 extra copper token spawned on the shelf each spin.',
  },
  'vip-bullion-stamp': {
    name: 'VIP Bullion Stamp',
    effect: 'Lip payouts +25%.',
  },
  'tesla-peg-capacitor': {
    name: 'Tesla Peg Capacitor',
    effect: 'Every 3rd peg hit nudges all shelf tokens 4 units toward the lip.',
  },
  'midas-lip-sensor': {
    name: 'Midas Lip Sensor',
    effect: '+75 cash per lip drop.',
  },
};

function humanize(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function trinketInfo(id: string): { name: string; effect: string; spriteKey: string } {
  const meta = TRINKET_META[id];
  const item = findItem(id);
  return {
    name: meta?.name ?? item?.name ?? humanize(id),
    effect: meta?.effect ?? item?.desc ?? 'Mounted trinket.',
    spriteKey: item?.spriteKey ?? `trinket.${id}`,
  };
}

/**
 * Compact trinket rail: one brass socket per mounted trinket. The name and
 * effect sit in a focusable tooltip so the rail stays one row high.
 */
export function TrinketRail() {
  const trinkets = useGameStore((store) => store.state.trinkets);
  const uid = useId();

  return (
    <section className="trinket-panel" aria-label="Mounted trinkets">
      <span className="trinket-panel-label">
        Trinkets <b>{trinkets.length}</b>
      </span>
      <ul className="trinket-rail" data-testid={TEST_IDS.trinketRail}>
        {trinkets.length === 0 ? (
          <li className="trinket-empty">No trinkets yet. Visit the shop after a round.</li>
        ) : (
          trinkets.map((id, index) => {
            const info = trinketInfo(id);
            const tipId = `${uid}-tip-${index}`;
            return (
              <li
                key={`${id}-${index}`}
                className="trinket-chip"
                data-testid={TEST_IDS.trinket(id)}
                tabIndex={0}
                aria-describedby={tipId}
                title={`${info.name}: ${info.effect}`}
              >
                <span className="trinket-icon" aria-hidden="true">
                  <SpriteImage
                    spriteKey={info.spriteKey}
                    className="trinket-art"
                    fallback={info.name.split(' ').map((word) => word.charAt(0)).slice(0, 2).join('')}
                  />
                </span>
                <span className="trinket-copy" role="tooltip" id={tipId}>
                  <span className="trinket-name">{info.name}</span>
                  <span className="trinket-effect">{info.effect}</span>
                </span>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
