/**
 * FRAGMENT / SPALL TRANSPORT
 * ==========================
 *
 * Fragments are never spawned decoratively. Every fragment in this system was
 * promoted from the peridynamic solution: a particle (or a small coherent
 * cluster) whose bonds all failed and which then left the meshed corridor.
 * It carries the mass, velocity and energy it had at the moment it detached.
 *
 * Inside the corridor, spall is simply peridynamic material — it is drawn from
 * the particle state and can still collide with the penetrator and the channel
 * walls. Promotion happens only when a particle leaves the meshed region,
 * because past that point there is nothing left for the continuum solver to
 * do and a ballistic point mass is both cheaper and equally accurate.
 *
 * PERFORATION OF THIN STRUCTURE BY A FRAGMENT
 * -------------------------------------------
 * A promoted fragment that strikes a thin plate or a component casing is
 * resolved with a plugging-work model rather than a fresh continuum run:
 *
 *   E_perf = k * pi * d * t^2 * tau        (shear-out of a plug)
 *   v_bl   = sqrt(2 E_perf / m)
 *   v_r    = (m / (m + m_plug)) * sqrt(v^2 - v_bl^2)      (Recht-Ipson, p = 2)
 *
 * with tau ~ 0.6 UTS and k a shape factor. This is the standard engineering
 * treatment for compact fragments and is documented in docs/MODEL.md §6.
 */

import { pointInPoly, clamp } from '../core/math.js';
import { modulePoly, MODULE_TYPES } from './scene.js';

const RHO_AIR = 1.225;

export class FragmentSystem {
  constructor(bus, log) {
    this.list = [];
    this.bus = bus;
    this.log = log;
    this.nextId = 1;
    this.impacts = [];
  }

  clear() { this.list.length = 0; this.impacts.length = 0; this.nextId = 1; }

  add(f) {
    const frag = Object.assign({
      id: this.nextId++, x: 0, y: 0, vx: 0, vy: 0, mass: 1e-4,
      size: 0.002, kind: 'spall', matKey: 'rha', bornAt: 0,
      alive: true, trail: [], stopped: false, source: 'armour',
    }, f);
    frag.ke0 = 0.5 * frag.mass * (frag.vx * frag.vx + frag.vy * frag.vy);
    this.list.push(frag);
    return frag;
  }

  get count() { return this.list.length; }
  get liveCount() { return this.list.reduce((a, f) => a + (f.alive && !f.stopped ? 1 : 0), 0); }

  totalEnergy() {
    let e = 0;
    for (const f of this.list) if (f.alive) e += 0.5 * f.mass * (f.vx * f.vx + f.vy * f.vy);
    return e;
  }

  /**
   * Ballistic transport + interaction with scene geometry.
   * @param {number} dt simulated seconds
   */
  step(dt, scene, tNow, internals) {
    for (const f of this.list) {
      if (!f.alive || f.stopped) continue;
      const v = Math.hypot(f.vx, f.vy);
      if (v < 12) { f.stopped = true; continue; }

      // drag: compact fragment, Cd ~ 1.2, area from an equivalent sphere
      const A = Math.PI * 0.25 * f.size * f.size;
      const Fd = 0.5 * RHO_AIR * v * v * 1.2 * A;
      const a = Fd / f.mass;
      f.vx -= (f.vx / v) * a * dt;
      f.vy -= (f.vy / v) * a * dt;
      f.vy -= 9.81 * dt;

      const x0 = f.x, y0 = f.y;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.trail.length === 0 || Math.hypot(f.x - f.trail[f.trail.length - 2], f.y - f.trail[f.trail.length - 1]) > 0.01) {
        f.trail.push(f.x, f.y);
        if (f.trail.length > 24) f.trail.splice(0, 2);
      }

      this.resolveHits(f, x0, y0, scene, tNow, internals);
      if (Math.abs(f.x) > 40 || Math.abs(f.y) > 40) f.alive = false;
    }
  }

  resolveHits(f, x0, y0, scene, tNow, internals) {
    // --- armour layers ---------------------------------------------------
    for (const L of scene.activeLayers()) {
      if (!pointInPoly(L.poly, f.x, f.y) || pointInPoly(L.poly, x0, y0)) continue;
      const t = L.losThickness;
      const res = perforate(f, t, L.mat);
      L.fragHits = (L.fragHits || 0) + 1;
      if (!res.through) {
        f.stopped = true; f.embeddedIn = L.label || L.material;
        this.log.add(tNow, 'frag-stopped', `Fragment ${f.id} stopped by ${L.mat.name}`, 0);
        return;
      }
      const s = res.vr / Math.max(1e-6, Math.hypot(f.vx, f.vy));
      f.vx *= s; f.vy *= s; f.mass = res.mass;
    }
    // --- internal components --------------------------------------------
    for (const m of scene.modules) {
      const poly = modulePoly(m);
      if (!pointInPoly(poly, f.x, f.y) || pointInPoly(poly, x0, y0)) continue;
      const casing = perforate(f, m.casing, scene.casingMat);
      if (!casing.through) {
        f.stopped = true;
        this.log.add(tNow, 'frag-casing', `Fragment ${f.id} stopped by ${MODULE_TYPES[m.type].label} casing`, 0);
        return;
      }
      const s = casing.vr / Math.max(1e-6, Math.hypot(f.vx, f.vy));
      f.vx *= s; f.vy *= s;
      const e = 0.5 * f.mass * (f.vx * f.vx + f.vy * f.vy);
      internals.applyHit(m, { energy: e, mass: f.mass, velocity: casing.vr, source: 'fragment', t: tNow, x: f.x, y: f.y });
      this.impacts.push({ x: f.x, y: f.y, e, t: tNow, module: m.id });
      f.stopped = true;
      return;
    }
  }
}

/**
 * Plugging-work perforation of a plate of thickness t by a compact fragment.
 * Returns {through, vr, mass, vbl}.
 */
export function perforate(f, t, mat) {
  const v = Math.hypot(f.vx, f.vy);
  if (!mat || t <= 1e-5) return { through: true, vr: v, mass: f.mass, vbl: 0 };
  const d = f.size;
  const tau = 0.6 * mat.UTS;
  const shape = 1.15;
  const Eperf = shape * Math.PI * d * t * t * tau;
  const vbl = Math.sqrt((2 * Eperf) / Math.max(f.mass, 1e-9));
  if (v <= vbl) return { through: false, vr: 0, mass: f.mass, vbl };
  const mPlug = mat.rho * Math.PI * 0.25 * d * d * t;
  const vr = (f.mass / (f.mass + mPlug)) * Math.sqrt(v * v - vbl * vbl);
  return { through: true, vr, mass: f.mass * 0.97, vbl };
}
