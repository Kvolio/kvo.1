/**
 * EXPLOSIVE REACTIVE ARMOUR
 * =========================
 *
 * An ERA cassette is a sandwich: a steel front plate, a slab of insensitive
 * explosive, a steel back plate. It is meshed as three ordinary bonded layers,
 * so the plates are ordinary deformable armour and the charge is ordinary
 * deformable material until it functions. Nothing here is a special-cased
 * effect layered over the simulation.
 *
 * WHAT THIS MODULE ACTUALLY DOES
 * ------------------------------
 * Two things only:
 *   1. decides, from the simulated stress state, whether and when the charge
 *      initiates;
 *   2. when the detonation front arrives at a slice of charge, removes that
 *      charge (it has become gas) and adds the Gurney velocity to the two
 *      plates either side of it.
 *
 * Everything that makes ERA *work* is then left to the solver. The plates fly
 * apart, run into the jet or the rod, and cut it up through the ordinary
 * contact machinery. The defeat mechanism is not modelled, asserted or
 * tabulated anywhere - it is whatever the collision between a moving plate and
 * a penetrator turns out to produce.
 *
 * INITIATION - critical shock pressure on the explosive's Hugoniot
 * ----------------------------------------------------------------
 * The charge functions when the shock driven into it exceeds a critical
 * pressure. That pressure is evaluated from the linear shock Hugoniot of the
 * filler,
 *
 *     Us = c0 + s * up ,      P = rho0 * Us * up
 *
 * with the particle velocity up taken as half the local material speed the
 * solver reports for the charge (the usual free-surface approximation).
 *
 * WHY NOT THE SOLVER'S OWN STRESS. The obvious implementation - integrate the
 * nodal virial stress, Walker-Wasley style - was tried and measured, and it
 * does not discriminate: every threat from a 12.7 mm AP bullet to a
 * shaped-charge jet produced 3.4-4.1 GPa in the charge, and the jet actually
 * scored LOWEST on the P^2*tau integral because the integral is dominated by
 * how long a soft filler stays crushed rather than by how hard it was hit.
 * The cause is a known limitation of the bulk model (MODEL.md 7.6): the
 * volumetric response is linear elastic with no equation of state, so it
 * cannot generate the tens of GPa that impedance matching says a jet drives
 * into a low-impedance filler. Particle velocity, on the other hand, the
 * solver resolves well and monotonically - measured peak charge speeds run
 * 361 m/s for a slow 20 mm strike, 1150-1700 m/s across heavy machine gun,
 * autocannon and full-calibre AP shot, 2235 m/s for APDS, 3245 m/s for a long
 * rod and 8293 m/s for a jet. Feeding the Hugoniot from that puts the 7 GPa
 * threshold of an insensitive PBX squarely in the gap, so the cassette
 * functions against shaped charges and long rods and stays inert under
 * machine-gun and autocannon fire, which is what an ERA filler is specified to
 * do. The threshold is a material property and is stated with its provenance.
 *
 * PROPAGATION
 * -----------
 * The charge does not go off all at once. Detonation spreads from wherever it
 * initiated at the explosive's detonation velocity, so a cassette struck near
 * one edge throws that end of its plates first. Across a 300 mm cassette at
 * 7000 m/s that is ~43 us of skew, which is the same order as the whole
 * penetration event and therefore visible in the result.
 *
 * FLYER VELOCITY - Gurney sandwich
 * --------------------------------
 *     V = sqrt(2E) * (M/C + 1/3)^(-1/2)
 *
 * with M the mean plate areal density and C that of the charge, then split
 * between the two plates so their momenta balance (see below). This is the
 * plane-wave, fully-confined result and it overestimates a real cassette,
 * where the detonation runs along the sandwich rather than into it and the
 * products escape sideways from a thin unconfined slab. A single efficiency
 * factor covers that gap. It is a calibration constant, not a derivation, it
 * is exposed in the UI next to the out-of-plane confinement factor, and the
 * flyer velocity it produces is logged so it can be checked against the
 * 500-900 m/s that light ERA plates are usually quoted at.
 */

import { ROLE } from './pd/domain.js';
import { SEV } from '../core/events.js';

/**
 * Gurney sandwich flyer velocities for the two plates.
 *
 * The symmetric result sets the scale, using the mean plate areal density:
 *
 *     V = eff * sqrt(2E) * (Mbar/C + 1/3)^(-1/2)
 *
 * Heavy ERA is not symmetric though - a Kontakt-5 style cassette carries a
 * thick front plate against a much thinner back plate - and giving both the
 * same speed would create net momentum out of nothing, pushing the whole
 * cassette bodily downrange. The pair is therefore split so that
 * M1*V1 = M2*V2 exactly, which reduces to V1 = V2 = V when the plates match:
 *
 *     V1 = V * 2*M2/(M1+M2)      V2 = V * 2*M1/(M1+M2)
 *
 * This is an interpolation, not Kennedy's full asymmetric-sandwich solution;
 * what it guarantees is that the cassette's momentum balances and that the
 * heavier plate is the slower one, which is the behaviour that matters here.
 */
export function sandwichFlyerVelocity(frontAreal, backAreal, chargeAreal, gurneyVel, efficiency = 1) {
  if (chargeAreal <= 0) return { front: 0, back: 0, mean: 0 };
  const sum = frontAreal + backAreal;
  if (sum <= 0) return { front: 0, back: 0, mean: 0 };
  const mean = (efficiency * gurneyVel) / Math.sqrt((0.5 * sum) / chargeAreal + 1 / 3);
  return { front: mean * (2 * backAreal) / sum, back: mean * (2 * frontAreal) / sum, mean };
}

/**
 * Build the per-cassette bookkeeping for a freshly meshed domain.
 *
 * The charge is divided into COLUMNS one lattice spacing wide, measured along
 * the plate tangent. A column is the natural unit here: it is the slice of
 * charge that drives the piece of plate directly in front of and behind it, so
 * detonation arrival, charge removal and plate impulse all happen together and
 * no plate node can be driven twice by neighbouring charge nodes.
 */
export function buildCassettes(scene, domain) {
  const layers = scene.activeLayers();
  const out = [];

  for (let idx = 0; idx < layers.length; idx++) {
    const L = layers[idx];
    if (L.eraPart !== 'charge') continue;
    // Only an actual explosive can function. Without this an inert filler
    // picked up the default shock constants and "detonated", which silently
    // destroys the one control worth having: an inert cassette of identical
    // geometry and mass, to show what the explosive is really contributing.
    if (!L.mat.detVel || !L.mat.gurney) continue;
    const front = layers.findIndex((q) => q.eraId === L.eraId && q.eraPart === 'front');
    const back = layers.findIndex((q) => q.eraId === L.eraId && q.eraPart === 'back');
    const mat = L.mat;
    const [tx, ty] = L.tangent;
    const dx = domain.dx;

    // areal densities: rho * normal thickness
    const chargeAreal = mat.rho * L.thickness;
    const frontAreal = front >= 0 ? layers[front].mat.rho * layers[front].thickness : 0;
    const backAreal = back >= 0 ? layers[back].mat.rho * layers[back].thickness : 0;

    const cols = new Map();
    const col = (i) => {
      const s = domain.px[i] * tx + domain.py[i] * ty;
      const key = Math.round(s / dx);
      let c = cols.get(key);
      if (!c) {
        c = { key, s: key * dx, charge: [], plateFront: [], plateBack: [], fired: false, peakP: 0, x: 0, y: 0 };
        cols.set(key, c);
      }
      return c;
    };

    for (let i = 0; i < domain.n; i++) {
      if (domain.role[i] !== ROLE.ARMOUR) continue;
      const li = domain.layer[i];
      if (li === idx) { const c = col(i); c.charge.push(i); c.x += domain.px[i]; c.y += domain.py[i]; }
      else if (li === front) col(i).plateFront.push(i);
      else if (li === back) col(i).plateBack.push(i);
    }
    // a column with no charge in it cannot detonate anything
    for (const [k, c] of cols) {
      if (!c.charge.length) { cols.delete(k); continue; }
      c.x /= c.charge.length; c.y /= c.charge.length;
    }
    if (!cols.size) continue;

    out.push({
      eraId: L.eraId,
      label: L.label || 'ERA',
      chargeLayer: idx, frontLayer: front, backLayer: back,
      normal: L.normal, tangent: L.tangent,
      detVel: mat.detVel || 7000,
      gurney: mat.gurney || 2400,
      rho0: mat.rho,
      shockC0: mat.shockC0 || 2200,
      shockS: mat.shockS || 2.5,
      pCrit: mat.pCrit || 7e9,
      chargeAreal, frontAreal, backAreal,
      columns: [...cols.values()],
      initiated: false, initT: 0, initX: 0, initY: 0,
      firedColumns: 0, vFront: 0, vBack: 0, flyerVelocity: 0, drivenMass: 0,
    });
  }
  return out;
}

/**
 * Advance every cassette by dt. Returns a list of events worth logging.
 *
 * @param {Array} cassettes from buildCassettes
 * @param {PDDomain} d
 * @param {number} now      simulation time
 * @param {number} dt       time since the previous call
 * @param {number} efficiency Gurney efficiency (see header)
 */
export function stepCassettes(cassettes, d, now, dt, efficiency = 0.45) {
  const events = [];
  if (dt <= 0) return events;

  for (const c of cassettes) {
    if (c.firedColumns >= c.columns.length) continue;

    // ---- initiation: critical shock pressure on the Hugoniot --------------
    if (!c.initiated) {
      for (const col of c.columns) {
        if (col.fired) continue;
        let fastest = 0;
        for (const i of col.charge) {
          if (!d.alive[i]) continue;
          const v = Math.hypot(d.vx[i], d.vy[i]);
          if (v > fastest) fastest = v;
        }
        const up = 0.5 * fastest;                       // free-surface approx
        const P = c.rho0 * (c.shockC0 + c.shockS * up) * up;
        if (P > col.peakP) col.peakP = P;
        if (P >= c.pCrit) {
          c.initiated = true;
          c.initT = now; c.initX = col.x; c.initY = col.y;
          const V = sandwichFlyerVelocity(c.frontAreal, c.backAreal, c.chargeAreal, c.gurney, efficiency);
          c.vFront = V.front; c.vBack = V.back; c.flyerVelocity = V.mean;
          events.push({
            kind: 'era-initiate', cassette: c,
            text: `${c.label} initiated — charge shocked to ${(col.peakP / 1e9).toFixed(1)} GPa, `
              + `past its ${(c.pCrit / 1e9).toFixed(0)} GPa threshold; `
              + `detonation spreading at ${(c.detVel / 1000).toFixed(1)} km/s, `
              + `front plate ${c.vFront.toFixed(0)} m/s, back plate ${c.vBack.toFixed(0)} m/s (Gurney sandwich)`,
          });
          break;
        }
      }
      if (!c.initiated) continue;
    }

    // ---- propagation: consume columns as the detonation front reaches them -
    for (const col of c.columns) {
      if (col.fired) continue;
      const r = Math.hypot(col.x - c.initX, col.y - c.initY);
      if (now < c.initT + r / c.detVel) continue;
      col.fired = true;
      c.firedColumns++;

      // the charge in this slice is now gas
      for (const i of col.charge) {
        if (!d.alive[i]) continue;
        d.alive[i] = 0; d.vx[i] = 0; d.vy[i] = 0;
      }
      // and it throws the plate either side of it apart along the sandwich
      // normal - front plate towards the threat, back plate away from it
      const [nx, ny] = c.normal;
      for (const i of col.plateFront) {
        if (!d.alive[i]) continue;
        d.vx[i] -= nx * c.vFront; d.vy[i] -= ny * c.vFront;
        c.drivenMass += d.mass[i];
      }
      for (const i of col.plateBack) {
        if (!d.alive[i]) continue;
        d.vx[i] += nx * c.vBack; d.vy[i] += ny * c.vBack;
        c.drivenMass += d.mass[i];
      }
    }

    if (c.firedColumns >= c.columns.length && !c.completeLogged) {
      c.completeLogged = true;
      events.push({
        kind: 'era-complete', cassette: c,
        text: `${c.label} fully functioned — ${(c.drivenMass * 1000).toFixed(0)} g of plate driven `
          + `at ${c.vFront.toFixed(0)} / ${c.vBack.toFixed(0)} m/s`,
      });
    }
  }
  return events;
}

/** Push cassette events into the run log. */
export function logCassetteEvents(log, t, events) {
  for (const e of events) {
    log.add(t, e.kind, e.text, e.kind === 'era-initiate' ? SEV.WARN : SEV.NOTE);
  }
}
