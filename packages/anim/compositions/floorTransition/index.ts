import { floorTransition } from '../../src';
import type { FloorTransitionParams } from '../../src';
import params from '../../fixtures/floorTransition.json';
import { composition } from '../mount';
composition('floorTransition', floorTransition, params as FloorTransitionParams);
