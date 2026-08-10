/**
 * EXPLOSIVE ENERGY RELEASE
 * ========================
 *
 * Detonation is modelled as an *impulsive velocity field* applied to the metal
 * surrounding the charge, with the filler particles removed (they have become
 * gas). Fragmentation is not scripted: the imposed expansion velocity field
 * stretches the casing bonds past their failure strain and the casing breaks
 * up on its own, with the fragment size distribution set by the material's
 * failure strain and the local strength scatter. That is the same mechanism
 * Mott's fragmentation theory describes, arrived at by simulation rather than
 * by a fitted distribution.
 *
 * Fragment/flyer velocity comes from the Gurney energy model (Gurney, BRL-405,
 * 1943), which is the standard first-order result for metal accelerated by a
 * confined charge:
 *
 *   cylindrical casing   V = sqrt(2E) * (M/C + 1/2)^(-1/2)
 *   symmetric sandwich   V = sqrt(2E) * (M/C + 1/3)^(-1/2)
 *   open-faced sandwich  V = sqrt(2E) * [ (1+2M/C)^3 + 1 ) / (6(1+M/C)) + M/C ]^(-1/2)
 *
 * with sqrt(2E) the explosive's Gurney velocity (a tabulated property in the
 * material database). Near-field attenuation with distance is applied so that
 * material further from the charge than about a charge radius is driven less.
 *
 * SHAPED CHARGE
 * -------------
 * Liner collapse itself is not simulated. Instead the collapsed liner is
 * created as a compact copper slug carrying the axial velocity gradient the
 * PER (Pugh-Eichelberger-Rostoker, 1952) collapse model predicts. The
 * peridynamic solver then stretches that slug into a jet, and jet break-up,
 * standoff sensitivity and spaced-armour defeat emerge from the simulation
 * rather than being asserted.
 */

import { ROLE } from './pd/domain.js';
import { SEV } from '../core/events.js';
import { clamp } from '../core/math.js';

/**
 * Apply a detonation inside a peridynamic domain.
 *
 * @param {PDDomain} d
 * @param {object} o {cx, cy, chargeMass, gurneyVel, radius, geometry}
 * @returns {{drivenMass:number, v0:number, removed:number}}
 */
export function detonate(d, o) {
  const { cx, cy, chargeMass, gurneyVel } = o;
  const R = o.radius;
  let M = 0, removed = 0;
  const idx = [];

  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i]) continue;
    const dx = d.px[i] - cx, dy = d.py[i] - cy;
    const r = Math.hypot(dx, dy);
    if (r > R * 3.2) continue;
    if (d.role[i] === ROLE.FILLER) { removed++; continue; }
    idx.push(i);
    if (r < R * 1.6) M += d.mass[i];
  }
  if (chargeMass <= 0) return { drivenMass: 0, v0: 0, removed: 0 };

  const mc = M / chargeMass;
  const shapeConst = o.geometry === 'sandwich' ? 1 / 3 : 0.5;
  const v0 = gurneyVel / Math.sqrt(mc + shapeConst);

  for (const i of idx) {
    const dx = d.px[i] - cx, dy = d.py[i] - cy;
    const r = Math.max(Math.hypot(dx, dy), 1e-6);
    // near-field attenuation: full drive out to the charge radius, then
    // roughly geometric fall-off
    const att = r <= R ? 1 : Math.pow(R / r, 1.35);
    const dv = v0 * att * (d.pscale[i] > 0 ? 1 : 1);
    d.vx[i] += (dx / r) * dv;
    d.vy[i] += (dy / r) * dv;
    // the shock also heats the driven metal
    d.temp[i] += clamp(0.5 * dv * dv / 3000, 0, 900);
  }
  // gas products: remove the filler from the mechanical problem
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i] || d.role[i] !== ROLE.FILLER) continue;
    const dx = d.px[i] - cx, dy = d.py[i] - cy;
    if (Math.hypot(dx, dy) <= R * 3.2) { d.alive[i] = 0; d.vx[i] = 0; d.vy[i] = 0; }
  }
  return { drivenMass: M, v0, removed };
}

/**
 * Velocity distribution of a shaped-charge jet from the PER collapse model,
 * simplified to a linear gradient between tip and tail velocity along the
 * collapsed slug. Returns a function slugLocal -> speed.
 */
export function jetVelocityProfile(tipV, tailV, slugLength) {
  return (s) => {
    const f = clamp(s / Math.max(slugLength, 1e-6), 0, 1);
    return tailV + (tipV - tailV) * f;
  };
}

/**
 * Peak specific impulse delivered to a plate in contact with a squashed
 * charge (HESH). Treated as an open-faced sandwich: the plate is the flyer.
 */
export function contactImpulse(chargeMassPerArea, plateMassPerArea, gurneyVel) {
  const mc = plateMassPerArea / Math.max(chargeMassPerArea, 1e-9);
  const v = gurneyVel / Math.sqrt(Math.pow(1 + 2 * mc, 3) / (6 * (1 + mc)) + mc);
  return { flyerVelocity: v, impulse: v * plateMassPerArea };
}

export function logDetonation(log, t, kind, info) {
  log.add(t, 'detonation',
    `${kind} detonation — ${(info.drivenMass * 1000).toFixed(0)} g driven at ${info.v0.toFixed(0)} m/s (Gurney)`,
    SEV.MAJOR, info);
}
