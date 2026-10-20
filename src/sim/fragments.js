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
 * WHAT A FRAGMENT IS
 * ------------------
 * The 2-D slab gives every lattice node a mass but no third dimension, so the
 * drawn square (one lattice spacing) is NOT the size of the piece. The size
 * that matters for drag and for punching a plate is the diameter of a compact
 * body of that mass and that material,
 *
 *     d = (6 m / (pi rho))^(1/3)
 *
 * which is about twice the lattice spacing for a steel node. Using the drawn
 * square instead understated both the drag area and the plug diameter.
 *
 * MOTION
 * ------
 * Quadratic drag has a closed form, v(t) = v0 / (1 + k v0 t) with
 * k = rho_air Cd A / (2 m), so a frame's whole step is integrated exactly
 * rather than by one explicit Euler step - which at large k*dt reverses the
 * velocity of a light fragment.
 *
 * HITS ARE SWEPT, NOT SAMPLED
 * ---------------------------
 * A frame can advance a kilometre-per-second fragment by several millimetres,
 * more than a thin plate or a component casing is thick. Testing only the
 * start and end points lets it step straight over the plate. Every step is
 * therefore a segment, clipped against each (convex) plate and component, and
 * the crossings are resolved in the order they occur along the path.
 *
 * PERFORATION OF THIN STRUCTURE BY A FRAGMENT
 * -------------------------------------------
 * A fragment that strikes a plate or a component casing is resolved with a
 * plugging-work model rather than a fresh continuum run:
 *
 *   E_perf = k * pi * d * t^2 * tau        (shear-out of a plug)
 *   v_bl   = sqrt(2 E_perf / m)
 *   v_r    = (m / (m + m_plug)) * sqrt(v^2 - v_bl^2)      (Recht-Ipson, p = 2)
 *
 * with tau ~ 0.6 UTS and k a shape factor. t is the length of the actual chord
 * the fragment cuts through the plate (so a fragment crossing a sloped plate
 * obliquely sees the longer path, and one flying sideways through a plate sees
 * its whole width), not the plate's line-of-sight thickness for the main shot.
 * The plug leaves with the fragment as a separate piece, so momentum and mass
 * are conserved. This is the standard engineering treatment for compact
 * fragments and is documented in docs/MODEL.md §6.
 */

import { pointInPoly, clamp } from '../core/math.js';
import { modulePoly, MODULE_TYPES } from './scene.js';
import { getMaterial } from '../materials/database.js';

const RHO_AIR = 1.225;
const CD = 1.0;
const G = 9.81;
const STOP_SPEED = 12;            // m/s: below this a fragment has come to rest

/** live fragments carried at once; beyond it only the energetic are kept */
const LIVE_SOFT_CAP = 1600;
/** at rest + embedded fragments kept for display; the oldest are dropped */
const RESTING_CAP = 2400;
/** fragments below this kinetic energy are not worth transporting past the soft cap */
const MIN_KE_PAST_CAP = 60;       // J
const MIN_CONSEQUENTIAL_KE = 5;   // J

/**
 * Clip the segment P0 -> P1 against a CONVEX polygon wound counter-clockwise.
 * Returns the entry/exit parameters of the whole LINE (not clipped to the
 * segment) and the outward normal of the entry face, or null if the line
 * misses. Plates and component boxes are all convex quadrilaterals.
 */
export function clipLine(poly, x0, y0, dx, dy) {
  let tIn = -Infinity, tOut = Infinity, nxIn = 0, nyIn = 0;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = poly[j * 2], ay = poly[j * 2 + 1], bx = poly[i * 2], by = poly[i * 2 + 1];
    const ex = bx - ax, ey = by - ay;
    const l = Math.hypot(ex, ey) || 1;
    const nx = ey / l, ny = -ex / l;                 // outward normal, CCW winding
    const num = nx * (x0 - ax) + ny * (y0 - ay);     // > 0 means outside this edge
    const den = nx * dx + ny * dy;
    if (Math.abs(den) < 1e-12) {
      if (num > 0) return null;
      continue;
    }
    const t = -num / den;
    if (den < 0) { if (t > tIn) { tIn = t; nxIn = nx; nyIn = ny; } }
    else if (t < tOut) tOut = t;
    if (tIn > tOut) return null;
  }
  return { tIn, tOut, nx: nxIn, ny: nyIn };
}

export class FragmentSystem {
  constructor(bus, log) {
    this.list = [];
    this.bus = bus;
    this.log = log;
    this.nextId = 1;
    this.impacts = [];
    this.stoppedInPlate = 0;
    this.stoppedByCasing = 0;
    this.perforations = 0;
    this.dropped = 0;
    this.droppedMass = 0;
    this._loggedLayers = new Set();
  }

  clear() {
    this.list.length = 0; this.impacts.length = 0; this.nextId = 1;
    this.stoppedInPlate = 0; this.stoppedByCasing = 0; this.perforations = 0;
    this.dropped = 0; this.droppedMass = 0; this._loggedLayers.clear();
  }

  /**
   * Would a new fragment of this energy be carried? Past the soft cap only the
   * energetic ones are. The old rule - "refuse everything once 1400 exist" -
   * counted resting fragments as live and so discarded the fast late spall
   * from a perforation in favour of slow early debris that had already
   * stopped.
   */
  accepts(ke) {
    return this.liveCount < LIVE_SOFT_CAP || ke >= MIN_KE_PAST_CAP;
  }

  add(f) {
    const frag = Object.assign({
      id: this.nextId++, x: 0, y: 0, vx: 0, vy: 0, mass: 1e-4,
      size: 0.002, kind: 'spall', matKey: 'rha', bornAt: 0,
      alive: true, trail: [], stopped: false, source: 'armour',
    }, f);
    if (!frag.dia) {
      let rho = 7850;
      try { rho = getMaterial(frag.matKey).rho || rho; } catch (e) { /* default steel */ }
      frag.rho = rho;
      frag.dia = Math.cbrt((6 * frag.mass) / (Math.PI * rho));
    }
    frag.ke0 = 0.5 * frag.mass * (frag.vx * frag.vx + frag.vy * frag.vy);
    frag.inside = null;           // filled lazily on the first step
    this.list.push(frag);
    this.trimResting();
    return frag;
  }

  get count() { return this.list.length; }

  /**
   * Fragments that can still do something: not at rest, and not already past
   * everything in the scene and heading away from it. The second condition
   * matters for ending a run - a sabot petal or a casing piece flying off at
   * 600 m/s is "moving" for as long as you care to watch, and would otherwise
   * keep the debris phase open until its time limit.
   */
  get liveCount() {
    let n = 0;
    for (const f of this.list) if (this.consequential(f)) n++;
    return n;
  }

  /**
   * Still worth waiting for: moving, not past everything in the scene, and
   * carrying enough energy to matter. A 3 g piece drifting at 20 m/s has 0.6 J
   * - it cannot hurt a crewman or punch a casing, and holding the run open for
   * it only makes the end of every shot take longer.
   */
  consequential(f) {
    if (!f.alive || f.stopped || f.departed) return false;
    return 0.5 * f.mass * (f.vx * f.vx + f.vy * f.vy) >= MIN_CONSEQUENTIAL_KE;
  }

  /** Fastest live fragment, for choosing the debris-phase step. */
  fastest() {
    let v = 0;
    for (const f of this.list) {
      if (!this.consequential(f)) continue;
      const s = Math.hypot(f.vx, f.vy);
      if (s > v) v = s;
    }
    return v;
  }

  totalEnergy() {
    let e = 0;
    for (const f of this.list) if (f.alive) e += 0.5 * f.mass * (f.vx * f.vx + f.vy * f.vy);
    return e;
  }

  /** Drop the oldest resting fragments once there are too many to draw. */
  trimResting() {
    if (this.list.length < RESTING_CAP + LIVE_SOFT_CAP) return;
    let resting = 0;
    for (const f of this.list) if (f.stopped || !f.alive) resting++;
    if (resting <= RESTING_CAP) return;
    let drop = resting - RESTING_CAP;
    const keep = [];
    for (const f of this.list) {
      if (drop > 0 && (f.stopped || !f.alive)) {
        drop--; this.dropped++; this.droppedMass += f.mass;
        continue;
      }
      keep.push(f);
    }
    this.list = keep;
  }

  /**
   * Ballistic transport + interaction with scene geometry.
   * @param {number} dt simulated seconds
   */
  step(dt, scene, tNow, internals) {
    if (dt <= 0) return;
    const layers = scene.activeLayers();
    const mods = scene.modules.map((m) => ({ m, poly: modulePoly(m) }));
    const born = [];
    const B = scene.bounds();
    const M = 1.0;
    for (const f of this.list) {
      if (!f.alive || f.stopped) continue;
      const v = Math.hypot(f.vx, f.vy);
      if (v < STOP_SPEED) { f.stopped = true; continue; }
      if (!f.departed && (
        (f.x > B.x1 + M && f.vx > 0) || (f.x < B.x0 - M && f.vx < 0)
        || (f.y > B.y1 + M && f.vy > 0) || (f.y < B.y0 - M && f.vy < 0))) f.departed = true;
      if (!f.inside) {
        f.inside = new Set();
        for (const L of layers) if (pointInPoly(L.poly, f.x, f.y)) f.inside.add(L);
      }

      // --- drag, integrated exactly over the step ------------------------
      const A = Math.PI * 0.25 * f.dia * f.dia;
      const k = (0.5 * RHO_AIR * CD * A) / f.mass;
      const kv = k * v * dt;
      const speedScale = 1 / (1 + kv);
      const path = kv > 1e-9 ? Math.log1p(kv) / k : v * dt;     // distance covered
      const ux = f.vx / v, uy = f.vy / v;
      const x0 = f.x, y0 = f.y;
      let x1 = x0 + ux * path, y1 = y0 + uy * path - 0.5 * G * dt * dt;
      f.vx *= speedScale; f.vy = f.vy * speedScale - G * dt;

      // --- swept hits ------------------------------------------------------
      if (f.departed) { f.x = x1; f.y = y1; }
      else this.sweep(f, x0, y0, x1, y1, layers, mods, scene, tNow, internals, born);

      if (f.trail.length === 0 || Math.hypot(f.x - f.trail[f.trail.length - 2], f.y - f.trail[f.trail.length - 1]) > 0.01) {
        f.trail.push(f.x, f.y);
        if (f.trail.length > 24) f.trail.splice(0, 2);
      }
      if (Math.abs(f.x) > 40 || Math.abs(f.y) > 40) f.alive = false;
    }
    for (const b of born) this.add(b);
  }

  /** Move f from (x0,y0) to (x1,y1), resolving every plate / casing on the way. */
  sweep(f, x0, y0, x1, y1, layers, mods, scene, tNow, internals, born) {
    const sx = x1 - x0, sy = y1 - y0;
    const seg = Math.hypot(sx, sy);
    if (seg < 1e-12) { f.x = x1; f.y = y1; return; }
    const ux = sx / seg, uy = sy / seg;

    const events = [];
    for (const L of layers) {
      const c = clipLine(L.poly, x0, y0, ux, uy);
      if (!c || c.tOut <= 0) continue;
      const inside0 = f.inside.has(L) || c.tIn <= 0;
      if (inside0) {
        // started inside: it leaves when the line does; it is not "entering"
        if (c.tOut > seg) { f.inside.add(L); }
        else f.inside.delete(L);
        continue;
      }
      if (c.tIn > seg) continue;
      events.push({ kind: 'layer', L, tIn: c.tIn, tOut: c.tOut, nx: c.nx, ny: c.ny });
    }
    for (const { m, poly } of mods) {
      if (m.type === 'void') continue;
      const c = clipLine(poly, x0, y0, ux, uy);
      if (!c || c.tOut <= 0 || c.tIn <= 0 || c.tIn > seg) continue;
      events.push({ kind: 'module', m, tIn: c.tIn, tOut: c.tOut, nx: c.nx, ny: c.ny });
    }
    events.sort((a, b) => a.tIn - b.tIn);

    let reach = seg;                   // how far along the line this step gets
    for (const e of events) {
      if (e.tIn > reach) break;
      const v = Math.hypot(f.vx, f.vy);
      if (v < STOP_SPEED) { f.stopped = true; break; }
      if (e.kind === 'layer') {
        const chord = Math.max(e.tOut - e.tIn, 0);
        const res = perforate(f, chord, e.L.mat);
        e.L.fragHits = (e.L.fragHits || 0) + 1;
        f.x = x0 + ux * e.tIn; f.y = y0 + uy * e.tIn;
        if (!res.through) {
          // it comes to rest part-way in; how far follows from the energy it
          // spent, never beyond the far face
          const frac = clamp(0.5 * Math.hypot(f.vx, f.vy) / Math.max(res.vbl, 1), 0.1, 0.9);
          f.x += ux * chord * frac; f.y += uy * chord * frac;
          f.stopped = true; f.vx = 0; f.vy = 0;
          f.embeddedIn = e.L.label || e.L.material;
          this.stoppedInPlate++;
          // one line per plate, not one per piece: six hundred fragments
          // embedding in the same plate used to bury the rest of the log
          if (!this._loggedLayers.has(e.L)) {
            this._loggedLayers.add(e.L);
            this.log.add(tNow, 'frag-stopped',
              `Fragments are being stopped by ${e.L.label || e.L.mat.name} (first: ${(f.mass * 1000).toFixed(1)} g at ${v.toFixed(0)} m/s)`, 0);
          }
          return;
        }
        this.perforations++;
        const s = res.vr / Math.max(v, 1e-6);
        f.vx *= s; f.vy *= s;
        if (res.plugMass > 1e-5) {
          born.push({
            x: x0 + ux * e.tOut, y: y0 + uy * e.tOut, vx: f.vx, vy: f.vy,
            mass: res.plugMass, size: f.size, kind: 'plug', matKey: e.L.mat.key,
            bornAt: tNow, source: 'plug',
          });
        }
        // carry on from the far face: the plate took no appreciable time, so the
        // rest of the step is flown at the new speed
        reach = e.tOut + Math.max(reach - e.tOut, 0) * s;
        f.x = x0 + ux * e.tOut; f.y = y0 + uy * e.tOut;
      } else {
        const m = e.m;
        f.x = x0 + ux * e.tIn; f.y = y0 + uy * e.tIn;
        // casing seen along the path: a glancing hit crosses more metal
        const cosT = Math.max(0.25, Math.abs(e.nx * ux + e.ny * uy));
        const casing = perforate(f, m.casing / cosT, scene.casingMat);
        if (!casing.through) {
          f.stopped = true; f.vx = 0; f.vy = 0;
          this.stoppedByCasing++;
          this.log.add(tNow, 'frag-casing',
            `Fragment ${f.id} stopped by ${MODULE_TYPES[m.type].label} casing`, 0);
          return;
        }
        const s = casing.vr / Math.max(v, 1e-6);
        f.vx *= s; f.vy *= s;
        const vr = Math.hypot(f.vx, f.vy);
        const en = 0.5 * f.mass * vr * vr;
        internals.applyHit(m, { energy: en, mass: f.mass, velocity: vr, source: 'fragment', t: tNow, x: f.x, y: f.y });
        this.impacts.push({ x: f.x, y: f.y, e: en, t: tNow, module: m.id });
        f.stopped = true; f.vx = 0; f.vy = 0;
        return;
      }
    }
    f.x = x0 + ux * reach; f.y = y0 + uy * reach;
    // update containment for the next step
    for (const L of layers) {
      if (pointInPoly(L.poly, f.x, f.y)) f.inside.add(L); else f.inside.delete(L);
    }
  }
}

/**
 * Plugging-work perforation of a plate of thickness t by a compact fragment.
 * `t` is the length of the chord the fragment cuts through the plate.
 * Returns {through, vr, mass, plugMass, vbl}.
 */
export function perforate(f, t, mat) {
  const v = Math.hypot(f.vx, f.vy);
  // an explosive layer (the charge of a reactive cassette) is a few millimetres
  // of soft filler between two plates: a fragment passes through it, it does
  // not cut a steel-like plug out of it
  if (!mat || t <= 1e-5 || mat.class === 'explosive') return { through: true, vr: v, mass: f.mass, plugMass: 0, vbl: 0 };
  const d = f.dia || f.size;
  const tau = 0.6 * mat.UTS;
  const shape = 1.15;
  const Eperf = shape * Math.PI * d * t * t * tau;
  const vbl = Math.sqrt((2 * Eperf) / Math.max(f.mass, 1e-9));
  if (v <= vbl) return { through: false, vr: 0, mass: f.mass, plugMass: 0, vbl };
  // the plug is a cylinder of the plate, never longer than the hole is wide
  // enough to justify: a thick plate punched by a small fragment sheds a
  // slug, not a column
  const mPlug = mat.rho * Math.PI * 0.25 * d * d * Math.min(t, 1.5 * d);
  const vr = (f.mass / (f.mass + mPlug)) * Math.sqrt(v * v - vbl * vbl);
  return { through: true, vr, mass: f.mass, plugMass: mPlug, vbl };
}
