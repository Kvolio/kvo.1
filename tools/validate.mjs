/**
 * Ballistic-limit validation against closed-form engineering references.
 *
 *   node tools/validate.mjs [--quality low|normal|high] [--obl DEG] [--tol 0.25] [key ...]
 *
 * For every round in the ammunition catalogue (or the keys given) this finds,
 * by bisection on plate thickness, the thickest RHA plate the simulation
 * perforates at the round's striking velocity, and sets it beside an
 * independent estimate:
 *
 *   - capped / uncapped full-calibre shot   de Marre (analytics.js)
 *   - long rods and discarding-sabot shot   Tate / Alekseevskii with
 *                                           handbook rod and RHA strengths
 *   - shaped charges are skipped: their penetration does not depend on plate
 *     strength in the way a bisection on thickness would assume
 *
 * The reference is NOT ground truth - it is a correlation - so the tolerance is
 * wide by default (+/-25 %). The point is to catch the simulation being wrong by
 * tens of percent in one direction across a whole class of round, which is what
 * a mis-calibrated material or confinement factor looks like.
 */

import { World } from '../src/sim/world.js';
import { Scene, makeLayer } from '../src/sim/scene.js';
import { makeProjectileConfig } from '../src/sim/projectileTypes.js';
import { AMMO, AMMO_ORDER } from '../src/ui/ammo.js';
import { deMarreThickness, tatePenetration } from '../src/sim/analytics.js';
import { getMaterial } from '../src/materials/database.js';
import { DEG } from '../src/core/math.js';

const argv = process.argv.slice(2);
const opt = { quality: 'low', obl: 0, tol: 0.25, json: false };
const keys = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--quality') opt.quality = argv[++i];
  else if (argv[i] === '--obl') opt.obl = +argv[++i];
  else if (argv[i] === '--tol') opt.tol = +argv[++i];
  else if (argv[i] === '--json') opt.json = true;
  else keys.push(argv[i]);
}
const todo = keys.length ? keys : AMMO_ORDER;

/** One shot; returns whether the plate was perforated and the exit velocity. */
function shoot(a, thickness) {
  const w = new World();
  w.settings.deterministic = true;
  w.settings.quality = opt.quality;
  w.settings.recordFrames = false;
  const sc = new Scene();
  sc.setLayers([makeLayer({ material: 'rha', thickness, slope: opt.obl })]);
  w.setScene(sc);
  w.setProjectile(makeProjectileConfig(a.type, a.cfg));
  w.fire();
  let f = 0;
  while (w.state !== 'done' && f < 60000) { w.update(1 / 60); f++; }
  const v = w.verdict();
  return { perforated: !!v.perforated, vres: v.residualVelocity || 0, depth: v.depth };
}

/** Reference ballistic-limit thickness (m, normal to the plate) for a round. */
function reference(a) {
  const rha = getMaterial('rha');
  const obl = opt.obl * DEG;
  const cfg = makeProjectileConfig(a.type, a.cfg);
  const probe = new World();
  probe.setScene((() => { const s = new Scene(); s.setLayers([makeLayer({ material: 'rha', thickness: 0.1 })]); return s; })());
  probe.setProjectile(cfg);
  const d = probe.projectile.describe();
  if (['ap', 'apc', 'apcbc', 'aphe', 'apcr'].includes(a.type)) {
    return {
      model: 'de Marre',
      T: deMarreThickness({ velocity: probe.projectile.speed, diameter: d.penDiameter,
        mass: probe.projectile.mass, obliquity: obl }),
    };
  }
  if (['apds', 'apfsds'].includes(a.type)) {
    const pen = probe.projectile.parts.find((p) => p.role === 1) || probe.projectile.parts[0];
    // Handbook strengths: rod flow strength 1.7x yield (as analytics.js), and a
    // target resistance of 5.0 GPa for ~300 BHN steel, which is the value
    // Alekseevskii-Tate fits to tungsten-into-RHA data settle on.
    const Yp = 1.7 * pen.mat.Y;
    const Rt = 5.0e9;
    const r = tatePenetration({ rhoP: pen.mat.rho, rhoT: rha.rho, Yp, Rt,
      L0: d.length, v0: probe.projectile.speed, obliquity: obl });
    return { model: 'Tate (Rt = 5 GPa)', T: r.depth * Math.cos(obl) };
  }
  return null;
}

/** Bisection on thickness: largest plate perforated, to within `resolution`. */
function ballisticLimit(a, guess) {
  let lo = 0.004, hi = Math.max(0.03, guess * 2.4);
  // make sure the bracket is valid
  if (!shoot(a, lo).perforated) return { T: 0, runs: 1 };
  let runs = 1;
  while (shoot(a, hi).perforated && hi < 2.0) { lo = hi; hi *= 1.6; runs++; }
  runs++;
  while ((hi - lo) / hi > 0.06 && runs < 14) {
    const mid = 0.5 * (lo + hi);
    if (shoot(a, mid).perforated) lo = mid; else hi = mid;
    runs++;
  }
  return { T: 0.5 * (lo + hi), runs };
}

const rows = [];
console.log(`ballistic-limit validation vs RHA at ${opt.obl} deg, quality=${opt.quality}, tolerance +/-${(opt.tol * 100).toFixed(0)} %\n`);
console.log('round'.padEnd(16), 'type'.padEnd(7), 'v m/s'.padStart(6), 'sim BL mm'.padStart(10), 'ref mm'.padStart(8), 'sim/ref'.padStart(8), '  reference model');
for (const key of todo) {
  const a = AMMO[key];
  if (!a) { console.log(`unknown round: ${key}`); continue; }
  const ref = reference(a);
  if (!ref) { console.log(key.padEnd(16), a.type.padEnd(7), String(a.cfg.velocity).padStart(6), '   (skipped: not a plate-strength-limited round)'); continue; }
  const t0 = Date.now();
  const bl = ballisticLimit(a, ref.T);
  const ratio = bl.T / ref.T;
  const flag = Math.abs(ratio - 1) <= opt.tol ? '' : (ratio > 1 ? '  << sim too strong' : '  >> sim too weak');
  rows.push({ key, type: a.type, velocity: a.cfg.velocity, sim: bl.T, ref: ref.T, ratio, model: ref.model });
  console.log(key.padEnd(16), a.type.padEnd(7), String(a.cfg.velocity).padStart(6),
    (bl.T * 1000).toFixed(0).padStart(10), (ref.T * 1000).toFixed(0).padStart(8), ratio.toFixed(2).padStart(8),
    `  ${ref.model}${flag}  (${bl.runs} runs, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
if (opt.json) console.log(JSON.stringify(rows));
const inband = rows.filter((r) => Math.abs(r.ratio - 1) <= opt.tol).length;
console.log(`\n${inband}/${rows.length} within tolerance`);
