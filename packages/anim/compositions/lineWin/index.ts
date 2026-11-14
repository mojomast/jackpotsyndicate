import { lineWin } from '../../src';
import type { LineWinParams } from '../../src';
import params from '../../fixtures/lineWin.json';
import { composition } from '../mount';
composition('lineWin', lineWin, params as LineWinParams, true);
