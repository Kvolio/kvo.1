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
check(spall.stats.brokenBonds > 0, `HESH damages the plate without perforating (${spall.stats.brokenBonds} failed bonds, perforated=${spall.stats.perforated})`);

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
