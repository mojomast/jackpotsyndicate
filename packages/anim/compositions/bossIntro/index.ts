import { bossIntro } from '../../src';
import type { BossIntroParams } from '../../src';
import params from '../../fixtures/bossIntro.json';
import { composition } from '../mount';
composition('bossIntro', bossIntro, params as BossIntroParams);
