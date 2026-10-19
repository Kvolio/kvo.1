/**
 * Long-rod penetration depth into thick RHA against Tate / Alekseevskii.
 *
 *   node tools/validate-rods.mjs [--quality low] [--target 1.6] [key ...]
 *
 * Each round is fired at a plate `target` times as thick as the Tate depth, so
 * the rod is stopped inside the plate and the depth is the penetration, not the
 * plate thickness. Reference: Tate with a handbook rod flow strength (1.7 x
 * yield) and R_t = 5 GPa for ~300 BHN steel.
 */
import { World } from '../src/sim/world.js';
import { Scene, makeLayer } from '../src/sim/scene.js';
import { makeProjectileConfig } from '../src/sim/projectileTypes.js';
import { AMMO, AMMO_ORDER } from '../src/ui/ammo.js';
import { tatePenetration } from '../src/sim/analytics.js';
import { getMaterial } from '../src/materials/database.js';

const argv = process.argv.slice(2);
const opt = { quality: 'low', target: 1.6, Rt: 5.0e9 };
const keys = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--quality') opt.quality = argv[++i];
  else if (argv[i] === '--target') opt.target = +argv[++i];
  else if (argv[i] === '--Rt') opt.Rt = +argv[++i];
  else keys.push(argv[i]);
}
const todo = keys.length ? keys : AMMO_ORDER.filter((k) => ['apfsds', 'apds'].includes(AMMO[k].type));
const rha = getMaterial('rha');
console.log('round'.padEnd(14), 'v m/s'.padStart(6), 'L/D'.padStart(5), 'Tate mm'.padStart(8), 'plate mm'.padStart(9), 'sim mm'.padStart(7), 'sim/Tate'.padStart(9), '  outcome');
for (const k of todo) {
  const a = AMMO[k];
  const probe = new World();
  const s0 = new Scene(); s0.setLayers([makeLayer({ material: 'rha', thickness: 0.1 })]); probe.setScene(s0);
  probe.setProjectile(makeProjectileConfig(a.type, a.cfg));
  const d = probe.projectile.describe();
  const pen = probe.projectile.parts.find((p) => p.role === 1) || probe.projectile.parts[0];
  const t = tatePenetration({ rhoP: pen.mat.rho, rhoT: rha.rho, Yp: 1.7 * pen.mat.Y, Rt: opt.Rt,
    L0: d.length, v0: probe.projectile.speed });
  const T = Math.max(0.1, t.depth * opt.target);
  const w = new World();
  w.settings.deterministic = true; w.settings.quality = opt.quality; w.settings.recordFrames = false;
  const sc = new Scene(); sc.setLayers([makeLayer({ material: 'rha', thickness: T })]); w.setScene(sc);
  w.setProjectile(makeProjectileConfig(a.type, a.cfg)); w.fire();
  let f = 0; while (w.state !== 'done' && f < 90000) { w.update(1 / 60); f++; }
  const v = w.verdict();
  console.log(k.padEnd(14), String(a.cfg.velocity).padStart(6), (d.length / d.penDiameter).toFixed(0).padStart(5),
    (t.depth * 1000).toFixed(0).padStart(8), (T * 1000).toFixed(0).padStart(9), (v.depth * 1000).toFixed(0).padStart(7),
    (v.depth / t.depth).toFixed(2).padStart(9), `  ${v.headline}`);
}
