import { gameOver } from '../../src';
import params from '../../fixtures/gameOver.json';
import { composition } from '../mount';
composition('gameOver', gameOver, params);
