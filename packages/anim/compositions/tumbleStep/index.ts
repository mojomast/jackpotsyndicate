import { tumbleStep } from '../../src';
import type { TumbleStepParams } from '../../src';
import params from '../../fixtures/tumbleStep.json';
import { composition } from '../mount';
composition('tumbleStep', tumbleStep, params as TumbleStepParams, true);
