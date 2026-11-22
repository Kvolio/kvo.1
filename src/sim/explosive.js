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

  // ARMOUR IS A TARGET, NOT A CASING
  // Gurney describes a thin casing flung off a charge. Armour touching the
  // charge was driven the same way - every plate node within 3.2 R pushed
  // radially at the casing velocity, uniformly through its thickness. That
  // launched a 50 mm plate section at ~1300 m/s into the compartment behind it,
  // and because the whole thickness moved together no shock ever crossed the
  // plate to reflect from its back face - which is the entire HESH mechanism,
  // so HESH threw ~0.1 kg of scab. It also counted the plate as casing mass,
  // slowing the shell's own fragments. When `armourFace` is supplied, armour
  // takes no Gurney drive; only its struck-face layer is loaded, with the
  // momentum a contact detonation delivers, and the solver carries the shock.
  // `armourFace(i)` returns the share of the face velocity node i takes: 1
  // at the struck surface falling to 0 at the depth the pulse has reached,
  // i.e. the profile of a decaying pressure pulse just after it has entered.
  // A CYLINDER BURSTS SIDEWAYS
  // Gurney's cylindrical result drives the casing outward from the charge's
  // AXIS, and a shell's fragments do fly out broadside. Driving every node
  // outward from the charge's centre point instead - as this did - sends the
  // whole forward third of a long shell straight ahead, so an HE burst threw
  // its nose into the plate at Gurney speed. With `axis` given, a node beside
  // the charge is driven perpendicular to the axis and only the end caps
  // beyond it are driven forward or back, each from the nearest point of the
  // charge's axial segment.
  let ax = 0, ay = 0, half = 0, hl = 0;
  // (HESH too: its filler squashes into a short, wide disc on the plate, so
  // the axial segment is short and the walls beside it still go sideways,
  // while the heavy base and its fuze go BACK, away from the plate, not into
  // it at Gurney speed.)
  if (o.axis) {
    [ax, ay] = o.axis;
    for (let i = 0; i < d.n; i++) {
      if (!d.alive[i] || d.role[i] !== ROLE.FILLER) continue;
      const qx = d.px[i] - cx, qy = d.py[i] - cy;
      hl = Math.max(hl, Math.abs(qx * ax + qy * ay));
      half = Math.max(half, Math.abs(-qx * ay + qy * ax));
    }
  }
  const segment = hl > 0 && half > 0;
  const Rd = segment ? Math.max(half, d.dx) : R;
  // offset of node i from the nearest point of the charge (centre or segment)
  const offset = (i, out) => {
    let qx = d.px[i] - cx, qy = d.py[i] - cy;
    if (segment) {
      const s = qx * ax + qy * ay;
      const cl = Math.max(-hl, Math.min(hl, s));
      qx -= cl * ax; qy -= cl * ay;
    }
    out[0] = qx; out[1] = qy;
    return Math.hypot(qx, qy);
  };
  const q = [0, 0];

  const face = [], faceW = [];
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i]) continue;
    if (o.armourFace && d.role[i] === ROLE.ARMOUR) {
      const wgt = +o.armourFace(i) || 0;
      if (wgt > 0) { face.push(i); faceW.push(wgt); }
      continue;
    }
    if (d.role[i] === ROLE.FILLER) {
      if (Math.hypot(d.px[i] - cx, d.py[i] - cy) <= R * 3.2 || segment) removed++;
      continue;
    }
    const r = offset(i, q);
    if (r > Rd * 3.2) continue;
    idx.push(i);
    if (r < Rd * 1.6) M += d.mass[i];
  }
  if (chargeMass <= 0) return { drivenMass: 0, v0: 0, removed: 0 };

  // Impulse into the struck face. A planar charge detonated against a wall
  // delivers (8/27) C D (the classical planar-detonation result); HESH squashes
  // into exactly that pancake, a cylindrical HE burst sends roughly half its
  // products into the plate. Spread over the loaded layer, and capped so the
  // plate never receives more than a quarter of the charge's chemical energy.
  let faceMass = 0, faceDv = 0, faceJ = 0;
  if (face.length) {
    // momentum and energy weights of the profile
    let mw = 0, mw2 = 0;
    for (let k = 0; k < face.length; k++) {
      const m = d.mass[face[k]], wgt = faceW[k];
      faceMass += m; mw += m * wgt; mw2 += m * wgt * wgt;
    }
    // `impulse` is the momentum the struck strip takes, already reduced to
    // this slab by the caller; the default is the planar contact result
    const J = o.impulse ?? (o.impulseCoef ?? 8 / 27) * chargeMass * (o.detVel || 7500);
    faceDv = J / mw;                      // velocity at the struck surface
    const eCap = 0.25 * chargeMass * 0.5 * gurneyVel * gurneyVel;
    if (0.5 * mw2 * faceDv * faceDv > eCap) faceDv = Math.sqrt((2 * eCap) / mw2);
    faceJ = faceDv * mw;
    const [nx, ny] = o.faceNormal || [1, 0];
    for (let k = 0; k < face.length; k++) {
      const i = face[k], dv = faceDv * faceW[k];
      d.vx[i] += nx * dv; d.vy[i] += ny * dv;
      d.temp[i] += clamp(0.5 * dv * dv / 3000, 0, 900);
    }
  }

  const mc = M / chargeMass;
  const shapeConst = o.geometry === 'sandwich' ? 1 / 3 : 0.5;
  const v0 = gurneyVel / Math.sqrt(mc + shapeConst);

  for (const i of idx) {
    const r = Math.max(offset(i, q), 1e-6);
    const [dx, dy] = q;
    // near-field attenuation: full drive out to the charge radius, then
    // roughly geometric fall-off
    const att = r <= Rd ? 1 : Math.pow(Rd / r, 1.35);
    const dv = v0 * att;
    d.vx[i] += (dx / r) * dv;
    d.vy[i] += (dy / r) * dv;
    // the shock also heats the driven metal
    d.temp[i] += clamp(0.5 * dv * dv / 3000, 0, 900);
  }
  // gas products: remove the filler from the mechanical problem
  for (let i = 0; i < d.n; i++) {
    if (!d.alive[i] || d.role[i] !== ROLE.FILLER) continue;
    const dx = d.px[i] - cx, dy = d.py[i] - cy;
    if (segment || Math.hypot(dx, dy) <= R * 3.2) { d.alive[i] = 0; d.vx[i] = 0; d.vy[i] = 0; }
  }
  return { drivenMass: M, v0, removed, faceMass, faceDv, faceJ, faceNodes: face.length };
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
  const face = info.faceNodes
    ? `; plate face takes ${info.faceJ.toFixed(0)} N·s, ${info.faceDv.toFixed(0)} m/s at the surface (contact impulse${info.footprint ? ` over ${(info.footprint * 1000).toFixed(0)} mm` : ''})`
    : '';
  const charge = info.chargeMass ? `${(info.chargeMass * 1000).toFixed(0)} g charge; ` : '';
  log.add(t, 'detonation',
    `${kind} detonation — ${charge}${(info.drivenMass * 1000).toFixed(0)} g of casing driven at ${info.v0.toFixed(0)} m/s (Gurney)${face}`,
    SEV.MAJOR, info);
}
