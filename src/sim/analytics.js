/**
 * INDEPENDENT ANALYTIC CROSS-CHECKS
 * =================================
 *
 * The peridynamic run is the simulation. These closed-form engineering models
 * are *not* used to drive it — they are computed alongside it and reported
 * next to the simulated answer so the user can see whether the continuum model
 * is behaving sensibly for the case at hand.
 *
 * Treating an unvalidated simulation as ground truth is exactly the failure
 * mode this panel exists to prevent. Where the model and the correlations
 * disagree strongly, that disagreement is information.
 *
 * Models implemented
 * ------------------
 *  - Tate / Alekseevskii rigid-plastic long-rod penetration
 *      Tate, A. "A theory for the deceleration of long rods after impact",
 *      J. Mech. Phys. Solids 15 (1967) 387-399.
 *      Alekseevskii, V.P., Combust. Explos. Shock Waves 2 (1966) 63-66.
 *  - Hydrodynamic (Birkhoff) limit, P/L = sqrt(rho_p/rho_t)
 *      Birkhoff, MacDougall, Pugh & Taylor, J. Appl. Phys. 19 (1948) 563.
 *  - de Marre empirical penetration correlation (19th-c. naval gunnery fit,
 *      still the standard first-order estimate for capped AP shot vs RHA)
 *  - Recht-Ipson residual velocity after plugging
 *      Recht & Ipson, J. Appl. Mech. 30 (1963) 384-390.
 *  - Lambert-Jonas ballistic-limit form, v_r = a (v^p - v_bl^p)^(1/p)
 *      Lambert & Jonas, BRL-R-1852 (1976).
 *  - Cavity-expansion target resistance for the Tate R_t term
 *      R_t = (2/3) Y [1 + ln(E / 3Y)]
 */

import { clamp, DEG } from '../core/math.js';

/**
 * Tate/Alekseevskii long-rod penetration, integrated numerically.
 * @returns {{depth:number, residualLength:number, residualVelocity:number,
 *            time:number, phases:Array, hydroLimit:number}}
 */
export function tatePenetration({ rhoP, rhoT, Yp, Rt, L0, v0, obliquity = 0, maxT = 1e-3 }) {
  let L = L0, v = v0, P = 0, t = 0;
  const dt = 2e-8;
  const trace = [];
  const cosO = Math.max(0.2, Math.cos(obliquity));
  let steps = 0;
  while (t < maxT && L > 1e-4 && v > 1) {
    // rho_p (v-u)^2 / 2 + Yp = rho_t u^2 / 2 + Rt   ->  quadratic in u
    const A = 0.5 * (rhoP - rhoT);
    const B = -rhoP * v;
    const C = 0.5 * rhoP * v * v + Yp - Rt;
    let u;
    if (Math.abs(A) < 1e-6) {
      u = -C / B;
    } else {
      const disc = B * B - 4 * A * C;
      if (disc < 0) break;                       // rod cannot penetrate
      const s = Math.sqrt(disc);
      const u1 = (-B - s) / (2 * A), u2 = (-B + s) / (2 * A);
      u = Math.min(u1, u2);
      if (u < 0) u = Math.max(u1, u2);
    }
    if (!(u > 0)) break;
    if (u > v) u = v;
    // rigid-body phase: if the rod is strong enough it does not erode
    const eroding = 0.5 * rhoP * (v - u) * (v - u) > Yp;
    if (eroding) L -= (v - u) * dt;
    v -= (Yp / (rhoP * Math.max(L, 1e-5))) * dt;
    P += u * dt * cosO;
    t += dt;
    if ((steps++ % 40) === 0) trace.push({ t, P, L, v, u });
    if (steps > 200000) break;
  }
  return {
    depth: P, residualLength: Math.max(0, L), residualVelocity: Math.max(0, v),
    time: t, trace, hydroLimit: L0 * Math.sqrt(rhoP / rhoT),
  };
}

/** Cavity-expansion target resistance used for R_t. */
export function cavityResistance(Y, E) {
  return (2 / 3) * Y * (1 + Math.log(Math.max(E / (3 * Y), 1.0001)));
}

/**
 * de Marre correlation for capped AP shot against homogeneous steel armour.
 *   v50 = K * T^0.7 * d^0.75 / sqrt(m)  ,  T normal to the plate
 * K is a dimensional fitting constant, not a physical property. The value used
 * here (66 000, with T and d in metres, m in kg and v in m/s) is fitted to two
 * well-documented reference points: 88 mm PzGr 39 (10.2 kg) defeating ~120 mm
 * of RHA at 800 m/s, and 76 mm M79 shot (6.3 kg) defeating ~109 mm at 792 m/s.
 * It is exposed here, and in the UI, because it is a fit and not a law.
 */
export const DEMARRE_K = 66000;

export function deMarreV50({ thickness, diameter, mass, obliquity = 0, K = DEMARRE_K }) {
  const T = thickness / Math.max(0.2, Math.cos(obliquity));
  return K * Math.pow(T, 0.7) * Math.pow(diameter, 0.75) / Math.sqrt(Math.max(mass, 1e-6));
}

/** Inverse: thickness defeated at a given striking velocity. */
export function deMarreThickness({ velocity, diameter, mass, obliquity = 0, K = DEMARRE_K }) {
  const T = Math.pow((velocity * Math.sqrt(mass)) / (K * Math.pow(diameter, 0.75)), 1 / 0.7);
  return T * Math.max(0.2, Math.cos(obliquity));
}

/** Recht-Ipson residual velocity after plugging. */
export function rechtIpson(v, vbl, mProj, mPlug) {
  if (v <= vbl) return 0;
  return (mProj / (mProj + mPlug)) * Math.sqrt(v * v - vbl * vbl);
}

/** Lambert-Jonas residual velocity form. */
export function lambertJonas(v, vbl, a = 1, p = 2) {
  if (v <= vbl) return 0;
  return a * Math.pow(Math.pow(v, p) - Math.pow(vbl, p), 1 / p);
}

/**
 * Indicative mass-efficiency of a layer relative to RHA. This is a coarse
 * scaling from density, hardness and toughness — useful for ranking arrays,
 * not for quoting numbers. Flagged as indicative everywhere it is shown.
 */
export function rhaEquivalence(mat, rha) {
  const hard = Math.pow(mat.BHN / rha.BHN, 0.32);
  const tough = Math.pow(Math.max(mat.G0, 1) / rha.G0, 0.10);
  const stiff = Math.pow(mat.E / rha.E, 0.12);
  const thicknessEff = clamp(hard * tough * stiff, 0.15, 3.2);
  const massEff = thicknessEff * (rha.rho / mat.rho);
  return { thicknessEff, massEff };
}

/** Whole-array indicative RHA equivalence at the shot obliquity. */
export function arrayEquivalence(scene, rha, obliquityRad = 0) {
  let te = 0, mass = 0;
  for (const L of scene.activeLayers()) {
    const e = rhaEquivalence(L.mat, rha);
    te += L.losThickness * e.thicknessEff;
    mass += L.thickness * L.mat.rho;
  }
  return { rhaeLOS: te, arealMass: mass };
}

/**
 * Full analytic panel for the current shot. Everything returned here is
 * clearly labelled in the UI as an independent estimate.
 */
export function analyticPanel({ projectile, scene, rha }) {
  const d = projectile.describe();
  const first = scene.activeLayers()[0];
  const out = { models: [] };
  if (!first) return out;

  const obl = Math.abs(first.slope) * DEG;
  const tgt = first.mat;
  const pen = projectile.parts.find((p) => p.role === 1) || projectile.parts[0];
  const penMat = pen.mat;

  const Rt = cavityResistance(tgt.Y, tgt.E);
  const Yp = 1.7 * penMat.Y;
  const tate = tatePenetration({
    rhoP: penMat.rho, rhoT: tgt.rho, Yp, Rt,
    L0: d.length, v0: projectile.speed, obliquity: obl,
  });
  out.tate = tate;
  out.models.push({
    name: 'Tate / Alekseevskii',
    value: tate.depth,
    unit: 'm',
    note: `R_t = ${(Rt / 1e9).toFixed(2)} GPa (cavity expansion), Y_p = ${(Yp / 1e9).toFixed(2)} GPa`,
  });
  out.models.push({
    name: 'Hydrodynamic limit',
    value: tate.hydroLimit * Math.cos(obl),
    unit: 'm',
    note: 'P/L = sqrt(rho_p / rho_t); strengthless upper bound',
  });

  if (['ap', 'apc', 'apcbc', 'aphe', 'apcr'].includes(projectile.cfg.type)) {
    const T = deMarreThickness({
      velocity: projectile.speed, diameter: d.penDiameter,
      mass: projectile.mass, obliquity: obl,
    });
    out.models.push({
      name: 'de Marre (empirical)',
      value: T, unit: 'm',
      note: `Fitted correlation for capped AP shot vs homogeneous steel; K = ${DEMARRE_K}`,
    });
  }

  const eq = arrayEquivalence(scene, rha, obl);
  out.arrayLOS = scene.losTotal;
  out.arrayRHAe = eq.rhaeLOS;
  out.arealMass = eq.arealMass;
  return out;
}
