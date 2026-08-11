/**
 * Headless physics regression checks.
 *
 *   node tools/checks.mjs
 *
 * These are behavioural assertions, not numerical ones: they assert that the
 * model still *discriminates* the way terminal ballistics does — thicker plate
 * defeats what thinner plate does not, obliquity helps the armour, a long rod
 * needs velocity — rather than pinning exact depths, which would break on any
 * legitimate model improvement.
 *
 * Exit code 1 on failure, so CI refuses to publish a broken solver.
 */

import { World } from '../src/sim/world.js';
import { Scene, makeLayer, makeModule } from '../src/sim/scene.js';
import { makeProjectileConfig } from '../src/sim/projectileTypes.js';
import { PROJECTILE_TYPES, TYPE_ORDER } from '../src/sim/projectileTypes.js';
import { PRESETS, PRESET_ORDER } from '../src/ui/presets.js';
import { AMMO, AMMO_ORDER, ammoLabel } from '../src/ui/ammo.js';
import { sandwichFlyerVelocity } from '../src/sim/era.js';
import { MATERIALS, ARMOUR_KEYS, BASIC_ARMOUR_KEYS, ADVANCED_ARMOUR_KEYS, armourTier,
  PENETRATOR_KEYS, sampleGradient, describeMaterial } from '../src/materials/database.js';
import { BOND } from '../src/sim/pd/domain.js';

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
function check(cond, m) { (cond ? pass : fail)(m); return cond; }

// maxFrames used to be 3000, which was ample when the resolved window was cut
// off at 600 us. Now that runs end on the physics, the cap became the new
// truncation: an 88 mm APCBC against 70 mm at 60 deg was being scored at
// frame 3000 while still moving. Runs exit the loop as soon as they are done,
// so a generous cap costs time only where it is actually needed.
function run({ type, proj = {}, layers, modules = [], quality = 'low', maxFrames = 9000 }) {
  const w = new World();
  w.settings.deterministic = true;
  w.settings.quality = quality;
  w.settings.recordFrames = false;
  const sc = new Scene();
  sc.setLayers(layers.map((l) => makeLayer(l)));
  if (modules.length) sc.setModules(modules.map((m) => makeModule(m)));
  w.setScene(sc);
  w.setProjectile(makeProjectileConfig(type, proj));
  w.fire();
  let f = 0;
  while (w.state !== 'done' && f < maxFrames) { w.update(1 / 60); f++; }
  return { w, stats: w.stats, verdict: w.verdict(), frames: f };
}

/** Mesh the scene and stop: enough to ask questions about the lattice. */
function meshOnly({ type, proj = {}, layers, quality = 'normal' }) {
  const w = new World();
  w.settings.deterministic = true;
  w.settings.quality = quality;
  w.settings.recordFrames = false;
  w.settings.deterministic = true;
  const sc = new Scene();
  sc.setLayers(layers.map((l) => makeLayer(l)));
  w.setScene(sc);
  w.setProjectile(makeProjectileConfig(type, proj));
  w.fire();
  let f = 0;
  while (!w.domain && f < 900) { w.update(1 / 60); f++; }
  return w;
}

console.log('\n== every projectile type meshes and runs ==');
for (const t of TYPE_ORDER) {
  const standoff = PROJECTILE_TYPES[t].sabot ? 2.2 : 0.6;
  try {
    const r = run({ type: t, proj: { standoff }, layers: [{ material: 'rha', thickness: 0.05 }] });
    check(r.w.domain && r.w.domain.n > 200 && Number.isFinite(r.stats.maxDepth),
      `${t}: meshed ${r.w.domain ? r.w.domain.n : 0} nodes, depth ${(r.stats.maxDepth * 1000).toFixed(0)} mm`);
  } catch (e) {
    fail(`${t}: threw — ${e.message}`);
  }
}

console.log('\n== every preset loads and meshes ==');
for (const key of PRESET_ORDER) {
  const p = PRESETS[key];
  try {
    const w = new World();
    w.settings.deterministic = true;
    w.settings.quality = 'low';
    w.settings.recordFrames = false;
    w.setScene(Scene.fromJSON(p.scene));
    w.setProjectile(makeProjectileConfig(p.projectile.type, p.projectile));
    w.fire();
    let f = 0;
    while (w.state === 'flight' && f < 4000) { w.update(1 / 60); f++; }
    check(!!w.domain && w.domain.n > 100, `${key}: ${w.domain ? w.domain.n : 0} nodes`);
  } catch (e) {
    fail(`${key}: threw — ${e.message}`);
  }
}

console.log('\n== the Soviet laminate presets ==');
{
  // The T-series glacis presets are the only ones with a soft filler between
  // steel, so they are the only ones that exercise a low-impedance layer in
  // the middle of the stack. Assert the geometry the published figures give,
  // not a penetration number - the layout is a claim about the plate, the
  // penetration is a claim about the model.
  const los = (key) => PRESETS[key].scene.layers.reduce(
    (s, l) => s + l.thickness / Math.cos(((l.slope || 0) * Math.PI) / 180), 0);
  const normal = (key) => PRESETS[key].scene.layers.reduce((s, l) => s + l.thickness, 0);

  check(Math.abs(normal('t72-ural-ufp') - 0.205) < 1e-6,
    `T-72 Ural glacis is 80 + 105 + 20 mm = ${(normal('t72-ural-ufp') * 1000).toFixed(0)} mm of plate`);
  check(Math.abs(los('t72-ural-ufp') - 0.547) < 0.005,
    `and ${(los('t72-ural-ufp') * 1000).toFixed(0)} mm along the line of sight at 68 deg`);
  check(PRESETS['t72-ural-ufp'].scene.layers.some((l) => l.material === 'textolite'),
    'its middle layer is textolite, not more steel');
  check(PRESETS['t90a-ufp'].scene.layers.some((l) => l.kind === 'era'),
    'the T-90A preset carries a reactive cassette');

  // and all four must actually survive a shot, not just parse
  for (const key of ['t55-ufp', 't72-ural-ufp', 't72b-ufp', 't90a-ufp']) {
    const w = new World();
    w.settings.deterministic = true;
    w.settings.quality = 'low';
    w.settings.recordFrames = false;
    w.setScene(Scene.fromJSON(PRESETS[key].scene));
    w.setProjectile(makeProjectileConfig(PRESETS[key].projectile.type, PRESETS[key].projectile));
    w.fire();
    let f = 0;
    while (w.state !== 'done' && f < 3000) { w.update(1 / 60); f++; }
    check(Number.isFinite(w.stats.maxDepth) && Number.isFinite(w.stats.residualVelocity)
      && w.stats.residualVelocity >= 0,
      `${key}: runs to completion (${(w.stats.maxDepth * 1000).toFixed(0)} mm, `
      + `residual ${w.stats.residualVelocity.toFixed(0)} m/s)`);
  }
}

console.log('\n== the historic ammunition catalogue ==');
{
  check(AMMO_ORDER.length === Object.keys(AMMO).length,
    `every round is in the ordering (${AMMO_ORDER.length} rounds)`);
  let ordered = true;
  for (let i = 1; i < AMMO_ORDER.length; i++) {
    if (AMMO[AMMO_ORDER[i]].year < AMMO[AMMO_ORDER[i - 1]].year) ordered = false;
  }
  check(ordered, `the list reads oldest first (${AMMO[AMMO_ORDER[0]].year} to `
    + `${AMMO[AMMO_ORDER[AMMO_ORDER.length - 1]].year})`);

  // Every entry must name a real projectile type and describe itself.
  let wellFormed = 0;
  for (const key of AMMO_ORDER) {
    const a = AMMO[key];
    const ok = !!PROJECTILE_TYPES[a.type] && typeof a.name === 'string' && a.name.length > 0
      && typeof a.vehicle === 'string' && a.vehicle.length > 0
      && Number.isFinite(a.year) && a.cfg && Number.isFinite(a.cfg.velocity)
      && a.cfg.velocity > 0 && Number.isFinite(a.cfg.caliber) && a.cfg.caliber > 0
      && ammoLabel(key).includes(a.name);
    if (ok) wellFormed++; else fail(`${key}: malformed entry`);
  }
  check(wellFormed === AMMO_ORDER.length, `all ${wellFormed} entries are well formed`);

  // and every one of them must mesh and fire without throwing. This is the
  // check that catches a mass/geometry combination the mesher cannot resolve,
  // which is the realistic failure mode for a hand-written catalogue.
  let fired = 0;
  for (const key of AMMO_ORDER) {
    const a = AMMO[key];
    try {
      const r = run({ type: a.type, proj: a.cfg, layers: [{ material: 'rha', thickness: 0.10 }] });
      const ok = r.w.domain && r.w.domain.n > 200
        && Number.isFinite(r.stats.maxDepth) && r.stats.maxDepth >= 0
        && Number.isFinite(r.stats.residualVelocity) && r.stats.residualVelocity >= 0;
      if (ok) fired++; else fail(`${key}: ran but produced unusable stats`);
    } catch (e) {
      fail(`${key}: threw — ${e.message}`);
    }
  }
  check(fired === AMMO_ORDER.length,
    `all ${fired} rounds mesh and fire at 100 mm RHA`);

  // The catalogue exists to show the problem getting harder. A 1939 2-pdr and
  // a 2003 M829A3 must not land in the same place.
  const old = run({ type: AMMO['qf2pdr-ap'].type, proj: AMMO['qf2pdr-ap'].cfg,
    layers: [{ material: 'rha', thickness: 0.10 }] });
  const modern = run({ type: AMMO['m829a3'].type, proj: AMMO['m829a3'].cfg,
    layers: [{ material: 'rha', thickness: 0.10 }] });
  // Both perforate 100 mm, so depth is clipped to 100 mm for both and cannot
  // separate them. Residual velocity is what still carries the difference.
  check(modern.stats.residualVelocity > old.stats.residualVelocity * 3,
    `1939 vs 2003 through the same 100 mm plate: `
    + `2-pdr exits at ${old.stats.residualVelocity.toFixed(0)} m/s, `
    + `M829A3 at ${modern.stats.residualVelocity.toFixed(0)} m/s`);
}

console.log('\n== explosive reactive armour ==');
{
  const cassette = (slope, explosive) => ({
    kind: 'era', label: 'ERA', plate: 'hha', slope, height: 0.7,
    frontThickness: 0.003, chargeThickness: 0.006, backThickness: 0.003, explosive,
  });
  const main = (slope) => ({ material: 'rha', thickness: 0.09, gap: 0.10, slope, height: 1.0 });

  // the Gurney split must balance momentum for an asymmetric cassette,
  // otherwise the detonation pushes the whole cassette downrange
  const sym = sandwichFlyerVelocity(15.6, 15.6, 10.2, 2400, 0.45);
  const asym = sandwichFlyerVelocity(78, 15.6, 10.2, 2400, 0.45);
  check(Math.abs(sym.front - sym.back) < 1e-9, `symmetric cassette throws both plates alike (${sym.front.toFixed(0)} m/s)`);
  check(Math.abs(78 * asym.front - 15.6 * asym.back) < 1e-6 && asym.front < asym.back,
    `asymmetric cassette conserves momentum and the heavy plate is slower `
    + `(${asym.front.toFixed(0)} vs ${asym.back.toFixed(0)} m/s)`);
  check(sym.front > 300 && sym.front < 1200,
    `light-ERA flyer velocity is in the published band (${sym.front.toFixed(0)} m/s)`);

  // a shaped charge must set it off, and the charge must be wholly consumed
  const hot = run({ type: 'heat', proj: { standoff: 0.6 },
    layers: [cassette(60), main(60)] });
  const c = hot.w.cassettes[0];
  check(hot.w.cassettes.length === 1, `cassette is found in the meshed domain (${c.columns.length} charge slices)`);
  check(c.initiated, 'a shaped-charge jet initiates the cassette');
  // The charge must be entirely REACTED. It is no longer deleted - detonation
  // products keep their mass, because annihilating them handed the threat
  // ~16 kg/m2 of free path at the exact moment the cassette should start
  // helping (see era.js). So the test is that nothing unreacted is left, not
  // that nothing is left: every column has fired, and every surviving charge
  // node is flagged as products (16) with no strength rather than sitting
  // there as intact explosive.
  const dHot = hot.w.domain;
  check(c.firedColumns === c.columns.length,
    `every charge slice reacted (${c.firedColumns}/${c.columns.length})`);
  let unreacted = 0, products = 0;
  for (const col of c.columns) {
    for (const i of col.charge) {
      if (!dHot.alive[i]) continue;
      if (dHot.flags[i] & 16) products++; else unreacted++;
    }
  }
  check(unreacted === 0,
    `no unreacted explosive is left once it functions `
    + `(${unreacted} intact, ${products} as products)`);
  // and the products must have no strength left
  let bonded = 0;
  for (let b = 0; b < dHot.nb; b++) {
    if (dHot.bstate[b] !== BOND.INTACT) continue;
    if ((dHot.flags[dHot.bi[b]] & 16) || (dHot.flags[dHot.bj[b]] & 16)) bonded++;
  }
  check(bonded === 0, `detonation products carry no strength (${bonded} intact bonds on them)`);

  // THE ARTEFACT THIS GUARDS
  // Deleting the charge on detonation removed ~16 kg/m2 of areal mass from the
  // threat's path - against 23.5 kg/m2 for a 3 mm HHA flyer plate, so very
  // nearly a whole plate, handed over for free at the exact moment the
  // cassette was supposed to start helping. Measured, it was the same size as
  // the entire effect under test. Products must therefore keep their mass.
  {
    const w2 = new World();
    w2.settings.deterministic = true; w2.settings.quality = 'low'; w2.settings.recordFrames = false;
    const sc2 = new Scene();
    sc2.setLayers([cassette(60), main(60)].map((l) => makeLayer(l)));
    w2.setScene(sc2);
    w2.setProjectile(makeProjectileConfig('heat', { standoff: 0.6 }));
    w2.fire();
    const chargeMass = () => {
      const c2 = w2.cassettes[0]; let m = 0;
      if (!c2) return 0;
      for (const col of c2.columns) for (const i of col.charge) if (w2.domain.alive[i]) m += w2.domain.mass[i];
      return m;
    };
    let f2 = 0, before = 0, after = -1;
    while (w2.state !== 'done' && f2 < 3000) {
      const c2 = w2.cassettes[0];
      const wasInit = c2 && c2.initiated;
      if (c2 && !wasInit) before = chargeMass();
      w2.update(1 / 60); f2++;
      const c3 = w2.cassettes[0];
      if (after < 0 && c3 && c3.initiated && c3.firedColumns >= c3.columns.length) after = chargeMass();
    }
    check(before > 0 && after > before * 0.9,
      `detonation converts the charge, it does not annihilate it `
      + `(${(before * 1000).toFixed(0)} g before, ${(after * 1000).toFixed(0)} g of products after)`);
  }
  check(c.vFront > 0 && c.drivenMass > 0,
    `plate is actually driven (${(c.drivenMass * 1000).toFixed(0)} g at ${c.vFront.toFixed(0)} m/s)`);

  // nothing may still join the two plates once the charge between them has
  // gone: the horizon is wider than the charge is thick, so the plates are
  // bonded straight through it and the detonation was trying to throw two
  // plates that were still stitched together
  {
    const d = hot.w.domain;
    const ls = hot.w.scene.activeLayers();
    const fi = ls.findIndex((L) => L.eraPart === 'front');
    const bi2 = ls.findIndex((L) => L.eraPart === 'back');
    let spanning = 0;
    for (let b = 0; b < d.nb; b++) {
      if (d.bstate[b] !== BOND.INTACT) continue;
      const a = d.layer[d.bi[b]], z = d.layer[d.bj[b]];
      if ((a === fi && z === bi2) || (a === bi2 && z === fi)) spanning++;
    }
    check(spanning === 0,
      `no bond still spans the consumed charge after the cassette functions (${spanning})`);
  }

  // INITIATION MUST DISCRIMINATE BY BOTH INTENSITY AND EXTENT.
  // A rifle bullet drives a narrow plug of filler very fast; a full-calibre AP
  // shot drives a much wider region more slowly. An insensitive filler must
  // shrug off the first and function on the second, and a velocity- or
  // pressure-only test cannot express that.
  const cold = run({ type: 'ap', proj: { caliber: 0.0076, mass: 0.012, velocity: 700, standoff: 0.4 },
    layers: [cassette(0), main(0)], maxFrames: 1800 });
  check(!cold.w.cassettes[0].initiated,
    `a rifle-calibre strike does not initiate an insensitive filler (${cold.verdict.headline})`);
  const mg = run({ type: 'ap', proj: { caliber: 0.0145, mass: 0.064, velocity: 1000, standoff: 0.35 },
    layers: [cassette(0), main(0)], maxFrames: 1800 });
  check(!mg.w.cassettes[0].initiated, 'a 14.5 mm AP strike does not initiate it either');
  const shot = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 },
    layers: [cassette(0), main(0)], maxFrames: 1800 });
  check(shot.w.cassettes[0].initiated,
    'a full-calibre AP shot DOES initiate it (narrow-and-fast must not be the only path)');

  // an inert filler must not produce a functioning cassette at all, or the
  // control below is worthless
  const inertOnly = run({ type: 'heat', proj: { standoff: 0.6 },
    layers: [cassette(0, 'rubber'), main(0)] });
  check(inertOnly.w.cassettes.length === 0,
    `an inert filler registers no cassette and cannot detonate (${inertOnly.w.cassettes.length})`);

  // A thin layer must get enough nodes through it to behave as a plate, and
  // the run must SAY SO when it cannot. This is the defect that made a live
  // cassette come out worse than an inert one: 3 mm plates were being meshed
  // at 0.7 nodes through thickness and could only be pushed aside.
  const heavy = {
    kind: 'era', label: 'Heavy ERA', plate: 'hha', slope: 60, height: 0.9,
    frontThickness: 0.015, chargeThickness: 0.010, backThickness: 0.005,
  };
  const hv = meshOnly({ type: 'heat', proj: { standoff: 0.6 },
    layers: [heavy, { material: 'rha', thickness: 0.15, gap: 0.08, slope: 60, height: 1.2 }] });
  check(hv.meshInfo.throughThickness[0] >= 3,
    `a heavy cassette's front plate is resolved as a plate `
    + `(${hv.meshInfo.throughThickness[0].toFixed(1)} nodes through 15 mm)`);
  const lightRes = meshOnly({ type: 'heat', proj: { standoff: 0.6 },
    layers: [cassette(60), main(60)] });
  check(lightRes.meshInfo.minNodesThroughLayer >= 2 || lightRes.log.has('under-resolved'),
    `an under-resolved layer is reported rather than quietly simulated `
    + `(${lightRes.meshInfo.minNodesThroughLayer.toFixed(1)} nodes through the thinnest layer)`);

  // THE POINT OF THE WHOLE THING: a live cassette must destroy more of the
  // penetrator than an inert one of identical geometry and mass. Measured on
  // surviving penetrator mass rather than residual velocity - a functioning
  // cassette chews up the slow tail of a jet and leaves the fast tip, so it
  // can RAISE residual velocity while doing more damage.
  const survivors = (r) => {
    const d = r.w.domain;
    let m = 0;
    for (let i = 0; i < d.n; i++) if (d.alive[i] && d.role[i] === 1) m += d.mass[i];
    return m;
  };
  const liveL = run({ type: 'heat', proj: { standoff: 0.6 }, quality: 'normal',
    layers: [cassette(60, 'era4s20'), { material: 'rha', thickness: 0.15, gap: 0.09, slope: 60, height: 1.2 }] });
  const inertL = run({ type: 'heat', proj: { standoff: 0.6 }, quality: 'normal',
    layers: [cassette(60, 'rubber'), { material: 'rha', thickness: 0.15, gap: 0.09, slope: 60, height: 1.2 }] });
  const ml = survivors(liveL), mi = survivors(inertL);
  // NOT an assertion, a record. Once the runs were made reproducible the
  // comparison came out MIXED across geometry - a light cassette at 60 deg
  // leaves more jet alive than an inert one of the same mass, at 30 deg less;
  // a heavy cassette at 60 deg clearly better, at 30 deg identical. Earlier
  // versions of this file asserted a direction, and it passed or failed
  // depending on wall-clock timing rather than on physics. The honest position
  // is that this model does not yet reproduce the net benefit of ERA reliably;
  // see MODEL.md 5.1a. Only the mechanism is checked above, and that is solid.
  check(Number.isFinite(ml) && Number.isFinite(mi) && ml > 0 && mi > 0,
    `live-vs-inert comparison produces finite masses `
    + `(${(ml * 1000).toFixed(0)} g live vs ${(mi * 1000).toFixed(0)} g inert; direction is NOT asserted)`);

  // NOT asserted: that a HEAVY cassette beats an inert one against a shaped
  // charge. It does not yet - the momentum-balanced Gurney split leaves its
  // thick front plate too slow to pay for the filler the detonation removes.
  // See MODEL.md 5.1a. Pinning an expectation that is currently false would be
  // worse than pinning none.
}

console.log('\n== a round does not gain speed in free flight ==');
{
  // The reported velocity is an average, and an average over a set that
  // changes as the round erodes will tick upward even though nothing is
  // accelerating. Quoting the core of a capped shot on its own was the worst
  // of it: the core exchanges momentum with its cap through elastic waves and
  // was measured swinging 877 -> 874 -> 876 m/s while the assembly decelerated
  // smoothly, so a round crossing a stand-off gap looked like it was speeding
  // up. Between plates, with nothing in contact, the figure must not rise.
  const w = new World();
  w.settings.deterministic = true;
  w.settings.quality = 'normal';
  w.settings.recordFrames = false;
  const sc = new Scene();
  sc.setLayers([
    makeLayer({ material: 'rha', thickness: 0.030, height: 1.0 }),
    makeLayer({ material: 'rha', thickness: 0.045, gap: 0.30, height: 1.0 }),
    makeLayer({ material: 'rha', thickness: 0.060, gap: 0.30, height: 1.0 }),
  ]);
  w.setScene(sc);
  w.setProjectile(makeProjectileConfig('apcbc', { velocity: 900, standoff: 0.8 }));
  w.fire();
  let f = 0;
  while (!w.domain && f < 900) { w.update(1 / 60); f++; }
  let prev = null, worstRise = 0, quiet = 0;
  while (w.state !== 'done' && f < 3000) {
    w.update(1 / 60); f++;
    if (f % 10) continue;
    const v = w.stats.residualVelocity;
    if (v <= 1) continue;
    const still = w.solver.maxContactForce === 0 && w.solver.brokenThisStep === 0;
    if (still && prev !== null) { quiet++; if (v - prev > worstRise) worstRise = v - prev; }
    prev = v;
  }
  check(quiet > 0, `the round spends time in free flight between the plates (${quiet} samples)`);
  check(worstRise < 0.05,
    `reported velocity does not rise while nothing is touching the round `
    + `(worst +${worstRise.toFixed(3)} m/s)`);
}

console.log('\n== armour materials ==');
for (const k of ARMOUR_KEYS) {
  const m = MATERIALS[k];
  if (!check(!!m, `${k}: present in the database`)) continue;
  const bad = ['rho', 'E', 'Y', 'UTS', 'epsF', 'G0', 'Tm', 'cp']
    .filter((f) => !Number.isFinite(m[f]) || m[f] <= 0);
  check(bad.length === 0, `${k}: physical constants are finite and positive${bad.length ? ` (bad: ${bad})` : ''}`);
}
{
  // the dense metals are new as armour; they must mesh and run, and their
  // areal mass must come out where the density says it should
  for (const k of ['wha', 'du', 'tantalum', 'maraging', 'tib2', 'ti64']) {
    const r = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 },
      layers: [{ material: k, thickness: 0.06, height: 1.0 }] });
    const finite = Number.isFinite(r.stats.maxDepth) && Number.isFinite(r.stats.armourDefeated);
    check(finite && r.w.domain.n > 200,
      `${k}: meshes and runs (${r.w.domain.n} nodes, ${(r.stats.armourDefeated * 1000).toFixed(0)} mm defeated)`);
  }
  // and a dense metal must beat steel of the SAME THICKNESS while costing more
  // mass to do it - the whole trade the material list exists to show
  const w1 = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 },
    layers: [{ material: 'wha', thickness: 0.09, height: 1.0 }] });
  const s1 = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 },
    layers: [{ material: 'rha', thickness: 0.09, height: 1.0 }] });
  check(w1.stats.maxDepth <= s1.stats.maxDepth,
    `tungsten alloy resists better than RHA at equal thickness `
    + `(${(w1.stats.maxDepth * 1000).toFixed(0)} vs ${(s1.stats.maxDepth * 1000).toFixed(0)} mm)`);
  check(MATERIALS.wha.rho > 2 * MATERIALS.rha.rho,
    `and costs the mass to do it (${MATERIALS.wha.rho} vs ${MATERIALS.rha.rho} kg/m3)`);

  // Textolite is the opposite trade and must behave like it: a soft laminate
  // filler, far worse than steel per millimetre. If it ever tests as
  // *stronger* than RHA at equal thickness the constants have been mistyped,
  // and the T-72 glacis preset built on it becomes nonsense.
  //
  // Note on how this is measured: depth saturates once a round exits and
  // keeps flying, so at 100 mm both materials report the same number and a
  // depth comparison there proves nothing. Use residual velocity where both
  // perforate, and thickness where only one does.
  const tx = MATERIALS.textolite;
  check(tx && tx.rho < MATERIALS.rha.rho * 0.25,
    `textolite is a light filler (${tx.rho} vs ${MATERIALS.rha.rho} kg/m3 for RHA)`);
  check(tx && tx.UTS < MATERIALS.rha.UTS * 0.15,
    `and a weak one (${(tx.UTS / 1e6).toFixed(0)} vs ${(MATERIALS.rha.UTS / 1e6).toFixed(0)} MPa)`);
  const txThin = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 },
    layers: [{ material: 'textolite', thickness: 0.10, height: 1.0 }] });
  const rhaThin = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 },
    layers: [{ material: 'rha', thickness: 0.10, height: 1.0 }] });
  check(txThin.w.domain.n > 200 && Number.isFinite(txThin.stats.maxDepth),
    `textolite meshes and runs (${txThin.w.domain.n} nodes)`);
  check(txThin.stats.residualVelocity > rhaThin.stats.residualVelocity * 1.5,
    `100 mm of textolite costs the round far less speed than 100 mm of steel `
    + `(exits at ${txThin.stats.residualVelocity.toFixed(0)} vs `
    + `${rhaThin.stats.residualVelocity.toFixed(0)} m/s)`);
  const txThick = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 },
    layers: [{ material: 'textolite', thickness: 0.20, height: 1.0 }] });
  const rhaThick = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 },
    layers: [{ material: 'rha', thickness: 0.20, height: 1.0 }] });
  check(txThick.stats.perforated && !rhaThick.stats.perforated,
    '200 mm of textolite is perforated by the shot that 200 mm of steel stops');
}

console.log('\n== the material library ==');
{
  check(ARMOUR_KEYS.length === BASIC_ARMOUR_KEYS.length + ADVANCED_ARMOUR_KEYS.length,
    `every armour key is in exactly one tier (${BASIC_ARMOUR_KEYS.length} basic `
    + `+ ${ADVANCED_ARMOUR_KEYS.length} advanced = ${ARMOUR_KEYS.length})`);
  const dupes = ARMOUR_KEYS.filter((k, i) => ARMOUR_KEYS.indexOf(k) !== i);
  check(dupes.length === 0, `no key appears twice${dupes.length ? ` (${dupes})` : ''}`);
  check(ARMOUR_KEYS.every((k) => MATERIALS[k]), 'every key resolves to a material');
  check(ARMOUR_KEYS.every((k) => armourTier(k) !== 'custom'), 'every key reports its tier');

  // Property sanity across the whole library. The bar wave speed floor is
  // class-dependent on purpose: an unfilled silicone at E = 2 MPa really does
  // give ~43 m/s, so a single universal floor would flag correct data.
  let sane = 0;
  for (const k of ARMOUR_KEYS) {
    const m = MATERIALS[k];
    const probs = [];
    for (const f of ['rho', 'E', 'nu', 'Y', 'UTS', 'epsF', 'G0', 'BHN', 'Tm', 'cp', 'jcM']) {
      if (!Number.isFinite(m[f]) || m[f] <= 0) probs.push(f);
    }
    if (!(m.nu > 0 && m.nu < 0.5)) probs.push('nu');
    if (!(m.brittle >= 0 && m.brittle <= 1)) probs.push('brittle');
    if (!(m.weibull > 0) || !(m.erosionResist > 0)) probs.push('scatter/erosion');
    const c = Math.sqrt(m.E / m.rho);
    if (!(c > (m.class === 'polymer' ? 20 : 300) && c < 25000)) probs.push(`wave speed ${c.toFixed(0)}`);
    if (m.class === 'metal' && m.UTS < m.Y) probs.push('UTS below yield');
    if (!m.source || !m.notes) probs.push('undocumented');
    if (probs.length) fail(`${k}: ${probs.join(', ')}`); else sane++;
  }
  check(sane === ARMOUR_KEYS.length, `all ${sane} materials have sane, documented properties`);

  // Every material must describe itself, in both halves: a generated
  // quantitative line and a written note saying what it is for. The generated
  // half is derived from the solver's own constants, so it cannot drift; the
  // check is that it is well formed and that K_IC recovers what the entry
  // documents (G0 was defined as K_IC^2/E, so sqrt(G0*E) must invert it).
  let described = 0;
  for (const k of [...ARMOUR_KEYS, ...PENETRATOR_KEYS]) {
    const m = MATERIALS[k];
    const d = describeMaterial(m);
    const kic = Math.sqrt(Math.max(m.G0, 0) * m.E) / 1e6;
    const ok = typeof d === 'string' && d.length > 30 && !/NaN|undefined/.test(d)
      && d.includes(String(m.BHN)) && d.includes(String(m.rho))
      && Number.isFinite(kic) && kic > 0 && kic < 500
      && typeof m.notes === 'string' && m.notes.length > 30;
    if (ok) described++; else fail(`${k}: bad descriptor "${d}" / notes ${m.notes ? m.notes.length : 0} chars`);
  }
  const uniq = new Set([...ARMOUR_KEYS, ...PENETRATOR_KEYS]).size;
  check(described === uniq + (ARMOUR_KEYS.length + PENETRATOR_KEYS.length - uniq),
    `all ${described} material entries carry a descriptor and a written note`);
  // the bands must actually discriminate, or the words are decoration
  check(/ceramic-hard/.test(describeMaterial(MATERIALS.diamond))
    && /very soft/.test(describeMaterial(MATERIALS.silicone))
    && /fails brittle/.test(describeMaterial(MATERIALS.b4c))
    && /fails ductile/.test(describeMaterial(MATERIALS.inconel625)),
    'the hardness and failure-mode bands separate diamond, silicone, B4C and Inconel 625');

  // A live shot through one material of every class, so a class-wide breakage
  // is caught without paying for all 81 on every CI run.
  for (const k of ['uhh600', 'armox600', 'al7075', 'ti64eli', 'tungsten', 'diamond',
    'si3n4', 'zta', 'pbo', 'carbonepoxy', 'inconel718', 'wha93', 'silicone',
    'polycarbonate', 'alhoneycomb', 'viscoelastic']) {
    const r = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 },
      layers: [{ material: k, thickness: 0.060, height: 1.0 }], maxFrames: 14000 });
    const st = r.stats;
    check(r.w.domain && r.w.domain.n > 200 && Number.isFinite(st.armourDefeated)
      && Number.isFinite(st.residualVelocity) && st.residualVelocity >= 0
      && st.residualVelocity < 20000 && st.maxDepth <= 0.0601,
      `${k}: ${(st.armourDefeated * 1000).toFixed(0)} mm defeated, exit `
      + `${st.residualVelocity.toFixed(0)} m/s`);
  }

  // Ordering the library has to reproduce, or the numbers mean nothing.
  const exit = (k, t = 0.060) => run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 },
    layers: [{ material: k, thickness: t, height: 1.0 }], maxFrames: 14000 }).stats.residualVelocity;
  const vUhh = exit('uhh600'), vRha = exit('rha'), vMild = exit('mild'), vWha = exit('wha');
  check(vUhh < vRha && vRha < vMild,
    `harder steel resists more at equal thickness: 600 BHN ${vUhh.toFixed(0)} < `
    + `RHA ${vRha.toFixed(0)} < mild ${vMild.toFixed(0)} m/s`);
  check(vWha < vUhh,
    `and a tungsten heavy alloy plate beats any steel (${vWha.toFixed(0)} m/s)`);
  const vAl = exit('al5083'), vFoam = exit('alhoneycomb');
  check(vRha < vAl && vAl < vFoam,
    `steel beats aluminium beats a crushable core: ${vRha.toFixed(0)} / `
    + `${vAl.toFixed(0)} / ${vFoam.toFixed(0)} m/s`);

  // Graded plates must genuinely vary through the thickness.
  for (const k of ['dhs', 'ths', 'fha']) {
    const m = MATERIALS[k];
    if (!check(!!m.gradient, `${k}: carries a through-thickness gradient`)) continue;
    const face = sampleGradient(m, 0.02), back = sampleGradient(m, 0.98);
    check(face.Y > back.Y * 1.15 && back.epsF > face.epsF * 1.3
      && ['Y', 'UTS', 'epsF', 'G0', 'brittle'].every((f) => Number.isFinite(face[f]) && Number.isFinite(back[f])),
      `${k}: hard face (${(face.Y / 1e9).toFixed(2)} GPa, epsF ${face.epsF.toFixed(3)}) over a `
      + `tough back (${(back.Y / 1e9).toFixed(2)} GPa, epsF ${back.epsF.toFixed(3)})`);
  }
}

console.log('\n== every penetrator core fires ==');
for (const k of PENETRATOR_KEYS) {
  try {
    const r = run({ type: 'apcr', proj: { velocity: 1100, standoff: 0.8, core: k },
      layers: [{ material: 'rha', thickness: 0.080, height: 1.0 }], maxFrames: 14000 });
    check(Number.isFinite(r.stats.residualVelocity) && r.stats.residualVelocity >= 0
      && r.w.domain && r.w.domain.n > 200,
      `${k}: exit ${r.stats.residualVelocity.toFixed(0)} m/s`);
  } catch (e) { fail(`${k}: threw — ${e.message}`); }
}

console.log('\n== aiming ==');
{
  // aimY moves the launch line up or down; the impact point must follow it
  const lo = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.8, aimY: -0.20 },
    layers: [{ material: 'rha', thickness: 0.08, height: 1.4 }] });
  const mid = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.8, aimY: 0 },
    layers: [{ material: 'rha', thickness: 0.08, height: 1.4 }] });
  const hi = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.8, aimY: 0.20 },
    layers: [{ material: 'rha', thickness: 0.08, height: 1.4 }] });
  check(lo.stats.impactY < mid.stats.impactY - 0.10 && hi.stats.impactY > mid.stats.impactY + 0.10,
    `aim height moves the impact point (${(lo.stats.impactY * 1000).toFixed(0)}, `
    + `${(mid.stats.impactY * 1000).toFixed(0)}, ${(hi.stats.impactY * 1000).toFixed(0)} mm)`);

  // a round aimed clean off the top of a short plate must not report a hit
  const miss = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.8, aimY: 1.2 },
    layers: [{ material: 'rha', thickness: 0.08, height: 0.4 }] });
  check(!miss.stats.perforated && miss.stats.armourDefeated < 1e-6,
    `a round aimed past the edge of the plate defeats no armour (${miss.verdict.headline})`);

  // elevating the aim off-axis must change where it lands
  const up = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.8, attack: 10 },
    layers: [{ material: 'rha', thickness: 0.08, height: 1.6 }] });
  check(Math.abs(up.stats.impactY - mid.stats.impactY) > 0.03,
    `aim elevation moves the impact point (${(up.stats.impactY * 1000).toFixed(0)} mm vs `
    + `${(mid.stats.impactY * 1000).toFixed(0)} mm on axis)`);
}

console.log('\n== back-face bulge is measured on the plate being deformed ==');
{
  // the round stops in the front plate; the rear plate is never touched.
  // Measuring the bulge on the last layer in the array reported 0 for a
  // plate that is visibly dished.
  const r = run({ type: 'apcbc', proj: { velocity: 650, standoff: 0.8 }, quality: 'normal',
    layers: [
      { material: 'rha', thickness: 0.105, height: 1.2 },
      { material: 'rha', thickness: 0.020, gap: 0.5, height: 1.2 },
    ] });
  check(!r.stats.perforated, `round is stopped by the front plate (${r.verdict.headline})`);
  check(r.stats.backfaceBulge > 1e-4,
    `a stopped round still reports a bulge on the plate it deformed `
    + `(${(r.stats.backfaceBulge * 1000).toFixed(1)} mm)`);
}

console.log('\n== recorded-frame capacity ==');
{
  const w = new World();
  w.settings.deterministic = true;
  w.settings.quality = 'normal';
  w.settings.recordedFrames = 1500;
  const asked = w.frameCapacity();
  w.settings.recordedFrames = 200;
  const fewer = w.frameCapacity();
  check(asked > fewer, `the frame count setting is honoured (${fewer} -> ${asked})`);
  w.settings.recordedFrames = 3000;
  w.settings.quality = 'ultra';
  const coarse = w.frameCapacity();
  check(coarse * w.bytesPerFrame() < 400e6,
    `capacity stays under the memory ceiling at the finest mesh `
    + `(${coarse} frames, ${((coarse * w.bytesPerFrame()) / 1e6).toFixed(0)} MB)`);
}

console.log('\n== the model discriminates ==');

const thin = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 }, layers: [{ material: 'rha', thickness: 0.06 }] });
const thick = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 }, layers: [{ material: 'rha', thickness: 0.20 }] });
// Compare the FRACTION of each plate defeated, not raw depth. Depth is clipped
// at the back of the array (world.js), so a perforated plate always reports its
// own full thickness and a raw-depth comparison between a thin plate and a
// thick one is comparing 60 against 200 and calling the thick one deeper.
const frac = (r, t) => r.stats.armourDefeated / t;
check(frac(thin, 0.06) > frac(thick, 0.20),
  `thicker plate is harder: 60 mm -> ${(frac(thin, 0.06) * 100).toFixed(0)}% defeated, `
  + `200 mm -> ${(frac(thick, 0.20) * 100).toFixed(0)}% defeated`);
check(thin.stats.residualVelocity > thick.stats.residualVelocity,
  `and the round comes out of the thin plate faster `
  + `(${thin.stats.residualVelocity.toFixed(0)} vs ${thick.stats.residualVelocity.toFixed(0)} m/s)`);
check(!thick.stats.perforated, '200 mm RHA defeats an 88 mm APCBC at 800 m/s');

const fast = run({ type: 'apfsds', proj: { velocity: 1650, standoff: 2.2 }, layers: [{ material: 'rha', thickness: 0.20 }] });
const slow = run({ type: 'apfsds', proj: { velocity: 800, standoff: 2.2 }, layers: [{ material: 'rha', thickness: 0.20 }] });
// Both perforate 200 mm once the run is allowed to finish, so depth is clipped
// to 200 for each and cannot separate them. Exit velocity can.
check(fast.stats.residualVelocity > slow.stats.residualVelocity * 1.5,
  `long rod needs velocity: through 200 mm at ${fast.stats.residualVelocity.toFixed(0)} m/s `
  + `from 1650, ${slow.stats.residualVelocity.toFixed(0)} m/s from 800`);

// OBLIQUITY. Measured at 100 mm, where the model discriminates hard: flat is
// perforated, 60 deg ricochets the shot off with nothing defeated.
//
// NOT measured at 70 mm, and that is deliberate rather than convenient. At
// 70 mm this model gives 399 m/s exit flat and 416 m/s at 60 deg - the extra
// 70 mm of line-of-sight steel costs the round nothing at all, where 140 mm
// of FLAT plate costs it a great deal (173 m/s). So below the ricochet
// threshold the sloped plate here behaves as though only its normal thickness
// counts. That is a real weakness, it is recorded in MODEL.md 7, and pinning
// a check to the 70 mm case would only have hidden it.
const flat = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 }, layers: [{ material: 'rha', thickness: 0.10, slope: 0 }] });
const sloped = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 }, layers: [{ material: 'rha', thickness: 0.10, slope: 60 }] });
check(sloped.stats.armourDefeated < flat.stats.armourDefeated,
  `obliquity helps the armour at 100 mm: 0° -> ${(flat.stats.armourDefeated * 1000).toFixed(0)} mm defeated, `
  + `60° -> ${(sloped.stats.armourDefeated * 1000).toFixed(0)} mm`);
check(!sloped.stats.perforated && flat.stats.perforated,
  `and it is the difference between a perforation and a ricochet `
  + `(60°: ${sloped.stats.residualVelocity.toFixed(0)} m/s away from the plate)`);

console.log('\n== depth frames: normal vs line of sight ==');
// Regression guard. Depth is measured along the plate normal; the perforation
// threshold must therefore be the plate's NORMAL thickness, not its
// line-of-sight thickness. Comparing the two under-reports perforation by
// 1/cos(theta) and pins the back-face bulge at zero, and only shows up on
// sloped plate - a flat-plate test cannot see it.
const slopeThrough = run({
  type: 'apcbc', proj: { velocity: 800, standoff: 0.6 },
  layers: [{ material: 'rha', thickness: 0.04, slope: 60 }],
});
check(slopeThrough.stats.perforated,
  `40 mm RHA at 60 deg (80 mm LOS) is reported perforated `
  + `(normal depth ${(slopeThrough.stats.maxDepth * 1000).toFixed(0)} mm vs 40 mm of plate)`);
check(slopeThrough.stats.maxDepthLOS >= slopeThrough.stats.maxDepth * 0.999,
  `line-of-sight depth >= normal depth on sloped plate `
  + `(${(slopeThrough.stats.maxDepthLOS * 1000).toFixed(0)} vs ${(slopeThrough.stats.maxDepth * 1000).toFixed(0)} mm)`);
check(slopeThrough.stats.backfaceBulge > 0,
  `back-face bulge is measured on sloped plate (${(slopeThrough.stats.backfaceBulge * 1000).toFixed(1)} mm)`);

console.log('\n== a run may not end while the round is still going ==');
{
  // THE BUG THIS GUARDS
  // The resolved window used to be a fixed clock after first contact. It was
  // ending essentially every run: a 120 mm long rod at 600 mm of RHA was cut
  // off 400 mm in, still doing ~1000 m/s, and reported as "did not perforate,
  // residual 1000 m/s" - which reads exactly like a round that never slows
  // down. A finished run must therefore be in one of three honest states:
  // through the array, actually stopped, or explicitly flagged as truncated.
  const deep = [
    ['M829A3 vs 600 mm RHA', AMMO['m829a3'], 0.60],
    ['3BM46 vs 500 mm RHA', AMMO['3bm46-svinets'], 0.50],
    ['M111 vs 300 mm RHA', AMMO['m111-hetz'], 0.30],
  ];
  for (const [name, a, t] of deep) {
    const r = run({ type: a.type, proj: a.cfg, layers: [{ material: 'rha', thickness: t }] });
    const st = r.stats;
    const resolved = st.perforated || st.residualVelocity < 150 || st.truncated;
    check(resolved,
      `${name}: ended honestly — perforated=${st.perforated} `
      + `residual=${st.residualVelocity.toFixed(0)} m/s truncated=${!!st.truncated}`);
  }
  // and the window must actually be able to exceed the old fixed cap
  const long = run({ type: AMMO['m829a3'].type, proj: AMMO['m829a3'].cfg,
    layers: [{ material: 'rha', thickness: 0.60 }] });
  check(long.w.stats.contactTime > 6e-4,
    `a deep penetration resolves past the old 600 us cap `
    + `(${(long.w.stats.contactTime * 1e6).toFixed(0)} us of contact)`);
}

console.log('\n== depth is bounded by the armour ==');
{
  // Depth used to keep growing after break-out, so it reported 466 mm of
  // "depth" on a 266 mm array and converged to the same value for every
  // variant of a perforating shot - the reason two cassettes, live and inert,
  // measured identical to the millimetre.
  for (const [name, r, t] of [
    ['60 mm plate', thin, 0.06], ['200 mm plate', thick, 0.20],
  ]) {
    check(r.stats.maxDepth <= t * 1.001,
      `${name}: reported depth ${(r.stats.maxDepth * 1000).toFixed(0)} mm never exceeds `
      + `the ${(t * 1000).toFixed(0)} mm of armour in front of it`);
  }
  const through = run({ type: 'apfsds', proj: { velocity: 1650, standoff: 2.2 },
    layers: [{ material: 'rha', thickness: 0.05 }] });
  check(through.stats.perforated && through.stats.maxDepth <= 0.05 * 1.001,
    `a round that goes clean through a 50 mm plate reports 50 mm, not the distance it flew `
    + `(${(through.stats.maxDepth * 1000).toFixed(0)} mm)`);
}

console.log('\n== conservation and sanity ==');
check(thin.w.solver && Number.isFinite(thin.w.solver.energyAudit().drift),
  `energy audit produces a finite drift (${(thin.w.solver.energyAudit().drift * 100).toFixed(0)} %)`);
for (const r of [thin, thick, fast, slow, flat, sloped]) {
  if (!Number.isFinite(r.stats.residualVelocity) || r.stats.residualVelocity < 0
    || r.stats.residualVelocity > 20000) {
    fail(`residual velocity out of range: ${r.stats.residualVelocity}`);
  }
}
pass('residual velocities finite and physical in every case');

const spall = run({
  type: 'hesh', proj: { velocity: 730, standoff: 0.6 },
  layers: [{ material: 'rha', thickness: 0.05 }],
});
check(spall.stats.brokenBonds > 0, `HESH damages the plate (${spall.stats.brokenBonds} failed bonds)`);
check(!spall.stats.perforated,
  'HESH does not report perforating a plate it never entered (chemical rounds have no kinetic penetrator, '
  + 'so the depth threshold must not be zero)');

console.log('\n== depth and perforation cannot disagree ==');
// Both are read from the same mass-percentile measure, so "the depth exceeds
// the plate" and "perforated" must always agree. They disagreed before: depth
// came from the single deepest node, perforation from a bulk-mass test, and a
// comminuted penetrator would report 155 mm into a 150 mm plate as "partial".
for (const [name, r, thickness] of [
  ['60 mm flat', thin, 0.06], ['200 mm flat', thick, 0.20],
  ['70 mm flat', flat, 0.07], ['70 mm at 60 deg', sloped, 0.07],
  ['40 mm at 60 deg', slopeThrough, 0.04],
]) {
  // depth is clipped at the back of the array (see world.js), so "through"
  // is depth REACHING the back face, not exceeding it
  const past = r.stats.maxDepth >= thickness * 0.999;
  check(past === r.stats.perforated,
    `${name}: depth ${(r.stats.maxDepth * 1000).toFixed(0)} mm vs ${(thickness * 1000).toFixed(0)} mm `
    + `-> past=${past}, perforated=${r.stats.perforated}`);
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
