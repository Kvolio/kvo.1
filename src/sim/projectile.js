/**
 * RIGID-BODY FLIGHT REGIME
 * ========================
 *
 * Away from contact the projectile is a rigid body: there is nothing for a
 * continuum solver to resolve, and the peridynamic time step (~0.2 us) would
 * make a 2 m approach take millions of steps for no physical content.
 *
 * The projectile is therefore integrated as a rigid body with drag and gravity
 * until it is a few lattice spacings from the target, at which point the world
 * hands its exact state (position, orientation, velocity, spin, geometry,
 * per-part materials) to the peridynamic mesher. Nothing is idealised at the
 * handover: the body that gets meshed is the body that was flying.
 *
 * The same class is reused for the *residual* penetrator after perforation,
 * rebuilt from whatever coherent mass survived, so a second plate is engaged
 * by the real remnant rather than by a fresh projectile.
 */

import { polyBounds, pointInPoly, DEG, clamp } from '../core/math.js';
import { getMaterial } from '../materials/database.js';
import { buildProjectile, PROJECTILE_TYPES } from './projectileTypes.js';

const RHO_AIR = 1.225;

export class Projectile {
  constructor(cfg) {
    this.cfg = cfg;
    this.geom = buildProjectile(cfg);
    this.type = PROJECTILE_TYPES[cfg.type];
    this.slab = this.geom.slab;

    // --- mass properties -------------------------------------------------
    // Parts overlap (a cavity polygon sits inside its shell polygon) and the
    // mesher resolves that by first-match priority. Mass is therefore measured
    // by sampling the same priority rule on a fine grid, so the mass the user
    // sees is exactly the mass that will be meshed.
    this.measure();

    // Optional mass target: scale the body *length* until the measured mass
    // matches. Area is exactly linear in an axial scale, so one pass converges.
    const target = cfg.mass;
    if (target > 0 && this.massNoSabot > 0) {
      const k = target / this.massNoSabot;
      for (const part of this.geom.parts) {
        for (let i = 0; i < part.poly.length; i += 2) part.poly[i] *= k;
      }
      this.geom.length *= k;
      if (this.geom.fillerCentre) this.geom.fillerCentre[0] *= k;
      this.measure();
    }

    this.reset();
  }

  /** Grid-sample the assembly using the mesher's first-match priority rule. */
  measure() {
    const parts = this.geom.parts.map((p) => ({ ...p, mat: getMaterial(p.material) }));
    let bb = null;
    for (const p of parts) {
      const b = polyBounds(p.poly);
      bb = bb ? {
        x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0),
        x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1),
      } : b;
    }
    const NX = 260, NY = 120;
    const cw = (bb.x1 - bb.x0) / NX, ch = (bb.y1 - bb.y0) / NY;
    const cellA = cw * ch;
    for (const p of parts) { p.area = 0; p.sx = 0; p.sy = 0; p.sxx = 0; }
    for (let i = 0; i < NX; i++) {
      const x = bb.x0 + (i + 0.5) * cw;
      for (let j = 0; j < NY; j++) {
        const y = bb.y0 + (j + 0.5) * ch;
        for (const p of parts) {
          if (!pointInPoly(p.poly, x, y)) continue;
          p.area += cellA; p.sx += x * cellA; p.sy += y * cellA;
          p.sxx += (x * x + y * y) * cellA;
          break;
        }
      }
    }
    let m = 0, cx = 0, cy = 0, I = 0, mNo = 0;
    for (const p of parts) {
      p.mass = p.mat.rho * p.area * this.slab * p.scale;
      p.cx = p.area > 0 ? p.sx / p.area : 0;
      p.cy = p.area > 0 ? p.sy / p.area : 0;
      m += p.mass; cx += p.cx * p.mass; cy += p.cy * p.mass;
      if (!p.sabot) mNo += p.mass;
    }
    this.parts = parts;
    this.mass0 = m;
    this.massNoSabot = mNo;
    this.cgx = m > 0 ? cx / m : 0;
    this.cgy = m > 0 ? cy / m : 0;
    for (const p of parts) {
      const rho = p.mat.rho * this.slab * p.scale;
      I += rho * (p.sxx - 2 * this.cgx * p.sx - 2 * this.cgy * p.sy
        + (this.cgx * this.cgx + this.cgy * this.cgy) * p.area);
    }
    this.inertia0 = Math.max(I, 1e-9);
    return this;
  }

  reset() {
    const c = this.cfg;
    this.x = -(c.standoff ?? 1.8);
    this.y = c.aimY ?? 0;
    // `attack` turns the flight path; `yaw` turns the body RELATIVE to it, so
    // yaw is the angle of attack at impact and zero means nose-on however the
    // shot is aimed. Making yaw absolute instead would mean that elevating the
    // aim quietly introduced a yawed impact, which cuts penetration sharply -
    // a large physical effect arriving as a side effect of an aiming control.
    const att = (c.attack ?? 0) * DEG;
    this.ang = att + (c.yaw ?? 0) * DEG;   // orientation of the +x body axis
    this.omega = (c.spin ?? 0);
    this.vx = Math.cos(att) * c.velocity;
    this.vy = Math.sin(att) * c.velocity;
    this.mass = this.mass0;
    this.inertia = this.inertia0;
    this.distance = 0;
    this.state = 'ready';
    this.sabotAttached = !!this.type.sabot;
    this.fuzeState = this.type.fuze ? 'safe' : 'none';
    this.fuzeTimer = 0;
    this.detonated = false;
    this.residual = null;
    this.activeParts = this.parts.map((p) => p.label);
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get ke() { return 0.5 * this.mass * (this.vx * this.vx + this.vy * this.vy); }

  /** Drag reference area of whatever is currently attached. */
  refArea() {
    const d = this.sabotAttached && this.type.sabot
      ? this.geom.refDiameter : this.geom.penDiameter;
    return Math.PI * 0.25 * d * d;
  }

  dragCoefficient() {
    // Supersonic drag coefficient of a slender pointed body, near-constant in
    // the Mach range of interest. Sabot-on rounds are much draggier.
    const base = this.sabotAttached && this.type.sabot ? 0.62 : 0.29;
    return base;
  }

  /** Advance the rigid state. */
  step(dt) {
    const v = this.speed;
    if (v > 1e-6) {
      const Fd = 0.5 * RHO_AIR * v * v * this.dragCoefficient() * this.refArea();
      const a = Fd / this.mass;
      this.vx -= (this.vx / v) * a * dt;
      this.vy -= (this.vy / v) * a * dt;
    }
    this.vy -= 9.81 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.distance += v * dt;
    // fin/spin stabilised rounds track the velocity vector; nose yaw relaxes
    const flightAng = Math.atan2(this.vy, this.vx);
    const stab = this.type.key === 'apfsds' ? 8000 : 2500;
    let dA = flightAng - this.ang;
    while (dA > Math.PI) dA -= 2 * Math.PI;
    while (dA < -Math.PI) dA += 2 * Math.PI;
    this.ang += clamp(dA, -1, 1) * clamp(stab * dt, 0, 1) * 0.5;
    this.ang += this.omega * dt;
  }

  /** Sabot separation: physically an aerodynamic/inertial event downrange. */
  tryDiscardSabot() {
    if (!this.sabotAttached || !this.type.sabot) return null;
    if (this.distance < (this.cfg.sabotRange ?? this.type.sabot.discardAt)) return null;
    this.sabotAttached = false;
    const petals = [];
    const spread = (this.type.sabot.spread || 45) * DEG;
    for (const p of this.parts) {
      if (!p.sabot) continue;
      this.mass -= p.mass;
      const side = p.side || 1;
      const a = this.ang;
      const dirx = Math.cos(a) * Math.cos(spread) - Math.sin(a) * side * Math.sin(spread);
      const diry = Math.sin(a) * Math.cos(spread) + Math.cos(a) * side * Math.sin(spread);
      const sp = this.speed * 0.94;
      petals.push({
        x: this.x + Math.cos(a) * (p.cx) - Math.sin(a) * p.cy,
        y: this.y + Math.sin(a) * (p.cx) + Math.cos(a) * p.cy,
        vx: dirx * sp, vy: diry * sp,
        mass: p.mass, size: this.geom.refDiameter * 0.4,
        label: 'sabot petal', kind: 'sabot', matKey: p.material,
      });
    }
    this.activeParts = this.parts.filter((p) => !p.sabot).map((p) => p.label);
    return petals;
  }

  /** Parts that should be meshed right now (sabot excluded once discarded). */
  meshParts() {
    return this.parts.filter((p) => !(p.sabot && !this.sabotAttached));
  }

  /** Local -> world transform of a polygon. */
  worldPoly(poly) {
    const c = Math.cos(this.ang), s = Math.sin(this.ang);
    const out = new Float64Array(poly.length);
    for (let i = 0; i < poly.length; i += 2) {
      out[i] = this.x + poly[i] * c - poly[i + 1] * s;
      out[i + 1] = this.y + poly[i] * s + poly[i + 1] * c;
    }
    return out;
  }

  /** Nose tip in world space. */
  tip() { return [this.x, this.y]; }

  /** Rear-most point in world space (along the axis). */
  tail() {
    const L = this.geom.length;
    return [this.x - Math.cos(this.ang) * L, this.y - Math.sin(this.ang) * L];
  }

  describe() {
    return {
      type: this.type.name,
      mass: this.mass,
      velocity: this.speed,
      ke: this.ke,
      sectionalDensity: this.mass / (Math.PI * 0.25 * Math.pow(this.geom.penDiameter, 2)),
      length: this.geom.length,
      penDiameter: this.geom.penDiameter,
      ld: this.geom.length / this.geom.penDiameter,
    };
  }
}

/**
 * A residual penetrator reconstructed from the surviving peridynamic cluster.
 * Mass, length, diameter and velocity all come from the simulated remnant.
 */
export class ResidualPenetrator {
  constructor(o) {
    Object.assign(this, o);
    this.state = 'flight';
  }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get ke() { return 0.5 * this.mass * (this.vx * this.vx + this.vy * this.vy); }
  step(dt) {
    const v = this.speed;
    if (v > 1e-6) {
      const A = Math.PI * 0.25 * this.diameter * this.diameter;
      const Fd = 0.5 * RHO_AIR * v * v * 0.4 * A;
      const a = Fd / Math.max(this.mass, 1e-6);
      this.vx -= (this.vx / v) * a * dt; this.vy -= (this.vy / v) * a * dt;
    }
    this.vy -= 9.81 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
  }
}
