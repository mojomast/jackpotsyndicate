import { BOARD, SIM } from '@jackpotsyndicate/contracts';
import type { BodyId, OrbSpec, PegDef, PegKind, PhysicsEvent, TokenTemplate } from '@jackpotsyndicate/contracts';
import { ByteReader, ByteWriter } from '../kernel/bytes';
import { allocId, type SimContext } from '../kernel/context';
import { clamp } from '../kernel/math';
import type { PusherChamber } from '../pusher/chamber';

interface Orb {
  id: BodyId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  symbolId: string;
  mass: number;
  elasticity: number;
  canSplit: boolean;
  splitOnFirstPeg: boolean;
  magnet: boolean;
  accelPerHit: number;
  accel: number;
  chainGold: boolean;
  upgradesPegs: boolean;
  hits: number;
  age: number;
  token: TokenTemplate;
}

interface Peg extends PegDef {
  flash: number;
}

const CX = BOARD.W / 2;
const R = BOARD.ORB_RADIUS;
const CHUTE_TOP = BOARD.SPLIT_Y - BOARD.CHUTE_H;
const CHUTE_W = BOARD.W / BOARD.CHUTE_COUNT;

/**
 * Stage 2: the pinfield. Orbs fall under mass-scaled gravity, reflect off
 * pegs with their own elasticity plus a small seeded jitter, and leave through
 * one of five chutes. The exit X is handed straight to the pusher so the
 * token lands under the chute the orb left by.
 *
 * Orbs do not collide with each other (matches the prototype; keeps the
 * pinfield readable with many orbs in flight).
 */
export class PachinkoChamber {
  orbs: Orb[] = [];
  queue: Orb[] = [];
  pegs: Peg[] = [];

  constructor(private ctx: SimContext) {}

  setPegs(defs: PegDef[]): void {
    this.pegs = defs.map((p) => ({ ...p, flash: 0 }));
  }

  launch(spec: OrbSpec): BodyId {
    const orb = this.make(spec, allocId(this.ctx));
    this.queue.push(orb);
    return orb.id;
  }

  private make(spec: OrbSpec, id: BodyId): Orb {
    return {
      id,
      x: clamp(spec.x, R, BOARD.W - R),
      y: BOARD.LAUNCH_Y,
      vx: 0,
      vy: 0,
      symbolId: spec.symbolId,
      mass: spec.mass,
      elasticity: spec.elasticity,
      canSplit: spec.canSplit,
      splitOnFirstPeg: spec.splitOnFirstPeg,
      magnet: spec.magnet,
      accelPerHit: spec.accelPerHit,
      accel: 1,
      chainGold: spec.chainGold,
      upgradesPegs: spec.upgradesPegs,
      hits: 0,
      age: 0,
      token: { ...spec.token },
    };
  }

  clear(): void {
    this.orbs.length = 0;
    this.queue.length = 0;
  }

  step(events: PhysicsEvent[], pusher: PusherChamber): void {
    const { tune, rng, mods } = this.ctx;
    const orbs = this.orbs;

    // One queued orb may enter per tick while under the cap.
    if (this.queue.length > 0 && orbs.length < SIM.MAX_ORBS_IN_FLIGHT) {
      const o = this.queue.shift()!;
      o.vx = rng.range(-tune.ORB_LAUNCH_VX, tune.ORB_LAUNCH_VX);
      o.vy = tune.ORB_LAUNCH_VY;
      orbs.push(o);
      events.push({ t: 'OrbLaunched', orbId: o.id, x: o.x, symbolId: o.symbolId });
    }

    for (const p of this.pegs) if (p.flash > 0) p.flash--;

    // Skull aura: magnet orbs drag nearby orbs toward the centre line.
    const mr2 = tune.MAGNET_ORB_RANGE * tune.MAGNET_ORB_RANGE;
    for (const m of orbs) {
      if (!m.magnet) continue;
      for (const o of orbs) {
        const dx = o.x - m.x;
        const dy = o.y - m.y;
        if (dx * dx + dy * dy < mr2) o.vx += (CX - o.x) * tune.CENTER_PULL_ORB;
      }
    }

    // Orbs appended by splits this tick are stepped next tick.
    const count = orbs.length;
    const exited: number[] = [];
    for (let i = 0; i < count; i++) {
      const o = orbs[i]!;
      o.age++;
      o.vy += SIM.GRAVITY * o.mass;
      if (mods.centerPullOrbs !== 0) o.vx += (CX - o.x) * tune.CENTER_PULL_ORB * mods.centerPullOrbs;

      const cap = tune.ORB_MAX_SPEED;
      o.vx = clamp(o.vx, -cap, cap);
      o.vy = clamp(o.vy, -cap, cap);
      o.x += o.vx;
      o.y += o.vy;

      if (o.x < R) {
        o.x = R;
        o.vx *= -SIM.WALL_RESTITUTION;
      } else if (o.x > BOARD.W - R) {
        o.x = BOARD.W - R;
        o.vx *= -SIM.WALL_RESTITUTION;
      }
      if (o.y < R) {
        o.y = R;
        if (o.vy < 0) o.vy *= -SIM.WALL_RESTITUTION;
      }

      for (let j = 0; j < this.pegs.length; j++) {
        const peg = this.pegs[j]!;
        const dx = o.x - peg.x;
        const dy = o.y - peg.y;
        const minD = R + peg.radius;
        if (dx > minD || dx < -minD || dy > minD || dy < -minD) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 < 1e-9) continue;
        const dist = Math.sqrt(d2);
        const nx = dx / dist;
        const ny = dy / dist;
        o.x = peg.x + nx * minD;
        o.y = peg.y + ny * minD;
        const dot = o.vx * nx + o.vy * ny;
        if (dot >= 0) continue; // already separating: reposition only

        const bouncy = peg.kind === 'bumper' || peg.kind === 'golden';
        const rest = bouncy ? SIM.BUMPER_RESTITUTION : o.elasticity;
        o.vx = (o.vx - 2 * dot * nx) * rest + rng.range(-tune.PEG_JITTER, tune.PEG_JITTER);
        o.vy = (o.vy - 2 * dot * ny) * rest;
        if (o.accelPerHit > 0 && o.accel < tune.ACCEL_CAP) {
          const k = Math.min(1 + o.accelPerHit, tune.ACCEL_CAP / o.accel);
          o.accel *= k;
          o.vx *= k;
          o.vy *= k;
        }

        o.hits++;
        peg.flash = tune.PEG_FLASH_TICKS;
        const kindAtHit: PegKind = peg.kind;
        events.push({ t: 'PegHit', orbId: o.id, pegId: peg.id, kind: kindAtHit, hitIndex: o.hits, chained: false });

        if (o.chainGold && kindAtHit === 'gold') {
          const c2 = tune.CHAIN_GOLD_RANGE * tune.CHAIN_GOLD_RANGE;
          for (const q of this.pegs) {
            if (q === peg || q.kind !== 'gold') continue;
            const qx = q.x - peg.x;
            const qy = q.y - peg.y;
            if (qx * qx + qy * qy <= c2) {
              q.flash = tune.PEG_FLASH_TICKS;
              events.push({ t: 'PegHit', orbId: o.id, pegId: q.id, kind: 'gold', hitIndex: o.hits, chained: true });
            }
          }
        }
        if (o.upgradesPegs && kindAtHit === 'gold') {
          peg.kind = 'golden';
          peg.radius = tune.GOLDEN_PEG_RADIUS;
          events.push({ t: 'PegUpgraded', pegId: peg.id });
        }

        const wantsSplit = (kindAtHit === 'splitter' && o.canSplit) || (o.splitOnFirstPeg && o.hits === 1);
        if (wantsSplit && orbs.length < SIM.MAX_ORBS_IN_FLIGHT) {
          o.canSplit = false;
          o.splitOnFirstPeg = false;
          const child: Orb = {
            ...o,
            id: allocId(this.ctx),
            x: clamp(o.x + tune.SPLIT_OFFSET_X, R, BOARD.W - R),
            vx: -o.vx + rng.range(-tune.PEG_JITTER, tune.PEG_JITTER),
            token: { ...o.token },
          };
          orbs.push(child);
          events.push({ t: 'OrbSplit', parentId: o.id, childId: child.id });
        }
      }

      if (o.age > SIM.ORB_MAX_AGE_TICKS && o.y < CHUTE_TOP) {
        o.y = CHUTE_TOP;
        events.push({ t: 'OrbForcedDown', orbId: o.id });
      }
      if (o.y >= CHUTE_TOP) exited.push(i);
    }

    // Hand exits to the pusher in orb order, then remove (reverse keeps indices valid).
    for (const i of exited) {
      const o = orbs[i]!;
      const chute = clamp(Math.floor(o.x / CHUTE_W), 0, BOARD.CHUTE_COUNT - 1);
      const merged: BodyId[] = [];
      const tokenIds = pusher.spawn({ ...o.token, x: o.x, y: BOARD.TOKEN_SPAWN_Y }, events, merged);
      events.push({ t: 'ChuteExit', orbId: o.id, symbolId: o.symbolId, chute, x: o.x, tokenIds, mergedInto: merged });
    }
    for (let k = exited.length - 1; k >= 0; k--) orbs.splice(exited[k]!, 1);
  }

  // ---------------------------------------------------------- serialization

  write(w: ByteWriter): void {
    w.u32(this.pegs.length);
    for (const p of this.pegs) {
      w.i32(p.id);
      w.f64(p.x);
      w.f64(p.y);
      w.u8(PEG_KINDS.indexOf(p.kind));
      w.f64(p.radius);
      w.i32(p.flash);
    }
    for (const list of [this.orbs, this.queue]) {
      w.u32(list.length);
      for (const o of list) writeOrb(w, o);
    }
  }

  read(r: ByteReader): void {
    const n = r.u32();
    this.pegs = [];
    for (let i = 0; i < n; i++) {
      this.pegs.push({ id: r.i32(), x: r.f64(), y: r.f64(), kind: PEG_KINDS[r.u8()]!, radius: r.f64(), flash: r.i32() });
    }
    this.orbs = readOrbs(r);
    this.queue = readOrbs(r);
  }
}

const PEG_KINDS: PegKind[] = ['gold', 'splitter', 'bumper', 'golden'];

function writeOrb(w: ByteWriter, o: Orb): void {
  w.i32(o.id);
  w.f64(o.x);
  w.f64(o.y);
  w.f64(o.vx);
  w.f64(o.vy);
  w.str(o.symbolId);
  w.f64(o.mass);
  w.f64(o.elasticity);
  w.bool(o.canSplit);
  w.bool(o.splitOnFirstPeg);
  w.bool(o.magnet);
  w.f64(o.accelPerHit);
  w.f64(o.accel);
  w.bool(o.chainGold);
  w.bool(o.upgradesPegs);
  w.i32(o.hits);
  w.i32(o.age);
  const t = o.token;
  w.str(t.symbolId);
  w.str(t.skin);
  w.f64(t.radius);
  w.f64(t.mass);
  w.f64(t.slide);
  w.i32(t.count);
  w.i32(t.stack);
  w.bool(t.weldOnLand);
  w.bool(t.magnetic);
  w.bool(t.seismic);
  w.bool(t.resistSuction);
}

function readOrbs(r: ByteReader): Orb[] {
  const n = r.u32();
  const out: Orb[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: r.i32(),
      x: r.f64(),
      y: r.f64(),
      vx: r.f64(),
      vy: r.f64(),
      symbolId: r.str(),
      mass: r.f64(),
      elasticity: r.f64(),
      canSplit: r.bool(),
      splitOnFirstPeg: r.bool(),
      magnet: r.bool(),
      accelPerHit: r.f64(),
      accel: r.f64(),
      chainGold: r.bool(),
      upgradesPegs: r.bool(),
      hits: r.i32(),
      age: r.i32(),
      token: {
        symbolId: r.str(),
        skin: r.str(),
        radius: r.f64(),
        mass: r.f64(),
        slide: r.f64(),
        count: r.i32(),
        stack: r.i32(),
        weldOnLand: r.bool(),
        magnetic: r.bool(),
        seismic: r.bool(),
        resistSuction: r.bool(),
      },
    });
  }
  return out;
}
