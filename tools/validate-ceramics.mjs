/**
 * Ceramic-faced panels against RHA at equal areal density.
 *
 *   node tools/validate-ceramics.mjs [--round key] [--tile 0.02] [--backing rha] [ceramic ...]
 *
 * A bonded tile of the given ceramic is placed in front of a backing plate whose
 * thickness is bisected to the ballistic limit. The mass efficiency is
 *
 *   ME = (rho_RHA T_RHA) / (rho_tile t_tile + rho_back t_back)
 *
 * with T_RHA the simulated monolithic RHA limit for the same round. Published
 * figures for ceramic-faced steel/aluminium panels against AP shot cluster at
 * ME ~1.3-2.5 (alumina), 1.5-3.0 (SiC) and 1.5-3.2 (B4C); they depend on tile
 * thickness, confinement and threat, so these are bands, not targets.
 */
import { World } from '../src/sim/world.js';
import { Scene, makeLayer } from '../src/sim/scene.js';
import { makeProjectileConfig } from '../src/sim/projectileTypes.js';
import { AMMO } from '../src/ui/ammo.js';
import { getMaterial } from '../src/materials/database.js';

const argv = process.argv.slice(2);
const opt = { round: 'qf2pdr-ap', quality: 'low', tile: 0.02, backing: 'rha' };
const keys = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--round') opt.round = argv[++i];
  else if (argv[i] === '--quality') opt.quality = argv[++i];
  else if (argv[i] === '--tile') opt.tile = +argv[++i];
  else if (argv[i] === '--backing') opt.backing = argv[++i];
  else keys.push(argv[i]);
}
const BANDS = { alumina: [1.3, 2.5], alumina85: [1.2, 2.3], alumina96: [1.2, 2.4], sic: [1.5, 3.0], rbsic: [1.4, 2.8], b4c: [1.5, 3.2], si3n4: [1.3, 2.6], alon: [1.1, 2.3], sapphire: [1.2, 2.5], spinel: [1.0, 2.2] };
const todo = keys.length ? keys : ['alumina', 'sic', 'b4c'];
const a = AMMO[opt.round];

function shoot(layers) {
  const w = new World();
  w.settings.deterministic = true; w.settings.quality = opt.quality; w.settings.recordFrames = false;
  const sc = new Scene(); sc.setLayers(layers); w.setScene(sc);
  w.setProjectile(makeProjectileConfig(a.type, a.cfg)); w.fire();
  let f = 0; while (w.state !== 'done' && f < 60000) { w.update(1 / 60); f++; }
  return !!w.verdict().perforated;
}
function bisect(test, lo, hi) {
  if (!test(lo)) return 0;
  let runs = 1;
  while (test(hi) && hi < 1.2) { lo = hi; hi *= 1.5; runs++; }
  while ((hi - lo) / hi > 0.06 && runs < 14) { const mid = 0.5 * (lo + hi); if (test(mid)) lo = mid; else hi = mid; runs++; }
  return 0.5 * (lo + hi);
}
const rha = getMaterial('rha'), back = getMaterial(opt.backing);
const TR = bisect((T) => shoot([makeLayer({ material: 'rha', thickness: T })]), 0.004, 0.08);
console.log(`round ${opt.round} (${a.cfg.velocity} m/s): monolithic RHA limit ${(TR * 1000).toFixed(0)} mm, tile ${opt.tile * 1000} mm on ${opt.backing}\n`);
console.log('ceramic'.padEnd(10), 'backing mm'.padStart(11), 'areal kg/m2'.padStart(12), 'ME'.padStart(6), '  band');
for (const k of todo) {
  const c = getMaterial(k);
  const tB = bisect((T) => shoot([
    makeLayer({ material: k, thickness: opt.tile }),
    makeLayer({ material: opt.backing, thickness: T, bonded: true }),
  ]), 0.003, 0.03);
  const ad = c.rho * opt.tile + back.rho * tB;
  const me = (rha.rho * TR) / ad;
  const b = BANDS[k];
  console.log(k.padEnd(10), (tB * 1000).toFixed(0).padStart(11), ad.toFixed(0).padStart(12), me.toFixed(2).padStart(6),
    b ? `  ME ${b[0]}-${b[1]}${me < b[0] ? '  << too weak' : me > b[1] ? '  >> too strong' : '  ok'}` : '');
}
