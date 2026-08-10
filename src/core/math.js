/**
 * Small numeric / geometric helpers shared by every subsystem.
 *
 * Everything in the simulator is SI (m, kg, s, Pa, J, K). Conversion to
 * display units happens only in src/core/units.js and the UI layer.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const hypot = (x, y) => Math.sqrt(x * x + y * y);

/** Deterministic PRNG (mulberry32). Used only for *modelled* material
 *  heterogeneity (Weibull-like strength scatter) and never to decide an
 *  outcome. Seeded so a scenario replays bit-identically. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weibull-distributed multiplier with unit mean-ish scatter, modulus m.
 *  Higher m => less scatter. Used for local flaw-density variation. */
export function weibullFactor(rng, m) {
  const u = clamp(rng(), 1e-6, 1 - 1e-6);
  return Math.pow(-Math.log(u), 1 / m) / Math.pow(Math.log(2), 1 / m);
}

// ---------------------------------------------------------------------------
// Vector helpers (scalar form: no allocation in hot loops)
// ---------------------------------------------------------------------------

export function rot(x, y, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [x * c - y * s, x * s + y * c];
}

export function normalize(x, y) {
  const l = Math.sqrt(x * x + y * y) || 1;
  return [x / l, y / l];
}

// ---------------------------------------------------------------------------
// Polygon geometry — target layers and internal modules are convex or simple
// polygons in world space, given as flat [x0,y0,x1,y1,...] arrays.
// ---------------------------------------------------------------------------

export function polyCentroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = p.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = p[i * 2], y0 = p[i * 2 + 1], x1 = p[j * 2], y1 = p[j * 2 + 1];
    const cr = x0 * y1 - x1 * y0;
    a += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-18) return [p[0], p[1], 0];
  return [cx / (6 * a), cy / (6 * a), Math.abs(a)];
}

export function polyArea(p) { return polyCentroid(p)[2]; }

export function pointInPoly(p, x, y) {
  let inside = false;
  for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-30) + xi) inside = !inside;
  }
  return inside;
}

export function polyBounds(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < x0) x0 = p[i];
    if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < y0) y0 = p[i + 1];
    if (p[i + 1] > y1) y1 = p[i + 1];
  }
  return { x0, y0, x1, y1 };
}

/** Distance from point to polygon boundary (positive outside or inside). */
export function distToPolyEdge(p, x, y) {
  let best = Infinity;
  for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) {
    const ax = p[j * 2], ay = p[j * 2 + 1], bx = p[i * 2], by = p[i * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1e-30;
    let t = ((x - ax) * dx + (y - ay) * dy) / l2;
    t = clamp(t, 0, 1);
    const px = ax + t * dx - x, py = ay + t * dy - y;
    const d = Math.sqrt(px * px + py * py);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Ray/segment vs polygon. Returns the nearest entry hit along the ray in
 * [0, maxT], or null. Also returns the outward edge normal at the hit.
 */
export function rayPoly(ox, oy, dx, dy, p, maxT = Infinity) {
  let bestT = maxT, nx = 0, ny = 0, found = false;
  for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) {
    const ax = p[j * 2], ay = p[j * 2 + 1], bx = p[i * 2], by = p[i * 2 + 1];
    const ex = bx - ax, ey = by - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-14) continue;
    const t = ((ax - ox) * ey - (ay - oy) * ex) / den;
    const u = ((ax - ox) * dy - (ay - oy) * dx) / den;
    if (t >= 0 && t < bestT && u >= 0 && u <= 1) {
      bestT = t; found = true;
      const l = Math.sqrt(ex * ex + ey * ey) || 1;
      // polygons are wound CCW => outward normal is (ey, -ex)/l
      nx = ey / l; ny = -ex / l;
    }
  }
  return found ? { t: bestT, nx, ny } : null;
}

/** Build a CCW rectangle polygon from centre, half extents and rotation. */
export function rectPoly(cx, cy, hw, hh, ang = 0) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  const out = new Float64Array(8);
  for (let i = 0; i < 4; i++) {
    out[i * 2] = cx + pts[i][0] * c - pts[i][1] * s;
    out[i * 2 + 1] = cy + pts[i][0] * s + pts[i][1] * c;
  }
  return out;
}

/** Ensure counter-clockwise winding (positive signed area). */
export function ensureCCW(p) {
  let a = 0;
  for (let i = 0, n = p.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  if (a < 0) {
    const out = new Float64Array(p.length);
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      out[i * 2] = p[(n - 1 - i) * 2];
      out[i * 2 + 1] = p[(n - 1 - i) * 2 + 1];
    }
    return out;
  }
  return p;
}
