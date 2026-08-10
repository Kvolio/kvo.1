/**
 * PERIDYNAMIC SOLVER
 * ==================
 *
 * Explicit velocity-Verlet integration of
 *
 *   rho * u_tt(x,t) = INT_H f(u(x') - u(x), x' - x) dV_x'  +  b(x,t)
 *
 * discretised as  m_i a_i = SUM_j f_ij V_i V_j + b_i.
 *
 * BOND CONSTITUTIVE LAW (per bond, see materials/derive.js)
 * --------------------------------------------------------
 *   s   = (|y| - |xi|) / |xi|                     total stretch
 *   s_e = s - s_p                                 elastic part
 *   |s_e| <= s_y(edot, T)                         elastic-perfectly-plastic
 *   f    = c * s_e * e            (+ damping + artificial viscosity)
 *
 *   yield stretch is rate-hardened and thermally softened:
 *     s_y = (Y/E) * (1 + C ln edot) * (1 - T*^m)
 *   with T rising adiabatically from the plastic work done in the bond. That
 *   coupling is what produces adiabatic shear localisation — plugging in
 *   titanium and high-hardness steel, and the self-sharpening of DU rods —
 *   without any special-case code.
 *
 * FAILURE
 * -------
 *   tension            s      >= eps_f
 *   shear/compression  |s_p|  >= 2.5 eps_f   (accumulated plastic stretch)
 * A ceramic reaches eps_f before it yields (brittle cleavage); a steel yields
 * first and tears only after ~17 % of plastic flow. See materials/derive.js
 * for why the classical fracture-energy critical stretch is not used here.
 * A broken bond is retained in the list as a *contact pair*: it carries no
 * tension but still resists interpenetration and transmits friction. This is
 * how the channel walls, the crater lip and comminuted ceramic keep pushing
 * on the penetrator after the material has failed.
 *
 * CONTACT
 * -------
 * Two mechanisms, deliberately disjoint so no pair is counted twice:
 *   1. broken bonds  -> short-range repulsion between former neighbours
 *   2. spatial hash  -> pairs that were never reference neighbours
 *      (projectile vs plate, fragments vs anything, closed channel walls)
 *
 * ENERGY BOOKKEEPING
 * ------------------
 * The solver tracks kinetic energy, plastic dissipation, fracture energy and
 * damping/contact losses every step so the report can show where the impact
 * energy actually went. Nothing is thrown away silently.
 */

import { SpatialGrid, BOND, ROLE } from './domain.js';
import { clamp } from '../../core/math.js';

const COMP_DUCTILITY = 4.0;   // shear/compressive plastic allowance / tensile
const MU_FRICTION = 0.15;     // dry sliding, high-pressure metal-on-metal

export class PDSolver {
  constructor(domain, opts = {}) {
    this.d = domain;
    this.grid = new SpatialGrid(domain.dx * 1.05);
    this.contactSet = new Int32Array(domain.n);
    this.contactCount = 0;
    this.near = new Int32Array(64);
    this.time = 0;
    this.steps = 0;
    this.safety = opts.safety ?? 0.32;
    this.dt = domain.dtStable * this.safety;
    this.gravity = opts.gravity ?? -9.81;
    this.contactRefresh = 8;
    this.friction = opts.friction ?? MU_FRICTION;

    // CONTACT STIFFNESS
    // A contact pair has to transmit the same stress the bulk material does,
    // otherwise the struck faces interpenetrate by a large fraction of a
    // lattice spacing before the force builds up, and the shock never forms
    // properly. For a chain of nodes at spacing dx carrying cross-section
    // A = dx*h, the equivalent axial spring is K = E*A/dx = E*h. Each node
    // therefore gets k_i = E_i * h (scaled for bodies of revolution) and a
    // pair uses the two in series.
    const h = domain.slab;
    this.kNode = new Float32Array(domain.n);
    for (let i = 0; i < domain.n; i++) {
      this.kNode[i] = domain.matTable[domain.matIndex[i]].pd.E * h * domain.pscale[i];
    }
    let kMax = 0, mMin = Infinity;
    for (let i = 0; i < domain.n; i++) {
      if (this.kNode[i] > kMax) kMax = this.kNode[i];
      if (domain.mass[i] < mMin) mMin = domain.mass[i];
    }
    this.kContact = kMax;
    this.dcContact = domain.dx * 0.98;
    this.contactZeta = opts.contactZeta ?? 0.25;
    // Global scalings on the two bond viscosity terms. The linear term is
    // numerical housekeeping and must stay small or it dissipates the impact
    // itself; the quadratic term is the shock viscosity and only acts under
    // strong compression.
    this.dampLin = opts.dampLin ?? 0.2;
    this.dampQuad = opts.dampQuad ?? 1;

    // OUT-OF-PLANE CONFINEMENT (2-D -> 3-D correction)
    // Opening a cavity in a plane-strain slice only requires material to flow
    // sideways in the plane. Opening the same cavity in a real plate requires
    // it to flow radially in two directions against the hoop stress of the
    // surrounding material, which costs more work. Without a correction, a 2-D
    // section systematically under-predicts the resistance of a deep channel.
    // The correction is applied as extra stiffness against *compressive*
    // dilatation only, so it changes cavity expansion without changing the
    // tensile/spall response. It is a calibration factor, not a derivation:
    // it is exposed in the UI and documented in MODEL.md §3.6.
    this.confinement = opts.confinement ?? 1.8;

    // contact stiffness also constrains the time step
    const dtC = 0.22 * 2 * Math.sqrt(mMin / Math.max(kMax, 1e-9));
    this.dt = Math.min(this.dt, dtC);
    this.dtBase = this.dt;

    this.energy = { plastic: 0, fracture: 0, damping: 0, contact: 0 };
    // Energy audit. An explicit scheme with penalty contact and rate-dependent
    // plasticity is not exactly conservative; rather than hide that, the drift
    // is measured every step and reported in the diagnostics panel.
    this.E0 = null;
    this.brokenThisStep = 0;
    this.totalBroken = 0;
    this.maxContactForce = 0;
    this.newlyFree = [];
    this.refreshContactSet();
    this.computeForces();
    this.E0 = this.kinetic() + this.strainEnergy();
  }

  /** Particles that may participate in non-neighbour contact. */
  refreshContactSet() {
    const d = this.d;
    let k = 0;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i]) continue;
      if ((d.flags[i] & 1) || d.damage[i] > 0.02 || (d.flags[i] & 8)) this.contactSet[k++] = i;
    }
    this.contactCount = k;
  }

  /** One explicit step. Returns the time advanced. */
  step(dt = this.dt) {
    const d = this.d;
    const n = d.n;
    const px = d.px, py = d.py, vx = d.vx, vy = d.vy, fx = d.fx, fy = d.fy, invM = d.invM;
    const alive = d.alive;
    const half = 0.5 * dt;

    // --- half kick with the force from the end of the previous step -------
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      vx[i] += fx[i] * invM[i] * half;
      vy[i] += fy[i] * invM[i] * half;
    }
    this.applyConstraints(dt);
    // --- drift ------------------------------------------------------------
    for (let i = 0; i < n; i++) { if (alive[i]) { px[i] += vx[i] * dt; py[i] += vy[i] * dt; } }

    // --- new forces -------------------------------------------------------
    this.computeForces(dt);

    // --- half kick --------------------------------------------------------
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      vx[i] += fx[i] * invM[i] * half;
      vy[i] += fy[i] * invM[i] * half;
    }
    this.applyConstraints(dt);

    this.time += dt;
    this.steps++;
    if (this.steps % this.contactRefresh === 0) this.refreshContactSet();
    if (this.steps % 4 === 0) this.updateFlowFactors();
    return dt;
  }

  applyConstraints(dt) {
    const d = this.d, n = d.n;
    for (let i = 0; i < n; i++) {
      if (!d.alive[i]) { d.vx[i] = 0; d.vy[i] = 0; continue; }
      const fl = d.flags[i];
      if (fl & 4) { d.vx[i] = 0; d.vy[i] = 0; continue; }
      if (fl & 2) {
        const k = 1 / (1 + d.bcRate[i] * dt);
        d.vx[i] *= k; d.vy[i] *= k;
      }
    }
  }

  /** Johnson-Cook multiplier per particle, refreshed every few steps. */
  updateFlowFactors() {
    const d = this.d;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i]) continue;
      const pd = d.matTable[d.matIndex[i]].pd;
      let f = 1;
      const edot = d.srate[i];
      if (pd.jcC > 0 && edot > 1) f += pd.jcC * Math.log(edot);
      const Tstar = clamp((d.temp[i] - 293) / (pd.Tm - 293), 0, 1);
      if (Tstar > 0) f *= Math.max(0.03, 1 - Math.pow(Tstar, pd.jcM));
      d.flowMul[i] = f;
      d.srate[i] *= 0.5;   // decay the accumulator
    }
  }

  computeForces(dt = this.dt) {
    const d = this.d;
    const n = d.n, nb = d.nb;
    const px = d.px, py = d.py, vx = d.vx, vy = d.vy;
    const fx = d.fx, fy = d.fy;
    const bi = d.bi, bj = d.bj, bk = d.bk, bref = d.bref, bsp = d.bsp;
    const bsy = d.bsy, bsf = d.bsf, bstate = d.bstate;
    const theta = d.theta, thetaAcc = d.thetaAcc, thetaCnt = d.thetaCnt;
    const plStrain = d.plStrain;
    const bdamp = d.bdamp, bdampQ = d.bdampQ, bcrit = d.bcrit;
    const mass = d.mass, temp = d.temp, flowMul = d.flowMul, srate = d.srate;
    const virial = d.virial, damage = d.damage, nBroken = d.nBroken, nBond0 = d.nBond0;
    const flags = d.flags, alive = d.alive;

    fx.fill(0); fy.fill(0); virial.fill(0);

    // ---- pass 1: local dilatation ---------------------------------------
    // theta_i is the mean stretch of the bonds still attached to node i. For
    // uniform dilatation every bond stretches equally and theta recovers the
    // volumetric strain; for pure shear the bond stretches average to zero.
    // It must be evaluated at the *current* configuration: lagging it by even
    // one step couples the stiffest (hydrostatic) mode to a delayed force and
    // drives an explicit instability that no realistic time step survives.
    thetaAcc.fill(0); thetaCnt.fill(0);
    for (let b = 0; b < nb; b++) {
      if (bstate[b] !== BOND.INTACT) continue;
      const i = bi[b], j = bj[b];
      if (!alive[i] || !alive[j]) continue;
      const dx = px[j] - px[i], dy = py[j] - py[i];
      const r0 = bref[b];
      const st = (Math.sqrt(dx * dx + dy * dy) - r0) / r0;
      thetaAcc[i] += st; thetaAcc[j] += st;
      thetaCnt[i]++; thetaCnt[j]++;
    }
    for (let i = 0; i < n; i++) theta[i] = thetaCnt[i] > 0 ? thetaAcc[i] / thetaCnt[i] : 0;

    let ePlast = 0, eFrac = 0, eDamp = 0;
    let broken = 0;
    const kNode = this.kNode, zetaC = this.contactZeta;
    const dLin = this.dampLin, dQuad = this.dampQuad, conf = this.confinement;
    const dC = this.dcContact;
    const mu = this.friction;
    const invDt = dt > 0 ? 1 / dt : 0;

    // ------------------------------------------------------------- bonds --
    for (let b = 0; b < nb; b++) {
      const i = bi[b], j = bj[b];
      if (!alive[i] || !alive[j]) continue;
      const dx = px[j] - px[i], dy = py[j] - py[i];
      let r = Math.sqrt(dx * dx + dy * dy);
      if (r < 1e-12) r = 1e-12;
      const ex = dx / r, ey = dy / r;
      const dvx = vx[j] - vx[i], dvy = vy[j] - vy[i];
      const vn = dvx * ex + dvy * ey;

      if (bstate[b] === BOND.INTACT) {
        const r0 = bref[b];
        const s = (r - r0) / r0;

        // VOLUMETRIC / DEVIATORIC SPLIT
        // Plastic flow is deviatoric. Capping the whole bond stretch at yield
        // would also cap the hydrostatic response, leaving the material with
        // no bulk modulus above ~1 GPa - it would behave like a pressure-
        // limited fluid under the impact shock, dissipate the entire shock as
        // "plastic work", heat itself past its melting point and disintegrate.
        // The isotropic part of the stretch is therefore always elastic and
        // only the deviatoric remainder can yield.
        let sIso = 0.5 * (theta[i] + theta[j]);
        if (sIso < 0) sIso *= conf;
        const sDev = s - sIso;
        let sp = bsp[b];
        let se = sDev - sp;
        const sy = bsy[b] * 0.5 * (flowMul[i] + flowMul[j]);

        if (se > sy || se < -sy) {
          const dsp = se > sy ? se - sy : se + sy;
          sp += dsp; se = se > 0 ? sy : -sy;
          const w = Math.abs(dsp) * r0 * Math.abs(bk[b] * sy);
          ePlast += w;
          const hw = 0.5 * w;
          temp[i] += hw / (mass[i] * d.matTable[d.matIndex[i]].pd.cp);
          temp[j] += hw / (mass[j] * d.matTable[d.matIndex[j]].pd.cp);
          bsp[b] = sp;
          const dpe = Math.abs(dsp) * 0.5;
          plStrain[i] += dpe; plStrain[j] += dpe;
        }

        // --- failure ------------------------------------------------------
        // tension: total stretch reaches the measured failure strain
        // shear/compression: accumulated *plastic* stretch exhausts the
        //   ductility. Using the accumulated plastic variable rather than the
        //   instantaneous deviatoric stretch matters: in a heavily damaged
        //   region the local dilatation is estimated from a shrinking, biased
        //   set of surviving bonds, so the instantaneous split is noisy and
        //   feeds back into more breakage. The plastic accumulator is
        //   monotonic and does not.
        if (s >= bsf[b] || Math.abs(sp) >= bsf[b] * COMP_DUCTILITY) {
          bstate[b] = BOND.BROKEN;
          nBroken[i]++; nBroken[j]++;
          damage[i] = nBroken[i] / (nBond0[i] || 1);
          damage[j] = nBroken[j] / (nBond0[j] || 1);
          if (damage[i] >= 0.96 && !(flags[i] & 8)) { flags[i] |= 8; this.newlyFree.push(i); }
          if (damage[j] >= 0.96 && !(flags[j] & 8)) { flags[j] |= 8; this.newlyFree.push(j); }
          // energy released = 0.5 k s_e^2 r0 stored elastically
          eFrac += 0.5 * bk[b] * se * se * r0;
          broken++;
          continue;
        }

        if (bcrit[b] < s) bcrit[b] = s;

        const sdot = Math.abs(vn) / r0;
        srate[i] += sdot; srate[j] += sdot;

        const F = bk[b] * (sIso + se);
        // Kelvin-Voigt damping plus a compression-only shock viscosity.
        // Sign convention for this bond: positive = tension (pulls i toward
        // j), so a damper resisting approach (vn < 0) must be negative.
        let Fd = bdamp[b] * dLin * vn;
        if (vn < 0) Fd -= bdampQ[b] * dQuad * vn * vn;
        eDamp += Math.abs(Fd * vn) * dt;
        const Ft = F + Fd;
        fx[i] += Ft * ex; fy[i] += Ft * ey;
        fx[j] -= Ft * ex; fy[j] -= Ft * ey;
        const vir = F * r * 0.5;
        virial[i] += vir; virial[j] += vir;
      } else {
        // ---- broken bond acting as a contact pair ------------------------
        if (r < dC) {
          const meff = (mass[i] * mass[j]) / (mass[i] + mass[j]);
          const kC = (2 * kNode[i] * kNode[j]) / (kNode[i] + kNode[j]);
          let Fn = kC * (dC - r);                   // magnitude, repulsive
          if (vn < 0) Fn += 2 * zetaC * Math.sqrt(kC * meff) * -vn;
          fx[i] -= Fn * ex; fy[i] -= Fn * ey;
          fx[j] += Fn * ex; fy[j] += Fn * ey;
          // Coulomb friction along the contact tangent, capped so a single
          // step can never reverse the relative tangential motion
          const vtx = dvx - vn * ex, vty = dvy - vn * ey;
          const vt = Math.hypot(vtx, vty);
          if (vt > 1e-6) {
            const s = Math.min(mu * Fn, meff * vt * invDt * 0.5) / vt;
            fx[i] += s * vtx; fy[i] += s * vty;
            fx[j] -= s * vtx; fy[j] -= s * vty;
          }
          virial[i] -= Fn * r * 0.5; virial[j] -= Fn * r * 0.5;
        }
      }
    }

    // ------------------------------------------------- non-neighbour contact
    const cs = this.contactSet, cn = this.contactCount;
    if (cn > 1) {
      this.grid.cell = dC * 1.02;
      this.grid.build(px, py, n, cs.subarray(0, cn));
      const near = this.near;
      const deltaCut = d.delta + d.dx * 0.5;
      let maxF = 0;
      for (let q = 0; q < cn; q++) {
        const i = cs[q];
        const cnt = this.grid.query(px[i], py[i], dC, near);
        for (let z = 0; z < cnt; z++) {
          const j = near[z];
          if (j <= i) continue;
          // skip reference neighbours - already handled by the bond list
          if (d.group[i] === d.group[j]) {
            const rdx = d.rx[j] - d.rx[i], rdy = d.ry[j] - d.ry[i];
            if (rdx * rdx + rdy * rdy <= deltaCut * deltaCut) continue;
          }
          const dx = px[j] - px[i], dy = py[j] - py[i];
          let r = Math.sqrt(dx * dx + dy * dy);
          if (r >= dC || r < 1e-12) continue;
          const ex = dx / r, ey = dy / r;
          const dvx = vx[j] - vx[i], dvy = vy[j] - vy[i];
          const vn = dvx * ex + dvy * ey;
          const pen = dC - r;
          const meff = (mass[i] * mass[j]) / (mass[i] + mass[j]);
          const kC = (2 * kNode[i] * kNode[j]) / (kNode[i] + kNode[j]);
          let Fn = kC * pen;
          if (vn < 0) Fn += 2 * zetaC * Math.sqrt(kC * meff) * -vn;
          if (Fn > maxF) maxF = Fn;
          fx[i] -= Fn * ex; fy[i] -= Fn * ey;
          fx[j] += Fn * ex; fy[j] += Fn * ey;
          const vtx = dvx - vn * ex, vty = dvy - vn * ey;
          const vt = Math.hypot(vtx, vty);
          if (vt > 1e-6) {
            const s = Math.min(mu * Fn, meff * vt * invDt * 0.5) / vt;
            fx[i] += s * vtx; fy[i] += s * vty;
            fx[j] -= s * vtx; fy[j] -= s * vty;
          }
          virial[i] -= Fn * r * 0.5; virial[j] -= Fn * r * 0.5;
          this.energy.contact += Math.abs(Fn * vn) * dt * 0.25;
        }
      }
      this.maxContactForce = maxF;
    } else this.maxContactForce = 0;

    // --------------------------------------------------------- body forces
    const g = this.gravity;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) { fx[i] = 0; fy[i] = 0; continue; }
      fy[i] += mass[i] * g;
      virial[i] /= d.vol;
    }

    this.energy.plastic += ePlast;
    this.energy.fracture += eFrac;
    this.energy.damping += eDamp;
    this.brokenThisStep = broken;
    this.totalBroken += broken;
  }

  /** Kinetic energy of a role subset. */
  kineticOf(role) {
    const d = this.d;
    let e = 0;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i]) continue;
      if (role !== undefined && d.role[i] !== role) continue;
      e += 0.5 * d.mass[i] * (d.vx[i] * d.vx[i] + d.vy[i] * d.vy[i]);
    }
    return e;
  }

  /** Total kinetic energy (all particles). */
  kinetic() { return this.kineticOf(undefined); }

  /** Elastic strain energy stored in the intact bonds. */
  strainEnergy() {
    const d = this.d;
    let U = 0;
    for (let b = 0; b < d.nb; b++) {
      if (d.bstate[b] !== BOND.INTACT) continue;
      const i = d.bi[b], j = d.bj[b];
      if (!d.alive[i] || !d.alive[j]) continue;
      const r = Math.hypot(d.px[j] - d.px[i], d.py[j] - d.py[i]);
      const se = (r - d.bref[b]) / d.bref[b] - d.bsp[b];
      U += 0.5 * d.bk[b] * se * se * d.bref[b];
    }
    return U;
  }

  /**
   * Closure of the energy budget.
   *   drift = (KE + U + dissipated) / E0 - 1
   * A positive drift is numerical energy creation, a negative one is energy
   * lost to the absorbing boundary (which is deliberate) plus scheme damping.
   * Shown in the UI so a run that has gone numerically bad is obvious.
   */
  energyAudit() {
    const ke = this.kinetic();
    const U = this.strainEnergy();
    if (this.E0 === null || this.E0 <= 0) this.E0 = ke + U;
    const diss = this.energy.plastic + this.energy.fracture + this.energy.damping;
    const total = ke + U + diss;
    return {
      E0: this.E0, kinetic: ke, strain: U,
      plastic: this.energy.plastic, fracture: this.energy.fracture,
      damping: this.energy.damping, contactWork: this.energy.contact,
      total, drift: this.E0 > 0 ? total / this.E0 - 1 : 0,
    };
  }
}

export { ROLE };
