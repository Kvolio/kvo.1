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
import { sandwichFlyerVelocity } from '../src/sim/era.js';
import { MATERIALS, ARMOUR_KEYS } from '../src/materials/database.js';
import { BOND } from '../src/sim/pd/domain.js';

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
function check(cond, m) { (cond ? pass : fail)(m); return cond; }

function run({ type, proj = {}, layers, modules = [], quality = 'low', maxFrames = 3000 }) {
  const w = new World();
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
  w.settings.quality = quality;
  w.settings.recordFrames = false;
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
  let live = 0;
  for (const col of c.columns) for (const i of col.charge) if (hot.w.domain.alive[i]) live++;
  check(live === 0, `the charge is entirely consumed once it functions (${live} explosive nodes left)`);
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
  // Direction only, deliberately. The effect is real and consistently signed
  // but its MAGNITUDE is parameter-sensitive - measured between 10 % and 22 %
  // more jet destroyed depending on the time step, and it inverted outright
  // when the step was raised without a velocity limit. Asserting a size would
  // be pinning a number the model does not yet support; asserting the sign
  // catches the case that actually matters, which is the cassette helping the
  // attacker. See MODEL.md 5.1a.
  check(ml < mi,
    `a live cassette destroys more jet than an inert one of the same mass at 60 deg `
    + `(${(ml * 1000).toFixed(0)} g surviving vs ${(mi * 1000).toFixed(0)} g)`);

  // NOT asserted: that a HEAVY cassette beats an inert one against a shaped
  // charge. It does not yet - the momentum-balanced Gurney split leaves its
  // thick front plate too slow to pay for the filler the detonation removes.
  // See MODEL.md 5.1a. Pinning an expectation that is currently false would be
  // worse than pinning none.
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
check(thin.stats.maxDepth > thick.stats.maxDepth,
  `thicker plate is harder: 60 mm -> ${(thin.stats.maxDepth * 1000).toFixed(0)} mm, 200 mm -> ${(thick.stats.maxDepth * 1000).toFixed(0)} mm`);
check(!thick.stats.perforated, '200 mm RHA defeats an 88 mm APCBC at 800 m/s');

const fast = run({ type: 'apfsds', proj: { velocity: 1650, standoff: 2.2 }, layers: [{ material: 'rha', thickness: 0.20 }] });
const slow = run({ type: 'apfsds', proj: { velocity: 800, standoff: 2.2 }, layers: [{ material: 'rha', thickness: 0.20 }] });
check(fast.stats.maxDepth > slow.stats.maxDepth * 1.5,
  `long rod needs velocity: 1650 m/s -> ${(fast.stats.maxDepth * 1000).toFixed(0)} mm, 800 m/s -> ${(slow.stats.maxDepth * 1000).toFixed(0)} mm`);

const flat = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 }, layers: [{ material: 'rha', thickness: 0.07, slope: 0 }] });
const sloped = run({ type: 'apcbc', proj: { velocity: 800, standoff: 0.6 }, layers: [{ material: 'rha', thickness: 0.07, slope: 60 }] });
check(sloped.stats.maxDepth < flat.stats.maxDepth,
  `obliquity helps the armour: 0° -> ${(flat.stats.maxDepth * 1000).toFixed(0)} mm, 60° -> ${(sloped.stats.maxDepth * 1000).toFixed(0)} mm`);

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
  const past = r.stats.maxDepth > thickness;
  check(past === r.stats.perforated,
    `${name}: depth ${(r.stats.maxDepth * 1000).toFixed(0)} mm vs ${(thickness * 1000).toFixed(0)} mm `
    + `-> past=${past}, perforated=${r.stats.perforated}`);
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
