import { DEFAULT_MODIFIERS } from '@jackpotsyndicate/contracts';
import type {
  BodyId,
  FloorPhysics,
  OrbSpec,
  PhysicsEvent,
  PhysicsModifiers,
  SimDirective,
  SimSnapshot,
  SimWorld,
  TokenSpec,
} from '@jackpotsyndicate/contracts';
import { ByteReader, ByteWriter, hashBytes } from './kernel/bytes';
import type { SimContext } from './kernel/context';
import { Prng } from './kernel/prng';
import { TUNE, type Tuning } from './kernel/tuning';
import { PachinkoChamber } from './pachinko/chamber';
import { makeStandardPegLayout } from './pachinko/layout';
import { PusherChamber } from './pusher/chamber';

const FORMAT_VERSION = 1;

export const NEON_FLOOR_PHYSICS: FloorPhysics = {
  friction: 0.9,
  gutterRisk: 1.0,
  dozerSpeed: 0.05,
  pegs: makeStandardPegLayout(),
};

class World implements SimWorld {
  private ctx: SimContext;
  private pachinko: PachinkoChamber;
  private pusher: PusherChamber;
  private _tick = 0;
  /** Events produced outside step() (spawns, directives); flushed by the next step. */
  private pending: PhysicsEvent[] = [];

  constructor(seed: number, tuning?: Partial<Tuning>) {
    this.ctx = {
      rng: new Prng(seed),
      tune: { ...TUNE, ...tuning },
      floor: { ...NEON_FLOOR_PHYSICS, pegs: [] },
      mods: cloneMods(DEFAULT_MODIFIERS),
      nextId: 1,
    };
    this.pachinko = new PachinkoChamber(this.ctx);
    this.pusher = new PusherChamber(this.ctx);
    this.pachinko.setPegs(NEON_FLOOR_PHYSICS.pegs);
  }

  get tick(): number {
    return this._tick;
  }

  configure(floor: FloorPhysics, mods: PhysicsModifiers, resetPegs: boolean): void {
    this.ctx.floor = { friction: floor.friction, gutterRisk: floor.gutterRisk, dozerSpeed: floor.dozerSpeed, pegs: [] };
    this.ctx.mods = cloneMods(mods);
    if (resetPegs) this.pachinko.setPegs(floor.pegs);
  }

  setModifiers(mods: PhysicsModifiers): void {
    this.ctx.mods = cloneMods(mods);
  }

  launchOrb(spec: OrbSpec): BodyId {
    return this.pachinko.launch(spec);
  }

  spawnToken(spec: TokenSpec): BodyId[] {
    return this.pusher.spawn(spec, this.pending);
  }

  applyDirective(d: SimDirective): void {
    if (d.t === 'clearOrbs') this.pachinko.clear();
    else this.pusher.directive(d, this.pending);
  }

  drainEvents(): PhysicsEvent[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  step(): PhysicsEvent[] {
    const events = this.pending;
    this.pending = [];
    this._tick++;
    this.pachinko.step(events, this.pusher);
    this.pusher.step(events);
    return events;
  }

  counts(): { orbs: number; queued: number; tokens: number } {
    return { orbs: this.pachinko.orbs.length, queued: this.pachinko.queue.length, tokens: this.pusher.tokens.length };
  }

  snapshot(): SimSnapshot {
    const p = this.pusher;
    return {
      tick: this._tick,
      dozer: { frontY: p.frontY, stroke: p.stroke, surging: p.surgeTicks > 0, reciprocations: p.reciprocations },
      suction: this.ctx.mods.suction,
      pegs: this.pachinko.pegs.map((g) => ({ id: g.id, x: g.x, y: g.y, kind: g.kind, radius: g.radius, flash: g.flash })),
      orbs: this.pachinko.orbs.map((o) => ({ id: o.id, x: o.x, y: o.y, vx: o.vx, vy: o.vy, radius: 9, symbolId: o.symbolId })),
      tokens: p.tokens.map((t) => ({
        id: t.id,
        x: t.x,
        y: t.y,
        vx: t.vx,
        vy: t.vy,
        radius: t.radius,
        symbolId: t.symbolId,
        skin: t.skin,
        stack: t.stack,
        welded: t.welded,
        lift: t.lift,
      })),
      queuedOrbs: this.pachinko.queue.length,
    };
  }

  serialize(): Uint8Array {
    const w = new ByteWriter();
    w.u8(FORMAT_VERSION);
    w.i32(this._tick);
    w.i32(this.ctx.nextId);
    for (const s of this.ctx.rng.getState()) w.i32(s);
    const f = this.ctx.floor;
    w.f64(f.friction);
    w.f64(f.gutterRisk);
    w.f64(f.dozerSpeed);
    const m = this.ctx.mods;
    w.f64(m.dozerSpeedMul);
    w.f64(m.dozerStrokeMul);
    w.f64(m.centerPullOrbs);
    w.f64(m.centerPullTokens);
    w.f64(m.suction);
    w.u32(m.gutterBounceChances.length);
    for (const c of m.gutterBounceChances) w.f64(c);
    this.pachinko.write(w);
    this.pusher.write(w);
    return w.finish();
  }

  deserialize(bytes: Uint8Array): void {
    const r = new ByteReader(bytes);
    const v = r.u8();
    if (v !== FORMAT_VERSION) throw new Error(`SimWorld.deserialize: unsupported format ${v}`);
    this._tick = r.i32();
    this.ctx.nextId = r.i32();
    this.ctx.rng.setState([r.i32(), r.i32(), r.i32(), r.i32()]);
    this.ctx.floor = { friction: r.f64(), gutterRisk: r.f64(), dozerSpeed: r.f64(), pegs: [] };
    const mods: PhysicsModifiers = {
      dozerSpeedMul: r.f64(),
      dozerStrokeMul: r.f64(),
      centerPullOrbs: r.f64(),
      centerPullTokens: r.f64(),
      suction: r.f64(),
      gutterBounceChances: [],
    };
    const n = r.u32();
    for (let i = 0; i < n; i++) mods.gutterBounceChances.push(r.f64());
    this.ctx.mods = mods;
    this.pachinko.read(r);
    this.pusher.read(r);
    this.pending = [];
    if (!r.done) throw new Error('SimWorld.deserialize: trailing bytes');
  }

  hash(): string {
    return hashBytes(this.serialize());
  }
}

function cloneMods(m: PhysicsModifiers): PhysicsModifiers {
  return { ...m, gutterBounceChances: [...m.gutterBounceChances] };
}

/**
 * Create a simulation. `tuning` overrides are for the harness and tests only;
 * game code must use the defaults so saves and replays stay compatible.
 */
export function createSimWorld(seed: number, tuning?: Partial<Tuning>): SimWorld {
  return new World(seed, tuning);
}
