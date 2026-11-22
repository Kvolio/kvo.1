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
import { flowStress } from '../materials/derive.js';

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

/**
 * LANZ-ODERMATT PERFORATION EQUATION
 * ----------------------------------
 * Empirical perforation limit of a long-rod penetrator against a steel plate,
 * as published by W. Odermatt (longrods.ch, "Perforation Equation"; Lanz &
 * Odermatt). Unlike Tate it has no free constants to choose: it is a fit to 99
 * tungsten, 42 DU and 40 steel-rod firings, with a stated standard deviation
 * of 3.3 / 3.5 / 2.8 %.
 *
 *   P/Lw = a * 1/tanh(b0 + b1 Lw/D) * cos^m(theta) * sqrt(rhoP/rhoT) * exp(-s^2/v^2)
 *
 *   tungsten, DU:  s^2 = (c0 + c1 BHN_T) BHN_T / rhoP
 *   steel:         s^2 = c0 BHN_T^k BHN_P^n / rhoP
 *
 * P is the LINE-OF-SIGHT thickness at the perforation limit (m < 0, so it
 * grows with obliquity). It is a perforation limit of a finite plate, so it is
 * the like-for-like reference for a bisected ballistic limit - Tate predicts
 * semi-infinite penetration depth, which is always somewhat shallower.
 *
 * UNITS. The source states none. They are fixed by its own v_min formula,
 * v_min = sqrt(s^2 / 1.5): only density in kg/m^3 with velocity in km/s gives
 * a sensible minimum (about 0.97 km/s for tungsten against 260 BHN steel).
 * Density in g/cm^3, or velocity in m/s, makes the hardness term either
 * astronomically large or negligible.
 *
 * Validity as published: Lw/D >= 4, obliquity 0-75 deg, target 150-500 BHN,
 * steel penetrators 200-750 BHN, and v above v_min. Outside that the function
 * still returns a number but flags `valid: false`.
 */
export const LANZ_ODERMATT = {
  b0: 0.283, b1: 0.0656, m: -0.224,
  tungsten: { a: 0.994, c0: 134.5, c1: -0.148 },
  du: { a: 0.825, c0: 90.0, c1: -0.0849 },
  steel: { a: 1.104, c0: 9874, k: 0.3598, n: -0.2342 },
};

/** Which Lanz-Odermatt family a penetrator material belongs to, or null. */
export function lanzOdermattFamily(mat) {
  const k = mat.key || '';
  if (k === 'du') return 'du';
  if (/^wha|^tungsten$/.test(k)) return 'tungsten';
  if (mat.class === 'metal' && mat.rho > 7500 && mat.rho < 8300) return 'steel';
  return null;   // carbide, diamond, tantalum, copper... outside the fitted data
}

/**
 * @param {object} o
 * @param {'tungsten'|'du'|'steel'} o.family
 * @param {number} o.Lw    working (rod) length, m
 * @param {number} o.D     rod diameter, m
 * @param {number} o.rhoP  rod density, kg/m^3
 * @param {number} o.rhoT  target density, kg/m^3
 * @param {number} o.bhnT  target Brinell hardness
 * @param {number} [o.bhnP] rod Brinell hardness (steel rods only)
 * @param {number} o.v     striking velocity, m/s
 * @param {number} [o.obliquity] rad, from the plate normal
 * @returns {{los:number, normal:number, vmin:number, valid:boolean, why:string}}
 */
export function lanzOdermatt({ family, Lw, D, rhoP, rhoT, bhnT, bhnP = 0, v, obliquity = 0 }) {
  const C = LANZ_ODERMATT[family];
  if (!C) return { los: NaN, normal: NaN, vmin: NaN, valid: false, why: 'no fitted family' };
  const { b0, b1, m } = LANZ_ODERMATT;
  const s2 = family === 'steel'
    ? (C.c0 * Math.pow(bhnT, C.k) * Math.pow(Math.max(bhnP, 1), C.n)) / rhoP
    : ((C.c0 + C.c1 * bhnT) * bhnT) / rhoP;
  const vk = v / 1000;
  const ratio = C.a / Math.tanh(b0 + (b1 * Lw) / D)
    * Math.pow(Math.cos(obliquity), m)
    * Math.sqrt(rhoP / rhoT)
    * Math.exp(-s2 / (vk * vk));
  const los = ratio * Lw;
  const vmin = Math.sqrt(s2 / 1.5) * 1000;
  const why = [];
  if (Lw / D < 4) why.push(`L/D ${(Lw / D).toFixed(1)} < 4`);
  if (obliquity > (75 * Math.PI) / 180) why.push('obliquity > 75 deg');
  if (bhnT < 150 || bhnT > 500) why.push(`target ${bhnT} BHN outside 150-500`);
  if (family === 'steel' && (bhnP < 200 || bhnP > 750)) why.push(`rod ${bhnP} BHN outside 200-750`);
  if (v < vmin) why.push(`v ${v.toFixed(0)} below v_min ${vmin.toFixed(0)} m/s`);
  return { los, normal: los * Math.cos(obliquity), vmin, valid: why.length === 0, why: why.join('; ') };
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

  const Rt = cavityResistance(flowStress(tgt), tgt.E);
  const Yp = 1.7 * flowStress(penMat);
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
