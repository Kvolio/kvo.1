/**
 * PERIDYNAMIC DOMAIN
 * ==================
 *
 * Holds the discretised deformable bodies: a structure-of-arrays particle set
 * plus a flat bond list, both in typed arrays so the force loop stays in the
 * JIT's fast path.
 *
 * DISCRETISATION
 * --------------
 * A uniform lattice is laid out in the *shot frame*: axis `a` along the
 * projectile velocity at the moment the domain is created, axis `b`
 * perpendicular to it. Only the corridor the projectile can actually reach is
 * meshed; armour outside that corridor is drawn as static geometry and its
 * mechanical role is represented by the boundary treatment at the corridor
 * edges. This is a "domain of interest" reduction — it is what makes a
 * research-style continuum model run at interactive rates in a browser — and
 * it is documented as assumption A4 in docs/MODEL.md.
 *
 * Lattice sites are jittered by a few percent of the spacing. A perfectly
 * regular peridynamic lattice biases crack paths along the lattice axes; the
 * jitter breaks that symmetry. Bonds are built from the jittered reference
 * configuration, so the initial state is exactly force-free.
 *
 * BONDS
 * -----
 * A bond exists between two sites of the same `bondGroup` whose reference
 * separation is below the horizon. Bonds are never deleted: a broken bond
 * stops carrying tension and becomes a contact pair instead, which is both
 * cheaper and more correct than removing it (crater walls, channel walls and
 * comminuted material still push on each other).
 */

import { makeRng, weibullFactor, clamp, pointInPoly, polyBounds } from '../../core/math.js';
import { derivePD, bondPair, stableDt } from '../../materials/derive.js';
import { sampleGradient } from '../../materials/database.js';

export const ROLE = {
  ARMOUR: 0,
  PENETRATOR: 1,
  PROJ_AUX: 2,   // caps, windscreens, sabot petals, casing
  FILLER: 3,     // explosive fill
  MODULE: 4,     // internal component that was meshed
};

export const BOND = { INTACT: 0, BROKEN: 1 };

export class PDDomain {
  /**
   * @param {object} o
   * @param {number} o.dx        lattice spacing (m)
   * @param {number} o.mRatio    horizon / spacing
   * @param {number} o.slab      out-of-plane slab depth (m)
   * @param {number[]} o.origin  world origin of the shot frame
   * @param {number[]} o.dir     unit shot direction
   * @param {number} o.length    corridor length along the shot axis (m)
   * @param {number} o.width     corridor width across the shot axis (m)
   */
  constructor(o) {
    this.dx = o.dx;
    this.mRatio = o.mRatio ?? 3.015;
    this.delta = this.dx * this.mRatio;
    this.slab = o.slab;
    this.vol = this.dx * this.dx * this.slab;

    this.ox = o.origin[0]; this.oy = o.origin[1];
    this.ax = o.dir[0]; this.ay = o.dir[1];
    this.bx = -this.ay; this.by = this.ax;
    this.length = o.length;
    this.width = o.width;

    this.rng = makeRng(o.seed ?? 12345);
    this.pdCache = new Map();      // materialKey -> derived PD constants
    this.solids = [];              // build-time description of meshed regions

    this.n = 0;
    this.nb = 0;
    this.bodies = [];              // {id, label, role, matKey, bondGroup}
  }

  /** Derived PD constants for a material (cached per lattice). */
  pdOf(m) {
    let d = this.pdCache.get(m.key);
    if (!d) { d = derivePD(m, this.dx, this.mRatio, this.slab); this.pdCache.set(m.key, d); }
    return d;
  }

  // -------------------------------------------------------------- build API

  /**
   * Register a region to be meshed.
   * @param {object} s
   * @param {Float64Array} s.poly    world-space polygon (CCW)
   * @param {object} s.material      material record
   * @param {number} s.bodyId
   * @param {number} s.bondGroup     bonds only form within a group
   * @param {number} s.role          ROLE.*
   * @param {number[]} [s.vel]       initial velocity [vx, vy]
   * @param {number} [s.spin]        initial angular velocity about the centroid
   * @param {number[]} [s.spinAbout] centre of rotation
   * @param {number} [s.layerIdx]    index of the source layer (for reporting)
   * @param {function} [s.gradientAxis] maps world point -> 0..1 through-thickness
   * @param {boolean} [s.lateralBC]  apply absorbing/clamped lateral boundary
   */
  addSolid(s) {
    this.solids.push(s);
    if (!this.bodies.find((b) => b.id === s.bodyId)) {
      this.bodies.push({
        id: s.bodyId, label: s.label || `body${s.bodyId}`, role: s.role,
        matKey: s.material.key, bondGroup: s.bondGroup,
      });
    }
    return this;
  }

  /** Lattice site (i,j) -> world position. */
  siteWorld(i, j, out) {
    const s = (i + 0.5) * this.dx;
    const u = -this.width * 0.5 + (j + 0.5) * this.dx;
    out[0] = this.ox + this.ax * s + this.bx * u;
    out[1] = this.oy + this.ay * s + this.by * u;
    return out;
  }

  /**
   * Occupancy pass. Cheap enough to run several times while the world tunes
   * the lattice spacing to fit the particle budget.
   */
  countSites() {
    const ns = Math.max(1, Math.round(this.length / this.dx));
    const nu = Math.max(1, Math.round(this.width / this.dx));
    this.ns = ns; this.nu = nu;
    const p = [0, 0];
    const owner = new Int32Array(ns * nu).fill(-1);
    const bb = this.solids.map((s) => polyBounds(s.poly));
    let count = 0;
    for (let i = 0; i < ns; i++) {
      for (let j = 0; j < nu; j++) {
        this.siteWorld(i, j, p);
        const x = p[0], y = p[1];
        for (let k = 0; k < this.solids.length; k++) {
          const b = bb[k];
          if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
          if (pointInPoly(this.solids[k].poly, x, y)) { owner[i * nu + j] = k; count++; break; }
        }
      }
    }
    this._owner = owner;
    this._count = count;
    return count;
  }

  /** Mesh every registered solid and build the bond list. */
  build() {
    if (this._owner === undefined) this.countSites();
    const ns = this.ns, nu = this.nu;
    const p = [0, 0];
    const owner = this._owner;
    const count = this._count;
    this.alloc(count);

    // ---- pass 2: emit particles --------------------------------------
    const jitter = this.dx * 0.06;
    let n = 0;
    for (let i = 0; i < ns; i++) {
      for (let j = 0; j < nu; j++) {
        const k = owner[i * nu + j];
        if (k < 0) continue;
        const sol = this.solids[k];
        this.siteWorld(i, j, p);
        const x = p[0] + (this.rng() - 0.5) * jitter;
        const y = p[1] + (this.rng() - 0.5) * jitter;

        let m = sol.material;
        let gradKey = '';
        if (m.gradient && sol.gradientAxis) {
          // quantise the through-thickness coordinate so a graded plate needs
          // a bounded number of distinct constitutive entries
          const f = Math.round(clamp(sol.gradientAxis(x, y), 0, 1) * 24) / 24;
          m = sampleGradient(m, f);
          gradKey = `:${f.toFixed(3)}`;
        }
        const pd = gradKey ? derivePD(m, this.dx, this.mRatio, this.slab) : this.pdOf(m);

        this.rx[n] = x; this.ry[n] = y;
        this.px[n] = x; this.py[n] = y;

        let vx = sol.vel ? sol.vel[0] : 0;
        let vy = sol.vel ? sol.vel[1] : 0;
        if (sol.spin) {
          const cx = sol.spinAbout ? sol.spinAbout[0] : x;
          const cy = sol.spinAbout ? sol.spinAbout[1] : y;
          vx += -sol.spin * (y - cy); vy += sol.spin * (x - cx);
        }
        this.vx[n] = vx; this.vy[n] = vy;

        const sc = sol.scale ?? 1;
        this.pscale[n] = sc;
        this.mass[n] = m.rho * this.vol * sc;
        this.invM[n] = 1 / this.mass[n];
        this.body[n] = sol.bodyId;
        this.group[n] = sol.bondGroup;
        this.role[n] = sol.role;
        this.layer[n] = sol.layerIdx ?? -1;
        this.temp[n] = 293;
        this.matIndex[n] = this.internMat(m, pd, gradKey);
        // Local strength scatter: flaw density, not outcome dice.
        this.strength[n] = clamp(weibullFactor(this.rng, pd.weibull), 0.45, 1.7);
        this.lat_i[n] = i; this.lat_j[n] = j;
        n++;
      }
    }
    this.n = n;

    // ---- pass 3: bonds ------------------------------------------------
    this.buildBonds();
    this.classifySurface();
    this.computeStableDt();
    return this;
  }

  internMat(m, pd, gradKey = '') {
    if (!this.matTable) { this.matTable = []; this.matKeyIndex = new Map(); }
    const key = m.key + gradKey;
    let idx = this.matKeyIndex.get(key);
    if (idx === undefined) {
      idx = this.matTable.length;
      this.matTable.push({ mat: m, pd });
      this.matKeyIndex.set(key, idx);
    }
    return idx;
  }

  alloc(n) {
    const F = (k) => new Float32Array(k);
    this.rx = new Float64Array(n); this.ry = new Float64Array(n);
    this.px = new Float64Array(n); this.py = new Float64Array(n);
    this.vx = F(n); this.vy = F(n);
    this.fx = F(n); this.fy = F(n);
    this.mass = F(n); this.invM = F(n);
    this.temp = F(n); this.wPlast = F(n);
    this.strength = F(n);
    this.damage = F(n);
    this.body = new Int16Array(n); this.group = new Int16Array(n);
    this.role = new Uint8Array(n); this.layer = new Int16Array(n);
    this.matIndex = new Uint16Array(n);
    this.nBond = new Uint16Array(n); this.nBroken = new Uint16Array(n);
    this.flags = new Uint8Array(n);      // bit0 surface, bit1 lateral BC, bit2 clamped, bit3 free
    this.cluster = new Int32Array(n);
    this.lat_i = new Int32Array(n); this.lat_j = new Int32Array(n);
    this.stiffSum = new Float64Array(n);
    this.bcRate = F(n);        // absorbing-boundary velocity decay rate (1/s)
    this.virial = F(n);        // virial stress proxy, tension positive (Pa)
    this.srate = F(n);         // smoothed local strain rate (1/s)
    this.theta = F(n);         // local dilatation (mean bond stretch)
    this.thetaAcc = F(n);      // accumulator for the next step's dilatation
    this.thetaCnt = new Uint16Array(n);
    this.plStrain = F(n);      // accumulated equivalent plastic strain
    this.flowMul = F(n);       // cached Johnson-Cook flow-stress multiplier
    this.flowMul.fill(1);
    this.pscale = F(n);        // out-of-plane area correction (bodies of revolution)
    this.pscale.fill(1);
    this.alive = new Uint8Array(n).fill(1);
  }

  // ------------------------------------------------------------------ bonds

  buildBonds() {
    const n = this.n, delta = this.delta, dx = this.dx;
    const cell = delta;
    const grid = new SpatialGrid(cell);
    grid.build(this.rx, this.ry, n);

    // count first
    let nb = 0;
    const dmax = delta + dx * 0.5;
    const near = new Int32Array(256);
    for (let i = 0; i < n; i++) {
      const cnt = grid.query(this.rx[i], this.ry[i], dmax, near);
      for (let q = 0; q < cnt; q++) {
        const j = near[q];
        if (j <= i) continue;
        if (this.group[i] !== this.group[j]) continue;
        const ddx = this.rx[j] - this.rx[i], ddy = this.ry[j] - this.ry[i];
        if (ddx * ddx + ddy * ddy <= dmax * dmax) nb++;
      }
    }

    this.bi = new Int32Array(nb); this.bj = new Int32Array(nb);
    this.bk = new Float32Array(nb);      // stiffness coefficient (N per unit stretch)
    this.bref = new Float32Array(nb);
    this.bsp = new Float32Array(nb);     // accumulated plastic stretch
    this.bsy = new Float32Array(nb);     // yield stretch
    this.bsf = new Float32Array(nb);     // total stretch at failure (tension)
    this.bsten = new Float32Array(nb);   // cap on hydrostatic tension
    this.bepf = new Float32Array(nb);    // reported plastic capacity
    this.bdamp = new Float32Array(nb);
    this.bdampQ = new Float32Array(nb);
    this.bstate = new Uint8Array(nb);
    this.bcrit = new Float32Array(nb);   // cached "worst stretch seen" for viz

    let b = 0;
    for (let i = 0; i < n; i++) {
      const cnt = grid.query(this.rx[i], this.ry[i], dmax, near);
      const mi = this.matTable[this.matIndex[i]].pd;
      for (let q = 0; q < cnt; q++) {
        const j = near[q];
        if (j <= i) continue;
        if (this.group[i] !== this.group[j]) continue;
        const ddx = this.rx[j] - this.rx[i], ddy = this.ry[j] - this.ry[i];
        const r2 = ddx * ddx + ddy * ddy;
        if (r2 > dmax * dmax) continue;
        const r = Math.sqrt(r2);
        const mj = this.matTable[this.matIndex[j]].pd;
        const iface = this.body[i] === this.body[j] ? 1 : 0.55;
        const bp = bondPair(mi, mj, iface);

        // partial-volume correction for bonds straddling the horizon
        let vc = 1;
        if (r > delta - dx * 0.5) vc = clamp((delta + dx * 0.5 - r) / dx, 0, 1);

        const V = this.vol;
        // geometric mean of the two out-of-plane corrections keeps the bond
        // symmetric while preserving the wave speed inside each part
        const sc = Math.sqrt(this.pscale[i] * this.pscale[j]);
        const k = bp.c * V * V * vc * sc;
        const meff = (this.mass[i] * this.mass[j]) / (this.mass[i] + this.mass[j]);

        this.bi[b] = i; this.bj[b] = j;
        this.bref[b] = r;
        this.bk[b] = k;
        const sScale = 0.5 * (this.strength[i] + this.strength[j]);
        this.bsy[b] = bp.sy;
        this.bsf[b] = bp.sf * sScale;
        this.bsten[b] = bp.sTen;
        this.bepf[b] = bp.epsF * sScale;
        // Kelvin-Voigt bond damping at ~4.5 % of critical for the equivalent
        // linear spring K = k/r0. Keeps the explicit scheme quiet at the
        // lattice scale without visibly damping the event. The quadratic term
        // below is a von Neumann-Richtmyer artificial viscosity: it is active
        // only in compression and spreads shocks over ~2 lattice spacings.
        const K = Math.max(k, 1e-9) / Math.max(r, 1e-9);      // N/m
        const cdCrit = 2 * Math.sqrt(K * meff);
        this.bdamp[b] = 0.05 * cdCrit;
        // von Neumann-Richtmyer style shock viscosity, expressed as a fraction
        // of critical damping so it can never dominate the elastic response:
        // it reaches 0.6 x critical when the relative normal velocity equals
        // the material's bar wave speed.
        this.bdampQ[b] = 0.6 * cdCrit / Math.min(mi.cWave, mj.cWave);
        this.bstate[b] = BOND.INTACT;
        this.nBond[i]++; this.nBond[j]++;
        this.stiffSum[i] += bp.c * V * vc * sc / (r * this.pscale[i]);
        this.stiffSum[j] += bp.c * V * vc * sc / (r * this.pscale[j]);
        b++;
      }
    }
    this.nb = b;
    this.nBond0 = Uint16Array.from(this.nBond);
  }

  /** Flag particles adjacent to a free surface: only these need contact tests. */
  classifySurface() {
    let maxB = 0;
    for (let i = 0; i < this.n; i++) if (this.nBond0[i] > maxB) maxB = this.nBond0[i];
    for (let i = 0; i < this.n; i++) {
      if (this.nBond0[i] < maxB * 0.82) this.flags[i] |= 1;
    }
  }

  /** Mark lateral-boundary particles (absorbing band + clamped outer rows). */
  applyLateralBC(insideTest) {
    const band = this.delta * 2.2;
    const half = this.width * 0.5;
    for (let i = 0; i < this.n; i++) {
      const dxp = this.rx[i] - this.ox, dyp = this.ry[i] - this.oy;
      const u = dxp * this.bx + dyp * this.by;
      const s = dxp * this.ax + dyp * this.ay;
      const dEdge = half - Math.abs(u);
      if (dEdge > band) continue;
      // only constrain where the real plate continues past the corridor
      const outX = this.ox + this.ax * s + this.bx * (u > 0 ? half + this.dx * 2 : -half - this.dx * 2);
      const outY = this.oy + this.ay * s + this.by * (u > 0 ? half + this.dx * 2 : -half - this.dx * 2);
      if (!insideTest(outX, outY)) continue;
      this.flags[i] |= 2;                       // absorbing
      // decay rate ramps up quadratically towards the corridor edge, so the
      // band absorbs outgoing stress waves instead of reflecting them
      const f = 1 - clamp(dEdge / band, 0, 1);
      this.bcRate[i] = 4.0e5 * f * f;
      if (dEdge < this.delta * 0.8) this.flags[i] |= 4;   // clamped
    }
  }

  computeStableDt() {
    let dt = Infinity;
    for (let i = 0; i < this.n; i++) {
      const pd = this.matTable[this.matIndex[i]].pd;
      const d = stableDt(pd.rho, this.stiffSum[i]);
      if (d < dt) dt = d;
    }
    this.dtStable = dt;
    return dt;
  }

  /** Bulk accounting used by the diagnostics panel. */
  stats() {
    let ke = 0, mArm = 0, mPen = 0, mFree = 0, dmgSum = 0, tmax = 0;
    for (let i = 0; i < this.n; i++) {
      const m = this.mass[i];
      ke += 0.5 * m * (this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i]);
      if (this.role[i] === ROLE.ARMOUR) mArm += m;
      else if (this.role[i] === ROLE.PENETRATOR) mPen += m;
      if (this.flags[i] & 8) mFree += m;
      dmgSum += this.damage[i];
      if (this.temp[i] > tmax) tmax = this.temp[i];
    }
    return { ke, mArm, mPen, mFree, dmgMean: this.n ? dmgSum / this.n : 0, tmax };
  }
}

// ---------------------------------------------------------------------------
/** Uniform spatial grid used for bond construction and contact search. */
export class SpatialGrid {
  constructor(cell) { this.cell = cell; }

  build(xs, ys, n, subset = null) {
    const count = subset ? subset.length : n;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let q = 0; q < count; q++) {
      const i = subset ? subset[q] : q;
      const x = xs[i], y = ys[i];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1; }
    const inv = 1 / this.cell;
    this.x0 = x0 - this.cell; this.y0 = y0 - this.cell;
    this.gw = Math.max(1, Math.ceil((x1 - x0) * inv) + 3);
    this.gh = Math.max(1, Math.ceil((y1 - y0) * inv) + 3);
    const nc = this.gw * this.gh;
    if (!this.head || this.head.length < nc) { this.head = new Int32Array(nc); }
    this.head.fill(-1, 0, nc);
    if (!this.next || this.next.length < n) this.next = new Int32Array(n);
    this.inv = inv; this.nc = nc;
    for (let q = 0; q < count; q++) {
      const i = subset ? subset[q] : q;
      const cx = ((xs[i] - this.x0) * inv) | 0;
      const cy = ((ys[i] - this.y0) * inv) | 0;
      if (cx < 0 || cy < 0 || cx >= this.gw || cy >= this.gh) { this.next[i] = -1; continue; }
      const c = cy * this.gw + cx;
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
    this.xs = xs; this.ys = ys;
  }

  query(x, y, r, out) {
    const c0x = (((x - r) - this.x0) * this.inv) | 0;
    const c1x = (((x + r) - this.x0) * this.inv) | 0;
    const c0y = (((y - r) - this.y0) * this.inv) | 0;
    const c1y = (((y + r) - this.y0) * this.inv) | 0;
    let k = 0;
    const r2 = r * r;
    for (let cy = Math.max(0, c0y); cy <= Math.min(this.gh - 1, c1y); cy++) {
      const row = cy * this.gw;
      for (let cx = Math.max(0, c0x); cx <= Math.min(this.gw - 1, c1x); cx++) {
        for (let i = this.head[row + cx]; i !== -1; i = this.next[i]) {
          const dx = this.xs[i] - x, dy = this.ys[i] - y;
          if (dx * dx + dy * dy <= r2 && k < out.length) out[k++] = i;
        }
      }
    }
    return k;
  }
}
