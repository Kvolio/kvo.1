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
 * INITIATION - Held's v^2 * d
 * ---------------------------
 * The charge functions when v^2 * d exceeds a material constant, with v the
 * speed the insult drives into the filler and d the width of filler it drives.
 * Initiation needs BOTH intensity and extent: a rifle bullet drives a narrow
 * plug very fast and must not set off an insensitive composition, while a
 * full-calibre AP shot drives a much wider region more slowly and must. This
 * is the criterion the ERA literature uses, and it is the only one tried here
 * that orders the threats correctly. Measured on this model, in (km/s)^2 mm:
 *
 *     slow 20 mm strike    1      12.7 mm AP    94      14.5 mm AP   138
 *     30 mm AP           245      APDS         292      APFSDS       375
 *     full-calibre APCBC 411      shaped-charge jet   5158
 *
 * The threshold of 200 sits in the gap, giving small-arms immunity while
 * functioning against autocannon and everything above it.
 *
 * TWO CRITERIA THAT DID NOT WORK, so they are not tried again:
 *   - Walker-Wasley P^2*tau on the solver's nodal stress. Every threat from a
 *     12.7 mm bullet to a jet produced 3.4-4.1 GPa in the charge and the jet
 *     scored LOWEST, because the integral is dominated by how long a soft
 *     filler stays crushed rather than by how hard it was hit. The bulk model
 *     is linear elastic with no equation of state (MODEL.md 7.6), so it cannot
 *     generate the tens of GPa impedance matching demands.
 *   - A critical shock pressure on the filler's Hugoniot fed by particle
 *     velocity. This ordered the threats better but still keyed on intensity
 *     alone, so a full-calibre AP shot - slow and wide - never initiated the
 *     cassette at all. That was the "sometimes it just does not go off".
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

import { ROLE, BOND } from './pd/domain.js';
import { SEV } from '../core/events.js';

/**
 * Filler moving slower than this is not being driven by anything, just riding
 * along with the cassette. Including it would inflate the measured width.
 */
const DRIVEN_FLOOR = 200;   // m/s

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

    // BONDS THAT SPAN THE CHARGE
    // The horizon is around three lattice spacings, and a cassette's charge is
    // thinner than that, so the front and back plates end up bonded directly
    // THROUGH the explosive - measured at 339 such bonds on a light cassette,
    // more than the 237 holding the front plate to itself. Removing the charge
    // does not touch them, so the detonation was trying to throw two plates
    // that were still stitched to each other, and the cassette barely opened.
    // They are gathered here and cut when the column they belong to fires.
    const spanBonds = new Map();
    // Every bond with at least one end in the charge. The charge keeps its
    // mass when it detonates (see stepCassettes) but loses all strength, so
    // these have to be cut - otherwise the products would still be glued to
    // the plates and to each other. There is no per-node bond index on the
    // domain, so they are gathered here in the same single sweep.
    const chargeBonds = new Map();
    for (let b = 0; b < domain.nb; b++) {
      const i = domain.bi[b], j = domain.bj[b];
      const a = domain.layer[i], z = domain.layer[j];
      const mx = 0.5 * (domain.px[i] + domain.px[j]);
      const my = 0.5 * (domain.py[i] + domain.py[j]);
      const key = Math.round((mx * tx + my * ty) / dx);
      if ((a === front && z === back) || (a === back && z === front)) {
        if (!spanBonds.has(key)) spanBonds.set(key, []);
        spanBonds.get(key).push(b);
      }
      if (a === idx || z === idx) {
        if (!chargeBonds.has(key)) chargeBonds.set(key, []);
        chargeBonds.get(key).push(b);
      }
    }

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
      c.span = spanBonds.get(k) || [];
      c.chargeBonds = chargeBonds.get(k) || [];
    }
    if (!cols.size) continue;

    out.push({
      eraId: L.eraId,
      label: L.label || 'ERA',
      chargeLayer: idx, frontLayer: front, backLayer: back,
      normal: L.normal, tangent: L.tangent,
      detVel: mat.detVel || 7000,
      gurney: mat.gurney || 2400,
      heldV2d: mat.heldV2d || 200,
      chargeAreal, frontAreal, backAreal, chargeT: L.thickness,
      columns: [...cols.values()],
      initiated: false, initT: 0, initX: 0, initY: 0,
      firedColumns: 0, vFront: 0, vBack: 0, flyerVelocity: 0, drivenMass: 0, peakHeld: 0,
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

    // ---- initiation: Held v^2 * d on the driven filler --------------------
    // Initiation needs both intensity and extent. A rifle bullet drives a
    // narrow plug of filler very fast and does not initiate an insensitive
    // composition; a full-calibre AP shot drives a much wider region more
    // slowly and does. A pure velocity or pure pressure test cannot express
    // that, and a pressure test measured on this solver's stress could not
    // even order the threats correctly. v^2 * d does both, and it is the
    // criterion the ERA literature actually uses (Held).
    if (!c.initiated) {
      let v = 0, lo = Infinity, hi = -Infinity, cx = 0, cy = 0, m = 0;
      for (const col of c.columns) {
        if (col.fired) continue;
        for (const i of col.charge) {
          if (!d.alive[i]) continue;
          const sp = Math.hypot(d.vx[i], d.vy[i]);
          if (sp < DRIVEN_FLOOR) continue;         // undisturbed filler
          if (sp > v) v = sp;
          const t = d.px[i] * c.tangent[0] + d.py[i] * c.tangent[1];
          if (t < lo) lo = t;
          if (t > hi) hi = t;
          cx += d.px[i]; cy += d.py[i]; m++;
        }
      }
      if (m > 0) {
        const width = Math.max(hi - lo, d.dx);
        const held = (v / 1000) * (v / 1000) * (width * 1000);   // (km/s)^2 mm
        if (held > c.peakHeld) c.peakHeld = held;
        if (held >= c.heldV2d) {
          c.initiated = true;
          c.initT = now; c.initX = cx / m; c.initY = cy / m;
          const V = sandwichFlyerVelocity(c.frontAreal, c.backAreal, c.chargeAreal, c.gurney, efficiency);
          c.vFront = V.front; c.vBack = V.back; c.flyerVelocity = V.mean;
          events.push({
            kind: 'era-initiate', cassette: c,
            text: `${c.label} initiated — ${(width * 1000).toFixed(0)} mm of filler driven at `
              + `${v.toFixed(0)} m/s (v\u00b2d = ${held.toFixed(0)}, threshold ${c.heldV2d}); `
              + `detonation spreading at ${(c.detVel / 1000).toFixed(1)} km/s, `
              + `front plate ${c.vFront.toFixed(0)} m/s, back plate ${c.vBack.toFixed(0)} m/s (Gurney sandwich)`,
          });
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

      // THE CHARGE BECOMES DETONATION PRODUCTS, IT DOES NOT VANISH
      //
      // This used to delete the charge nodes outright. That is a bigger lie
      // than it looks, and it biases directly against the armour: 10 mm of
      // 4S20-type filler is about 16 kg/m^2, against 23.5 kg/m^2 for a 3 mm
      // HHA flyer plate. So annihilating the charge removed very nearly a
      // whole flyer plate's worth of areal mass from the threat's path, for
      // free, at the exact moment the cassette was supposed to start helping.
      // Measured live-versus-inert, that artefact is the same size as the
      // entire effect being measured, and it is worst where the charge is a
      // large fraction of the cassette - which is exactly the light-ERA case.
      //
      // Real products are a dense gas: no strength, but full inertia, and a
      // jet or rod crossing them still has to displace that mass. So the
      // nodes stay, keep their mass, lose all their bonds (gas has no
      // strength), and are given Gurney's linear velocity profile - zero at
      // the charge mid-plane rising to the adjacent plate's velocity at each
      // face. That profile carries no net momentum for a symmetric sandwich,
      // so the plate velocities remain the momentum-balanced Gurney result
      // and nothing is double-counted.
      const [gnx, gny] = c.normal;
      const halfT = Math.max(c.chargeT * 0.5, 1e-9);
      for (const b of col.chargeBonds) {
        if (d.bstate[b] !== BOND.INTACT) continue;
        d.bstate[b] = BOND.BROKEN;
        const bi = d.bi[b], bj = d.bj[b];
        d.nBroken[bi]++; d.nBroken[bj]++;
        d.damage[bi] = d.nBroken[bi] / (d.nBond0[bi] || 1);
        d.damage[bj] = d.nBroken[bj] / (d.nBond0[bj] || 1);
      }
      for (const i of col.charge) {
        if (!d.alive[i]) continue;
        // 8 = free material, so the solver includes it in the contact set and
        // the threat actually has to push through it. 16 = detonation
        // products specifically, so the stats can tell gas apart from spall:
        // without it the whole charge is reported as spalled armour.
        d.flags[i] |= 8 | 16;
        // signed position across the charge: -1 at the front face, +1 at the back
        const off = ((d.px[i] - col.x) * gnx + (d.py[i] - col.y) * gny) / halfT;
        const q = off < -1 ? -1 : off > 1 ? 1 : off;
        const v = q < 0 ? -q * c.vFront : q * c.vBack;
        const sgn = q < 0 ? -1 : 1;
        d.vx[i] += sgn * gnx * v; d.vy[i] += sgn * gny * v;
      }
      // and nothing joins the two plates across it any more
      for (const b of col.span) {
        if (d.bstate[b] !== BOND.INTACT) continue;
        d.bstate[b] = BOND.BROKEN;
        const i = d.bi[b], j = d.bj[b];
        d.nBroken[i]++; d.nBroken[j]++;
        d.damage[i] = d.nBroken[i] / (d.nBond0[i] || 1);
        d.damage[j] = d.nBroken[j] / (d.nBond0[j] || 1);
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
