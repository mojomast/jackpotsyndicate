/**
 * Live 2.5D board scene (T-071 polish).
 *
 * The simulation stays flat; this scene is a pure consumer of `SimSnapshot`s
 * and physics/game events. It owns a Pixi Application and renders:
 *
 * - a static board painted once into a canvas texture (pinfield glass, chute
 *   gates, perspective shelf, gutters, the bevelled rake strips and the lip),
 * - pooled sprites for pegs, orbs (with trails), coins (shaded discs with
 *   edge bands, `stack` towers, `lift`, contact shadows) and the dozer,
 * - event-driven juice: peg shockwaves, chute gate flashes, lip-drop tumbles
 *   with cash popups, gutter losses, screen shake.
 *
 * Nothing here feeds back into the simulation, and no wall-clock value is used
 * for anything but presentation. Reduced motion disables shake, trails and
 * travelling particles.
 */
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { BOARD, DEFAULT_CHUTE_MULTS, projectShelf } from '@jackpotsyndicate/contracts';
import type { SimSnapshot } from '@jackpotsyndicate/contracts';
import { interpolateSnapshots } from './renderer';
import { PEG_COLORS, shade, symbolColor } from './shelf';
import {
  WORLD,
  chuteTint,
  paintBand,
  paintChipFace,
  paintDisc,
  paintDozerFace,
  paintFade,
  paintGlow,
  paintOrb,
  paintPeg,
  paintRing,
  paintShadow,
  paintSpecular,
  paintStaticBoard,
} from './textures';

export interface SceneEvent {
  t: string;
  [key: string]: unknown;
}

export interface BoardSceneOptions {
  gutterRisk?: number;
  chuteMults?: readonly number[];
  reducedMotion?: boolean;
  /** Wall-clock milliseconds per sim tick (1000 / (60 × speed)). */
  tickMs?: number;
  formatCash?: (value: number) => string;
}

export interface BoardScenePerf {
  /** Exponential moving average of CPU work per frame (scene update + render), ms. */
  frameMs: number;
  /** Worst frame in the last sampling window, ms. */
  worstMs: number;
  /** Measured frames per second over the last window. */
  fps: number;
  sprites: number;
}

const TAU = Math.PI * 2;
const SPLIT = BOARD.SPLIT_Y;
const GW = BOARD.GUTTER_W;
const CHUTE_W = BOARD.W / BOARD.CHUTE_COUNT;
const TRAIL = 7;
/** Coins draw slightly larger than their collision radius so faces read at table size. */
const COIN_SCALE = 1.38;

function hex(color: string): number {
  return Number.parseInt(color.replace('#', ''), 16);
}

function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

interface CoinLayer {
  bottom: Sprite;
  side: Sprite;
  face: Sprite;
}

interface TokenNode {
  root: Container;
  shadow: Sprite;
  ring: Sprite;
  layers: CoinLayer[];
  symbolId: string;
  born: number;
  tilt: number;
}

interface OrbNode {
  glow: Sprite;
  body: Sprite;
  spec: Sprite;
  trail: Sprite[];
  hx: number[];
  hy: number[];
  symbolId: string;
}

interface PegNode {
  id: number;
  x: number;
  y: number;
  r: number;
  base: Sprite;
  halo: Sprite;
  color: number;
}

interface Particle {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  age: number;
  life: number;
  s0: number;
  s1: number;
  a0: number;
  stretch: number;
}

interface FallingCoin {
  root: Container;
  bottom: Sprite;
  side: Sprite;
  face: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rx: number;
  age: number;
  life: number;
  spin: number;
  gutter: boolean;
}

interface Popup {
  text: Text;
  x: number;
  y: number;
  age: number;
  life: number;
  rise: number;
  big: boolean;
}

const TOKEN_ART_KEYS = ['diamond', 'cherry', 'uranium', 'skull', 'seven', 'scrap', 'ice', 'bullion', 'copper'];

/** True when this environment can host the Pixi scene (a real browser with WebGL or 2D canvas). */
export function canHostBoardScene(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/jsdom/i.test(ua)) return false;
  const scope = globalThis as { WebGLRenderingContext?: unknown; WebGL2RenderingContext?: unknown };
  return typeof scope.WebGL2RenderingContext !== 'undefined' || typeof scope.WebGLRenderingContext !== 'undefined';
}

export class BoardScene {
  readonly host: HTMLElement;
  private app: Application | null = null;
  private destroyed = false;
  private raf = 0;
  private lastFrame = 0;

  private options: Required<Omit<BoardSceneOptions, 'formatCash'>> & { formatCash: (v: number) => string };

  // textures
  private tex: Record<string, Texture> = {};
  private faceTex = new Map<string, Texture>();
  private artFace = new Map<string, Texture>();

  // layers
  private root = new Container();
  private world = new Container();
  private staticSprite = new Sprite();
  private pegLayer = new Container();
  private trailLayer = new Container();
  private orbLayer = new Container();
  private chuteLayer = new Container();
  private dozerTop = new Graphics();
  private dozerFace = new Sprite();
  private dozerShadow = new Sprite();
  private dozerGlow = new Sprite();
  private shadowLayer = new Container();
  private tokenLayer = new Container();
  private fxLayer = new Container();
  private coinFxLayer = new Container();
  private popupLayer = new Container();

  // state
  private prev: SimSnapshot | null = null;
  private next: SimSnapshot | null = null;
  private nextAt = 0;
  private tokens = new Map<number, TokenNode>();
  private orbs = new Map<number, OrbNode>();
  private orbPool: OrbNode[] = [];
  private pegs: PegNode[] = [];
  private pegKey = '';
  private particles: Particle[] = [];
  private particlePool: Sprite[] = [];
  private falling: FallingCoin[] = [];
  private popups: Popup[] = [];
  private popupPool: Text[] = [];
  private chuteGlow: Sprite[] = [];
  private chuteBeam: Sprite[] = [];
  private chuteLabel: Text[] = [];
  private chuteHeat = [0, 0, 0, 0, 0];
  private lipGlow = new Sprite();
  private lipHeat = 0;
  private gutterGlow: Sprite[] = [];
  private gutterHeat = [0, 0];
  private shake = 0;
  private time = 0;
  private staticScale = 0;
  private staticKey = '';
  private viewScale = 1;
  private resizeObserver: ResizeObserver | null = null;
  private repaintTimer = 0;
  private surging = false;

  // perf
  private perfEma = 0;
  private perfWorst = 0;
  private perfFrames = 0;
  private perfWindowStart = 0;
  private perfFps = 0;
  private perfWorstShown = 0;

  private constructor(host: HTMLElement, options: BoardSceneOptions) {
    this.host = host;
    this.options = {
      gutterRisk: options.gutterRisk ?? 1,
      chuteMults: options.chuteMults ?? DEFAULT_CHUTE_MULTS,
      reducedMotion: options.reducedMotion ?? false,
      tickMs: options.tickMs ?? 1000 / 60,
      formatCash: options.formatCash ?? ((v) => `$${Math.round(v).toLocaleString('en-US')}`),
    };
  }

  /** Create and mount a scene inside `host`. Resolves to null if the GPU path is unavailable. */
  static async create(host: HTMLElement, options: BoardSceneOptions = {}): Promise<BoardScene | null> {
    const scene = new BoardScene(host, options);
    try {
      await scene.init();
    } catch (error) {
      scene.destroy();
      if (typeof console !== 'undefined') console.warn('Board scene unavailable; using the static plan.', error);
      return null;
    }
    if (scene.destroyed) return null;
    return scene;
  }

  private async init(): Promise<void> {
    const app = new Application();
    const { w, h } = this.hostSize();
    await app.init({
      width: w,
      height: h,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, globalThis.devicePixelRatio || 1),
      preference: 'webgl',
      autoStart: false,
      sharedTicker: false,
      eventMode: 'none',
      eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
    });
    if (this.destroyed) {
      app.destroy(true);
      return;
    }
    this.app = app;
    app.ticker?.stop();
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.classList.add('board-scene-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.touchAction = 'auto';
    canvas.style.pointerEvents = 'none';
    this.host.appendChild(canvas);

    this.buildTextures();
    this.buildScene();
    this.layout();
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.host);
    this.perfWindowStart = performance.now();
    this.lastFrame = performance.now();
    const loop = (now: number): void => {
      if (this.destroyed) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    void fonts?.ready.then(() => {
      if (this.destroyed) return;
      for (const label of this.chuteLabel) label.style.fontFamily = 'Outfit, Inter, sans-serif';
    });
  }

  private hostSize(): { w: number; h: number } {
    const rect = this.host.getBoundingClientRect();
    return { w: Math.max(32, Math.round(rect.width)), h: Math.max(32, Math.round(rect.height)) };
  }

  private texture(canvas: HTMLCanvasElement | HTMLImageElement): Texture {
    return Texture.from(canvas);
  }

  private buildTextures(): void {
    this.tex = {
      glow: this.texture(paintGlow()),
      ring: this.texture(paintRing()),
      shadow: this.texture(paintShadow()),
      orb: this.texture(paintOrb()),
      spec: this.texture(paintSpecular()),
      peg: this.texture(paintPeg()),
      disc: this.texture(paintDisc()),
      band: this.texture(paintBand()),
      fade: this.texture(paintFade()),
      dozer: this.texture(paintDozerFace(512, 48, false)),
      dozerHot: this.texture(paintDozerFace(512, 48, true)),
    };
    for (const id of TOKEN_ART_KEYS) this.faceTex.set(id, this.texture(paintChipFace(id)));
  }

  /** Supply decoded atlas art for a token symbol (casino chip face). */
  setChipArt(symbolId: string, image: HTMLImageElement | HTMLCanvasElement): void {
    if (!this.app || this.destroyed) return;
    try {
      const texture = Texture.from(image);
      this.artFace.set(symbolId, texture);
      for (const node of this.tokens.values()) {
        if (node.symbolId === symbolId) for (const layer of node.layers) layer.face.texture = texture;
      }
    } catch {
      // keep the procedural face
    }
  }

  private face(symbolId: string): Texture {
    return this.artFace.get(symbolId) ?? this.faceTex.get(symbolId) ?? this.faceTex.get('seven')!;
  }

  private buildScene(): void {
    const app = this.app!;
    app.stage.addChild(this.root);
    this.root.addChild(this.world);
    this.world.addChild(
      this.staticSprite,
      this.pegLayer,
      this.trailLayer,
      this.orbLayer,
      this.chuteLayer,
      this.dozerShadow,
      this.dozerTop,
      this.dozerFace,
      this.dozerGlow,
      this.shadowLayer,
      this.tokenLayer,
      this.coinFxLayer,
      this.fxLayer,
      this.popupLayer,
    );
    this.tokenLayer.sortableChildren = true;
    this.trailLayer.blendMode = 'add';
    this.fxLayer.blendMode = 'add';

    // chute gates: underglow, light beam, multiplier label
    const mults = this.options.chuteMults;
    for (let i = 0; i < BOARD.CHUTE_COUNT; i++) {
      const cx = (i + 0.5) * CHUTE_W;
      const tint = hex(chuteTint(mults[i] ?? 1));
      const glow = new Sprite(this.tex.glow);
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = tint;
      glow.position.set(cx, SPLIT - BOARD.CHUTE_H / 2);
      glow.width = CHUTE_W * 1.05;
      glow.height = 46;
      const beam = new Sprite(this.tex.glow);
      beam.anchor.set(0.5, 0.5);
      beam.blendMode = 'add';
      beam.tint = tint;
      beam.position.set(cx, SPLIT + 4);
      beam.width = CHUTE_W * 0.55;
      beam.height = 90;
      beam.alpha = 0;
      const label = new Text({
        text: `×${formatMult(mults[i] ?? 1)}`,
        style: {
          fontFamily: 'Outfit, Inter, sans-serif',
          fontWeight: '800',
          fontSize: 17,
          fill: chuteTint(mults[i] ?? 1),
          stroke: { color: '#05070c', width: 4 },
          letterSpacing: 0.5,
        },
        resolution: 3,
      });
      label.anchor.set(0.5);
      label.position.set(cx, SPLIT - BOARD.CHUTE_H / 2 - 0.5);
      this.chuteLayer.addChild(glow, beam, label);
      this.chuteGlow.push(glow);
      this.chuteBeam.push(beam);
      this.chuteLabel.push(label);
    }

    // dozer
    this.dozerFace.texture = this.tex.dozer;
    this.dozerShadow.texture = this.tex.fade;
    this.dozerShadow.alpha = 0.75;
    this.dozerGlow.texture = this.tex.glow;
    this.dozerGlow.anchor.set(0.5);
    this.dozerGlow.blendMode = 'add';
    this.dozerGlow.tint = 0xfb923c;
    this.dozerGlow.alpha = 0;

    // lip + gutter glows
    const lipL = projectShelf(GW, BOARD.LIP_Y);
    const lipR = projectShelf(BOARD.W - GW, BOARD.LIP_Y);
    this.lipGlow.texture = this.tex.glow;
    this.lipGlow.anchor.set(0.5);
    this.lipGlow.blendMode = 'add';
    this.lipGlow.tint = 0x34d399;
    this.lipGlow.position.set((lipL.x + lipR.x) / 2, lipL.y + 2);
    this.lipGlow.width = (lipR.x - lipL.x) * 1.08;
    this.lipGlow.height = 34;
    this.lipGlow.alpha = 0.1;
    this.fxLayer.addChild(this.lipGlow);
    for (const side of [0, 1]) {
      const x0 = side === 0 ? 0 : BOARD.W - GW;
      const a = projectShelf(x0 + GW / 2, (SPLIT + BOARD.LIP_Y) / 2);
      const glow = new Sprite(this.tex.glow);
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = 0xf43f5e;
      glow.position.set(a.x, a.y);
      glow.width = GW * 1.6;
      glow.height = BOARD.LIP_Y - SPLIT;
      glow.alpha = 0;
      this.fxLayer.addChild(glow);
      this.gutterGlow.push(glow);
    }
  }

  setOptions(patch: BoardSceneOptions): void {
    const before = this.options;
    this.options = {
      ...before,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
    } as typeof this.options;
    if (patch.chuteMults && patch.chuteMults.join() !== before.chuteMults.join()) {
      for (let i = 0; i < this.chuteLabel.length; i++) {
        const m = this.options.chuteMults[i] ?? 1;
        this.chuteLabel[i]!.text = `×${formatMult(m)}`;
        this.chuteLabel[i]!.style.fill = chuteTint(m);
        this.chuteGlow[i]!.tint = hex(chuteTint(m));
        this.chuteBeam[i]!.tint = hex(chuteTint(m));
      }
      this.staticKey = '';
    }
    if (patch.gutterRisk !== undefined && patch.gutterRisk !== before.gutterRisk) this.staticKey = '';
    if (this.app && this.staticKey === '') this.paintStatic();
  }

  // ------------------------------------------------------------ layout

  private layout(): void {
    const app = this.app;
    if (!app || this.destroyed) return;
    const { w, h } = this.hostSize();
    app.renderer.resize(w, h);
    const scale = Math.min(w / WORLD.w, h / WORLD.h);
    this.viewScale = scale;
    this.world.scale.set(scale);
    this.root.position.set((w - WORLD.w * scale) / 2 - WORLD.x * scale, (h - WORLD.h * scale) / 2 - WORLD.y * scale);
    const device = scale * (app.renderer.resolution || 1);
    if (Math.abs(device - this.staticScale) / Math.max(0.01, device) > 0.08 || this.staticKey === '') {
      window.clearTimeout(this.repaintTimer);
      if (this.staticScale === 0) this.paintStatic();
      else this.repaintTimer = window.setTimeout(() => this.paintStatic(), 120);
    }
  }

  private paintStatic(): void {
    const app = this.app;
    if (!app || this.destroyed) return;
    const device = Math.min(4, this.viewScale * (app.renderer.resolution || 1));
    const key = `${device.toFixed(2)}|${this.options.gutterRisk}|${this.options.chuteMults.join()}`;
    if (key === this.staticKey) return;
    this.staticKey = key;
    this.staticScale = device;
    const canvas = paintStaticBoard({
      gutterRisk: this.options.gutterRisk,
      chuteMults: this.options.chuteMults,
      scale: device,
    });
    const old = this.staticSprite.texture;
    this.staticSprite.texture = Texture.from(canvas);
    this.staticSprite.position.set(WORLD.x, WORLD.y);
    this.staticSprite.width = WORLD.w;
    this.staticSprite.height = WORLD.h;
    if (old && old !== Texture.EMPTY && old !== Texture.WHITE) old.destroy(true);
  }

  // ----------------------------------------------------------- inputs

  /** Feed the latest authoritative snapshot (call when the sim tick changes). */
  pushSnapshot(snapshot: SimSnapshot, now = performance.now()): void {
    if (this.next && snapshot.tick === this.next.tick) {
      this.next = snapshot;
      return;
    }
    const first = this.next === null;
    this.prev = this.next ?? snapshot;
    this.next = snapshot;
    this.nextAt = now;
    if (first) this.syncTokens(snapshot, true);
  }

  /** React to a game or physics event (VFX only). */
  handleEvent(event: SceneEvent): void {
    if (!this.app || this.destroyed) return;
    const rm = this.options.reducedMotion;
    switch (event.t) {
      case 'PegHit': {
        const peg = this.pegs.find((p) => p.id === num(event.pegId, -1));
        if (!peg) return;
        this.burstRing(peg.x, peg.y, peg.color, peg.r * 4.5, 260);
        if (!rm) this.sparks(peg.x, peg.y, peg.color, event.chained ? 5 : 3, 90, 260);
        return;
      }
      case 'OrbLaunched': {
        const x = num(event.x, BOARD.W / 2);
        this.burstRing(x, 8, hex(symbolColor(String(event.symbolId ?? 'seven'))), 26, 300);
        return;
      }
      case 'OrbSplit': {
        const orb = this.next?.orbs.find((o) => o.id === num(event.parentId, -1));
        if (orb) {
          this.burstRing(orb.x, orb.y, 0x06b6d4, 40, 340);
          if (!rm) this.sparks(orb.x, orb.y, 0x67e8f9, 8, 140, 360);
        }
        return;
      }
      case 'ChuteExit': {
        const chute = Math.max(0, Math.min(BOARD.CHUTE_COUNT - 1, num(event.chute)));
        this.chuteHeat[chute] = 1;
        const x = num(event.x, (chute + 0.5) * CHUTE_W);
        const tint = hex(chuteTint(this.options.chuteMults[chute] ?? 1));
        this.burstRing(x, SPLIT - 6, tint, 46, 380);
        if (!rm) this.sparks(x, SPLIT - 4, tint, 10, 160, 420, -40);
        return;
      }
      case 'TokenSpawned': {
        const p = projectShelf(num(event.x, 300), num(event.y, 320));
        this.burstRing(p.x, p.y, hex(symbolColor(String(event.symbolId ?? 'seven'))), 30 * p.scale, 320, 0.58);
        return;
      }
      case 'LipDrop': {
        this.lipHeat = Math.min(1.6, this.lipHeat + 0.7);
        const x = num(event.x, 300);
        const p = projectShelf(x, BOARD.LIP_Y);
        this.dropCoin(event, false);
        const color = hex(symbolColor(String(event.symbolId ?? 'seven')));
        if (!rm) {
          this.sparks(p.x, p.y, 0x34d399, 10, 170, 520, -90);
          this.sparks(p.x, p.y, color, 6, 120, 460, -70);
        }
        this.burstRing(p.x, p.y, 0x34d399, 60, 420, 0.4);
        this.kick(0.12 + 0.06 * num(event.stack, 1));
        return;
      }
      case 'CashBanked': {
        const cash = num(event.cash);
        const x = num(event.x, 300);
        const p = projectShelf(x, BOARD.LIP_Y);
        const big = cash >= 500;
        this.popup(`+${this.options.formatCash(cash)}`, p.x, p.y - 12, big ? '#fde68a' : '#fbbf24', big ? 30 : 20, big);
        if (big) this.kick(0.5);
        return;
      }
      case 'GutterLoss': {
        const side = event.side === 'right' ? 1 : 0;
        this.gutterHeat[side] = 1;
        this.dropCoin(event, true);
        const p = projectShelf(num(event.x, side ? BOARD.W - 20 : 20), num(event.y, BOARD.LIP_Y));
        this.burstRing(p.x, p.y, 0xf43f5e, 40, 420, 0.6);
        this.popup('RAKED', p.x + (side ? -26 : 26), p.y - 10, '#fb7185', 14, false);
        this.kick(0.08);
        return;
      }
      case 'GutterBounce': {
        const side = event.side === 'right' ? 1 : 0;
        const token = this.next?.tokens.find((t) => t.id === num(event.tokenId, -1));
        const sx = token ? token.x : side ? BOARD.W - GW : GW;
        const sy = token ? token.y : (SPLIT + BOARD.LIP_Y) / 2;
        const p = projectShelf(sx, sy);
        this.burstRing(p.x, p.y, 0xfbbf24, 44, 380, 0.6);
        this.popup('SAVED', p.x, p.y - 14, '#fde68a', 13, false);
        return;
      }
      case 'WeldFormed': {
        const token = this.next?.tokens.find((t) => t.id === num(event.tokenId, -1));
        if (token) {
          const p = projectShelf(token.x, token.y);
          this.burstRing(p.x, p.y, 0x67e8f9, 34, 360, 0.6);
          if (!rm) this.sparks(p.x, p.y, 0xe0f2fe, 8, 110, 300, -40);
        }
        return;
      }
      case 'DozerFullExtension': {
        if (rm || !this.next) return;
        const f = this.next.dozer.frontY;
        for (let i = 0; i < 6; i++) {
          const p = projectShelf(GW + 20 + hash01(i + this.time) * (BOARD.W - 2 * GW - 40), f + 2);
          this.spawn(this.tex.glow, p.x, p.y, (hash01(i * 3.1) - 0.5) * 20, -8, 0x94a3b8, 0, 2, 520, 6, 14, 0.18);
        }
        return;
      }
      case 'SurgeStarted':
        this.kick(0.3);
        return;
      default:
        return;
    }
  }

  // ------------------------------------------------------------ juice

  private kick(amount: number): void {
    if (this.options.reducedMotion) return;
    this.shake = Math.min(1, this.shake + amount);
  }

  private takeSprite(texture: Texture): Sprite {
    const sprite = this.particlePool.pop() ?? new Sprite();
    sprite.texture = texture;
    sprite.anchor.set(0.5);
    sprite.visible = true;
    sprite.rotation = 0;
    if (!sprite.parent) this.fxLayer.addChild(sprite);
    return sprite;
  }

  private spawn(
    texture: Texture,
    x: number,
    y: number,
    vx: number,
    vy: number,
    tint: number,
    gravity: number,
    drag: number,
    life: number,
    s0: number,
    s1: number,
    a0: number,
    stretch = 0,
  ): void {
    if (this.particles.length > 420) return;
    const sprite = this.takeSprite(texture);
    sprite.tint = tint;
    this.particles.push({ sprite, x, y, vx, vy, gravity, drag, age: 0, life, s0, s1, a0, stretch });
  }

  private burstRing(x: number, y: number, tint: number, size: number, life: number, squash = 1): void {
    const sprite = this.takeSprite(this.tex.ring);
    sprite.tint = tint;
    this.particles.push({
      sprite, x, y, vx: 0, vy: 0, gravity: 0, drag: 0, age: 0, life,
      s0: size * 0.2, s1: size, a0: 0.95, stretch: squash - 1,
    });
    const core = this.takeSprite(this.tex.glow);
    core.tint = tint;
    this.particles.push({
      sprite: core, x, y, vx: 0, vy: 0, gravity: 0, drag: 0, age: 0, life: life * 0.6,
      s0: size * 0.7, s1: size * 0.3, a0: 0.8, stretch: squash - 1,
    });
  }

  private sparks(x: number, y: number, tint: number, count: number, speed: number, life: number, lift = 0): void {
    const n = this.options.reducedMotion ? Math.ceil(count / 3) : count;
    for (let i = 0; i < n; i++) {
      const a = hash01(i * 7.13 + this.time * 0.01 + x) * TAU;
      const v = speed * (0.45 + hash01(i * 3.7 + y) * 0.75);
      this.spawn(this.tex.glow, x, y, Math.cos(a) * v, Math.sin(a) * v * 0.7 + lift, tint, 420, 1.6, life * (0.7 + hash01(i) * 0.5), 6, 1.5, 1, 0.9);
    }
  }

  private popup(label: string, x: number, y: number, color: string, size: number, big: boolean): void {
    if (this.popups.length > 14) {
      const old = this.popups.shift()!;
      old.text.visible = false;
      this.popupPool.push(old.text);
    }
    const text = this.popupPool.pop() ?? new Text({
      text: '',
      style: {
        fontFamily: 'Outfit, Inter, sans-serif',
        fontWeight: '900',
        fontSize: 20,
        fill: '#fbbf24',
        stroke: { color: '#120a02', width: 5 },
        dropShadow: { color: '#000000', alpha: 0.7, blur: 6, distance: 2, angle: Math.PI / 2 },
      },
      resolution: 3,
    });
    text.text = label;
    text.style.fontSize = size;
    text.style.fill = color;
    text.anchor.set(0.5, 1);
    text.visible = true;
    if (!text.parent) this.popupLayer.addChild(text);
    const minX = WORLD.x + 40;
    const maxX = WORLD.x + WORLD.w - 40;
    this.popups.push({ text, x: Math.max(minX, Math.min(maxX, x)), y, age: 0, life: big ? 1500 : 1050, rise: big ? 46 : 32, big });
  }

  private makeCoinParts(symbolId: string): CoinLayer {
    const edge = hex(shade(symbolColor(symbolId), -70));
    const bottom = new Sprite(this.tex.disc);
    bottom.anchor.set(0.5);
    bottom.tint = edge;
    const side = new Sprite(this.tex.band);
    side.tint = hex(shade(symbolColor(symbolId), -25));
    const face = new Sprite(this.face(symbolId));
    face.anchor.set(0.5);
    return { bottom, side, face };
  }

  private dropCoin(event: SceneEvent, gutter: boolean): void {
    const symbolId = String(event.symbolId ?? 'seven');
    const x = num(event.x, 300);
    const y = num(event.y, BOARD.LIP_Y);
    const p = projectShelf(x, Math.min(y, BOARD.LIP_Y));
    const radius = num(event.radius, 9);
    const parts = this.makeCoinParts(symbolId);
    const root = new Container();
    root.addChild(parts.bottom, parts.side, parts.face);
    this.coinFxLayer.addChild(root);
    const side = event.side === 'right' ? 1 : -1;
    this.falling.push({
      ...parts,
      root,
      x: p.x,
      y: p.y,
      vx: gutter ? side * 40 : num(event.vx) * 60 * p.scale,
      vy: gutter ? 30 : Math.max(40, num(event.vy, 1) * 60),
      rx: radius * p.scale * COIN_SCALE,
      age: 0,
      life: this.options.reducedMotion ? 260 : gutter ? 620 : 720,
      spin: 9 + hash01(num(event.tokenId)) * 7,
      gutter,
    });
  }

  // ------------------------------------------------------------ frame

  private frame(now: number): void {
    const app = this.app;
    if (!app) return;
    const start = performance.now();
    const dtMs = Math.min(64, now - this.lastFrame || 16.7);
    this.lastFrame = now;
    this.time += dtMs;
    const dt = dtMs / 1000;

    if (this.next) {
      const alpha = clamp01((now - this.nextAt) / Math.max(1, this.options.tickMs));
      const snap = this.prev && this.prev !== this.next ? interpolateSnapshots(this.prev, this.next, alpha) : this.next;
      this.drawPegs(snap, dt);
      this.drawOrbs(snap);
      this.drawDozer(snap);
      this.syncTokens(snap, false);
    }
    this.drawChutes(dt);
    this.stepParticles(dtMs);
    this.stepFalling(dtMs);
    this.stepPopups(dtMs);

    // shake
    if (this.shake > 0.001 && !this.options.reducedMotion) {
      const amp = this.shake * this.shake * 7;
      this.world.position.set((hash01(this.time * 0.37) - 0.5) * amp, (hash01(this.time * 0.53 + 9) - 0.5) * amp);
      this.shake *= Math.exp(-dt * 7);
    } else {
      this.world.position.set(0, 0);
      this.shake = 0;
    }

    app.renderer.render(app.stage);
    this.recordPerf(performance.now() - start, now);
  }

  private recordPerf(ms: number, now: number): void {
    this.perfEma = this.perfEma === 0 ? ms : this.perfEma * 0.95 + ms * 0.05;
    this.perfWorst = Math.max(this.perfWorst, ms);
    this.perfFrames++;
    const span = now - this.perfWindowStart;
    if (span >= 1000) {
      this.perfFps = (this.perfFrames * 1000) / span;
      this.perfWorstShown = this.perfWorst;
      this.perfFrames = 0;
      this.perfWorst = 0;
      this.perfWindowStart = now;
      this.host.dataset.frameMs = this.perfEma.toFixed(2);
      this.host.dataset.worstMs = this.perfWorstShown.toFixed(2);
      this.host.dataset.fps = this.perfFps.toFixed(1);
    }
  }

  perf(): BoardScenePerf {
    return {
      frameMs: this.perfEma,
      worstMs: this.perfWorstShown,
      fps: this.perfFps,
      sprites: this.tokenLayer.children.length + this.orbLayer.children.length + this.fxLayer.children.length,
    };
  }

  private drawPegs(snap: SimSnapshot, dt: number): void {
    const key = snap.pegs.map((p) => `${p.id}:${p.kind}:${p.x}:${p.y}`).join('|');
    if (key !== this.pegKey) {
      this.pegKey = key;
      for (const peg of this.pegs) {
        peg.base.destroy();
        peg.halo.destroy();
      }
      this.pegs = [];
      for (const p of snap.pegs) {
        const color = hex(PEG_COLORS[p.kind] ?? '#fbbf24');
        const halo = new Sprite(this.tex.glow);
        halo.anchor.set(0.5);
        halo.blendMode = 'add';
        halo.tint = color;
        halo.position.set(p.x, p.y);
        const base = new Sprite(this.tex.peg);
        base.anchor.set(0.5);
        base.tint = p.kind === 'bumper' ? 0xfb7185 : p.kind === 'splitter' ? 0x67e8f9 : p.kind === 'golden' ? 0xfde68a : 0xf5c451;
        base.position.set(p.x, p.y);
        const size = p.radius * 2.5;
        base.width = size;
        base.height = size;
        this.pegLayer.addChild(halo, base);
        if (p.kind === 'bumper' || p.kind === 'splitter') {
          const ring = new Sprite(this.tex.ring);
          ring.anchor.set(0.5);
          ring.blendMode = 'add';
          ring.tint = color;
          ring.alpha = 0.8;
          ring.position.set(p.x, p.y);
          ring.width = ring.height = p.radius * (p.kind === 'bumper' ? 3.6 : 3.1);
          this.pegLayer.addChild(ring);
        }
        this.pegs.push({ id: p.id, x: p.x, y: p.y, r: p.radius, base, halo, color });
      }
    }
    for (let i = 0; i < snap.pegs.length; i++) {
      const p = snap.pegs[i]!;
      const node = this.pegs[i];
      if (!node) continue;
      const flash = clamp01(p.flash / 8);
      const pulse = p.kind === 'golden' && !this.options.reducedMotion ? 0.05 * Math.sin(this.time * 0.003 + p.id) : 0;
      node.halo.alpha = 0.26 + pulse + flash * 0.9;
      const hs = p.radius * (5 + flash * 4);
      node.halo.width = hs;
      node.halo.height = hs;
      const bs = p.radius * 2.5 * (1 + flash * 0.25);
      node.base.width = bs;
      node.base.height = bs;
    }
    void dt;
  }

  private takeOrb(symbolId: string): OrbNode {
    const node = this.orbPool.pop() ?? (() => {
      const glow = new Sprite(this.tex.glow);
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      const body = new Sprite(this.tex.orb);
      body.anchor.set(0.5);
      const spec = new Sprite(this.tex.spec);
      spec.anchor.set(0.5);
      const trail: Sprite[] = [];
      for (let i = 0; i < TRAIL; i++) {
        const s = new Sprite(this.tex.glow);
        s.anchor.set(0.5);
        trail.push(s);
      }
      return { glow, body, spec, trail, hx: [], hy: [], symbolId };
    })();
    node.symbolId = symbolId;
    node.hx.length = 0;
    node.hy.length = 0;
    const tint = hex(symbolColor(symbolId));
    node.glow.tint = tint;
    node.body.tint = hex(shade(symbolColor(symbolId), 30));
    for (const s of node.trail) {
      s.tint = tint;
      s.visible = false;
      this.trailLayer.addChild(s);
    }
    node.glow.visible = node.body.visible = node.spec.visible = true;
    this.orbLayer.addChild(node.glow, node.body, node.spec);
    return node;
  }

  private drawOrbs(snap: SimSnapshot): void {
    const seen = new Set<number>();
    const rm = this.options.reducedMotion;
    for (const orb of snap.orbs) {
      seen.add(orb.id);
      let node = this.orbs.get(orb.id);
      if (!node) {
        node = this.takeOrb(orb.symbolId);
        this.orbs.set(orb.id, node);
      }
      const r = orb.radius;
      node.body.position.set(orb.x, orb.y);
      node.body.width = node.body.height = r * 2;
      node.spec.position.set(orb.x - r * 0.15, orb.y - r * 0.2);
      node.spec.width = node.spec.height = r * 1.6;
      node.glow.position.set(orb.x, orb.y);
      node.glow.width = node.glow.height = r * 7;
      node.glow.alpha = 0.6;
      node.hx.unshift(orb.x);
      node.hy.unshift(orb.y);
      if (node.hx.length > TRAIL + 1) {
        node.hx.length = TRAIL + 1;
        node.hy.length = TRAIL + 1;
      }
      for (let i = 0; i < TRAIL; i++) {
        const s = node.trail[i]!;
        const has = !rm && node.hx.length > i + 1;
        s.visible = has;
        if (!has) continue;
        const k = 1 - i / TRAIL;
        s.position.set(node.hx[i + 1]!, node.hy[i + 1]!);
        s.width = s.height = r * (1.2 + 2.2 * k);
        s.alpha = 0.42 * k * k;
      }
    }
    for (const [id, node] of this.orbs) {
      if (seen.has(id)) continue;
      this.orbs.delete(id);
      node.glow.visible = node.body.visible = node.spec.visible = false;
      for (const s of node.trail) s.visible = false;
      this.orbPool.push(node);
    }
  }

  private drawDozer(snap: SimSnapshot): void {
    const f = snap.dozer.frontY;
    const surging = snap.dozer.surging;
    const left = GW + 3;
    const right = BOARD.W - GW - 3;
    const backL = projectShelf(left, SPLIT);
    const backR = projectShelf(right, SPLIT);
    const frontL = projectShelf(left, f);
    const frontR = projectShelf(right, f);
    const lift = 13 * frontL.scale;
    const backLift = 2;
    const g = this.dozerTop;
    g.clear();
    g.poly([
      backL.x, backL.y - backLift,
      backR.x, backR.y - backLift,
      frontR.x, frontR.y - lift,
      frontL.x, frontL.y - lift,
    ]).fill({ color: surging ? 0x3b1d0c : 0x1b202c });
    // ribbed top plate
    const ribs = 6;
    for (let i = 1; i < ribs; i++) {
      const t = i / ribs;
      const y = SPLIT + (f - SPLIT) * t;
      const a = projectShelf(left + 6, y);
      const b = projectShelf(right - 6, y);
      const l = 2 + (13 * a.scale - 2) * t;
      g.moveTo(a.x, a.y - l).lineTo(b.x, b.y - l);
    }
    g.stroke({ color: 0x3a4152, width: 0.9, alpha: 0.8 });
    g.moveTo(frontL.x, frontL.y - lift).lineTo(frontR.x, frontR.y - lift).stroke({ color: surging ? 0xffedd5 : 0xfde68a, width: 1.4 });
    g.moveTo(backL.x, backL.y - backLift).lineTo(frontL.x, frontL.y - lift).stroke({ color: 0x8a6a1e, width: 1.6 });
    g.moveTo(backR.x, backR.y - backLift).lineTo(frontR.x, frontR.y - lift).stroke({ color: 0x8a6a1e, width: 1.6 });

    if (surging !== this.surging) {
      this.surging = surging;
      this.dozerFace.texture = surging ? this.tex.dozerHot : this.tex.dozer;
    }
    this.dozerFace.position.set(frontL.x, frontL.y - lift);
    this.dozerFace.width = frontR.x - frontL.x;
    this.dozerFace.height = lift;
    this.dozerShadow.position.set(frontL.x - 4, frontL.y);
    this.dozerShadow.width = frontR.x - frontL.x + 8;
    this.dozerShadow.height = 16 * frontL.scale;
    this.dozerGlow.position.set((frontL.x + frontR.x) / 2, frontL.y - lift / 2);
    this.dozerGlow.width = (frontR.x - frontL.x) * 1.1;
    this.dozerGlow.height = 40;
    const target = surging ? 0.55 + (this.options.reducedMotion ? 0 : 0.15 * Math.sin(this.time * 0.02)) : 0;
    this.dozerGlow.alpha += (target - this.dozerGlow.alpha) * 0.15;
  }

  private makeTokenNode(symbolId: string, stack: number, born: number, id: number): TokenNode {
    const root = new Container();
    const shadow = new Sprite(this.tex.shadow);
    shadow.anchor.set(0.5);
    this.shadowLayer.addChild(shadow);
    const ring = new Sprite(this.tex.ring);
    ring.anchor.set(0.5);
    ring.blendMode = 'add';
    ring.tint = 0xa5f3fc;
    ring.visible = false;
    const node: TokenNode = { root, shadow, ring, layers: [], symbolId, born, tilt: hash01(id * 1.618) - 0.5 };
    this.ensureLayers(node, stack);
    root.addChild(ring);
    this.tokenLayer.addChild(root);
    return node;
  }

  private ensureLayers(node: TokenNode, stack: number): void {
    while (node.layers.length < stack) {
      const layer = this.makeCoinParts(node.symbolId);
      node.root.addChildAt(layer.bottom, node.layers.length * 3);
      node.root.addChildAt(layer.side, node.layers.length * 3 + 1);
      node.root.addChildAt(layer.face, node.layers.length * 3 + 2);
      node.layers.push(layer);
    }
    while (node.layers.length > stack) {
      const layer = node.layers.pop()!;
      layer.bottom.destroy();
      layer.side.destroy();
      layer.face.destroy();
    }
  }

  private syncTokens(snap: SimSnapshot, initial: boolean): void {
    const seen = new Set<number>();
    const now = this.time;
    const rm = this.options.reducedMotion;
    for (const t of snap.tokens) {
      seen.add(t.id);
      const stack = Math.max(1, Math.min(6, Math.floor(t.stack || 1)));
      let node = this.tokens.get(t.id);
      if (!node || node.symbolId !== t.symbolId) {
        if (node) this.dropNode(node);
        node = this.makeTokenNode(t.symbolId, stack, initial ? -1e9 : now, t.id);
        this.tokens.set(t.id, node);
      } else if (node.layers.length !== stack) {
        this.ensureLayers(node, stack);
      }
      const p = projectShelf(t.x, t.y);
      const sc = p.scale;
      const rx = t.radius * sc * COIN_SCALE;
      const ry = rx * 0.6;
      const th = Math.max(1.8, t.radius * 0.32) * sc;
      const lift = clamp01(t.lift || 0);
      const liftPx = lift * 4 * sc;
      const age = now - node.born;
      const pop = rm ? 1 : age < 260 ? easeOutBack(clamp01(age / 260)) : 1;
      const drop = rm ? 0 : age < 260 ? (1 - clamp01(age / 200)) * 18 : 0;
      node.root.position.set(p.x, p.y - liftPx - drop);
      node.root.zIndex = p.y;
      node.root.rotation = node.tilt * 0.5 * lift;
      node.root.scale.set(pop);
      node.root.alpha = rm && age < 200 ? clamp01(age / 200) : 1;
      for (let i = 0; i < node.layers.length; i++) {
        const layer = node.layers[i]!;
        const base = -i * th;
        layer.bottom.position.set(0, base);
        layer.bottom.width = rx * 2;
        layer.bottom.height = ry * 2;
        layer.side.position.set(-rx, base - th);
        layer.side.width = rx * 2;
        layer.side.height = th;
        layer.face.position.set(0, base - th);
        layer.face.width = rx * 2;
        layer.face.height = ry * 2 * (1 + lift * 0.12);
        layer.face.tint = i === node.layers.length - 1 ? 0xffffff : 0xd9d9d9;
      }
      const top = -node.layers.length * th;
      if (t.welded) {
        node.ring.visible = true;
        node.ring.position.set(0, top);
        node.ring.width = rx * 2.9;
        node.ring.height = ry * 2.9;
        node.ring.alpha = 0.65 + (rm ? 0 : 0.25 * Math.sin(now * 0.008 + t.id));
      } else node.ring.visible = false;
      const spread = 1 + lift * 0.45 + (node.layers.length - 1) * 0.12;
      node.shadow.position.set(p.x + 1.6 * sc + liftPx * 0.4, p.y + 1.8 * sc);
      node.shadow.width = rx * 2.5 * spread;
      node.shadow.height = ry * 2.4 * spread;
      node.shadow.alpha = (0.72 - lift * 0.25) * pop;
    }
    for (const [id, node] of this.tokens) {
      if (seen.has(id)) continue;
      this.tokens.delete(id);
      this.dropNode(node);
    }
  }

  private dropNode(node: TokenNode): void {
    node.shadow.destroy();
    node.root.destroy({ children: true });
  }

  private drawChutes(dt: number): void {
    const rm = this.options.reducedMotion;
    for (let i = 0; i < this.chuteGlow.length; i++) {
      const heat = this.chuteHeat[i]!;
      const idle = rm ? 0.2 : 0.18 + 0.05 * Math.sin(this.time * 0.002 + i * 1.3);
      this.chuteGlow[i]!.alpha = idle + heat * 0.85;
      this.chuteBeam[i]!.alpha = heat * 0.75;
      const pop = rm ? 1 : 1 + 0.45 * easeOutBack(heat) * heat;
      this.chuteLabel[i]!.scale.set(pop);
      this.chuteHeat[i] = heat * Math.exp(-dt * 3.2);
    }
    this.lipGlow.alpha = Math.min(1, 0.12 + (rm ? 0 : 0.04 * Math.sin(this.time * 0.003)) + this.lipHeat * 0.6);
    this.lipGlow.height = 30 + this.lipHeat * 18;
    this.lipHeat *= Math.exp(-dt * 2.6);
    for (let s = 0; s < 2; s++) {
      this.gutterGlow[s]!.alpha = this.gutterHeat[s]! * 0.75;
      this.gutterHeat[s] = this.gutterHeat[s]! * Math.exp(-dt * 2.8);
    }
  }

  private stepParticles(dtMs: number): void {
    const dt = dtMs / 1000;
    const rm = this.options.reducedMotion;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.age += dtMs;
      if (p.age >= p.life) {
        p.sprite.visible = false;
        this.particlePool.push(p.sprite);
        this.particles.splice(i, 1);
        continue;
      }
      const k = p.age / p.life;
      if (!rm) {
        p.vx *= Math.exp(-p.drag * dt);
        p.vy = p.vy * Math.exp(-p.drag * dt) + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      const size = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
      p.sprite.position.set(p.x, p.y);
      if (p.stretch > 0 && !rm) {
        const speed = Math.hypot(p.vx, p.vy);
        p.sprite.rotation = Math.atan2(p.vy, p.vx);
        p.sprite.width = size * (1 + Math.min(3, speed / 60) * p.stretch);
        p.sprite.height = size;
      } else {
        p.sprite.rotation = 0;
        p.sprite.width = size;
        p.sprite.height = size * (p.stretch < 0 ? 1 + p.stretch : 1);
      }
      p.sprite.alpha = p.a0 * (1 - k) * (k < 0.1 ? k * 10 : 1);
    }
  }

  private stepFalling(dtMs: number): void {
    const dt = dtMs / 1000;
    const rm = this.options.reducedMotion;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const c = this.falling[i]!;
      c.age += dtMs;
      if (c.age >= c.life) {
        c.root.destroy({ children: true });
        this.falling.splice(i, 1);
        continue;
      }
      const k = c.age / c.life;
      if (!rm) {
        c.vy += (c.gutter ? 260 : 520) * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
      }
      const tumble = rm ? 1 : Math.cos(Math.min(Math.PI * 0.5, c.age * 0.001 * c.spin * 0.4));
      const ry = c.rx * 0.6 * Math.max(0.12, Math.abs(tumble));
      const th = Math.max(1.5, c.rx * 0.32);
      const shrink = c.gutter ? 1 - k * 0.5 : 1;
      c.root.position.set(c.x, c.y);
      c.root.rotation = rm ? 0 : (c.gutter ? -1 : 1) * k * 0.6 * Math.sign(c.vx || 1);
      c.root.scale.set(shrink);
      c.bottom.position.set(0, 0);
      c.bottom.width = c.rx * 2;
      c.bottom.height = ry * 2;
      c.side.position.set(-c.rx, -th);
      c.side.width = c.rx * 2;
      c.side.height = th;
      c.face.position.set(0, -th);
      c.face.width = c.rx * 2;
      c.face.height = ry * 2;
      if (c.gutter) c.face.tint = c.side.tint = 0xffffff - Math.round(k * 0x90) * 0x10101;
      c.root.alpha = k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1;
    }
  }

  private stepPopups(dtMs: number): void {
    const rm = this.options.reducedMotion;
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]!;
      p.age += dtMs;
      if (p.age >= p.life) {
        p.text.visible = false;
        this.popupPool.push(p.text);
        this.popups.splice(i, 1);
        continue;
      }
      const k = p.age / p.life;
      const rise = rm ? 0 : p.rise * (1 - (1 - k) ** 3);
      p.text.position.set(p.x, p.y - rise);
      const s = rm ? 1 : k < 0.18 ? 0.5 + 0.7 * easeOutBack(k / 0.18) : 1.2 - Math.min(0.2, (k - 0.18) * 0.6);
      p.text.scale.set(s * (p.big ? 1.05 : 1));
      p.text.alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : rm ? clamp01(k * 8) : 1;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.repaintTimer);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    const app = this.app;
    this.app = null;
    if (app) {
      try {
        app.destroy(true, { children: true, texture: true });
      } catch {
        // already torn down
      }
    }
  }
}

function formatMult(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function createBoardScene(host: HTMLElement, options: BoardSceneOptions = {}): Promise<BoardScene | null> {
  return BoardScene.create(host, options);
}
