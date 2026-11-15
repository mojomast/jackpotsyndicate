import diamond from '../assets/reels/diamond.png';
import cherry from '../assets/reels/cherry.png';
import uranium from '../assets/reels/uranium.png';
import skull from '../assets/reels/skull.png';
import seven from '../assets/reels/seven.png';
import type { SpriteResolver } from '../src';

const images: Record<string, string> = { 'symbol.diamond': diamond, 'symbol.cherry': cherry, 'symbol.uranium': uranium, 'symbol.skull': skull, 'symbol.seven': seven };
/** Local copies of the game's committed atlas art; runtime factories still resolve keys. */
export const reelArt: SpriteResolver = key => images[key] ? { url: images[key]!, x: 0, y: 0, w: 224, h: 224 } : null;
