import { reelSpin } from '../../src';
import type { ReelSpinParams } from '../../src';
import params from '../../fixtures/reelSpin.json';
import { composition } from '../mount';
composition('reelSpin', reelSpin, params as ReelSpinParams);
