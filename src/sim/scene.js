/**
 * SCENE / GEOMETRY ENGINE
 * =======================
 *
 * The target is an ordered stack of layers along the line of sight plus a set
 * of internal components. Every layer owns a world-space polygon, so the same
 * geometry serves the ray cast that finds the impact point, the peridynamic
 * mesher that decides which lattice sites are solid, and the renderer.
 *
 * Layer placement: layer i's front face crosses y = 0 at x_i, and
 *
 *     x_{i+1} = x_i + t_i / cos(theta_i) + gap_{i+1}
 *
 * so "thickness" is always the *plate* thickness and the line-of-sight
 * thickness follows from the slope, as it does on a real vehicle.
 */

import { ensureCCW, pointInPoly, rayPoly, polyBounds, DEG, clamp } from '../core/math.js';
import { getMaterial } from '../materials/database.js';

let uid = 1;

export function makeLayer(o = {}) {
  return Object.assign({
    id: uid++,
    label: '',
    material: 'rha',
    thickness: 0.100,     // m (plate normal thickness)
    slope: 0,             // deg from vertical; +ve = top leans away from shooter
    gap: 0,               // m of air in front of this layer
    height: 1.4,          // m of plate modelled in the cross-section
    offset: 0,            // m, shifts the plate along its own face
    enabled: true,
    bonded: false,        // laminated to the previous layer (bonds cross)
  }, o);
}

/**
 * Expand an ERA cassette into front plate / charge / back plate.
 *
 * The plates are bonded to the charge rather than floating: that is how a real
 * cassette is assembled, and it means the plates are held in place by ordinary
 * bonds until the charge is removed by the detonation. They then separate
 * because there is nothing left joining them, not because anything detached
 * them.
 */
export function expandEra(o = {}) {
  const id = o.eraId ?? uid++;
  const plate = o.plate || 'hha';
  const label = o.label || 'ERA';
  const common = {
    slope: o.slope ?? 0, height: o.height ?? 0.6, offset: o.offset ?? 0,
    enabled: o.enabled !== false, eraId: id,
  };
  return [
    makeLayer({ ...common, material: plate, thickness: Math.max(0.0005, o.frontThickness ?? 0.003),
      gap: o.gap ?? 0, eraPart: 'front', label: `${label} front plate` }),
    makeLayer({ ...common, material: o.explosive || 'era4s20', thickness: Math.max(0.0005, o.chargeThickness ?? 0.006),
      bonded: true, eraPart: 'charge', label: `${label} charge` }),
    makeLayer({ ...common, material: plate, thickness: Math.max(0.0005, o.backThickness ?? 0.003),
      bonded: true, eraPart: 'back', label: `${label} back plate` }),
  ];
}

export function makeModule(o = {}) {
  return Object.assign({
    id: uid++,
    type: 'crew',
    label: '',
    x: 0.6, y: 0, w: 0.5, h: 0.6, angle: 0,
    casing: 0.004,        // m of steel casing the fragment must defeat
    integrity: 1,
    hits: [],
    state: 'ok',
  }, o);
}

export const MODULE_TYPES = {
  crew: { label: 'Crew', color: '#c86a5a', tough: 250, note: 'Incapacitated by a few hundred joules of fragment energy.' },
  ammo: { label: 'Ammunition', color: '#d2a03a', tough: 900, note: 'May deflagrate or detonate; catastrophic if it does.' },
  fuel: { label: 'Fuel cell', color: '#9a7b3c', tough: 1500, note: 'Ignition possible; diesel is far less sensitive than petrol.' },
  engine: { label: 'Powerpack', color: '#6f8fa8', tough: 40000, note: 'Large, heavy, absorbs a lot before stopping.' },
  transmission: { label: 'Transmission', color: '#5f7f96', tough: 30000 },
  electronics: { label: 'Electronics / FCS', color: '#69a880', tough: 400 },
  battery: { label: 'Batteries', color: '#7e6fae', tough: 1200 },
  hydraulics: { label: 'Hydraulics', color: '#b07fae', tough: 800, note: 'Pressurised fluid; leaks and fire risk.' },
  breech: { label: 'Gun breech', color: '#8a8f99', tough: 60000 },
  optics: { label: 'Optics / sight', color: '#79a6c0', tough: 200 },
  void: { label: 'Empty volume', color: '#3a4048', tough: 1e9 },
};

export class Scene {
  constructor() {
    this.layers = [];
    this.modules = [];
    this.hull = null;
    this.name = 'Untitled array';
    this.rebuild();
  }

  setLayers(list) {
    // An ERA cassette is authored as ONE entry and expanded here into the
    // three bonded layers it physically is. Everything downstream - meshing,
    // contact, depth accounting, rendering - then treats the plates and the
    // charge as ordinary layers, which is what they are; only initiation and
    // the Gurney impulse need to know a cassette exists (see sim/era.js).
    const out = [];
    for (const l of list) {
      if (l && l.kind === 'era') out.push(...expandEra(l));
      else out.push(makeLayer(l));
    }
    this.layers = out;
    this.rebuild();
    return this;
  }

  /** Cassette id -> its three layers, for the UI and for save/load. */
  eraCassettes() {
    const m = new Map();
    for (const L of this.layers) {
      if (L.eraId === undefined) continue;
      if (!m.has(L.eraId)) m.set(L.eraId, {});
      m.get(L.eraId)[L.eraPart] = L;
    }
    return m;
  }
  setModules(list) { this.modules = list.map((m) => makeModule(m)); return this; }

  /** Recompute every layer polygon from its thickness / slope / gap. */
  rebuild() {
    let x = 0;
    this.losTotal = 0;
    this.normalTotal = 0;
    for (const L of this.layers) {
      if (!L.enabled) { L.poly = null; continue; }
      x += L.gap;
      const th = L.slope * DEG;
      const nx = Math.cos(th), ny = Math.sin(th);
      const tx = -Math.sin(th), ty = Math.cos(th);
      const los = L.thickness / Math.max(0.15, Math.cos(th));
      const ax = x, ay = 0;
      const H = L.height, o = L.offset;
      const p = new Float64Array([
        ax + tx * (-H / 2 + o), ay + ty * (-H / 2 + o),
        ax + tx * (H / 2 + o), ay + ty * (H / 2 + o),
        ax + tx * (H / 2 + o) + nx * L.thickness, ay + ty * (H / 2 + o) + ny * L.thickness,
        ax + tx * (-H / 2 + o) + nx * L.thickness, ay + ty * (-H / 2 + o) + ny * L.thickness,
      ]);
      L.poly = ensureCCW(p);
      L.normal = [nx, ny];
      L.tangent = [tx, ty];
      L.frontX = x;
      L.losThickness = los;
      L.mat = getMaterial(L.material);
      this.losTotal += los;
      this.normalTotal += L.thickness;
      x += los;
    }
    this.depth = x;
    return this;
  }

  activeLayers() { return this.layers.filter((l) => l.enabled && l.poly); }

  /** Is this world point inside any solid layer? */
  isSolid(x, y) {
    for (const L of this.activeLayers()) if (pointInPoly(L.poly, x, y)) return L;
    return null;
  }

  /**
   * March a ray through the stack. Returns ordered hits with entry/exit
   * parameters, obliquity and the layer reference.
   */
  raycast(ox, oy, dx, dy, maxT = 50) {
    const hits = [];
    for (const L of this.activeLayers()) {
      const h = rayPoly(ox, oy, dx, dy, L.poly, maxT);
      if (!h) continue;
      // find exit by casting from just inside
      const ix = ox + dx * (h.t + 1e-6), iy = oy + dy * (h.t + 1e-6);
      const ex = rayPoly(ix, iy, dx, dy, L.poly, maxT);
      const tExit = ex ? h.t + 1e-6 + ex.t : h.t;
      const cosO = -(h.nx * dx + h.ny * dy);
      hits.push({
        layer: L, t: h.t, tExit, nx: h.nx, ny: h.ny,
        obliquity: Math.acos(clamp(Math.abs(cosO), 0, 1)),
        losThickness: (tExit - h.t),
      });
    }
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }

  /** Modules a ray passes through, in order. */
  raycastModules(ox, oy, dx, dy, maxT = 50) {
    const out = [];
    for (const m of this.modules) {
      const poly = modulePoly(m);
      const h = rayPoly(ox, oy, dx, dy, poly, maxT);
      if (h) out.push({ module: m, t: h.t, nx: h.nx, ny: h.ny });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  bounds() {
    let b = { x0: -0.4, y0: -0.9, x1: Math.max(1.2, this.depth + 0.4), y1: 0.9 };
    for (const L of this.activeLayers()) {
      const lb = polyBounds(L.poly);
      b.x0 = Math.min(b.x0, lb.x0); b.y0 = Math.min(b.y0, lb.y0);
      b.x1 = Math.max(b.x1, lb.x1); b.y1 = Math.max(b.y1, lb.y1);
    }
    for (const m of this.modules) {
      b.x0 = Math.min(b.x0, m.x - m.w); b.x1 = Math.max(b.x1, m.x + m.w);
      b.y0 = Math.min(b.y0, m.y - m.h); b.y1 = Math.max(b.y1, m.y + m.h);
    }
    return b;
  }

  resetDamage() {
    for (const m of this.modules) { m.integrity = 1; m.hits.length = 0; m.state = 'ok'; }
  }

  toJSON() {
    return {
      name: this.name,
      layers: this.layers.map((l) => ({
        label: l.label, material: l.material, thickness: l.thickness,
        slope: l.slope, gap: l.gap, height: l.height, offset: l.offset,
        enabled: l.enabled, bonded: l.bonded,
      })),
      modules: this.modules.map((m) => ({
        type: m.type, label: m.label, x: m.x, y: m.y, w: m.w, h: m.h,
        angle: m.angle, casing: m.casing,
      })),
    };
  }

  static fromJSON(j) {
    const s = new Scene();
    s.name = j.name || 'Scenario';
    s.setLayers(j.layers || []);
    s.setModules(j.modules || []);
    return s;
  }
}

export function modulePoly(m) {
  const c = Math.cos(m.angle * DEG), s = Math.sin(m.angle * DEG);
  const hw = m.w / 2, hh = m.h / 2;
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  const out = new Float64Array(8);
  for (let i = 0; i < 4; i++) {
    out[i * 2] = m.x + pts[i][0] * c - pts[i][1] * s;
    out[i * 2 + 1] = m.y + pts[i][0] * s + pts[i][1] * c;
  }
  return out;
}
