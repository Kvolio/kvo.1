/**
 * PERIDYNAMIC CONSTITUTIVE CALIBRATION
 * ====================================
 *
 * Converts continuum material properties into bond-level constants for the
 * bond-based ("prototype microelastic") peridynamic solver.
 *
 * Reference relations (2-D plane-stress calibration, uniform micromodulus):
 *
 *   micromodulus            c  = 9 E / (pi * h * delta^3)
 *   critical bond stretch   s0 = sqrt( 4 pi G0 / (9 E delta) )
 *
 * where h is the out-of-plane slab depth, delta the horizon and G0 the
 * mode-I fracture energy. The 3-D counterparts (c = 18K/(pi delta^4),
 * s0 = sqrt(5 G0 / (9 K delta)) ) are given by Silling & Askari (2005); the
 * 2-D forms above are the standard plane-stress reductions used by
 * Ha & Bobaru (2010).
 *
 * FAILURE CRITERION - AN EXPLICIT DEPARTURE FROM TEXTBOOK PD
 * ----------------------------------------------------------
 * The classical bond-based failure criterion is the critical stretch
 * s0 = sqrt(4 pi G0 / (9 E delta)). It is *horizon dependent*: s0 falls as
 * 1/sqrt(delta), so at the lattice spacings that run at interactive rates
 * (delta ~ 5-15 mm) it predicts, for example, s0 ~ 0.005 for RHA - barely
 * above the yield stretch Y/E and two orders below RHA's measured 17 %
 * failure strain. Used directly it makes every metal behave like glass and
 * the whole plate disintegrates under the first stress wave.
 *
 * This model therefore fails bonds at the material's *measured total failure
 * strain* eps_f, which is resolution independent:
 *
 *      tension:      s      >= eps_f
 *      compression:  |s|    >= 2.5 eps_f
 *
 * The two regimes then separate on their own from the material data:
 *   - a ceramic has eps_f (0.001) well below its yield stretch, so it fails
 *     elastically - brittle cleavage, no plastic flow;
 *   - a steel has eps_f (0.17) far above its yield stretch, so it yields,
 *     flows plastically, heats up and then tears - ductile failure.
 * s0 is still computed and reported so the discrepancy stays visible, and it
 * is the right criterion to switch back to if the lattice is ever refined to
 * the sub-millimetre range. See docs/MODEL.md §3.4.
 *
 * The bond response used here is *not* purely microelastic. Each bond is
 * elastic-perfectly-plastic with:
 *   - a yield stretch  s_y = Y/E, rate-hardened by a Johnson-Cook term and
 *     thermally softened by the local adiabatic temperature rise;
 *   - an accumulated plastic stretch s_p which shifts the bond's rest length,
 *     giving permanent (residual) deformation.
 *
 * Compression is much harder to fail than tension (x2.5 on the failure strain),
 * so a ceramic survives the compressive pulse and disintegrates under the
 * tensile release - the behaviour that makes ceramic armour work. Load transfer
 * across failed material is carried by the short-range contact force instead,
 * so a comminuted region still resists being pushed through.
 *
 * See docs/MODEL.md §3 for the derivation, the assumptions and the known
 * limitations (Poisson's ratio lock, plane-stress vs plane-strain, surface
 * effect near free boundaries).
 */

import { clamp } from '../core/math.js';

/**
 * @param {object} m   material record from the database
 * @param {number} dx  lattice spacing (m)
 * @param {number} mRatio horizon / lattice spacing (typically 3.015)
 * @param {number} h   out-of-plane slab depth (m)
 */
export function derivePD(m, dx, mRatio, h) {
  const delta = mRatio * dx;
  const c = (9 * m.E) / (Math.PI * h * delta * delta * delta);
  const s0 = Math.sqrt((4 * Math.PI * m.G0) / (9 * m.E * delta));
  const sy = m.Y / m.E;

  // FAILURE CALIBRATION - see the note below. The bond fails at the material's
  // measured total failure strain, not at the fracture-energy critical stretch.
  const sf = Math.max(m.epsF, sy * 1.05);

  // Limit on the ISOTROPIC (hydrostatic) part of the bond stretch, from the
  // material's tensile strength: sigma_ten / E. A real metal cannot sustain
  // hydrostatic tension beyond roughly its spall strength - a few GPa - before
  // it cavitates. The isotropic term is deliberately exempt from the yield cap
  // so the material keeps a bulk modulus in compression, but leaving it
  // unbounded in tension lets a stretched region generate elastic forces tens
  // of times yield, which is an energy source, not a stiffness.
  const sTen = Math.max(m.UTS / m.E, sy);

  // Wave speed sets the explicit stability limit and the artificial-viscosity
  // scaling.
  const cWave = Math.sqrt(m.E / m.rho);

  return {
    key: m.key,
    delta,
    c,                       // micromodulus  [N/m^6]
    s0,                      // fracture-energy critical stretch (reported only)
    sf,                      // total stretch at failure (the active criterion)
    sTen,                    // cap on hydrostatic tension (UTS/E)
    sy,                      // yield stretch
    epsF: m.epsF,            // measured failure strain
    brittle: m.brittle,
    weibull: m.weibull,
    compFail: !!m.compFail,
    jcC: m.jcC || 0,
    jcM: m.jcM || 1,
    Tm: m.Tm || 1800,
    cp: m.cp || 477,
    rho: m.rho,
    E: m.E,
    Y: m.Y,
    cWave,
    erosionResist: m.erosionResist,
    selfSharpening: !!m.selfSharpening,
  };
}

/**
 * Bond constants between two (possibly different) materials.
 * Stiffness uses the harmonic mean of the two micromoduli — the standard
 * series-spring treatment of a peridynamic material interface. Strength uses
 * the weaker of the two, scaled by an interface factor (welds, bonded caps
 * and laminate plies are weaker than the bulk).
 */
export function bondPair(a, b, interfaceFactor = 1) {
  const same = a === b;
  const c = same ? a.c : (2 * a.c * b.c) / (a.c + b.c);
  const f = same ? 1 : interfaceFactor;
  return {
    c,
    s0: Math.min(a.s0, b.s0) * f,
    sf: Math.min(a.sf, b.sf) * f,
    sTen: Math.min(a.sTen, b.sTen),
    sy: Math.min(a.sy, b.sy),
    epsF: Math.min(a.epsF, b.epsF) * f,
    brittle: Math.max(a.brittle, b.brittle),
    jcC: 0.5 * (a.jcC + b.jcC),
  };
}

/**
 * Explicit stability limit for the velocity-Verlet integration of the
 * discretised peridynamic equation of motion (Silling & Askari 2005, eq. 30):
 *
 *   dt < sqrt( 2 rho_i / sum_j ( c V_j / |xi_ij| ) )
 *
 * Evaluated per node at the *reference* configuration, which is conservative
 * because bond breakage only removes stiffness.
 */
export function stableDt(rho, sumStiff) {
  if (sumStiff <= 0) return Infinity;
  return Math.sqrt((2 * rho) / sumStiff);
}

/**
 * Johnson-Cook style flow-stress multiplier.
 *   sigma_y(edot, T) = sigma_y0 * (1 + C ln(edot/edot0)) * (1 - T*^m)
 * with T* = (T - T0)/(Tm - T0). Strain hardening (the A + B eps^n term) is
 * folded into the quasi-static yield of the database entry, since the bond
 * model is perfectly plastic once past s_y.
 */
export function flowFactor(pd, strainRate, temperature) {
  const edot0 = 1.0;
  let f = 1;
  if (pd.jcC > 0 && strainRate > edot0) f += pd.jcC * Math.log(strainRate / edot0);
  const T0 = 293;
  const Tstar = clamp((temperature - T0) / (pd.Tm - T0), 0, 1);
  if (Tstar > 0) f *= Math.max(0.02, 1 - Math.pow(Tstar, pd.jcM));
  return f;
}
