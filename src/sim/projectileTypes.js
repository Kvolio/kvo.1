/**
 * PROJECTILE LIBRARY
 * ==================
 *
 * Each type is a *geometry + material + behaviour* description, not a label.
 * The differences between an APCBC shell and a long rod are expressed as
 *   - different cross-sections (so the meshed body is different),
 *   - different materials per part (so the constitutive response differs),
 *   - different assembly interfaces (so parts separate when they should),
 *   - different in-flight/fuzing behaviours (sabot discard, fuze delay, jet).
 * Everything downstream of that - erosion, shatter, ricochet, plugging - is
 * produced by the peridynamic solver, not by the type.
 *
 * OUT-OF-PLANE MASS CORRECTION
 * ----------------------------
 * The simulation is a plane-strain slice of depth h. A plate is genuinely
 * prismatic, so a slice of it needs no correction. A projectile is a body of
 * revolution, so a slice of width 2r(x) does not carry the right mass. Each
 * part therefore gets a scale factor
 *
 *      scale = (pi/4) * d_part / h,      h = (pi/4) * d_penetrator
 *
 * applied to both its density and its micromodulus. That preserves the part's
 * true mass and true axial force per unit of slab, and leaves the wave speed
 * unchanged. See docs/MODEL.md §2.3.
 */

import { ensureCCW, clamp, DEG } from '../core/math.js';

// ---------------------------------------------------------------------------
// geometry helpers (local frame: +x = direction of travel, nose tip at x = 0)
// ---------------------------------------------------------------------------

/** Build a closed silhouette from a radius profile r(x), x in [-L, 0]. */
function profilePoly(rf, L, samples = 30, xEnd = 0) {
  const top = [], bot = [];
  for (let k = 0; k <= samples; k++) {
    const x = xEnd - L * (k / samples);
    const r = Math.max(1e-5, rf(x));
    top.push(x, r);
    bot.push(x, -r);
  }
  const pts = [];
  for (let k = 0; k < top.length; k += 2) pts.push(top[k], top[k + 1]);
  for (let k = bot.length - 2; k >= 0; k -= 2) pts.push(bot[k], bot[k + 1]);
  return ensureCCW(Float64Array.from(pts));
}

function box(x0, x1, r) {
  return ensureCCW(Float64Array.from([x0, -r, x1, -r, x1, r, x0, r]));
}

/** Nose radius profiles. x measured back from the tip (negative). */
function noseProfile(kind, R, noseLen, tipR = 0) {
  switch (kind) {
    case 'conical': return (x) => clamp(tipR + (R - tipR) * (-x / noseLen), 0, R);
    case 'blunt': return (x) => (-x < noseLen * 0.25 ? tipR + (R - tipR) * (-x / (noseLen * 0.25)) : R);
    case 'round': return (x) => R * Math.sqrt(Math.max(0, 1 - Math.pow(1 + x / noseLen, 2)));
    case 'ogive':
    default: {
      // secant ogive with a small meplat
      return (x) => {
        const f = clamp(-x / noseLen, 0, 1);
        return clamp(tipR + (R - tipR) * Math.sqrt(1 - (1 - f) * (1 - f)), 0, R);
      };
    }
  }
}

/** Full body: ogive/blunt nose blended into a cylinder, optional boat tail. */
function bodyProfile(kind, R, L, noseLen, tipR = 0, boatTail = 0) {
  const nose = noseProfile(kind, R, noseLen, tipR);
  return (x) => {
    if (x > -noseLen) return nose(x);
    if (boatTail > 0 && x < -(L - boatTail)) {
      const f = (-x - (L - boatTail)) / boatTail;
      return R * (1 - 0.28 * f);
    }
    return R;
  };
}

// ---------------------------------------------------------------------------
// type table
// ---------------------------------------------------------------------------

const T = (o) => Object.assign({
  key: '', name: '', family: 'kinetic',
  desc: '', mechanism: '',
  defaults: {},
  fuze: null, sabot: null, jet: null,
}, o);

export const PROJECTILE_TYPES = {

  ap: T({
    key: 'ap', name: 'AP — monobloc armour-piercing shot', family: 'kinetic',
    desc: 'Uncapped hardened steel shot. Simple, cheap, and vulnerable to shatter on face-hardened plate.',
    mechanism: 'Defeats plate by pushing a plug or ductile hole. Above its shatter velocity the hard, brittle nose fails before the plate does — that emerges here from the core material\'s low fracture energy.',
    defaults: { caliber: 0.076, ld: 3.4, mass: 6.30, velocity: 792, nose: 'ogive', core: 'apsteel', noseFrac: 0.42 },
    build(c) {
      const R = c.caliber / 2, L = c.ld * c.caliber, nl = L * c.noseFrac;
      return {
        refDiameter: c.caliber, penDiameter: c.caliber, length: L,
        parts: [{
          poly: profilePoly(bodyProfile(c.nose, R, L, nl), L), material: c.core,
          role: 1, label: 'shot body', diameter: c.caliber,
        }],
      };
    },
  }),

  apc: T({
    key: 'apc', name: 'APC — armour-piercing capped', family: 'kinetic',
    desc: 'Hard core with a soft penetrating cap over the nose.',
    mechanism: 'The soft cap spreads the initial shock and confines the nose laterally, so the core survives impacts that would shatter uncapped shot. In the model the cap is a separate, much more ductile part bonded to the core with a weak interface.',
    defaults: { caliber: 0.075, ld: 3.6, mass: 6.79, velocity: 618, nose: 'blunt', core: 'apsteel', cap: 'softcap', capFrac: 0.22, noseFrac: 0.34 },
    build(c) {
      const R = c.caliber / 2, L = c.ld * c.caliber, nl = L * c.noseFrac;
      const capLen = L * c.capFrac;
      const core = profilePoly(bodyProfile('blunt', R, L, nl, R * 0.45), L, 30, -capLen * 0.55);
      const cap = profilePoly(bodyProfile('ogive', R * 0.98, capLen * 1.6, capLen * 1.5, R * 0.5), capLen * 1.6, 22, 0);
      return {
        refDiameter: c.caliber, penDiameter: c.caliber, length: L + capLen * 0.55,
        parts: [
          { poly: cap, material: c.cap, role: 2, label: 'penetrating cap', diameter: c.caliber },
          { poly: core, material: c.core, role: 1, label: 'core', diameter: c.caliber },
        ],
      };
    },
  }),

  apcbc: T({
    key: 'apcbc', name: 'APCBC — capped, ballistic cap', family: 'kinetic',
    desc: 'APC with a thin aerodynamic windscreen over the penetrating cap.',
    mechanism: 'The ballistic cap is aerodynamic only: it crushes away in the first microseconds and contributes almost nothing to penetration. That it does so is visible here rather than assumed.',
    defaults: { caliber: 0.088, ld: 3.9, mass: 10.20, velocity: 800, core: 'apsteel', cap: 'softcap', capFrac: 0.2, noseFrac: 0.32 },
    build(c) {
      const R = c.caliber / 2, L = c.ld * c.caliber, nl = L * c.noseFrac;
      const capLen = L * c.capFrac;
      const wsLen = L * 0.55;
      const core = profilePoly(bodyProfile('blunt', R, L, nl, R * 0.5), L, 30, -capLen * 0.5 - wsLen * 0.62);
      const cap = profilePoly(bodyProfile('round', R * 0.98, capLen * 1.5, capLen * 1.4, R * 0.55), capLen * 1.5, 20, -wsLen * 0.62);
      const ws = profilePoly(bodyProfile('ogive', R * 0.96, wsLen, wsLen * 0.95, R * 0.06), wsLen, 24, 0);
      return {
        refDiameter: c.caliber, penDiameter: c.caliber, length: L + capLen * 0.5 + wsLen * 0.62,
        parts: [
          { poly: ws, material: 'windscreen', role: 2, label: 'ballistic cap', diameter: c.caliber, hollow: 0.55 },
          { poly: cap, material: c.cap, role: 2, label: 'penetrating cap', diameter: c.caliber },
          { poly: core, material: c.core, role: 1, label: 'core', diameter: c.caliber },
        ],
      };
    },
  }),

  aphe: T({
    key: 'aphe', name: 'APHE — armour-piercing high explosive', family: 'kinetic',
    desc: 'Capped AP shell with a rear HE cavity and a base fuze on a delay.',
    mechanism: 'Penetrates as a kinetic round, then the base fuze functions after a set delay. If the shell is still intact and inside the target, the burst adds casing fragments and blast to whatever the penetration already did.',
    defaults: { caliber: 0.088, ld: 3.9, mass: 10.20, velocity: 800, core: 'apsteel', cap: 'softcap', filler: 'compb', fillFrac: 0.32, fuzeDelay: 300e-6, noseFrac: 0.34 },
    fuze: { kind: 'base-delay', delay: 300e-6, armThreshold: 4e5 },
    build(c) {
      const R = c.caliber / 2, L = c.ld * c.caliber, nl = L * c.noseFrac;
      const capLen = L * 0.18;
      const body = profilePoly(bodyProfile('blunt', R, L, nl, R * 0.5), L, 30, -capLen * 0.5);
      const cavR = R * 0.55, cavX1 = -L * (1 - c.fillFrac) - capLen * 0.5, cavX0 = -L + L * 0.1 - capLen * 0.5;
      const cav = box(cavX0, cavX1, cavR);
      const cap = profilePoly(bodyProfile('round', R * 0.98, capLen * 1.5, capLen * 1.4, R * 0.55), capLen * 1.5, 18, 0);
      return {
        refDiameter: c.caliber, penDiameter: c.caliber, length: L + capLen * 0.5,
        fillerCentre: [(cavX0 + cavX1) / 2, 0],
        parts: [
          { poly: cav, material: c.filler, role: 3, label: 'HE filler', diameter: cavR * 2 },
          { poly: cap, material: c.cap, role: 2, label: 'penetrating cap', diameter: c.caliber },
          { poly: body, material: c.core, role: 1, label: 'shell body', diameter: c.caliber },
        ],
      };
    },
  }),

  apcr: T({
    key: 'apcr', name: 'APCR / HVAP — composite rigid', family: 'kinetic',
    desc: 'Dense sub-calibre carbide core carried in a full-calibre light alloy body.',
    mechanism: 'The light body gives muzzle velocity; the dense core does the work. The alloy sleeve strips off at impact because the core/sleeve interface is weak. Poor sectional density means the advantage falls away with range, and the brittle carbide core shatters on sloped plate.',
    defaults: { caliber: 0.076, ld: 3.0, mass: 4.26, velocity: 1036, core: 'wc', body: 'al7075', coreFrac: 0.40, noseFrac: 0.38 },
    build(c) {
      const R = c.caliber / 2, L = c.ld * c.caliber, nl = L * c.noseFrac;
      const cr = R * c.coreFrac, cl = L * 0.72;
      const body = profilePoly(bodyProfile('ogive', R, L, nl), L);
      const core = profilePoly(bodyProfile('ogive', cr, cl, cl * 0.35), cl, 22, -nl * 0.45);
      return {
        refDiameter: c.caliber, penDiameter: cr * 2, length: L,
        parts: [
          { poly: core, material: c.core, role: 1, label: 'carbide core', diameter: cr * 2 },
          { poly: body, material: c.body, role: 2, label: 'alloy body', diameter: c.caliber },
        ],
      };
    },
  }),

  apds: T({
    key: 'apds', name: 'APDS — discarding sabot', family: 'kinetic',
    desc: 'Sub-calibre dense core launched in a discarding sabot.',
    mechanism: 'The sabot is shed after the muzzle, so the full bore area accelerates only the core. The sabot is simulated as separate parts that are released in flight; only the core reaches the target.',
    defaults: { caliber: 0.0762, coreD: 0.0305, coreLd: 4.0, mass: 1.90, velocity: 1204, core: 'wc', sabot: 'al7075', sabotRange: 1.2 },
    sabot: { discardAt: 1.2, petals: 3, spread: 55 },
    build(c) {
      const cr = c.coreD / 2, L = c.coreLd * c.coreD;
      const core = profilePoly(bodyProfile('ogive', cr, L, L * 0.35), L);
      const R = c.caliber / 2;
      const sabotLen = L * 0.62;
      const parts = [{ poly: core, material: c.core, role: 1, label: 'core', diameter: c.coreD }];
      for (const sgn of [1, -1]) {
        const p = ensureCCW(Float64Array.from([
          -sabotLen, sgn * cr * 0.95, -sabotLen * 0.15, sgn * cr * 0.95,
          -sabotLen * 0.15, sgn * R, -sabotLen, sgn * R * 0.92,
        ]));
        parts.push({ poly: p, material: c.sabot, role: 2, label: 'sabot petal', diameter: c.caliber, sabot: true, side: sgn });
      }
      return { refDiameter: c.caliber, penDiameter: c.coreD, length: L, parts };
    },
  }),

  apfsds: T({
    key: 'apfsds', name: 'APFSDS — fin-stabilised long rod', family: 'kinetic',
    desc: 'Long, dense, fin-stabilised rod launched in a discarding sabot.',
    mechanism: 'At impact the rod and the plate both behave more like very stiff fluids than solids: the rod erodes from the nose while the plate flows aside. Penetration ends when the rod is consumed. Length, not mass, is the dominant variable — which the model reproduces because erosion is resolved rather than assumed.',
    defaults: { caliber: 0.120, rodD: 0.0245, rodLd: 23, mass: 4.60, velocity: 1650, core: 'wha', sabot: 'al7075', sabotRange: 1.6 },
    sabot: { discardAt: 1.6, petals: 3, spread: 42 },
    build(c) {
      const cr = c.rodD / 2, L = c.rodLd * c.rodD;
      const rod = profilePoly(bodyProfile('conical', cr, L, L * 0.055), L);
      const parts = [{ poly: rod, material: c.core, role: 1, label: 'penetrator rod', diameter: c.rodD }];
      // fin block (4 fins seen edge-on in the cross-section)
      const finR = cr * 2.3, finL = L * 0.10;
      parts.push({
        poly: box(-L, -L + finL, finR), material: 'al7075', role: 2,
        label: 'fin assembly', diameter: finR * 2, thinFactor: 0.28,
      });
      const R = c.caliber / 2, sabotLen = L * 0.30;
      for (const sgn of [1, -1]) {
        const p = ensureCCW(Float64Array.from([
          -sabotLen * 1.6, sgn * cr * 0.95, -sabotLen * 0.2, sgn * cr * 0.95,
          -sabotLen * 0.2, sgn * R, -sabotLen * 1.6, sgn * R * 0.9,
        ]));
        parts.push({ poly: p, material: c.sabot, role: 2, label: 'sabot petal', diameter: c.caliber, sabot: true, side: sgn });
      }
      return { refDiameter: c.rodD, penDiameter: c.rodD, length: L, parts };
    },
  }),

  he: T({
    key: 'he', name: 'HE — high explosive', family: 'chemical',
    desc: 'Thin-walled shell with a large explosive fill and a nose fuze.',
    mechanism: 'Not a penetrator. Damage comes from casing fragments driven by the expanding gas (Gurney model) and from the impulse delivered to the plate, which can dish it and throw spall off the inside face of thin armour.',
    defaults: { caliber: 0.088, ld: 4.2, mass: 9.40, velocity: 600, shell: 'mild', filler: 'compb', fillFrac: 0.62, fuzeDelay: 8e-6, noseFrac: 0.36 },
    fuze: { kind: 'impact', delay: 8e-6, armThreshold: 5e4 },
    build(c) {
      const R = c.caliber / 2, L = c.ld * c.caliber, nl = L * c.noseFrac;
      const wall = R * 0.16;
      const body = profilePoly(bodyProfile('ogive', R, L, nl), L);
      const cavX1 = -nl * 0.85, cavX0 = -L + wall * 1.6;
      const cav = box(cavX0, cavX1, R - wall);
      return {
        refDiameter: c.caliber, penDiameter: c.caliber, length: L,
        fillerCentre: [(cavX0 + cavX1) / 2, 0],
        parts: [
          { poly: cav, material: c.filler, role: 3, label: 'HE filler', diameter: (R - wall) * 2 },
          { poly: body, material: c.shell, role: 2, label: 'shell casing', diameter: c.caliber },
        ],
      };
    },
  }),

  heat: T({
    key: 'heat', name: 'HEAT — shaped charge', family: 'chemical',
    desc: 'Conical copper liner collapsed by a detonation wave into a hypervelocity jet.',
    mechanism: 'Penetration is essentially velocity-independent — the jet does the work, not the shell. The model spawns the collapsed liner with the velocity gradient predicted by the PER collapse model and lets the peridynamic solver stretch it into a jet, so standoff, jet break-up and spaced-armour defeat all fall out of the simulation.',
    defaults: { caliber: 0.100, ld: 4.0, mass: 7.20, velocity: 300, liner: 'copper', filler: 'octol', standoff: 0.11, coneAngle: 60, jetTip: 8200, jetTail: 1900, jetFrac: 0.20 },
    fuze: { kind: 'impact', delay: 2e-6, armThreshold: 2e4 },
    jet: { tip: 8200, tail: 1900, massFrac: 0.20 },
    build(c) {
      const R = c.caliber / 2, L = c.ld * c.caliber;
      const wall = R * 0.10;
      const body = profilePoly(bodyProfile('ogive', R, L, L * 0.30), L);
      const coneLen = R / Math.tan((c.coneAngle / 2) * DEG);
      const apexX = -L * 0.42;
      const liner = ensureCCW(Float64Array.from([
        apexX, 0,
        apexX - coneLen, -R * 0.98,
        apexX - coneLen - wall * 0.8, -R * 0.98,
        apexX - wall * 1.3, 0,
        apexX - coneLen - wall * 0.8, R * 0.98,
        apexX - coneLen, R * 0.98,
      ]));
      const cav = box(apexX - coneLen - wall * 3.2, apexX - wall * 1.2, R - wall);
      return {
        refDiameter: c.caliber, penDiameter: c.caliber / 16, length: L,
        linerApex: [apexX, 0], coneLen,
        parts: [
          { poly: liner, material: c.liner, role: 2, label: 'shaped-charge liner', diameter: c.caliber * 0.6 },
          { poly: cav, material: c.filler, role: 3, label: 'explosive fill', diameter: (R - wall) * 2 },
          { poly: body, material: 'mild', role: 2, label: 'body', diameter: c.caliber, thinFactor: 0.3 },
        ],
      };
    },
  }),

  hesh: T({
    key: 'hesh', name: 'HESH / HEP — squash head', family: 'chemical',
    desc: 'Soft-nosed shell filled with plastic explosive and fired by a base fuze.',
    mechanism: 'The filler squashes onto the plate before the base fuze functions. The detonation drives a compressive pulse into the armour which reflects from the free rear face as tension, tearing a scab off the inside. Nothing is "placed" there: the scab appears where the reflected tensile wave exceeds the local bond strength.',
    defaults: { caliber: 0.105, ld: 4.0, mass: 16.10, velocity: 730, shell: 'mild', filler: 'hesh', fillFrac: 0.72, fuzeDelay: 120e-6 },
    fuze: { kind: 'base-delay', delay: 120e-6, armThreshold: 2e4 },
    build(c) {
      const R = c.caliber / 2, L = c.ld * c.caliber;
      const wall = R * 0.09;
      const body = profilePoly(bodyProfile('round', R, L, L * 0.34), L);
      const cavX1 = -L * 0.10, cavX0 = -L + wall * 3.0;
      const cav = profilePoly(bodyProfile('round', R - wall, cavX1 - cavX0, (cavX1 - cavX0) * 0.4), cavX1 - cavX0, 22, cavX1);
      return {
        refDiameter: c.caliber, penDiameter: c.caliber, length: L,
        fillerCentre: [(cavX0 + cavX1) / 2, 0],
        parts: [
          { poly: cav, material: c.filler, role: 3, label: 'plastic explosive', diameter: (R - wall) * 2 },
          { poly: body, material: c.shell, role: 2, label: 'thin casing', diameter: c.caliber, thinFactor: 0.5 },
        ],
      };
    },
  }),
};

export const TYPE_ORDER = ['ap', 'apc', 'apcbc', 'aphe', 'apcr', 'apds', 'apfsds', 'he', 'heat', 'hesh'];

/** Full config for a type with user overrides applied. */
export function makeProjectileConfig(typeKey, overrides = {}) {
  const t = PROJECTILE_TYPES[typeKey];
  if (!t) throw new Error(`unknown projectile type ${typeKey}`);
  // aimY and attack were read by Projectile.reset() but never present in the
  // config, so they were pinned at 0 and never reachable from the UI. They are
  // part of the default set so that aiming is adjustable like any other
  // parameter: aimY moves the impact point up or down the plate, attack turns
  // the velocity vector, and yaw turns the body independently of it (the
  // difference between the two is the angle of attack at impact).
  return Object.assign({ type: typeKey }, structuredClone(t.defaults), {
    yaw: 0, spin: 0, standoff: 1.8, attack: 0, aimY: 0,
  }, overrides);
}

/**
 * Build the meshable description of a projectile.
 * Returns parts with polygons in the projectile's local frame plus the
 * out-of-plane slab depth and per-part density/stiffness scale factors.
 */
export function buildProjectile(cfg) {
  const t = PROJECTILE_TYPES[cfg.type];
  const g = t.build(cfg);
  const slab = (Math.PI / 4) * g.penDiameter;
  for (const p of g.parts) {
    const d = p.diameter || g.refDiameter;
    p.scale = ((Math.PI / 4) * d) / slab * (p.thinFactor ?? 1) * (p.hollow ? p.hollow : 1);
  }
  g.slab = slab;
  g.type = t;
  return g;
}
