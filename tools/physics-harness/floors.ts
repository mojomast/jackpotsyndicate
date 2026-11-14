import type { FloorPhysics } from '@jackpotsyndicate/contracts';
import { makeStandardPegLayout } from '@jackpotsyndicate/physics';

const pegs = makeStandardPegLayout();
/** Floor physics from the spec (2.7) with the AC-5 gutter-rake targets. */
export const FLOORS: { id: string; physics: FloorPhysics; target: number; tol: number }[] = [
  { id: 'FLOOR_NEON', physics: { friction: 0.9, gutterRisk: 1.0, dozerSpeed: 0.05, pegs }, target: 0.18, tol: 0.04 },
  { id: 'FLOOR_CRYO', physics: { friction: 0.96, gutterRisk: 1.35, dozerSpeed: 0.075, pegs }, target: 0.24, tol: 0.05 },
  { id: 'FLOOR_FOUNDRY', physics: { friction: 0.84, gutterRisk: 0.65, dozerSpeed: 0.045, pegs }, target: 0.12, tol: 0.04 },
  { id: 'FLOOR_PENTHOUSE', physics: { friction: 0.91, gutterRisk: 1.15, dozerSpeed: 0.065, pegs }, target: 0.21, tol: 0.05 },
];
