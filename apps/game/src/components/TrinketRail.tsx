/** @jsxRuntime automatic */
import { TEST_IDS } from '@jackpotsyndicate/contracts';
import { SpriteImage } from './Artwork';
import { useGameStore } from '../store/gameStore';

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
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function TrinketRail() {
  const trinkets = useGameStore((store) => store.state.trinkets);

  return (
    <section className="trinket-panel panel" aria-label="Mounted trinkets">
      <div className="panel-heading">
        <h2>Trinket rail</h2>
        <span>{trinkets.length} mounted</span>
      </div>
      <ul className="trinket-rail" data-testid={TEST_IDS.trinketRail}>
        {trinkets.length === 0 ? (
          <li className="trinket-empty">No trinkets mounted. Visit the shop after a round.</li>
        ) : (
          trinkets.map((id, index) => {
            const meta = TRINKET_META[id] ?? { name: humanize(id), effect: 'Mounted trinket.' };
            return (
              <li
                key={`${id}-${index}`}
                className="trinket-chip"
                data-testid={TEST_IDS.trinket(id)}
                title={`${meta.name}: ${meta.effect}`}
              >
                <span className="trinket-icon" aria-hidden="true">
                  <SpriteImage
                    spriteKey={`trinket.${id}`}
                    className="trinket-art"
                    fallback={meta.name.split(' ').map((word) => word.charAt(0)).slice(0, 2).join('')}
                  />
                </span>
                <span className="trinket-copy">
                  <span className="trinket-name">{meta.name}</span>
                  <span className="trinket-effect">{meta.effect}</span>
                </span>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
