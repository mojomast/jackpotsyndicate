import { BOARD, SIM } from '@jackpotsyndicate/contracts';
import type { BodyId, ExitInfo, PhysicsEvent, SimDirective, TokenSpec, TokenTemplate } from '@jackpotsyndicate/contracts';
import { ByteReader, ByteWriter } from '../kernel/bytes';
import { allocId, type SimContext } from '../kernel/context';
import { clamp, HALF_PI, sinLookup, TWO_PI } from '../kernel/math';

interface Token {
  id: BodyId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  slide: number;
  symbolId: string;
  skin: string;
  stack: number;
  welded: boolean;
  magnetic: boolean;
  seismic: boolean;
  resistSuction: boolean;
  lift: number;
}

interface Weld {
  a: BodyId;
  b: BodyId;
  rest: number;
}

const CX = BOARD.W / 2;
const SHELF_LEFT = BOARD.GUTTER_W;
const SHELF_RIGHT = BOARD.W - BOARD.GUTTER_W;

/**
 * Stage 3: the coin pusher shelf, seen from above.
 *
 * Model: position-based dynamics. Each tick tokens are advected by their
 * velocity, then a few relaxation passes enforce (1) the dozer blade as an
 * immovable back wall, (2) non-overlap between tokens, mass-weighted, and
 * (3) weld distance constraints. Velocity is then re-derived from the net
 * displacement and damped by friction, so a shoved coin keeps sliding for a
 * moment and a squeezed pile settles instead of ringing.
 *
 * The shelf has no side walls: a coin squeezed past either edge is lost to
 * the house gutter. Sideways squeeze is scaled by the floor's gutterRisk.
 *
 * Iteration order is always array order and removal preserves order, so the
 * result depends only on state, never on timing or hashing.
 */
export class PusherChamber {
  tokens: Token[] = [];
  welds: Weld[] = [];
  phase = 0;
  stroke: number = BOARD.DOZER_STROKE;
  surgeTicks = 0;
  reciprocations = 0;
  frontY: number = BOARD.DOZER_BACK_Y;

  // scratch (not state)
  private px = new Float64Array(SIM.MAX_TOKENS + 16);
  private py = new Float64Array(SIM.MAX_TOKENS + 16);
  private press = new Float64Array(SIM.MAX_TOKENS + 16);

  constructor(private ctx: SimContext) {}

  // ------------------------------------------------------------------ spawn

  /** Spawn the token(s) described by a template. Returns ids; `merged` gets absorbers at cap. */
  spawn(spec: TokenSpec, events: PhysicsEvent[], merged?: BodyId[]): BodyId[] {
    const ids: BodyId[] = [];
    const n = Math.max(1, spec.count | 0);
    for (let k = 0; k < n; k++) {
      // Multiple tokens fan out sideways so they do not start perfectly stacked.
      const off = n === 1 ? 0 : (k - (n - 1) / 2) * (spec.radius * 2 + 1);
      const x = clamp(spec.x + off, SHELF_LEFT + spec.radius + 6, SHELF_RIGHT - spec.radius - 6);
      const y = clamp(spec.y, BOARD.DOZER_BACK_Y + spec.radius, BOARD.LIP_Y - spec.radius - 2);

      if (this.tokens.length >= SIM.MAX_TOKENS) {
        const into = this.nearest(x, y, -1);
        if (into) {
          into.stack = Math.min(this.ctx.tune.MAX_VISUAL_STACK, into.stack + 1);
          merged?.push(into.id);
          events.push({ t: 'TokenMerged', intoId: into.id, symbolId: spec.symbolId });
        }
        continue;
      }

      const tok: Token = {
        id: allocId(this.ctx),
        x,
        y,
        vx: 0,
        vy: 0,
        radius: spec.radius,
        mass: spec.mass,
        slide: spec.slide,
        symbolId: spec.symbolId,
        skin: spec.skin,
        stack: Math.max(1, spec.stack | 0),
        welded: false,
        magnetic: spec.magnetic,
        seismic: spec.seismic,
        resistSuction: spec.resistSuction,
        lift: 0,
      };
      if (spec.weldOnLand) this.weld(tok, events);
      this.tokens.push(tok);
      ids.push(tok.id);
      events.push({ t: 'TokenSpawned', tokenId: tok.id, x, y, symbolId: tok.symbolId });
    }
    return ids;
  }

  private nearest(x: number, y: number, excludeId: BodyId): Token | null {
    let best: Token | null = null;
    let bestD = Infinity;
    for (const t of this.tokens) {
      if (t.id === excludeId) continue;
      const dx = t.x - x;
      const dy = t.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private weld(tok: Token, events: PhysicsEvent[]): void {
    const { WELD_RANGE, WELD_PARTNERS } = this.ctx.tune;
    const cands: { t: Token; d: number }[] = [];
    for (const o of this.tokens) {
      const dx = o.x - tok.x;
      const dy = o.y - tok.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= WELD_RANGE) cands.push({ t: o, d });
    }
    // Stable: distance, then id.
    cands.sort((p, q) => p.d - q.d || p.t.id - q.t.id);
    const partners: BodyId[] = [];
    for (let i = 0; i < cands.length && i < WELD_PARTNERS; i++) {
      const o = cands[i]!.t;
      this.welds.push({ a: tok.id, b: o.id, rest: tok.radius + o.radius + this.ctx.tune.CONTACT_SLOP });
      o.welded = true;
      partners.push(o.id);
    }
    if (partners.length > 0) {
      tok.welded = true;
      events.push({ t: 'WeldFormed', tokenId: tok.id, partnerIds: partners });
    }
  }

  // ------------------------------------------------------------- directives

  directive(d: SimDirective, events: PhysicsEvent[]): void {
    const { rng, tune } = this.ctx;
    switch (d.t) {
      case 'surge':
        if (this.surgeTicks === 0) events.push({ t: 'SurgeStarted' });
        this.surgeTicks = BOARD.SURGE_TICKS;
        break;
      case 'seedShelf':
        for (const tpl of d.tokens) {
          const x = rng.range(SHELF_LEFT + 28, SHELF_RIGHT - 28);
          const y = rng.range(BOARD.DOZER_BACK_Y + BOARD.DOZER_STROKE + 20, BOARD.LIP_Y - 24);
          this.spawn({ ...tpl, x, y }, events);
        }
        break;
      case 'dropIceBlocks':
        for (let i = 0; i < d.count; i++) {
          const x = rng.range(SHELF_LEFT + 80, SHELF_RIGHT - 80);
          this.spawn({ ...ICE_TEMPLATE, radius: tune.ICE_RADIUS, mass: tune.ICE_MASS, x, y: BOARD.LIP_Y - 26 }, events);
        }
        break;
      case 'sweepCenter': {
        for (let n = 0; n < d.count; n++) {
          let best = -1;
          let bestD = Infinity;
          for (let i = 0; i < this.tokens.length; i++) {
            const t = this.tokens[i]!;
            if (t.welded) continue;
            const dist = Math.abs(t.x - CX);
            if (dist < bestD || (dist === bestD && t.id < this.tokens[best]!.id)) {
              bestD = dist;
              best = i;
            }
          }
          if (best < 0) break;
          const t = this.tokens[best]!;
          this.remove(best);
          events.push({ t: 'TokenRemoved', tokenId: t.id, reason: 'sweep' });
        }
        break;
      }
      case 'nudgeForward':
        for (const t of this.tokens) t.vy += d.distance * (1 - this.damping(t));
        break;
      case 'clearShelf':
        for (const t of this.tokens) events.push({ t: 'TokenRemoved', tokenId: t.id, reason: 'clear' });
        this.tokens.length = 0;
        this.welds.length = 0;
        break;
      case 'clearOrbs':
        break; // handled by the pinfield
    }
  }

  private remove(index: number): void {
    const t = this.tokens[index]!;
    this.tokens.splice(index, 1);
    if (!t.welded) return;
    // Drop this token's welds, then clear `welded` on partners left with none.
    const touched: BodyId[] = [];
    this.welds = this.welds.filter((w) => {
      if (w.a === t.id) {
        touched.push(w.b);
        return false;
      }
      if (w.b === t.id) {
        touched.push(w.a);
        return false;
      }
      return true;
    });
    for (const id of touched) {
      if (this.welds.some((w) => w.a === id || w.b === id)) continue;
      const p = this.tokens.find((o) => o.id === id);
      if (p) p.welded = false;
    }
  }

  /** Width of the sloped strip along each gutter, in board units. */
  bevelWidth(): number {
    const { tune, floor } = this.ctx;
    return clamp(tune.EDGE_ZONE * powInt(floor.gutterRisk, tune.EDGE_RISK_POWER) + tune.EDGE_ZONE_OFFSET, 0, 120);
  }

  private damping(t: Token): number {
    const { SLIDE_GAIN, DAMP_MIN, DAMP_MAX } = this.ctx.tune;
    return clamp(this.ctx.floor.friction + (0.5 - t.slide) * SLIDE_GAIN, DAMP_MIN, DAMP_MAX);
  }

  // ------------------------------------------------------------------- step

  step(events: PhysicsEvent[]): void {
    const { tune, floor, mods, rng } = this.ctx;
    const toks = this.tokens;

    // ---- dozer blade
    const surging = this.surgeTicks > 0;
    const speed = surging ? BOARD.SURGE_SPEED : floor.dozerSpeed * mods.dozerSpeedMul;
    const targetStroke = (surging ? BOARD.SURGE_STROKE : BOARD.DOZER_STROKE) * mods.dozerStrokeMul;
    if (this.stroke < targetStroke) this.stroke = Math.min(targetStroke, this.stroke + tune.STROKE_SLEW);
    else if (this.stroke > targetStroke) this.stroke = Math.max(targetStroke, this.stroke - tune.STROKE_SLEW);
    if (surging) {
      this.surgeTicks--;
      if (this.surgeTicks === 0) events.push({ t: 'SurgeEnded' });
    }
    const prevPhase = this.phase;
    let phase = prevPhase + speed;
    const fullExtension = prevPhase < HALF_PI && phase >= HALF_PI;
    if (phase >= TWO_PI) phase -= TWO_PI;
    this.phase = phase;
    this.frontY = BOARD.DOZER_BACK_Y + (sinLookup(phase) + 1) * 0.5 * this.stroke;
    const frontY = this.frontY;

    if (fullExtension) {
      this.reciprocations++;
      events.push({ t: 'DozerFullExtension', count: this.reciprocations });
      // Uranium shockwave: neighbours get a shove that carries them SEISMIC_PUSH units.
      const r2 = tune.SEISMIC_RANGE * tune.SEISMIC_RANGE;
      for (const s of toks) {
        if (!s.seismic) continue;
        for (const o of toks) {
          if (o === s) continue;
          const dx = o.x - s.x;
          const dy = o.y - s.y;
          if (dx * dx + dy * dy < r2) o.vy += tune.SEISMIC_PUSH * (1 - this.damping(o));
        }
      }
    }

    // ---- forces
    // Edge bevel: the outer strip of the shelf slopes gently toward its gutter.
    // Its width scales with the floor's gutterRisk, which is what sets the rake.
    const bevel = this.bevelWidth();
    const drift = tune.EDGE_DRIFT;
    for (const t of toks) {
      if (mods.centerPullTokens !== 0) t.vx += (CX - t.x) * tune.CENTER_PULL_TOKEN * mods.centerPullTokens;
      if (mods.suction !== 0) {
        const dir = t.x < CX ? -1 : 1;
        const k = t.resistSuction || t.magnetic ? tune.SUCTION_RESIST : 1;
        t.vx += (dir * tune.SUCTION_ACCEL * mods.suction * k) / t.mass;
      }
      if (t.x < SHELF_LEFT + bevel) t.vx -= drift / t.mass;
      else if (t.x > SHELF_RIGHT - bevel) t.vx += drift / t.mass;
    }
    const mr2 = tune.MAGNET_TOKEN_RANGE * tune.MAGNET_TOKEN_RANGE;
    for (const m of toks) {
      if (!m.magnetic) continue;
      for (const o of toks) {
        const dx = o.x - m.x;
        const dy = o.y - m.y;
        if (dx * dx + dy * dy < mr2) o.vx += (CX - o.x) * tune.MAGNET_TOKEN_PULL;
      }
    }

    // ---- advect
    const n = toks.length;
    const px = this.px;
    const py = this.py;
    const press = this.press;
    for (let i = 0; i < n; i++) {
      const t = toks[i]!;
      px[i] = t.x;
      py[i] = t.y;
      press[i] = 0;
      t.x += t.vx;
      t.y += t.vy;
    }

    // ---- relax constraints
    const lat = clamp(tune.LATERAL_BASE * powInt(floor.gutterRisk, tune.LATERAL_RISK_POWER), 0, tune.LATERAL_MAX);
    const slop = tune.CONTACT_SLOP;
    const maxC = tune.MAX_CORRECTION;
    for (let iter = 0; iter < tune.ITERATIONS; iter++) {
      for (let i = 0; i < n; i++) {
        const t = toks[i]!;
        if (t.y - t.radius < frontY) t.y = frontY + t.radius;
      }
      for (let i = 0; i < n; i++) {
        const a = toks[i]!;
        for (let j = i + 1; j < n; j++) {
          const b = toks[j]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minD = a.radius + b.radius + slop;
          if (dx > minD || dx < -minD || dy > minD || dy < -minD) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD) continue;
          let nx: number;
          let ny: number;
          let dist: number;
          if (d2 > 1e-8) {
            dist = Math.sqrt(d2);
            nx = dx / dist;
            ny = dy / dist;
          } else {
            // Exactly coincident: separate along a fixed diagonal chosen by id parity.
            dist = 0;
            nx = (a.id + b.id) % 2 === 0 ? 0.7071067811865476 : -0.7071067811865476;
            ny = 0.7071067811865476;
          }
          let overlap = minD - dist;
          if (overlap > maxC) overlap = maxC;
          const inv = 1 / (a.mass + b.mass);
          const wa = b.mass * inv;
          const wb = a.mass * inv;
          const l = a.welded || b.welded ? lat * tune.WELD_LATERAL : lat;
          a.x -= nx * overlap * wa * l;
          a.y -= ny * overlap * wa;
          b.x += nx * overlap * wb * l;
          b.y += ny * overlap * wb;
          press[i] = press[i]! + overlap;
          press[j] = press[j]! + overlap;
        }
      }
      if (this.welds.length > 0) this.solveWelds();
    }
    for (let i = 0; i < n; i++) {
      const t = toks[i]!;
      if (t.y - t.radius < frontY) t.y = frontY + t.radius;
    }

    // ---- derive velocity, damp, cosmetic lift
    const maxV = tune.TOKEN_MAX_SPEED;
    for (let i = 0; i < n; i++) {
      const t = toks[i]!;
      const d = this.damping(t);
      let vx = (t.x - px[i]!) * d;
      let vy = (t.y - py[i]!) * d;
      vx = clamp(vx, -maxV, maxV);
      vy = clamp(vy, -maxV, maxV);
      if (vx < tune.SLEEP_SPEED && vx > -tune.SLEEP_SPEED) vx = 0;
      if (vy < tune.SLEEP_SPEED && vy > -tune.SLEEP_SPEED) vy = 0;
      t.vx = vx;
      t.vy = vy;
      const target = press[i]! > 2 ? 1 : press[i]! * 0.5;
      t.lift += (target - t.lift) * tune.LIFT_SMOOTH;
    }

    // ---- exits (reverse so removal keeps earlier indices valid)
    for (let i = toks.length - 1; i >= 0; i--) {
      const t = toks[i]!;
      const overLeft = t.x - t.radius < SHELF_LEFT - tune.GUTTER_OVERHANG;
      const overRight = t.x + t.radius > SHELF_RIGHT + tune.GUTTER_OVERHANG;
      if (overLeft || overRight) {
        const side = overLeft ? 'left' : 'right';
        let bounced = false;
        for (const chance of mods.gutterBounceChances) {
          // Every chance consumes one roll so the stream does not depend on outcomes.
          if (rng.next() < chance) bounced = true;
        }
        if (bounced) {
          t.x = overLeft ? SHELF_LEFT + t.radius + tune.BOUNCE_INSET : SHELF_RIGHT - t.radius - tune.BOUNCE_INSET;
          t.vx = overLeft ? tune.BOUNCE_VX : -tune.BOUNCE_VX;
          events.push({ t: 'GutterBounce', tokenId: t.id, side });
          continue;
        }
        const info = exitInfo(t);
        this.remove(i);
        events.push({ t: 'GutterLoss', side, ...info });
        continue;
      }
      if (t.y + t.radius * tune.LIP_OVERHANG >= BOARD.LIP_Y) {
        const info = exitInfo(t);
        this.remove(i);
        events.push({ t: 'LipDrop', ...info });
      }
    }
  }

  private solveWelds(): void {
    const byId = new Map<BodyId, Token>();
    for (const t of this.tokens) byId.set(t.id, t);
    for (const w of this.welds) {
      const a = byId.get(w.a);
      const b = byId.get(w.b);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-6) continue;
      const diff = (d - w.rest) / d;
      const inv = 1 / (a.mass + b.mass);
      const wa = b.mass * inv;
      const wb = a.mass * inv;
      a.x += dx * diff * wa;
      a.y += dy * diff * wa;
      b.x -= dx * diff * wb;
      b.y -= dy * diff * wb;
    }
  }

  // ---------------------------------------------------------- serialization

  write(w: ByteWriter): void {
    w.f64(this.phase);
    w.f64(this.stroke);
    w.f64(this.frontY);
    w.i32(this.surgeTicks);
    w.i32(this.reciprocations);
    w.u32(this.tokens.length);
    for (const t of this.tokens) {
      w.i32(t.id);
      w.f64(t.x);
      w.f64(t.y);
      w.f64(t.vx);
      w.f64(t.vy);
      w.f64(t.radius);
      w.f64(t.mass);
      w.f64(t.slide);
      w.str(t.symbolId);
      w.str(t.skin);
      w.i32(t.stack);
      w.bool(t.welded);
      w.bool(t.magnetic);
      w.bool(t.seismic);
      w.bool(t.resistSuction);
      w.f64(t.lift);
    }
    w.u32(this.welds.length);
    for (const wd of this.welds) {
      w.i32(wd.a);
      w.i32(wd.b);
      w.f64(wd.rest);
    }
  }

  read(r: ByteReader): void {
    this.phase = r.f64();
    this.stroke = r.f64();
    this.frontY = r.f64();
    this.surgeTicks = r.i32();
    this.reciprocations = r.i32();
    const n = r.u32();
    this.tokens = [];
    for (let i = 0; i < n; i++) {
      this.tokens.push({
        id: r.i32(),
        x: r.f64(),
        y: r.f64(),
        vx: r.f64(),
        vy: r.f64(),
        radius: r.f64(),
        mass: r.f64(),
        slide: r.f64(),
        symbolId: r.str(),
        skin: r.str(),
        stack: r.i32(),
        welded: r.bool(),
        magnetic: r.bool(),
        seismic: r.bool(),
        resistSuction: r.bool(),
        lift: r.f64(),
      });
    }
    const m = r.u32();
    this.welds = [];
    for (let i = 0; i < m; i++) this.welds.push({ a: r.i32(), b: r.i32(), rest: r.f64() });
  }
}

function exitInfo(t: Token): ExitInfo {
  return {
    tokenId: t.id,
    symbolId: t.symbolId,
    skin: t.skin,
    x: t.x,
    y: t.y,
    vx: t.vx,
    vy: t.vy,
    radius: t.radius,
    stack: t.stack,
    magnetic: t.magnetic,
  };
}

/** x^p for small non-negative integer p without Math.pow. */
function powInt(x: number, p: number): number {
  let out = 1;
  for (let i = 0; i < p; i++) out *= x;
  return out;
}

export const ICE_TEMPLATE: TokenTemplate = {
  symbolId: 'ice',
  skin: 'ice',
  radius: 13,
  mass: 3,
  slide: 0.5,
  count: 1,
  stack: 1,
  weldOnLand: false,
  magnetic: false,
  seismic: false,
  resistSuction: true,
};
