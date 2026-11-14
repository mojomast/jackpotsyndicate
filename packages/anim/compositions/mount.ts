import { createCabinet, DEFAULT_TOKENS, defaultSpriteResolver, setCabinetGrid } from '../src';
import type { TimelineFactory } from '../src';
import type { gsap } from 'gsap';
import spin from '../fixtures/reelSpin.json';
import type { SymbolId } from '../src';
import { register } from './register';
import './style.css';

export function composition<P>(id: string, factory: TimelineFactory<P, gsap.core.Timeline>, params: P, cabinet = false) {
  const root = document.querySelector<HTMLElement>('[data-anim="factory-root"]')!;
  if (cabinet) {
    createCabinet(root, { cols: 3, rows: 3 }, DEFAULT_TOKENS, defaultSpriteResolver);
    setCabinetGrid(root, spin.finalGrid as SymbolId[][], DEFAULT_TOKENS, defaultSpriteResolver);
  }
  register(id, factory(root, params, DEFAULT_TOKENS, defaultSpriteResolver));
}
