/**
 * MATERIAL DATABASE
 * =================
 *
 * Every entry is a *macroscopic continuum* description. The peridynamic
 * solver derives its bond-level constants from these numbers at mesh time
 * (see materials/derive.js), so editing a property here — or in the UI —
 * changes the simulated response, not a label.
 *
 * Property meanings (SI):
 *   rho     density                              kg/m^3
 *   E       Young's modulus                      Pa
 *   nu      Poisson's ratio (reference value)    -    (see NOTE below)
 *   Y       quasi-static yield strength          Pa
 *   UTS     ultimate tensile strength            Pa
 *   epsF    true failure strain (tensile)        -
 *   G0      mode-I fracture energy  = K_IC^2/E   J/m^2
 *   BHN     Brinell hardness                     -    (reported, drives the
 *                                                      empirical cross-checks)
 *   jcC     Johnson-Cook strain-rate coefficient -    sigma_y *= 1 + C ln(edot/edot0)
 *   Tm      melting temperature                  K
 *   cp      specific heat                        J/(kg K)
 *   jcM     Johnson-Cook thermal softening exp   -
 *   brittle 0 = fully ductile, 1 = fully brittle -    (blends the two failure
 *                                                      criteria, see MODEL.md)
 *   weibull Weibull modulus of local strength    -    (flaw-density scatter;
 *                                                      low = ceramics)
 *   compFail true if bonds may also fail in compression/shear
 *
 * NOTE ON POISSON'S RATIO
 * -----------------------
 * Bond-based peridynamics is restricted to nu = 1/3 in 2-D (nu = 1/4 in 3-D).
 * The `nu` stored here is the real material value: it is used by the
 * *analytic* cross-check models (Tate, cavity expansion) and reported in the
 * UI, but the PD bond constants are calibrated at the bond-based value. This
 * is the single largest documented approximation in the deformation model.
 * See docs/MODEL.md §3.2.
 *
 * ORGANISATION
 * ------------
 * The records live in data/*.js, one file per family (steels, light metals,
 * dense and non-ferrous metals, ceramics/glass/concrete, composites, polymers,
 * fillers). Each carries `group` (its family heading), `uses` (what it can be
 * in the simulator), `grade` and `refs`; see schema.js. The pick-lists in the UI
 * are generated from those fields, so adding a material is one record in one
 * data file and nothing else.
 *
 * SOURCES AND GRADES
 * ------------------
 * Each entry's `refs` says what its numbers rest on and `grade` says how
 * firmly: A = manufacturer datasheet or published standard, B = handbook
 * typical value for the named alloy or ceramic, C = class-representative
 * figure for a family with a wide spread. None of it is certified lot data and
 * none of it has been validated against a specific firing trial; the model's
 * response to it is checked against published efficiency bands by
 * tools/validate-materials.mjs. For ceramics `Y` is the effective confined
 * compressive flow stress the solver uses (a model parameter set from the
 * datasheet compressive strength and hardness, see MODEL.md), not a tensile
 * yield.
 */

import { mat, GROUPS, GROUP_ORDER, GROUP_LABEL, GRADE_TEXT } from './schema.js';
import { STEELS } from './data/steels.js';
import { LIGHTMETALS } from './data/lightmetals.js';
import { HEAVYMETALS } from './data/heavymetals.js';
import { CERAMICS } from './data/ceramics.js';
import { COMPOSITES } from './data/composites.js';
import { POLYMERS } from './data/polymers.js';
import { EXPLOSIVES } from './data/explosives.js';
import { ALIASES } from './data/aliases.js';

export { GROUPS, GROUP_LABEL, GRADE_TEXT };

/** @typedef {ReturnType<typeof mat>} Material */

/**
 * The library, one record per material, in family order. The records live in
 * data/*.js, one file per family of materials; this module assembles them and
 * provides the lookups. Keys that used to be separate entries and are now the
 * same material (data/aliases.js) still resolve, but are not listed.
 */
export const MATERIALS = {};
for (const list of [STEELS, LIGHTMETALS, HEAVYMETALS, CERAMICS, COMPOSITES, POLYMERS, EXPLOSIVES]) {
  for (const m of list) {
    if (MATERIALS[m.key]) throw new Error(`duplicate material key '${m.key}'`);
    MATERIALS[m.key] = m;
  }
}
for (const [alias, target] of Object.entries(ALIASES)) {
  if (!MATERIALS[target]) throw new Error(`alias '${alias}' points at missing '${target}'`);
  Object.defineProperty(MATERIALS, alias, { value: MATERIALS[target], enumerable: false });
}

/** Keys of every material that can play `use`, in family order. */
export function keysFor(use) {
  return Object.keys(MATERIALS)
    .filter((k) => MATERIALS[k].uses && MATERIALS[k].uses.includes(use) && !MATERIALS[k].custom)
    .sort((a, b) => (GROUP_ORDER_OF(a) - GROUP_ORDER_OF(b)));
}
function GROUP_ORDER_OF(k) { return GROUP_ORDER[MATERIALS[k].group] ?? 99; }

/** Materials that make sense as an armour layer choice in the UI. */
export const ARMOUR_KEYS = keysFor('armour');

/** Materials that make sense as a penetrator body/core in the UI. */
export const PENETRATOR_KEYS = keysFor('penetrator');

/** Heading under which a material is listed (its family). */
export function materialGroup(key) {
  const m = MATERIALS[key];
  return m ? (m.custom ? 'Custom / edited' : GROUP_LABEL[m.group] || 'Other') : 'Other';
}

/** The data grade of a material as a short phrase, for the UI. */
export function gradeText(m) {
  return m.grade && GRADE_TEXT[m.grade] ? `${m.grade} — ${GRADE_TEXT[m.grade]}` : 'custom';
}

/**
 * A one-line quantitative descriptor: what the material is, how hard, how
 * tough, how it fails.
 *
 * It is GENERATED from the same constants the solver integrates, never written
 * by hand, so it cannot drift away from the simulated behaviour. Fracture
 * toughness is recovered from the stored fracture energy, K_IC = sqrt(G0 * E),
 * which is the inverse of how G0 was derived in the first place - so the value
 * shown here reproduces the K_IC quoted in each entry's `source`.
 *
 * The word bands exist because a number alone does not tell a reader whether
 * 63 MPa*m^0.5 is a lot. They are conventional engineering descriptions, not
 * thresholds with any physical meaning of their own.
 */
export function describeMaterial(m) {
  const kic = Math.sqrt(Math.max(m.G0, 0) * m.E) / 1e6;      // MPa*m^0.5
  const band = (v, cuts, words) => {
    for (let i = 0; i < cuts.length; i++) if (v < cuts[i]) return words[i];
    return words[words.length - 1];
  };
  const hard = band(m.BHN, [120, 300, 450, 600, 1200],
    ['very soft', 'soft', 'medium hardness', 'hard', 'very hard', 'ceramic-hard']);
  const tough = band(kic, [3, 12, 30, 60, 110],
    ['negligible toughness', 'very low toughness', 'low toughness',
      'moderate toughness', 'high toughness', 'very high toughness']);
  const fail = band(m.brittle, [0.15, 0.40, 0.70, 0.95],
    ['fails ductile', 'mostly ductile', 'mixed ductile/brittle',
      'mostly brittle', 'fails brittle']);
  const cls = { metal: 'Metal', ceramic: 'Ceramic', composite: 'Composite',
    polymer: 'Polymer', explosive: 'Explosive' }[m.class] || m.class;
  const kicTxt = kic >= 10 ? kic.toFixed(0) : kic.toFixed(1);
  return `${cls} · ${m.rho} kg/m³ · ${m.BHN} BHN (${hard}) · `
    + `K\u1D35\u1D9C ${kicTxt} MPa·m^½ (${tough}) · ${fail}`;
}

export function getMaterial(key) {
  const m = MATERIALS[key];
  if (!m) throw new Error(`unknown material '${key}'`);
  return m;
}

/** Clone a material so the user can edit it without touching the database. */
export function cloneMaterial(key, newKey, overrides = {}) {
  const base = getMaterial(key);
  const m = Object.assign({}, base, { key: newKey, name: overrides.name || `${base.name} (custom)`, custom: true }, overrides);
  MATERIALS[newKey] = m;
  return m;
}

export function registerMaterial(def) {
  const m = mat(def);
  MATERIALS[m.key] = m;
  return m;
}

/**
 * Sample a graded material at a through-thickness fraction (0 = struck face).
 * Returns a shallow-copied material with the gradient applied. Used for
 * face-hardened plate, where the response genuinely varies with depth.
 */
export function sampleGradient(m, f) {
  if (!m.gradient) return m;
  const out = Object.assign({}, m);
  for (const prop of Object.keys(m.gradient)) {
    const pts = m.gradient[prop];
    let v = pts[pts.length - 1][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const [f0, v0] = pts[i], [f1, v1] = pts[i + 1];
      if (f >= f0 && f <= f1) { v = v0 + (v1 - v0) * ((f - f0) / (f1 - f0 || 1)); break; }
      if (f < f0) { v = v0; break; }
    }
    out[prop] = m[prop] * v;
  }
  return out;
}
