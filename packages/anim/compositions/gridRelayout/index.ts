import { gridRelayout } from '../../src';
import type { GridRelayoutParams } from '../../src';
import params from '../../fixtures/gridRelayout.json';
import { composition } from '../mount';
composition('gridRelayout', gridRelayout, params as GridRelayoutParams, true);
